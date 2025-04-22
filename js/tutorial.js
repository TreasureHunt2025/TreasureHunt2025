import { db } from "./firebase-init.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM が準備できたら実行
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const uid = params.get("uid");
  const startBtn = document.getElementById("startBtn");

  if (!uid) {
    console.error("UID が指定されていません");
    return;
  }
  if (!startBtn) {
    console.error("#startBtn が見つかりません");
    return;
  }

  startBtn.addEventListener("click", async () => {
    try {
      // Firestore に startTime を書き込む
      await updateDoc(doc(db, "teams", uid), {
        startTime: serverTimestamp()
      });
      // マップへ遷移 (UID をクエリに引き継ぐ)
      location.href = `map.html?uid=${uid}`;
    } catch (e) {
      console.error(e);
      alert("スタート処理でエラーが発生しました。");
    }
  });
});
