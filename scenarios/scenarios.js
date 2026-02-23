/* scenarios.js (FINAL) */

const API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

const els = {
  status: document.getElementById("status"),
  metaRow: document.getElementById("metaRow"),

  q: document.getElementById("q"),
  system: document.getElementById("system"),
  format: document.getElementById("format"),
  players: document.getElementById("players"),
  time: document.getElementById("time"),
  r18: document.getElementById("r18"),
  loss_rate: document.getElementById("loss_rate"),

  btnClear: document.getElementById("btnClear"),
  btnCopyQuery: document.getElementById("btnCopyQuery"),
  btnCopyResult: document.getElementById("btnCopyResult"),

  cards: document.getElementById("cards"),
  tableWrap: document.getElementById("tableWrap"),
  tableBody: document.getElementById("tableBody"),

  resultInfo: document.getElementById("resultInfo"),
  toast: document.getElementById("toast"),
};

let RAW = [];
let VIEW = "cards";

function norm(s){
  return String(s ?? "").trim();
}

function lower(s){
  return norm(s).toLowerCase();
}

function showToast(msg){
  const t = els.toast;
  if (!t) return;
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.remove("is-show"), 1600);
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    showToast("コピーしました");
  }catch(e){
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("コピーしました");
  }
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json(); // ★改行バグ修正
}

