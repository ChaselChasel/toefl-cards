console.log('app.js v3 loaded');  // ← 每次改动版本号
(() => {
  const $ = (sel) => document.querySelector(sel);

  const store = {
    get(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
    remove(key){ localStorage.removeItem(key); }
  };

  const state = {
    data: null,
    unitId: null,
    queue: [],
    current: null,
    knownSet: new Set(),
    revealMode: 'tap',
    shuffle: true,
    bigFont: true
  };

  // ===== 工具：把各种奇怪的 id 变成数字 =====
  function toUnitId(val, idxFallback){
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string'){
      const m = val.match(/\d+/);         // 提取第一个数字
      if (m) return Number(m[0]);
    }
    return idxFallback + 1;                // 实在没有就用顺序编号
  }

  // 读取设置
  state.revealMode = store.get('reveal-mode', 'tap');
  state.shuffle    = store.get('shuffle', true);
  state.bigFont    = store.get('big-font', true);

  // 元素
  const el = {
    loader: $('#loader'),
    unitPicker: $('#unit-picker'),
    quiz: $('#quiz'),
    settings: $('#settings'),
    unitGrid: $('#unit-grid'),
    word: $('#word'),
    def: $('#definition'),
    progress: $('#progress'),
    toast: $('#toast'),
    btnEnter: $('#btn-enter'),
    fileInput: $('#file-input'),
    btnKnown: $('#btn-known'),
    btnUnknown: $('#btn-unknown'),
    card: $('#card'),
    btnBack: $('#btn-back'),
    btnReset: $('#btn-reset'),
    btnSettings: $('#btn-settings'),
    btnCloseSettings: $('#btn-close-settings'),
    btnClearData: $('#btn-clear-data'),
    btnExport: $('#btn-export'),
    btnImportProgress: $('#btn-import-progress'),
    progressFile: $('#progress-file'),
    revealMode: $('#reveal-mode'),
    shuffle: $('#shuffle'),
    big: $('#big-font')
  };

  // 应用设置
  document.body.classList.toggle('big', state.bigFont);
  if (el.revealMode) el.revealMode.value = state.revealMode;
  if (el.shuffle)    el.shuffle.checked = state.shuffle;
  if (el.big)        el.big.checked = state.bigFont;

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }

  function toast(msg, t=1600){
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    setTimeout(() => el.toast.classList.remove('show'), t);
  }

  function show(sectionId){
    [el.loader, el.unitPicker, el.quiz, el.settings].forEach(s => s && s.classList.add('hidden'));
    const sec = $(sectionId);
    if (sec) sec.classList.remove('hidden');
  }

  function ensureData(){
    const saved = store.get('words-data', null);
    if (saved) { state.data = normalizeData(saved); return true; }
    return false;
  }

  // —— 统一字段 & id 容错：word/definition → w/def；id 取数字 —— //
  function normalizeData(raw){
    if (!raw || !Array.isArray(raw.units)) return raw;
    const norm = { units: [] };
    raw.units.forEach((u, idx) => {
      if (!u) return;
      const id = toUnitId(u.id, idx);
      const title = u.title ?? `Sentence ${String(id).padStart(2,'0')}`;
      const words = [];
      if (Array.isArray(u.words)){
        for (const it of u.words){
          if (!it) continue;
          const w = it.w ?? it.word ?? it.term ?? '';
          const def = it.def ?? it.definition ?? it.meaning ?? '';
          if (!w) continue;
          words.push({ w: String(w), def: String(def) });
        }
      }
      norm.units.push({ id, title, words });
    });
    // 去重并按 id 排序
    const seen = new Set();
    norm.units = norm.units
      .filter(u => !seen.has(u.id) && seen.add(u.id))
      .sort((a,b) => a.id - b.id);
    return norm;
  }

  function buildUnits(){
    if (!el.unitGrid) return;
    el.unitGrid.innerHTML = '';
    if (!state.data || !state.data.units) return;
    const progress = store.get('progress', {});
    state.data.units.forEach(u => {
      const stat = progress[u.id]?.knownCount ?? 0;
      const total = u.words.length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit';
      btn.innerHTML = `<div class="num">#${u.id}</div><div class="title">${u.title ?? ''}</div><div class="stats">${stat}/${total}</div>`;
      btn.addEventListener('click', () => startUnit(u.id));
      el.unitGrid.appendChild(btn);
    });
  }

  function startUnit(id){
    state.unitId = toUnitId(id, 0);
    const u = state.data.units.find(x => x.id === state.unitId);

    if (!u){
      toast('未找到该单元（请检查 unit_id）');
      return;
    }
    if (!u.words || u.words.length === 0){
      toast('该单元没有单词');
      return;
    }

    const progress = store.get('progress', {});
    const knownArr = new Set(progress[state.unitId]?.known ?? []);
    state.knownSet = knownArr;

    const all = u.words.map(w => ({...w}));
    if (state.shuffle) shuffle(all);
    state.queue = all.filter(w => !knownArr.has(w.w));
    if (state.queue.length === 0) state.queue = all.slice();

    nextCard();
    updateProgress();
    show('#quiz');
  }

  function updateProgress(){
    if (!el.progress) return;
    const u = state.data.units.find(x => x.id === state.unitId);
    const total = u?.words?.length ?? 0;
    const progress = store.get('progress', {});
    const knownCount = (progress[state.unitId]?.known ?? []).length;
    const left = state.queue.length;
    el.progress.textContent = `已掌握 ${knownCount}/${total} · 本轮剩余 ${left}`;
  }

  function nextCard(){
    // 队列空 → 试着重建（未掌握），还不行就提示并返回选单
    if (state.queue.length === 0){
      const u = state.data.units.find(x => x.id === state.unitId);
      if (!u || !u.words?.length){
        toast('该单元没有单词'); show('#unit-picker'); return;
      }
      toast('本单元完成');
      const all = (state.shuffle ? shuffle([...u.words]) : [...u.words]);
      state.queue = all.filter(w => !state.knownSet.has(w.w));
      if (state.queue.length === 0){
        // 都掌握了：允许继续复习整单元
        state.queue = all.slice();
      }
      if (state.queue.length === 0){
        show('#unit-picker'); return;
      }
    }

    state.current = state.queue[0];
    const cur = state.current || { w:'', def:'' };
    if (el.word) el.word.textContent = cur.w || '';
    if (el.def) {
      const meaning = cur.def ?? cur.definition ?? '';
      el.def.textContent = meaning || '(此词未提供释义 / definition)';
      el.def.classList.add('hidden');  // 进题默认隐藏释义
    }
  }

  // 点击答案：先显示释义 → 停顿 → 跳题
  function revealThenProceed(known){
    if (!state.current) return;

    if (el.def) el.def.classList.remove('hidden');

    setTimeout(() => {
      const cur = state.current;
      state.queue.shift();
      if (known){
        state.knownSet.add(cur.w);
        persistKnown();
      } else {
        state.queue.push(cur);
      }
      updateProgress();
      nextCard();
    }, 260);
  }

  function persistKnown(){
    const progress = store.get('progress', {});
    const unit = progress[state.unitId] ?? { known: [] };
    unit.known = Array.from(state.knownSet);
    unit.knownCount = unit.known.length;
    progress[state.unitId] = unit;
    store.set('progress', progress);
  }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 事件绑定
  if (el.btnEnter) el.btnEnter.addEventListener('click', () => {
    if (!ensureData()){
      toast('请先导入词库或使用示例');
    } else {
      show('#unit-picker'); buildUnits();
    }
  });

  if (el.fileInput) el.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      let data;
      if (file.name.endsWith('.json')){
        data = JSON.parse(text);
      } else {
        data = csvToData(text);
      }
      data = normalizeData(data);   // ★ 导入后统一字段 & id
      validateData(data);
      store.set('words-data', data);
      state.data = data;
      toast('词库已导入');
      show('#unit-picker'); buildUnits();
    } catch (err){
      console.error(err);
      toast('文件格式有误');
    }
  });

  // CSV 解析（unit_id 允许带文字，会自动提取数字）
  function csvToData(csv){
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0].split(',').map(s => s.trim());
    const uIdx = header.findIndex(h => /unit[_ ]?id/i.test(h));
    const wIdx = header.findIndex(h => /^(w|word|term)$/i.test(h));
    const dIdx = header.findIndex(h => /^(def|definition|meaning)$/i.test(h));
    if (uIdx === -1 || wIdx === -1 || dIdx === -1) throw new Error('bad header');
    const map = new Map();
    for (let i = 1; i < lines.length; i++){
      const parts = parseCSVLine(lines[i], header.length);
      if (!parts) continue;
      const id = toUnitId(parts[uIdx], i-1);
      const w = parts[wIdx];
      const def = parts[dIdx];
      if (!map.has(id)) map.set(id, { id, title: `Sentence ${String(id).padStart(2,'0')}`, words: [] });
      map.get(id).words.push({ w, def });
    }
    const units = Array.from(map.keys()).sort((a,b)=>a-b).map(k => map.get(k));
    return { units };
  }
  function parseCSVLine(line, cols){
    const out = [];
    let cur = '', inQ = false;
    for (let i=0; i<line.length; i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ){
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    if (out.length !== cols) return null;
    return out.map(s => s.trim());
  }

  function validateData(data){
    if (!data || !Array.isArray(data.units)) throw new Error('no units');
    data.units.forEach(u => {
      if (typeof u.id !== 'number' || !Number.isFinite(u.id)) throw new Error('bad unit id');
      if (!Array.isArray(u.words)) throw new Error('bad unit words');
      u.words.forEach(w => { if (!w.w) throw new Error('bad word'); });
    });
  }

  // 控件事件
  if (el.btnKnown) el.btnKnown.addEventListener('click', () => revealThenProceed(true));
  if (el.btnUnknown) el.btnUnknown.addEventListener('click', () => revealThenProceed(false));
  if (el.card) el.card.addEventListener('click', () => { if (el.def) el.def.classList.toggle('hidden'); });

  if (el.btnBack) el.btnBack.addEventListener('click', () => { show('#unit-picker'); buildUnits(); });
  if (el.btnReset) el.btnReset.addEventListener('click', () => {
    const progress = store.get('progress', {});
    delete progress[state.unitId];
    store.set('progress', progress);
    state.knownSet = new Set();
    toast('已重置本单元');
    startUnit(state.unitId);
  });

  if (el.btnSettings) el.btnSettings.addEventListener('click', () => show('#settings'));
  if (el.btnCloseSettings) el.btnCloseSettings.addEventListener('click', () => { show('#unit-picker'); });
  if (el.revealMode) el.revealMode.addEventListener('change', (e) => { state.revealMode = e.target.value; store.set('reveal-mode', state.revealMode); });
  if (el.shuffle) el.shuffle.addEventListener('change', (e) => { state.shuffle = e.target.checked; store.set('shuffle', state.shuffle); });
  if (el.big) el.big.addEventListener('change', (e) => { state.bigFont = e.target.checked; document.body.classList.toggle('big', state.bigFont); store.set('big-font', state.bigFont); });

  if (el.btnClearData) el.btnClearData.addEventListener('click', () => {
    if (confirm('清除全部词库与进度')){
      store.remove('words-data'); store.remove('progress');
      toast('已清除');
      show('#loader');
    }
  });

  if (el.btnExport) el.btnExport.addEventListener('click', () => {
    const data = store.get('progress', {});
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'progress.json';
    a.click();
  });
  if (el.btnImportProgress) el.btnImportProgress.addEventListener('click', () => el.progressFile && el.progressFile.click());
  if (el.progressFile) el.progressFile.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      store.set('progress', JSON.parse(text));
      toast('进度已导入');
      buildUnits();
    } catch {
      toast('进度文件格式有误');
    }
  });

  // 首屏
  if (ensureData()){ show('#unit-picker'); buildUnits(); } else { show('#loader'); }
})();

