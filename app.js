(() => {
  const $ = sel => document.querySelector(sel);

  let data = null;
  let queue = [], current = null, known = new Set(), unitId = null;

  function show(id){
    document.querySelectorAll("main > section").forEach(s => s.classList.add("hidden"));
    $(id).classList.remove("hidden");
  }

  function startUnit(id){
    unitId = id;
    const u = data.units.find(x => x.id === id);
    // 随机顺序更像百词斩
    queue = shuffle([...u.words]);
    nextCard();
    show("#quiz");
  }

  function nextCard(){
    if(queue.length === 0){
      $("#word").textContent = "本单元完成 🎉";
      $("#definition").textContent = "点击“返回”可换单元，或重新导入词库";
      $("#definition").classList.remove("hidden");
      $("#progress").textContent = "";
      return;
    }
    current = queue[0];
    $("#word").textContent = current.w;
    $("#definition").textContent = current.def || "";
    $("#definition").classList.add("hidden");       // 默认先不显示
    $("#progress").textContent = `剩余 ${queue.length}`;
  }

  // 统一处理：先显示释义，再延时进入下一步
  function revealThenProceed(action){
    // 先展示释义（如果还没展示）
    $("#definition").classList.remove("hidden");

    // 200~300ms 的微停顿，用户能看见释义弹出
    setTimeout(() => {
      if(action === "known"){
        known.add(current.w);
        queue.shift();                 // 本轮移除
      }else{
        // 放回队列末尾，稍后再考
        queue.push(queue.shift());
      }
      nextCard();
    }, 240);
  }

  $("#btn-known").onclick = () => revealThenProceed("known");
  $("#btn-unknown").onclick = () => revealThenProceed("unknown");

  // 点卡片也可手动开/关释义
  $("#card").onclick = () => $("#definition").classList.toggle("hidden");
  $("#btn-back").onclick = () => show("#unit-picker");

  $("#btn-enter").onclick = () => {
    if(data){ buildUnits(); show("#unit-picker"); }
    else alert("请先导入词库（JSON/CSV）");
  };

  $("#file-input").onchange = async e => {
    const file = e.target.files[0]; if(!file) return;
    const text = await file.text();
    if(file.name.endsWith(".json")){
      data = JSON.parse(text);
    }else{
      // 简化版只演示 JSON；需要 CSV 可再发我，我给你加解析
      alert("当前简化版仅支持 JSON 示例；要支持 CSV 我可以马上帮你加上。");
      return;
    }
    buildUnits();
    alert("词库已导入");
  };

  function buildUnits(){
    const grid = $("#unit-grid"); grid.innerHTML = "";
    (data.units || []).forEach(u => {
      const b = document.createElement("div");
      b.className = "unit";
      b.textContent = u.title ? `${u.id}` : `#${u.id}`;
      b.onclick = () => startUnit(u.id);
      grid.appendChild(b);
    });
  }

  function shuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  show("#loader");
})();
