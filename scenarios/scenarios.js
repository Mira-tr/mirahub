/* scenarios.js (MIRAHUB FINAL v4 - trailer buttons + zoom FIXED by delegation) */

const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

const LS = {
  THEME: "mirahub.theme",
  SKIP_CONFIRM: "mirahub.skipExternalConfirm",
  TAG_MODE: "mirahub.tagsMode", // "or" | "and"
  COMPACT: "mirahub.compact",
  SHOW_TRAILERS: "mirahub.showTrailers",
};

const els = {
  // header/tools
  status: document.getElementById("status"),
  metaRow: document.getElementById("metaRow"),
  refreshBtn: document.getElementById("refreshBtn"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  themeToggle: document.getElementById("themeToggle"),

  // controls
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

  tagsSearchInput: document.getElementById("tagsSearchInput"),
  tagsChips: document.getElementById("tagsChips"),
  tagsSelected: document.getElementById("tagsSelected"),
  tagsClearBtn: document.getElementById("tagsClearBtn"),
  tagsModeBtn: document.getElementById("tagsModeBtn"),

  // view
  scenarioGrid: document.getElementById("scenarioGrid"),
  tableWrap: document.getElementById("tableWrap"),
  tableBody: document.getElementById("tableBody"),
  resultInfo: document.getElementById("resultInfo"),

  // modals
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

  // toast
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

  // swipe
  trailerSwipeStartX: null,
};

/* ---------------- Utils ---------------- */

function norm(v){ return String(v ?? "").trim(); }
function lower(v){ return norm(v).toLowerCase(); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function nowLocal(){ return new Date().toLocaleString(); }

function lsGet(key, fallback=null){
  try{
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  }catch{ return fallback; }
}
function lsSet(key, value){
  try{ localStorage.setItem(key, String(value)); }catch{}
}

function setStatus(msg){
  if(els.status) els.status.textContent = msg;
}

function toast(msg){
  if(!els.toastHost) return;
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = msg;
  els.toastHost.appendChild(node);
  void node.offsetWidth;
  node.classList.add("is-show");
  setTimeout(()=>{
    node.classList.remove("is-show");
    setTimeout(()=>node.remove(), 220);
  }, 1800);
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

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function clampInt(n, min, max){
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/* ---------------- Domain normalization ---------------- */

function normalizeR18(raw){
  const s = lower(raw);
  if(!s) return "unknown";
  if(["none","soft","mix","hard","unknown"].includes(s)) return s;

  if(["なし","全年齢","健全","no","false","0"].includes(s)) return "none";
  if(["不明","?", "unknown","未確認"].includes(s)) return "unknown";
  if(["あり","r18","18+","18","adult","nsfw","🔞","true","1","yes"].includes(s)) return "soft";

  if(s.includes("hard")) return "hard";
  if(s.includes("mix")) return "mix";
  if(s.includes("soft")) return "soft";

  return "unknown";
}
function r18Label(key){
  switch(key){
    case "none": return "なし";
    case "soft": return "R18（軽）";
    case "mix": return "R18（混）";
    case "hard": return "R18（重）";
    default: return "不明";
  }
}
function isR18Key(key){
  return ["soft","mix","hard"].includes(key);
}

function normalizeLoss(raw){
  const s = norm(raw);
  if(!s || s==="不明" || lower(s)==="unknown") return { key:"unknown", min:null, max:null };

  const t = s.replace(/[％%]/g,"").replace(/[〜~–—]/g,"-").replace(/\s+/g,"");
  const m = t.match(/(\d{1,3})-(\d{1,3})/);
  if(!m) return { key:s, min:null, max:null };

  const a = clampInt(parseInt(m[1],10),0,100);
  const b = clampInt(parseInt(m[2],10),0,100);
  const min = Math.min(a,b);
  const max = Math.max(a,b);
  return { key:`${min}-${max}`, min, max };
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
  return s.split(/[,\s/・]+/).map(t=>norm(t)).filter(Boolean);
}

function splitTrailerUrls(raw){
  const s = norm(raw);
  if(!s) return [];
  // 改行区切り想定（将来カンマ区切りが混ざっても拾えるようにする）
  return s
    .split(/\r?\n|,/)
    .map(x=>norm(x))
    .filter(Boolean)
    .filter(u=>/^https?:\/\//i.test(u));
}

function normalizeRow(input){
  const r = {};
  for(const k of Object.keys(input || {})){
    r[String(k).toLowerCase()] = input[k];
  }

  const loss = normalizeLoss(r.loss_rate);
  const r18Key = normalizeR18(r.r18);

  const timeRange = parseTimeRangeToMinutes(r.time);
  const playersRange = parsePlayers(r.players);

  return {
    id: norm(r.id),
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

    updatedAt: norm(r.updatedat || r.updated_at || r.updated),
  };
}

/* ---------------- Options / chips ---------------- */

function uniqSorted(arr){
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ja"));
}

function buildSelectOptions(selectEl, values, placeholder="指定なし"){
  if(!selectEl) return;
  const list = uniqSorted(values);
  selectEl.innerHTML =
    `<option value="">${escapeHtml(placeholder)}</option>` +
    list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function rebuildTagChips(){
  if(!els.tagsChips || !els.tagsSelected) return;

  const all = state._allTags || [];
  const q = lower(els.tagsSearchInput?.value || "");
  const visible = all.filter(t => !q || lower(t).includes(q)).slice(0, 90);

  els.tagsChips.innerHTML = visible.map(t=>{
    const selected = state.selectedTags.has(t);
    return `<button type="button" class="sc-pill sc-tag ${selected ? "is-selected" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  }).join("");

  els.tagsSelected.innerHTML = Array.from(state.selectedTags).map(t=>{
    return `<button type="button" class="sc-pill sc-tag is-selected" data-tag="${escapeHtml(t)}" data-selected="1">${escapeHtml(t)} ✕</button>`;
  }).join("");
}

/* ---------------- Filtering ---------------- */

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
  const rowTags = new Set(row.tags);

  if(state.tagsMode==="and"){
    for(const t of state.selectedTags){
      if(!rowTags.has(t)) return false;
    }
    return true;
  }

  for(const t of state.selectedTags){
    if(rowTags.has(t)) return true;
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

function applySort(){
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

  state.filtered.sort(cmp);
}

function applyFilters(){
  const q = els.searchInput?.value || "";
  const system = norm(els.filterSystem?.value);
  const format = norm(els.filterFormat?.value);
  const playersPreset = norm(els.filterPlayersPreset?.value);
  const timePreset = norm(els.filterTimePreset?.value);
  const r18 = norm(els.filterR18?.value);
  const loss = norm(els.filterLoss?.value);

  state.filtered = state.rows.filter(row=>{
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

  applySort();
}

/* ---------------- Rendering ---------------- */

function render(){
  applyFilters();

  if(els.resultInfo){
    els.resultInfo.textContent = `表示: ${state.filtered.length} 件 / 全体: ${state.rows.length} 件`;
  }
  if(els.metaRow){
    els.metaRow.textContent = `最終取得: ${nowLocal()} / 表示 ${state.filtered.length}件`;
  }

  if(state.view==="cards"){
    renderCards();
  }else{
    renderTable();
  }
}

function renderCards(){
  if(!els.scenarioGrid) return;

  els.scenarioGrid.innerHTML = state.filtered.map(r=>{
    const r18 = isR18Key(r.r18Key);
    const lossCls = lossClassFromKey(r.lossKey);

    const pills = [];
    if(r.system) pills.push(`<span class="sc-pill">${escapeHtml(r.system)}</span>`);
    if(r.players) pills.push(`<span class="sc-pill">${escapeHtml(r.players)}</span>`);
    if(r.format) pills.push(`<span class="sc-pill">${escapeHtml(r.format)}</span>`);
    if(r.time) pills.push(`<span class="sc-pill">${escapeHtml(r.time)}</span>`);
    if(r.lossKey) pills.push(`<span class="sc-pill ${escapeHtml(lossCls)}">ロスト:${escapeHtml(r.lossKey==="unknown"?"不明":r.lossKey)}</span>`);
    if(r18) pills.push(`<span class="sc-pill sc-r18">🔞 ${escapeHtml(r18Label(r.r18Key))}</span>`);

    const tagsHtml = r.tags.slice(0,10).map(t=>{
      return `<button type="button" class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    }).join("");

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
  }).join("");

  if(els.tableWrap) els.tableWrap.style.display = "none";
}

function renderTable(){
  if(!els.tableBody) return;

  els.tableBody.innerHTML = state.filtered.map(r=>{
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
  }).join("");

  if(els.tableWrap) els.tableWrap.style.display = "";
  if(els.scenarioGrid) els.scenarioGrid.innerHTML = "";
}

/* ---------------- Modals ---------------- */

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
  });
}

/* ---------------- Confirm ---------------- */

function shouldSkipConfirm(){
  return lsGet(LS.SKIP_CONFIRM, "0") === "1";
}
function setSkipConfirm(v){
  lsSet(LS.SKIP_CONFIRM, v ? "1" : "0");
}

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

/* ---------------- Detail + Trailer ---------------- */

function findById(id){
  return state.rows.find(r=>r.id===id) || null;
}

function buildTrailerBlock(trailers){
  if(!state.trailersEnabled){
    return `
      <div class="detail-block" style="grid-column: 1 / -1;">
        <h3>トレーラー</h3>
        <div class="detail-val"><span class="muted">非表示</span></div>
      </div>
    `;
  }

  if(!trailers || trailers.length===0){
    return `
      <div class="detail-block" style="grid-column: 1 / -1;">
        <h3>トレーラー</h3>
        <div class="detail-val"><span class="muted">なし</span></div>
      </div>
    `;
  }

  return `
    <div class="detail-block" style="grid-column: 1 / -1;">
      <h3>トレーラー</h3>
      <div class="detail-val trailer">
        <div class="trailer-viewport" id="trailerViewport">
          <img id="trailerImg" alt="trailer" draggable="false">
          <div class="trailer-nav">
            <button type="button" class="trailer-btn" id="trailerPrev" aria-label="前へ">‹</button>
            <button type="button" class="trailer-btn" id="trailerNext" aria-label="次へ">›</button>
          </div>
        </div>
        <div class="trailer-dots" id="trailerDots"></div>
        <div class="muted" style="margin-top:8px;font-size:12px;opacity:.85;">
          画像クリックで拡大 / スワイプで切替
        </div>
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
    : `<span class="muted">なし</span>`;

  const urlHtml = row.url ? `
    <div class="detail-actions">
      <button type="button" class="sc-icon" data-action="open-url" data-url="${escapeHtml(row.url)}" data-r18="${r18?"1":"0"}" aria-label="外部リンク">🔗</button>
      <button type="button" class="sc-icon" data-action="copy-url" data-url="${escapeHtml(row.url)}" aria-label="URLコピー">📋</button>
    </div>
  ` : `<span class="muted">URLなし</span>`;

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
          <div>R18: <strong class="${r18 ? "sc-r18" : ""}" style="padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);display:inline-block;">
            ${escapeHtml(r18Label(row.r18Key))}
          </strong></div>
          <div style="margin-top:6px;">ロスト率:
            <strong class="${escapeHtml(lossCls)}" style="padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);display:inline-block;">
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
  updateTrailerUI();
}

function updateTrailerUI(){
  const img = document.getElementById("trailerImg");
  const dots = document.getElementById("trailerDots");
  const prev = document.getElementById("trailerPrev");
  const next = document.getElementById("trailerNext");

  const list = state.trailerList || [];
  if(!img || !dots) return;

  if(list.length === 0){
    img.removeAttribute("src");
    img.dataset.src = "";
    dots.innerHTML = "";
    if(prev) prev.style.display = "none";
    if(next) next.style.display = "none";
    return;
  }

  state.trailerIndex = clampInt(state.trailerIndex, 0, list.length - 1);

  const src = list[state.trailerIndex];
  img.src = src;
  img.dataset.src = src;

  dots.innerHTML = list.map((_, i)=>(
    `<button type="button" class="trailer-dot ${i===state.trailerIndex?"is-active":""}" data-index="${i}" aria-label="画像 ${i+1}"></button>`
  )).join("");

  const showNav = list.length > 1;
  if(prev) prev.style.display = showNav ? "" : "none";
  if(next) next.style.display = showNav ? "" : "none";
}

/* ✅ 핵: モーダル内トレーラーはイベント委譲で常に動く */
function bindDetailModalTrailerDelegation(){
  if(!els.detailModal) return;

  els.detailModal.addEventListener("click", (e)=>{
    const prev = e.target.closest("#trailerPrev");
    if(prev){
      e.stopPropagation();
      const len = state.trailerList?.length || 0;
      if(len > 1){
        state.trailerIndex = (state.trailerIndex - 1 + len) % len;
        updateTrailerUI();
      }
      return;
    }

    const next = e.target.closest("#trailerNext");
    if(next){
      e.stopPropagation();
      const len = state.trailerList?.length || 0;
      if(len > 1){
        state.trailerIndex = (state.trailerIndex + 1) % len;
        updateTrailerUI();
      }
      return;
    }

    const dot = e.target.closest(".trailer-dot");
    if(dot){
      const i = parseInt(dot.dataset.index, 10);
      if(Number.isFinite(i)){
        state.trailerIndex = i;
        updateTrailerUI();
      }
      return;
    }

    const img = e.target.closest("#trailerImg");
    if(img){
      const src = img.dataset.src || img.getAttribute("src");
      if(src) openZoom(src);
      return;
    }
  });

  // swipe (pointer)
  els.detailModal.addEventListener("pointerdown", (e)=>{
    const vp = e.target.closest("#trailerViewport");
    if(!vp) return;
    state.trailerSwipeStartX = e.clientX;
  });

  els.detailModal.addEventListener("pointerup", (e)=>{
    const vp = e.target.closest("#trailerViewport");
    if(!vp) return;
    if(state.trailerSwipeStartX === null) return;

    const dx = e.clientX - state.trailerSwipeStartX;
    state.trailerSwipeStartX = null;

    if(Math.abs(dx) < 40) return;
    const len = state.trailerList?.length || 0;
    if(len <= 1) return;

    if(dx < 0) state.trailerIndex = (state.trailerIndex + 1) % len;
    else state.trailerIndex = (state.trailerIndex - 1 + len) % len;

    updateTrailerUI();
  });
}

/* ---------------- View / prefs ---------------- */

function setView(view){
  state.view = view;
  document.querySelectorAll(".sc-tab").forEach(t=>{
    t.classList.toggle("is-active", t.dataset.view === view);
  });
  render();
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

/* ---------------- Data load ---------------- */

async function loadData(isReload=false){
  try{
    setStatus("取得中…");
    const data = await fetchJSON(API_URL);
    if(!data || data.ok===false) throw new Error(data?.error || "API error");

    state.rawRows = Array.isArray(data.rows) ? data.rows : [];
    state.rows = state.rawRows.map(normalizeRow);

    buildSelectOptions(els.filterSystem, state.rows.map(r=>r.system), "指定なし");
    buildSelectOptions(els.filterFormat, state.rows.map(r=>r.format), "指定なし");

    state._allTags = uniqSorted(state.rows.flatMap(r=>r.tags));
    rebuildTagChips();

    setStatus(`OK：${state.rows.length}件 取得`);
    if(isReload) toast("再取得しました");

    render();
  }catch(err){
    console.error(err);
    setStatus("取得失敗：API URL / 公開設定を確認");
    toast("取得に失敗しました");
  }
}

/* ---------------- Events ---------------- */

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
  rebuildTagChips();
  render();
  toast("条件をリセット");
}

function bindEvents(){
  // theme toggle
  els.themeToggle?.addEventListener("click", ()=>{
    const now = document.documentElement.getAttribute("data-theme");
    const next = now==="light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    lsSet(LS.THEME, next);
    toast(`テーマ：${next}`);
  });

  // top actions
  els.refreshBtn?.addEventListener("click", ()=>loadData(true));
  els.resetFiltersBtn?.addEventListener("click", resetFilters);

  // controls
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
    render();
  });
  els.toggleShowTrailers?.addEventListener("change", ()=>{
    state.trailersEnabled = !!els.toggleShowTrailers.checked;
    saveUiPrefs();
    applyUiPrefsToDom();
    render();
  });

  // tags
  els.tagsSearchInput?.addEventListener("input", debounce(rebuildTagChips, 80));

  els.tagsClearBtn?.addEventListener("click", ()=>{
    state.selectedTags.clear();
    rebuildTagChips();
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

  // delegation
  document.addEventListener("click", (e)=>{
    // tag click (candidate or selected)
    const tagBtn = e.target.closest("[data-tag]");
    if(tagBtn){
      const t = tagBtn.dataset.tag;
      if(!t) return;

      if(tagBtn.dataset.selected==="1"){
        state.selectedTags.delete(t);
      }else{
        if(state.selectedTags.has(t)) state.selectedTags.delete(t);
        else state.selectedTags.add(t);
      }
      rebuildTagChips();
      render();
      return;
    }

    // open detail (avoid catching icon buttons)
    const detailEl = e.target.closest('[data-action="open-detail"]');
    if(detailEl){
      if(e.target.closest('[data-action="open-url"], [data-action="copy-url"]')) return;
      const id = detailEl.dataset.id;
      if(id) openDetail(id);
      return;
    }

    // copy/open url
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
  });
}

/* ---------------- Boot ---------------- */

function boot(){
  loadUiPrefs();
  initModalCloseHandlers();
  bindConfirmButtons();
  bindEvents();

  // ✅ trailer/zoom works always
  bindDetailModalTrailerDelegation();

  setView("cards");
  loadData(false);
}

boot();