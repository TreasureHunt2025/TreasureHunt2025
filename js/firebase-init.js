// js/firebase-init.js (CDN modules, no Analytics)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ===== Firebase config (本番) =====
// * Analytics を使わないため measurementId は省略
const firebaseConfig = {
  apiKey: "AIzaSyB-4kv_D6Nza7nvAAcTZC7R97atLXhUHMs",
  authDomain: "treasurehunt2025-6e836.firebaseapp.com",
  projectId: "treasurehunt2025-6e836",
  storageBucket: "treasurehunt2025-6e836.appspot.com",
  messagingSenderId: "615988195129",
  appId: "1:615988195129:web:767d2d934cbebc0521c2e8"
};

// ---- init ----
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 匿名認証を保証
async function ensureAuthed() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Auth timeout")), 12000);
    const unsub = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timeout);
      unsub();
      if (user) return resolve(user);
      try {
        const cred = await signInAnonymously(auth);
        resolve(cred.user);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// UID必須 & チーム登録必須。満たさなければリダイレクト
async function requireUidOrRedirect() {
  const user = await ensureAuthed();
  const uid = user?.uid;
  if (!uid) {
    location.href = "index.html";
    throw new Error("No UID");
  }
  const ref = doc(db, "teams", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    location.href = "register.html";
    throw new Error("Unregistered");
  }
  return uid;
}

export { db, auth, ensureAuthed, requireUidOrRedirect };

// ------ 追加: teamId ユーティリティ ------
function toTeamId(name) {
  return (name || "").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveTeamId() {
  // 1) URL ?team=
  const sp = new URLSearchParams(location.search);
  const t = (sp.get("team") || "").trim();
  if (t) return t;

  // 2) localStorage
  try {
    const ls = localStorage.getItem("teamId");
    if (ls) return ls;
  } catch { }

  // 3) UID → uidIndex/{uid} から teamId 解決（あれば）
  try {
    const user = await ensureAuthed();
    const uid = user?.uid;
    if (uid) {
      const idx = await getDoc(doc(db, "uidIndex", uid));
      const teamId = idx.exists() ? (idx.data()?.teamId || "") : "";
      if (teamId) return teamId;
    }
  } catch { }
  return null;
}

async function requireTeamOrRedirect() {
  const teamId = await resolveTeamId();
  if (!teamId) { location.href = "index.html"; throw new Error("No teamId"); }
  const ref = doc(db, "teams", teamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) { location.href = "register.html"; throw new Error("Team not registered"); }
  // キャッシュ
  try { localStorage.setItem("teamId", teamId); } catch { }
  return teamId;
}

export { toTeamId, resolveTeamId, requireTeamOrRedirect };