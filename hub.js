// /hub.js
(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec?action=list";
  const API_META = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec?action=meta";

  const LS = {
    THEME: "mirahub.theme",
    CACHE: "mirahub.cache.rows.v2",
    CACHE_AT: "mirahub.cache.at.v2",
    PICKED_TAGS: "mirahub.hub.pickedTags.v2",
    SEED_DAY: "mirahub.hub.seedDay.v2",
    SEED_VAL: "mirahub.hub.seedVal.v2",
  };

  const els = {
    themeToggle: document.getElementById("themeToggle"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnRetry: document.getElementById("btnRetry"),
    syncBanner: document.getElementById("syncBanner"),

    kpiCount: document.getElementById("kpiCount"),
    kpiUpdated: document.getElementById("kpiUpdated"),
    kpiStatus: document.getElementById("kpiStatus"),

    recGrid: document.getElementById("recGrid"),
    recInfo: document.getElementById("recInfo"),
    btnRecPrev: document.getElementById("btnRecPrev"),
    btnRecNext: document.getElementById("btnRecNext"),

    topTags: document.getElementById("topTags"),
    pickedTags: document.getElementById("pickedTags"),
    btnClearTags: document.getElementById("btnClearTags"),
    btnSearchWithTags: document.getElementById("btnSearchWithTags"),

    btnTagModal: document.getElementById("btnTagModal"),
    tagModal: document.getElementById("tagModal"),
    tagSearch: document.getElementById("tagSearch"),
    tagList: document.getElementById("tagList"),
    modalPicked: document.getElementById("modalPicked"),
    btnTagSearchClear: document.getElementById("btnTagSearchClear"),
    btnGoWithTagsModal: document.getElementById("btnGoWithTagsModal"),
    btnGoWithTags: document.getElementById("btnGoWithTags"),

    popover: document.getElementById("popover"),
    popoverTitle: document.getElementById("popoverTitle"),
    popoverBody: document.getElementById("popoverBody"),
    popoverClose: document.getElementById("popoverClose"),
    popoverMore: document.getElementById("popoverMore"),
    helpModal: document.getElementById("helpModal"),
    helpBody: document.getElementById("helpBody"),
    btnHelpHub: document.getElementById("btnHelpHub"),
    btnHelpMore: document.getElementById("btnHelpMore"),

    toastHost: document.getElementById("toastHost"),

    fabTop: document.getElementById("fabTop"),
    btnScrollTop: document.getElementById("btnScrollTop"),
  };

  const state = {
    rows: [],
    ok: false,
    fromCache: false,

    tagsFreq: new Map(),
    allTags: [],

    picked: new Set(),

    recPage: 0,
    recPageSize: 6,
    recPages: 1,

    featuredFixed: [],
    featuredRecent: [],
    featuredDaily: [],
  };

  function norm(v){ return String(v ?? "").trim(); }
  function lower(v){ return norm(v).toLowerCase(); }

  function toast(msg){
    if(!els.toastHost) return;
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = msg;
    els.toastHost.appendChild(node);
    void node.offsetWidth;
    node.classList.add("is-show");
    setTimeout(() => {
      node.classList.remove("is-show");
      setTimeout(() => node.remove(), 220);
    }, 1700);
  }

  function lsGet(key, fallback=null){
    try{
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    }catch{ return fallback; }
  }
  function lsSet(key, value){
    try{ localStorage.setItem(key, String(value)); }catch{}
  }

  function setTheme(next){
    document.documentElement.setAttribute("data-theme", next);
    lsSet(LS.THEME, next);
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
    const t = setTimeout(() => ctrl.abort(), ms);
    const p = (async()=>{
      try{ return await fn(ctrl.signal); }
      finally{ clearTimeout(t); }
    })();
    return p;
  }

  async function safeFetchText(url, ms=25000){
    return withTimeout(async(signal) => {
      const res = await fetch(url, { cache: "no-store", signal });
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

  function splitTags(raw){
    const s = norm(raw);
    if(!s) return [];
    return s.split(/[,\s/・]+/).map(t=>norm(t)).filter(Boolean);
  }

  function normalizeRow(input){
    const r = {};
    for(const k of Object.keys(input || {})) r[String(k).toLowerCase()] = input[k];

    const id = norm(r.id).replace(/^#/, "");
    const name = norm(r.name);
    const system = norm(r.system);
    const author = norm(r.author);
    const players = norm(r.players_raw || r.players);
    const format = norm(r.format);
    const time = norm(r.time_raw || r.time);
    const tags = splitTags(r.tags).map(t => t.startsWith("#") ? t : `#${t}`);
    const updatedAt = norm(r.updated_at || r.updatedat || r.updated || r.updatedtime || r.updated_time);

    return { id, name, system, author, players, format, time, tags, updatedAt };
  }

  function cacheSave(rows){
    try{
      lsSet(LS.CACHE, JSON.stringify(rows));
      lsSet(LS.CACHE_AT, String(Date.now()));
    }catch{}
  }

  function cacheLoad(){
    try{
      const raw = lsGet(LS.CACHE, "");
      const at = Number(lsGet(LS.CACHE_AT, "0")) || 0;
      const data = safeJSONParse(raw);
      const rows = extractRows(data) || (Array.isArray(data) ? data : []);
      if(!Array.isArray(rows) || rows.length === 0) return { rows:[], at:0 };
      return { rows, at };
    }catch{
      return { rows:[], at:0 };
    }
  }

  function fmtDate(ts){
    if(!ts) return "—";
    try{
      return new Date(ts).toLocaleString();
    }catch{
      return "—";
    }
  }

  function seedOfDay(){
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    let savedDay = lsGet(LS.SEED_DAY, "");
    let savedSeed = Number(lsGet(LS.SEED_VAL, "0")) || 0;
    if(savedDay !== day || !savedSeed){
      savedSeed = Math.floor(Math.random()*1e9);
      lsSet(LS.SEED_DAY, day);
      lsSet(LS.SEED_VAL, String(savedSeed));
    }
    return savedSeed >>> 0;
  }

  function mulberry32(a){
    return function(){
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildTagsIndex(rows){
    const freq = new Map();
    for(const row of rows){
      for(const tag of row.tags){
        const t = tag.startsWith("#") ? tag : `#${tag}`;
        const k = lower(t);
        freq.set(k, (freq.get(k) || 0) + 1);
      }
    }
    const all = Array.from(freq.entries())
      .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0],"ja"))
      .map(([k])=>k);

    state.tagsFreq = freq;
    state.allTags = all;
  }

  function pickedLoad(){
    try{
      const raw = lsGet(LS.PICKED_TAGS, "[]");
      const arr = safeJSONParse(raw);
      if(Array.isArray(arr)) state.picked = new Set(arr.filter(Boolean));
    }catch{}
  }
  function pickedSave(){
    try{ lsSet(LS.PICKED_TAGS, JSON.stringify(Array.from(state.picked))); }catch{}
  }

  function updateTagLinks(){
    const qs = Array.from(state.picked);
    const query = qs.map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
    const href = query ? `./scenarios/?q=${encodeURIComponent(query)}` : `./scenarios/`;

    if(els.btnSearchWithTags) els.btnSearchWithTags.href = href;
    if(els.btnGoWithTags) els.btnGoWithTags.href = href;
    if(els.btnGoWithTagsModal) els.btnGoWithTagsModal.href = href;
  }

  function chipHTML(tag, count, selected=false){
    const safeTag = tag.replace(/"/g,"&quot;");
    const cls = selected ? "chip is-selected" : "chip";
    const label = Number.isFinite(count) && count > 0 ? `${safeTag} ${count}` : safeTag;
    return `<button type="button" class="${cls}" data-tag="${safeTag}">${label}</button>`;
  }

  function renderPicked(){
    if(!els.pickedTags) return;
    const arr = Array.from(state.picked);

    els.pickedTags.innerHTML = arr.length
      ? arr.map(t => chipHTML(t, 0, true)).join("")
      : `<span class="text-muted">—</span>`;

    if(els.modalPicked){
      els.modalPicked.innerHTML = arr.length
        ? arr.map(t => chipHTML(t, 0, true)).join("")
        : `<span class="text-muted">—</span>`;
    }

    updateTagLinks();
  }

  function renderTopTags(){
    if(!els.topTags) return;
    const top = state.allTags.slice(0, 18);
    els.topTags.innerHTML = top.map(t => {
      const c = state.tagsFreq.get(t) || 0;
      const sel = state.picked.has(t);
      return chipHTML(t, c, sel);
    }).join("");
  }

  function renderTagListModal(){
    if(!els.tagList) return;
    const q = lower(els.tagSearch?.value || "");
    const items = state.allTags.filter(t => !q || lower(t).includes(q)).slice(0, 240);

    els.tagList.innerHTML = items.map(t => {
      const c = state.tagsFreq.get(t) || 0;
      const sel = state.picked.has(t);
      return chipHTML(t, c, sel);
    }).join("");
  }

  function pickToggle(tag){
    const t = norm(tag);
    if(!t) return;
    if(state.picked.has(t)) state.picked.delete(t);
    else state.picked.add(t);

    pickedSave();
    renderPicked();
    renderTopTags();
    renderTagListModal();
  }

  function pill(v, cls=""){
    const t = norm(v);
    if(!t) return "";
    const safe = t.replace(/[<>]/g, m => m === "<" ? "&lt;" : "&gt;");
    return `<span class="pill ${cls}">${safe}</span>`;
  }

  function cardTitle(row){
    return row.name || "(no title)";
  }

  function bestReason(kind){
    if(kind === "fixed") return "固定：ミラの推し";
    if(kind === "recent") return "最近：追加/更新";
    if(kind === "daily") return "日替わり：世界線の偶然";
    return "おすすめ";
  }

  function makeCard(row, kind){
    const id = row.id ? row.id.replace(/[<>]/g, "") : "";
    const title = cardTitle(row).replace(/[<>]/g, "");
    const author = row.author ? row.author.replace(/[<>]/g, "") : "";
    const system = pill(row.system, "pill-acc");
    const format = pill(row.format);
    const players = pill(row.players);
    const time = pill(row.time);
    const tag = row.tags[0] ? pill(row.tags[0], "pill-gold") : "";

    const sub = author ? `作者: ${author}` : "クリックで一覧へ";
    const href = row.id ? `./scenarios/?id=${encodeURIComponent(row.id)}` : `./scenarios/`;

    return `
      <a class="card" href="${href}" data-id="${id}" data-kind="${kind}">
        <div class="card-top">
          <div class="card-title">${title}</div>
          ${id ? `<div class="card-id">${id}</div>` : ``}
        </div>
        <div class="pills">
          ${system}${players}${format}${time}${tag}
        </div>
        <div class="card-sub">${sub}</div>
        <div class="card-foot">
          <div class="card-reason">${bestReason(kind)}</div>
          <div class="card-go">→</div>
        </div>
      </a>
    `;
  }

  function parseISOor0(s){
    const t = Date.parse(s || "");
    return Number.isFinite(t) ? t : 0;
  }

  function pickFeatured(rows){
    const list = rows.slice();

    const fixed = list
      .filter(r => r.tags.some(t => lower(t) === "#pin" || lower(t) === "pin" || lower(t) === "★" || lower(t) === "#★" || lower(t) === "#favpin"))
      .slice(0, 3);

    const recent = list
      .slice()
      .sort((a,b) => parseISOor0(b.updatedAt) - parseISOor0(a.updatedAt))
      .filter(r => r.updatedAt)
      .slice(0, 3);

    const seed = seedOfDay();
    const rnd = mulberry32(seed);
    const pool = list.filter(r => r.name);
    const daily = [];
    const used = new Set([...fixed, ...recent].map(r => r.id));

    for(let i=0; i<3 && pool.length; i++){
      const idx = Math.floor(rnd() * pool.length);
      const pick = pool.splice(idx, 1)[0];
      if(used.has(pick.id)) { i--; continue; }
      daily.push(pick);
      used.add(pick.id);
    }

    state.featuredFixed = fixed;
    state.featuredRecent = recent;
    state.featuredDaily = daily;
  }

  function renderRecommended(){
    if(!els.recGrid || !els.recInfo) return;

    const blocks = [
      ...state.featuredFixed.map(r => ({ row:r, kind:"fixed" })),
      ...state.featuredRecent.map(r => ({ row:r, kind:"recent" })),
      ...state.featuredDaily.map(r => ({ row:r, kind:"daily" })),
    ].filter(x => x.row && x.row.id);

    const total = blocks.length;

    if(total === 0){
      els.recGrid.innerHTML = `
        <div class="card" tabindex="0">
          <div class="card-top">
            <div class="card-title">おすすめを生成できません</div>
            <div class="card-id">—</div>
          </div>
          <div class="card-sub">同期後に表示されます。</div>
          <div class="card-foot"><div class="card-reason">—</div><div class="card-go">→</div></div>
        </div>
      `;
      els.recInfo.textContent = "—";
      return;
    }

    const pages = Math.max(1, Math.ceil(total / state.recPageSize));
    state.recPages = pages;
    state.recPage = Math.max(0, Math.min(state.recPage, pages - 1));

    const start = state.recPage * state.recPageSize;
    const slice = blocks.slice(start, start + state.recPageSize);

    els.recGrid.innerHTML = slice.map(({row, kind}) => makeCard(row, kind)).join("");
    els.recInfo.textContent = `表示: ${start+1}–${Math.min(total, start+slice.length)} / ${total}`;
  }

  function setKpis({count, updated, status}){
    if(els.kpiCount) els.kpiCount.textContent = count ?? "—";
    if(els.kpiUpdated) els.kpiUpdated.textContent = updated ?? "—";
    if(els.kpiStatus) els.kpiStatus.textContent = status ?? "—";
  }

  function showSyncBanner(show){
    if(!els.syncBanner) return;
    els.syncBanner.hidden = !show;
  }

  function normalizeAll(rows){
    return rows.map(normalizeRow).filter(r => r.id || r.name);
  }

  async function loadRemoteRows(){
    const first = await safeFetchText(API_URL, 25000);
    if(!first.ok) throw new Error(`HTTP ${first.status}`);
    const parsed = safeJSONParse(first.text);
    if(!parsed) throw new Error("NON_JSON");
    const okFlag = (parsed && typeof parsed === "object" && "ok" in parsed) ? !!parsed.ok : true;
    const rowsRaw = extractRows(parsed);
    if(!okFlag && rowsRaw.length === 0) throw new Error("API_OK_FALSE");
    return rowsRaw;
  }

  async function loadMetaOnly(){
    const m = await safeFetchText(API_META, 20000);
    if(!m.ok) return null;
    const parsed = safeJSONParse(m.text);
    if(!parsed || parsed.ok === false) return null;
    return parsed.meta || null;
  }

  async function loadData({force=false}={}) {
    state.ok = false;
    state.fromCache = false;

    const cache = cacheLoad();
    if(cache.rows.length){
      state.rows = normalizeAll(cache.rows);
      state.fromCache = true;

      setKpis({
        count: `${state.rows.length}+`,
        updated: fmtDate(cache.at),
        status: "キャッシュ",
      });

      buildTagsIndex(state.rows);
      pickFeatured(state.rows);
      renderTopTags();
      renderPicked();
      renderRecommended();
    } else {
      setKpis({ count:"—", updated:"—", status:"取得中…" });
    }

    showSyncBanner(false);

    try{
      const remoteRows = await loadRemoteRows();
      const normalized = normalizeAll(remoteRows);
      if(normalized.length === 0) throw new Error("EMPTY");

      state.rows = normalized;
      state.ok = true;
      state.fromCache = false;

      cacheSave(remoteRows);

      // meta is optional but helps (fast KPI)
      const meta = await loadMetaOnly();

      setKpis({
        count: `${state.rows.length}+`,
        updated: meta?.latest_updated_at ? fmtDate(meta.latest_updated_at) : fmtDate(Date.now()),
        status: "同期OK",
      });

      buildTagsIndex(state.rows);
      pickFeatured(state.rows);
      renderTopTags();
      renderPicked();
      renderRecommended();

      if(force) toast("更新しました");
    }catch(err){
      state.ok = false;

      if(state.fromCache && state.rows.length){
        showSyncBanner(true);
        setKpis({
          count: `${state.rows.length}+`,
          updated: fmtDate(Number(lsGet(LS.CACHE_AT,"0"))||0),
          status: "キャッシュ",
        });
        if(force) toast("同期できません（キャッシュ表示）");
      }else{
        showSyncBanner(true);
        setKpis({ count:"—", updated:"—", status:"取得失敗" });
        if(force) toast("取得に失敗しました");
      }
    }
  }

  function openModal(modal){
    if(!modal) return;
    modal.classList.add("is-show");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    const panel = modal.querySelector(".modal-panel");
    if(panel){
      panel.setAttribute("tabindex","-1");
      panel.focus({ preventScroll:true });
    }
  }

  function closeModal(modal){
    if(!modal) return;
    modal.classList.remove("is-show");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  const HELP = {
    hub: {
      title: "このページの使い方",
      body: "「おすすめ」で触れてから、人気タグで世界線を絞り、一覧へ飛びます。更新は必要な時だけでOK。",
      more: `
        <h3>おすすめ</h3>
        <ul>
          <li><b>固定</b>：#pin / ★ などが付いたシナリオ</li>
          <li><b>最近</b>：updated_at が新しいもの</li>
          <li><b>日替わり</b>：毎日ランダムに変わる</li>
        </ul>
        <h3>タグ</h3>
        <ul>
          <li>人気タグを上に表示</li>
          <li>「タグ一覧」で検索して追加</li>
          <li>選んだ条件は一覧へ引き継ぎ</li>
        </ul>
      `,
    },
    recommended: {
      title: "おすすめとは",
      body: "固定 / 最近 / 日替わり の3枠で軽量に作成。カードを押すと一覧へ移動します。",
      more: `
        <h3>固定</h3>
        <ul><li>タグに <b>#pin</b> / <b>★</b> を入れると載りやすい</li></ul>
        <h3>最近</h3>
        <ul><li>updated_at がある行を優先</li></ul>
        <h3>日替わり</h3>
        <ul><li>毎日ランダム（軽量）</li></ul>
      `,
    },
    tags: {
      title: "タグの使い方",
      body: "人気タグはここで選択。「タグ一覧」では検索して追加できます。",
      more: `
        <h3>一覧へ引き継ぎ</h3>
        <ul>
          <li>選んだタグは一覧のキーワードへ渡します</li>
          <li>例：<b>#coc6 #クローズド</b></li>
        </ul>
        <h3>コツ</h3>
        <ul>
          <li># が付いていなくても自動で補完</li>
          <li>表記ゆれは後で辞書化できます</li>
        </ul>
      `,
    },
    shortcuts: {
      title: "ショートカット",
      body: "迷わない導線。ワンクリックで目的へ。",
      more: `
        <h3>一覧</h3>
        <ul><li>検索・絞り込み・詳細モーダル</li></ul>
        <h3>タグ</h3>
        <ul><li>世界線に飛ぶ</li></ul>
      `,
    },
  };

  function popoverOpen(key){
    const h = HELP[key] || HELP.hub;
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
    const h = HELP[key] || HELP.hub;
    if(!els.helpModal || !els.helpBody) return;

    els.helpBody.innerHTML = `
      <div class="prose">
        <p class="text-muted" style="margin:0 0 10px; line-height:1.8;">${h.body}</p>
        ${h.more || ""}
      </div>
    `;
    openModal(els.helpModal);
  }

  function smoothTop(){
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bind(){
    els.themeToggle?.addEventListener("click", () => {
      const now = document.documentElement.getAttribute("data-theme") || "dark";
      const next = now === "light" ? "dark" : "light";
      setTheme(next);
      toast(`テーマ：${next}`);
    });

    els.btnRefresh?.addEventListener("click", () => loadData({force:true}));
    els.btnRetry?.addEventListener("click", () => loadData({force:true}));

    els.btnRecPrev?.addEventListener("click", () => {
      state.recPage = Math.max(0, state.recPage - 1);
      renderRecommended();
    });
    els.btnRecNext?.addEventListener("click", () => {
      state.recPage = Math.min(state.recPages - 1, state.recPage + 1);
      renderRecommended();
    });

    els.btnTagModal?.addEventListener("click", () => {
      renderTagListModal();
      openModal(els.tagModal);
      setTimeout(() => els.tagSearch?.focus?.(), 50);
    });

    els.btnTagSearchClear?.addEventListener("click", () => {
      if(els.tagSearch) els.tagSearch.value = "";
      renderTagListModal();
      els.tagSearch?.focus?.();
    });

    els.tagSearch?.addEventListener("input", () => renderTagListModal());

    els.btnClearTags?.addEventListener("click", () => {
      state.picked.clear();
      pickedSave();
      renderPicked();
      renderTopTags();
      renderTagListModal();
      toast("クリアしました");
    });

    els.btnHelpHub?.addEventListener("click", () => helpOpen("hub"));
    els.btnHelpMore?.addEventListener("click", () => helpOpen("hub"));

    els.fabTop?.addEventListener("click", smoothTop);
    els.btnScrollTop?.addEventListener("click", smoothTop);
    els.fabTop?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); smoothTop(); }});

    document.addEventListener("click", (e) => {
      const close = e.target.closest("[data-close]");
      if(close){
        const modal = e.target.closest(".modal");
        if(modal) closeModal(modal);
        return;
      }

      const helpBtn = e.target.closest("[data-help]");
      if(helpBtn){
        const key = helpBtn.getAttribute("data-help");
        if(key) popoverOpen(key);
        return;
      }

      const chip = e.target.closest("[data-tag]");
      if(chip){
        const t = chip.getAttribute("data-tag");
        if(t) pickToggle(t);
        return;
      }
    });

    window.addEventListener("keydown", (e) => {
      if(e.key !== "Escape") return;
      if(els.helpModal?.classList.contains("is-show")) closeModal(els.helpModal);
      else if(els.tagModal?.classList.contains("is-show")) closeModal(els.tagModal);
      else if(els.popover?.classList.contains("is-show")) popoverClose();
    });

    els.popoverClose?.addEventListener("click", popoverClose);
    els.popoverMore?.addEventListener("click", () => {
      const key = els.popover?.dataset.key || "hub";
      popoverClose();
      helpOpen(key);
    });

    document.addEventListener("pointerdown", (e) => {
      if(!els.popover?.classList.contains("is-show")) return;
      const inside = e.target.closest(".popover-panel") || e.target.closest("[data-help]");
      if(!inside) popoverClose();
    });
  }

  function boot(){
    pickedLoad();
    renderPicked();
    updateTagLinks();
    bind();
    loadData({force:false});
  }

  boot();
})();