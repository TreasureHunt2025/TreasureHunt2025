// /js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";

// === あなたの新プロジェクトのconfigに置き換える ===
const firebaseConfig = {
  apiKey: "AIzaSyB-4kv_D6Nza7nvAAcTZC7R97atLXhUHMs",
  authDomain: "treasurehunt2025-6e836.firebaseapp.com",
  projectId: "treasurehunt2025-6e836",
  storageBucket: "treasurehunt2025-6e836.appspot.com",
  messagingSenderId: "615988195129",
  appId: "1:615988195129:web:767d2d934cbebc0521c2e8",
  measurementId: "G-HCCLTYXZ4W"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// 匿名ログイン（既存コードから呼び出してOK）
export async function ensureAuthed() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("auth timeout")), 12000);
    onAuthStateChanged(auth, (user) => {
      if (user) { clearTimeout(t); resolve(user); }
    });
  });
}

// Analytics は対応環境のみ起動（ローカル/HTTPや一部iOSで失敗しないように）
isSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => { });
