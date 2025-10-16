// js/qr.js — フルページ遷移で起動 / クリアはsessionStorage経由で復帰して記録
import { db, requireUidOrRedirect } from "./firebase-init.js";
import {
  collection, doc, getDocs, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/** QRキー/トークンを pointId(qr1〜qr6) に正規化 */
function normalizeToPointId({ key, token }) {
  const k = (key || token || "").trim().toLowerCase();
  if (/^qr[1-6]$/.test(k)) return k;
  const m = /^th-qr([1-6])$/i.exec(k);
  if (m) return `qr${m[1]}`;
  return null;
}

/** どのQRでどのゲームを起動するか（必要に応じて変更OK） */
const GAME_URLS = {
  qr1: "./game1/tetris.html",
  qr2: "./game2/suika.html",
  qr3: "./game3/AB.html",
  qr4: "./game4/roulette.html",
  qr5: "./game5/memory.html",
  qr6: "./game6/puzzle.html",
  default: "./game1/tetris.html"
};

const GOAL_REQUIRED = 6; // 6個到達でゴールへ

/** クリア確定時の保存→6個達成ならゴールへ */
async function recordPointCleared({ uid, pointId }) {
  await setDoc(
    doc(db, "teams", uid, "points", pointId),
    { foundAt: serverTimestamp() },
    { merge: true }
  );
  cacheFound(pointId);
  const snap = await getDocs(collection(db, "teams", uid, "points"));
  if (snap.size >= GOAL_REQUIRED) {
    setTimeout(() => {
      location.replace(`goal.html?uid=${encodeURIComponent(uid)}`);
    }, 400);
  }
}

/** ローカルキャッシュ（地図の見た目用） */
function cacheFound(pointId) {
  try {
    const key = "found";
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    if (!arr.includes(pointId)) {
      arr.push(pointId);
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch { }
}

/** （重要）ゲームから“フルページで戻った”ときの結果を処理 */
(async function applyReturnIfAny() {
  // まずUIDを確定（書き込みは要認証）
  const uid = await requireUidOrRedirect();

  // ゲーム側が sessionStorage に置いた結果を拾う
  const key = "minigame_clear";
  const raw = sessionStorage.getItem(key);
  if (!raw) return;
  sessionStorage.removeItem(key);

  try {
    const data = JSON.parse(raw);
    // 現在のQRページのpointIdと一致しているときだけ処理
    const params = new URLSearchParams(location.search);
    const nowPoint = normalizeToPointId({ key: params.get("key"), token: params.get("token") });
    if (!data || !data.pointId || data.pointId !== nowPoint) return;

    await recordPointCleared({ uid, pointId: data.pointId });
  } catch (e) {
    console.warn("[qr] failed to apply return result:", e);
  }
})();

/** 起動ボタン（#startGameBtn など）をセットアップ：フルページに遷移 */
(async function setupStartButtons() {
  const btns = Array.from(
    document.querySelectorAll('#primaryCta, #startGameBtn, [data-action="startGame"]')
  );
  if (btns.length === 0) return;

  const uid = await requireUidOrRedirect();
  const params = new URLSearchParams(location.search);
  const pointId = normalizeToPointId({ key: params.get("key"), token: params.get("token") });

  const candidateFn = (typeof urlForPoint === "function") ? urlForPoint(pointId) : null;
  const candidateMap = GAME_URLS?.[pointId];
  const baseUrl = candidateFn || candidateMap || GAME_URLS?.default || "";
  if (!pointId || !baseUrl) {
    for (const b of btns) {
      b.disabled = true;
      b.textContent = !pointId ? "開始できません（QR不明）" : "開始できません（URL未設定）";
    }
    return;
  }

  // フルページ遷移先URLを組む（uid/point/return を渡す）
  const full = new URL(baseUrl, location.href);
  full.searchParams.set("uid", uid);
  full.searchParams.set("point", pointId);
  full.searchParams.set("return", location.href);

  for (const b of btns) {
    b.removeAttribute("disabled");
    if (!b.textContent.trim()) b.textContent = "ミニゲームをプレイ";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      location.href = full.href; // ← ここで“ページ遷移”してフル画面で開始
    });
  }
})();
