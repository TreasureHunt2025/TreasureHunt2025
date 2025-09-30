const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "http://localhost:5500", "https://fistkk71.github.io"];

import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const form = document.getElementById("regForm") || document.getElementById("registerForm");
const teamInput = document.getElementById("team");
const membersSelect = document.getElementById("members");
const agesGrid = document.getElementById("ages");
const submitBtn = form?.querySelector("button[type='submit'], .btn-submit, .btn-primary");

const trim = v => (v ?? "").toString().trim();
const toInt = (v, def = 1) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };
function lock(btn, on = true) { if (!btn) return; btn.disabled = !!on; btn.dataset._label ??= btn.textContent; btn.textContent = on ? "送信中…" : btn.dataset._label; }

function yyyymmddJST(d = new Date()) {
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  return `${p.find(x => x.type === "year")?.value}${p.find(x => x.type === "month")?.value}${p.find(x => x.type === "day")?.value}`;
}

function renderAges(n) {
  if (!agesGrid) return;
  const prev = [...agesGrid.querySelectorAll("input[type='number']")].map(i => i.value);
  agesGrid.innerHTML = "";
  const count = Math.min(Math.max(parseInt(n || "1", 10) || 1, 1), 10);
  for (let i = 0; i < count; i++) {
    const inp = document.createElement("input");
    inp.type = "number"; inp.inputMode = "numeric"; inp.min = "0"; inp.max = "120";
    inp.placeholder = `メンバー${i + 1}の年齢`; inp.name = `age${i + 1}`; inp.id = `age-${i + 1}`;
    inp.value = prev[i] ?? "";
    agesGrid.appendChild(inp);
  }
}
if (membersSelect) {
  renderAges(membersSelect.value || 1);
  membersSelect.addEventListener("change", e => renderAges(e.target.value));
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const teamName = trim(teamInput?.value);
    const members = toInt(membersSelect?.value, 1);
    if (!teamName) { alert("チーム名を入力してください。"); teamInput?.focus(); return; }
    if (members < 1 || members > 10) { alert("参加人数は1〜10名から選択してください。"); membersSelect?.focus(); return; }

    lock(submitBtn, true);
    try {
      const user = await ensureAuthed();
      const uid = user.uid;

      const ages = []; // ages removed in this event

      const payload = {
        teamName, members, goalRequired: 1,
        playDay: yyyymmddJST(),
        startTime: serverTimestamp()
      };
      if (ages.length) payload.ages = ages;

      const ref = doc(db, "teams", uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, payload);
      }
      localStorage.setItem("uid", uid);
      localStorage.setItem("teamName", teamName);
      localStorage.setItem("members", String(members));

      location.href = "tutorial.html";
    } catch (err) {
      console.error(err);
      alert(err?.message || "登録に失敗しました。ネットワークをご確認ください。");
      lock(submitBtn, false);
    }
  });
} else {
  console.warn("[register] フォームが見つかりません。");
}
