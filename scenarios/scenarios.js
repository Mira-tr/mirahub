/* ===============================
   MIRAHUB Scenarios (Full)
   - Fetch from GAS JSON
   - Fallback to /data/scenarios.json
   - Search + filters
   - Copy buttons
================================= */

const GAS_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";
const FALLBACK_JSON = "../data/scenarios.json";

const $ = (id) => document.getElementById(id);

const state = {
  items: [],
  filtered: [],
  source: "loading", // gas | fallback | error
};

function norm(s){
  return (s ?? "").toString().trim();
}

function timeBucket(text){
  // 例: "ボイセ10時間~40時間" "テキセ10~35時間" "20-30" 等をざっくり分類
  const t = norm(text);
  if (!t) return "";
  const nums = t.match(/\d+/g)?.map(n => parseInt(n,10)) ?? [];
  const max = nums.length ? Math.max(...nums) : null;

  if (max === null) return "";
  if (max <= 10) return "~10h";
  if (max <= 20) return "10-20h";
  if (max <= 30) return "20-30h";
  if (max <= 40) return "30-40h";
  return "40h+";
}

function playersNormalize(p){
  const v = norm(p);
  if (!v) return "";
  // 表記ゆれ吸収（好きに増やせる）
  if (/kp\s*レス/i.test(v) || v.includes("KPレス")) return "KPレス";
  if (v.includes("KPC+1") || v.includes("KPC＋1") || v.includes("KPC+1PL")) return "KPC+1PL";
  if (v.includes("1PL") || v === "1") return "1PL";
  if (v.includes("2PL") || v === "2") return "2PL";
  if (v.includes("3PL") || v === "3") return "3PL";
  if (v.includes("4PL") || v === "4") return "4PL";
  if (v.includes("何人") || v.includes("自由") || v.includes("無制限")) return "PL何人でも";
  return v; // そのまま（その他扱いでもOK）
}

function formatNormalize(f){
  const v = norm(f);
  if (!v) return "";
  if (v.includes("ボイ")) return "ボイセ";
  if (v.includes("テキ")) return "テキセ";
  if (v.includes("どちら")) return "どちらでも";
  return v;
}

function buildIndex(item){
  return [
    item.id,
    item.name,
    item.system,
    item.author,
    item.players,
    item.format,
    item.time_text,
    item.tags?.join(" "),
    item.memo,
    item.url
  ].filter(Boolean).join(" ").toLowerCase();
}

async function fetchJson(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function loadData(){
  $("status").textContent = "読み込み中…";
  $("srcMode").textContent = "source: loading";

  try{
    const data = await fetchJson(GAS_URL);
    const items = normalizeData(data);
    state.items = items;
    state.source = "gas";
    $("srcMode").textContent = "source: GAS";
    $("status").textContent = `取得OK（${items.length}件）`;
    initUI();
    applyFilters();
    return;
  }catch(e){
    console.warn("GAS failed:", e);
  }

  try{
    const data = await fetchJson(FALLBACK_JSON);
    const items = normalizeData(data);
    state.items = items;
    state.source = "fallback";
    $("srcMode").textContent = "source: fallback JSON";
    $("status").textContent = `GAS取得失敗 → 予備データで表示（${items.length}件）`;
    initUI();
    applyFilters();
    return;
  }catch(e){
    console.error("Fallback failed:", e);
    state.source = "error";
    $("srcMode").textContent = "source: error";
    $("status").textContent = "データ取得に失敗。GAS/予備JSONのどちらも読めません。";
  }
}

function normalizeData(raw){
  // GASの戻りが {items:[...]} でも [...] でも対応
  const arr = Array.isArray(raw) ? raw : (raw.items ?? []);
  return arr.map((r, idx) => {
    const id = norm(r.id) || `S${String(idx+1).padStart(4,"0")}`;
    const name = norm(r.name || r.title);
    const system = norm(r.system || r.sys) || "未設定";
    const author = norm(r.author);
    const playersRaw = norm(r.players);
    const players = playersNormalize(playersRaw);
    const format = formatNormalize(r.format);
    const timeText = norm(r.time || r.time_text);
    const tags = (norm(r.tags).split(",").map(s=>s.trim()).filter(Boolean));
    const memo = norm(r.memo || r.note);
    const url = norm(r.url);

    const item = {
      id,
      name,
      system,
      author,
      players,
      format,
      time_text: timeText,
      time_bucket: timeBucket(timeText),
      tags,
      memo,
      url,
    };
    item.__index = buildIndex(item);
    return item;
  }).filter(x => x.name); // 名前なしは除外
}

function initUI(){
  // system select populate
  const systems = [...new Set(state.items.map(x => x.system))].sort((a,b)=>a.localeCompare(b,"ja"));
  const sel = $("system");
  // 初期化
  while(sel.options.length > 1) sel.remove(1);
  systems.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

function getQuery(){
  return {
    q: norm($("q").value).toLowerCase(),
    system: $("system").value,
    format: $("format").value,
    players: $("players").value,
    time: $("time").value,
  };
}

function match(item, query){
  if (query.system && item.system !== query.system) return false;
  if (query.format && item.format !== query.format) return false;

  if (query.players){
    if (query.players === "その他"){
      // 定義済み以外をざっくり
      const known = ["KPレス","1PL","KPC+1PL","2PL","3PL","4PL","PL何人でも"];
      if (known.includes(item.players)) return false;
    }else{
      if (item.players !== query.players) return false;
    }
  }

  if (query.time && item.time_bucket !== query.time) return false;

  if (query.q){
    if (!item.__index.includes(query.q)) return false;
  }
  return true;
}

function applyFilters(){
  const query = getQuery();
  const list = state.items.filter(x => match(x, query));
  state.filtered = list;

  render(list);
  $("count").textContent = `${list.length}件`;
}

function badge(text){
  const span = document.createElement("span");
  span.className = "sc-badge";
  span.textContent = text;
  return span;
}

function btn(label, onClick){
  const b = document.createElement("button");
  b.className = "sc-btn";
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  }catch(e){
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("コピーしました");
  }
}

let toastTimer = null;
function toast(msg){
  let el = document.getElementById("toast");
  if (!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "12px";
    el.style.border = "1px solid rgba(255,255,255,.12)";
    el.style.background = "rgba(17,24,38,.95)";
    el.style.color = "white";
    el.style.fontSize = "13px";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.opacity = "0";
  }, 1200);
}

