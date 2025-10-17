import { db } from "./firebase-init.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// --- ホーム側ガード：クリア/交換済みは再参加ブロック ---
document.addEventListener("DOMContentLoaded", async () => {
  const teamId = localStorage.getItem("teamId");
  if (!teamId) return; // 未登録の人は通常表示

  try {
    const snap = await getDoc(doc(db, "teams", teamId));
    if (!snap.exists()) return;
    const { status } = snap.data() || {};

    if (status === "cleared") {
      // クリア済みはゴールへ（引き換えQRを即表示）
      location.replace(`./goal.html?team=${encodeURIComponent(teamId)}&info=${encodeURIComponent("クリア済みです。引き換えQRを表示します。")}`);
      return;
    }
    if (status === "redeemed") {
      // 交換済みは開始UIを無効化（あれば）
      const start = document.querySelector('#startBtn, [data-action="start"], #primaryCta');
      if (start) {
        start.setAttribute('disabled', 'disabled');
        start.textContent = '参加は終了しています（交換済）';
      }
      // お知らせバナー（任意）
      const note = document.createElement('div');
      note.className = 'notice';
      note.textContent = 'このチームは交換済みです。ゲームの再参加はできません。';
      document.body.prepend(note);
    }
  } catch {
    // 読み取りエラー時は何もしない（既存UI優先）
  }
}, { once: true });


/* ---------- util ---------- */
function yyyymmddJST() {
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  return `${p.find(x => x.type === "year").value}${p.find(x => x.type === "month").value}${p.find(x => x.type === "day").value}`;
}
function formatDuration(ms) {
  const totalSec = Math.floor((ms || 0) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}時間${m}分${s}秒` : `${m}分${s}秒`;
}

/* ---------- ランキング（上位5位） ---------- */
const leaderboardRoot = document.getElementById("leaderboard-content");
if (leaderboardRoot) {
  const q = query(
    collection(db, "teams"),
    where("elapsed", ">", 0),
    orderBy("elapsed", "asc"),
    limit(5)
  );

  const render = (snap) => {
    const ul = document.createElement("ul");
    ul.id = "rank";
    ul.className = "ranking-list";
    let i = 0;
    snap.forEach(d => {
      i += 1;
      const { teamName = "匿名チーム", elapsed = 0 } = d.data();
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${i}位`;
      const text = document.createTextNode(`　${teamName} — ${formatDuration(elapsed)}`);
      li.append(strong, text);
      ul.appendChild(li);
    });
    leaderboardRoot.replaceChildren(ul);
  };

  const renderOnce = async () => {
    const snap = await getDocs(q);
    render(snap);
  };

  let fallbackTimer = null;
  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null; }
      render(snap);
    },
    async (err) => {
      console.warn("[leaderboard] realtime disabled; fallback to polling:", err);
      try { unsubscribe?.(); } catch { }
      await renderOnce();
      fallbackTimer = setInterval(renderOnce, 15000);
    }
  );
}