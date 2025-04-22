/* ---------- 共通 Firebase 初期化を取得 ---------- */
import { db, auth } from "./firebase-init.js";
import {
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- 年齢入力欄を人数に合わせて生成 ---------- */
const membersInput = document.getElementById("members");
const agesContainer = document.getElementById("ages");

function updateAgeFields() {
  const n = Math.max(1, Math.min(10, +membersInput.value || 1));
  agesContainer.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const el = document.createElement("input");
    el.type = "number";
    el.min = 0;
    el.max = 100;
    el.placeholder = `年齢${i + 1}`;
    el.required = true;
    agesContainer.appendChild(el);
  }
}
membersInput.addEventListener("input", updateAgeFields);
updateAgeFields();

/* ---------- フォーム送信 → Firestore 登録 ---------- */
const regForm = document.getElementById("regForm");

signInAnonymously(auth).then(() => {
  const uid = auth.currentUser.uid;

  regForm.addEventListener("submit", async e => {
    e.preventDefault();

    const teamName = document.getElementById("team").value.trim();
    const members = +membersInput.value;
    const ages = Array.from(
      agesContainer.querySelectorAll("input"),
      el => +el.value
    );

    if (ages.some(v => !v)) {
      alert("全員分の年齢を入力してください");
      return;
    }

    await setDoc(doc(db, "teams", uid), {
      teamName,
      members,
      ages,
      registeredAt: serverTimestamp()
    });

    localStorage.setItem("uid", uid);          // 続き再開用
    location.href = `tutorial.html?uid=${uid}`;
  });
}).catch(err => {
  console.error(err);
  alert("Firebase 接続に失敗しました");
});
