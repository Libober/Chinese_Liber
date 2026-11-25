(() => {
  const categories = [
    ['people','Семья и люди','家','Родные, друзья и знакомые','rose'],
    ['time','Время','时','Часы, дни и части суток','gold'],
    ['day','Повседневная жизнь','做','Дела и привычки','sage'],
    ['fun','Досуг','玩','Кино, музыка и увлечения','plum'],
    ['place','Расположение','方','Где находится предмет','blue'],
    ['food','Еда и напитки','食','Блюда, напитки и за столом','gold'],
    ['shop','Покупки','买','Магазин, деньги и цены','rose'],
    ['study','Учёба и язык','学','Речь, чтение и письмо','sage'],
    ['connect','Связки и вопросы','问','Вопросы и связная речь','plum'],
    ['world','Страны','国','Страны и происхождение','blue'],
    ['numbers','Числа и счёт','数','Числа и счётные слова','gold'],
    ['traits','Описания','美','Качества и размеры','rose'],
    ['things','Вокруг нас','物','Предметы, места и животные','sage']
  ].map(([id, name, glyph, description, color]) => ({id, name, glyph, description, color}));

  const displayModes = [
    ['flash','Карточки','Вспомни перевод или иероглиф','cards'],
    ['choice','Выбор ответа','Соотнеси слово с переводом','target'],
    ['sentence','Предложения','Вставь слово по точному переводу','quote'],
    ['writing','Письмо','Напиши каждый знак по чертам','pen'],
    ['listen','На слух','Узнай слово по произношению','volume']
  ].map(([id, name, description, icon]) => ({id, name, description, icon}));

  const stateKey = 'HANZI_STUDY_V2';
  const legacyKey = 'CHINESE_TRAINER_BACKUP_V1';
  const legacy = window.LegacyVocabulary;
  const photo = window.PhotoVocabulary;
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const normalized = value => clean(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replaceAll('ё','е');
  const readingKey = value => normalized(value).replace(/[\s'’·-]/g, '');
  const readingId = value => clean(value).normalize('NFC').toLowerCase().replace(/\s|['’·-]/g, '');
  const retiredTranslations = new Set(legacy.retiredTranslations.map(([hanzi,translation]) => hanzi+'|'+normalized(translation)));
  const examplesKey = example => [example.prompt, example.translation].join('\n');
  const own = (record, key) => Object.hasOwn(record, key);
  const groupNames = [
    [/числ|сч[её]т/i,'numbers'],[/семь|люди/i,'people'],[/местоимен|служеб|разное/i,'connect'],
    [/стран/i,'world'],[/врем|дат/i,'time'],[/глагол|действ/i,'day'],[/прилаг|нареч/i,'traits'],
    [/существ|окружающ/i,'things'],[/направлен|положен/i,'place'],[/покуп/i,'shop'],
    [/уч[её]б|язык/i,'study'],[/досуг/i,'fun'],[/ед[аы]|напит/i,'food']
  ];

  function groupId(group) {
    const name = clean(group).replace(/^\d+[.\s]+/,'');
    return categories.find(c => c.id === name || c.name === name)?.id ||
      groupNames.find(([pattern]) => pattern.test(name))?.[1] || (name === 'Общая' || !name ? 'imported' : 'extra:' + name);
  }

  function makeWord(hanzi, pinyin, meaning, primary) {
    return {id: hanzi + '|' + readingId(pinyin), hanzi, pinyin, meaning, groups: [primary],
      examples: [], photo: false, original: false};
  }

  function makeExample(prompt, translation, pinyin = '') {
    if (typeof prompt !== 'string' || (prompt.match(/__/g) || []).length !== 1 || !/\p{Script=Han}/u.test(prompt) ||
        typeof translation !== 'string' || !/[а-яё]/i.test(translation)) return null;
    return {prompt: clean(prompt), translation: clean(translation), pinyin: clean(pinyin)};
  }

  function readMaterials(data, known) {
    if (data?.format !== 'hanzi-materials-1' || !Array.isArray(data.words) || !data.words.length) {
      throw new Error('В файле материалов нужен непустой список words.');
    }
    const ids = new Set();
    const translations = /[а-яё]/i;
    const hanziPattern = /^\p{Script=Han}{1,24}$/u;
    const isPinyin = value => /^[a-züê\p{M}]+$/iu.test(value.normalize('NFD'));
    return data.words.map((row,index) => {
      const {hanzi,pinyin,meaning,group} = Object.fromEntries(['hanzi','pinyin','meaning','group'].map(key => [key,clean(row?.[key])]));
      const id = hanzi+'|'+readingId(pinyin);
      const existing = known.find(word => word.id === id);
      const label = 'Слово '+(index+1)+(hanzi ? ' («'+hanzi+'»)' : '');
      if (!hanziPattern.test(hanzi) || !pinyin || !pinyin.split(/[\s'’·-]+/).every(isPinyin)) {
        throw new Error(label+' требует ханзи и пиньинь.');
      }
      if (ids.has(id)) throw new Error(label+' встречается дважды.');
      ids.add(id);
      if ((meaning && !translations.test(meaning)) || (!existing && (!meaning || !group))) {
        throw new Error(label+' требует русский перевод и тему для нового слова.');
      }
      if (row.examples != null && !Array.isArray(row.examples)) throw new Error(label+' требует список examples.');
      const examples = (row.examples || []).map((item,exampleIndex) => {
        const name = label+', пример '+(exampleIndex+1);
        const example = makeExample(item?.prompt,item?.translation,item?.pinyin);
        if (!example || /[^\p{Script=Han}\p{P}\s]/u.test(example.prompt)) throw new Error(name+' требует китайскую фразу с одним пропуском __ и русский перевод.');
        const full = example.prompt.replace('__',hanzi);
        const syllables = example.pinyin.match(/[\p{Script=Latin}\p{M}]+/gu) || [];
        if (syllables.length !== full.match(/\p{Script=Han}/gu).length || !syllables.every(isPinyin) ||
            /[^\p{Script=Latin}\p{M}\p{P}\s]/u.test(example.pinyin)) {
          throw new Error(name+' требует пиньинь полного предложения, по одному слогу на иероглиф.');
        }
        if (item.notes != null && !Array.isArray(item.notes)) throw new Error(name+' требует список notes.');
        const notes = (item.notes || []).map(note => {
          const term = clean(note?.hanzi), reading = clean(note?.pinyin), gloss = clean(note?.meaning);
          if (!hanziPattern.test(term) || !example.prompt.includes(term) || !reading ||
              !reading.split(/[\s'’·-]+/).every(isPinyin) || !translations.test(gloss)) {
            throw new Error(name+' содержит неполную сноску или слово, которого нет вокруг пропуска.');
          }
          return {hanzi:term,pinyin:reading,meaning:gloss};
        });
        return {...example,notes,reviewedPinyin:true};
      });
      return {hanzi,pinyin,meaning,group,examples};
    });
  }

  function resetState() {
    return {progress:{}, favorites:[], custom:[], sessions:[], active:null, migrated:false, direction:'hanzi', hideAudioNotice:false};
  }

  function mergeSessions(...lists) {
    const sessions = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || !Number.isFinite(item.time) || !displayModes.some(mode => mode.id === item.mode) ||
            !Number.isSafeInteger(item.total) || item.total < 1 || !Number.isSafeInteger(item.correct) ||
            item.correct < 0 || item.correct > item.total) continue;
        const {time, mode, total, correct} = item;
        const scope = clean(item.scope);
        const id = clean(item.id);
        const answered = Number.isSafeInteger(item.answered) && correct <= item.answered && item.answered <= total
          ? item.answered : undefined;
        const key = id || JSON.stringify([time,mode,scope,total,correct]);
        if (sessions.has(key) && (sessions.get(key).answered !== undefined || answered === undefined)) continue;
        sessions.set(key,{id:id || undefined,time,scope,mode,total,correct,answered});
      }
    }
    return [...sessions.values()].sort((a,b) => b.time-a.time);
  }

  function safeState(value) {
    const defaults = resetState();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
    return {
      progress: value.progress && typeof value.progress === 'object' && !Array.isArray(value.progress) ? value.progress : {},
      favorites: Array.isArray(value.favorites) ? value.favorites.filter(id => typeof id === 'string') : [],
      custom: Array.isArray(value.custom) ? value.custom.filter(item => item && typeof item === 'object') : [],
      sessions: mergeSessions(value.sessions),
      active: value.active && Array.isArray(value.active.questions) ? value.active : null,
      migrated: value.migrated === true,
      direction: value.direction === 'meaning' ? 'meaning' : 'hanzi',
      hideAudioNotice: value.hideAudioNotice === true
    };
  }

  function mergeCustom(first, second) {
    const rows = new Map();
    for (const item of [...first, ...second]) {
      const key = [clean(item.hanzi), readingId(item.pinyin), clean(item.group)].join('|');
      const saved = rows.get(key);
      const examples = [...(saved?.examples || []), ...(Array.isArray(item.examples) ? item.examples : [])]
        .filter(example => example && typeof example.prompt === 'string' && typeof example.translation === 'string');
      rows.set(key, {...saved, ...item, meaning: clean(item.meaning) || saved?.meaning || '',
        examples: [...new Map(examples.map(example => [examplesKey(example), example])).values()]});
    }
    return [...rows.values()];
  }

  function buildVocabulary(custom = []) {
    const result = new Map();
    for (const [hanzi, pinyin, meaning, category] of legacy.words) {
      const word = makeWord(hanzi, pinyin, meaning, category);
      word.original = true;
      result.set(word.id, word);
    }
    for (const [hanzi, pinyin, prompt, translation, reading] of legacy.examples) {
      const example = makeExample(prompt, translation, reading);
      const word = result.get(hanzi + '|' + readingId(pinyin)) || [
        ...result.values()
      ].find(item => item.hanzi === hanzi && readingKey(item.pinyin) === readingKey(pinyin));
      if (example && word) word.examples.push(example);
    }
    for (const [category, rows] of Object.entries(photo)) {
      for (const row of rows.split('\n')) {
        const [hanzi, pinyin, meaning, marked, translation] = row.split('|');
        const word = makeWord(hanzi, pinyin, meaning, category);
        const prior = result.get(word.id);
        const example = makeExample(marked.replace(/\[[^\]]+\]/,'__'), translation);
        word.original = Boolean(prior?.original);
        word.groups = [...new Set([category, ...(prior?.groups || [])])];
        word.examples = [example, ...(prior?.examples || [])].filter(Boolean);
        word.photo = true;
        if (hanzi === '想') word.meaning = 'хотеть; думать; скучать';
        if (hanzi === '怎么') word.groups.push('connect');
        if (hanzi === '汉字') word.groups = ['study'];
        result.set(word.id, word);
      }
    }
    for (const row of custom) {
      const hanzi = clean(row.hanzi);
      const pinyin = clean(row.pinyin);
      const meaning = clean(row.meaning);
      if (!/^\p{Script=Han}{1,24}$/u.test(hanzi)) continue;
      let word = result.get(hanzi + '|' + readingId(pinyin));
      if (!pinyin && !word) word = [...result.values()].find(item => item.hanzi === hanzi);
      if (!word && meaning) {
        word = makeWord(hanzi, pinyin, meaning, groupId(row.group));
        result.set(word.id, word);
      }
      if (!word) continue;
      if (clean(row.group)) word.groups = [...new Set([...word.groups, groupId(row.group)])];
      for (const e of Array.isArray(row.examples) ? row.examples : []) {
        const valid = e && makeExample(e.prompt, e.translation, e.pinyin);
        if (!valid || retiredTranslations.has(hanzi+'|'+normalized(valid.translation)) ||
            word.examples.some(example => !example.custom && example.prompt === valid.prompt)) continue;
        const notes = Array.isArray(e.notes) ? e.notes.filter(note => note && clean(note.hanzi) && clean(note.pinyin) && clean(note.meaning)) : [];
        word.examples.push({...valid,notes,reviewedPinyin:e.reviewedPinyin === true,custom:true});
      }
    }
    for (const word of result.values()) {
      word.groups = [...new Set(word.groups)];
      word.examples = [...new Map(word.examples.map(example => [examplesKey(example), example])).values()];
    }
    return [...result.values()];
  }

  function fromLegacy(data, known = []) {
    const items = new Map();
    const byHanzi = new Map();
    const add = word => {
      const hanzi = clean(word.hanzi);
      if (!/^\p{Script=Han}{1,24}$/u.test(hanzi)) return;
      const key = hanzi + '|' + readingId(word.pinyin);
      if (!items.has(key)) {
        const entry = {hanzi, pinyin:clean(word.pinyin), meaning:clean(word.meaning), group:clean(word.group), examples:[]};
        items.set(key, entry);
        if (!byHanzi.has(hanzi)) byHanzi.set(hanzi, []);
        byHanzi.get(hanzi).push(entry);
      }
      return items.get(key);
    };
    for (const word of Array.isArray(data?.words) ? data.words : []) {
      if (word && clean(word.meaning)) add(word);
    }
    const byId = new Map((Array.isArray(data?.words) ? data.words : []).filter(word => word?.id != null)
      .map(word => [word.id, word]));
    for (const sentence of Array.isArray(data?.sentences) ? data.sentences : []) {
      if (!sentence) continue;
      const hanzi = clean(sentence.correctHanzi);
      if (!hanzi) continue;
      const linked = byId.get(sentence.wordId);
      let word = clean(linked?.hanzi) === hanzi ? add(linked) : null;
      const matches = byHanzi.get(hanzi) || known.filter(item => item.hanzi === hanzi);
      if (!word && matches.length === 1) word = add({hanzi, pinyin:matches[0].pinyin});
      if (!word) continue;
      const valid = makeExample(sentence.text, sentence.translation, clean(sentence.pinyin).replace('__',word.pinyin));
      if (valid) word.examples.push(valid);
    }
    return [...items.values()];
  }

  function shuffle(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index--) {
      const random = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[random]] = [copy[random], copy[index]];
    }
    return copy;
  }

  // Pairs whose meaning can overlap in a short prompt, including regional variants.
  const conflictGroups = [
    '二 两','几 多少','块 元','喜欢 爱','看 读','还 再 也','和 还有',
    '事 事儿','前 前面','后 后边 后面','外 外面','里 里面','左 左边','右 右边','中 中间','旁 旁边',
    '旁边 左边 右边','外面 左边 右边 前面 后边 旁边','上 上面 上边','下 下面 下边',
    '姥姥 外婆','姥爷 外公','早上 上午','晚上 夜里','这儿 这里','那儿 那里','那 哪',
    '汉字 字','外 国 外国','很 太','说 讲','是 为','见 看 认识','家 家里'
  ].map(group => group.split(' '));

  function equivalent(a, b, listening = false) {
    return a.id === b.id || a.hanzi === b.hanzi ||
      (listening && readingKey(a.pinyin) === readingKey(b.pinyin)) ||
      normalized(a.meaning) === normalized(b.meaning) ||
      conflictGroups.some(group => group.includes(a.hanzi) && group.includes(b.hanzi));
  }

  function makeQuestion(word, mode, all, cohort, example) {
    const listening = mode === 'listen';
    const options = [];
    if (['choice','sentence','listen'].includes(mode)) {
      options.push(word);
      const sameIds = new Set(cohort.map(w => w.id));
      const candidates = [...shuffle(cohort), ...shuffle(all.filter(w => !sameIds.has(w.id)))];
      for (const alternative of candidates) {
        if (options.some(current => equivalent(current, alternative, listening))) continue;
        options.push(alternative);
        if (options.length === 4) break;
      }
      if (options.length < 2) return null;
    }
    return {id:word.id, mode, example, options:shuffle(options).map(item => item.id)};
  }

  function makeQuestions(words, mode, all, limit, rotate = false) {
    const ordered = rotate ? [...words] : shuffle(words);
    return ordered.flatMap(word => {
      if (mode !== 'sentence') return [makeQuestion(word, mode, all, words)];
      if (!word.examples.length) return [];
      return [makeQuestion(word, mode, all, words, shuffle(word.examples)[0])];
    }).filter(Boolean).slice(0,limit);
  }

  const intervals = [0, 1, 3, 7, 14, 30, 60];
  const day = 864e5;

  function getProgress(state, id) {
    const p = own(state.progress, id) ? state.progress[id] : null;
    if (!p || typeof p !== 'object') return null;
    return {level:Math.max(0,Math.min(6,Math.floor(Number(p.level) || 0))), due:Number(p.due) || 0,
      attempts:Math.max(0, Number(p.attempts) || 0), correct:Math.max(0, Number(p.correct) || 0),
      last:Number(p.last) || 0};
  }

  function grade(state, id, correct, now = Date.now()) {
    const before = getProgress(state,id) || {level:0,attempts:0,correct:0};
    const reviewingEarly = correct && before.level > 0 && before.due > now;
    const level = correct ? Math.min(6,before.level + Number(!reviewingEarly)) : Math.max(0,before.level - 2);
    const due = reviewingEarly ? before.due : now + (correct ? intervals[level] * day : 10 * 60e3);
    Object.defineProperty(state.progress,id,{value:{level,due,
      attempts:before.attempts + 1, correct:before.correct + Number(correct), last:now},writable:true,enumerable:true,configurable:true});
  }

  function dueWords(words, state, now = Date.now()) {
    return words.filter(word => {
      const p = getProgress(state,word.id);
      return p?.attempts > 0 && p.due <= now;
    }).sort((a,b) => getProgress(state,a.id).due - getProgress(state,b.id).due);
  }

  window.HanziStudy = {categories, displayModes, stateKey, legacyKey, resetState, safeState, mergeSessions, mergeCustom, readMaterials,
    buildVocabulary, fromLegacy, normalized, readingKey, readingId, shuffle, makeQuestions, equivalent, getProgress, grade, dueWords, day};
})();
