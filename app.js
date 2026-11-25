(() => {
  const Study = window.HanziStudy;
  const main = document.querySelector('#main');
  const nav = document.querySelector('#navigation');
  const dialog = document.querySelector('#dialog');
  const status = document.querySelector('#toast');
  const paths = {
    home:'M3 10 12 3l9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm6 11v-7h6v7',
    book:'M3 5a3 3 0 0 1 3-3h5v18H6a3 3 0 0 0-3 2zm18 0a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 2z',
    refresh:'M20 7v5h-5M4 17v-5h5m10 0a7 7 0 0 0-12-5m-2 5a7 7 0 0 0 12 5',
    chart:'M4 19h16M7 15v-4m5 4V7m5 8V4',
    settings:'M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-6 1v4',
    cards:'M5 7h14a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM6 4h12m-9 8h6m-6 3h4',
    target:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-5h.01',
    quote:'M3 4h18v12H8l-5 4zm4 5h10m-10 3h6',
    pen:'m4 15-1 6 6-1L21 8l-5-5zm10-10 5 5M4 15l5 5',
    volume:'M3 9h4l5-4v14l-5-4H3zm12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12',
    star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z',
    check:'m5 12 4 4L19 6',
    x:'m6 6 12 12M18 6 6 18',
    clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-15v5l4 2'
  };
  const links = [['home','Главная','home'],['dict','Словарь','book'],['review','Повторение','refresh'],['progress','Прогресс','chart']];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, size = 19) => '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+(paths[name] || paths.book)+'"></path></svg>';
  const button = (label, action, data = '', primary = false, symbol = '') => '<button type="button" class="button '+(primary ? 'primary' : 'secondary')+'" data-action="'+action+'" data-value="'+escape(data)+'">'+(symbol ? icon(symbol) : '')+escape(label)+'</button>';
  const iconButton = (label, symbol, action, data = '', pressed) => '<button type="button" class="icon-button" aria-label="'+escape(label)+'" title="'+escape(label)+'" data-action="'+action+'" data-value="'+escape(data)+'"'+(pressed === undefined ? '' : ' aria-pressed="'+pressed+'"')+'>'+icon(symbol)+'</button>';
  const pluralRules = new Intl.PluralRules('ru');
  const number = new Intl.NumberFormat('ru');
  const wordCount = count => number.format(count)+' '+({one:'слово',few:'слова',many:'слов',other:'слова'}[pluralRules.select(count)]);
  const pageTitle = (title, copy = '') => '<div class="page-title"><h1>'+escape(title)+'</h1>'+(copy ? '<p>'+escape(copy)+'</p>' : '')+'</div>';
  const small = text => '<span class="small">'+escape(text)+'</span>';
  const formatDate = timestamp => new Intl.DateTimeFormat('ru',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(timestamp);
  const wholeExample = (word, example) => example.prompt.replace('__',word.hanzi);
  function examplePinyin(word, example) {
    const reading = window.pinyinPro.pinyin(wholeExample(word,example),{type:'all'})
      .map(item => item.isZh ? item.pinyin : ({'。':'.','，':',','？':'?','！':'!','；':';','：':':'}[item.origin] || item.origin))
      .join(' ').replace(/\s+([.,?!;:])/g,'$1').trim();
    return '<p class="sentence-pinyin" lang="zh-Latn">'+escape(reading)+'</p>';
  }
  const contextGlossary = [
    {hanzi:'箱子',pinyin:'xiāngzi',meaning:'коробка'},
    {hanzi:'每天',pinyin:'měitiān',meaning:'каждый день'},
    {hanzi:'一杯',pinyin:'yì bēi',meaning:'одна чашка или один стакан. 杯 — счётное слово'}
  ];
  function exampleFootnote(word, example) {
    const parts = wholeExample(word,example);
    return contextGlossary.filter(note => word.hanzi !== note.hanzi && parts.includes(note.hanzi))
      .map(note => '<p class="example-note"><b lang="zh-Hans">'+escape(note.hanzi)+'</b> '+escape(note.pinyin)+' — '+escape(note.meaning)+'</p>').join('');
  }
  const ui = {escape, icon, button, iconButton, pageTitle, wordCount, small, wholeExample, formatDate, exampleFootnote, examplePinyin};
  let saved;
  try { saved = JSON.parse(localStorage.getItem(Study.stateKey)); } catch { saved = null; }
  const state = Study.safeState(saved);
  let words, byId, categories;
  let toastTimer;
  let route = {page:'home', key:'all'};
  let dictionaryQuery = '';
  let dictionaryStatus = 'all';
  let audioVisit = null;

  function rebuild() {
    words = Study.buildVocabulary(state.custom);
    byId = new Map(words.map(word => [word.id,word]));
    if (state.active && ['photo','photo-new'].includes(state.active.scope)) state.active.label = 'Словарь';
    for (const question of state.active?.questions || []) {
      if (question?.mode !== 'sentence') continue;
      const examples = byId.get(question.id)?.examples || [];
      question.example = examples.find(e => e.prompt === question.example?.prompt && e.translation === question.example?.translation) || examples[0] || question.example;
    }
    categories = [...Study.categories];
    for (const id of new Set(words.flatMap(word => word.groups))) {
      if (categories.some(category => category.id === id)) continue;
      categories.push({id,name:id === 'imported' ? 'Мои слова' : id.replace(/^extra:/,''),glyph:'字',description:'Из загруженного словаря',color:'sage'});
    }
  }

  function persist() {
    try {
      const stored = localStorage.getItem(Study.stateKey);
      let previous;
      try { previous = JSON.parse(stored); } catch { /* Replace unreadable saved data. */ }
      state.sessions = Study.mergeSessions(previous?.sessions,state.sessions);
      localStorage.setItem(Study.stateKey, JSON.stringify(state));
    }
    catch { toast('Браузер не смог сохранить изменения. Можно скачать резервную копию.'); }
  }

  function toast(message) {
    clearTimeout(toastTimer);
    status.textContent = message;
    status.hidden = false;
    toastTimer = setTimeout(() => { status.hidden = true; }, 4000);
  }

  function speak(text, slow = false, reading = '', report) {
    const voices = window.speechSynthesis?.getVoices() || [];
    const voice = voices.find(v => /^zh[-_](CN|Hans|SG)([-_]|$)/i.test(v.lang)) ||
      voices.find(v => /^cmn([-_]|$)|^zh(?:[-_](?:Hant[-_])?TW)?$/i.test(v.lang));
    if (!voice) {
      const message = 'Браузер пока не видит китайский голос.';
      if (report) report(message);
      else if (route.page === 'practice') showVoiceHelp(message);
      else toast(message+' Инструкция есть в настройках сайта.');
      return;
    }
    speechSynthesis.cancel();
    // A bare polyphonic character often gets the default reading. Use a short phrase to disambiguate.
    const samples = {'只|zhi': reading === 'zhī' ? '一只' : '只有', '还|hai':'还有','为|wei':'为了','会|hui':'我会','了|le':'好了'};
    const key = text + '|' + Study.readingKey(reading);
    const utterance = new SpeechSynthesisUtterance(samples[key] || text);
    utterance.lang = voice.lang;
    utterance.voice = voice;
    utterance.rate = slow ? .68 : .88;
    utterance.onerror = event => {
      if (!['canceled','interrupted'].includes(event.error)) {
        (report || toast)('Голос найден, но воспроизведение не удалось. Проверь звук и перезапусти браузер.');
      }
    };
    if (report) report('Найден голос «'+voice.name+'». Звучит «你好» — «привет».');
    speechSynthesis.speak(utterance);
  }

  function categoryName(id) {
    if (id?.startsWith('added:')) return categoryName(id.slice(6))+' · Новые в теме';
    return categories.find(c => c.id === id)?.name || 'Весь словарь';
  }

  function getWords(id = 'all') {
    if (id === 'all') return words;
    if (id === 'due') return Study.dueWords(words,state);
    if (id === 'new') return words.filter(word => !Study.getProgress(state,word.id));
    if (id.startsWith('added:')) return getWords(id.slice(6)).filter(word => word.photo && !word.original);
    if (id === 'saved') return words.filter(word => state.favorites.includes(word.id));
    if (id === 'mistakes') return words.filter(word => {
      const p = Study.getProgress(state,word.id);
      return p && p.level < 3 && p.attempts > p.correct;
    });
    return words.filter(word => word.groups.includes(id));
  }

  function setDialog(title, content) {
    dialog.innerHTML = '<div class="dialog-body"><div class="dialog-head"><h2 id="dialog-title">'+escape(title)+'</h2>'+iconButton('Закрыть','x','close-dialog')+'</div>'+content+'</div>';
    if (!dialog.open) dialog.showModal();
  }

  function voiceInstructions(hidden = false) {
    const agent = navigator.userAgent;
    const isMac = /Macintosh/i.test(agent);
    const isIOS = /iPhone|iPad|iPod/i.test(agent) || (isMac && navigator.maxTouchPoints > 1);
    const platform = /Android/i.test(agent) ? 'android' : isIOS ? 'ios' :
      isMac ? 'mac' : /Windows/i.test(agent) ? 'windows' : '';
    const details = (device) => '<details'+(device === platform ? ' open' : '')+'>';
    return '<section class="voice-guide" id="voice-guide" aria-labelledby="voice-guide-title"'+(hidden ? ' hidden' : '')+'>'+
      '<h3 id="voice-guide-title" tabindex="-1">Установка голоса</h3>'+
      details('windows')+'<summary>Windows</summary><ol>'+
      '<li>Открой «Параметры» → «Время и язык» → «Язык и регион». В Windows 10 этот раздел называется «Язык».</li>'+
      '<li>В разделе «Предпочитаемые языки» нажми «Добавить язык» и выбери «Китайский (упрощённый, Китай)». Оставь выключенной опцию «Сделать языком интерфейса Windows».</li>'+
      '<li>При установке отметь «Преобразование текста в речь». Если китайский уже добавлен, нажми «⋯» рядом с ним → «Языковые параметры» и скачай там «Преобразование текста в речь». В Windows 10 выбери китайский в списке и нажми «Параметры».</li></ol>'+
      '<a href="https://support.microsoft.com/ru-ru/windows/hardware/input-devices/manage-the-language-and-keyboard-input-layout-settings-in-windows" target="_blank" rel="noopener">Справка Microsoft</a></details>'+
      details('mac')+'<summary>macOS</summary><ol>'+
      '<li>Открой меню Apple → «Системные настройки» → «Универсальный доступ» → «Чтение вслух» (Read &amp; Speak). Название в других версиях macOS может быть «Устный контент» (Spoken Content).</li>'+
      '<li>Открой «Системный голос» → «Управление голосами». Найди мандаринский китайский (Китай) и скачай один из голосов.</li></ol>'+
      '<a href="https://support.apple.com/en-us/guide/mac-help/mchlp2290/mac" target="_blank" rel="noopener">Справка Apple для Mac</a></details>'+
      details('ios')+'<summary>iPhone и iPad</summary><ol>'+
      '<li>Открой «Настройки» → «Универсальный доступ» → «Чтение вслух» → «Голоса». В других версиях iOS и iPadOS ищи «Устный контент» или «Экран вслух».</li>'+
      '<li>Выбери китайский (мандаринский) и нажми значок загрузки рядом с голосом, если он ещё не скачан.</li></ol>'+
      '<a href="https://support.apple.com/ru-ru/guide/iphone/iph96b214f0/ios" target="_blank" rel="noopener">Справка Apple для iPhone</a></details>'+
      details('android')+'<summary>Android</summary><ol>'+
      '<li>В настройках устройства найди «Синтез речи» или «Преобразование текста в речь». Этот пункт обычно находится в разделе «Специальные возможности».</li>'+
      '<li>Нажми шестерёнку рядом с выбранным модулем синтеза речи. Открой «Установка голосовых данных», выбери «Китайский (Китай)» и скачай голос.</li></ol>'+
      '<a href="https://support.google.com/accessibility/android/answer/6006983?hl=ru" target="_blank" rel="noopener">Справка Google</a></details>'+
      '<p>После загрузки закрой и снова открой браузер, вернись на сайт и нажми «Проверить голос». Если браузер не увидит голос, попробуй открыть сайт в Edge на Windows, Safari на устройствах Apple или Chrome на Android.</p>'+
      '<div class="actions">'+button('Проверить голос','voice-test','',false,'volume')+'</div>'+
      '<p id="voice-test-status" class="small" role="status"></p></section>';
  }

  function showVoiceHelp(message = '') {
    setDialog('Как установить китайский голос',
      (message ? '<p>'+escape(message)+'</p>' : '')+voiceInstructions()+
      '<div class="actions">'+button('Готово','close-dialog','',true)+'</div>');
    dialog.querySelector('#voice-guide-title').focus({preventScroll:true});
  }

  function showAudioNotice() {
    setDialog('Перед аудиотренировкой',
      '<p>Для заданий на слух нужен китайский голос (путунхуа). Если браузер его не видит, скачай голос в настройках устройства.</p>'+
      '<label class="voice-preference"><input type="checkbox" id="hide-audio-notice"> Больше не показывать</label>'+
      '<div class="actions"><button type="button" class="button secondary" data-action="voice-guide" aria-controls="voice-guide" aria-expanded="false">Как установить голос</button>'+
      button('Продолжить','close-dialog','',true)+'</div>'+voiceInstructions(true));
    const title = dialog.querySelector('#dialog-title');
    title.tabIndex = -1;
    title.focus({preventScroll:true});
  }

  const practice = window.HanziPractice({Study,state,main,ui, getWords, categoryName, byId:id => byId.get(id),
    toast, speak, persist, setDialog, go:hash => { location.hash = hash; }, render:() => render()});

  function stat(value, label, symbol) {
    return '<div class="stat"><span class="stat-mark">'+icon(symbol,21)+'</span><div><strong>'+number.format(value)+'</strong><span>'+escape(label)+'</span></div></div>';
  }

  function topicCard(category) {
    const count = getWords(category.id).length;
    return '<a class="topic" href="#dict/'+encodeURIComponent(category.id)+'"><span class="glyph" lang="zh-Hans" data-color="'+category.color+'">'+category.glyph+'</span><div class="topic-info"><h3>'+escape(category.name)+'</h3><p class="topic-meta">'+escape(category.description)+'</p><p class="topic-meta"><strong>'+wordCount(count)+'</strong></p></div></a>';
  }

  function modeGrid(scope) {
    return '<div class="mode-grid">'+Study.displayModes.map(mode =>
      '<button type="button" class="mode" data-action="configure" data-value="'+escape(scope)+'" data-mode="'+mode.id+'">'+icon(mode.icon,22)+'<strong>'+mode.name+'</strong>'+small(mode.description)+'</button>'
    ).join('')+'</div>';
  }

  function home() {
    const due = getWords('due').length;
    const learned = words.filter(w => Study.getProgress(state,w.id)?.level >= 3).length;
    return '<section class="hero"><div class="hero-copy"><p class="hero-hanzi" lang="zh-Hans">进击的汉字</p><h1 lang="en">Attack on <span>Hànzì</span></h1><div class="actions">'+
      (due ? '<a class="button primary" href="#review">'+icon('refresh')+'К повторению</a>' : button('Начать с карточек','configure','all',true,'cards'))+
      '<a class="button secondary" href="#topics">Темы словаря</a></div></div><img class="hero-picture" src="assets/bao-hero.jpg" width="760" height="760" alt="Удивлённая булочка баоцзы с каллиграфической кистью выглядывает из-за крепостной стены" fetchpriority="high"></section>'+
      '<section class="stat-grid" aria-label="Сводка словаря">'+stat(words.length,'слов в словаре','book')+stat(learned,'закреплено','check')+stat(due,'к повторению','clock')+'</section>'+
      (practice.canResume() ? '<aside class="banner"><div><strong>Тренировка не закончена</strong><p>'+escape(practice.resumeLabel())+'</p></div><a class="button primary" href="#practice">Продолжить</a></aside>' : '')+
      '<section class="section" id="topics"><div class="section-head"><h2 tabindex="-1">Темы словаря</h2><a class="button secondary" href="#dict">Весь словарь</a></div><div class="topic-grid">'+categories.filter(c => getWords(c.id).length).map(topicCard).join('')+'</div></section>'+
      '<section class="section"><div class="section-head"><h2>Тренировки</h2></div>'+modeGrid('all')+'</section>';
  }

  function wordStatus(id) {
    const p = Study.getProgress(state,id);
    if (!p) return ['Новое',''];
    if (p.due <= Date.now()) return ['Пора повторить','ready'];
    if (p.level >= 3) return ['Закреплено','solid'];
    return ['В изучении',''];
  }

  function wordRow(word, showStatus = false) {
    const favorite = state.favorites.includes(word.id);
    const [label, color] = wordStatus(word.id);
    return '<article class="word-row"><button type="button" class="term" lang="zh-Hans" data-action="detail" data-value="'+escape(word.id)+'">'+escape(word.hanzi)+'</button><span class="word-reading">'+escape(word.pinyin)+'</span><div class="word-meaning">'+escape(word.meaning)+(showStatus ? ' <span class="pill '+color+'">'+label+'</span>' : '')+'</div><div class="word-actions">'+
      iconButton('Произнести '+word.hanzi,'volume','speak-word',word.id)+iconButton('В избранном: '+word.hanzi,'star','favorite',word.id,favorite)+'</div></article>';
  }

  function placeholder(copy) {
    return '<div class="panel empty"><p>'+escape(copy)+'</p></div>';
  }

  const customScopes = {all:'Все темы',saved:'Избранное',due:'К повторению',new:'Новые слова',mistakes:'Нужно закрепить',photo:'Словарь','photo-new':'Словарь'};
  const scopeName = id => customScopes[id] || categoryName(id);

  function dictionary(key) {
    const addedOnly = key.startsWith('added:');
    const categoryKey = addedOnly ? key.slice(6) : key;
    const topic = categories.find(c => c.id === categoryKey);
    const vocab = getWords(key);
    const listed = Object.entries({all:'Все темы',saved:'Избранное'}).concat(categories.map(c => [c.id,c.name]));
    const description = topic ? topic.description+' · '+wordCount(vocab.length) : '';
    const base = '#dict/'+encodeURIComponent(categoryKey);
    const recent = topic ? getWords('added:'+topic.id).length : 0;
    return pageTitle(topic?.name || (key === 'all' ? 'Словарь' : scopeName(key)), description)+
      (recent ? '<div class="actions topic-switch" aria-label="Наборы темы"><a class="button secondary" href="'+base+'"'+(!addedOnly ? ' aria-current="page"' : '')+'>Вся тема</a><a class="button secondary" href="'+base+'/added"'+(addedOnly ? ' aria-current="page"' : '')+'>Новые в теме ('+recent+')</a></div>' : '')+
      (vocab.length ? '<section><div class="section-head"><h3>Тренировка по этому набору</h3></div>'+modeGrid(key)+'</section>' : '')+
      '<div class="filters"><label class="search">Поиск<input id="word-search" class="field" type="search" value="'+escape(dictionaryQuery)+'" placeholder="Иероглиф, пиньинь или перевод" autocomplete="off"></label>'+
      '<label>Тема<select class="field" id="category-filter">'+listed.map(([id,name]) => '<option value="'+escape(id)+'"'+(categoryKey === id ? ' selected' : '')+'>'+escape(name)+'</option>').join('')+'</select></label>'+
      '<label>Прогресс<select class="field" id="status-filter">'+[['all','Любой'],['new','Новые'],['due','К повторению'],['solid','Закреплённые']].map(([id,name]) => '<option value="'+id+'"'+(dictionaryStatus === id ? ' selected' : '')+'>'+name+'</option>').join('')+'</select></label></div>'+
      '<p id="word-count" class="small word-count" aria-live="polite"></p><div id="word-list" class="word-list"></div>';
  }

  function filterDictionary() {
    const list = document.querySelector('#word-list');
    if (!list) return;
    const query = Study.normalized(dictionaryQuery);
    const compactQuery = Study.readingKey(dictionaryQuery);
    const shown = getWords(route.key).filter(word => {
      const p = Study.getProgress(state,word.id);
      const progressMatch = dictionaryStatus === 'all' || dictionaryStatus === 'new' && !p ||
        dictionaryStatus === 'due' && p?.due <= Date.now() || dictionaryStatus === 'solid' && p?.level >= 3;
      return progressMatch && (!query || Study.normalized(word.hanzi+' '+word.pinyin+' '+word.meaning).includes(query) ||
        compactQuery && Study.readingKey(word.pinyin).includes(compactQuery));
    });
    document.querySelector('#word-count').textContent = 'Найдено: '+wordCount(shown.length);
    list.innerHTML = shown.length ? shown.map(word => wordRow(word,true)).join('') : placeholder('Под эти условия слова не нашлись.');
  }

  function review() {
    const due = getWords('due');
    const fresh = getWords('new');
    const mistakes = getWords('mistakes');
    const now = Date.now();
    const upcoming = words.map(word => [word,Study.getProgress(state,word.id)])
      .filter(([,p]) => p?.due > now).sort((a,b) => a[1].due-b[1].due).slice(0,12);
    return pageTitle('Повторение')+
      '<div class="stat-grid">'+stat(due.length,'к повторению','clock')+stat(fresh.length,'ещё не изучались','cards')+stat(mistakes.length,'нужно закрепить','target')+'</div>'+
      '<section><div class="section-head"><h2>К повторению сегодня</h2>'+(due.length ? button('Повторить','configure','due',true,'refresh') : '')+'</div>'+
      (due.length ? '<div class="word-list">'+due.map(word => wordRow(word,true)).join('')+'</div>' : placeholder('На данный момент очередь пуста. Можно взять новые слова или выбрать тему.'))+'</section>'+
      '<section class="section"><div class="section-head"><h2>Следующая тренировка</h2></div><div class="actions">'+
      (fresh.length ? button('Новые слова','configure','new',true,'cards') : '')+
      (mistakes.length ? button('Слова с ошибками','configure','mistakes',false,'target') : '')+
      (state.favorites.length ? button('Избранное','configure','saved',false,'star') : '')+
      '<a class="button secondary" href="#dict">Выбрать слова в словаре</a></div></section>'+
      (upcoming.length ? '<section class="section"><div class="section-head"><h2>Ближайшие повторения</h2></div><div class="panel progress-list">'+
        upcoming.map(([word,p]) => '<div class="progress-line"><button type="button" class="term" lang="zh-Hans" data-action="detail" data-value="'+escape(word.id)+'">'+escape(word.hanzi)+'</button>'+small(word.meaning)+small(formatDate(p.due))+'</div>').join('')+'</div></section>' : '');
  }

  function progress() {
    const results = words.map(w => Study.getProgress(state,w.id)).filter(Boolean);
    const total = results.reduce((sum,p) => sum + p.attempts,0);
    const correct = results.reduce((sum,p) => sum + p.correct,0);
    const learned = results.filter(p => p.level >= 3).length;
    const byMode = new Map(Study.displayModes.map(mode => [mode.id,{sessions:0,answered:0}]));
    let answered = 0;
    for (const session of state.sessions) {
      const counts = byMode.get(session.mode);
      const answers = session.answered ?? session.total;
      counts.sessions += 1;
      counts.answered += answers;
      answered += answers;
    }
    return pageTitle('Прогресс','Закреплёнными считаются слова, которые ты правильно вспомнил на нескольких повторениях.')+
      '<div class="stat-grid">'+stat(results.length,'слов в изучении','book')+stat(learned,'закреплено','check')+stat(total ? Math.round(correct/total*100) : 0,'точность, %','target')+'</div>'+
      '<section class="training-stats" aria-labelledby="training-stats-title"><div class="section-head"><h2 id="training-stats-title">Статистика тренировок</h2></div>'+
      '<div class="stat-grid training-stats-totals">'+stat(state.sessions.length,'завершено тренировок','chart')+stat(answered,'ответов в тренировках','check')+'</div>'+
      '<div class="panel progress-list"><table aria-label="Статистика по типам заданий"><thead><tr><th scope="col">Тип задания</th><th scope="col">Тренировки</th><th scope="col">Ответы</th></tr></thead><tbody>'+
      Study.displayModes.map(mode => {
        const counts = byMode.get(mode.id);
        return '<tr><th scope="row">'+escape(mode.name)+'</th><td>'+number.format(counts.sessions)+'</td><td>'+number.format(counts.answered)+'</td></tr>';
      }).join('')+'</tbody></table></div>'+
      (state.sessions.some(session => session.answered === undefined) ? '<p class="small">В старых тренировках в число ответов могут входить пропуски.</p>' : '')+'</section>'+
      '<section><div class="section-head"><h2>По темам</h2></div><div class="panel progress-list">'+categories.map(category => {
        const all = getWords(category.id);
        const known = all.filter(word => Study.getProgress(state,word.id)?.level >= 3).length;
        return '<div class="progress-line"><a href="#dict/'+encodeURIComponent(category.id)+'"><strong>'+escape(category.name)+'</strong></a><div class="progress-track" role="progressbar" aria-label="'+escape(category.name)+'" aria-valuenow="'+known+'" aria-valuemax="'+Math.max(1,all.length)+'"><span style="width:'+(all.length ? known/all.length*100 : 0)+'%"></span></div>'+small(known+' из '+all.length)+'</div>';
      }).join('')+'</div></section>'+
      '<section class="section"><div class="section-head"><h2>Последние тренировки</h2></div>'+
      (state.sessions.length ? '<div class="panel progress-list">'+state.sessions.slice(0,8).map(s => '<div class="progress-line"><strong>'+escape(scopeName(s.scope))+'</strong>'+small(Study.displayModes.find(m => m.id === s.mode)?.name || 'Тренировка')+small(s.correct+' / '+s.total+' · '+formatDate(s.time))+'</div>').join('')+'</div>' : placeholder('Здесь появятся результаты завершённых тренировок.'))+'</section>';
  }

  const positionInfo = {
    上:[50,18,''],下:[50,84,''],外面:[79,60,''],里面:[50,50,'inside'],左边:[23,50,''],右边:[77,50,''],
    中间:[50,50,'between'],旁边:[70,67,''],前面:[50,66,''],后边:[50,35,'behind']
  };
  function positionFigure(word) {
    const detail = positionInfo[word.hanzi];
    if (!detail) return '';
    const [x,y,modifier] = detail;
    return '<figure class="position-scene '+modifier+'" role="img" aria-label="'+escape('Положение кота: '+word.meaning)+'"><span class="object"></span>'+
      (modifier === 'between' ? '<span class="object second"></span>' : '')+
      '<span class="cat" style="--x:'+x+'%;--y:'+y+'%" aria-hidden="true">🐈</span></figure>';
  }

  function showWord(id) {
    const word = byId.get(id);
    if (!word) return;
    const translations = word.examples.map((example,i) => '<li><div class="example-zh" lang="zh-Hans">'+escape(wholeExample(word,example))+'</div>'+
      examplePinyin(word,example)+
      '<div>'+escape(example.translation)+'</div>'+exampleFootnote(word,example)+iconButton('Произнести пример '+(i+1),'volume','speak-example',id+'~'+i)+'</li>').join('');
    setDialog(word.hanzi,'<div class="word-reading">'+escape(word.pinyin)+'</div><p>'+escape(word.meaning)+'</p>'+
      '<div class="actions">'+word.groups.map(group => '<a class="pill" href="#dict/'+encodeURIComponent(group)+'" data-action="close-dialog">'+escape(categoryName(group))+'</a>').join('')+
      '</div>'+positionFigure(word)+
      '<div class="actions">'+button('Произнести','speak-word',id,false,'volume')+button('Потренировать письмо','configure-word',id,true,'pen')+'</div>'+
      (translations ? '<h3>Примеры</h3><ul class="example-list">'+translations+'</ul>' : ''));
    document.querySelector('#dialog-title').classList.add('detail-term');
    document.querySelector('#dialog-title').lang = 'zh-Hans';
  }

  function render() {
    practice.cleanup();
    const listening = route.page === 'practice' && state.active?.mode === 'listen' && practice.canResume() ? state.active : null;
    const showNotice = listening && listening !== audioVisit && !state.hideAudioNotice;
    audioVisit = listening;
    nav.innerHTML = links.map(([id,label,symbol]) => '<a href="#'+id+'"'+(id === route.page ? ' aria-current="page"' : '')+'>'+icon(symbol,16)+escape(label)+'</a>').join('');
    if (route.page === 'practice' || route.page === 'summary') {
      practice.render(route.page);
      if (showNotice) showAudioNotice();
      return;
    }
    if (route.page === 'dict') {
      main.innerHTML = dictionary(route.key);
      filterDictionary();
    } else if (route.page === 'review') main.innerHTML = review();
    else if (route.page === 'progress') main.innerHTML = progress();
    else main.innerHTML = home();
  }

  function updateRoute() {
    const [requested, key, filter] = location.hash.slice(1).split('/');
    if (requested === 'main') return;
    const oldCollection = requested === 'dict' && ['photo','photo-new'].includes(key);
    const showTopics = requested === 'topics' || oldCollection;
    if (oldCollection) history.replaceState(null,'','#topics');
    const page = !showTopics && ['home','dict','review','progress','practice','summary'].includes(requested) ? requested : 'home';
    let unique = 'all';
    try { if (key) unique = decodeURIComponent(key); } catch { unique = 'all'; }
    if (page === 'dict' && filter === 'added' && categories.some(c => c.id === unique)) unique = 'added:'+unique;
    if (page === 'dict' && unique !== route.key) {
      dictionaryQuery = '';
      dictionaryStatus = 'all';
    }
    route = {page,key:unique};
    if (dialog.open) dialog.close();
    render();
    if (showTopics) {
      const heading = document.querySelector('#topics h2');
      heading.focus({preventScroll:true});
      heading.scrollIntoView();
    } else {
      window.scrollTo(0,0);
      if (!dialog.open) main.focus({preventScroll:true});
    }
  }

  const imports = window.HanziImport({Study,state, persist, rebuild, render, getWords, ui, toast, setDialog});

  document.querySelector('.settings').innerHTML = icon('settings');
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const {action,value,mode} = control.dataset;
    if (action === 'close-dialog') {
      if (dialog.open) dialog.close();
    } else if (action === 'settings') imports.settings();
    else if (action === 'voice-help') showVoiceHelp();
    else if (action === 'voice-guide') {
      const guide = dialog.querySelector('#voice-guide');
      guide.hidden = !guide.hidden;
      control.setAttribute('aria-expanded',String(!guide.hidden));
      if (!guide.hidden) guide.querySelector('h3').focus();
    } else if (action === 'voice-test') {
      const feedback = dialog.querySelector('#voice-test-status');
      speak('你好',false,'',message => { feedback.textContent = message; });
    } else if (action === 'export') imports.exportBackup();
    else if (action === 'configure' || action === 'configure-word') {
      practice.configure(action === 'configure-word' ? 'one' : value, mode || (action === 'configure-word' ? 'writing' : 'flash'),
        action === 'configure-word' ? byId.get(value) : null, scopeName);
    } else if (action === 'detail') showWord(value);
    else if (action === 'speak-word') {
      const word = byId.get(value);
      if (word) speak(word.hanzi,false,word.pinyin);
    } else if (action === 'speak-example') {
      const [id,i] = value.split('~');
      const word = byId.get(id);
      if (word?.examples[i]) speak(wholeExample(word,word.examples[i]),true);
    } else if (action === 'favorite') {
      const favorite = state.favorites.includes(value);
      state.favorites = favorite ? state.favorites.filter(id => id !== value) : [...state.favorites,value];
      control.setAttribute('aria-pressed', String(!favorite));
      persist();
      if (route.page === 'dict' && route.key === 'saved') filterDictionary();
      toast(favorite ? 'Слово убрано из избранного.' : 'Слово добавлено в избранное.');
    } else practice.action(action,value,control);
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'word-search') return;
    dictionaryQuery = event.target.value;
    filterDictionary();
  });
  document.addEventListener('change', event => {
    const {id,value} = event.target;
    if (id === 'category-filter') location.hash = '#dict/'+encodeURIComponent(value);
    else if (id === 'status-filter') {
      dictionaryStatus = value;
      filterDictionary();
    } else if (id === 'import-file') imports.importFile(event.target);
    else if (id === 'hide-audio-notice') {
      state.hideAudioNotice = event.target.checked;
      persist();
    } else practice.change(id,value);
  });
  document.addEventListener('submit', event => {
    if (event.target.id !== 'setup-form') return;
    event.preventDefault();
    if (practice.start(new FormData(event.target)) && dialog.open && dialog.contains(event.target)) dialog.close();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('hashchange',updateRoute);
  window.speechSynthesis?.getVoices();
  rebuild();
  updateRoute();
  imports.migrate();
})();
