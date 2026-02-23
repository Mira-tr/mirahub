/* hub.js - MIRAHUB Top (6:4 heavy x mystic) */

const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

const LS = {
  THEME: "mirahub.theme",
  CACHE: "mirahub.scenariosCache.v1", // { ts:number, rows:any[] }
};

const els = {
  themeToggle: document.getElementById("themeToggle"),
  btnRandom: document.getElementById("btnRandom"),
  btnSync: document.getElementById("btnSync"),
  hubStatus: document.getElementById("hubStatus"),

  kpiCount: document.getElementById("kpiCount"),
  kpiFavSum: document.getElementById("kpiFavSum"),
  kpiUpdated: document.getElementById("kpiUpdated"),
  kpiTop1: document.getElementById("kpiTop1"),

  rankStrip: document.getElementById("rankStrip"),
  rankEmpty: document.getElementById("rankEmpty"),
  rankSub: document.getElementById("rankSub"),

  newGrid: document.getElementById("newGrid"),
};

const state = {
  rows: [],
  ready: false,
};

function norm(v){ return String(v ?? "").trim(); }

function safeJSONParse(s){
  try{ return JSON.parse(s); }catch{ return null; }
}
function lsGet(key){
  try{ return localStorage.getItem(key); }catch{ return null; }
}
function lsSet(key, val){
  try{ localStorage.setItem(key, val); }catch{}
}

function setTheme(next){
  document.documentElement.setAttribute("data-theme", next);
  lsSet(LS.THEME, next);
}

function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function loadCache(){
  const raw = lsGet(LS.CACHE);
  if(!raw) return null;
  const obj = safeJSONParse(raw);
  if(!obj || !Array.isArray(obj.rows) || typeof obj.ts !== "number") return null;
  return obj;
}

function saveCache(rows){
  const payload = { ts: Date.now(), rows };
  lsSet(LS.CACHE, JSON.stringify(payload));
}

function isFresh(ts){
  const TEN_MIN = 10 * 60 * 1000;
  return (Date.now() - ts) <= TEN_MIN;
}

