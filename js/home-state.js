import { db, ensureAuthed, toTeamId } from "./firebase-init.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const startBtn = document.getElementById("startBtn");
const continueBtn = document.getElementById("continueBtn");
const recoverBtn = document.getElementById("recoverBtn");
const exchangeSection = document.getElementById("exchangeSection");
const exchangeQR = document.getElementById("exchangeQR");
const openExchangePage = document.getElementById("openExchangePage");

const reclaimModal = document.getElementById("reclaimModal");
const reclaimTeam = document.getElementById("reclaimTeam");
const reclaimBtn = document.getElementById("reclaimBtn");

// エラー表示用（モーダル内に <p id="reclaimError"> を用意していない場合は動的生成）
let reclaimError = document.getElementById("reclaimError");
if (!reclaimError && reclaimModal) {
  reclaimError = document.createElement("p");
  reclaimError.id = "reclaimError";
  reclaimError.style.color = "#fdd835";
  reclaimError.style.marginTop = ".6em";
  reclaimError.style.fontSize = "0.9em";
  reclaimModal.querySelector("form")?.appendChild(reclaimError);
}

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
  hide(startBtn); hide(continueBtn); hide(recoverBtn); hide(exchangeSection);

  if (status === "cleared") {
    // クリア済：引換QRのみ
    show(exchangeSection);
    renderExchangeQR(teamId, exchangeToken || null);
    return;
  }
  if (status === "started") {
    // 開始済：「続きから」+「タブを閉じた人へ」
    show(continueBtn);
    show(recoverBtn);
    return;
  }
  // 未登録：スタートのみ
  show(startBtn);
}

async function init() {
  hide(startBtn); hide(continueBtn); hide(recoverBtn); hide(exchangeSection);

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

  // ただし、ストレージが永続化されていない環境（incognito等）の場合は救済として「タブを閉じた人へ」を提示
  try {
    if (navigator.storage?.persisted) {
      const persisted = await navigator.storage.persisted();
      if (!persisted) show(recoverBtn);
    }
  } catch (_) { }
}

document.addEventListener("DOMContentLoaded", init);

// 「タブを閉じた人へ」→ モーダル開く
recoverBtn?.addEventListener("click", () => {
  if (reclaimModal?.showModal) {
    reclaimError.textContent = "";
    reclaimTeam.value = "";
    reclaimModal.showModal();
  }
});

// 再判定ロジック
reclaimBtn?.addEventListener("click", async (ev) => {
  ev.preventDefault();
  reclaimError.textContent = "";

  const name = reclaimTeam?.value || "";
  const inputId = toTeamId(name);
  if (!inputId) { reclaimError.textContent = "チーム名を入力してください。"; return; }

  // 既にこの端末で別チームが保存されていればブロック
  const currentId = localStorage.getItem("teamId");
  if (currentId && currentId !== inputId) {
    reclaimError.textContent = "この端末では別のチームで開始済みです。登録時の端末で続きから実行してください。";
    return;
  }

  // 1) teamId 直参照
  let team = await readTeam(inputId);

  // 2) 見つからなければ「旧UIDキー（同名）」を検索→移行
  if (!team) {
    const q = query(collection(db, "teams"),
      where("teamName", "==", name.trim()),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const old = snap.docs[0];
      const oldId = old.id;
      const data = old.data();

      // teamIdキーへコピー
      await setDoc(doc(db, "teams", inputId), {
        ...data,
        teamId: inputId,
        migratedFrom: oldId,
        migratedAt: serverTimestamp()
      }, { merge: true });

      // points サブコレクション移行
      const points = await getDocs(collection(db, "teams", oldId, "points"));
      for (const p of points.docs) {
        await setDoc(doc(db, "teams", inputId, "points", p.id), p.data(), { merge: true });
      }
      // インデックス（この端末のUID→teamId）
      try {
        const uid = (await ensureAuthed())?.uid;
        if (uid) await setDoc(doc(db, "uidIndex", uid), { teamId: inputId, linkedAt: serverTimestamp() }, { merge: true });
      } catch { }

      team = await readTeam(inputId);
    }
  }

  if (!team) { reclaimError.textContent = "登録が見つかりません。新規の方は「ゲームスタート」から登録してください。"; return; }


  // 端末に保存（以後は通常フローで拾える）
  localStorage.setItem("teamId", inputId);
  localStorage.setItem("teamName", name);

  // 状態に応じて分岐
  const status = team.data?.status || "started";
  if (status === "cleared") {
    // ホームを引換表示へ
    if (reclaimModal?.open) reclaimModal.close();
    renderState({ teamId: team.id, status: "cleared", exchangeToken: team.data?.exchangeToken || null });
    return;
  }

  if (status === "started") {
    // 同じチーム名として再開：map へ
    if (reclaimModal?.open) reclaimModal.close();
    location.href = "map.html?team=" + encodeURIComponent(team.id);
    return;
  }

  // それ以外は未登録扱い
  reclaimError.textContent = "状態を確認できませんでした。お手数ですが「ゲームスタート」からやり直してください。";
});