function buildSystemOptions(rows){
  const set = new Set();
  rows.forEach(r => {
    const v = norm(r.system);
    if (v) set.add(v);
  });
  const list = Array.from(set).sort((a,b)=>a.localeCompare(b,"ja"));
  // reset
  els.system.innerHTML = `<option value="">すべて</option>` +
    list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function timeBucket(t){
  const s = lower(t);
  if (!s) return "";
  if (s.includes("40") && (s.includes("+") || s.includes("以上") || s.includes("40h+"))) return "40h+";
  if (s.includes("30") && s.includes("40")) return "30-40h";
  if (s.includes("20") && s.includes("30")) return "20-30h";
  if (s.includes("10") && s.includes("20")) return "10-20h";
  if (s.includes("~10") || s.includes("〜10") || s.includes("10時間未満")) return "~10h";
  // ざっくり fallback
  return "";
}

function matchToken(hay, needle){
  return lower(hay).includes(lower(needle));
}

function rowText(r){
  // 検索対象の全文（増えてもここに足せばOK）
  return [
    r.id, r.name, r.system, r.author, r.players, r.format, r.time,
    r.r18, r.loss_rate, r.tags, r.memo, r.url
  ].map(norm).join(" / ");
}

function applyFilters(rows){
  const q = norm(els.q.value);
  const system = norm(els.system.value);
  const format = norm(els.format.value);
  const players = norm(els.players.value);
  const time = norm(els.time.value);
  const r18 = norm(els.r18.value);
  const loss = norm(els.loss_rate.value);

  return rows.filter(r => {
    if (system && norm(r.system) !== system) return false;

    if (format){
      // format欄が「どちらでも」ならボイセ/テキセ両方に寄せる
      const rf = norm(r.format);
      if (format === "どちらでも"){
        if (!rf) return false;
        if (!(rf.includes("どちら") || rf.includes("ボイセ") || rf.includes("テキセ"))) return false;
      }else{
        if (!rf.includes(format)) return false;
      }
    }

    if (players){
      const rp = norm(r.players);
      if (!rp.includes(players)) return false;
    }

    if (time){
      const bucket = timeBucket(r.time);
      if (bucket !== time) return false;
    }

    if (r18){
      const rr = norm(r.r18) || "不明";
      if (rr !== r18) return false;
    }

    if (loss){
      const rl = norm(r.loss_rate) || "不明";
      if (rl !== loss) return false;
    }

    if (q){
      const t = rowText(r);
      // スペース区切りAND検索
      const parts = q.split(/\s+/).filter(Boolean);
      for (const p of parts){
        if (!matchToken(t, p)) return false;
      }
    }

    return true;
  });
}

function lossClass(v){
  const s = String(v || "");
  if (!s || s==="不明") return "loss-unknown";

  const m = s.match(/(\d+)-(\d+)/);
  if (!m) return "loss-unknown";

  const avg = (parseInt(m[1])+parseInt(m[2]))/2;
  if (avg <= 30) return "loss-low";
  if (avg <= 50) return "loss-mid";
  if (avg <= 70) return "loss-high";
  return "loss-very";
}

function renderCard(r){
  const id = norm(r.id);
  const name = norm(r.name);
  const system = norm(r.system);
  const players = norm(r.players);
  const format = norm(r.format);
  const time = norm(r.time);
  const r18 = norm(r.r18);
  const loss = norm(r.loss_rate) || "不明";
  const tags = norm(r.tags);
  const memo = norm(r.memo);
  const url = norm(r.url);

  const lossCls = lossClass(loss);

  const tagHtml = tags
    ? tags.split(/[,\s]+/)
        .filter(Boolean)
        .map(t=>`<span class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
        .join("")
    : "";

  return `
  <div class="sc-card">
    ${id?`<div class="sc-id">${escapeHtml(id)}</div>`:""}
    <div class="sc-title">${escapeHtml(name)}</div>

    <div class="sc-pillRow">
      ${system?`<span class="sc-pill">${escapeHtml(system)}</span>`:""}
      ${players?`<span class="sc-pill">${escapeHtml(players)}</span>`:""}
      ${format?`<span class="sc-pill">${escapeHtml(format)}</span>`:""}
      ${time?`<span class="sc-pill">${escapeHtml(time)}</span>`:""}
      <span class="sc-pill ${lossCls}">ロスト:${escapeHtml(loss)}</span>
      ${r18==="あり"?`<span class="sc-pill sc-r18">🔞 R18</span>`:""}
    </div>

    ${tagHtml?`<div class="sc-pillRow" style="margin-top:8px;">${tagHtml}</div>`:""}

    ${memo?`<div class="sc-note">${escapeHtml(memo)}</div>`:""}

    <div class="sc-actions">
      ${url?`<span class="sc-icon" data-copy="${escapeHtml(url)}">🔗</span>`:""}
      ${memo?`<span class="sc-icon" data-copy="${escapeHtml(memo)}">📋</span>`:""}
    </div>
  </div>
  `;
}

function buildLineCopy(r){
  // 1行で共有しやすい形式（Discord貼り向き）
  const name = norm(r.name);
  const id = norm(r.id);
  const system = norm(r.system);
  const players = norm(r.players);
  const format = norm(r.format);
  const time = norm(r.time);
  const r18 = norm(r.r18) || "不明";
  const loss = norm(r.loss_rate) || "不明";
  const url = norm(r.url);

  const left = [
    id && `[${id}]`,
    name,
    system && `(${system})`,
  ].filter(Boolean).join(" ");

  const right = [
    players && `人数:${players}`,
    format && `形式:${format}`,
    time && `時間:${time}`,
    `R18:${r18}`,
    `ロスト:${loss}`,
    url && `URL:${url}`
  ].filter(Boolean).join(" / ");

  return `${left}\n${right}`;
}

function renderTableRow(r){
  const id = norm(r.id);
  const name = norm(r.name);
  const system = norm(r.system);
  const players = norm(r.players);
  const format = norm(r.format);
  const time = norm(r.time);
  const r18 = norm(r.r18) || "不明";
  const loss = norm(r.loss_rate) || "不明";
  const tags = norm(r.tags);
  const url = norm(r.url);

  return `
  <tr>
    <td>${escapeHtml(id)}</td>
    <td>${escapeHtml(name)}</td>
    <td>${escapeHtml(system)}</td>
    <td>${escapeHtml(players)}</td>
    <td>${escapeHtml(format)}</td>
    <td>${escapeHtml(time)}</td>
    <td>${escapeHtml(r18)}</td>
    <td>${escapeHtml(loss)}</td>
    <td>${escapeHtml(tags)}</td>
    <td>${url ? `<a class="sc-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">open</a>` : ""}</td>
  </tr>`;
}

function setView(view){
  VIEW = view;
  const tabs = document.querySelectorAll(".sc-tab");
  tabs.forEach(t => t.classList.toggle("is-active", t.dataset.view === view));

  if (view === "cards"){
    els.cards.style.display = "";
    els.tableWrap.style.display = "none";
  }else{
    els.cards.style.display = "none";
    els.tableWrap.style.display = "";
  }
}

function currentQueryText(count){
  const parts = [];
  const q = norm(els.q.value);
  if (q) parts.push(`q="${q}"`);
  if (els.system.value) parts.push(`system=${els.system.value}`);
  if (els.format.value) parts.push(`format=${els.format.value}`);
  if (els.players.value) parts.push(`players=${els.players.value}`);
  if (els.time.value) parts.push(`time=${els.time.value}`);
  if (els.r18.value) parts.push(`r18=${els.r18.value}`);
  if (els.loss_rate.value) parts.push(`loss=${els.loss_rate.value}`);
  return `条件: ${parts.join(" / ") || "なし"}\n件数: ${count}`;
}

function render(){
  const filtered = applyFilters(RAW);

  els.resultInfo.textContent = `表示: ${filtered.length} 件 / 全体: ${RAW.length} 件`;
  els.cards.innerHTML = filtered.map(renderCard).join("");

  els.tableBody.innerHTML = filtered.map(renderTableRow).join("");

  // meta
  if (els.metaRow){
    els.metaRow.style.display = "";
    els.metaRow.textContent = `最終取得: ${new Date().toLocaleString()} / 表示 ${filtered.length}件`;
  }

  return filtered.length;
}

function bindEvents(){
  // filter inputs
  ["input","change"].forEach(ev=>{
    els.q.addEventListener(ev, ()=>render());
  });
  [els.system, els.format, els.players, els.time, els.r18, els.loss_rate].forEach(el=>{
    el.addEventListener("change", ()=>render());
  });

  els.btnClear.addEventListener("click", ()=>{
    els.q.value = "";
    els.system.value = "";
    els.format.value = "";
    els.players.value = "";
    els.time.value = "";
    els.r18.value = "";
    els.loss_rate.value = "";
    render();
    showToast("条件をクリア");
  });

  els.btnCopyQuery.addEventListener("click", ()=>{
    const count = applyFilters(RAW).length;
    copyText(currentQueryText(count));
  });

  els.btnCopyResult.addEventListener("click", ()=>{
    const count = applyFilters(RAW).length;
    copyText(String(count));
  });

  // view tabs
  document.querySelectorAll(".sc-tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      setView(btn.dataset.view);
    });
  });

  // copy button delegation
  document.addEventListener("click", (e)=>{
    const btn = e.target.closest(".sc-copy");
    if (!btn) return;
    const text = btn.getAttribute("data-copy") || "";
    if (text) copyText(text);
  });

  document.addEventListener("click", e=>{
    const tag = e.target.closest(".sc-tag");
    if(tag){
      els.q.value = tag.dataset.tag;
      render();
    }
  });
}

function normalizeRows(rows){
  // GASはヘッダを小文字化して返す想定。もし混ざってても吸収。
  return rows.map(r=>{
    const obj = {};
    Object.keys(r).forEach(k=>{
      obj[String(k).toLowerCase()] = r[k];
    });

    // 不明補完（表示側）
    if (!norm(obj.r18)) obj.r18 = "不明";
    if (!norm(obj.loss_rate)) obj.loss_rate = "不明";

    return obj;
  });
}

async function main(){
  try{
    els.status.textContent = "取得中…";
    const data = await fetchJSON(API_URL);
    if (!data.ok) throw new Error(data.error || "API error");

    RAW = normalizeRows(data.rows || []);
    buildSystemOptions(RAW);

    els.status.textContent = `OK：${RAW.length}件 取得`;
    bindEvents();
    setView("cards");
    render();

  }catch(err){
    els.status.textContent = "取得失敗：API設定/公開設定/URL を確認";
    console.error(err);
  }
}

main();