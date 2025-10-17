import { db, ensureAuthed, toTeamId } from "./firebase-init.js";
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
      const user = await ensureAuthed();
      const uid = user.uid;

      // teamId を決定（同名はサフィックスでユニーク化）
      let base = toTeamId(teamName);
      if (!base) throw new Error("チーム名からIDを生成できませんでした");
      let teamId = base, i = 2;
      // ユニーク確保
      while ((await getDoc(doc(db, "teams", teamId))).exists()) {
        teamId = `${base}-${i++}`;
      }

      // 生成
      await setDoc(doc(db, "teams", teamId), {
        teamId, teamName, members,
        goalRequired: 4,
        playDay: yyyymmddJST(),
        startTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        uids: [uid]
      }, { merge: true });

      // 逆引き（UID→teamId）
      await setDoc(doc(db, "uidIndex", uid), {
        teamId, linkedAt: serverTimestamp()
      }, { merge: true });

      // 以後のページで拾いやすいように保存
      try { localStorage.setItem("teamId", teamId); localStorage.setItem("teamName", teamName); } catch { }

      location.href = `tutorial.html?team=${encodeURIComponent(teamId)}`;

    } catch (err) {
      console.error("[register] submit error:", err);
      alert(err?.message || "登録に失敗しました。ネットワークをご確認ください。");
      lock(submitBtn, false);
    }
  });
} else {
  console.warn("[register] フォームが見つかりません。");
}
