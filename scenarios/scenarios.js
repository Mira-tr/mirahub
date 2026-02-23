// /scenarios/scenarios.js
(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec?action=list";
  const API_META = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec?action=meta";

  const LS = {
    THEME: "mirahub.theme",
    SKIP_CONFIRM: "mirahub.skipExternalConfirm",
    TAG_MODE: "mirahub.tagsMode.v1", // "or" | "and"
    COMPACT: "mirahub.compact.v1",
    SHOW_TRAILERS: "mirahub.showTrailers.v1",
    CACHE: "mirahub.cache.rows.v2",
    CACHE_AT: "mirahub.cache.at.v2",
  };

  const els = {
    status: document.getElementById("status"),
    metaRow: document.getElementById("metaRow"),
    btnReload: document.getElementById("btnReload"),
    btnResetFilters: document.getElementById("btnResetFilters"),
    themeToggle: document.getElementById("themeToggle"),
    btnScrollTop: document.getElementById("btnScrollTop"),

    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    toggleCompact: document.getElementById("toggleCompact"),
    toggleShowTrailers: document.getElementById("toggleShowTrailers"),

    filterSystem: document.getElementById("filterSystem"),
    filterFormat: document.getElementById("filterFormat"),
    filterPlayersPreset: document.getElementById("filterPlayersPreset"),
    filterTimePreset: document.getElementById("filterTimePreset"),
    filterR18: document.getElementById("filterR18"),
    filterLoss: document.getElementById("filterLoss"),

    tagsTopChips: document.getElementById("tagsTopChips"),
    tagsSearchInput: document.getElementById("tagsSearchInput"),
    tagsChips: document.getElementById("tagsChips"),
    tagsSelected: document.getElementById("tagsSelected"),
    tagsClearBtn: document.getElementById("tagsClearBtn"),
    tagsModeBtn: document.getElementById("tagsModeBtn"),
    tagsMoreBtn: document.getElementById("tagsMoreBtn"),
    tagsSearchClearBtn: document.getElementById("tagsSearchClearBtn"),
    tagModal: document.getElementById("tagModal"),

    scenarioGrid: document.getElementById("scenarioGrid"),
    tableWrap: document.getElementById("tableWrap"),
    tableBody: document.getElementById("tableBody"),
    resultInfo: document.getElementById("resultInfo"),

    btnPagePrev: document.getElementById("btnPagePrev"),
    btnPageNext: document.getElementById("btnPageNext"),
    pageInfo: document.getElementById("pageInfo"),

    detailModal: document.getElementById("detailModal"),
    detailTitle: document.getElementById("detailTitle"),
    detailSub: document.getElementById("detailSub"),
    detailBody: document.getElementById("detailBody"),

    zoomModal: document.getElementById("zoomModal"),
    zoomImage: document.getElementById("zoomImage"),

    confirmModal: document.getElementById("confirmModal"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmDontAsk: document.getElementById("confirmDontAsk"),
    confirmCancel: document.getElementById("confirmCancel"),
    confirmOk: document.getElementById("confirmOk"),

    popover: document.getElementById("popover"),
    popoverTitle: document.getElementById("popoverTitle"),
    popoverBody: document.getElementById("popoverBody"),
    popoverClose: document.getElementById("popoverClose"),
    popoverMore: document.getElementById("popoverMore"),
    helpModal: document.getElementById("helpModal"),
    helpBody: document.getElementById("helpBody"),

    toastHost: document.getElementById("toastHost"),
  };

  const state = {
    rawRows: [],
    rows: [],
    filtered: [],
    view: "cards",

    selectedTags: new Set(),
    tagsMode: "or",

    compact: false,
    trailersEnabled: true,

    pendingOpenUrl: null,
    pendingOpenIsR18: false,

    activeId: null,
    trailerIndex: 0,
    trailerList: [],

    // pagination
    page: 0,
    pageSizeCards: 15,
    pageSizeTable: 30,
    pages: 1,

    // tags
    tagsFreq: new Map(),
    allTags: [],
    topTags: [],
  };

  function norm(v){ return String(v ?? "").trim(); }
  function lower(v){ return norm(v).toLowerCase(); }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }
  function nowLocal(){ return new Date().toLocaleString(); }

  function lsGet(key, fallback=null){
    try{ const v = localStorage.getItem(key); return v===null ? fallback : v; }catch{ return fallback; }
  }
  function lsSet(key, value){
    try{ localStorage.setItem(key, String(value)); }catch{}
  }

  function toast(msg){
    if(!els.toastHost) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = msg;
    els.toastHost.appendChild(node);
    void node.offsetWidth;
    node.classList.add("is-show");
    setTimeout(()=>{ node.classList.remove("is-show"); setTimeout(()=>node.remove(), 220); }, 1700);
  }

  async function copyText(text){
    const t = String(text ?? "");
    try{
      await navigator.clipboard.writeText(t);
      toast("コピーしました");
    }catch{
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("コピーしました");
    }
  }

  function safeJSONParse(text){
    let t = String(text ?? "");
    if(!t) return null;
    t = t.replace(/^\uFEFF/, "").trim();
    if(!t) return null;
    if(t.startsWith(")]}'")) t = t.slice(4).trimStart();
    if(t[0] !== "{" && t[0] !== "[") return null;
    try{ return JSON.parse(t); }catch{ return null; }
  }

  function withTimeout(fn, ms){
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), ms);
    return (async()=>{
      try{ return await fn(ctrl.signal); }
      finally{ clearTimeout(timer); }
    })();
  }

  async function safeFetchText(url, ms=25000){
    return withTimeout(async(signal) => {
      const res = await fetch(url, { cache:"no-store", signal });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    }, ms);
  }

  function extractRows(data){
    if(!data) return [];
    if(Array.isArray(data)) return data;
    const cands = ["rows","items","data","list","result"];
    for(const k of cands){
      if(Array.isArray(data[k])) return data[k];
    }
    return [];
  }

  /* -------- domain -------- */

  function normalizeR18(raw){
    const s = lower(raw);
    if(!s) return "unknown";
    if(["none","soft","mix","hard","unknown"].includes(s)) return s;
    if(["なし","全年齢","健全","no","false","0"].includes(s)) return "none";
    if(["不明","?","unknown","未確認"].includes(s)) return "unknown";
    if(["あり","r18","18+","18","adult","nsfw","🔞","true","1","yes"].includes(s)) return "soft";
    if(s.includes("hard")) return "hard";
    if(s.includes("mix")) return "mix";
    if(s.includes("soft")) return "soft";
    return "unknown";
  }
  function r18Label(key){
    if(key==="none") return "なし";
    if(key==="soft") return "あり";
    if(key==="mix") return "あり";
    if(key==="hard") return "あり";
    return "不明";
  }
  function isR18Key(key){ return ["soft","mix","hard"].includes(key); }

  function clampInt(n, min, max){
    if(!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeLoss(raw){
    const s = norm(raw);
    if(!s || s==="不明" || lower(s)==="unknown") return { key:"unknown", min:null, max:null };

    const t = s.replace(/[％%]/g,"").replace(/[〜~–—]/g,"-").replace(/\s+/g,"");
    const m = t.match(/(\d{1,3})-(\d{1,3})/);
    if(m){
      const a = clampInt(parseInt(m[1],10),0,100);
      const b = clampInt(parseInt(m[2],10),0,100);
      const min = Math.min(a,b);
      const max = Math.max(a,b);
      return { key:`${min}-${max}`, min, max };
    }

    // single number like 80
    const one = t.match(/^(\d{1,3})$/);
    if(one){
      const v = clampInt(parseInt(one[1],10),0,100);
      if(v<=10) return { key:"0-10", min:0, max:10 };
      if(v<=30) return { key:"10-30", min:10, max:30 };
      if(v<=50) return { key:"30-50", min:30, max:50 };
      if(v<=70) return { key:"50-70", min:50, max:70 };
      return { key:"70-100", min:70, max:100 };
    }

    return { key:"unknown", min:null, max:null };
  }

  function lossClassFromKey(key){
    if(!key || key==="unknown") return "";
    const m = String(key).match(/(\d+)-(\d+)/);
    if(!m) return "";
    const avg = (parseInt(m[1],10)+parseInt(m[2],10))/2;
    if(avg<=30) return "loss-low";
    if(avg<=50) return "loss-mid";
    if(avg<=70) return "loss-high";
    return "loss-very";
  }

  function parseTimeRangeToMinutes(raw){
    const original = norm(raw);
    if(!original) return { min:null, max:null };
    let s = original.replace(/　/g," ").replace(/[〜~–—]/g,"-").replace(/\s+/g,"");
    s = s.replace(/ボイセ|テキセ|どちらでも|kpレス|KPレス/gi,"");
    const parts = s.split("-").filter(Boolean);
    if(parts.length===0) return { min:null, max:null };
    const vals = parts.map(parseSingleDurationToMinutes).filter(v=>v!==null);
    if(vals.length===0) return { min:null, max:null };
    if(vals.length===1) return { min:vals[0], max:vals[0] };
    return { min:Math.min(...vals), max:Math.max(...vals) };
  }
  function parseSingleDurationToMinutes(token){
    const t = String(token ?? "").toLowerCase();
    if(!t) return null;
    let m = t.match(/(\d+(?:\.\d+)?)\s*(m|min|分)/);
    if(m) return Math.round(parseFloat(m[1]));
    m = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|時間)/);
    if(m) return Math.round(parseFloat(m[1])*60);
    return null;
  }

  function parsePlayers(raw){
    const original = norm(raw);
    if(!original) return { min:null, max:null };
    const s = original.replace(/[〜~–—]/g,"-").replace(/\s+/g,"");

    let m = s.match(/(\d+)\D*-\D*(\d+)/);
    if(m){
      const a = parseInt(m[1],10);
      const b = parseInt(m[2],10);
      return { min:Math.min(a,b), max:Math.max(a,b) };
    }
    m = s.match(/kpc\+(\d+)pl/i);
    if(m){
      const n = parseInt(m[1],10);
      return { min:n+1, max:n+1 };
    }
    m = s.match(/(\d+)\s*pl/i);
    if(m){
      const n = parseInt(m[1],10);
      return { min:n, max:n };
    }
    if(s.includes("ソロ")) return { min:1, max:1 };
    return { min:null, max:null };
  }

  function splitTags(raw){
    const s = norm(raw);
    if(!s) return [];
    return s.split(/[,\s/・]+/).map(t=>norm(t)).filter(Boolean).map(t => t.startsWith("#") ? t : `#${t}`);
  }
  function splitTrailerUrls(raw){
    const s = norm(raw);
    if(!s) return [];
    return s.split(/\r?\n/).map(x=>norm(x)).filter(Boolean).filter(u=>/^https?:\/\//i.test(u));
  }

  function normalizeRow(input){
    const r = {};
    for(const k of Object.keys(input || {})) r[String(k).toLowerCase()] = input[k];

    const loss = normalizeLoss(r.loss_rate);
    const r18Key = normalizeR18(r.r18);

    const timeRange = parseTimeRangeToMinutes(r.time);
    const playersRange = parsePlayers(r.players);

    return {
      id: norm(r.id).replace(/^#/, ""),
      name: norm(r.name),
      system: norm(r.system),
      author: norm(r.author),
      players: norm(r.players),
      format: norm(r.format),
      time: norm(r.time),

      r18Key,
      lossKey: loss.key,

      timeMin: timeRange.min,
      timeMax: timeRange.max,
      playersMin: playersRange.min,
      playersMax: playersRange.max,

      tags: splitTags(r.tags),
      memo: norm(r.memo),
      url: norm(r.url),
      trailers: splitTrailerUrls(r.trailer_urls || r.trailer_url),
      fav: Number(r.fav || 0) || 0,
      updatedAt: norm(r.updated_at || r.updatedat || r.updated || r.updatedtime || r.updated_time),
    };
  }

  /* -------- tags index -------- */

  function buildTagsIndex(rows){
    const freq = new Map();
    for(const row of rows){
      for(const t of row.tags){
        const k = lower(t);
        freq.set(k, (freq.get(k) || 0) + 1);
      }
    }
    const all = Array.from(freq.entries())
      .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0],"ja"))
      .map(([k])=>k);

    state.tagsFreq = freq;
    state.allTags = all;
    state.topTags = all.slice(0, 18);
  }

  function renderTopTagChips(){
    if(!els.tagsTopChips) return;
    els.tagsTopChips.innerHTML = state.topTags.map(t=>{
      const c = state.tagsFreq.get(t) || 0;
      const selected = state.selectedTags.has(t);
      return `<button type="button" class="chip ${selected?"is-selected":""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)} ${c}</button>`;
    }).join("");
  }

  function renderTagModalChips(){
    if(!els.tagsChips) return;
    const q = lower(els.tagsSearchInput?.value || "");
    const items = state.allTags.filter(t => !q || lower(t).includes(q)).slice(0, 240);
    els.tagsChips.innerHTML = items.map(t=>{
      const c = state.tagsFreq.get(t) || 0;
      const selected = state.selectedTags.has(t);
      return `<button type="button" class="chip ${selected?"is-selected":""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)} ${c}</button>`;
    }).join("");
  }

  function renderSelectedTags(){
    if(!els.tagsSelected) return;
    const arr = Array.from(state.selectedTags);
    els.tagsSelected.innerHTML = arr.length
      ? arr.map(t=>`<button type="button" class="chip is-selected" data-tag="${escapeHtml(t)}" data-selected="1">${escapeHtml(t)} ✕</button>`).join("")
      : `<span class="text-muted">—</span>`;
  }

  /* -------- filters -------- */

  function timePresetMatch(row, preset){
    if(!preset) return true;
    if(preset==="unknown") return row.timeMin===null && row.timeMax===null;

    const v = (row.timeMax ?? row.timeMin);
    if(v===null) return false;

    if(preset==="lt120") return v < 120;
    if(preset==="120_360") return v >= 120 && v <= 360;
    if(preset==="360_720") return v > 360 && v <= 720;
    if(preset==="gt720") return v > 720;
    return true;
  }

  function playersPresetMatch(row, preset){
    if(!preset) return true;
    if(preset==="unknown") return row.playersMin===null && row.playersMax===null;

    const min = row.playersMin;
    const max = row.playersMax;
    if(preset==="solo") return min===1 && max===1;

    if(min===null && max===null) return false;
    const vMin = min ?? max;
    const vMax = max ?? min;

    if(preset==="2_3") return vMin >= 2 && vMax <= 3;
    if(preset==="4_5") return vMin >= 4 && vMax <= 5;
    if(preset==="6_8") return vMin >= 6 && vMax <= 8;
    if(preset==="gt8") return (vMax ?? 0) >= 9;
    return true;
  }

  function r18Match(row, filterVal){
    if(!filterVal) return true;
    if(filterVal==="none") return row.r18Key==="none";
    if(filterVal==="unknown") return row.r18Key==="unknown";
    if(filterVal==="any") return isR18Key(row.r18Key);
    return true;
  }

  function lossMatch(row, filterVal){
    if(!filterVal) return true;
    if(filterVal==="unknown") return row.lossKey==="unknown";
    return row.lossKey === filterVal;
  }

  function tagsMatch(row){
    if(state.selectedTags.size===0) return true;
    const rowTags = new Set(row.tags.map(lower));

    if(state.tagsMode==="and"){
      for(const t of state.selectedTags){
        if(!rowTags.has(lower(t))) return false;
      }
      return true;
    }

    for(const t of state.selectedTags){
      if(rowTags.has(lower(t))) return true;
    }
    return false;
  }

  function searchMatch(row, q){
    const query = norm(q);
    if(!query) return true;

    const tokens = query.split(/\s+/).filter(Boolean).map(lower);

    const hay = lower([
      row.id, row.name, row.system, row.author,
      row.players, row.format, row.time,
      row.r18Key, row.lossKey,
      row.tags.join(" "),
      row.memo
    ].join(" / "));

    return tokens.every(t => hay.includes(t));
  }

  function parseIdNumber(id){
    const m = String(id || "").match(/(\d+)/);
    if(!m) return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : 0;
  }

  function applySort(list){
    const key = norm(els.sortSelect?.value || "id_desc");
    const byName = (a,b)=>a.name.localeCompare(b.name,"ja");
    const byId = (a,b)=>parseIdNumber(a.id)-parseIdNumber(b.id);
    const byUpdated = (a,b)=>{
      const ta = Date.parse(a.updatedAt || "") || 0;
      const tb = Date.parse(b.updatedAt || "") || 0;
      if(ta===tb) return byId(a,b);
      return ta - tb;
    };

    const cmp = {
      id_asc: byId,
      id_desc: (a,b)=>-byId(a,b),
      name_asc: byName,
      name_desc: (a,b)=>-byName(a,b),
      updated_asc: byUpdated,
      updated_desc: (a,b)=>-byUpdated(a,b),
    }[key] || ((a,b)=>-byId(a,b));

    list.sort(cmp);
  }

  function applyFilters(){
    const q = els.searchInput?.value || "";
    const system = norm(els.filterSystem?.value);
    const format = norm(els.filterFormat?.value);
    const playersPreset = norm(els.filterPlayersPreset?.value);
    const timePreset = norm(els.filterTimePreset?.value);
    const r18 = norm(els.filterR18?.value);
    const loss = norm(els.filterLoss?.value);

    const out = state.rows.filter(row=>{
      if(system && row.system !== system) return false;
      if(format && row.format !== format) return false;
      if(!playersPresetMatch(row, playersPreset)) return false;
      if(!timePresetMatch(row, timePreset)) return false;
      if(!r18Match(row, r18)) return false;
      if(!lossMatch(row, loss)) return false;
      if(!tagsMatch(row)) return false;
      if(!searchMatch(row, q)) return false;
      return true;
    });

    applySort(out);
    state.filtered = out;
  }

  /* -------- pagination -------- */

  function pageSize(){
    return state.view === "table" ? state.pageSizeTable : state.pageSizeCards;
  }

  function ensurePageInRange(){
    state.pages = Math.max(1, Math.ceil(state.filtered.length / pageSize()));
    state.page = Math.max(0, Math.min(state.page, state.pages - 1));
  }

  function pagedSlice(){
    ensurePageInRange();
    const start = state.page * pageSize();
    return state.filtered.slice(start, start + pageSize());
  }

  function renderPager(){
    if(!els.pageInfo) return;
    ensurePageInRange();
    const total = state.filtered.length;
    const start = total ? (state.page * pageSize() + 1) : 0;
    const end = Math.min(total, state.page * pageSize() + pageSize());
    els.pageInfo.textContent = total ? `表示: ${start}–${end} / ${total}` : "—";
    if(els.btnPagePrev) els.btnPagePrev.disabled = (state.page<=0);
    if(els.btnPageNext) els.btnPageNext.disabled = (state.page>=state.pages-1);
  }

  /* -------- rendering -------- */

  function buildSelectOptions(selectEl, values, placeholder="指定なし"){
    if(!selectEl) return;
    const list = Array.from(new Set(values.filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ja"));
    selectEl.innerHTML =
      `<option value="">${escapeHtml(placeholder)}</option>` +
      list.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  }

  function renderCard(r){
    const r18 = isR18Key(r.r18Key);
    const lossCls = lossClassFromKey(r.lossKey);

    const pills = [];
    if(r.system) pills.push(`<span class="sc-pill">${escapeHtml(r.system)}</span>`);
    if(r.players) pills.push(`<span class="sc-pill">${escapeHtml(r.players)}</span>`);
    if(r.format) pills.push(`<span class="sc-pill">${escapeHtml(r.format)}</span>`);
    if(r.time) pills.push(`<span class="sc-pill">${escapeHtml(r.time)}</span>`);
    pills.push(`<span class="sc-pill ${escapeHtml(lossCls)}">ロスト:${escapeHtml(r.lossKey==="unknown"?"不明":r.lossKey)}</span>`);
    if(r18) pills.push(`<span class="sc-pill sc-r18">🔞 ${escapeHtml(r18Label(r.r18Key))}</span>`);

    const tagsHtml = r.tags.slice(0,10).map(t=>(
      `<button type="button" class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    )).join("");

    const actions = [];
    if(r.url){
      actions.push(`<button type="button" class="sc-icon" data-action="open-url" data-url="${escapeHtml(r.url)}" data-r18="${r18?"1":"0"}" aria-label="外部リンク">🔗</button>`);
      actions.push(`<button type="button" class="sc-icon" data-action="copy-url" data-url="${escapeHtml(r.url)}" aria-label="URLコピー">📋</button>`);
    }

    return `
      <article class="sc-card" data-action="open-detail" data-id="${escapeHtml(r.id)}">
        ${r.id ? `<div class="sc-id">${escapeHtml(r.id)}</div>` : ""}
        <div class="sc-title">${escapeHtml(r.name || "(no title)")}</div>
        <div class="sc-pillRow">${pills.join("")}</div>
        ${tagsHtml ? `<div class="sc-pillRow" style="margin-top:8px;">${tagsHtml}</div>` : ""}
        ${(!state.compact && r.memo) ? `<div class="sc-note">${escapeHtml(r.memo)}</div>` : ""}
        <div class="sc-actions">${actions.join("")}</div>
      </article>
    `;
  }

  function renderTableRow(r){
    const r18 = isR18Key(r.r18Key);
    const urlCell = r.url ? `
      <button type="button" class="sc-link-btn" data-action="open-url" data-url="${escapeHtml(r.url)}" data-r18="${r18?"1":"0"}">open</button>
      <button type="button" class="sc-link-btn" data-action="copy-url" data-url="${escapeHtml(r.url)}">copy</button>
    ` : "";

    return `
      <tr data-action="open-detail" data-id="${escapeHtml(r.id)}">
        <td>${escapeHtml(r.id)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.system)}</td>
        <td>${escapeHtml(r.players)}</td>
        <td>${escapeHtml(r.format)}</td>
        <td>${escapeHtml(r.time)}</td>
        <td>${escapeHtml(r18Label(r.r18Key))}</td>
        <td>${escapeHtml(r.lossKey==="unknown"?"不明":r.lossKey)}</td>
        <td>${urlCell}</td>
      </tr>
    `;
  }

  function render(){
    applyFilters();
    state.page = 0;
    renderInner();
  }

  function renderInner(){
    const slice = pagedSlice();
    if(els.resultInfo){
      els.resultInfo.textContent = `表示: ${state.filtered.length} 件 / 全体: ${state.rows.length} 件`;
    }
    if(els.metaRow){
      els.metaRow.textContent = `最終取得: ${nowLocal()} / 表示 ${state.filtered.length}件`;
    }

    if(state.view==="cards"){
      if(els.scenarioGrid) els.scenarioGrid.innerHTML = slice.map(renderCard).join("");
      if(els.tableWrap) els.tableWrap.style.display = "none";
      if(els.tableBody) els.tableBody.innerHTML = "";
    }else{
      if(els.tableBody) els.tableBody.innerHTML = slice.map(renderTableRow).join("");
      if(els.tableWrap) els.tableWrap.style.display = "";
      if(els.scenarioGrid) els.scenarioGrid.innerHTML = "";
    }

    renderPager();
  }

  /* -------- modals -------- */

  function openModal(modalEl){
    if(!modalEl) return;
    modalEl.classList.add("is-show");
    modalEl.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";

    const panel = modalEl.querySelector(".modal-panel");
    if(panel){
      panel.setAttribute("tabindex","-1");
      panel.focus({ preventScroll:true });
    }
  }

  function closeModal(modalEl){
    if(!modalEl) return;
    modalEl.classList.remove("is-show");
    modalEl.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  function openZoom(src){
    if(!els.zoomModal || !els.zoomImage) return;
    els.zoomImage.src = src;
    openModal(els.zoomModal);
  }

  function initModalCloseHandlers(){
    document.addEventListener("click", (e)=>{
      const closeTarget = e.target.closest("[data-close]");
      if(!closeTarget) return;

      const modal = e.target.closest(".modal") || e.target.closest(".confirm");
      if(!modal) return;

      if(modal.classList.contains("modal")) closeModal(modal);
      else closeConfirm();
    });

    window.addEventListener("keydown", (e)=>{
      if(e.key!=="Escape") return;
      if(els.zoomModal?.classList.contains("is-show")) closeModal(els.zoomModal);
      else if(els.detailModal?.classList.contains("is-show")) closeModal(els.detailModal);
      else if(els.confirmModal?.classList.contains("is-show")) closeConfirm();
      else if(els.tagModal?.classList.contains("is-show")) closeModal(els.tagModal);
      else if(els.helpModal?.classList.contains("is-show")) closeModal(els.helpModal);
      else if(els.popover?.classList.contains("is-show")) popoverClose();
    });
  }

  /* -------- confirm -------- */

  function shouldSkipConfirm(){ return lsGet(LS.SKIP_CONFIRM, "0") === "1"; }
  function setSkipConfirm(v){ lsSet(LS.SKIP_CONFIRM, v ? "1" : "0"); }

  function openConfirm(url, isR18){
    state.pendingOpenUrl = url;
    state.pendingOpenIsR18 = !!isR18;

    if(!state.pendingOpenIsR18 && shouldSkipConfirm()){
      window.open(url, "_blank", "noopener,noreferrer");
      state.pendingOpenUrl = null;
      state.pendingOpenIsR18 = false;
      return;
    }

    if(!els.confirmModal || !els.confirmMessage || !els.confirmOk || !els.confirmCancel || !els.confirmDontAsk){
      const ok = window.confirm(state.pendingOpenIsR18
        ? "【R18注意】外部サイトへ移動しますか？"
        : "外部サイトへ移動しますか？");
      if(ok) window.open(url, "_blank", "noopener,noreferrer");
      state.pendingOpenUrl = null;
      state.pendingOpenIsR18 = false;
      return;
    }

    if(els.confirmTitle) els.confirmTitle.textContent = "確認";

    if(state.pendingOpenIsR18){
      els.confirmMessage.innerHTML = "⚠️ <b>R18（成人向け）に関連するリンクです。</b><br>外部サイトへ移動しますか？";
      els.confirmDontAsk.checked = false;
      els.confirmDontAsk.disabled = true;
      els.confirmDontAsk.parentElement.style.opacity = "0.5";
    }else{
      els.confirmMessage.textContent = "外部サイトへ移動しますか？";
      els.confirmDontAsk.disabled = false;
      els.confirmDontAsk.parentElement.style.opacity = "1";
      els.confirmDontAsk.checked = shouldSkipConfirm();
    }

    els.confirmModal.classList.add("is-show");
    els.confirmModal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  }

  function closeConfirm(){
    if(!els.confirmModal) return;
    els.confirmModal.classList.remove("is-show");
    els.confirmModal.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
    state.pendingOpenUrl = null;
    state.pendingOpenIsR18 = false;
  }

  function bindConfirmButtons(){
    els.confirmOk?.addEventListener("click", ()=>{
      const url = state.pendingOpenUrl;
      if(!url) return closeConfirm();
      if(!state.pendingOpenIsR18 && els.confirmDontAsk){
        setSkipConfirm(!!els.confirmDontAsk.checked);
      }
      window.open(url, "_blank", "noopener,noreferrer");
      closeConfirm();
    });
    els.confirmCancel?.addEventListener("click", closeConfirm);
  }

  /* -------- detail + trailer -------- */

  function findById(id){ return state.rows.find(r=>r.id===id) || null; }

  function buildTrailerBlock(trailers){
    if(!state.trailersEnabled){
      return `
        <div class="detail-block" style="grid-column: 1 / -1;">
          <h3>トレーラー</h3>
          <div class="detail-val"><span class="text-muted">非表示</span></div>
        </div>
      `;
    }

    if(!trailers || trailers.length===0){
      return `
        <div class="detail-block" style="grid-column: 1 / -1;">
          <h3>トレーラー</h3>
          <div class="detail-val"><span class="text-muted">なし</span></div>
        </div>
      `;
    }

    return `
      <div class="detail-block" style="grid-column: 1 / -1;">
        <h3>トレーラー</h3>
        <div class="detail-val trailer">
          <div class="trailer-viewport" id="trailerViewport">
            <img id="trailerImg" alt="trailer">
            <div class="trailer-nav">
              <button type="button" class="trailer-btn" id="trailerPrev" aria-label="前へ">‹</button>
              <button type="button" class="trailer-btn" id="trailerNext" aria-label="次へ">›</button>
            </div>
          </div>
          <div class="trailer-dots" id="trailerDots"></div>
        </div>
      </div>
    `;
  }

  function openDetail(id){
    const row = findById(id);
    if(!row || !els.detailModal || !els.detailBody) return;

    state.activeId = id;

    const r18 = isR18Key(row.r18Key);
    const lossCls = lossClassFromKey(row.lossKey);

    if(els.detailTitle) els.detailTitle.textContent = row.name || "詳細";
    if(els.detailSub) els.detailSub.textContent = `${row.id}${row.author ? ` ・作者: ${row.author}` : ""}`;

    const tagsHtml = row.tags.length
      ? row.tags.map(t=>`<button type="button" class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")
      : `<span class="text-muted">なし</span>`;

    const urlHtml = row.url ? `
      <div class="detail-actions">
        <button type="button" class="sc-icon" data-action="open-url" data-url="${escapeHtml(row.url)}" data-r18="${r18?"1":"0"}" aria-label="外部リンク">🔗</button>
        <button type="button" class="sc-icon" data-action="copy-url" data-url="${escapeHtml(row.url)}" aria-label="URLコピー">📋</button>
      </div>
    ` : `<span class="text-muted">URLなし</span>`;

    const trailerBlock = buildTrailerBlock(row.trailers);

    els.detailBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-block">
          <h3>基本</h3>
          <div class="detail-val">
            ${row.system ? `<div>System: <strong>${escapeHtml(row.system)}</strong></div>` : ""}
            ${row.format ? `<div>形式: <strong>${escapeHtml(row.format)}</strong></div>` : ""}
            ${row.players ? `<div>人数: <strong>${escapeHtml(row.players)}</strong></div>` : ""}
            ${row.time ? `<div>時間: <strong>${escapeHtml(row.time)}</strong></div>` : ""}
          </div>
        </div>

        <div class="detail-block">
          <h3>危険度</h3>
          <div class="detail-val">
            <div>R18:
              <strong class="${r18 ? "sc-r18" : ""}" style="padding:2px 8px;border-radius:999px;border:1px solid var(--line);display:inline-block;">
                ${escapeHtml(r18Label(row.r18Key))}
              </strong>
            </div>
            <div style="margin-top:6px;">ロスト率:
              <strong class="${escapeHtml(lossCls)}" style="padding:2px 8px;border-radius:999px;border:1px solid var(--line);display:inline-block;">
                ${escapeHtml(row.lossKey==="unknown" ? "不明" : row.lossKey)}
              </strong>
            </div>
          </div>
        </div>

        <div class="detail-block">
          <h3>タグ</h3>
          <div class="detail-val">${tagsHtml}</div>
        </div>

        <div class="detail-block">
          <h3>URL</h3>
          <div class="detail-val">${urlHtml}</div>
        </div>

        <div class="detail-block" style="grid-column: 1 / -1;">
          <h3>メモ</h3>
          <div class="detail-val detail-memo">${row.memo ? escapeHtml(row.memo) : "—"}</div>
        </div>

        ${trailerBlock}
      </div>
    `;

    openModal(els.detailModal);

    // init trailer state
    state.trailerList = (row.trailers || []).slice();
    state.trailerIndex = 0;
    renderTrailer();
  }

  function renderTrailer(){
    const img = document.getElementById("trailerImg");
    const dots = document.getElementById("trailerDots");
    const prev = document.getElementById("trailerPrev");
    const next = document.getElementById("trailerNext");
    const viewport = document.getElementById("trailerViewport");

    const list = state.trailerList;
    if(!img || !dots || !viewport || !list || list.length===0) return;

    const idx = clampInt(state.trailerIndex, 0, list.length - 1);
    state.trailerIndex = idx;

    img.src = list[idx];
    img.dataset.src = list[idx];

    dots.innerHTML = list.map((_, i)=>(
      `<button type="button" class="trailer-dot ${i===idx?"is-active":""}" data-index="${i}" aria-label="画像 ${i+1}"></button>`
    )).join("");

    const showNav = list.length > 1;
    if(prev) prev.style.display = showNav ? "" : "none";
    if(next) next.style.display = showNav ? "" : "none";

    if(!viewport.dataset.bound){
      viewport.dataset.bound = "1";

      prev?.addEventListener("click", (e)=>{
        e.stopPropagation();
        state.trailerIndex = (state.trailerIndex - 1 + state.trailerList.length) % state.trailerList.length;
        renderTrailer();
      });
      next?.addEventListener("click", (e)=>{
        e.stopPropagation();
        state.trailerIndex = (state.trailerIndex + 1) % state.trailerList.length;
        renderTrailer();
      });

      dots.addEventListener("click", (e)=>{
        const dot = e.target.closest(".trailer-dot");
        if(!dot) return;
        const i = parseInt(dot.dataset.index, 10);
        if(Number.isFinite(i)){
          state.trailerIndex = i;
          renderTrailer();
        }
      });

      img.addEventListener("click", ()=>{
        if(img.dataset.src) openZoom(img.dataset.src);
      });

      // swipe
      let startX = null;
      viewport.addEventListener("pointerdown", (e)=>{
        startX = e.clientX;
        viewport.setPointerCapture?.(e.pointerId);
      });
      viewport.addEventListener("pointerup", (e)=>{
        if(startX===null) return;
        const dx = e.clientX - startX;
        startX = null;
        if(Math.abs(dx) < 40) return;

        if(dx < 0) state.trailerIndex = (state.trailerIndex + 1) % state.trailerList.length;
        else state.trailerIndex = (state.trailerIndex - 1 + state.trailerList.length) % state.trailerList.length;

        renderTrailer();
      });
    }
  }

  /* -------- view/prefs -------- */

  function setView(view){
    state.view = view;
    document.querySelectorAll(".sc-tab").forEach(t=>{
      t.classList.toggle("is-active", t.dataset.view === view);
    });
    if(view==="cards"){
      if(els.tableWrap) els.tableWrap.style.display = "none";
    }else{
      if(els.tableWrap) els.tableWrap.style.display = "";
    }
    state.page = 0;
    renderInner();
  }

  function applyUiPrefsToDom(){
    document.body.classList.toggle("is-compact", !!state.compact);
    if(els.toggleCompact) els.toggleCompact.checked = !!state.compact;
    if(els.toggleShowTrailers) els.toggleShowTrailers.checked = !!state.trailersEnabled;
    if(els.tagsModeBtn) els.tagsModeBtn.textContent = `条件：${state.tagsMode.toUpperCase()}`;
  }

  function loadUiPrefs(){
    state.tagsMode = (lsGet(LS.TAG_MODE, "or")==="and") ? "and" : "or";
    state.compact = lsGet(LS.COMPACT, "0")==="1";
    state.trailersEnabled = lsGet(LS.SHOW_TRAILERS, "1")!=="0";
    applyUiPrefsToDom();
  }
  function saveUiPrefs(){
    lsSet(LS.TAG_MODE, state.tagsMode);
    lsSet(LS.COMPACT, state.compact ? "1" : "0");
    lsSet(LS.SHOW_TRAILERS, state.trailersEnabled ? "1" : "0");
  }

  /* -------- data load (cache + remote) -------- */

  function cacheSave(rows){
    try{
      lsSet(LS.CACHE, JSON.stringify({ ok:true, rows }));
      lsSet(LS.CACHE_AT, String(Date.now()));
    }catch{}
  }
  function cacheLoad(){
    try{
      const raw = lsGet(LS.CACHE, "");
      const at = Number(lsGet(LS.CACHE_AT, "0")) || 0;
      const data = safeJSONParse(raw);
      const rows = extractRows(data) || (data?.rows && Array.isArray(data.rows) ? data.rows : []);
      if(!Array.isArray(rows) || rows.length===0) return { rows:[], at:0 };
      return { rows, at };
    }catch{
      return { rows:[], at:0 };
    }
  }

  function setStatus(msg){
    if(els.status) els.status.textContent = msg;
  }

  async function loadRemoteRows(){
    const first = await safeFetchText(API_URL, 25000);
    if(!first.ok) throw new Error(`HTTP ${first.status}`);
    const parsed = safeJSONParse(first.text);
    if(!parsed) throw new Error("NON_JSON");
    const okFlag = (parsed && typeof parsed === "object" && "ok" in parsed) ? !!parsed.ok : true;
    const rowsRaw = extractRows(parsed);
    if(!okFlag && rowsRaw.length===0) throw new Error("API_OK_FALSE");
    return rowsRaw;
  }

  async function loadMeta(){
    const m = await safeFetchText(API_META, 20000);
    if(!m.ok) return null;
    const parsed = safeJSONParse(m.text);
    if(!parsed || parsed.ok===false) return null;
    return parsed.meta || null;
  }

  async function loadData(isReload=false){
    setStatus("取得中…");

    // show cache first
    const cache = cacheLoad();
    if(cache.rows.length){
      state.rawRows = cache.rows;
      state.rows = state.rawRows.map(normalizeRow);
      buildSelectOptions(els.filterSystem, state.rows.map(r=>r.system), "指定なし");
      buildSelectOptions(els.filterFormat, state.rows.map(r=>r.format), "指定なし");
      buildTagsIndex(state.rows);
      renderTopTagChips();
      renderSelectedTags();
      render();
      setStatus("キャッシュ表示");
    }

    try{
      const remote = await loadRemoteRows();
      state.rawRows = Array.isArray(remote) ? remote : [];
      state.rows = state.rawRows.map(normalizeRow);

      cacheSave(remote);

      buildSelectOptions(els.filterSystem, state.rows.map(r=>r.system), "指定なし");
      buildSelectOptions(els.filterFormat, state.rows.map(r=>r.format), "指定なし");
      buildTagsIndex(state.rows);
      renderTopTagChips();
      renderSelectedTags();

      const meta = await loadMeta();
      const latest = meta?.latest_updated_at ? new Date(meta.latest_updated_at).toLocaleString() : nowLocal();

      setStatus(`同期OK：${state.rows.length}件`);
      if(els.metaRow) els.metaRow.textContent = `最終取得: ${latest} / 表示 ${state.filtered.length}件`;
      if(isReload) toast("再取得しました");

      render();
    }catch(err){
      console.error(err);
      if(cache.rows.length){
        setStatus("同期できません（キャッシュ表示）");
        if(isReload) toast("同期できません（キャッシュ表示）");
      }else{
        setStatus("取得失敗：API URL/公開設定を確認");
        toast("取得に失敗しました");
      }
    }
  }

  /* -------- help -------- */

  const HELP = {
    scenarios: {
      title: "このページの使い方",
      body: "検索→絞り込み→詳細。タグは人気順、全タグは一覧モーダルから。",
      more: `
        <h3>導線</h3>
        <ul>
          <li>カード/表を切替</li>
          <li>詳細モーダルでURL・トレーラー</li>
          <li>タグを押すと条件に追加</li>
        </ul>
      `,
    },
    filters: {
      title: "絞り込み",
      body: "プリセットで雑に絞る→キーワードで仕上げるのが速い。",
      more: `
        <ul>
          <li>人数・時間はざっくり判定（入力揺れに強い）</li>
          <li>R18/ロストは参考情報（重要度は低め）</li>
        </ul>
      `,
    },
    tags: {
      title: "タグ",
      body: "人気タグが上。OR/AND 切替で精度調整。",
      more: `
        <ul>
          <li>OR：どれか含む</li>
          <li>AND：全部含む</li>
          <li>「タグ一覧」で検索して追加</li>
        </ul>
      `,
    },
    prefs: {
      title: "表示設定",
      body: "コンパクトはメモ非表示で密度アップ。トレーラー表示は詳細の画像欄。",
      more: `
        <ul>
          <li>コンパクト：カードを詰める（メモ省略）</li>
          <li>トレーラー：重いときはOFF</li>
        </ul>
      `,
    },
  };

  function popoverOpen(key){
    const h = HELP[key] || HELP.scenarios;
    if(!els.popover || !els.popoverBody || !els.popoverTitle) return;
    els.popoverTitle.textContent = h.title;
    els.popoverBody.textContent = h.body;
    els.popover.dataset.key = key;
    els.popover.classList.add("is-show");
    els.popover.setAttribute("aria-hidden","false");
  }
  function popoverClose(){
    if(!els.popover) return;
    els.popover.classList.remove("is-show");
    els.popover.setAttribute("aria-hidden","true");
  }
  function helpOpen(key){
    const h = HELP[key] || HELP.scenarios;
    if(!els.helpModal || !els.helpBody) return;
    els.helpBody.innerHTML = `
      <div class="prose">
        <p class="text-muted" style="margin:0 0 10px; line-height:1.8;">${h.body}</p>
        ${h.more || ""}
      </div>
    `;
    openModal(els.helpModal);
  }

  /* -------- events -------- */

  function debounce(fn, wait){
    let t = null;
    return (...args)=>{
      clearTimeout(t);
      t = setTimeout(()=>fn(...args), wait);
    };
  }

  function resetFilters(){
    if(els.searchInput) els.searchInput.value = "";
    if(els.sortSelect) els.sortSelect.value = "id_desc";
    if(els.filterSystem) els.filterSystem.value = "";
    if(els.filterFormat) els.filterFormat.value = "";
    if(els.filterPlayersPreset) els.filterPlayersPreset.value = "";
    if(els.filterTimePreset) els.filterTimePreset.value = "";
    if(els.filterR18) els.filterR18.value = "";
    if(els.filterLoss) els.filterLoss.value = "";
    state.selectedTags.clear();
    renderSelectedTags();
    renderTopTagChips();
    state.page = 0;
    render();
    toast("条件をリセット");
  }

  function bindEvents(){
    // theme
    els.themeToggle?.addEventListener("click", ()=>{
      const now = document.documentElement.getAttribute("data-theme") || "dark";
      const next = now==="light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      lsSet(LS.THEME, next);
      toast(`テーマ：${next}`);
    });

    // top actions
    els.btnReload?.addEventListener("click", ()=>loadData(true));
    els.btnResetFilters?.addEventListener("click", resetFilters);

    els.btnScrollTop?.addEventListener("click", ()=>window.scrollTo({ top: 0, behavior:"smooth" }));

    // inputs
    els.searchInput?.addEventListener("input", debounce(render, 80));
    els.sortSelect?.addEventListener("change", render);
    els.filterSystem?.addEventListener("change", render);
    els.filterFormat?.addEventListener("change", render);
    els.filterPlayersPreset?.addEventListener("change", render);
    els.filterTimePreset?.addEventListener("change", render);
    els.filterR18?.addEventListener("change", render);
    els.filterLoss?.addEventListener("change", render);

    // toggles
    els.toggleCompact?.addEventListener("change", ()=>{
      state.compact = !!els.toggleCompact.checked;
      saveUiPrefs();
      applyUiPrefsToDom();
      renderInner();
    });
    els.toggleShowTrailers?.addEventListener("change", ()=>{
      state.trailersEnabled = !!els.toggleShowTrailers.checked;
      saveUiPrefs();
      applyUiPrefsToDom();
      // no heavy rerender needed
      toast(state.trailersEnabled ? "トレーラー表示：ON" : "トレーラー表示：OFF");
    });

    // tags
    els.tagsMoreBtn?.addEventListener("click", ()=>{
      renderTagModalChips();
      openModal(els.tagModal);
      setTimeout(()=>els.tagsSearchInput?.focus?.(), 60);
    });
    els.tagsSearchClearBtn?.addEventListener("click", ()=>{
      if(els.tagsSearchInput) els.tagsSearchInput.value = "";
      renderTagModalChips();
      els.tagsSearchInput?.focus?.();
    });
    els.tagsSearchInput?.addEventListener("input", debounce(renderTagModalChips, 80));

    els.tagsClearBtn?.addEventListener("click", ()=>{
      state.selectedTags.clear();
      renderSelectedTags();
      renderTopTagChips();
      render();
      toast("タグをクリア");
    });

    els.tagsModeBtn?.addEventListener("click", ()=>{
      state.tagsMode = state.tagsMode==="or" ? "and" : "or";
      saveUiPrefs();
      applyUiPrefsToDom();
      render();
      toast(`タグ条件：${state.tagsMode.toUpperCase()}`);
    });

    // view tabs
    document.querySelectorAll(".sc-tab").forEach(btn=>{
      btn.addEventListener("click", ()=>setView(btn.dataset.view));
    });

    // pagination
    els.btnPagePrev?.addEventListener("click", ()=>{
      state.page = Math.max(0, state.page - 1);
      renderInner();
      window.scrollTo({ top: els.tableWrap?.getBoundingClientRect?.().top ? window.scrollY + els.tableWrap.getBoundingClientRect().top - 120 : 0, behavior:"smooth" });
    });
    els.btnPageNext?.addEventListener("click", ()=>{
      ensurePageInRange();
      state.page = Math.min(state.pages - 1, state.page + 1);
      renderInner();
      window.scrollTo({ top: els.tableWrap?.getBoundingClientRect?.().top ? window.scrollY + els.tableWrap.getBoundingClientRect().top - 120 : 0, behavior:"smooth" });
    });

    // delegation
    document.addEventListener("click", (e)=>{
      // help
      const helpBtn = e.target.closest("[data-help]");
      if(helpBtn){
        const key = helpBtn.getAttribute("data-help");
        if(key) popoverOpen(key);
        return;
      }

      // popover close
      if(e.target.closest("#popoverClose")){ popoverClose(); return; }
      if(e.target.closest("#popoverMore")){
        const key = els.popover?.dataset.key || "scenarios";
        popoverClose();
        helpOpen(key);
        return;
      }

      // tag click (top/selected/modal)
      const tagBtn = e.target.closest("[data-tag]");
      if(tagBtn){
        const t = tagBtn.dataset.tag;
        if(!t) return;

        if(tagBtn.dataset.selected==="1"){
          state.selectedTags.delete(lower(t));
        }else{
          const key = lower(t);
          if(state.selectedTags.has(key)) state.selectedTags.delete(key);
          else state.selectedTags.add(key);
        }

        renderSelectedTags();
        renderTopTagChips();
        renderTagModalChips();
        render();
        return;
      }

      // open detail (avoid icon buttons)
      const detailEl = e.target.closest('[data-action="open-detail"]');
      if(detailEl){
        if(e.target.closest('[data-action="open-url"], [data-action="copy-url"]')) return;
        const id = detailEl.dataset.id;
        if(id) openDetail(id);
        return;
      }

      // copy/open url (works in cards/table/detail)
      const copyBtn = e.target.closest('[data-action="copy-url"]');
      if(copyBtn){
        const url = copyBtn.dataset.url || "";
        if(url) copyText(url);
        return;
      }

      const openBtn = e.target.closest('[data-action="open-url"]');
      if(openBtn){
        const url = openBtn.dataset.url || "";
        const isR18 = openBtn.dataset.r18 === "1";
        if(url) openConfirm(url, isR18);
        return;
      }

      // close popover when click outside
      if(els.popover?.classList.contains("is-show")){
        const inside = e.target.closest(".popover-panel") || e.target.closest("[data-help]");
        if(!inside) popoverClose();
      }
    });
  }

  /* -------- boot -------- */

  function parseQueryParams(){
    const sp = new URLSearchParams(location.search);

    // id jump
    const id = sp.get("id") || sp.get("scenario") || "";
    if(id) state._openIdOnLoad = id.replace(/^#/, "");

    // q from HUB tags
    const q = sp.get("q") || "";
    if(q && els.searchInput) els.searchInput.value = q;

    // support old: id=#coc6_0001
    const id2 = sp.get("id") || "";
    if(id2 && id2.startsWith("#")) state._openIdOnLoad = id2.slice(1);
  }

  function loadUiPrefsAndApply(){
    loadUiPrefs();
    applyUiPrefsToDom();
  }

  async function boot(){
    parseQueryParams();
    loadUiPrefsAndApply();
    initModalCloseHandlers();
    bindConfirmButtons();
    bindEvents();
    setView("cards");
    await loadData(false);

    // open detail by id if provided
    if(state._openIdOnLoad){
      openDetail(state._openIdOnLoad);
    }
  }

  boot();
})();