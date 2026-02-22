// ====== ここに Apps Script の Web App URL を貼る ======
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxXucWg9ATHVEM8jm45pD8gCxkyA5Q1wWeG6ruoR3ujyJ4LV8JZwJCFh7tHeLZEfHzfuQ/exec";

const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  filtered: [],
};

function norm(v){
  return String(v ?? "").trim();
}

function toHoursRange(v){
  // "10~40" / "10-40" / "10〜40" / "10" など雑に吸収して [min,max] を返す
  const s = norm(v).replace(/[〜～]/g, "~").replace(/-/g, "~");
  if (!s) return null;
  const parts = s.split("~").map(x => parseFloat(x)).filter(x => !Number.isNaN(x));
  if (parts.length === 1) return [parts[0], parts[0]];
  if (parts.length >= 2) return [Math.min(parts[0], parts[1]), Math.max(parts[0], parts[1])];
  return null;
}

function matchHours(range, min, max){
  if (!min && !max) return true;
  if (!range) return false;
  const [rmin, rmax] = range;
  const a = (min === "" || min === null) ? null : Number(min);
  const b = (max === "" || max === null) ? null : Number(max);
  if (a !== null && rmax < a) return false;
  if (b !== null && rmin > b) return false;
  return true;
}

function buildSearchText(row){
  // 想定列：Title, System, Players, Format, VoiceHours, TextHours, Tags, Notes, Author
  // 列名が違ってたらここを直す or シート側のヘッダーを合わせる
  const keys = ["ID","Title","System","Players","Format","VoiceHours","TextHours","Tags","Notes","Author","UpdatedAt"];
  return keys.map(k => norm(row[k])).join(" ").toLowerCase();
}

function classifySystem(v){
  const s = norm(v).toLowerCase();
  if (!s) return "";
  if (s.includes("coc6") || s.includes("6版") || s === "coc6") return "CoC6";
  if (s.includes("coc7") || s.includes("7版") || s === "coc7") return "CoC7";
  return "Other";
}

function playersKey(v){
  const s = norm(v);
  // 例: "1~4", "1-4", "1〜4", "KPレス", "1PL", "KPC+1PL", "2PL", "PL何人でも"
  if (!s) return "";
  if (s.includes("KPレス")) return "KPレス";
  if (s.includes("PL何人でも")) return "Any";
  if (s.includes("KPC") && s.includes("1")) return "KPC+1PL";
  if (s.includes("2PL")) return "2PL";
  if (s.includes("1PL")) return "1PL";
  if (s.match(/1\s*[〜～\-]\s*4|1~4|1-4/)) return "1-4";
  return s;
}

function formatKey(v){
  const s = norm(v);
  if (s.includes("ボイ")) return "ボイセ";
  if (s.includes("テキ")) return "テキセ";
  return s;
}

