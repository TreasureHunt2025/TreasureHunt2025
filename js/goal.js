// js/goal.js  (type: module)
import { db } from "./firebase-init.js";
import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// UID は register.js で localStorage に保存済み
const uid = new URLSearchParams(location.search).get("uid");
const timeEl = document.getElementById("timeDisplay");
const rankBtn = document.getElementById("rankBtn");
const homeBtn = document.getElementById("homeBtn");

async function finalize() {
  if (!uid) {
    timeEl.textContent = "UID が不明です";
    return;
  }

  try {
    const teamRef = doc(db, "teams", uid);
    const snap = await getDoc(teamRef);
    if (!snap.exists()) {
      timeEl.textContent = "データが見つかりません";
      return;
    }

    let { startTime, elapsed } = snap.data();
    // 経過時間がまだ計算されていない場合
    if (!elapsed && startTime) {
      const now = Date.now();
      const startMs = startTime.toMillis();
      elapsed = now - startMs;
      await updateDoc(teamRef, {
        endTime: serverTimestamp(),
        elapsed
      });
    }

    // 経過ミリ秒 → 時 分 秒 に変換
    const totalSec = Math.floor(elapsed / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    timeEl.textContent = `${hours}時間${minutes}分${seconds}秒`;
  } catch (e) {
    console.error(e);
    timeEl.textContent = "エラーが発生しました";
  }
}
// ボタン遷移
rankBtn.addEventListener("click", () => {
  localStorage.removeItem("uid");
  location.href = "index.html";
});
homeBtn.addEventListener("click", () => {
  localStorage.removeItem("uid");
  location.href = "index.html";
});

// ページ表示時に実行
window.addEventListener("DOMContentLoaded", finalize);
