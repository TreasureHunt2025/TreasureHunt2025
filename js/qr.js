// js/qr.js — button-only start, robust delegation for #primaryCta & #startGameBtn
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

/** ゲームをオーバーレイで起動（postMessageで結果受け取り） */
function openGameOverlay(url, { uid, pointId }) {
  document.querySelector("#minigame-overlay")?.remove();

  const ov = document.createElement("div");
  ov.id = "minigame-overlay";
  ov.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,.75);
    display: flex; align-items: center; justify-content: center; z-index: 9999;
  `;

  const frameWrap = document.createElement("div");
  frameWrap.style.cssText = `
    position: relative; width: min(92vw, 800px); height: min(92vh, 600px);
    background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.6);
  `;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "閉じる");
  closeBtn.style.cssText = `
    position: absolute; right: 8px; top: 6px; z-index: 2;
    font-size: 24px; line-height: 1; background: transparent; color: #fff; border: none; cursor: pointer;
  `;
  closeBtn.addEventListener("click", () => {
    window.removeEventListener("message", onMsg);
    ov.remove();
  });

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.allow = "gamepad *; autoplay *";
  iframe.style.cssText = "width:100%;height:100%;border:0;background:#111;";

  async function onMsg(ev) {
    const data = ev?.data;
    if (!data || data.type !== "minigame:clear") return;
    try {
      await recordPointCleared({ uid, pointId, detail: data.detail || {} });
    } finally {
      window.removeEventListener("message", onMsg);
      ov.remove();
    }
  }
  window.addEventListener("message", onMsg);

  frameWrap.append(closeBtn, iframe);
  ov.append(frameWrap);
  document.body.append(ov);
}

/** クリア確定時の保存→6個達成ならゴールへ */
async function recordPointCleared({ uid, pointId }) {
  try {
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
      }, 500);
    }
  } catch (e) {
    console.error("[qr] recordPointCleared failed:", e);
    alert("通信エラーが発生しました。接続状況をご確認の上、もう一度お試しください。");
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

/** ---- 起動ボタンを“確実に”拾う：準備→イベント委譲 ---- */
(async function boot() {
  // 1) 必要な情報を先に確定
  const uid = await requireUidOrRedirect();
  window.uid = uid;

  const params = new URLSearchParams(location.search);
  const pointId = normalizeToPointId({ key: params.get("key"), token: params.get("token") });

  const candidateFn = (typeof urlForPoint === "function") ? urlForPoint(pointId) : null;
  const candidateMap = GAME_URLS?.[pointId];
  const gameUrl = candidateFn || candidateMap || GAME_URLS?.default || "";

  // 2) 既存ボタンがあれば状態を反映（重なりや再描画に関係なく最後にイベント委譲で拾う）
  const btns = document.querySelectorAll('#primaryCta, #startGameBtn, [data-action="startGame"]');
  for (const btn of btns) {
    if (!pointId || !gameUrl) {
      btn.setAttribute("disabled", "true");
      btn.textContent = !pointId ? "開始できません（QR不明）" : "開始できません（URL未設定）";
    } else {
      btn.removeAttribute("disabled");
      if (!btn.textContent.trim()) btn.textContent = "ミニゲームをプレイ";
    }
  }

  if (!pointId || !gameUrl) return; // ここで終了

  // 3) ドキュメント単位でクリックを拾う（重なり・差し替え・複製にも強い）
  const START_SEL = '#primaryCta, #startGameBtn, [data-action="startGame"]';
  const handleStart = (e) => {
    const t = e.target.closest?.(START_SEL);
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("disabled")) return;
    openGameOverlay(gameUrl, { uid, pointId });
  };

  // click / pointerup の両方で拾う（iOS対策として pointerup も）
  document.addEventListener("click", handleStart);
  document.addEventListener("pointerup", handleStart);
})();
