/* ---------- 共通 Firebase 初期化を取得 ---------- */
import { db } from "./firebase-init.js";
import {
  collection, query, where, orderBy, limit, onSnapshot,
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- スマホ用ナビ開閉 ---------- */
const navToggle = document.getElementById("nav-toggle");
const navList = document.querySelector(".nav-list");
navToggle?.addEventListener("click", () => navList?.classList.toggle("active"));

/* ---------- ランキング (上位10) ---------- */
const rankUl = document.getElementById("rank");
const q = query(
  collection(db, "teams"),
  where("elapsed", ">", 0),
  orderBy("elapsed", "asc"),
  limit(10)
);
onSnapshot(q, snap => {
  rankUl.innerHTML = "";
  snap.forEach((d, i) => {
    const { teamName, elapsed } = d.data();
    rankUl.insertAdjacentHTML(
      "beforeend",
      `<li>${i + 1}. ${teamName} — ${(elapsed / 1000).toFixed(1)}秒</li>`
    );
  });
});

/* ---------- 「続きから再開」ボタン ---------- */
const uid = localStorage.getItem("uid");
if (uid) {
  getDoc(doc(db, "teams", uid)).then(d => {
    if (d.exists() && !d.data().elapsed) {
      const btn = document.createElement("a");
      btn.href = `map.html?uid=${uid}`;
      btn.className = "btn-primary";
      btn.textContent = "続きから再開";
      document.querySelector(".hero-content")?.appendChild(btn);
    }
  });
}
