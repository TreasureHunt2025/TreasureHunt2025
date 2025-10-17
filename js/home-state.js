import {
  initializeApp, getApps, getApp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ===== Firebase 初期化 =====
// 既存プロジェクトで window.firebaseConfig を定義済みならそれを使う。
// そうでなければ、すでに初期化済みの App（getApps）を再利用する。
const firebaseConfig = (window.firebaseConfig ?? null);
const app = getApps().length
  ? getApp()
  : (firebaseConfig ? initializeApp(firebaseConfig) : (() => { throw new Error("Firebase config is missing"); })());
const db = getFirestore(app);

// ===== DOM 参照 =====
const startBtn = document.getElementById("startBtn");
const continueBtn = document.getElementById("continueBtn");
const exchangeSection = document.getElementById("exchangeSection");
const exchangeQR = document.getElementById("exchangeQR");
const openExchangePage = document.getElementById("openExchangePage");

const reclaimModal = document.getElementById("reclaimModal");
const reclaimTeam = document.getElementById("reclaimTeam");
const reclaimBtn = document.getElementById("reclaimBtn");

function hide(el) { el && el.setAttribute("hidden", ""); }
function show(el) { el && el.removeAttribute("hidden"); }

// チーム名 → teamId（URL安全なID）
function toTeamId(name) {
  return (name || "").trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// Firestore からチームDoc取得
async function getTeam(teamId) {
  const ref = doc(db, "teams", teamId);
  const snap = await getDoc(ref);
  return snap.exists() ? { ref, data: snap.data() } : null;
}

// goal.html 用URLを生成（tokenがあればクエリに付与）
function buildGoalUrl(teamId, token) {
  const url = new URL("goal.html", location.origin);
  url.searchParams.set("team", teamId);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

// 引換QRを描画
function renderExchangeQR(teamId, token) {
  const url = buildGoalUrl(teamId, token);

  // aタグ（「引き換えページを開く」）に設定
  if (openExchangePage) openExchangePage.setAttribute("href", url);

  // QR生成（qrcodejs 依存）
  if (exchangeQR) {
    exchangeQR.innerHTML = "";
    /* global QRCode */
    if (typeof QRCode === "function") {
      new QRCode(exchangeQR, {
        text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // ライブラリ未読込時のフォールバック
      const p = document.createElement("p");
      p.textContent = url;
      p.style.wordBreak = "break-all";
      exchangeQR.appendChild(p);
    }
  }
}

// サーバー状態に応じてUIを出し分け
async function renderByServerStatus(teamId, team) {
  // 既定は全部隠す → 必要なものだけ表示
  hide(startBtn);
  hide(continueBtn);
  hide(exchangeSection);

  if (!team) {
    // 未登録（=未開始）：スタートのみ表示
    show(startBtn);
    return;
  }

  const status = team.data?.status || "started"; // デフォルトは started 扱い
  if (status === "cleared") {
    // クリア済：引換QRのみ
    show(exchangeSection);
    renderExchangeQR(teamId, team.data?.exchangeToken || null);
  } else {
    // 開始済：続きからのみ
    show(continueBtn);
  }
}

// ===== 起動フロー =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const cachedTeamId = localStorage.getItem("teamId");
    if (cachedTeamId) {
      const team = await getTeam(cachedTeamId);
      await renderByServerStatus(cachedTeamId, team);
    } else {
      // ローカルが空：まずは「新規開始」を妨げないためスタートだけ出しておく
      show(startBtn);

      // 既参加者の復元導線として、再判定モーダルを開く
      if (reclaimModal?.showModal) reclaimModal.showModal();
    }
  } catch (e) {
    // 失敗時はスタートだけ見せる（最小限のUX）
    console.warn("[home-state] init failed:", e);
    show(startBtn);
  }
});

// ===== 再判定（プライベートモード等でローカルが空の人向け）=====
reclaimBtn?.addEventListener("click", async (ev) => {
  ev.preventDefault();
  const name = reclaimTeam?.value || "";
  const teamId = toTeamId(name);
  if (!teamId) return;

  try {
    const team = await getTeam(teamId);

    // 次回以降のためローカルに保持（※プライベートモードでは保持されない場合がある）
    localStorage.setItem("teamId", teamId);
    localStorage.setItem("teamName", name);

    if (reclaimModal?.open) reclaimModal.close();
    await renderByServerStatus(teamId, team);
  } catch (e) {
    console.warn("[home-state] reclaim failed:", e);
    // エラー時はとりあえずスタートのみ
    show(startBtn);
  }
});

// ===== オプション：外部から開始マーキングを行いたい場合に使うフック =====
// register.html などでチーム名確定直後に呼ぶ想定。
// Firestoreルールに合わせて、このファイルでは読み取り専用に留めるため、ここでは何もしない。
// 実際の setDoc/updateDoc は登録処理側（register.js など）で行ってください。
export async function markStartedIfNeeded(/* teamIdOrName */) {
  // no-op（実装は register 周りで）
  return;
}