function render(items){
  const root = $("list");
  root.innerHTML = "";

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "text-muted";
    empty.style.padding = "10px 0";
    empty.textContent = "該当なし。条件を変えてみて。";
    root.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "sc-card";

    const top = document.createElement("div");
    top.className = "sc-top";

    const left = document.createElement("div");

    const title = document.createElement("div");
    title.className = "sc-title";
    title.textContent = item.name;

    const sub = document.createElement("div");
    sub.className = "sc-sub";
    sub.textContent = [
      item.system,
      item.author ? `作者: ${item.author}` : null,
      item.players ? `人数: ${item.players}` : null,
      item.format ? `形式: ${item.format}` : null,
      item.time_text ? `時間: ${item.time_text}` : null
    ].filter(Boolean).join(" / ");

    left.appendChild(title);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "sc-actions";

    actions.appendChild(btn("IDコピー", () => copyText(item.id)));
    actions.appendChild(btn("名前コピー", () => copyText(item.name)));

    if (item.url){
      actions.appendChild(btn("URLコピー", () => copyText(item.url)));
      actions.appendChild(btn("開く", () => window.open(item.url, "_blank", "noreferrer")));
    }

    top.appendChild(left);
    top.appendChild(actions);

    const badges = document.createElement("div");
    badges.className = "sc-badges";
    badges.appendChild(badge(item.id));
    badges.appendChild(badge(item.system));
    if (item.players) badges.appendChild(badge(item.players));
    if (item.format) badges.appendChild(badge(item.format));
    if (item.time_bucket) badges.appendChild(badge(item.time_bucket));
    (item.tags ?? []).slice(0, 8).forEach(t => badges.appendChild(badge(t)));

    card.appendChild(top);
    card.appendChild(badges);

    if (item.memo){
      const note = document.createElement("div");
      note.className = "sc-note";
      note.textContent = item.memo;
      card.appendChild(note);
    }

    root.appendChild(card);
  });
}

function buildQueryText(){
  const q = getQuery();
  const parts = [];
  if (q.q) parts.push(`q=${q.q}`);
  if (q.system) parts.push(`system=${q.system}`);
  if (q.format) parts.push(`format=${q.format}`);
  if (q.players) parts.push(`players=${q.players}`);
  if (q.time) parts.push(`time=${q.time}`);
  return parts.join(" / ") || "条件なし";
}

function wire(){
  ["q","system","format","players","time"].forEach(id => {
    $(id).addEventListener(id==="q" ? "input" : "change", applyFilters);
  });

  $("btnClear").addEventListener("click", () => {
    $("q").value = "";
    $("system").value = "";
    $("format").value = "";
    $("players").value = "";
    $("time").value = "";
    applyFilters();
  });

  $("btnReload").addEventListener("click", loadData);

  $("btnCopyQuery").addEventListener("click", () => {
    copyText(buildQueryText());
  });

  $("btnCopyShare").addEventListener("click", () => {
    copyText(location.href);
  });
}

wire();
loadData();