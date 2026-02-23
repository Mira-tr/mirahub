// /scenarios/scenarios.js
const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

const LS = {
  THEME: "mirahub.theme",
  CACHE: "mirahub.scenarios.cache.v1",
  CACHE_TS: "mirahub.scenarios.cache.ts.v1",
  CACHE_TTL_MS: 10 * 60 * 1000,

  FAV_IDS: "mirahub.fav.ids.v1",
  SKIP_CONFIRM: "mirahub.skipExternalConfirm.v1",

  TAG_MODE: "mirahub.tags.mode.v1" // "or" | "and"
};

const els = {
  scrollProgress: document.getElementById("scrollProgress"),

  themeToggle: document.getElementById("themeToggle"),

  status: document.getElementById("status"),
  activeFilters: document.getElementById("activeFilters"),
  resultInfo: document.getElementById("resultInfo"),
  favTotalInfo: document.getElementById("favTotalInfo"),
  metaInfo: document.getElementById("metaInfo"),

  footerCount: document.getElementById("footerCount"),
  footerFavTotal: document.getElementById("footerFavTotal"),
  footerUpdated: document.getElementById("footerUpdated"),

  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  viewSelect: document.getElementById("viewSelect"),
  systemSelect: document.getElementById("systemSelect"),
  formatSelect: document.getElementById("formatSelect"),
  playersSelect: document.getElementById("playersSelect"),
  timeSelect: document.getElementById("timeSelect"),
  r18Select: document.getElementById("r18Select"),
  lossSelect: document.getElementById("lossSelect"),

  btnReload: document.getElementById("btnReload"),
  btnReset: document.getElementById("btnReset"),
  btnCopyFilters: document.getElementById("btnCopyFilters"),
  btnCopyCount: document.getElementById("btnCopyCount"),
  btnMore: document.getElementById("btnMore"),
  btnToTop: document.getElementById("btnToTop"),

  tagTop: document.getElementById("tagTop"),
  btnOpenTagModal: document.getElementById("btnOpenTagModal"),
  btnClearTags: document.getElementById("btnClearTags"),

  selectedTagsWrap: document.getElementById("selectedTagsWrap"),
  selectedTags: document.getElementById("selectedTags"),

  cardView: document.getElementById("cardView"),
  tableView: document.getElementById("tableView"),
  tableBody: document.getElementById("tableBody"),
  compactView: document.getElementById("compactView"),

  detailModal: document.getElementById("detailModal"),
  detailTitle: document.getElementById("detailTitle"),
  detailSub: document.getElementById("detailSub"),
  detailBody: document.getElementById("detailBody"),

  tagModal: document.getElementById("tagModal"),
  tagSearchInput: document.getElementById("tagSearchInput"),
  tagModeBtn: document.getElementById("tagModeBtn"),
  tagModalClearBtn: document.getElementById("tagModalClearBtn"),
  tagModalBody: document.getElementById("tagModalBody"),

  zoomModal: document.getElementById("zoomModal"),
  zoomImage: document.getElementById("zoomImage"),

  confirmModal: document.getElementById("confirmModal"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmDontAsk: document.getElementById("confirmDontAsk"),
  confirmCancel: document.getElementById("confirmCancel"),
  confirmOk: document.getElementById("confirmOk"),

  toastHost: document.getElementById("toastHost"),

  helpPop: document.getElementById("helpPop"),
  helpPopTitle: document.getElementById("helpPopTitle"),
  helpPopText: document.getElementById("helpPopText"),
  helpPopClose: document.getElementById("helpPopClose"),
};

const state = {
  raw: [],
  rows: [],

  view: "cards",
  limit: 15,

  selectedTags: new Set(),
  tagMode: "or",

  pendingUrl: null,
  pendingIsR18: false,

  activeId: null,
  trailerList: [],
  trailerIndex: 0,
  trailerBound: false,
};

function norm(v){ return String(v ?? "").trim(); }
function lower(v){ return norm(v).toLowerCase(); }
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function lsGet(k, fb=null){
  try{
    const v = localStorage.getItem(k);
    return v === null ? fb : v;
  }catch{ return fb; }
}
function lsSet(k, v){
  try{ localStorage.setItem(k, String(v)); }catch{}
}
function lsDel(k){
  try{ localStorage.removeItem(k); }catch{}
}

function toast(msg){
  if(!els.toastHost) return;
  const n = document.createElement("div");
  n.className = "toast";
  n.textContent = msg;
  els.toastHost.appendChild(n);
  void n.offsetWidth;
  n.classList.add("is-show");
  setTimeout(()=>{
    n.classList.remove("is-show");
    setTimeout(()=>n.remove(), 220);
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

function setStatus(msg){
  if(els.status) els.status.textContent = msg;
}

function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function parseIdNumber(id){
  const m = String(id || "").match(/(\d+)/);
  if(!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(n, min, max){
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeR18(raw){
  const s = lower(raw);
  if(!s) return "unknown";
  if(["none","soft","mix","hard","unknown"].includes(s)) return s;
  if(["なし","全年齢","健全","no","false","0"].includes(s)) return "none";
  if(["不明","?","未確認"].includes(s)) return "unknown";
  if(["あり","r18","18+","18","adult","nsfw","🔞","true","1","yes"].includes(s)) return "soft";
  if(s.includes("hard")) return "hard";
  if(s.includes("mix")) return "mix";
  if(s.includes("soft")) return "soft";
  return "unknown";
}
function r18Label(key){
  switch(key){
    case "none": return "なし";
    case "soft": return "soft";
    case "mix": return "mix";
    case "hard": return "hard";
    default: return "unknown";
  }
}
function isR18Key(key){
  return ["soft","mix","hard"].includes(key);
}

function normalizeLossRate(raw){
  const s = lower(raw);
  if(!s || s==="不明") return "unknown";
  const t = s.replace(/[％%]/g,"").replace(/[〜~–—]/g,"-").replace(/\s+/g,"");
  if(["unknown","?"].includes(t)) return "unknown";
  const m = t.match(/(\d{1,3})-(\d{1,3})/);
  if(!m) return "unknown";
  const a = clampInt(parseInt(m[1],10),0,100);
  const b = clampInt(parseInt(m[2],10),0,100);
  const min = Math.min(a,b);
  const max = Math.max(a,b);
  return `${min}-${max}`;
}
function lossClass(key){
  if(!key || key==="unknown") return "";
  const m = String(key).match(/(\d+)-(\d+)/);
  if(!m) return "";
  const avg = (parseInt(m[1],10) + parseInt(m[2],10)) / 2;
  if(avg <= 30) return "loss-low";
  if(avg <= 50) return "loss-mid";
  if(avg <= 70) return "loss-high";
  return "loss-very";
}

function parseSingleDurationToMinutes(token){
  const t = String(token ?? "").toLowerCase();
  if(!t) return null;
  let m = t.match(/(\d+(?:\.\d+)?)\s*(m|min|分)/);
  if(m) return Math.round(parseFloat(m[1]));
  m = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|時間)/);
  if(m) return Math.round(parseFloat(m[1]) * 60);
  return null;
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

function parsePlayers(raw){
  const original = norm(raw);
  if(!original) return { min:null, max:null };
  const s = original.replace(/[〜~–—]/g,"-").replace(/\s+/g,"");
  let m = s.match(/(\d+)\D*-\D*(\d+)/);
  if(m){
    const a = parseInt(m[1],10), b = parseInt(m[2],10);
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
function playersPresetMatch(row, preset){
  if(!preset) return true;
  if(preset==="unknown") return row.playersMin===null && row.playersMax===null;
  if(row.playersMin===null && row.playersMax===null) return false;
  const vMin = row.playersMin ?? row.playersMax;
  const vMax = row.playersMax ?? row.playersMin;
  if(preset==="1") return vMin===1 && vMax===1;
  if(preset==="2") return vMin===2 && vMax===2;
  if(preset==="3") return vMin===3 && vMax===3;
  if(preset==="4") return vMin===4 && vMax===4;
  if(preset==="5+") return (vMax ?? 0) >= 5;
  return true;
}

function splitTags(raw){
  const s = norm(raw);
  if(!s) return [];
  return s.split(/[,\s/・]+/).map(t=>norm(t)).filter(Boolean);
}

function splitTrailerUrls(raw){
  const s = norm(raw);
  if(!s) return [];
  return s.split(/\r?\n/).map(x=>norm(x)).filter(Boolean).filter(u=>/^https?:\/\//i.test(u));
}

function normalizeRow(input){
  const r = {};
  for(const k of Object.keys(input || {})){
    r[String(k).toLowerCase()] = input[k];
  }

  const timeRange = parseTimeRangeToMinutes(r.time);
  const playersRange = parsePlayers(r.players);

  return {
    id: norm(r.id),
    name: norm(r.name),
    author: norm(r.author),
    system: norm(r.system),
    players: norm(r.players),
    format: norm(r.format),
    time: norm(r.time),

    tags: splitTags(r.tags),
    memo: norm(r.memo),
    url: norm(r.url),

    trailerUrls: splitTrailerUrls(r.trailer_url || r.trailer_urls),

    r18Key: normalizeR18(r.r18),
    lossKey: normalizeLossRate(r.lossrate || r.loss_rate || r.loss),

    favCount: Number(r.favcount || r.fav_count || 0) || 0,
    updatedAt: norm(r.updatedat || r.updated_at || r.updated),

    timeMin: timeRange.min,
    timeMax: timeRange.max,
    playersMin: playersRange.min,
    playersMax: playersRange.max,
  };
}

function readCache(){
  try{
    const ts = Number(lsGet(LS.CACHE_TS, "0")) || 0;
    const raw = lsGet(LS.CACHE, "");
    if(!raw) return null;
    if(Date.now() - ts > LS.CACHE_TTL_MS) return null;
    const obj = JSON.parse(raw);
    if(!Array.isArray(obj)) return null;
    return obj;
  }catch{
    return null;
  }
}
function writeCache(rows){
  try{
    lsSet(LS.CACHE_TS, String(Date.now()));
    lsSet(LS.CACHE, JSON.stringify(rows));
  }catch{}
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

async function loadData(force=false){
  try{
    setStatus("取得中…");

    if(!force){
      const cached = readCache();
      if(cached){
        state.raw = cached;
        state.rows = cached.map(normalizeRow);
        hydrateOptionsAndTags();
        setStatus(`OK：${state.rows.length}件（キャッシュ）`);
        renderAll();
        openFromHash();
        return;
      }
    }

    const data = await fetchJSON(API_URL);
    if(!data || data.ok===false) throw new Error(data?.error || "API error");

    const rows = Array.isArray(data.rows) ? data.rows : [];
    writeCache(rows);

    state.raw = rows;
    state.rows = rows.map(normalizeRow);

    hydrateOptionsAndTags();
    setStatus(`OK：${state.rows.length}件`);
    renderAll();
    openFromHash();
  }catch{
    const cached = readCache();
    if(cached){
      state.raw = cached;
      state.rows = cached.map(normalizeRow);
      hydrateOptionsAndTags();
      setStatus(`取得失敗（キャッシュ表示）：${state.rows.length}件`);
      renderAll();
      openFromHash();
    }else{
      setStatus("取得失敗：API URL / 公開設定を確認");
      toast("取得に失敗しました");
    }
  }
}

function uniqSorted(arr){
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ja"));
}
function buildSelectOptions(selectEl, values, placeholder="指定なし"){
  if(!selectEl) return;
  const list = uniqSorted(values);
  const cur = selectEl.value;
  selectEl.innerHTML = `<option value="">${esc(placeholder)}</option>` +
    list.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(cur && list.includes(cur)) selectEl.value = cur;
}

function buildTagFrequency(rows){
  const map = new Map();
  for(const r of rows){
    for(const t of r.tags){
      map.set(t, (map.get(t) || 0) + 1);
    }
  }
  return map;
}

function hydrateOptionsAndTags(){
  buildSelectOptions(els.systemSelect, state.rows.map(r=>r.system), "指定なし");
  buildSelectOptions(els.formatSelect, state.rows.map(r=>r.format), "指定なし");

  const freq = buildTagFrequency(state.rows);
  const allTags = uniqSorted(Array.from(freq.keys()));
  state._allTags = allTags;
  state._tagFreq = freq;

  renderTagTop();
  renderSelectedTags();
  renderTagModalList();
}

function getViewLimit(view){
  if(view==="table") return 30;
  if(view==="compact") return 40;
  return 15;
}

function getFavSet(){
  try{
    const raw = lsGet(LS.FAV_IDS, "[]");
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  }catch{
    return new Set();
  }
}
function saveFavSet(set){
  try{
    lsSet(LS.FAV_IDS, JSON.stringify(Array.from(set)));
  }catch{}
}
function hasFav(id){
  return getFavSet().has(id);
}

function shouldSkipConfirm(){
  return lsGet(LS.SKIP_CONFIRM, "0") === "1";
}
function setSkipConfirm(v){
  lsSet(LS.SKIP_CONFIRM, v ? "1" : "0");
}

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

function openConfirm(url, isR18){
  state.pendingUrl = url;
  state.pendingIsR18 = !!isR18;

  if(!state.pendingIsR18 && shouldSkipConfirm()){
    window.open(url, "_blank", "noopener,noreferrer");
    state.pendingUrl = null;
    state.pendingIsR18 = false;
    return;
  }

  if(!els.confirmModal || !els.confirmMessage || !els.confirmOk || !els.confirmCancel || !els.confirmDontAsk){
    const ok = window.confirm(state.pendingIsR18 ? "【R18注意】外部サイトへ移動しますか？" : "外部サイトへ移動しますか？");
    if(ok) window.open(url, "_blank", "noopener,noreferrer");
    state.pendingUrl = null;
    state.pendingIsR18 = false;
    return;
  }

  if(els.confirmTitle) els.confirmTitle.textContent = "確認";
  if(state.pendingIsR18){
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
  state.pendingUrl = null;
  state.pendingIsR18 = false;
}

function openHelp(key){
  if(!els.helpPop || !els.helpPopTitle || !els.helpPopText) return;
  const dict = {
    search: {
      t: "検索",
      d: "スペース区切りでAND検索。タイトル/作者/タグ/メモなどを対象に検索します。"
    },
    sort: {
      t: "並び替え",
      d: "更新日・⭐・タイトル・IDで並べ替え。⭐はローカルで即反映されます。"
    },
    view: {
      t: "表示",
      d: "カード=15件、表=30件、コンパクト=40件。『もっと見る』で追加表示します。"
    },
    tags: {
      t: "タグ",
      d: "上位タグをすぐ押せます。タグ一覧で検索/複数選択も可能。条件はOR/AND切替できます。"
    },
    r18: {
      t: "R18",
      d: "表示は控えめですが、絞り込みは可能。外部リンクはR18の場合は常に警告が出ます。"
    },
    loss: {
      t: "ロスト率",
      d: "参考情報として控えめ表示。必要なときだけ絞り込めます。"
    },
  };
  const item = dict[key] || { t:"ヘルプ", d:"" };
  els.helpPopTitle.textContent = item.t;
  els.helpPopText.textContent = item.d;
  els.helpPop.classList.add("is-show");
  els.helpPop.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
}
function closeHelp(){
  if(!els.helpPop) return;
  els.helpPop.classList.remove("is-show");
  els.helpPop.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
}

function setTheme(next){
  document.documentElement.setAttribute("data-theme", next);
  lsSet(LS.THEME, next);
  toast(`テーマ：${next}`);
}

function getFilters(){
  const q = norm(els.searchInput?.value);
  const system = norm(els.systemSelect?.value);
  const format = norm(els.formatSelect?.value);
  const players = norm(els.playersSelect?.value);
  const time = norm(els.timeSelect?.value);
  const r18 = norm(els.r18Select?.value);
  const loss = norm(els.lossSelect?.value);
  const sort = norm(els.sortSelect?.value || "updated_desc");
  const view = norm(els.viewSelect?.value || "cards");
  return { q, system, format, players, time, r18, loss, sort, view };
}

function tagsMatch(row){
  if(state.selectedTags.size===0) return true;
  const rowTags = new Set(row.tags);
  if(state.tagMode==="and"){
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
    row.id, row.name, row.author, row.system, row.players, row.format, row.time,
    row.r18Key, row.lossKey, row.tags.join(" "), row.memo
  ].join(" / "));
  return tokens.every(t => hay.includes(t));
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

function formatMatch(row, filterVal){
  if(!filterVal) return true;
  if(filterVal==="どちらでも"){
    const rf = norm(row.format);
    return !!rf && (rf.includes("どちら") || rf.includes("ボイセ") || rf.includes("テキセ"));
  }
  return norm(row.format) === filterVal;
}

function applyFilters(){
  const f = getFilters();
  let arr = state.rows.filter(row=>{
    if(f.system && row.system !== f.system) return false;
    if(f.format && !formatMatch(row, f.format)) return false;
    if(!playersPresetMatch(row, f.players)) return false;
    if(!timePresetMatch(row, f.time)) return false;
    if(!r18Match(row, f.r18)) return false;
    if(!lossMatch(row, f.loss)) return false;
    if(!tagsMatch(row)) return false;
    if(!searchMatch(row, f.q)) return false;
    return true;
  });

  const byName = (a,b)=>a.name.localeCompare(b.name,"ja");
  const byId = (a,b)=>parseIdNumber(a.id) - parseIdNumber(b.id);
  const byFav = (a,b)=>(a.favCount||0) - (b.favCount||0);
  const byUpdated = (a,b)=>{
    const ta = Date.parse(a.updatedAt || "") || 0;
    const tb = Date.parse(b.updatedAt || "") || 0;
    if(ta===tb) return byId(a,b);
    return ta - tb;
  };

  const sort = f.sort || "updated_desc";
  const cmp = ({
    updated_desc:(a,b)=>-byUpdated(a,b),
    updated_asc: byUpdated,
    fav_desc:(a,b)=>-byFav(a,b),
    fav_asc: byFav,
    title_asc: byName,
    title_desc:(a,b)=>-byName(a,b),
    id_asc: byId,
    id_desc:(a,b)=>-byId(a,b),
  })[sort] || ((a,b)=>-byUpdated(a,b));

  arr.sort(cmp);
  return arr;
}

function setView(view){
  state.view = view;
  state.limit = getViewLimit(view);

  if(els.cardView) els.cardView.hidden = (view !== "cards");
  if(els.tableView) els.tableView.hidden = (view !== "table");
  if(els.compactView) els.compactView.hidden = (view !== "compact");
}

function renderTagTop(){
  if(!els.tagTop) return;
  const freq = state._tagFreq || new Map();
  const list = Array.from(freq.entries())
    .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0],"ja"))
    .slice(0, 8)
    .map(([t,count])=>({ t, count }));

  els.tagTop.innerHTML = list.map(x=>{
    const sel = state.selectedTags.has(x.t);
    return `<button type="button" class="sc-pill ${sel?"is-selected":""}" data-action="tag-toggle" data-tag="${esc(x.t)}">${esc(x.t)}</button>`;
  }).join("");
}

function renderSelectedTags(){
  if(!els.selectedTagsWrap || !els.selectedTags) return;
  const arr = Array.from(state.selectedTags);
  if(arr.length===0){
    els.selectedTagsWrap.hidden = true;
    els.selectedTags.innerHTML = "";
    return;
  }
  els.selectedTagsWrap.hidden = false;
  els.selectedTags.innerHTML = arr.map(t=>{
    return `<button type="button" class="sc-pill is-selected" data-action="tag-toggle" data-tag="${esc(t)}">${esc(t)} ✕</button>`;
  }).join("");
}

function renderTagModalList(){
  if(!els.tagModalBody) return;
  const q = lower(els.tagSearchInput?.value || "");
  const freq = state._tagFreq || new Map();
  const all = (state._allTags || []).slice();
  const items = all
    .filter(t => !q || lower(t).includes(q))
    .sort((a,b)=> (freq.get(b)||0)-(freq.get(a)||0) || a.localeCompare(b,"ja"))
    .slice(0, 400);

  els.tagModalBody.innerHTML = items.map(t=>{
    const sel = state.selectedTags.has(t);
    const c = freq.get(t) || 0;
    return `<button type="button" class="sc-pill ${sel?"is-selected":""}" data-action="tag-toggle" data-tag="${esc(t)}">${esc(t)} <span style="opacity:.6;">(${c})</span></button>`;
  }).join("");
}

function summarizeFiltersForChips(filteredCount){
  const f = getFilters();
  const chips = [];

  if(f.q) chips.push({ k:"q", label:`検索: ${f.q}` });
  if(f.system) chips.push({ k:"system", label:`System: ${f.system}` });
  if(f.format) chips.push({ k:"format", label:`形式: ${f.format}` });
  if(f.players) chips.push({ k:"players", label:`人数: ${f.players}` });
  if(f.time) chips.push({ k:"time", label:`時間: ${f.time}` });
  if(f.r18) chips.push({ k:"r18", label:`R18: ${f.r18}` });
  if(f.loss) chips.push({ k:"loss", label:`ロスト: ${f.loss}` });
  if(state.selectedTags.size>0) chips.push({ k:"tags", label:`タグ: ${Array.from(state.selectedTags).slice(0,4).join(", ")}${state.selectedTags.size>4?"…":""}` });

  if(!els.activeFilters) return;

  els.activeFilters.innerHTML = chips.map(c=>{
    return `<span class="sc-filterChip">${esc(c.label)}<button type="button" data-action="chip-clear" data-chip="${esc(c.k)}" aria-label="解除">×</button></span>`;
  }).join("");

  if(els.resultInfo){
    els.resultInfo.textContent = `表示: ${filteredCount} 件 / 全体: ${state.rows.length} 件`;
  }

  const favTotal = state.rows.reduce((a,r)=>a+(r.favCount||0),0);
  if(els.favTotalInfo) els.favTotalInfo.textContent = `⭐合計: ${favTotal}`;
  if(els.metaInfo) els.metaInfo.textContent = `最終取得: ${new Date(Number(lsGet(LS.CACHE_TS,"0"))||Date.now()).toLocaleString()}`;

  if(els.footerCount) els.footerCount.textContent = `所持: ${state.rows.length}本`;
  if(els.footerFavTotal) els.footerFavTotal.textContent = `⭐合計: ${favTotal}`;
  if(els.footerUpdated){
    const latest = state.rows.reduce((max,r)=>{
      const t = Date.parse(r.updatedAt||"") || 0;
      return Math.max(max, t);
    }, 0);
    els.footerUpdated.textContent = `更新: ${latest ? new Date(latest).toLocaleDateString() : "—"}`;
  }
}

function popularBadge(row){
  const n = row.favCount || 0;
  if(n >= 20) return "人気";
  if(n >= 10) return "注目";
  if(n >= 5) return "気になる";
  return "";
}

function renderCards(list){
  if(!els.cardView) return;
  const favSet = getFavSet();

  const slice = list.slice(0, state.limit);

  els.cardView.innerHTML = slice.map(r=>{
    const r18 = r18Label(r.r18Key);
    const loss = r.lossKey === "unknown" ? "unknown" : r.lossKey;
    const lossCls = lossClass(r.lossKey);
    const pop = popularBadge(r);
    const isFav = favSet.has(r.id);

    const pills = [];
    if(r.system) pills.push(`<span class="sc-pillMeta">${esc(r.system)}</span>`);
    if(r.players) pills.push(`<span class="sc-pillMeta">${esc(r.players)}</span>`);
    if(r.format) pills.push(`<span class="sc-pillMeta">${esc(r.format)}</span>`);
    if(r.time) pills.push(`<span class="sc-pillMeta">${esc(r.time)}</span>`);
    if(pop) pills.push(`<span class="sc-pillMeta popular">${esc(pop)}</span>`);
    pills.push(`<span class="sc-miniBadge r18">R18:${esc(r18)}</span>`);
    pills.push(`<span class="sc-miniBadge loss ${esc(lossCls)}">ロスト:${esc(loss)}</span>`);

    const tags = r.tags.slice(0, 10).map(t=>{
      const sel = state.selectedTags.has(t);
      return `<button type="button" class="sc-pill ${sel?"is-selected":""}" data-action="tag-toggle" data-tag="${esc(t)}">${esc(t)}</button>`;
    }).join("");

    const urlBtns = r.url ? `
      <button type="button" class="sc-icon" data-action="open-url" data-url="${esc(r.url)}" data-r18="${isR18Key(r.r18Key)?"1":"0"}" aria-label="外部リンク">🔗</button>
      <button type="button" class="sc-icon" data-action="copy-url" data-url="${esc(r.url)}" aria-label="URLコピー">📋</button>
    ` : "";

    const trailerBtn = r.trailerUrls.length ? `
      <button type="button" class="sc-icon" data-action="open-detail" data-id="${esc(r.id)}" aria-label="詳細（トレーラーあり）">🎞</button>
    ` : "";

    return `
      <article class="sc-card" data-action="open-detail" data-id="${esc(r.id)}">
        ${r.id ? `<div class="sc-id">${esc(r.id)}</div>` : ""}
        <div class="sc-title">${esc(r.name || "(no title)")}</div>
        <div class="sc-author">${esc(r.author || "")}</div>

        <div class="sc-pillRow">${pills.join("")}</div>

        ${tags ? `<div class="sc-pillRow" style="margin-top:8px;">${tags}</div>` : ""}

        ${r.memo ? `<div class="sc-note">${esc(r.memo)}</div>` : ""}

        <div class="sc-actions">
          ${trailerBtn}
          ${urlBtns}
          <button type="button" class="sc-icon sc-favBtn ${isFav?"is-on":""}" data-action="fav" data-id="${esc(r.id)}" aria-label="お気に入り">
            <span class="sc-favStar">⭐</span><span>${esc(r.favCount || 0)}</span>
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTable(list){
  if(!els.tableBody) return;
  const favSet = getFavSet();
  const slice = list.slice(0, state.limit);

  els.tableBody.innerHTML = slice.map(r=>{
    const isFav = favSet.has(r.id);
    const urlCell = r.url ? `
      <button type="button" class="sc-linkBtn" data-action="open-url" data-url="${esc(r.url)}" data-r18="${isR18Key(r.r18Key)?"1":"0"}">open</button>
      <button type="button" class="sc-linkBtn" data-action="copy-url" data-url="${esc(r.url)}">copy</button>
    ` : "";

    return `
      <tr data-action="open-detail" data-id="${esc(r.id)}">
        <td>${esc(r.id)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.author)}</td>
        <td>${esc(r.system)}</td>
        <td>${esc(r.players)}</td>
        <td>${esc(r.format)}</td>
        <td>${esc(r.time)}</td>
        <td>
          <span style="font-weight:900;">⭐ ${esc(r.favCount || 0)}</span>
          ${isFav ? `<span style="opacity:.6;">(済)</span>` : ``}
        </td>
        <td>${urlCell}</td>
      </tr>
    `;
  }).join("");
}

function renderCompact(list){
  if(!els.compactView) return;
  const favSet = getFavSet();
  const slice = list.slice(0, state.limit);

  els.compactView.innerHTML = slice.map(r=>{
    const isFav = favSet.has(r.id);
    const sub = [r.id, r.system].filter(Boolean).join(" / ");
    return `
      <div class="sc-compactRow" data-action="open-detail" data-id="${esc(r.id)}">
        <div class="sc-compactLeft">
          <div class="sc-compactTitle">${esc(r.name || "(no title)")}</div>
          <div class="sc-compactSub">${esc(sub)}</div>
        </div>
        <div class="sc-compactRight">
          ${r.url ? `<button type="button" class="sc-icon" data-action="open-url" data-url="${esc(r.url)}" data-r18="${isR18Key(r.r18Key)?"1":"0"}" aria-label="外部リンク">🔗</button>` : ""}
          ${r.url ? `<button type="button" class="sc-icon" data-action="copy-url" data-url="${esc(r.url)}" aria-label="URLコピー">📋</button>` : ""}
          <div class="sc-compactFav">⭐ ${esc(r.favCount || 0)}${isFav?" ✓":""}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderAll(){
  const f = getFilters();
  setView(f.view || "cards");
  state.limit = state.limit || getViewLimit(state.view);

  const filtered = applyFilters();
  summarizeFiltersForChips(filtered.length);

  const total = filtered.length;
  const shown = Math.min(total, state.limit);
  if(els.btnMore){
    els.btnMore.disabled = shown >= total;
    els.btnMore.classList.toggle("is-disabled", shown >= total);
    els.btnMore.textContent = shown >= total ? "ここまで" : "もっと見る";
  }

  if(state.view==="cards"){
    renderCards(filtered);
  }else if(state.view==="table"){
    renderTable(filtered);
  }else{
    renderCompact(filtered);
  }
}

function resetFilters(){
  if(els.searchInput) els.searchInput.value = "";
  if(els.sortSelect) els.sortSelect.value = "updated_desc";
  if(els.viewSelect) els.viewSelect.value = "cards";
  if(els.systemSelect) els.systemSelect.value = "";
  if(els.formatSelect) els.formatSelect.value = "";
  if(els.playersSelect) els.playersSelect.value = "";
  if(els.timeSelect) els.timeSelect.value = "";
  if(els.r18Select) els.r18Select.value = "";
  if(els.lossSelect) els.lossSelect.value = "";

  state.selectedTags.clear();
  renderTagTop();
  renderSelectedTags();
  renderTagModalList();

  state.view = "cards";
  state.limit = getViewLimit("cards");
  renderAll();
  toast("条件をリセット");
}

function clearChip(key){
  if(key==="q" && els.searchInput) els.searchInput.value = "";
  if(key==="system" && els.systemSelect) els.systemSelect.value = "";
  if(key==="format" && els.formatSelect) els.formatSelect.value = "";
  if(key==="players" && els.playersSelect) els.playersSelect.value = "";
  if(key==="time" && els.timeSelect) els.timeSelect.value = "";
  if(key==="r18" && els.r18Select) els.r18Select.value = "";
  if(key==="loss" && els.lossSelect) els.lossSelect.value = "";
  if(key==="tags") state.selectedTags.clear();

  renderTagTop();
  renderSelectedTags();
  renderTagModalList();
  renderAll();
}

function openZoom(src){
  if(!els.zoomModal || !els.zoomImage) return;
  els.zoomImage.src = src;
  openModal(els.zoomModal);
}

function buildTrailerBlock(trailers){
  if(!trailers || trailers.length===0){
    return `
      <div class="detail-block" style="grid-column: 1 / -1;">
        <h3>トレーラー</h3>
        <div class="detail-val"><span style="color: var(--sc-muted);">なし</span></div>
      </div>
    `;
  }

  const thumbs = trailers.map((u,i)=>{
    return `
      <button type="button" class="trailer-thumb ${i===0?"is-active":""}" data-action="trailer-jump" data-index="${i}" aria-label="画像 ${i+1}">
        <img src="${esc(u)}" loading="lazy" alt="">
      </button>
    `;
  }).join("");

  return `
    <div class="detail-block" style="grid-column: 1 / -1;">
      <h3>トレーラー</h3>
      <div class="detail-val trailer">
        <div class="trailer-viewport" id="trailerViewport">
          <img id="trailerImg" alt="trailer" loading="lazy">
          <div class="trailer-nav">
            <button type="button" class="trailer-btn" id="trailerPrev" data-action="trailer-prev" aria-label="前へ">‹</button>
            <button type="button" class="trailer-btn" id="trailerNext" data-action="trailer-next" aria-label="次へ">›</button>
          </div>
        </div>
        <div class="trailer-thumbs" id="trailerThumbs">${thumbs}</div>
      </div>
    </div>
  `;
}

function findById(id){
  return state.rows.find(r=>r.id===id) || null;
}

function openDetail(id, pushHash=true){
  const row = findById(id);
  if(!row || !els.detailModal || !els.detailBody || !els.detailTitle || !els.detailSub) return;

  state.activeId = id;
  if(pushHash) setHash(id);

  const favSet = getFavSet();
  const isFav = favSet.has(row.id);
  const r18 = r18Label(row.r18Key);
  const loss = row.lossKey === "unknown" ? "unknown" : row.lossKey;
  const lossCls = lossClass(row.lossKey);

  els.detailTitle.textContent = row.name || "詳細";
  els.detailSub.textContent = `${row.id}${row.author ? ` ・作者: ${row.author}` : ""}`;

  const tagsHtml = row.tags.length
    ? row.tags.map(t=>`<button type="button" class="sc-pill ${state.selectedTags.has(t)?"is-selected":""}" data-action="tag-toggle" data-tag="${esc(t)}">${esc(t)}</button>`).join("")
    : `<span style="color: var(--sc-muted);">なし</span>`;

  const urlHtml = row.url ? `
    <div class="detail-actions">
      <button type="button" class="sc-icon" data-action="open-url" data-url="${esc(row.url)}" data-r18="${isR18Key(row.r18Key)?"1":"0"}" aria-label="外部リンク">🔗</button>
      <button type="button" class="sc-icon" data-action="copy-url" data-url="${esc(row.url)}" aria-label="URLコピー">📋</button>
      <button type="button" class="sc-icon sc-favBtn ${isFav?"is-on":""}" data-action="fav" data-id="${esc(row.id)}" aria-label="お気に入り">
        <span class="sc-favStar">⭐</span><span>${esc(row.favCount || 0)}</span>
      </button>
    </div>
  ` : `<span style="color: var(--sc-muted);">URLなし</span>`;

  const trailerBlock = buildTrailerBlock(row.trailerUrls);

  els.detailBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-block">
        <h3>基本</h3>
        <div class="detail-val">
          ${row.system ? `<div>System: <strong>${esc(row.system)}</strong></div>` : ""}
          ${row.format ? `<div>形式: <strong>${esc(row.format)}</strong></div>` : ""}
          ${row.players ? `<div>人数: <strong>${esc(row.players)}</strong></div>` : ""}
          ${row.time ? `<div>時間: <strong>${esc(row.time)}</strong></div>` : ""}
        </div>
      </div>

      <div class="detail-block">
        <h3>目安</h3>
        <div class="detail-val">
          <div>R18:
            <strong class="sc-miniBadge r18" style="margin-left:6px;">${esc(r18)}</strong>
          </div>
          <div style="margin-top:8px;">ロスト率:
            <strong class="sc-miniBadge loss ${esc(lossCls)}" style="margin-left:6px;">${esc(loss)}</strong>
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
        <div class="detail-val detail-memo">${row.memo ? esc(row.memo) : "—"}</div>
      </div>

      ${trailerBlock}
    </div>
  `;

  openModal(els.detailModal);

  state.trailerList = (row.trailerUrls || []).slice();
  state.trailerIndex = 0;
  state.trailerBound = false;
  renderTrailer();
}

function renderTrailer(){
  const list = state.trailerList || [];
  const img = document.getElementById("trailerImg");
  const thumbs = document.getElementById("trailerThumbs");
  const viewport = document.getElementById("trailerViewport");
  const prev = document.getElementById("trailerPrev");
  const next = document.getElementById("trailerNext");
  if(!img || !thumbs || !viewport || list.length===0) return;

  state.trailerIndex = clampInt(state.trailerIndex, 0, list.length-1);
  const src = list[state.trailerIndex];
  img.src = src;
  img.dataset.src = src;

  thumbs.querySelectorAll(".trailer-thumb").forEach((b, i)=>{
    b.classList.toggle("is-active", i===state.trailerIndex);
  });

  const showNav = list.length > 1;
  if(prev) prev.style.display = showNav ? "" : "none";
  if(next) next.style.display = showNav ? "" : "none";

  if(state.trailerBound) return;
  state.trailerBound = true;

  img.addEventListener("click", ()=>{
    if(img.dataset.src) openZoom(img.dataset.src);
  });

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

function setHash(id){
  try{
    if(!id){
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    history.replaceState(null, "", "#" + encodeURIComponent(id));
  }catch{}
}

function openFromHash(){
  const h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if(!h) return;
  const id = norm(h);
  const row = findById(id);
  if(row){
    openDetail(id, false);
  }
}

async function sendFavToServer(id){
  try{
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ type:"fav", id }),
    });
  }catch{}
}

function incFavLocal(id){
  const row = findById(id);
  if(row) row.favCount = (row.favCount || 0) + 1;
}

function handleFav(id){
  if(!id) return;
  const set = getFavSet();
  if(set.has(id)){
    toast("⭐は1回まで");
    return;
  }
  set.add(id);
  saveFavSet(set);
  incFavLocal(id);
  toast("⭐しました");
  renderAll();
  sendFavToServer(id);
}

function handleMore(){
  const view = state.view;
  const step = getViewLimit(view);
  state.limit += step;
  renderAll();
}

function updateScrollProgress(){
  if(!els.scrollProgress) return;
  const doc = document.documentElement;
  const max = (doc.scrollHeight - doc.clientHeight) || 1;
  const p = (doc.scrollTop / max) * 100;
  els.scrollProgress.style.width = `${Math.max(0, Math.min(100, p))}%`;
}

function setTagMode(mode){
  state.tagMode = (mode==="and") ? "and" : "or";
  lsSet(LS.TAG_MODE, state.tagMode);
  if(els.tagModeBtn) els.tagModeBtn.textContent = `条件：${state.tagMode.toUpperCase()}`;
}

function initTagMode(){
  const m = lsGet(LS.TAG_MODE, "or");
  setTagMode(m==="and" ? "and" : "or");
}

function initModalCloseHandlers(){
  document.addEventListener("click", (e)=>{
    const closeTarget = e.target.closest("[data-close]");
    if(!closeTarget) return;

    const modal = e.target.closest(".modal");
    const confirm = e.target.closest(".confirm");
    if(modal) closeModal(modal);
    if(confirm) closeConfirm();
  });

  window.addEventListener("keydown", (e)=>{
    if(e.key!=="Escape") return;
    if(els.helpPop?.classList.contains("is-show")) return closeHelp();
    if(els.zoomModal?.classList.contains("is-show")) return closeModal(els.zoomModal);
    if(els.detailModal?.classList.contains("is-show")) return closeModal(els.detailModal);
    if(els.tagModal?.classList.contains("is-show")) return closeModal(els.tagModal);
    if(els.confirmModal?.classList.contains("is-show")) return closeConfirm();
  });
}

function bindConfirmButtons(){
  els.confirmOk?.addEventListener("click", ()=>{
    const url = state.pendingUrl;
    if(!url) return closeConfirm();
    if(!state.pendingIsR18 && els.confirmDontAsk){
      setSkipConfirm(!!els.confirmDontAsk.checked);
    }
    window.open(url, "_blank", "noopener,noreferrer");
    closeConfirm();
  });
  els.confirmCancel?.addEventListener("click", closeConfirm);
}

function debounce(fn, wait){
  let t = null;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), wait);
  };
}

function bindEvents(){
  window.addEventListener("scroll", updateScrollProgress, { passive:true });
  updateScrollProgress();

  els.themeToggle?.addEventListener("click", ()=>{
    const now = document.documentElement.getAttribute("data-theme") || "dark";
    const next = now==="light" ? "dark" : "light";
    setTheme(next);
  });

  els.btnReload?.addEventListener("click", ()=>{
    lsDel(LS.CACHE);
    lsDel(LS.CACHE_TS);
    loadData(true);
    toast("再取得");
  });

  els.btnReset?.addEventListener("click", resetFilters);

  els.btnCopyFilters?.addEventListener("click", ()=>{
    const f = getFilters();
    const tags = Array.from(state.selectedTags);
    const txt =
`条件:
q="${f.q || ""}"
system=${f.system || ""}
format=${f.format || ""}
players=${f.players || ""}
time=${f.time || ""}
r18=${f.r18 || ""}
loss=${f.loss || ""}
tags(${state.tagMode})=${tags.join(", ") || ""}
sort=${f.sort || ""}
view=${f.view || ""}
`;
    copyText(txt);
  });

  els.btnCopyCount?.addEventListener("click", ()=>{
    const filtered = applyFilters();
    copyText(String(filtered.length));
  });

  els.btnMore?.addEventListener("click", handleMore);

  els.btnToTop?.addEventListener("click", ()=>{
    window.scrollTo({ top:0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  });

  const rerender = debounce(renderAll, 80);
  els.searchInput?.addEventListener("input", rerender);
  els.sortSelect?.addEventListener("change", renderAll);
  els.viewSelect?.addEventListener("change", ()=>{
    state.limit = getViewLimit(els.viewSelect.value || "cards");
    renderAll();
  });
  els.systemSelect?.addEventListener("change", renderAll);
  els.formatSelect?.addEventListener("change", renderAll);
  els.playersSelect?.addEventListener("change", renderAll);
  els.timeSelect?.addEventListener("change", renderAll);
  els.r18Select?.addEventListener("change", renderAll);
  els.lossSelect?.addEventListener("change", renderAll);

  els.btnOpenTagModal?.addEventListener("click", ()=>{
    renderTagModalList();
    openModal(els.tagModal);
  });

  els.btnClearTags?.addEventListener("click", ()=>{
    state.selectedTags.clear();
    renderTagTop();
    renderSelectedTags();
    renderTagModalList();
    renderAll();
    toast("タグ解除");
  });

  els.tagSearchInput?.addEventListener("input", debounce(renderTagModalList, 80));

  els.tagModeBtn?.addEventListener("click", ()=>{
    setTagMode(state.tagMode==="or" ? "and" : "or");
    renderAll();
    toast(`タグ条件：${state.tagMode.toUpperCase()}`);
  });

  els.tagModalClearBtn?.addEventListener("click", ()=>{
    state.selectedTags.clear();
    renderTagTop();
    renderSelectedTags();
    renderTagModalList();
    renderAll();
    toast("タグ解除");
  });

  els.helpPopClose?.addEventListener("click", closeHelp);

  document.addEventListener("click", (e)=>{
    const help = e.target.closest("[data-help]");
    if(help){
      openHelp(help.dataset.help);
      return;
    }

    const chip = e.target.closest('[data-action="chip-clear"]');
    if(chip){
      clearChip(chip.dataset.chip);
      return;
    }

    const tagBtn = e.target.closest('[data-action="tag-toggle"]');
    if(tagBtn){
      const t = norm(tagBtn.dataset.tag);
      if(!t) return;
      if(state.selectedTags.has(t)) state.selectedTags.delete(t);
      else state.selectedTags.add(t);

      renderTagTop();
      renderSelectedTags();
      renderTagModalList();
      renderAll();
      return;
    }

    const openUrlBtn = e.target.closest('[data-action="open-url"]');
    if(openUrlBtn){
      const url = norm(openUrlBtn.dataset.url);
      if(!url) return;
      const isR18 = openUrlBtn.dataset.r18 === "1";
      openConfirm(url, isR18);
      return;
    }

    const copyUrlBtn = e.target.closest('[data-action="copy-url"]');
    if(copyUrlBtn){
      const url = norm(copyUrlBtn.dataset.url);
      if(url) copyText(url);
      return;
    }

    const favBtn = e.target.closest('[data-action="fav"]');
    if(favBtn){
      e.preventDefault();
      e.stopPropagation();
      handleFav(norm(favBtn.dataset.id));
      return;
    }

    const detailEl = e.target.closest('[data-action="open-detail"]');
    if(detailEl){
      if(e.target.closest('[data-action="open-url"], [data-action="copy-url"], [data-action="fav"]')) return;
      const id = norm(detailEl.dataset.id);
      if(id) openDetail(id, true);
      return;
    }

    const trailerPrev = e.target.closest('[data-action="trailer-prev"]');
    if(trailerPrev){
      e.preventDefault();
      e.stopPropagation();
      if(state.trailerList.length){
        state.trailerIndex = (state.trailerIndex - 1 + state.trailerList.length) % state.trailerList.length;
        renderTrailer();
      }
      return;
    }

    const trailerNext = e.target.closest('[data-action="trailer-next"]');
    if(trailerNext){
      e.preventDefault();
      e.stopPropagation();
      if(state.trailerList.length){
        state.trailerIndex = (state.trailerIndex + 1) % state.trailerList.length;
        renderTrailer();
      }
      return;
    }

    const jump = e.target.closest('[data-action="trailer-jump"]');
    if(jump){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(jump.dataset.index, 10);
      if(Number.isFinite(i)){
        state.trailerIndex = clampInt(i, 0, state.trailerList.length-1);
        renderTrailer();
      }
      return;
    }
  });

  window.addEventListener("hashchange", ()=>{
    if(!location.hash){
      if(els.detailModal?.classList.contains("is-show")) closeModal(els.detailModal);
      state.activeId = null;
      return;
    }
    openFromHash();
  });
}

function boot(){
  initTagMode();
  if(els.tagModeBtn) els.tagModeBtn.textContent = `条件：${state.tagMode.toUpperCase()}`;

  initModalCloseHandlers();
  bindConfirmButtons();
  bindEvents();

  const view = els.viewSelect?.value || "cards";
  state.view = view;
  state.limit = getViewLimit(view);
  setView(view);

  loadData(false);
}

boot();