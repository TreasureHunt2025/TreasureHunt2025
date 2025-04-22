/* js/firebase-init.js  (type: module) */
import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ここに “本番プロジェクト” の値を一度だけ書く */
const firebaseConfig = {
  apiKey:            "AIzaSyDMt7fNPd15_JcQ3eeaIsmdUx9HL5sLLzc",
  authDomain:        "tresurehunt2025.firebaseapp.com",
  projectId:         "tresurehunt2025",
  storageBucket:     "tresurehunt2025.firebasestorage.app",
  messagingSenderId: "987685671729",
  appId:             "1:987685671729:web:67db4516fe578afdaa1610"
};

/* Singleton 初期化 */
export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