function applyFilters(){
  const q = norm($("q").value).toLowerCase();
  const system = $("system").value;
  const format = $("format").value;
  const players = $("players").value;
  const voiceMin = $("voiceMin").value;
  const voiceMax = $("voiceMax").value;
  const textMin = $("textMin").value;
  const textMax = $("textMax").value;

  const sort = $("sort").value;

  const out = state.rows.filter(row => {
    const st = classifySystem(row["System"]);
    const ft = formatKey(row["Format"]);
    const pk = playersKey(row["Players"]);

    if (system && st !== system) return false;
    if (format && ft !== format) return false;
    if (players && pk !== players) return false;

    const voiceRange = toHoursRange(row["VoiceHours"]);
    const textRange  = toHoursRange(row["TextHours"]);
    if (!matchHours(voiceRange, voiceMin, voiceMax)) return false;
    if (!matchHours(textRange,  textMin,  textMax)) return false;

    if (q){
      const hay = buildSearchText(row);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // sort
  out.sort((a,b) => {
    const ta = norm(a["Title"]).toLowerCase();
    const tb = norm(b["Title"]).toLowerCase();
    const ua = new Date(a["UpdatedAt"] || 0).getTime();
    const ub = new Date(b["UpdatedAt"] || 0).getTime();

    switch(sort){
      case "titleDesc": return tb.localeCompare(ta, "ja");
      case "updatedAsc": return ua - ub;
      case "updatedDesc": return ub - ua;
      case "titleAsc":
      default: return ta.localeCompare(tb, "ja");
    }
  });

  state.filtered = out;
  render();
}

function cardHTML(row){
  const id = norm(row["ID"]);
  const title = norm(row["Title"]) || "(無題)";
  const system = classifySystem(row["System"]) || norm(row["System"]);
  const players = norm(row["Players"]);
  const format = norm(row["Format"]);
  const voice = norm(row["VoiceHours"]);
  const text = norm(row["TextHours"]);
  const author = norm(row["Author"]);
  const tags = norm(row["Tags"]);
  const notes = norm(row["Notes"]);

  const meta = [];
  if (id) meta.push(`ID:${id}`);
  if (system) meta.push(system);
  if (players) meta.push(players);
  if (format) meta.push(format);
  if (voice) meta.push(`ボイセ:${voice}h`);
  if (text) meta.push(`テキセ:${text}h`);
  if (author) meta.push(`作者:${author}`);

  const tagArr = tags ? tags.split(/[,、]/).map(s => s.trim()).filter(Boolean) : [];

  // 募集テンプレ（必要ならここを君好みに変える）
  const recruit = [
    `【募集】${title}`,
    system ? `【システム】${system}` : "",
    players ? `【人数】${players}` : "",
    format ? `【形式】${format}` : "",
    voice ? `【ボイセ】${voice}h` : "",
    text ? `【テキセ】${text}h` : "",
    tagArr.length ? `【タグ】${tagArr.join(" / ")}` : "",
    notes ? `【補足】${notes}` : "",
  ].filter(Boolean).join("\n");

  return `
  <article class="sc-card">
    <h3 class="sc-title">${escapeHtml(title)}</h3>

    ${notes ? `<p class="sc-desc">${escapeHtml(notes)}</p>` : ""}

    <ul class="sc-meta">
      ${meta.map(m => `<li>${escapeHtml(m)}</li>`).join("")}
      ${tagArr.slice(0,6).map(t => `<li>${escapeHtml(t)}</li>`).join("")}
    </ul>

    <div class="sc-actions">
      <button class="btn-copy" data-copy="${encodeAttr(title)}">タイトルをコピー</button>
      <button class="btn-copy" data-copy="${encodeAttr(recruit)}">募集テンプレをコピー</button>
      ${id ? `<button class="btn-copy" data-copy="${encodeAttr(id)}">IDをコピー</button>` : ""}
    </div>
  </article>`;
}

function render(){
  $("count").textContent = String(state.filtered.length);
  const el = $("cards");
  el.innerHTML = state.filtered.map(cardHTML).join("");

  // copy buttons
  el.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try{
        await navigator.clipboard.writeText(text);
        const old = btn.textContent;
        btn.textContent = "コピーした";
        setTimeout(() => btn.textContent = old, 900);
      }catch{
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    });
  });

  $("status").textContent = `表示中：${state.filtered.length}件`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function encodeAttr(s){
  return escapeHtml(String(s)).replace(/\n/g, "&#10;");
}

async function load(){
  $("status").textContent = "Google Sheetsから読み込み中…";
  try{
    const res = await fetch(SHEETS_API_URL, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "API error");

    // rows = [{header:value...}]
    const rows = json.rows || [];

    // ここで “列名の揺れ” を吸収する（シートが違っても動かす）
    // 例：タイトル列が「シナリオ名」なら Title に詰め直す
    const normalized = rows.map(r => mapColumns(r));

    state.rows = normalized;
    state.filtered = normalized;

    $("status").textContent = `読み込み完了：${normalized.length}件`;
    applyFilters();

  }catch(err){
    $("status").textContent = `読み込み失敗：${err.message}`;
  }
}

function mapColumns(r){
  // ===== ここが “君のシート” に合わせる唯一の場所 =====
  // 左：このサイトが欲しいキー / 右：シート側にありがちな候補列名
  const pick = (keys) => {
    for (const k of keys){
      if (r[k] !== undefined && String(r[k]).trim() !== "") return r[k];
    }
    return r[keys[0]]; // なくても返す
  };

  return {
    ID:        pick(["ID","Id","id"]),
    Title:     pick(["Title","タイトル","シナリオ名","Name"]),
    System:    pick(["System","システム","TRPG","Game"]),
    Players:   pick(["Players","人数","PL人数","PlayerCount"]),
    Format:    pick(["Format","形式","ボイセ/テキセ","SessionType"]),
    VoiceHours:pick(["VoiceHours","ボイセ時間","ボイス時間","Voice"]),
    TextHours: pick(["TextHours","テキセ時間","テキスト時間","Text"]),
    Author:    pick(["Author","作者","制作","Writer"]),
    Tags:      pick(["Tags","タグ","傾向","Genre"]),
    Notes:     pick(["Notes","備考","メモ","補足"]),
    UpdatedAt: pick(["UpdatedAt","更新日","Updated","LastUpdate"]),
  };
}

function bind(){
  ["q","system","format","players","voiceMin","voiceMax","textMin","textMax","sort"].forEach(id => {
    $(id).addEventListener("input", applyFilters);
    $(id).addEventListener("change", applyFilters);
  });

  $("reset").addEventListener("click", () => {
    $("q").value = "";
    $("system").value = "";
    $("format").value = "";
    $("players").value = "";
    $("voiceMin").value = "";
    $("voiceMax").value = "";
    $("textMin").value = "";
    $("textMax").value = "";
    $("sort").value = "titleAsc";
    applyFilters();
  });

  $("copySearch").addEventListener("click", async () => {
    const text =
`【検索条件】
キーワード: ${$("q").value || "(なし)"}
システム: ${$("system").value || "(すべて)"}
形式: ${$("format").value || "(すべて)"}
人数: ${$("players").value || "(すべて)"}
ボイセ: ${$("voiceMin").value || "-"} ~ ${$("voiceMax").value || "-"} h
テキセ: ${$("textMin").value || "-"} ~ ${$("textMax").value || "-"} h
ソート: ${$("sort").value}`;
    try{
      await navigator.clipboard.writeText(text);
      $("status").textContent = "検索条件をコピーした";
      setTimeout(() => applyFilters(), 600);
    }catch{}
  });
}

bind();
load();