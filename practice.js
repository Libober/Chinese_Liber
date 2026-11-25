window.HanziPractice = function ({Study,state,main,ui,getWords,categoryName,byId,toast,speak,persist,setDialog,go,render}) {
  const {escape:e, icon, button, iconButton, pageTitle, wordCount, small, wholeExample, exampleFootnote} = ui;
  const modes = Study.displayModes;
  let template;
  let finished;
  let revealed = false;
  let audioHint = false;
  let writer = null;
  let screen = null;

  const names = {all:'Весь словарь',photo:'Словарь',saved:'Избранное',due:'К повторению',new:'Новые слова',mistakes:'Нужно закрепить','photo-new':'Словарь'};
  const modeById = id => modes.find(m => m.id === id);
  const scopeLabel = session => session.label || names[session.scope] || categoryName(session.scope);
  const available = (pool, mode) => mode === 'sentence' ? pool.filter(word => word.examples.length) : pool;
  const empty = text => '<div class="panel empty"><p>'+e(text)+'</p></div>';

  function canResume() {
    const session = state.active;
    return Boolean(session && session.questions.length && session.questions.every(q => q && byId(q.id) && modeById(q.mode)) &&
      Number.isInteger(session.index) && session.index >= 0 && session.index < session.questions.length &&
      session.answers && typeof session.answers === 'object' && session.writing && typeof session.writing === 'object');
  }

  function resumeLabel() {
    const s = state.active;
    return scopeLabel(s)+' · '+modeById(s.mode)?.name+' · вопрос '+(s.index + 1)+' из '+s.questions.length;
  }

  function setupSelection(mode) {
    const list = available(template.pool,mode);
    const input = document.querySelector('#limit');
    const current = Number(input.value);
    const sizes = [...new Set([Math.min(10,list.length),Math.min(20,list.length),list.length])].filter(Boolean);
    input.innerHTML = sizes.map(n => '<option value="'+n+'">'+(n === list.length ? 'Весь набор ('+n+')' : wordCount(n))+'</option>').join('');
    input.disabled = !list.length;
    if (sizes.includes(current)) input.value = String(current);
    document.querySelector('#setup-start').disabled = !list.length;
    document.querySelector('#setup-count').textContent = list.length ? 'В доступном наборе '+wordCount(list.length)+'.' : 'В этом наборе пока нет слов для выбранного режима.';
    updatePreview();
    document.querySelector('#flash-direction').hidden = mode !== 'flash';
  }

  function updatePreview() {
    const mode = document.querySelector('#study-mode').value;
    const limit = Number(document.querySelector('#limit').value);
    const list = available(template.pool,mode).slice(0,limit);
    document.querySelector('#setup-preview').innerHTML = list.length
      ? '<details'+(list.length <= 20 ? ' open' : '')+'><summary>Слова этой тренировки</summary><p lang="zh-Hans">'+list.map(word => e(word.hanzi)).join(' · ')+'</p></details>' : '';
  }

  function configure(scope, mode, single, getScopeName) {
    if (!modeById(mode)) return;
    const pool = single ? [single] : getWords(scope);
    if (!pool.length) return toast('В этом наборе пока нет слов.');
    template = {scope, label:single ? single.hanzi : getScopeName(scope), pool:scope === 'due' ? pool : Study.shuffle(pool)};
    setDialog('Настройка тренировки','<p><strong>'+e(template.label)+'</strong></p>'+
      (canResume() ? '<p class="small">Новая тренировка заменит незавершённую. Прогресс по словам сохранится.</p><div class="actions"><a class="button secondary" href="#practice" data-action="close-dialog">Продолжить текущую</a></div>' : '')+
      '<form id="setup-form"><div class="filters"><label>Режим<select id="study-mode" name="mode" class="field">'+modes.map(m =>
        '<option value="'+m.id+'"'+(mode === m.id ? ' selected' : '')+'>'+m.name+'</option>').join('')+'</select></label>'+
      '<label>Размер набора<select id="limit" name="limit" class="field"></select></label>'+
      '<label id="flash-direction">На лицевой стороне<select class="field" name="direction"><option value="hanzi">Иероглифы</option>'+
      '<option value="meaning"'+(state.direction === 'meaning' ? ' selected' : '')+'>Русский перевод</option></select></label></div>'+
      '<p id="setup-count" class="small"></p><div id="setup-preview" class="small setup-preview"></div>'+
      '<div class="actions" style="margin-top:1rem"><button id="setup-start" type="submit" class="button primary">Начать</button></div></form>');
    setupSelection(mode);
  }

  function change(id,value) {
    if (id === 'study-mode' && template) setupSelection(value);
    if (id === 'limit' && template) updatePreview();
  }

  function start(form) {
    const mode = form.get('mode');
    const limit = Number(form.get('limit'));
    if (!template || !modeById(mode) || !Number.isSafeInteger(limit) || limit < 1) return false;
    const scope = template.scope;
    const questions = Study.makeQuestions(template.pool,mode,getWords('all'),limit,true);
    if (!questions.length) {
      toast('Для этого режима пока не хватает слов.');
      return false;
    }
    state.direction = form.get('direction') === 'meaning' ? 'meaning' : 'hanzi';
    state.active = {scope,label:template.label,mode,questions,index:0,answers:{},writing:{},direction:state.direction};
    finished = null;
    screen = null;
    persist();
    if (location.hash === '#practice') render();
    else go('#practice');
    return true;
  }

  function cleanup() {
    writer?.dispose();
    writer = null;
  }

  function answer(value, correct, detail = '') {
    const s = state.active;
    if (!canResume() || Object.hasOwn(s.answers,s.index)) return;
    s.answers[s.index] = {value,correct,detail};
    Study.grade(state,s.questions[s.index].id,correct);
    persist();
    render();
    document.querySelector('#practice-feedback')?.focus({preventScroll:true});
  }

  function complete() {
    const s = state.active;
    const marks = Object.values(s.answers);
    const correct = marks.filter(a => a.correct).length;
    finished = {...s,time:Date.now(),correct,total:s.questions.length};
    state.sessions.unshift({time:finished.time,scope:s.scope,mode:s.mode,correct,total:s.questions.length});
    state.sessions = state.sessions.slice(0,100);
    state.active = null;
    persist();
    go('#summary');
  }

  function move(step) {
    if (!canResume()) return;
    const s = state.active;
    if (step > 0 && !Object.hasOwn(s.answers,s.index)) return;
    if (step > 0 && s.index === s.questions.length - 1) return complete();
    const target = s.index + step;
    if (target < 0 || target >= s.questions.length) return;
    s.index = target;
    persist();
    render();
    document.querySelector('#question-title')?.focus({preventScroll:true});
  }

  function finishCharacter(result) {
    const s = state.active;
    if (!canResume() || Object.hasOwn(s.answers,s.index)) return;
    const word = byId(s.questions[s.index].id);
    const history = s.writing[s.index] || [];
    if (history.length >= [...word.hanzi].length) return;
    history.push(result);
    s.writing[s.index] = history;
    if (history.length < [...word.hanzi].length) {
      persist();
      render();
      return;
    }
    const mistakes = history.reduce((sum,item) => sum + item.mistakes,0);
    const manual = history.some(item => item.manual);
    const detail = manual ? 'Часть знаков проверена вручную.' : mistakes ? 'Ошибок в чертах: '+mistakes+'.' : 'Все знаки написаны по порядку.';
    answer('writing',history.every(item => item.correct),detail);
  }

  function renderFlash(word, session, mark) {
    const fromMeaning = session.direction === 'meaning';
    const turned = mark || revealed;
    return '<button type="button" class="flash" data-action="reveal" aria-expanded="'+Boolean(turned)+'">'+
      '<strong class="term-large"'+(fromMeaning ? '' : ' lang="zh-Hans"')+'>'+e(fromMeaning ? word.meaning : word.hanzi)+'</strong>'+
      (mark ? '' : '<span class="small">'+(turned ? 'Скрыть ответ' : 'Показать ответ')+'</span>')+'</button>'+
      (turned ? '<p class="translation">'+(fromMeaning ? '<strong lang="zh-Hans">'+e(word.hanzi)+'</strong> · ' : '')+
        e(word.pinyin)+(fromMeaning ? '' : ' · '+e(word.meaning))+'</p><div class="actions center">'+iconButton('Произнести','volume','speak-word',word.id)+'</div>' : '')+
      (turned && !mark ? '<div class="actions center flash-rating">'+button('Ещё учу','flash-rate','no',false)+button('Вспомнил','flash-rate','yes',true)+'</div>' : '');
  }

  function renderedQuestion(question,word,mark) {
    if (question.mode === 'sentence') {
      const example = question.example;
      const [before,after] = example.prompt.split('__');
      return '<div class="prompt-sentence" lang="zh-Hans">'+e(before)+'<span class="blank">'+(mark ? e(word.hanzi) : '…')+'</span>'+e(after)+'</div>'+
        '<p class="translation">'+e(example.translation)+'</p>'+
        exampleFootnote(word,example)+
        (example.custom ? '<p class="small">Значение пропущенного слова: '+e(word.meaning)+'</p>' : '')+
        (mark ? '<div class="actions center">'+button('Послушать предложение','listen-example','',false,'volume')+'</div>' : '');
    }
    if (question.mode === 'listen') {
      return '<div class="actions center">'+button('Послушать','listen-target','normal',true,'volume')+
        button('Медленно','listen-target','slow',false)+'</div>'+
        (audioHint || mark ? '<p class="translation">'+e(word.pinyin)+'</p>' : button('Показать пиньинь','audio-hint'));
    }
    return '<strong class="term-large">'+e(word.meaning)+'</strong>';
  }

  function optionGrid(question, mark) {
    return '<div class="answer-grid">'+question.options.map(id => {
      const option = byId(id);
      if (!option) return '';
      const listening = question.mode === 'listen';
      const result = mark ? id === question.id ? ' correct' : mark.value === id ? ' incorrect' : '' : '';
      return '<button type="button" '+(listening ? '' : 'lang="zh-Hans" ')+'class="answer'+result+'" data-action="choose" data-value="'+e(id)+'"'+(mark ? ' disabled' : '')+'>'+
        e(listening ? option.meaning : option.hanzi)+'</button>';
    }).join('')+'</div>';
  }

  function renderWriting(word, s, mark) {
    if (mark) return '<strong class="term-large" lang="zh-Hans">'+e(word.hanzi)+'</strong><p class="translation">'+e(word.pinyin)+' · '+e(word.meaning)+'</p>';
    const characters = [...word.hanzi];
    const completed = s.writing[s.index] || [];
    const cursor = completed.length;
    return '<div class="writing-layout"><p class="word-reading">'+e(word.pinyin)+'</p><p>'+e(word.meaning)+'</p>'+
      '<p class="small">Знак '+(cursor + 1)+' из '+characters.length+(cursor ? ' · уже написано '+e(characters.slice(0,cursor).join('')) : '')+'</p>'+
      '<div class="ink-grid" id="ink-grid" aria-label="Поле для письма"></div><p id="ink-status" class="small ink-status" aria-live="polite">Загружаем порядок черт…</p>'+
      '<div class="actions center" id="ink-actions"></div></div>';
  }

  function feedback(mark,word) {
    if (!mark) return '';
    const detail = mark.value === 'writing' && typeof mark.detail === 'string' && mark.detail.endsWith('вручную.')
      ? 'Часть знаков проверена вручную.' : mark.detail;
    return '<div id="practice-feedback" tabindex="-1" class="feedback '+(mark.correct ? 'good' : 'bad')+'">'+
      '<strong>'+(mark.value === 'skip' ? 'Пропуск' : mark.correct ? 'Верно' : 'Стоит повторить')+'</strong> · <strong lang="zh-Hans">'+e(word.hanzi)+'</strong> · '+
      e(word.pinyin)+' · '+e(word.meaning)+(detail ? '<p>'+e(detail)+'</p>' : '')+'</div>';
  }

  function renderPractice() {
    if (!canResume()) {
      main.innerHTML = pageTitle('Тренировка')+empty('Открой словарь или выбери тему, чтобы начать.')+
        '<div class="actions" style="margin-top:1rem"><a class="button primary" href="#dict">К словарю</a></div>';
      return;
    }
    const s = state.active;
    const q = s.questions[s.index];
    const word = byId(q.id);
    const mark = s.answers[s.index];
    if (screen?.session !== s || screen.index !== s.index) {
      screen = {session:s,index:s.index};
      revealed = false;
      audioHint = false;
    }
    const title = {flash:'Вспомни слово',choice:'Выбери иероглиф',sentence:'Вставь пропущенное слово',writing:'Напиши по чертам',listen:'Послушай и выбери перевод'}[q.mode];
    main.innerHTML = '<section class="practice-wrap"><div class="practice-top"><span class="small">'+e(scopeLabel(s))+' · '+e(modeById(q.mode).name)+'</span>'+
      '<a class="quiet" href="#home">Выйти</a></div><div class="practice-top"><strong>Вопрос '+(s.index+1)+' из '+s.questions.length+'</strong></div>'+
      '<div class="progress-track" role="progressbar" aria-label="Ход тренировки" aria-valuenow="'+(s.index+1)+'" aria-valuemax="'+s.questions.length+'"><span style="width:'+((s.index+1)/s.questions.length*100)+'%"></span></div>'+
      '<article class="practice-card"><h1 id="question-title" tabindex="-1">'+title+'</h1><div class="practice-content">'+
      (q.mode === 'writing' ? renderWriting(word,s,mark) : q.mode === 'flash' ? renderFlash(word,s,mark) : renderedQuestion(q,word,mark)+optionGrid(q,mark))+
      '</div>'+feedback(mark,word)+'<div class="practice-foot"><div class="actions">'+
      (s.index > 0 ? button('Назад','previous') : '')+'</div>'+
      (mark ? button(s.index === s.questions.length-1 ? 'К результатам' : 'Следующий вопрос','next','',true) :
        button('Пропустить','skip-question'))+'</div></article></section>';
    if (q.mode === 'writing' && !mark) {
      const offset = (s.writing[s.index] || []).length;
      writer = window.HanziWriting({character:[...word.hanzi][offset], finish:finishCharacter, ui});
    }
  }

  function showSummary() {
    if (!finished) {
      main.innerHTML = pageTitle('Результаты')+empty('Результаты завершённых тренировок доступны в разделе «Прогресс».')+
        '<div class="actions" style="margin-top:1rem"><a class="button primary" href="#progress">К прогрессу</a></div>';
      return;
    }
    const s = finished;
    const incorrect = s.questions.filter((q,index) => !s.answers[index]?.correct).map(q => q.id);
    const rows = s.questions.map((q,index) => {
      const word = byId(q.id);
      const mark = s.answers[index];
      return '<div class="progress-line"><button type="button" class="term" lang="zh-Hans" data-action="detail" data-value="'+e(word.id)+'">'+e(word.hanzi)+'</button>'+
        '<span>'+e(word.meaning)+'</span><span class="pill '+(mark?.correct ? 'solid' : 'ready')+'">'+(mark?.correct ? 'Верно' : mark?.value === 'skip' ? 'Пропуск' : 'Повторить')+'</span></div>';
    }).join('');
    main.innerHTML = '<section class="practice-wrap">'+pageTitle('Тренировка завершена',scopeLabel(s)+' · '+modeById(s.mode).name)+
      '<div class="banner"><div><strong>Правильно '+s.correct+' из '+s.total+'</strong><p>Следующее повторение появится в очереди по результатам ответов.</p></div></div>'+
      '<div class="actions">'+(incorrect.length ? button('Повторить ошибки','retry','',true,'refresh') : '')+
      '<a class="button secondary" href="#progress">Посмотреть прогресс</a><a class="button secondary" href="#dict">К словарю</a></div>'+
      '<div class="section panel progress-list">'+rows+'</div></section>';
  }

  function action(action,value) {
    if (action === 'retry' && finished) {
      const words = finished.questions.filter((_,index) => !finished.answers[index]?.correct).map(q => byId(q.id));
      if (!words.length) return;
      template = {scope:finished.scope,label:finished.label,pool:words};
      const form = new FormData();
      form.set('mode',finished.mode);
      form.set('limit',String(words.length));
      form.set('direction',finished.direction);
      start(form);
      return;
    }
    if (!canResume()) return;
    const s = state.active;
    const q = s.questions[s.index];
    const word = byId(q.id);
    if (action === 'choose' && q.options.includes(value)) answer(value,value === q.id);
    else if (action === 'skip-question') answer('skip',false);
    else if (action === 'flash-rate' && revealed) answer(value,value === 'yes');
    else if (action === 'reveal' && !s.answers[s.index]) {
      revealed = !revealed;
      render();
      document.querySelector('.flash')?.focus({preventScroll:true});
    } else if (action === 'next') move(1);
    else if (action === 'previous') move(-1);
    else if (action === 'listen-target') speak(word.hanzi,value === 'slow',word.pinyin);
    else if (action === 'audio-hint') { audioHint = true; render(); }
    else if (action === 'listen-example' && q.example) speak(wholeExample(word,q.example),true);
  }

  return {canResume,resumeLabel,configure,change,start,cleanup,action,render:page => page === 'summary' ? showSummary() : renderPractice()};
};
