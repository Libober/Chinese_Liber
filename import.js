window.HanziImport = function ({Study,state,persist,rebuild,render,getWords,ui,toast,setDialog}) {
  const {button} = ui;
  let mammoth;
  const hasData = value => Array.isArray(value?.words) || Array.isArray(value?.sentences);
  const refresh = () => { persist(); rebuild(); render(); };

  function settings() {
    setDialog('Настройки',
      '<h3>Материалы и резервная копия</h3>'+
      '<p>Добавь слова из DOCX или перенеси прогресс из JSON.</p>'+
      '<div class="actions">'+button('Скачать резервную копию','export')+
      '<label class="button primary file-action">Загрузить DOCX или JSON<input id="import-file" type="file" accept=".docx,.json"></label></div>'+
      '<p id="import-status" class="small" role="status">Загружаемые файлы обрабатываются в браузере.</p>'+
      '<h3>Озвучка</h3>'+
      '<div class="actions">'+button('Как установить голос','voice-help')+'</div>'+
      '<label class="voice-preference"><input type="checkbox" id="hide-audio-notice"'+(state.hideAudioNotice ? ' checked' : '')+'> Больше не показывать предупреждение при входе в аудио</label>');
  }

  function exportBackup() {
    const data = {format:'hanzi-study-2',data:state};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hanzi-backup-'+new Date().toISOString().slice(0,10)+'.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (mammoth) return mammoth;
    mammoth = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      const failed = () => {
        clearTimeout(timeout);
        script.remove();
        mammoth = null;
        reject(new Error('Парсер DOCX не загрузился. Попробуй снова при подключении к сети.'));
      };
      const timeout = setTimeout(failed,10000);
      script.onload = () => { clearTimeout(timeout); if (window.mammoth) resolve(window.mammoth); else failed(); };
      script.onerror = failed;
      document.head.append(script);
    });
    return mammoth;
  }

  async function readDocx(file) {
    const library = await loadMammoth();
    const {value} = await library.convertToHtml({arrayBuffer:await file.arrayBuffer()});
    const doc = new DOMParser().parseFromString(value,'text/html');
    const importedWords = [];
    let group = 'Общая';
    for (const block of doc.body.children) {
      const text = block.textContent.trim();
      if (/^H[1-6]$/.test(block.tagName) || /^\d+[.\s]+\s*\D/.test(text)) group = text;
      if (block.tagName !== 'TABLE') continue;
      for (const row of block.querySelectorAll('tr')) {
        const [hanzi,pinyin,meaning] = [...row.cells].map(cell => cell.textContent.trim());
        if (hanzi && /^\p{Script=Han}{1,24}$/u.test(hanzi) && meaning) importedWords.push({hanzi,pinyin,meaning,group});
      }
    }
    const words = [...importedWords,...getWords('all')];
    const candidates = new Map();
    let current;
    for (const block of doc.querySelectorAll('p,li,h1,h2,h3,h4,tr')) {
      if (block.closest('tr') && block.tagName !== 'TR') continue;
      const elements = block.tagName === 'TR' ? [...block.cells].map(cell => cell.textContent.trim()) : [];
      const text = elements.length ? elements.join(' — ') : block.textContent.trim();
      const header = text.match(/^(\p{Script=Han}+) — ([^—]+) — /u);
      if (header) {
        const terms = words.filter(word => word.hanzi === header[1]);
        current = terms.find(word => Study.readingId(word.pinyin) === Study.readingId(header[2])) ||
          (terms.length === 1 ? terms[0] : null);
        continue;
      }
      const match = text.match(/^(.*?)\s*\(([^)]*)\)\s*—\s*(.+)$/);
      if (!current || !match || !/[а-яё]/i.test(match[3])) continue;
      let [,prompt,pinyin,translation] = match;
      if (!prompt.includes('__') && pinyin.includes('__') && prompt.includes(current.hanzi)) {
        prompt = prompt.replace(current.hanzi,'__');
      }
      if (!prompt.includes('__') && pinyin.startsWith(' ')) {
        prompt = '__'+prompt;
        pinyin = current.pinyin+' '+pinyin.trim();
      }
      if ((prompt.match(/__/g) || []).length !== 1) continue;
      const key = current.hanzi+'|'+Study.readingId(current.pinyin);
      const saved = candidates.get(key) || {hanzi:current.hanzi,pinyin:current.pinyin,examples:[]};
      saved.examples.push({prompt,translation,pinyin:pinyin.replace('__',current.pinyin)});
      candidates.set(key,saved);
    }
    return Study.mergeCustom(importedWords,[...candidates.values()]);
  }

  async function importFile(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.querySelector('#import-status');
    const before = getWords('all').length;
    status.textContent = 'Читаем файл…';
    input.disabled = true;
    try {
      if (/\.docx$/i.test(file.name)) {
        const data = await readDocx(file);
        if (!data.length) throw new Error('Не удалось найти таблицу слов или предложения с переводом.');
        state.custom = Study.mergeCustom(state.custom,data);
      } else {
        const data = JSON.parse(await file.text());
        if (data?.format === 'hanzi-study-2') {
          const incoming = Study.safeState(data.data);
          for (const [key,value] of Object.entries(incoming.progress)) {
            if (!value || (Study.getProgress(state,key)?.last || 0) >= (Number(value.last) || 0)) continue;
            Object.defineProperty(state.progress,key,{value,writable:true,configurable:true,enumerable:true});
          }
          state.custom = Study.mergeCustom(state.custom,incoming.custom);
          state.favorites = [...new Set([...state.favorites,...incoming.favorites])];
          const sessions = new Map([...incoming.sessions,...state.sessions].map(session => [session.time,session]));
          state.sessions = [...sessions.values()].sort((a,b) => b.time-a.time).slice(0,100);
          if (!state.active && incoming.active?.writing) state.active = incoming.active;
        } else if (hasData(data)) {
          state.custom = Study.mergeCustom(state.custom,Study.fromLegacy(data,getWords('all')));
        } else throw new Error('Этот JSON не похож на резервную копию тренажёра.');
      }
      refresh();
      status.textContent = 'Импорт завершён. Новых слов в словаре: '+(getWords('all').length-before)+'.';
      toast('Импорт завершён.');
    } catch (error) {
      status.textContent = error instanceof SyntaxError ? 'Не удалось прочитать JSON.' : error.message;
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }

  function oldDatabase() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(resolve => {
      const open = indexedDB.open('ChineseTrainerDB');
      open.onupgradeneeded = () => open.transaction.abort();
      open.onerror = open.onblocked = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('words') || !db.objectStoreNames.contains('sentences')) {
          db.close();
          resolve(null);
          return;
        }
        const tx = db.transaction(['words','sentences'],'readonly');
        const words = tx.objectStore('words').getAll();
        const sentences = tx.objectStore('sentences').getAll();
        tx.oncomplete = () => { db.close(); resolve({words:words.result,sentences:sentences.result}); };
        tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
      };
    });
  }

  async function migrate() {
    if (state.migrated) return;
    try {
      let data;
      try { data = JSON.parse(localStorage.getItem(Study.legacyKey)); } catch { data = null; }
      const database = await oldDatabase();
      for (const source of [data,database].filter(hasData)) {
        state.custom = Study.mergeCustom(state.custom,Study.fromLegacy(source,getWords('all')));
      }
      state.migrated = true;
      if (hasData(data) || hasData(database)) refresh();
      else persist();
    } catch { /* The browser may block access to IndexedDB in private or local-file mode. */ }
  }
  return {settings,exportBackup,importFile,migrate};
};
