import { db, requireUidOrRedirect } from "./firebase-init.js";
import {
  doc, setDoc, serverTimestamp,
  getDocs, collection
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/** 任意の文字列トークン → ポイントID への簡易マップ */
const TOKEN_TABLE = Object.freeze({
  "TH-QR1": "qr1",
  "TH-QR2": "qr2",
  "TH-QR3": "qr3",
  "TH-QR4": "qr4",
  "TH-QR5": "qr5",
  "TH-QR6": "qr6",
});

/** key/token を qr1〜qr6 に正規化 */
function normalizeToPointId({ key, token }) {
  const raw = (key || "").toLowerCase().trim();
  if (/^qr[1-6]$/.test(raw)) return raw;
  const viaToken = TOKEN_TABLE[(token || "").trim()];
  return viaToken || null;
}

/** UIキャッシュ（found）更新：あくまで描画用 */
function cacheFound(id) {
  try {
    const set = new Set(JSON.parse(localStorage.getItem("found") || "[]"));
    set.add(id);
    localStorage.setItem("found", JSON.stringify([...set]));
  } catch { }
}

/** ここで「どのQRでどのゲームを起動するか」を定義 */
const GAME_URLS = {
  qr1: "./game1/tetris.html?target=7",
  // 将来:
  // qr2: "./game2/runner.html?goal=30",
  // qr3: "./game3/puzzle.html?moves=20",
};

/** メインフロー */
let uid;
(async () => {
  uid = await requireUidOrRedirect();

  const params = new URLSearchParams(location.search);
  const key = params.get("key");     // 例: qr3
  const token = params.get("token"); // 例: TH-QR3

  const pointId = normalizeToPointId({ key, token });
  if (!pointId) {
    alert("QRが無効です。もう一度スキャンしてください。");
    location.replace(`map.html?uid=${encodeURIComponent(uid)}`);
    return;
  }

  try {
    // --- 1) ゲームが紐づいていれば起動（クリア時のみ先へ進む） ---
    const gameUrl = GAME_URLS[pointId];
    if (gameUrl) {
      const cleared = await playMinigameInOverlay(gameUrl);
      if (!cleared) {
        // 失敗 or 閉じた → 記録せず戻す
        location.replace(`map.html?uid=${encodeURIComponent(uid)}`);
        return;
      }
    }

    // --- 2) クリア後にサーバへ記録（冪等） ---
    await setDoc(
      doc(db, "teams", uid, "points", pointId),
      { foundAt: serverTimestamp() },
      { merge: true }
    );

    // 地図側UIのためのローカルキャッシュ
    cacheFound(pointId);

    // --- 3) サーバで取得数を集計し、6個ならゴールへ ---
    const qs = await getDocs(collection(db, "teams", uid, "points"));
    const foundCount = qs.size;

    if (foundCount >= 6) {
      setTimeout(() => {
        location.replace(`goal.html?uid=${encodeURIComponent(uid)}`);
      }, 500);
    }
    // 未到達時はそのまま（ユーザーの「戻る」で地図へ）
  } catch (e) {
    console.error("[qr] flow failed:", e);
    alert("通信エラーが発生しました。時間をおいて再度お試しください。");
    location.replace(`map.html?uid=${encodeURIComponent(uid)}`);
  }
})();

/** 汎用：任意URLのミニゲームをオーバーレイで開き、クリア判定を受け取る */
function playMinigameInOverlay(url) {
  return new Promise((resolve) => {
    // オーバーレイ生成
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", background: "#000",
      display: "grid", placeItems: "center", zIndex: "4000"
    });

    // 閉じるボタン（×）
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      position: "absolute", top: "12px", right: "12px",
      width: "40px", height: "40px", borderRadius: "50%",
      border: "0", fontSize: "22px", lineHeight: "40px",
      background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer"
    });
    closeBtn.addEventListener("click", () => { cleanup(); resolve(false); });

    // ゲーム本体
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.setAttribute("allow", "fullscreen *; autoplay *; gamepad *");
    Object.assign(frame.style, { width: "100vw", height: "100vh", border: "0", background: "#000" });

    // メッセージ受信（ゲーム側は {type:'minigame:clear', detail:{cleared:true}} を postMessage する）
    const onMsg = (ev) => {
      const d = ev.data;
      if (!d || d.type !== "minigame:clear") return;
      cleanup();
      resolve(Boolean(d.detail?.cleared));
    };
    const onKey = (e) => { if (e.key === "Escape") { cleanup(); resolve(false); } };

    function cleanup() {
      window.removeEventListener("message", onMsg);
      window.removeEventListener("keydown", onKey);
      overlay.remove();
    }

    overlay.appendChild(frame);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
  });
}
