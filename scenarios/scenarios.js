/* scenarios/scenarios.js (players_raw対応・メタ活用・色/選択見やすさ維持) */
(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

  const LS = {
    THEME: "mirahub.theme",
    SKIP_CONFIRM: "mirahub.skipExternalConfirm",
    TAG_MODE: "mirahub.tagsMode.sc",
    COMPACT: "mirahub.compact.sc",
    SHOW_TRAILERS: "mirahub.showTrailers.sc",
    VIEW: "mirahub.view.sc",
    SORT: "mirahub.sort.sc",
    PAGE_CARDS: "mirahub.page.cards.sc",
    PAGE_TABLE: "mirahub.page.table.sc",
    FAV_MAP: "mirahub.favs.sc",
    CACHE_ROWS: "mirahub.cache.rows.sc",
    CACHE_AT: "mirahub.cache.at.sc",
    CACHE_META: "mirahub.cache.meta.sc",
  };

  const PAGE_SIZE = { cards: 15, table: 30 };

  const els = {
    status: document.getElementById("status"),
    metaRow: document.getElementById("metaRow"),
    refreshBtn: document.getElementById("refreshBtn"),
    resetFiltersBtn: document.getElementById("resetFiltersBtn"),
    themeToggle: document.getElementById("themeToggle"),

    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    toggleCompact: document.getElementById("toggleCompact"),
    toggleShowTrailers: document.getElementById("toggleShowTrailers"),

    filterSystem: document.getElementById("filterSystem"),
    filterFormat: document.getElementById("filterFormat"),
    filterR18: document.getElementById("filterR18"),

    playersMin: document.getElementById("playersMin"),
    playersMax: document.getElementById("playersMax"),
    playersClear: document.getElementById("playersClear"),

    timeMin: document.getElementById("timeMin"),
    timeMax: document.getElementById("timeMax"),
    timeClear: document.getElementById("timeClear"),

    lossMin: document.getElementById("lossMin"),
    lossMax: document.getElementById("lossMax"),
    lossClear: document.getElementById("lossClear"),

    tagsSearchInput: document.getElementById("tagsSearchInput"),
    tagsChips: document.getElementById("tagsChips"),
    tagsSelected: document.getElementById("tagsSelected"),
    tagsClearBtn: document.getElementById("tagsClearBtn"),
    tagsModeBtn: document.getElementById("tagsModeBtn"),

    scenarioGrid: document.getElementById("scenarioGrid"),
    tableWrap: document.getElementById("tableWrap"),
    tableBody: document.getElementById("tableBody"),
    resultInfo: document.getElementById("resultInfo"),

    pagerHost: document.getElementById("pagerHost"),
    pagerInfo: document.getElementById("pagerInfo"),

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

    toastHost: document.getElementById("toastHost"),
  };

  const state = {
    rawRows: [],
    rows: [],
    filtered: [],
    meta: null,

    view: (lsGet(LS.VIEW, "cards") === "table") ? "table" : "cards",
    pageCards: clampInt(parseInt(lsGet(LS.PAGE_CARDS, "0"), 10) || 0, 0, 999999),
    pageTable: clampInt(parseInt(lsGet(LS.PAGE_TABLE, "0"), 10) || 0, 0, 999999),

    selectedTags: new Set(),
    tagsMode: (lsGet(LS.TAG_MODE, "or") === "and") ? "and" : "or",

    compact: lsGet(LS.COMPACT, "0") === "1",
    trailersEnabled: lsGet(LS.SHOW_TRAILERS, "1") !== "0",

    favs: loadFavMap(),

    pendingOpenUrl: null,
    pendingOpenIsR18: false,

    activeId: null,
    trailerIndex: 0,
    trailerList: [],
    trailerBoundForId: null,
  };

  /* utils */
  function norm(v){ return String(v ?? "").trim(); }
  function lower(v){ return norm(v).toLowerCase(); }
  function nowLocal(){ return new Date().toLocaleString(); }
  function clampInt(n,min,max){ return Number.isFinite(n) ? Math.max(min, Math.min(max,n)) : min; }

  function toHalfWidth(s){
    let t = String(s ?? "");
    t = t.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));
    t = t.replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));
    t = t.replace(/[〜～]/g,"~").replace(/[－―ー–—]/g,"-").replace(/　/g," ");
    return t;
  }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function lsGet(key,fallback=null){
    try{ const v = localStorage.getItem(key); return v===null ? fallback : v; }catch{ return fallback; }
  }
  function lsSet(key,value){
    try{ localStorage.setItem(key, String(value)); }catch{}
  }

  function toast(msg){
    if(!els.toastHost) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = String(msg ?? "");
    els.toastHost.appendChild(node);
    void node.offsetWidth;
    node.classList.add("is-show");
    setTimeout(()=>{ node.classList.remove("is-show"); setTimeout(()=>node.remove(),220); }, 1700);
  }

  async function copyText(text){
    const t = String(text ?? "");
    try{
      await navigator.clipboard.writeText(t);
      toast("コピーしました");
    }catch{
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position="fixed";
      ta.style.opacity="0";
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
    return withTimeout(async(signal)=>{
      const res = await fetch(url, { cache:"no-store", signal });
      const text = await res.text();
      return { ok:res.ok, status:res.status, text };
    }, ms);
  }

  function extractRows(data){
    if(!data) return [];
    if(Array.isArray(data)) return data;
    const cands = ["rows","items","data","list","result"];
    for(const k of cands) if(Array.isArray(data[k])) return data[k];
    if(data.ok && Array.isArray(data.rows)) return data.rows;
    return [];
  }

  function extractMeta(data){
    if(!data || typeof data!=="object") return null;
    if(data.meta && typeof data.meta==="object") return data.meta;
    return null;
  }

  function setStatus(msg){ if(els.status) els.status.textContent = msg; }

  function uniqSorted(arr){
    return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b,"ja"));
  }

  function buildSelectOptions(selectEl, values, placeholder="指定なし"){
    if(!selectEl) return;
    const list = uniqSorted(values.map(norm).filter(Boolean));
    selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` +
      list.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  }

  /* fav */
  function loadFavMap(){
    try{
      const raw = lsGet(LS.FAV_MAP, "{}");
      const obj = safeJSONParse(raw);
      if(obj && typeof obj==="object" && !Array.isArray(obj)) return obj;
      return {};
    }catch{ return {}; }
  }
  function saveFavMap(){ try{ lsSet(LS.FAV_MAP, JSON.stringify(state.favs)); }catch{} }
  function isFav(id){ const k = norm(id); return !!(k && state.favs[k]); }
  function toggleFav(id){
    const k = norm(id);
    if(!k) return;
    if(state.favs[k]) delete state.favs[k];
    else state.favs[k]=1;
    saveFavMap();
    render();
  }

  /* normalize fields */
  function normalizeR18(raw){
    const s = lower(toHalfWidth(raw));
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
    switch(key){
      case "none": return "なし";
      case "soft": return "R18（軽）";
      case "mix": return "R18（混）";
      case "hard": return "R18（重）";
      default: return "不明";
    }
  }
  function isR18Key(key){ return ["soft","mix","hard"].includes(key); }

  function clampPct(n){ return clampInt(n,0,100); }

  function normalizeLoss(raw){
    if(typeof raw==="number" && Number.isFinite(raw)){
      const n = clampPct(raw);
      return { key:`${n}-${n}`, min:n, max:n };
    }
    const s0 = norm(raw);
    const s = toHalfWidth(s0);
    if(!s || s==="不明" || lower(s)==="unknown") return { key:"unknown", min:null, max:null };

    const t = s.replace(/[％%]/g,"").replace(/[~]/g,"-").replace(/\s+/g,"");
    let m = t.match(/(\d{1,3})-(\d{1,3})/);
    if(m){
      const a = clampPct(parseInt(m[1],10));
      const b = clampPct(parseInt(m[2],10));
      const min = Math.min(a,b), max = Math.max(a,b);
      return { key:`${min}-${max}`, min, max };
    }
    m = t.match(/(\d{1,3})/);
    if(m){
      const n = clampPct(parseInt(m[1],10));
      return { key:`${n}-${n}`, min:n, max:n };
    }
    return { key:s0 || s, min:null, max:null };
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

  function parseSingleDurationToMinutes(token){
    const t = lower(toHalfWidth(token));
    if(!t) return null;

    let m = t.match(/(\d+(?:\.\d+)?)\s*(m|min|分)/);
    if(m) return Math.round(parseFloat(m[1]));

    m = t.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|時間)/);
    if(m) return Math.round(parseFloat(m[1])*60);

    m = t.match(/(\d+(?:\.\d+)?)h/);
    if(m) return Math.round(parseFloat(m[1])*60);

    return null;
  }
  function parseTimeRangeToMinutes(raw){
    const original0 = norm(raw);
    if(!original0) return { min:null, max:null };

    let s = toHalfWidth(original0).replace(/\s+/g,"");
    s = s.replace(/[〜~]/g,"-");

    // "8h-" / "-5h" / "2.5h-" / "6-7h"
    if(/^-/.test(s) && s.includes("h")){
      const v = parseSingleDurationToMinutes(s.replace(/^-/, ""));
      return { min:null, max:v };
    }

    const parts = s.split("-").filter(Boolean);
    if(parts.length===0) return { min:null, max:null };

    const vals = parts.map(parseSingleDurationToMinutes).filter(v=>v!==null);
    if(vals.length===0) return { min:null, max:null };
    if(vals.length===1){
      // "2.5h-" みたいな場合：minだけある
      if(/-$/.test(s)) return { min:vals[0], max:null };
      return { min:vals[0], max:vals[0] };
    }
    return { min:Math.min(...vals), max:Math.max(...vals) };
  }

  /* ★ここが重要：players_raw を確実に拾う + 人数レンジ化 */
  function parsePlayers(raw){
    const original0 = norm(raw);
    if(!original0) return { min:null, max:null };

    let s = toHalfWidth(original0)
      .replace(/\s+/g,"")
      .replace(/[〜~]/g,"-");

    // "1〜4PL" / "2-4PL" / "2PL" / "4"
    let m = s.match(/(\d+)\s*(?:人|pl)?\s*-\s*(\d+)\s*(?:人|pl)?/i);
    if(m){
      const a = parseInt(m[1],10), b = parseInt(m[2],10);
      if(Number.isFinite(a) && Number.isFinite(b)) return { min:Math.min(a,b), max:Math.max(a,b) };
    }

    m = s.match(/kpc\+(\d+)pl/i);
    if(m){
      const n = parseInt(m[1],10);
      if(Number.isFinite(n)) return { min:n+1, max:n+1 };
    }

    // "KPC+1PL,2PL" → 最小2 最大2（列挙はレンジに寄せる）
    if(/kpc\+1pl/i.test(s)) return { min:2, max:2 };

    // "1-(何人でも)"
    m = s.match(/(\d+)-\((?:何人でも|何人でも可|any)\)/i);
    if(m){
      const n = parseInt(m[1],10);
      if(Number.isFinite(n)) return { min:n, max:null };
    }

    // "1PL" / "2PL" / "1人"
    m = s.match(/(\d+)\s*(?:pl|人)\b/i);
    if(m){
      const n = parseInt(m[1],10);
      if(Number.isFinite(n)) return { min:n, max:n };
    }

    // 数字だけ "4"
    m = s.match(/^(\d+)$/);
    if(m){
      const n = parseInt(m[1],10);
      if(Number.isFinite(n)) return { min:n, max:n };
    }

    if(s.includes("ソロ")) return { min:1, max:1 };

    return { min:null, max:null };
  }

  function splitTags(raw){
    const s = norm(raw);
    if(!s) return [];
    // 送ってくれたデータは "#A,#B,#coc" なのでカンマ優先
    return s.split(/[,\s/・]+/).map(t=>norm(t)).filter(Boolean);
  }
  function splitTrailerUrls(raw){
    const s = norm(raw);
    if(!s) return [];
    return s.split(/\r?\n/).map(x=>norm(x)).filter(Boolean).filter(u=>/^https?:\/\//i.test(u));
  }

  function normalizeRow(input){
    const r = {};
    for(const k of Object.keys(input || {})) r[String(k).toLowerCase()] = input[k];

    // players が players_raw に変わったので両対応
    const playersRaw = norm(r.players_raw ?? r.players ?? r.player ?? r.pl ?? "");

    const loss = normalizeLoss(r.loss_rate);
    const r18Key = normalizeR18(r.r18);
    const timeRange = parseTimeRangeToMinutes(r.time_raw ?? r.time);
    const playersRange = parsePlayers(playersRaw);

    return {
      id: norm(r.id),
      name: norm(r.name),
      system: norm(r.system),
      author: norm(r.author),

      playersRaw,
      format: norm(r.format),
      timeRaw: norm(r.time_raw ?? r.time),

      r18Key,
      lossKey: loss.key,
      lossMin: loss.min,
      lossMax: loss.max,

      timeMin: timeRange.min,
      timeMax: timeRange.max,
      playersMin: playersRange.min,
      playersMax: playersRange.max,

      tags: splitTags(r.tags),
      memo: norm(r.memo),
      url: norm(r.url),
      trailers: splitTrailerUrls(r.trailer_urls || r.trailer_url),
      status: norm(r.status),
      createdAt: norm(r.created_at),
      updatedAt: norm(r.updated_at ?? r.updatedat ?? r.updated),
      fav: (typeof r.fav==="number" ? r.fav : null),
    };
  }

  function playersLabel(row){
    const a = row.playersMin, b = row.playersMax;
    if(a!=null && b!=null){
      if(a===b) return `${a}人`;
      return `${a}〜${b}人`;
    }
    if(a!=null && b==null) return `${a}人〜`;
    return row.playersRaw || "指定なし";
  }
  function timeLabel(row){
    const a = row.timeMin, b = row.timeMax;
    if(a!=null && b!=null){
      const ha = (Math.round((a/60)*10)/10).toString().replace(/\.0$/,"");
      const hb = (Math.round((b/60)*10)/10).toString().replace(/\.0$/,"");
      if(ha===hb) return `${ha}h`;
      return `${ha}〜${hb}h`;
    }
    if(a!=null && b==null){
      const ha = (Math.round((a/60)*10)/10).toString().replace(/\.0$/,"");
      return `${ha}h〜`;
    }
    if(a==null && b!=null){
      const hb = (Math.round((b/60)*10)/10).toString().replace(/\.0$/,"");
      return `〜${hb}h`;
    }
    return row.timeRaw || "指定なし";
  }

  /* tags ui */
  function rebuildTagChips(){
    if(!els.tagsChips || !els.tagsSelected) return;

    const all = state._allTags || [];
    const q = lower(els.tagsSearchInput?.value || "");
    const visible = all.filter(t => !q || lower(t).includes(q)).slice(0, 140);

    els.tagsChips.innerHTML = visible.map(t=>{
      const selected = state.selectedTags.has(t);
      return `<button type="button" class="sc-pill sc-tag ${selected?"is-selected":""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    }).join("");

    els.tagsSelected.innerHTML = Array.from(state.selectedTags).map(t=>{
      return `<button type="button" class="sc-pill sc-tag is-selected" data-tag="${escapeHtml(t)}" data-selected="1">${escapeHtml(t)} ✕</button>`;
    }).join("");

    if(els.tagsModeBtn) els.tagsModeBtn.textContent = `条件：${state.tagsMode.toUpperCase()}`;
  }

  function tagsMatch(row){
    if(state.selectedTags.size===0) return true;
    const rowTags = new Set(row.tags);
    if(state.tagsMode==="and"){
      for(const t of state.selectedTags) if(!rowTags.has(t)) return false;
      return true;
    }
    for(const t of state.selectedTags) if(rowTags.has(t)) return true;
    return false;
  }

  function searchMatch(row, q){
    const query = norm(q);
    if(!query) return true;
    const tokens = query.split(/\s+/).filter(Boolean).map(lower);
    const hay = lower([
      row.id,row.name,row.system,row.author,
      row.playersRaw, playersLabel(row),
      row.format,row.timeRaw,timeLabel(row),
      row.r18Key,row.lossKey,
      row.tags.join(" "),
      row.memo
    ].join(" / "));
    return tokens.every(t=>hay.includes(t));
  }

  function parseNumInput(el){
    const s = toHalfWidth(norm(el?.value));
    if(!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function rangeOverlap(rowMin,rowMax, qMin, qMax){
    if(qMin==null && qMax==null) return true;
    if(rowMin==null && rowMax==null) return false;

    const a = (rowMin==null ? rowMax : rowMin);
    const b = (rowMax==null ? rowMin : rowMax);
    let rMin = a, rMax = b;
    if(rMin==null && rMax==null) return false;
    if(rMin!=null && rMax!=null && rMin>rMax){ const t=rMin; rMin=rMax; rMax=t; }

    let fMin = qMin, fMax = qMax;
    if(fMin!=null && fMax!=null && fMin>fMax){ const t=fMin; fMin=fMax; fMax=t; }

    if(fMin!=null && rMax!=null && rMax < fMin) return false;
    if(fMax!=null && rMin!=null && rMin > fMax) return false;
    return true;
  }

  function r18Match(row, filterVal){
    if(!filterVal) return true;
    if(filterVal==="none") return row.r18Key==="none";
    if(filterVal==="unknown") return row.r18Key==="unknown";
    if(filterVal==="any") return isR18Key(row.r18Key);
    return true;
  }

  function parseIdNumber(id){
    const m = String(id||"").match(/(\d+)/);
    if(!m) return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : 0;
  }

  function applySort(){
    const key = norm(els.sortSelect?.value || lsGet(LS.SORT,"id_desc"));
    lsSet(LS.SORT, key);

    const byName = (a,b)=>(a.name||"").localeCompare(b.name||"","ja");
    const byId = (a,b)=>parseIdNumber(a.id)-parseIdNumber(b.id);
    const byUpdated = (a,b)=>{
      const ta = Date.parse(a.updatedAt||"")||0;
      const tb = Date.parse(b.updatedAt||"")||0;
      if(ta===tb) return byId(a,b);
      return ta - tb;
    };
    const byFav = (a,b)=>{
      const fa = isFav(a.id)?1:0;
      const fb = isFav(b.id)?1:0;
      if(fa===fb) return -byId(a,b);
      return fb-fa;
    };

    const cmp = {
      id_asc: byId,
      id_desc: (a,b)=>-byId(a,b),
      name_asc: byName,
      name_desc: (a,b)=>-byName(a,b),
      updated_asc: byUpdated,
      updated_desc: (a,b)=>-byUpdated(a,b),
      fav_desc: byFav,
    }[key] || ((a,b)=>-byId(a,b));

    state.filtered.sort(cmp);
  }

  function applyFilters(){
    const q = els.searchInput?.value || "";
    const system = norm(els.filterSystem?.value);
    const format = norm(els.filterFormat?.value);
    const r18 = norm(els.filterR18?.value);

    const pMin = parseNumInput(els.playersMin);
    const pMax = parseNumInput(els.playersMax);

    const tMinH = parseNumInput(els.timeMin);
    const tMaxH = parseNumInput(els.timeMax);
    const tMin = (tMinH==null) ? null : Math.round(tMinH*60);
    const tMax = (tMaxH==null) ? null : Math.round(tMaxH*60);

    const lMin = parseNumInput(els.lossMin);
    const lMax = parseNumInput(els.lossMax);
    const lfMin = (lMin==null) ? null : clampPct(Math.round(lMin));
    const lfMax = (lMax==null) ? null : clampPct(Math.round(lMax));

    state.filtered = state.rows.filter(row=>{
      if(system && row.system !== system) return false;
      if(format && row.format !== format) return false;
      if(!r18Match(row, r18)) return false;
      if(!tagsMatch(row)) return false;
      if(!searchMatch(row, q)) return false;

      if(!rangeOverlap(row.playersMin, row.playersMax, pMin, pMax)) return false;
      if(!rangeOverlap(row.timeMin, row.timeMax, tMin, tMax)) return false;
      if(!rangeOverlap(row.lossMin, row.lossMax, lfMin, lfMax)) return false;

      return true;
    });

    applySort();
  }

  /* paging */
  function getPage(){ return state.view==="cards" ? state.pageCards : state.pageTable; }
  function setPage(p){
    const v = clampInt(p,0,999999);
    if(state.view==="cards"){ state.pageCards=v; lsSet(LS.PAGE_CARDS,String(v)); }
    else{ state.pageTable=v; lsSet(LS.PAGE_TABLE,String(v)); }
  }

  function updatePagerUI(total){
    const pageSize = state.view==="cards" ? PAGE_SIZE.cards : PAGE_SIZE.table;
    const pages = Math.max(1, Math.ceil(total/pageSize));
    let page = clampInt(getPage(),0,pages-1);
    setPage(page);

    const start = total===0 ? 0 : page*pageSize+1;
    const end = Math.min(total, (page+1)*pageSize);

    if(els.pagerInfo) els.pagerInfo.textContent = total===0 ? "—" : `表示 ${start}–${end} / ${total}`;
    const prev = els.pagerHost?.querySelector?.('[data-pager="prev"]');
    const next = els.pagerHost?.querySelector?.('[data-pager="next"]');
    if(prev) prev.disabled = page<=0;
    if(next) next.disabled = page>=pages-1;
  }

  /* render */
  function render(){
    applyFilters();

    const total = state.filtered.length;
    if(els.resultInfo) els.resultInfo.textContent = `表示: ${total} 件 / 全体: ${state.rows.length} 件`;

    const latest = state.meta?.latest_updated_at ? ` / 最新更新: ${state.meta.latest_updated_at}` : "";
    if(els.metaRow) els.metaRow.textContent = `最終取得: ${nowLocal()}${latest}`;

    updatePagerUI(total);

    if(state.view==="cards") renderCards();
    else renderTable();
  }

  function renderCards(){
    if(!els.scenarioGrid) return;
    if(els.tableWrap) els.tableWrap.style.display="none";

    const pageSize = PAGE_SIZE.cards;
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total/pageSize));
    let page = clampInt(getPage(),0,pages-1);
    setPage(page);

    const slice = state.filtered.slice(page*pageSize, page*pageSize+pageSize);

    els.scenarioGrid.innerHTML = slice.map(r=>{
      const r18 = isR18Key(r.r18Key);
      const lossCls = lossClassFromKey(r.lossKey);
      const fav = isFav(r.id);

      const pills = [];
      if(r.system) pills.push(`<span class="sc-pill">${escapeHtml(r.system)}</span>`);
      pills.push(`<span class="sc-pill">人数:${escapeHtml(playersLabel(r))}</span>`);
      if(r.format) pills.push(`<span class="sc-pill">${escapeHtml(r.format)}</span>`);
      pills.push(`<span class="sc-pill">時間:${escapeHtml(timeLabel(r))}</span>`);
      pills.push(`<span class="sc-pill ${escapeHtml(lossCls)}">ロスト:${escapeHtml(r.lossKey==="unknown"?"不明":r.lossKey)}</span>`);
      if(r18) pills.push(`<span class="sc-pill sc-r18">🔞 ${escapeHtml(r18Label(r.r18Key))}</span>`);

      const tagsHtml = r.tags.slice(0,10).map(t=>
        `<button type="button" class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
      ).join("");

      const actions = [];
      if(r.url){
        actions.push(`<button type="button" class="sc-icon" data-action="open-url" data-url="${escapeHtml(r.url)}" data-r18="${r18?"1":"0"}" aria-label="外部リンク">🔗</button>`);
        actions.push(`<button type="button" class="sc-icon" data-action="copy-url" data-url="${escapeHtml(r.url)}" aria-label="URLコピー">📋</button>`);
      }
      actions.push(`<button type="button" class="sc-icon" data-action="toggle-fav" data-id="${escapeHtml(r.id)}" aria-label="お気に入り">${fav?"★":"☆"}</button>`);

      return `
        <article class="sc-card" data-action="open-detail" data-id="${escapeHtml(r.id)}">
          ${r.id ? `<div class="sc-id">${escapeHtml(r.id)}</div>` : ""}
          <div class="sc-title">${escapeHtml(r.name || "(no title)")}</div>
          ${r.author ? `<div class="muted" style="margin-top:6px;font-weight:900;">作者: ${escapeHtml(r.author)}</div>` : ""}
          <div class="sc-pillRow">${pills.join("")}</div>
          ${tagsHtml ? `<div class="sc-pillRow" style="margin-top:8px;">${tagsHtml}</div>` : ""}
          ${(!state.compact && r.memo) ? `<div class="sc-note">${escapeHtml(r.memo)}</div>` : ""}
          <div class="sc-actions">${actions.join("")}</div>
        </article>
      `;
    }).join("");
  }

  function renderTable(){
    if(!els.tableBody) return;

    if(els.tableWrap) els.tableWrap.style.display="";
    if(els.scenarioGrid) els.scenarioGrid.innerHTML="";

    const pageSize = PAGE_SIZE.table;
    const total = state.filtered.length;
    const pages = Math.max(1, Math.ceil(total/pageSize));
    let page = clampInt(getPage(),0,pages-1);
    setPage(page);

    const slice = state.filtered.slice(page*pageSize, page*pageSize+pageSize);

    els.tableBody.innerHTML = slice.map(r=>{
      const r18 = isR18Key(r.r18Key);
      const fav = isFav(r.id);
      const urlCell = r.url ? `
        <button type="button" class="sc-link-btn" data-action="open-url" data-url="${escapeHtml(r.url)}" data-r18="${r18?"1":"0"}">open</button>
        <button type="button" class="sc-link-btn" data-action="copy-url" data-url="${escapeHtml(r.url)}">copy</button>
      ` : "";

      return `
        <tr data-action="open-detail" data-id="${escapeHtml(r.id)}">
          <td>${escapeHtml(r.id)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.system)}</td>
          <td>${escapeHtml(playersLabel(r))}</td>
          <td>${escapeHtml(r.format)}</td>
          <td>${escapeHtml(timeLabel(r))}</td>
          <td>${escapeHtml(r18Label(r.r18Key))}</td>
          <td>${escapeHtml(r.lossKey==="unknown"?"不明":r.lossKey)}</td>
          <td><button type="button" class="sc-link-btn" data-action="toggle-fav" data-id="${escapeHtml(r.id)}">${fav?"★":"☆"}</button></td>
          <td>${urlCell}</td>
        </tr>
      `;
    }).join("");
  }

  /* modals */
  function openModal(modalEl){
    if(!modalEl) return;
    modalEl.classList.add("is-show");
    modalEl.setAttribute("aria-hidden","false");
    document.body.style.overflow="hidden";
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
    document.body.style.overflow="";
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

  /* confirm */
  function shouldSkipConfirm(){ return lsGet(LS.SKIP_CONFIRM,"0")==="1"; }
  function setSkipConfirm(v){ lsSet(LS.SKIP_CONFIRM, v ? "1":"0"); }

  function openConfirm(url,isR18){
    state.pendingOpenUrl = url;
    state.pendingOpenIsR18 = !!isR18;

    if(!state.pendingOpenIsR18 && shouldSkipConfirm()){
      window.open(url,"_blank","noopener,noreferrer");
      state.pendingOpenUrl = null;
      state.pendingOpenIsR18 = false;
      return;
    }

    if(!els.confirmModal || !els.confirmMessage || !els.confirmOk || !els.confirmCancel || !els.confirmDontAsk){
      const ok = window.confirm(state.pendingOpenIsR18
        ? "【R18注意】外部サイトへ移動しますか？"
        : "外部サイトへ移動しますか？");
      if(ok) window.open(url,"_blank","noopener,noreferrer");
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
    document.body.style.overflow="hidden";
  }

  function closeConfirm(){
    if(!els.confirmModal) return;
    els.confirmModal.classList.remove("is-show");
    els.confirmModal.setAttribute("aria-hidden","true");
    document.body.style.overflow="";
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
      window.open(url,"_blank","noopener,noreferrer");
      closeConfirm();
    });
    els.confirmCancel?.addEventListener("click", closeConfirm);
  }

  /* detail + trailer (前の版と同じ挙動) */
  function findById(id){ return state.rows.find(r=>r.id===id) || null; }

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
    state.trailerList = (row.trailers || []).slice();
    state.trailerIndex = 0;
    state.trailerBoundForId = null;

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
        <button type="button" class="sc-icon" data-action="toggle-fav" data-id="${escapeHtml(row.id)}" aria-label="お気に入り">${isFav(row.id)?"★":"☆"}</button>
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
            <div>人数: <strong>${escapeHtml(playersLabel(row))}</strong></div>
            <div>時間: <strong>${escapeHtml(timeLabel(row))}</strong></div>
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

    const idx = clampInt(state.trailerIndex,0,list.length-1);
    state.trailerIndex = idx;

    img.src = list[idx];
    img.dataset.src = list[idx];

    dots.innerHTML = list.map((_,i)=>
      `<button type="button" class="trailer-dot ${i===idx?"is-active":""}" data-index="${i}" aria-label="画像 ${i+1}"></button>`
    ).join("");

    const showNav = list.length>1;
    if(prev) prev.style.display = showNav ? "" : "none";
    if(next) next.style.display = showNav ? "" : "none";

    if(state.trailerBoundForId !== state.activeId){
      state.trailerBoundForId = state.activeId;

      prev?.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation();
        state.trailerIndex = (state.trailerIndex - 1 + state.trailerList.length) % state.trailerList.length;
        renderTrailer();
      });
      next?.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation();
        state.trailerIndex = (state.trailerIndex + 1) % state.trailerList.length;
        renderTrailer();
      });

      dots.addEventListener("click",(e)=>{
        const dot = e.target.closest(".trailer-dot");
        if(!dot) return;
        const i = parseInt(dot.dataset.index,10);
        if(Number.isFinite(i)){
          state.trailerIndex = i;
          renderTrailer();
        }
      });

      img.addEventListener("click",(e)=>{
        e.preventDefault(); e.stopPropagation();
        if(img.dataset.src) openZoom(img.dataset.src);
      });

      let startX = null;
      viewport.addEventListener("pointerdown",(e)=>{
        startX = e.clientX;
        viewport.setPointerCapture?.(e.pointerId);
      });
      viewport.addEventListener("pointerup",(e)=>{
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

  /* prefs/view */
  function applyUiPrefs(){
    document.body.classList.toggle("is-compact", !!state.compact);
    if(els.toggleCompact) els.toggleCompact.checked = !!state.compact;
    if(els.toggleShowTrailers) els.toggleShowTrailers.checked = !!state.trailersEnabled;
    if(els.tagsModeBtn) els.tagsModeBtn.textContent = `条件：${state.tagsMode.toUpperCase()}`;
  }
  function saveUiPrefs(){
    lsSet(LS.TAG_MODE, state.tagsMode);
    lsSet(LS.COMPACT, state.compact ? "1":"0");
    lsSet(LS.SHOW_TRAILERS, state.trailersEnabled ? "1":"0");
  }
  function setView(view){
    state.view = view;
    lsSet(LS.VIEW, view);
    document.querySelectorAll(".sc-tab").forEach(t=>{
      t.classList.toggle("is-active", t.dataset.view === view);
    });
    setPage(0);
    render();
  }

  /* cache */
  function cacheSave(rows, meta){
    try{
      lsSet(LS.CACHE_ROWS, JSON.stringify(rows));
      lsSet(LS.CACHE_AT, String(Date.now()));
      if(meta) lsSet(LS.CACHE_META, JSON.stringify(meta));
    }catch{}
  }
  function cacheLoad(){
    try{
      const raw = lsGet(LS.CACHE_ROWS,"");
      const at = Number(lsGet(LS.CACHE_AT,"0")) || 0;
      const data = safeJSONParse(raw);
      const rows = extractRows(data) || (Array.isArray(data)?data:[]);
      let meta = null;
      const metaRaw = lsGet(LS.CACHE_META,"");
      const metaObj = safeJSONParse(metaRaw);
      if(metaObj && typeof metaObj==="object") meta = metaObj;
      if(!Array.isArray(rows) || rows.length===0) return { rows:[], at:0, meta };
      return { rows, at, meta };
    }catch{ return { rows:[], at:0, meta:null }; }
  }

  async function loadData(isReload=false){
    try{
      setStatus("取得中…");

      const cache = cacheLoad();
      if(cache.rows.length){
        state.rawRows = cache.rows;
        state.rows = state.rawRows.map(normalizeRow);
        state.meta = cache.meta;
        setStatus(`キャッシュ表示：${state.rows.length}件`);
        afterDataPrepared();
        render();
      }

      const first = await safeFetchText(API_URL, 25000);
      if(!first.ok) throw new Error(`HTTP ${first.status}`);

      const parsed = safeJSONParse(first.text);
      if(!parsed) throw new Error("NON_JSON");

      const okFlag = (parsed && typeof parsed==="object" && "ok" in parsed) ? !!parsed.ok : true;
      const rowsRaw = extractRows(parsed);
      const meta = extractMeta(parsed);

      if(!okFlag && rowsRaw.length===0) throw new Error("API_OK_FALSE");
      if(!Array.isArray(rowsRaw) || rowsRaw.length===0) throw new Error("EMPTY");

      state.rawRows = rowsRaw;
      state.rows = state.rawRows.map(normalizeRow);
      state.meta = meta;

      cacheSave(rowsRaw, meta);

      afterDataPrepared();

      setStatus(`OK：${state.rows.length}件 取得`);
      if(isReload) toast("更新しました");
      render();
    }catch(err){
      console.error(err);
      const cache = cacheLoad();
      if(cache.rows.length){
        state.meta = cache.meta;
        setStatus("同期できません（キャッシュ表示）");
        afterDataPrepared();
        if(isReload) toast("同期できません（キャッシュ表示）");
        render();
      }else{
        setStatus("取得失敗：API / 公開設定を確認");
        toast("取得に失敗しました");
      }
    }
  }

  function afterDataPrepared(){
    buildSelectOptions(els.filterSystem, state.rows.map(r=>r.system), "指定なし");
    buildSelectOptions(els.filterFormat, state.rows.map(r=>r.format), "指定なし");

    // metaの top_tags があるならそれ優先でタグ並びを良くする
    const metaTags = Array.isArray(state.meta?.top_tags)
      ? state.meta.top_tags.map(x=>x?.tag).filter(Boolean)
      : [];

    const allFromRows = uniqSorted(state.rows.flatMap(r=>r.tags));
    const setAll = new Set(allFromRows);

    const ordered = [];
    for(const t of metaTags){
      if(setAll.has(t)) ordered.push(t);
    }
    for(const t of allFromRows){
      if(!ordered.includes(t)) ordered.push(t);
    }

    state._allTags = ordered;
    rebuildTagChips();

    if(els.sortSelect && !els.sortSelect.value){
      els.sortSelect.value = lsGet(LS.SORT,"id_desc");
    }
  }

  /* events */
  function debounce(fn, wait){
    let t=null;
    return (...args)=>{
      clearTimeout(t);
      t=setTimeout(()=>fn(...args), wait);
    };
  }

  function resetFilters(){
    if(els.searchInput) els.searchInput.value = "";
    if(els.sortSelect) els.sortSelect.value = lsGet(LS.SORT, "id_desc");
    if(els.filterSystem) els.filterSystem.value = "";
    if(els.filterFormat) els.filterFormat.value = "";
    if(els.filterR18) els.filterR18.value = "";

    if(els.playersMin) els.playersMin.value = "";
    if(els.playersMax) els.playersMax.value = "";
    if(els.timeMin) els.timeMin.value = "";
    if(els.timeMax) els.timeMax.value = "";
    if(els.lossMin) els.lossMin.value = "";
    if(els.lossMax) els.lossMax.value = "";

    state.selectedTags.clear();
    rebuildTagChips();
    setPage(0);
    render();
    toast("条件をリセット");
  }

  function bindEvents(){
    els.themeToggle?.addEventListener("click", ()=>{
      const now = document.documentElement.getAttribute("data-theme") || "dark";
      const next = now==="light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      lsSet(LS.THEME, next);
      toast(`テーマ：${next}`);
    });

    els.refreshBtn?.addEventListener("click", ()=>loadData(true));
    els.resetFiltersBtn?.addEventListener("click", resetFilters);

    const rerender = debounce(()=>{ setPage(0); render(); }, 90);

    els.searchInput?.addEventListener("input", rerender);
    els.sortSelect?.addEventListener("change", rerender);

    els.filterSystem?.addEventListener("change", rerender);
    els.filterFormat?.addEventListener("change", rerender);
    els.filterR18?.addEventListener("change", rerender);

    els.playersMin?.addEventListener("input", rerender);
    els.playersMax?.addEventListener("input", rerender);
    els.timeMin?.addEventListener("input", rerender);
    els.timeMax?.addEventListener("input", rerender);
    els.lossMin?.addEventListener("input", rerender);
    els.lossMax?.addEventListener("input", rerender);

    els.playersClear?.addEventListener("click", ()=>{
      if(els.playersMin) els.playersMin.value="";
      if(els.playersMax) els.playersMax.value="";
      setPage(0); render(); toast("人数の範囲をクリア");
    });
    els.timeClear?.addEventListener("click", ()=>{
      if(els.timeMin) els.timeMin.value="";
      if(els.timeMax) els.timeMax.value="";
      setPage(0); render(); toast("時間の範囲をクリア");
    });
    els.lossClear?.addEventListener("click", ()=>{
      if(els.lossMin) els.lossMin.value="";
      if(els.lossMax) els.lossMax.value="";
      setPage(0); render(); toast("ロスト率の範囲をクリア");
    });

    els.toggleCompact?.addEventListener("change", ()=>{
      state.compact = !!els.toggleCompact.checked;
      saveUiPrefs();
      applyUiPrefs();
      render();
    });

    els.toggleShowTrailers?.addEventListener("change", ()=>{
      state.trailersEnabled = !!els.toggleShowTrailers.checked;
      saveUiPrefs();
      applyUiPrefs();
      render();
    });

    els.tagsSearchInput?.addEventListener("input", debounce(rebuildTagChips, 80));

    els.tagsClearBtn?.addEventListener("click", ()=>{
      state.selectedTags.clear();
      rebuildTagChips();
      setPage(0);
      render();
      toast("タグを解除");
    });

    els.tagsModeBtn?.addEventListener("click", ()=>{
      state.tagsMode = state.tagsMode==="or" ? "and" : "or";
      saveUiPrefs();
      applyUiPrefs();
      rebuildTagChips();
      setPage(0);
      render();
      toast(`タグ条件：${state.tagsMode.toUpperCase()}`);
    });

    document.querySelectorAll(".sc-tab").forEach(btn=>{
      btn.addEventListener("click", ()=>setView(btn.dataset.view));
    });

    document.addEventListener("click", (e)=>{
      const pager = e.target.closest("[data-pager]");
      if(pager){
        const dir = pager.getAttribute("data-pager");
        const total = state.filtered.length;
        const pageSize = state.view==="cards" ? PAGE_SIZE.cards : PAGE_SIZE.table;
        const pages = Math.max(1, Math.ceil(total/pageSize));
        let page = clampInt(getPage(),0,pages-1);
        if(dir==="prev") page = Math.max(0, page-1);
        if(dir==="next") page = Math.min(pages-1, page+1);
        setPage(page);
        render();
        return;
      }

      const copyBtn = e.target.closest('[data-action="copy-url"]');
      if(copyBtn){
        e.preventDefault(); e.stopPropagation();
        const url = copyBtn.dataset.url || "";
        if(url) copyText(url);
        return;
      }

      const openBtn = e.target.closest('[data-action="open-url"]');
      if(openBtn){
        e.preventDefault(); e.stopPropagation();
        const url = openBtn.dataset.url || "";
        const isR18 = openBtn.dataset.r18 === "1";
        if(url) openConfirm(url, isR18);
        return;
      }

      const favBtn = e.target.closest('[data-action="toggle-fav"]');
      if(favBtn){
        e.preventDefault(); e.stopPropagation();
        toggleFav(favBtn.dataset.id || "");
        return;
      }

      const tagBtn = e.target.closest("[data-tag]");
      if(tagBtn){
        e.preventDefault(); e.stopPropagation();
        const t = tagBtn.dataset.tag;
        if(!t) return;
        if(tagBtn.dataset.selected==="1") state.selectedTags.delete(t);
        else{
          if(state.selectedTags.has(t)) state.selectedTags.delete(t);
          else state.selectedTags.add(t);
        }
        rebuildTagChips();
        setPage(0);
        render();
        return;
      }

      const detailEl = e.target.closest('[data-action="open-detail"]');
      if(detailEl){
        if(e.target.closest('[data-action="open-url"],[data-action="copy-url"],[data-action="toggle-fav"]')) return;
        const id = detailEl.dataset.id;
        if(id) openDetail(id);
        return;
      }
    }, { passive:false });
  }

  function applyThemeFromLS(){
    const saved = lsGet(LS.THEME,"");
    if(saved==="light" || saved==="dark") document.documentElement.setAttribute("data-theme", saved);
  }

  function applyUiPrefs(){
    document.body.classList.toggle("is-compact", !!state.compact);
    if(els.toggleCompact) els.toggleCompact.checked = !!state.compact;
    if(els.toggleShowTrailers) els.toggleShowTrailers.checked = !!state.trailersEnabled;
    if(els.tagsModeBtn) els.tagsModeBtn.textContent = `条件：${state.tagsMode.toUpperCase()}`;
  }
  function saveUiPrefs(){
    lsSet(LS.TAG_MODE, state.tagsMode);
    lsSet(LS.COMPACT, state.compact ? "1":"0");
    lsSet(LS.SHOW_TRAILERS, state.trailersEnabled ? "1":"0");
  }
  function setView(view){
    state.view = view;
    lsSet(LS.VIEW, view);
    document.querySelectorAll(".sc-tab").forEach(t=>{
      t.classList.toggle("is-active", t.dataset.view === view);
    });
    setPage(0);
    render();
  }

  function boot(){
    applyThemeFromLS();
    applyUiPrefs();
    initModalCloseHandlers();
    bindConfirmButtons();
    bindEvents();
    setView(state.view);
    if(els.sortSelect) els.sortSelect.value = lsGet(LS.SORT,"id_desc");
    loadData(false);
  }

  boot();
})();