import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------- DOM ---------- */
const form = document.getElementById("regForm") || document.getElementById("registerForm");
const teamInput = document.getElementById("team");
const membersSelect = document.getElementById("members");
const submitBtn = form?.querySelector("button[type='submit'], .btn-submit, .btn-primary");

/* ---------- util ---------- */
const trim = (v) => (v ?? "").toString().trim();
const toInt = (v, def = 1) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };
function lock(btn, on = true) {
  if (!btn) return;
  btn.disabled = !!on;
  btn.dataset._label ??= btn.textContent;
  btn.textContent = on ? "送信中…" : btn.dataset._label;
}
function yyyymmddJST(d = new Date()) {
  const p = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  return `${p.find(x => x.type === "year").value}${p.find(x => x.type === "month").value}${p.find(x => x.type === "day").value}`;
}

/* ---------- submit ---------- */
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const teamName = trim(teamInput?.value);
    const members = toInt(membersSelect?.value, 1);

    if (!teamName) { alert("チーム名を入力してください。"); teamInput?.focus(); return; }
    if (members < 1 || members > 10) { alert("参加人数は1〜10名から選択してください。"); membersSelect?.focus(); return; }

    lock(submitBtn, true);
    try {
      // 匿名ログイン（永続化は firebase-init 側でフォールバック処理済み）
      const user = await ensureAuthed();
      const uid = user.uid;

      const ref = doc(db, "teams", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, {
          teamName,
          members,
          goalRequired: 4,
          playDay: yyyymmddJST(),
          startTime: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }

      // UIDはURLで引き回す（localStorageは使わない）
      location.href = `tutorial.html?uid=${encodeURIComponent(uid)}`;
    } catch (err) {
      console.error("[register] submit error:", err);
      alert(err?.message || "登録に失敗しました。ネットワークをご確認ください。");
      lock(submitBtn, false);
    }
  });
} else {
  console.warn("[register] フォームが見つかりません。");
}
