/* scenarios.js (MIRAHUB FINAL v1) */

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
  btnReload: document.getElementById("btnReload"),

  cards: document.getElementById("cards"),
  tableWrap: document.getElementById("tableWrap"),
  tableBody: document.getElementById("tableBody"),

  resultInfo: document.getElementById("resultInfo"),
  toast: document.getElementById("toast"),
};

let RAW = [];
let VIEW = "cards";

// ---------- utils ----------
function norm(s){ return String(s ?? "").trim(); }
function lower(s){ return norm(s).toLowerCase(); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

function showToast(msg){
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.add("is-show");
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(()=>els.toast.classList.remove("is-show"), 1600);
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    showToast("コピーしました");
  }catch(e){
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
  return await res.json();
}

// ---------- domain helpers ----------
function timeBucket(t){
  const s = lower(t);
  if (!s) return "";
  if (s.includes("40") && (s.includes("+") || s.includes("以上") || s.includes("40h+"))) return "40h+";
  if (s.match(/30\s*[-〜~]\s*40/)) return "30-40h";
  if (s.match(/20\s*[-〜~]\s*30/)) return "20-30h";
  if (s.match(/10\s*[-〜~]\s*20/)) return "10-20h";
  if (s.includes("~10") || s.includes("〜10") || s.includes("10時間未満")) return "~10h";
  return "";
}

/** R18を正規化：sheetが soft/hard/true 等でも「あり」扱いにする */
function normalizeR18(v){
  const s = lower(v);
  if (!s) return "不明";
  if (["あり","yes","true","1","r18","🔞","soft","hard","adult"].includes(s)) return "あり";
  if (["なし","no","false","0","clean","全年齢"].includes(s)) return "なし";
  return "不明";
}

/** loss_rate を正規化：空は不明。 0-10 / 40-70 などはそのまま */
function normalizeLoss(v){
  const s = norm(v);
  return s ? s : "不明";
}

function lossClass(v){
  const s = String(v || "");
  if (!s || s==="不明") return "loss-unknown";
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return "loss-unknown";
  const avg = (parseInt(m[1],10) + parseInt(m[2],10)) / 2;
  if (avg <= 30) return "loss-low";
  if (avg <= 50) return "loss-mid";
  if (avg <= 70) return "loss-high";
  return "loss-very";
}

function rowText(r){
  return [
    r.id, r.name, r.system, r.author, r.players, r.format, r.time,
    r.r18, r.loss_rate, r.tags, r.memo, r.url, r.trailer_url
  ].map(norm).join(" / ");
}

function matchToken(hay, needle){
  return lower(hay).includes(lower(needle));
}

// ---------- rendering ----------
function renderCard(r){
  const id = norm(r.id);
  const name = norm(r.name);
  const system = norm(r.system);
  const players = norm(r.players);
  const format = norm(r.format);
  const time = norm(r.time);
  const r18 = normalizeR18(r.r18);
  const loss = normalizeLoss(r.loss_rate);
  const tags = norm(r.tags);
  const memo = norm(r.memo);
  const url = norm(r.url);
  const trailer = norm(r.trailer_url);

  const isR18 = (r18 === "あり");
  const lossCls = lossClass(loss);

  const tagHtml = tags
    ? tags.split(/[,\s]+/).filter(Boolean)
        .map(t=>`<span class="sc-pill sc-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
        .join("")
    : "";

  return `
  <div class="sc-card ${isR18 ? "is-r18" : ""}">
    ${id ? `<div class="sc-id">${escapeHtml(id)}</div>` : ""}
    <div class="sc-title">${escapeHtml(name)}</div>

    <div class="sc-pillRow">
      ${system ? `<span class="sc-pill">${escapeHtml(system)}</span>` : ""}
      ${players ? `<span class="sc-pill">${escapeHtml(players)}</span>` : ""}
      ${format ? `<span class="sc-pill">${escapeHtml(format)}</span>` : ""}
      ${time ? `<span class="sc-pill">${escapeHtml(time)}</span>` : ""}
      <span class="sc-pill ${lossCls}">ロスト:${escapeHtml(loss)}</span>
      ${isR18 ? `<span class="sc-pill sc-r18">🔞 R18</span>` : ""}
    </div>

    ${tagHtml ? `<div class="sc-pillRow" style="margin-top:8px;">${tagHtml}</div>` : ""}

    ${memo ? `<div class="sc-note">${escapeHtml(memo)}</div>` : ""}

    <div class="sc-actions">
      ${trailer ? `
        <button type="button"
          class="sc-icon sc-trailer"
          data-trailer="${escapeHtml(trailer)}"
          aria-label="トレーラー（将来用）">
          🎞
        </button>
      ` : ""}

      ${url ? `
        <button type="button"
          class="sc-icon sc-open"
          data-url="${escapeHtml(url)}"
          data-r18="${isR18 ? "1" : "0"}"
          aria-label="外部リンクを開く">
          🔗
        </button>

        <button type="button"
          class="sc-icon sc-copy"
          data-copy="${escapeHtml(url)}"
          aria-label="URLをコピー">
          📋
        </button>
      ` : ""}
    </div>
  </div>
  `;
}

function renderTableRow(r){
  const id = norm(r.id);
  const name = norm(r.name);
  const system = norm(r.system);
  const players = norm(r.players);
  const format = norm(r.format);
  const time = norm(r.time);
  const r18 = normalizeR18(r.r18);
  const loss = normalizeLoss(r.loss_rate);
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

// ---------- filters ----------
function buildSystemOptions(rows){
  if (!els.system) return;
  const set = new Set();
  rows.forEach(r => {
    const v = norm(r.system);
    if (v) set.add(v);
  });
  const list = Array.from(set).sort((a,b)=>a.localeCompare(b,"ja"));
  els.system.innerHTML =
    `<option value="">すべて</option>` +
    list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function applyFilters(rows){
  const q = norm(els.q?.value);
  const system = norm(els.system?.value);
  const format = norm(els.format?.value);
  const players = norm(els.players?.value);
  const time = norm(els.time?.value);
  const r18 = norm(els.r18?.value);
  const loss = norm(els.loss_rate?.value);

  return rows.filter(r=>{
    if (system && norm(r.system) !== system) return false;

    if (format){
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
      const rr = normalizeR18(r.r18);
      if (rr !== r18) return false;
    }

    if (loss){
      const rl = normalizeLoss(r.loss_rate);
      if (rl !== loss) return false;
    }

    if (q){
      const t = rowText(r);
      const parts = q.split(/\s+/).filter(Boolean);
      for (const p of parts){
        if (!matchToken(t, p)) return false;
      }
    }

    return true;
  });
}

function setView(view){
  VIEW = view;
  document.querySelectorAll(".sc-tab").forEach(t=>{
    t.classList.toggle("is-active", t.dataset.view === view);
  });
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

  if (els.resultInfo){
    els.resultInfo.textContent = `表示: ${filtered.length} 件 / 全体: ${RAW.length} 件`;
  }

  if (els.cards){
    els.cards.innerHTML = filtered.map(renderCard).join("");
  }
  if (els.tableBody){
    els.tableBody.innerHTML = filtered.map(renderTableRow).join("");
  }

  if (els.metaRow){
    els.metaRow.style.display = "";
    els.metaRow.textContent = `最終取得: ${new Date().toLocaleString()} / 表示 ${filtered.length}件`;
  }

  return filtered.length;
}

// ---------- Confirm modal (safe init) ----------
function initConfirmModal(){
  const modal = document.getElementById("confirmModal");
  const modalText = document.getElementById("modalText");
  const modalOk = document.getElementById("modalOk");
  const modalCancel = document.getElementById("modalCancel");
  const modalDontAsk = document.getElementById("modalDontAsk");

  // 無ければ「確認無しで開く」モードに落とす（JSを落とさない）
  if (!modal || !modalText || !modalOk || !modalCancel || !modalDontAsk){
    return {
      open(url){ window.open(url, "_blank", "noopener,noreferrer"); }
    };
  }

  const LS_SKIP_KEY = "mirahub_skip_confirm";
  let pendingUrl = null;
  let pendingIsR18 = false;

  const isSkipConfirmEnabled = ()=> localStorage.getItem(LS_SKIP_KEY) === "1";
  const setSkipConfirmEnabled = (v)=> localStorage.setItem(LS_SKIP_KEY, v ? "1" : "0");

  const close = ()=>{
    modal.classList.remove("is-show");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
    pendingUrl = null;
    pendingIsR18 = false;
  };

  const open = (url, isR18)=>{
    pendingUrl = url;
    pendingIsR18 = !!isR18;

    if (!pendingIsR18 && isSkipConfirmEnabled()){
      window.open(pendingUrl, "_blank", "noopener,noreferrer");
      pendingUrl = null;
      pendingIsR18 = false;
      return;
    }

    if (pendingIsR18){
      modalText.innerHTML = '⚠️ <b>R18（成人向け）シナリオのリンクです。</b><br>外部サイトへ移動しますか？';
      modalDontAsk.checked = false;
      modalDontAsk.disabled = true;
      modalDontAsk.parentElement.style.opacity = "0.5";
    }else{
      modalText.textContent = "外部サイトへ移動しますか？";
      modalDontAsk.disabled = false;
      modalDontAsk.parentElement.style.opacity = "1";
      modalDontAsk.checked = isSkipConfirmEnabled();
    }

    modal.classList.add("is-show");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
  };

  modalOk.addEventListener("click", ()=>{
    if (!pendingUrl) return close();
    if (!pendingIsR18){
      setSkipConfirmEnabled(!!modalDontAsk.checked);
    }
    window.open(pendingUrl, "_blank", "noopener,noreferrer");
    close();
  });

  modalCancel.addEventListener("click", close);

  modal.addEventListener("click", (e)=>{
    if (e.target.matches("[data-close]")) close();
  });

  window.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && modal.classList.contains("is-show")) close();
  });

  return { open };
}

// ---------- events ----------
function bindEvents(confirm){
  // input
  els.q.addEventListener("input", ()=>render());
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

  if (els.btnReload){
    els.btnReload.addEventListener("click", ()=> main(true));
  }

  // view tabs
  document.querySelectorAll(".sc-tab").forEach(btn=>{
    btn.addEventListener("click", ()=> setView(btn.dataset.view));
  });

  // delegation
  document.addEventListener("click", (e)=>{
    const tag = e.target.closest(".sc-tag");
    if (tag){
      els.q.value = tag.dataset.tag || "";
      render();
      return;
    }

    const copyBtn = e.target.closest(".sc-copy");
    if (copyBtn){
      const text = copyBtn.dataset.copy || "";
      if (text) copyText(text);
      return;
    }

    const openBtn = e.target.closest(".sc-open");
    if (openBtn){
      const url = openBtn.dataset.url || "";
      const isR18 = openBtn.dataset.r18 === "1";
      if (url) confirm.open(url, isR18);
      return;
    }

    // 将来：トレーラー（今はURLをコピーするだけにしておく）
    const tr = e.target.closest(".sc-trailer");
    if (tr){
      const turl = tr.dataset.trailer || "";
      if (turl){
        copyText(turl);
        showToast("トレーラーURLをコピー（将来プレビュー対応）");
      }
    }
  });
}

function normalizeRows(rows){
  // GASがどんなキーでも拾えるよう小文字化
  return rows.map(r=>{
    const obj = {};
    Object.keys(r).forEach(k=>{
      obj[String(k).toLowerCase()] = r[k];
    });

    // 表示補完
    obj.r18 = normalizeR18(obj.r18);
    obj.loss_rate = normalizeLoss(obj.loss_rate);

    return obj;
  });
}

// ---------- main ----------
async function main(isReload=false){
  try{
    if (els.status) els.status.textContent = "取得中…";
    const data = await fetchJSON(API_URL);
    if (!data.ok) throw new Error(data.error || "API error");

    RAW = normalizeRows(data.rows || []);
    buildSystemOptions(RAW);

    if (els.status) els.status.textContent = `OK：${RAW.length}件 取得`;
    render();

    if (isReload) showToast("再取得しました");

  }catch(err){
    if (els.status) els.status.textContent = "取得失敗：API設定/公開設定/URL を確認";
    console.error(err);
  }
}

(function boot(){
  const confirm = initConfirmModal();
  bindEvents(confirm);
  setView("cards");
  main();
})();