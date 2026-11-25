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

    const manualRate = correct => {
      if (disposed || complete) return;
      complete = true;
      finish({correct,mistakes:0,manual:true});
    };

    function fallback(message = 'Порядок черт не загрузился. Можно написать знак и оценить себя.') {
      if (disposed || fallbackActive) return;
      fallbackActive = true;
      instance?.cancelQuiz();
      resize?.disconnect();
      cell.innerHTML = '<span class="trace" lang="zh-Hans" hidden>'+escape(character)+'</span>'+
        '<canvas aria-label="Поле для свободного письма" width="512" height="512"></canvas>';
      const trace = cell.querySelector('.trace');
      const canvas = cell.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#4d2c21';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let pointer;
      let drawn = false;
      const coordinates = event => {
        const bounds = canvas.getBoundingClientRect();
        return [(event.clientX-bounds.left)*canvas.width/bounds.width,(event.clientY-bounds.top)*canvas.height/bounds.height];
      };
      canvas.addEventListener('pointerdown',event => {
        if (pointer !== undefined) return;
        pointer = event.pointerId;
        canvas.setPointerCapture(pointer);
        ctx.beginPath();
        ctx.moveTo(...coordinates(event));
      });
      canvas.addEventListener('pointermove',event => {
        if (event.pointerId !== pointer) return;
        ctx.lineTo(...coordinates(event));
        ctx.stroke();
        drawn = true;
      });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) {
        canvas.addEventListener(name,event => { if (event.pointerId === pointer) pointer = undefined; });
      }
      info.textContent = message;
      controls.innerHTML = button('Показать знак','ink-reveal')+button('Очистить','ink-clear')+
        button('Ещё учу','ink-fail')+button('Написал','ink-manual','',true);
      controls.onclick = event => {
        const action = event.target.closest('button')?.dataset.action;
        if (action === 'ink-clear') { ctx.clearRect(0,0,canvas.width,canvas.height); drawn = false; }
        else if (action === 'ink-reveal') {
          trace.hidden = !trace.hidden;
          event.target.closest('button').textContent = trace.hidden ? 'Показать знак' : 'Скрыть знак';
        } else if (action === 'ink-fail') manualRate(false);
        else if (action === 'ink-manual') {
          if (!drawn) info.textContent = 'Сначала напиши знак в поле.';
          else manualRate(true);
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
        showOutline:true,charDataLoader:loadCharacter,
        onLoadCharDataSuccess: () => {
          if (disposed || fallbackActive) return;
          controls.innerHTML = button('Показать порядок','ink-animate')+button('Очистить','ink-clear')+
            button('Скрыть контур','ink-outline')+button('Свободное письмо','ink-free');
          controls.onclick = async event => {
            const target = event.target.closest('button');
            if (!target || disposed || showing) return;
            const action = target.dataset.action;
            if (action === 'ink-clear') quiz();
            else if (action === 'ink-free') fallback('Свободное письмо без автоматической проверки.');
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
        onLoadCharDataError: () => fallback()});
      if (window.ResizeObserver) {
        resize = new ResizeObserver(() => {
          if (disposed || fallbackActive) return;
          const size = Math.floor(cell.clientWidth);
          if (size && cell.querySelector('svg')?.getAttribute('width') !== String(size)) instance.updateDimensions({width:size,height:size});
        });
        resize.observe(cell);
      }
    }).catch(() => fallback());

    return {dispose() {
      disposed = true;
      resize?.disconnect();
      instance?.cancelQuiz();
      controls.onclick = null;
    }};
  };
})();
