import { db, requireTeamOrRedirect } from "./firebase-init.js";
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ---------- DOM ---------- */
const timeEl = document.getElementById("timeDisplay");
const rankBtn = document.getElementById("rankBtn");
const homeBtn = document.getElementById("homeBtn");
const teamEl = document.getElementById("resultTeam");
const memEl = document.getElementById("resultMembers");
const treEl = document.getElementById("resultTreasures");
const saveEl = document.getElementById("saveStatus");
const qrCanvas = document.getElementById("goalQr");
const verifyUrlEl = document.getElementById("verifyUrl");

/* ---------- util ---------- */
const fmt = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}時間${m}分${r}秒` : `${m}分${r}秒`;
};

function setButtonsIncomplete(uid) {
  if (rankBtn) {
    rankBtn.textContent = "マップへ戻る";
    rankBtn.classList.remove("primary");
    rankBtn.classList.add("secondary");
    rankBtn.onclick = () => (location.href = `map.html?team=${encodeURIComponent(uid)}`);
  }
  if (homeBtn) {
    homeBtn.textContent = "トップへ戻る";
    homeBtn.onclick = () => (location.href = "index.html");
  }
}

function setButtonsComplete() {
  if (rankBtn) {
    rankBtn.textContent = "ランキングを見る";
    rankBtn.classList.add("primary");
    rankBtn.onclick = () => (location.href = "index.html");
  }
  if (homeBtn) {
    homeBtn.textContent = "トップへ戻る";
    homeBtn.onclick = () => (location.href = "index.html");
  }
}

/* ---------- QR ---------- */
async function ensureQRCodeLib() {
  if (globalThis.QRCode) return globalThis.QRCode;
  try {
    const mod = await import("https://esm.sh/qrcode@1.5.3");
    const QR = mod?.default ?? mod;
    globalThis.QRCode = QR;
    return QR;
  } catch {
    return null;
  }
}

async function renderVerifyQR(uid) {
  const url = new URL(`./verify.html?team=${encodeURIComponent(uid)}`, location.href).toString();
  if (verifyUrlEl) verifyUrlEl.textContent = url;

  const QR = await ensureQRCodeLib();
  if (QR?.toCanvas && qrCanvas) {
    const ctx = qrCanvas.getContext?.("2d");
    if (ctx) ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    await QR.toCanvas(qrCanvas, url, { width: 256, margin: 1 });
  } else if (qrCanvas) {
    const img = document.createElement("img");
    img.alt = "QR";
    img.width = 256;
    img.height = 256;
    img.src =
      "https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=" +
      encodeURIComponent(url);
    qrCanvas.replaceWith(img);
  }
}

/* ---------- main ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  const uid = await requireTeamOrRedirect();

  try {
    const teamRef = doc(db, "teams", uid);
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) {
      if (timeEl) timeEl.textContent = "チームデータが見つかりません。";
      setButtonsIncomplete(uid);
      return;
    }

    const data = teamSnap.data();
    const required = Number(data.goalRequired ?? 4);

    // サーバ（Firestore）の points 件数で進捗判定
    const ps = await getDocs(collection(db, "teams", uid, "points"));
    const found = ps.size;

    if (teamEl) teamEl.textContent = data.teamName || "-";
    if (memEl) memEl.textContent = String(data.members || 0);
    if (treEl) treEl.textContent = String(found);

    if (found < required) {
      if (timeEl) timeEl.textContent = "まだゴール条件を満たしていません。";
      if (saveEl) saveEl.textContent = "お宝を規定数（4個以上）集めてからゴールしてください。";
      setButtonsIncomplete(uid);
      return;
    }

    // elapsed 未保存なら保存（簡易：端末時刻ベースで差分計算）
    let { elapsed, startTime } = data;
    if (!elapsed && startTime?.toMillis) {
      const startMs = startTime.toMillis();
      elapsed = Math.max(0, Date.now() - startMs);
      await updateDoc(teamRef, { endTime: serverTimestamp(), elapsed });
      if (saveEl) saveEl.textContent = "記録を保存しました。";
    } else if (saveEl) {
      saveEl.textContent = "";
    }

    // クリア状態を確定
    let { status, exchangeToken } = data;
    if (status !== "cleared") {
      try {
        if (!exchangeToken) {
          exchangeToken = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10));
        }
        await updateDoc(teamRef, {
          status: "cleared",
          exchangeToken
        });
      } catch { }
    }

    if (timeEl) timeEl.textContent = elapsed ? fmt(elapsed) : "記録なし";
    setButtonsComplete();
    await renderVerifyQR(uid);
  } catch (e) {
    console.error("[goal] error:", e);
    if (timeEl) timeEl.textContent = "エラーが発生しました。通信状況をご確認ください。";
    setButtonsIncomplete(uid);
  }
});