/* Row helpers (top needs only a few fields) */
function lowerKeys(input){
  const out = {};
  for(const k of Object.keys(input || {})){
    out[String(k).toLowerCase()] = input[k];
  }
  return out;
}
function parseIdNumber(id){
  const m = String(id || "").match(/(\d+)/);
  return m ? (parseInt(m[1],10) || 0) : 0;
}
function parseUpdated(row){
  const s = norm(row.updatedat || row.updated_at || row.updated);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
function favCount(row){
  const n = Number(row.favcount ?? row.fav_count ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(rows){
  return (rows || []).map(r=>{
    const o = lowerKeys(r);
    return {
      id: norm(o.id),
      name: norm(o.name),
      system: norm(o.system),
      url: norm(o.url),
      updatedAtRaw: norm(o.updatedat || o.updated_at || o.updated),
      updatedAt: parseUpdated(o),
      fav: favCount(o),
      r18: norm(o.r18), // only used as tiny badge if you want later
    };
  }).filter(r=>r.id && r.name);
}

/* Decide whether favorites are "grown" */
function favoritesGrown(rows){
  // Switch rule: at least 5 scenarios with fav>0
  let c = 0;
  for(const r of rows){
    if((r.fav|0) > 0) c++;
    if(c >= 5) return true;
  }
  return false;
}

function renderKpi(rows){
  if(!rows || rows.length===0) return;

  const count = rows.length;
  const favSum = rows.reduce((a,r)=>a + (r.fav|0), 0);

  const updatedMax = rows.reduce((a,r)=>Math.max(a, r.updatedAt||0), 0);
  const updatedText = updatedMax ? new Date(updatedMax).toLocaleDateString() : "—";

  // top1 by fav then updated then id
  const sorted = [...rows].sort((a,b)=>{
    if(b.fav !== a.fav) return b.fav - a.fav;
    if((b.updatedAt||0) !== (a.updatedAt||0)) return (b.updatedAt||0) - (a.updatedAt||0);
    return parseIdNumber(a.id) - parseIdNumber(b.id);
  });
  const top = sorted[0];
  const topText = top ? `${top.name}（★${top.fav||0}）` : "—";

  if(els.kpiCount) els.kpiCount.textContent = String(count);
  if(els.kpiFavSum) els.kpiFavSum.textContent = String(favSum);
  if(els.kpiUpdated) els.kpiUpdated.textContent = updatedText;
  if(els.kpiTop1) els.kpiTop1.textContent = topText;
}

function renderTop10(rows){
  if(!els.rankStrip) return;
  if(!rows || rows.length===0){
    if(els.rankEmpty) els.rankEmpty.style.display = "";
    return;
  }
  if(els.rankEmpty) els.rankEmpty.style.display = "none";

  const grown = favoritesGrown(rows);

  let list;
  if(grown){
    if(els.rankSub) els.rankSub.textContent = "みんなのお気に入りが多い順";
    list = [...rows].sort((a,b)=>{
      if(b.fav !== a.fav) return b.fav - a.fav;
      if((b.updatedAt||0) !== (a.updatedAt||0)) return (b.updatedAt||0) - (a.updatedAt||0);
      return parseIdNumber(a.id) - parseIdNumber(b.id);
    });
  }else{
    if(els.rankSub) els.rankSub.textContent = "集計準備中：いまは新着TOP10を表示";
    list = [...rows].sort((a,b)=>{
      if((b.updatedAt||0) !== (a.updatedAt||0)) return (b.updatedAt||0) - (a.updatedAt||0);
      return parseIdNumber(b.id) - parseIdNumber(a.id);
    });
  }

  const top10 = list.slice(0,10);

  els.rankStrip.innerHTML = top10.map((r, i)=>{
    const href = `./scenarios/#${encodeURIComponent(r.id)}`;
    const star = grown ? `<span class="pill pill-strong">★ ${r.fav|0}</span>` : `<span class="pill pill-strong">NEW</span>`;
    const sys = r.system ? `<div class="rank-system">${escapeHtml(r.system)}</div>` : `<div class="rank-system">—</div>`;

    return `
      <a class="rank-card" href="${href}">
        <div class="rank-top">
          <div class="rank-no">#${i+1}</div>
          <div class="rank-meta">${star}</div>
        </div>
        <div class="rank-title">${escapeHtml(r.name)}</div>
        ${sys}
        <div class="rank-badges">
          <span class="pill">${escapeHtml(r.id)}</span>
        </div>
      </a>
    `;
  }).join("");
}

function renderLatest3(rows){
  if(!els.newGrid) return;
  if(!rows || rows.length===0){
    els.newGrid.innerHTML = `<div class="new-empty text-muted">データ未取得</div>`;
    return;
  }

  const list = [...rows].sort((a,b)=>{
    if((b.updatedAt||0) !== (a.updatedAt||0)) return (b.updatedAt||0) - (a.updatedAt||0);
    return parseIdNumber(b.id) - parseIdNumber(a.id);
  }).slice(0,3);

  els.newGrid.innerHTML = list.map(r=>{
    const href = `./scenarios/#${encodeURIComponent(r.id)}`;
    const sub = [
      r.system ? `System: ${r.system}` : null,
      r.updatedAt ? `Updated: ${new Date(r.updatedAt).toLocaleDateString()}` : null
    ].filter(Boolean).join(" / ");

    return `
      <a class="new-card" href="${href}">
        <div class="new-title">${escapeHtml(r.name)}</div>
        <div class="new-sub">${escapeHtml(sub || "—")}</div>
        <div class="new-cta">詳細を見る →</div>
      </a>
    `;
  }).join("");
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function setStatus(text){
  if(els.hubStatus) els.hubStatus.textContent = text;
}

function applyData(rows, sourceLabel){
  state.rows = rows;
  state.ready = rows.length > 0;

  renderKpi(rows);
  renderTop10(rows);
  renderLatest3(rows);

  setStatus(sourceLabel);
}

async function syncData(){
  setStatus("取得中…");
  try{
    const data = await fetchJSON(API_URL);
    if(!data || data.ok === false) throw new Error(data?.error || "API error");

    const rows = normalizeRows(Array.isArray(data.rows) ? data.rows : []);
    saveCache(data.rows || []);

    applyData(rows, `同期OK：${rows.length}件（更新: ${new Date().toLocaleTimeString()}）`);
  }catch(e){
    console.error(e);
    setStatus("取得失敗：API/公開設定を確認");
  }
}

function pickRandomId(){
  if(!state.ready || state.rows.length===0) return null;
  const idx = Math.floor(Math.random() * state.rows.length);
  return state.rows[idx]?.id || null;
}

function rollThenNavigate(url){
  const btn = els.btnRandom;
  if(!btn){
    window.location.href = url;
    return;
  }

  if(prefersReducedMotion()){
    window.location.href = url;
    return;
  }

  btn.classList.remove("is-rolling", "is-rolling2");
  btn.classList.add("is-rolling");
  setTimeout(()=> btn.classList.add("is-rolling2"), 120);
  setTimeout(()=> {
    btn.classList.remove("is-rolling", "is-rolling2");
    window.location.href = url;
  }, 250);
}

function bind(){
  // theme
  els.themeToggle?.addEventListener("click", ()=>{
    const now = document.documentElement.getAttribute("data-theme") || "dark";
    const next = now === "light" ? "dark" : "light";
    setTheme(next);
  });

  // random
  els.btnRandom?.addEventListener("click", ()=>{
    const id = pickRandomId();
    const target = id ? `./scenarios/#${encodeURIComponent(id)}` : `./scenarios/`;
    rollThenNavigate(target);
  });

  // manual sync
  els.btnSync?.addEventListener("click", syncData);
}

function boot(){
  bind();

  // Load cache if exists
  const cache = loadCache();
  if(cache && Array.isArray(cache.rows)){
    const rows = normalizeRows(cache.rows);
    if(rows.length){
      const label = isFresh(cache.ts)
        ? `キャッシュ：${rows.length}件（10分以内）`
        : `キャッシュ：${rows.length}件（古い）※必要なら「データ取得」`;
      applyData(rows, label);
    }else{
      setStatus("キャッシュ空");
    }
  }else{
    setStatus("キャッシュ未取得");
  }
}

boot();