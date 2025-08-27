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
    queue = [...u.words];
    nextCard();
    show("#quiz");
  }

  function nextCard(){
    if(queue.length === 0){ alert("本单元完成"); return; }
    current = queue[0];
    $("#word").textContent = current.w;
    $("#definition").textContent = current.def;
    $("#definition").classList.add("hidden");
    $("#progress").textContent = `剩余 ${queue.length}`;
  }

  $("#btn-known").onclick = () => {
    known.add(current.w);
    queue.shift();
    nextCard();
  };
  $("#btn-unknown").onclick = () => {
    queue.push(queue.shift());
    nextCard();
  };
  $("#card").onclick = () => $("#definition").classList.toggle("hidden");
  $("#btn-back").onclick = () => show("#unit-picker");

  $("#btn-enter").onclick = () => {
    if(data){ buildUnits(); show("#unit-picker"); }
  };

  $("#file-input").onchange = async e => {
    const file = e.target.files[0]; if(!file) return;
    const text = await file.text();
    if(file.name.endsWith(".json")) data = JSON.parse(text);
    buildUnits(); alert("词库已导入");
  };

  function buildUnits(){
    const grid = $("#unit-grid"); grid.innerHTML = "";
    data.units.forEach(u => {
      const b = document.createElement("div");
      b.className = "unit"; b.textContent = `#${u.id}`;
      b.onclick = () => startUnit(u.id);
      grid.appendChild(b);
    });
  }

  show("#loader");
})();
