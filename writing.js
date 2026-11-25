(() => {
  let pending;
  const library = () => {
    if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
    if (pending) return pending;
    pending = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      let timer;
      const failed = () => {
        clearTimeout(timer);
        script.remove();
        pending = null;
        reject(new Error('Hanzi Writer unavailable'));
      };
      script.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js';
      script.onload = () => {
        clearTimeout(timer);
        if (window.HanziWriter) resolve(window.HanziWriter);
        else failed();
      };
      script.onerror = failed;
      timer = setTimeout(failed,8000);
      document.head.append(script);
    });
    return pending;
  };
  const characterData = new Map();

  function loadCharacter(character, success, failure) {
    if (!characterData.has(character)) {
      const request = fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/'+encodeURIComponent(character)+'.json',
        {signal:AbortSignal.timeout(6500)}).then(response => {
        if (!response.ok) throw new Error('Character data unavailable');
        return response.json();
      });
      characterData.set(character,request);
      request.catch(() => characterData.delete(character));
    }
    characterData.get(character).then(success,failure);
  }

  const distance = ([ax,ay],[bx,by]) => Math.hypot(ax-bx,ay-by);

  function sampleStroke(points, lengths, total) {
    let edge = 1;
    return Array.from({length:16},(_,i) => {
      const at = i*total/15;
      while (edge < lengths.length-1 && lengths[edge] < at) edge++;
      const from = points[edge-1], to = points[edge];
      const fraction = (at-lengths[edge-1])/(lengths[edge]-lengths[edge-1] || 1);
      return [from[0]+fraction*(to[0]-from[0]),from[1]+fraction*(to[1]-from[1])];
    });
  }

  function normalizeStrokes(strokes) {
    let left=Infinity, top=Infinity, right=-Infinity, bottom=-Infinity;
    for (const stroke of strokes) for (const [x,y] of stroke) {
      left=Math.min(left,x); right=Math.max(right,x);
      top=Math.min(top,y); bottom=Math.max(bottom,y);
    }
    const scale = Math.max(right-left,bottom-top,1);
    return strokes.map(stroke => {
      const points=stroke.map(([x,y]) => [(x-(left+right)/2)/scale,(y-(top+bottom)/2)/scale]);
      const lengths=[0];
      for (let i=1;i<points.length;i++) lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
      return sampleStroke(points,lengths,lengths.at(-1));
    });
  }

  // Match whole strokes by their shape and position. Free writing accepts any order or direction.
  function compareStrokes(drawn, medians) {
    const user=normalizeStrokes(drawn), model=normalizeStrokes(medians.map(stroke=>stroke.map(([x,y])=>[x,-y])));
    const nearby=user.map(line=>model.flatMap((reference,index)=>{
      const difference = points => line.reduce((sum,point,i)=>sum+distance(point,points[i]),0)/line.length;
      const error=Math.min(difference(reference),difference([...reference].reverse()));
      return error<=.15 ? [{index,error}] : [];
    }).sort((a,b)=>a.error-b.error).map(item=>item.index));
    const matches=Array(model.length).fill(-1);
    function assign(index,seen) {
      for (const target of nearby[index]) {
        if (seen.has(target)) continue;
        seen.add(target);
        if (matches[target] < 0 || assign(matches[target],seen)) {
          matches[target]=index;
          return true;
        }
      }
      return false;
    }
    user.forEach((_,index)=>assign(index,new Set()));
    const extra=drawn.flatMap((_,index)=>matches.includes(index) ? [] : [index]);
    const missing=matches.flatMap((index,target)=>index<0 ? [target] : []);
    return {extra,missing};
  }

  window.HanziWriting = function ({character,finish,ui}) {
    const cell = document.querySelector('#ink-grid');
    const controls = document.querySelector('#ink-actions');
    const info = document.querySelector('#ink-status');
    const {button,escape} = ui;
    let instance;
    let disposed = false;
    let fallbackActive = false;
    let showing = false;
    let mistakes = 0;
    let usedHint = false;
    let resize;
    let complete = false;
    let model;

    function freeWriting() {
      if (disposed || fallbackActive) return;
      fallbackActive = true;
      instance?.cancelQuiz();
      resize?.disconnect();
      cell.innerHTML = '<canvas aria-label="Поле для свободного письма" width="512" height="512"></canvas>';
      const canvas = cell.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let pointer;
      let strokes=[];
      let result;
      let comparison;
      let waiting=false;
      const coords = event => {
        const b=canvas.getBoundingClientRect();
        return [(event.clientX-b.left)*canvas.width/b.width,(event.clientY-b.top)*canvas.height/b.height];
      };
      const paintStroke = (points,color) => {
        ctx.strokeStyle=color;
        ctx.beginPath();
        ctx.moveTo(...points[0]);
        points.slice(1).forEach(point=>ctx.lineTo(...point));
        ctx.stroke();
      };
      canvas.addEventListener('pointerdown',event=>{
        if (pointer!==undefined || result || waiting) return;
        pointer=event.pointerId;
        canvas.setPointerCapture(pointer);
        strokes.push([coords(event)]);
      });
      canvas.addEventListener('pointermove',event=>{
        if (event.pointerId!==pointer) return;
        const stroke=strokes.at(-1);
        const point=coords(event);
        if (distance(stroke.at(-1),point)<2) return;
        paintStroke([stroke.at(-1),point],'#4d2c21');
        stroke.push(point);
      });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) {
        canvas.addEventListener(name,event=>{
          if (event.pointerId!==pointer) return;
          pointer=undefined;
          if (strokes.at(-1).length<2) strokes.pop();
        });
      }

      function showReference(missing) {
        comparison=document.createElement('div');
        comparison.className='ink-comparison';
        comparison.innerHTML='<figure><figcaption>Твой знак</figcaption></figure>'+
          '<figure><figcaption>Образец</figcaption><div class="ink-grid ink-reference" lang="zh-Hans"></div></figure>';
        cell.before(comparison);
        comparison.firstElementChild.append(cell);
        const target=comparison.querySelector('.ink-reference');
        if (!model) {
          target.textContent=character;
          return;
        }
        const ns='http://www.w3.org/2000/svg';
        const image=document.createElementNS(ns,'svg');
        image.setAttribute('viewBox','-55 -955 1134 1134');
        image.setAttribute('aria-label','Образец знака '+character);
        image.setAttribute('role','img');
        model.strokes.forEach((value,i)=>{
          const path=document.createElementNS(ns,'path');
          path.setAttribute('d',value);
          path.setAttribute('transform','scale(1,-1)');
          path.setAttribute('fill',missing.includes(i) ? '#a33b2c' : '#4d2c21');
          image.append(path);
        });
        target.append(image);
      }

      const initial = 'Напиши знак без контура, затем нажми «Проверить».';
      function reset() {
        result=null;
        strokes=[];
        if (comparison) {
          comparison.before(cell);
          comparison.remove();
          comparison=null;
        }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        info.className='small ink-status';
        info.textContent=initial;
        controls.innerHTML=button('Очистить','ink-clear')+button('Проверить','ink-check','',true);
      }

      async function check() {
        if (pointer!==undefined || !strokes.length) {
          info.textContent='Сначала напиши знак в поле.';
          return;
        }
        waiting=true;
        if (!model) {
          info.textContent='Загружаем образец…';
          model=await new Promise(resolve=>loadCharacter(character,resolve,()=>resolve(null)));
        }
        if (disposed) return;
        waiting=false;
        if (!model) {
          result={manual:true,mistakes:0,free:true};
          showReference([]);
          info.textContent='Автопроверка недоступна. Сверь рисунок с образцом и выбери результат.';
          controls.innerHTML=button('Написать заново','ink-clear')+
            button('Есть ошибка','ink-manual-no')+button('Совпало','ink-manual-yes','',true);
          return;
        }
        const {extra,missing}=compareStrokes(strokes,model.medians);
        const correct=!extra.length&&!missing.length;
        result={correct,mistakes:Math.max(extra.length,missing.length),manual:false,free:true};
        ctx.clearRect(0,0,canvas.width,canvas.height);
        strokes.forEach((stroke,i)=>paintStroke(stroke,extra.includes(i) ? '#a33b2c' : '#4d2c21'));
        showReference(missing);
        info.className='feedback '+(correct ? 'good' : 'bad');
        info.textContent=correct ? 'Правильно. Форма совпала с образцом.' :
          'Неправильно. Красным отмечены черты, которые проверка не смогла сопоставить.';
        controls.innerHTML=button('Написать заново','ink-clear')+button('Продолжить','ink-continue','',true);
      }

      reset();
      controls.onclick = event => {
        const action=event.target.closest('button')?.dataset.action;
        if (disposed || complete || waiting) return;
        if (action==='ink-clear' && pointer===undefined) reset();
        else if (action==='ink-check' && !result) check();
        else if (action==='ink-continue' && result) {
          complete=true;
          finish(result);
        } else if (result?.manual && (action==='ink-manual-yes' || action==='ink-manual-no')) {
          complete=true;
          finish({...result,correct:action==='ink-manual-yes'});
        }
      };
    }

    function quiz() {
      if (disposed || fallbackActive) return;
      info.textContent = 'Пиши по одной черте. После двух промахов появится подсказка.';
      instance.quiz({showHintAfterMisses:2,highlightOnComplete:false,
        onMistake: () => {
          mistakes++;
          info.textContent = 'Попробуй эту черту ещё раз.';
        },
        onCorrectStroke: data => {
          info.textContent = data.strokesRemaining ? 'Осталось черт: '+data.strokesRemaining+'.' : 'Знак завершён.';
        },
        onComplete: () => {
          if (disposed || complete) return;
          complete = true;
          finish({correct:mistakes === 0 && !usedHint,mistakes,manual:false});
        }});
    }

    library().then(Writer => {
      if (disposed) return;
      const width = Math.floor(cell.clientWidth);
      instance = Writer.create(cell,character,{width,height:width,padding:17,showCharacter:false,
        strokeColor:'#573224',drawingColor:'#9f3c28',outlineColor:'#decbba',highlightColor:'#ab562f',
        showOutline:true,charDataLoader:(char,success,error)=>loadCharacter(char,data=>{
          model=data;
          success(data);
        },error),
        onLoadCharDataSuccess: () => {
          if (disposed || fallbackActive) return;
          controls.innerHTML = button('Показать порядок','ink-animate')+button('Очистить','ink-clear')+
            button('Скрыть контур','ink-outline')+button('Свободное письмо','ink-free');
          controls.onclick = async event => {
            const target = event.target.closest('button');
            if (!target || disposed || showing) return;
            const action = target.dataset.action;
            if (action === 'ink-clear') quiz();
            else if (action === 'ink-free') freeWriting();
            else if (action === 'ink-outline') {
              const hiding = target.textContent === 'Скрыть контур';
              if (hiding) instance.hideOutline();
              else instance.showOutline();
              target.textContent = hiding ? 'Показать контур' : 'Скрыть контур';
            } else if (action === 'ink-animate') {
              showing = true;
              usedHint = true;
              instance.cancelQuiz();
              info.textContent = 'Порядок черт';
              try { await instance.animateCharacter(); }
              finally { showing = false; quiz(); }
            }
          };
          quiz();
        },
        onLoadCharDataError: freeWriting});
      if (window.ResizeObserver) {
        resize = new ResizeObserver(() => {
          if (disposed || fallbackActive) return;
          const size = Math.floor(cell.clientWidth);
          if (size && cell.querySelector('svg')?.getAttribute('width') !== String(size)) instance.updateDimensions({width:size,height:size});
        });
        resize.observe(cell);
      }
    }).catch(freeWriting);

    return {dispose() {
      disposed = true;
      resize?.disconnect();
      instance?.cancelQuiz();
      controls.onclick = null;
    }};
  };
})();
