// firebase-init.js (improved)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getAnalytics,
  isSupported
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";

// Replace with actual config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "treasurehunt2025-6e836",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
isSupported().then(() => getAnalytics(app)).catch(() => {});

async function ensureAuthed() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject("Timeout"), 12000);
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
