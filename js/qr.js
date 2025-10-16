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

/** ゲームを“完全フルスクリーン”で起動（×ボタンなし） */
function openGameOverlay(url, { uid, pointId }) {
  // 既存のオーバーレイがあれば消す
  document.querySelector("#minigame-overlay")?.remove();

  // フルスクリーン用ラッパ
  const ov = document.createElement("div");
  ov.id = "minigame-overlay";
  ov.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #000;
  `;

  // ゲーム本体の iframe（画面いっぱい）
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100vw;
    height: 100dvh;        /* 動的ビューポートでスマホのアドレスバー分も埋める */
    border: 0;
    background: #000;
  `;
  iframe.setAttribute("allowfullscreen", "");     // iOS/Android での全画面許可
  iframe.allow = "fullscreen; autoplay *; gamepad *";

  // クリア通知を受けて保存 → 6個到達でゴール → 後片付け
  async function onMsg(ev) {
    const data = ev?.data;
    if (!data || data.type !== "minigame:clear") return;
    try {
      await recordPointCleared({ uid, pointId, detail: data.detail || {} });
    } finally {
      cleanup();
    }
  }

  function cleanup() {
    window.removeEventListener("message", onMsg);
    // フルスクリーン解除（可能なら）
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (document.fullscreenElement && exit) {
      try { exit.call(document); } catch { }
    }
    // スクロールを戻す & DOM 片付け
    document.body.style.overflow = prevOverflow;
    ov.remove();
  }

  // DOM 追加 & 監視開始
  window.addEventListener("message", onMsg);
  ov.append(iframe);
  document.body.append(ov);

  // 背面のスクロールを止める
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  // 可能ならフルスクリーン API を要求（失敗しても見た目は全画面表示）
  const reqFS = ov.requestFullscreen || ov.webkitRequestFullscreen || ov.msRequestFullscreen;
  if (reqFS) {
    try { reqFS.call(ov); } catch { }
  }
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
