import { db, requireUidOrRedirect } from "./firebase-init.js";
import {
  collection, doc, getDocs, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// === 設定 ==========================================================
const OPTIONAL_FINISH_AT = 4; // 4個以上で任意終了可
const GOAL_REQUIRED = 6; // 6個で自動ゴール

// 各QRが起動するゲームのURL
const GAME_URLS = {
  qr1: "./game1/tetris.html",
  qr2: "./game2/suika.html",
  qr3: "./game3/AB.html",
  qr4: "./game4/roulette.html",
  qr5: "./game5/memory.html",
  qr6: "./game6/puzzle.html",
  default: "./game1/tetris.html",
};

function applyPageMode({ returned }) {
  const title = document.querySelector('#qrTitle');
  const start = document.querySelector('#startGameBtn');
  const back  = document.querySelector('#backToMapBtn');

  if (returned) {
    // ★ ゲームをクリアして戻ってきたとき
    if (title) title.textContent = 'クリアおめでとう！次のお宝を探そう！';
    if (start) start.style.display = 'none';
    if (back)  back.style.display  = 'inline-block';
  } else {
    // ★ QR読み取り直後（未プレイ）
    if (title) title.textContent = 'QRが読み取られました!ミニゲームをクリアしてお宝をゲットしよう！';
    if (start) start.style.display = 'inline-block';
    if (back)  back.style.display  = 'none';
  }
}

// === ユーティリティ ================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function getParam(name) {
  return new URL(location.href).searchParams.get(name);
}

/** key=qr1..6 / token=th-qrN → 'qrN' に正規化 */
function normalizeToPointId({ key, token }) {
  const k = (key || token || "").trim().toLowerCase();
  if (/^qr[1-6]$/.test(k)) return k;
  const m = /^th-qr([1-6])$/.exec(k);
  return m ? `qr${m[1]}` : null;
}

// --- ローカル記録（フォールバック&UI用） ---
function getFoundLocal() {
  try { return JSON.parse(localStorage.getItem("found") || "[]"); }
  catch { return []; }
}
function setFoundLocal(arr) {
  try { localStorage.setItem("found", JSON.stringify([...new Set(arr)])); } catch { }
}
function addFoundLocal(pointId) {
  const a = getFoundLocal();
  if (!a.includes(pointId)) { a.push(pointId); setFoundLocal(a); }
  return a.length;
}

// === Firestore書き込み（失敗しても落とさない） ====================
async function recordPointToServer(uid, pointId) {
  await setDoc(
    doc(db, "teams", uid, "points", pointId),
    { foundAt: serverTimestamp() },
    { merge: true }
  );
}
async function countFoundOnServer(uid) {
  const snap = await getDocs(collection(db, "teams", uid, "points"));
  return snap.size;
}

// === UI反映（要素があれば更新・無ければスキップ） =================
function renderProgressUI() {
  const found = getFoundLocal();
  const cntEl = $("#foundCount");
  if (cntEl) cntEl.textContent = String(found.length);

  const list = $("#foundList");
  if (list) {
    list.innerHTML = "";
    found.forEach(id => {
      const li = document.createElement("li");
      li.textContent = `クリア済み: ${id}`;
      list.appendChild(li);
    });
  }
}
function updateFinishButtonVisibility() {
  const foundLen = getFoundLocal().length;
  const btn = $("#finishBtn");
  if (!btn) return;
  btn.style.display = (foundLen >= OPTIONAL_FINISH_AT) ? "inline-block" : "none";
}

// === クリア復帰適用（sessionStorage → Firestore/Local） ============
async function applyReturnIfAny() {
  const raw = sessionStorage.getItem("minigame_clear");
  if (!raw) return { applied: false };

  // 1回適用したら消す
  sessionStorage.removeItem("minigame_clear");

  let data = null;
  try { data = JSON.parse(raw); } catch { }
  const nowPoint = normalizeToPointId({ key: getParam("key"), token: getParam("token") });
  if (!nowPoint || !data?.pointId || data.pointId !== nowPoint) {
    return { applied: false };
  }

  // まずローカルに反映（オフライン/権限エラーでも進む）
  addFoundLocal(data.pointId);
  renderProgressUI();
  updateFinishButtonVisibility();

  // Firestore へは可能なら保存（失敗しても無視）
  try {
    const uid = await requireUidOrRedirect();
    await recordPointToServer(uid, data.pointId);
  } catch (e) {
    // 権限なし・未ログインなどは無視（ローカルのみで継続）
    console.warn("[qr] server write skipped:", e?.message || e);
  }

  return { applied: true, pointId: data.pointId };
}

// === 6個時の自動ゴール（qr.htmlに戻った“このタイミング”で判定） =====
async function maybeAutoGoal() {
  // まずサーバー状態で判定（可能なら）
  try {
    const uid = await requireUidOrRedirect();
    const n = await countFoundOnServer(uid);
    if (n >= GOAL_REQUIRED) {
      location.replace("./goal.html");
      return;
    }
  } catch {
    // サーバー使えない場合はローカルで判定
  }
  if (getFoundLocal().length >= GOAL_REQUIRED) {
    location.replace("./goal.html");
  }
}

// === ゲーム開始ボタンのセットアップ ===============================
async function setupStartButtons() {
  const btns = $$('#primaryCta, #startGameBtn, [data-action="startGame"]');
  if (btns.length === 0) return;

  const pointId = normalizeToPointId({ key: getParam("key"), token: getParam("token") });
  const baseUrl = (typeof window.urlForPoint === "function")
    ? window.urlForPoint(pointId)  // 任意の外部関数があれば優先
    : (GAME_URLS[pointId] || GAME_URLS.default);

  if (!pointId || !baseUrl) {
    btns.forEach(b => {
      b.disabled = true;
      b.textContent = !pointId ? "開始できません（QR不明）" : "開始できません（URL未設定）";
    });
    return;
  }

  // そのまま遷移（ゲーム側が minigame-bridge.js を読む前提）
  btns.forEach(b => {
    if (!b.textContent.trim()) b.textContent = "ミニゲームをプレイ";
    b.removeAttribute("disabled");
    b.addEventListener("click", (e) => {
      e.preventDefault();
      location.href = new URL(baseUrl, location.href).href;
    });
  });
}

// === 任意終了ボタン（#finishBtn が存在する場合のみ） ===============
function setupFinishButton() {
  const btn = $("#finishBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    location.href = "./goal.html";
  });
}

// === 初期化 ========================================================
document.addEventListener("DOMContentLoaded", async () => {;


  const pointId = normalizeToPointId({ key: getParam("key"), token: getParam("token") });
  const pointLabel = $("#pointId");
  if (pointLabel && pointId) pointLabel.textContent = pointId;

  // ゲームから戻ってきたクリア結果を適用
  await applyReturnIfAny();

  const ret = await applyReturnIfAny();
  applyPageMode({ returned: !!ret?.applied })

  // UI更新
  renderProgressUI();
  updateFinishButtonVisibility();

  // ボタンセットアップ
  await setupStartButtons();
  setupFinishButton();

  // マップに戻る
  document.querySelector('#backToMapBtn')?.addEventListener('click', () => {
    location.href = './map.html'; 
  });
  // 6個なら自動ゴール（qr.html に戻ったこの時点でのみ実行）
  await maybeAutoGoal();
});
