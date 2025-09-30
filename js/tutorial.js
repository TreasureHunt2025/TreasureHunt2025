const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "http://localhost:5500", "https://fistkk71.github.io"];

import { db } from "./firebase-init.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- ナビ開閉 ---------- */
const navToggle = document.querySelector(".nav-toggle");
const navList = document.getElementById("nav-list");
navToggle?.addEventListener("click", () => {
  const expanded = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!expanded));
  navList?.classList.toggle("active");
});

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const uid = params.get("uid") || localStorage.getItem("uid");
  const startBtn = document.getElementById("startBtn");

  if (!uid) {
    alert("受付情報が見つかりません。最初からやり直してください。");
    location.href = "register.html";
    return;
  }
  if (!startBtn) return;

  startBtn.addEventListener("click", async () => {
    try {
      const ref = doc(db, "teams", uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("参加情報が見つかりません");

      // 未開始のみ開始時刻を記録
      if (!snap.data().startTime) {
        await updateDoc(ref, { startTime: serverTimestamp() });
      }
      location.href = `map.html?uid=${encodeURIComponent(uid)}`;
    } catch (e) {
      console.error(e);
      alert("スタート処理でエラーが発生しました。");
    }
  });
});
