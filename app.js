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
    // 设置（和 UI 同步）
    revealMode: 'tap',   // 'tap'（点卡片显示）；这里无论模式，点击"知道/不知道"都会先弹释义
    shuffle: true,
    bigFont: true
  };

  // 初始化设置
  state.revealMode = store.get('reveal-mode', 'tap');
  state.shuffle    = store.get('shuffle', true);
  state.bigFont    = store.get('big-font', true);

  // 应用设置到 UI（如果你的 index.html 里有这些控件）
  const elReveal = $('#reveal-mode');
  const elShuffle = $('#shuffle');
  const elBig = $('#big-font');
  if (elReveal) elReveal.value = state.revealMode;
  if (elShuffle) elShuffle.checked = state.shuffle;
  if (elBig) elBig.checked = state.bigFont;
  document.body.classList.toggle('big', state.bigFont);

  // 主要元素
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
  };

  // SW（可选）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
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
    if (saved) { state.data = saved; return true; }
    return false;
  }

  function buildUnits(){
    if (!el.unitGrid) return;
    el.unitGrid.innerHTML = '';
    if (!state.data || !state.data.units) return;
    const progress = store.get('progress', {});
    state.data.units.forEach(u => {
      const stat = progress[u.id]?.knownCount ?? 0;
      const total = u.words.length;
      const div = document.createElement('button');
      div.className = 'unit';
      div.innerHTML = `<div class="num">#${u.id}</div><div class="title">${u.title ?? ''}</div><div class="stats">${stat}/${total}</div>`;
      div.addEventListener('click', () => startUnit(u.id));
      el.unitGrid.appendChild(div);
    });
  }

  function startUnit(id){
    state.unitId = id;
    const u = state.data.units.find(x => x.id === id);
    const progress = store.get('progress', {});
    const knownArr = new Set(progress[id]?.known ?? []);
    state.knownSet = knownArr;

    // 构建本轮队列（默认只练未掌握）
    const all = u.words.map(w => ({...w}));
    if (state.shuffle) shuffle(all);
    state.queue = all.filter(w => !knownArr.has(w.w));
    if (state.queue.length === 0){
      // 都掌握了，也允许继续复习整单元
      state.queue = all.slice();
    }
    nextCard();
    updateProgress();
    show('#quiz');
  }

  function updateProgress(){
    if (!el.progress) return;
    const u = state.data.units.find(x => x.id === state.unitId);
    const total = u.words.length;
    const progress = store.get('progress', {});
    const knownCount = (progress[state.unitId]?.known ?? []).length;
    const left = state.queue.length;
    el.progress.textContent = `已掌握 ${knownCount}/${total} · 本轮剩余 ${left}`;
  }

  function nextCard(){
    if (state.queue.length === 0){
      // 本轮完成 → 重新仅保留未掌握，如果也没有，就整单元复习
      toast('本单元完成');
      const u = state.data.units.find(x => x.id === state.unitId);
      const all = u.words.map(w => ({...w}));
      if (state.shuffle) shuffle(all);
      state.queue = all.filter(w => !state.knownSet.has(w.w));
      if (state.queue.length === 0){
        state.queue = all.slice();
      }
    }
    state.current = state.queue[0];
    if (el.word) el.word.textContent = state.current?.w ?? '';
    if (el.def) {
      el.def.textContent = state.current?.def ?? '';
      // 关键：默认为“隐藏释义”，点击“知道/不知道”先展示 → 暂停 → 进入下一题
      el.def.classList.add('hidden');
    }
  }

  // 统一处理点击答案：先显示释义，再轻微停顿，最后执行逻辑
  function revealThenProceed(known){
    if (!state.current) return;

    // 先展示释义
    if (el.def) el.def.classList.remove('hidden');

    // 稍作停顿（给用户看到释义的反馈）
    setTimeout(() => {
      const cur = state.current;
      // 移出队头
      state.queue.shift();

      if (known){
        // 记录为已掌握
        state.knownSet.add(cur.w);
        persistKnown();
      } else {
        // 放回队列末尾，稍后再测
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
    for (let i = arr.length - 1; i > 0; i++){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ===== 事件绑定 =====
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
    let data;
    try {
      if (file.name.endsWith('.json')){
        data = JSON.parse(text);
      } else {
        data = csvToData(text); // 如果你还没用到 CSV，可以删除这行和函数
      }
      validateData(data);
      store.set('words-data', data);
      toast('词库已导入');
    } catch (err){
      console.error(err);
      toast('文件格式有误');
    }
  });

  // CSV 转数据（可选）
  function csvToData(csv){
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0].split(',').map(s => s.trim());
    const idxU = header.indexOf('unit_id');
    const idxW = header.indexOf('word');
    const idxD = header.indexOf('definition');
    if (idxU === -1 || idxW === -1 || idxD === -1) throw new Error('bad header');
    const map = new Map();
    for (let i = 1; i < lines.length; i++){
      const parts = parseCSVLine(lines[i], header.length);
      if (!parts) continue;
      const u = Number(parts[idxU]);
      const w = parts[idxW];
      const d = parts[idxD];
      if (!map.has(u)) map.set(u, { id: u, title: `Sentence ${String(u).padStart(2,'0')}`, words: [] });
      map.get(u).words.push({ w, def: d });
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
      if (typeof u.id !== 'number' || !Array.isArray(u.words)) throw new Error('bad unit');
      u.words.forEach(w => { if (!w.w) throw new Error('bad word'); });
    });
  }

  // 答案按钮
  if (el.btnKnown) el.btnKnown.addEventListener('click', () => revealThenProceed(true));
  if (el.btnUnknown) el.btnUnknown.addEventListener('click', () => revealThenProceed(false));

  // 点卡片可手动切换释义（配合“点卡片显示”体验）
  if (el.card) el.card.addEventListener('click', () => {
    if (el.def) el.def.classList.toggle('hidden');
  });

  if (el.btnBack) el.btnBack.addEventListener('click', () => { show('#unit-picker'); buildUnits(); });
  if (el.btnReset) el.btnReset.addEventListener('click', () => {
    const progress = store.get('progress', {});
    delete progress[state.unitId];
    store.set('progress', progress);
    state.knownSet = new Set();
    toast('已重置本单元');
    startUnit(state.unitId);
  });

  // 设置面板（如果你的 HTML 含有这些控件）
  if (el.btnSettings) el.btnSettings.addEventListener('click', () => show('#settings'));
  if (el.btnCloseSettings) el.btnCloseSettings.addEventListener('click', () => { show('#unit-picker'); });

  if (elReveal) elReveal.addEventListener('change', (e) => { state.revealMode = e.target.value; store.set('reveal-mode', state.revealMode); });
  if (elShuffle) elShuffle.addEventListener('change', (e) => { state.shuffle = e.target.checked; store.set('shuffle', state.shuffle); });
  if (elBig) elBig.addEventListener('change', (e) => { state.bigFont = e.target.checked; document.body.classList.toggle('big', state.bigFont); store.set('big-font', state.bigFont); });
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
