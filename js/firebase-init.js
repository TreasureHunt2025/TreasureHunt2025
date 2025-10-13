import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/** ---- Firebase config（既存値） ---- */
const firebaseConfig = {
  apiKey: "AIzaSyDMt7fNPd15_JcQ3eeaIsmdUx9HL5sLLzc",
  authDomain: "tresurehunt2025.firebaseapp.com",
  projectId: "tresurehunt2025",
  storageBucket: "tresurehunt2025.firebasestorage.app",
  messagingSenderId: "987685671729",
  appId: "1:987685671729:web:67db4516fe578afdaa1610",
  measurementId: "G-LXEVKWJB6Q"
};

/** ---- Initialize ---- */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
const auth = getAuth(app);

/** ---- Auth helpers ---- */
export async function ensureAuthed() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
  }
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}

export function getUidFromUrlOrAuth() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("uid")?.trim();
  if (fromUrl) return fromUrl;
  return auth.currentUser?.uid ?? null;
}

export async function requireUidOrRedirect() {
  await ensureAuthed();
  const uid = getUidFromUrlOrAuth();
  if (!uid) {
    alert("受付情報が見つかりません。はじめからやり直してください。");
    location.replace("index.html");
    throw new Error("UID missing");
  }
  return uid;
}

export { app, db, auth };
