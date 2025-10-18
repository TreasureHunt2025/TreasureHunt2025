import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const startBtn = document.getElementById("startBtn");
const continueBtn = document.getElementById("continueBtn");
const exchangeSection = document.getElementById("exchangeSection");
const exchangeQR = document.getElementById("exchangeQR");
const openExchangePage = document.getElementById("openExchangePage");


function hide(el) { if (!el) return; el.hidden = true; el.style.display = "none"; }
function show(el) { if (!el) return; el.hidden = false; el.style.display = ""; }

// toTeamId は firebase-init.js の共通関数を使用

async function readTeam(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, "teams", id));
  return snap.exists() ? { id, data: snap.data() } : null;
}

function buildGoalUrl(teamId, token) {
  const url = new URL("goal.html", location.origin);
  url.searchParams.set("team", teamId);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function renderExchangeQR(teamId, token) {
  const url = buildGoalUrl(teamId, token);
  if (openExchangePage) openExchangePage.setAttribute("href", url);

  if (exchangeQR) {
    exchangeQR.innerHTML = "";
    if (typeof QRCode === "function") {
      /* global QRCode */
      new QRCode(exchangeQR, {
        text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      const p = document.createElement("p");
      p.textContent = url;
      p.style.wordBreak = "break-all";
      exchangeQR.appendChild(p);
    }
  }
}

function renderState({ teamId, status, exchangeToken }) {
  // まず全部隠す
  hide(startBtn); hide(continueBtn); hide(exchangeSection);

  if (status === "cleared") {
    // クリア済：引換QRのみ
    show(exchangeSection);
    renderExchangeQR(teamId, exchangeToken || null);
    return;
  }
  if (status === "started") {
    // 開始済：「続きから」のみ
    show(continueBtn); return;
  }
  // 未登録：スタートのみ
  show(startBtn);
}

async function init() {
  hide(startBtn); hide(continueBtn); hide(exchangeSection);

  // 1) UID → uidIndex/{uid} で照合（匿名認証を含む）
  let uid = null;
  try { uid = (await ensureAuthed())?.uid; } catch (_) { }
  if (uid) {
    const idx = await getDoc(doc(db, "uidIndex", uid));
    const tid = idx.exists() ? (idx.data()?.teamId || "") : "";
    if (tid) {
      const byIdx = await readTeam(tid);
      if (byIdx) { renderState({ teamId: byIdx.id, status: byIdx.data?.status, exchangeToken: byIdx.data?.exchangeToken }); return; }
    }
  }

  // 2) localStorage('teamId') で照合
  const localId = localStorage.getItem("teamId") || null;
  const byLocal = await readTeam(localId);
  if (byLocal) {
    renderState({ teamId: byLocal.id, status: byLocal.data?.status, exchangeToken: byLocal.data?.exchangeToken });
    return;
  }

  // 3) どちらも見つからない → 未登録扱い（スタートのみ）
  show(startBtn);

}

document.addEventListener("DOMContentLoaded", init);