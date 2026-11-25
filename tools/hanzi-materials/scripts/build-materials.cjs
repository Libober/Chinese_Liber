const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(file,'utf8');
const readJSON = file => JSON.parse(read(file).replace(/^\uFEFF/,''));
const hanzi = /\p{Script=Han}+/gu;
const segmenter = new Intl.Segmenter('zh-CN',{granularity:'word'});

function getStudy() {
  const context = vm.createContext({window:{}});
  for (const file of ['site/data/legacy-data.js','site/data/photo-data.js','site/js/study.js']) {
    vm.runInContext(read(path.join(root,file)),context,{filename:file});
  }
  return context.window.HanziStudy;
}

function unknownWords(text, allowed) {
  function canSplit(word) {
    const chars = [...word];
    const reachable = new Set([0]);
    for (let start = 0; start < chars.length; start++) {
      if (!reachable.has(start)) continue;
      let candidate = '';
      for (let end = start; end < chars.length; end++) {
        candidate += chars[end];
        if (allowed.has(candidate)) reachable.add(end+1);
      }
    }
    return reachable.has(chars.length);
  }
  const unknown = [];
  for (const run of text.match(hanzi) || []) {
    const words = [...segmenter.segment(run)].map(item => item.segment);
    // Find a covering with as few unknown segments as possible. Joined segments
    // allow compound words already present in the dictionary or footnotes.
    const best = Array(words.length + 1);
    best[words.length] = [];
    for (let start = words.length - 1; start >= 0; start--) {
      best[start] = canSplit(words[start]) ? best[start+1] : [words[start],...best[start+1]];
      let candidate = '';
      for (let end = start; end < words.length; end++) {
        candidate += words[end];
        if (allowed.has(candidate) && best[end+1].length < best[start].length) best[start] = best[end+1];
      }
    }
    unknown.push(...best[0]);
  }
  return [...new Set(unknown)];
}

function build(input,output) {
  if (path.resolve(input) === path.resolve(output)) throw new Error('Укажи отдельный путь для готового файла.');
  const study = getStudy();
  const known = study.buildVocabulary();
  const rows = study.readMaterials(readJSON(input),known);
  const levels = readJSON(path.join(root,'materials/reference/hsk-1-2.json'));
  const allowed = new Set([...Object.keys(levels).filter(word => levels[word] <= 2),...known.map(word => word.hanzi),...rows.map(row => row.hanzi)]);
  const rebuilt = new Map(study.buildVocabulary(rows).map(word => [word.id,word]));
  const problems = [];
  for (const row of rows) {
    const word = rebuilt.get(row.hanzi+'|'+study.readingId(row.pinyin));
    for (const [index,example] of row.examples.entries()) {
      const label = `${row.hanzi}, пример ${index+1}`;
      const noted = new Set([...allowed,...example.notes.map(note => note.hanzi)]);
      const unknown = unknownWords(example.prompt,noted);
      if (unknown.length) problems.push(`${label}: проверь уровень или добавь сноску для ${unknown.join('、')}.`);
      if (!word?.examples.some(saved => saved.reviewedPinyin && saved.prompt === example.prompt && saved.translation === example.translation)) {
        problems.push(`${label}: тренажёр отбросил пример как повтор или исключённый перевод.`);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const words = rows.map(row => ({...row,examples:row.examples.map(({prompt,pinyin,translation,notes}) => ({prompt,pinyin,translation,notes}))}));
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({format:'hanzi-materials-1',words},null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(`${output} · ${words.length} слов · ${words.reduce((sum,word) => sum + word.examples.length,0)} предложений`);
}

try {
  const [input,output,...extra] = process.argv.slice(2);
  if (!input || !output || extra.length) throw new Error('node tools/hanzi-materials/scripts/build-materials.cjs ИСХОДНИК.json РЕЗУЛЬТАТ.json');
  build(input,output);
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Готовый файл уже существует. Укажи новое имя.' : error.message);
  process.exitCode = 1;
}
