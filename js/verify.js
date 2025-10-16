// js/verify.js
import { db, ensureAuthed } from "./firebase-init.js";
import {
  doc, getDoc, getDocs, collection, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const STAFF_PASSWORD = "tokorozawa";
const VERIFY_KEY = "verify_ok";
const VERIFY_EXP = "verify_exp";
const VERIFY_TTL_MS = 12 * 60 * 60 * 1000;

/* ---------- DOM ---------- */
const titleEl = document.getElementById("statusTitle");
const badgeEl = document.getElementById("statusBadge");
const uidEl = document.getElementById("vUid");
const teamEl = document.getElementById("vTeam");
const memEl = document.getElementById("vMembers");
const foundEl = document.getElementById("vFound");
const elapsedEl = document.getElementById("vElapsed");
const redEl = document.getElementById("vRedeemed");
const redeemBtn = document.getElementById("redeemBtn");
const noteEl = document.getElementById("note");

const layerEl = document.getElementById("pwLayer");
const mainEl = document.getElementById("main");
const pwInput = document.getElementById("pwInput");
const pwBtn = document.getElementById("pwBtn");
const pwMsg = document.getElementById("pwMsg");

/* ---------- util ---------- */
const setBadge = (t, s) => { if (!badgeEl) return; badgeEl.className = `verify-badge ${t}`; badgeEl.textContent = s; };
const fmt = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60; return h > 0 ? `${h}時間${m}分${r}秒` : `${m}分${r}秒`; };

async function unlock() {
  const raw = (pwInput?.value || "").trim();
  if (raw !== STAFF_PASSWORD) {
    if (pwMsg) pwMsg.textContent = "パスワードが違います。";
    pwInput?.focus(); pwInput?.select?.();
    return;
  }
  const exp = Date.now() + VERIFY_TTL_MS;
  try { localStorage.setItem(VERIFY_KEY, "1"); localStorage.setItem(VERIFY_EXP, String(exp)); } catch { }
  if (layerEl) layerEl.hidden = true;
  if (mainEl) mainEl.hidden = false;
  await main();
}

function checkLocalPermit() {
  try {
    const ok = localStorage.getItem(VERIFY_KEY) === "1";
    const exp = Number(localStorage.getItem(VERIFY_EXP) || 0);
    return ok && exp > Date.now();
  } catch { return false; }
}

/* ---------- main ---------- */
async function main() {
  await ensureAuthed();

  const p = new URLSearchParams(location.search);
  const uid = p.get("uid") || "";
  if (uidEl) uidEl.textContent = uid || "-";
  if (!uid) {
    if (titleEl) titleEl.textContent = "無効なQRです";
    setBadge("ng", "UIDがありません");
    if (redeemBtn) redeemBtn.disabled = true;
    return;
  }

  try {
    const ref = doc(db, "teams", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (titleEl) titleEl.textContent = "無効なUIDです";
      setBadge("ng", "チームが見つかりません");
      if (redeemBtn) redeemBtn.disabled = true;
      return;
    }

    const data = snap.data();
    const required = Number(data.goalRequired ?? 4);

    if (teamEl) teamEl.textContent = data.teamName || "-";
    if (memEl) memEl.textContent = String(data.members || 0);

    // 進捗（サーバが正）
    const ps = await getDocs(collection(db, "teams", uid, "points"));
    const foundCount = ps.size;
    if (foundEl) foundEl.textContent = `${foundCount} / ${required}`;

    // 経過時間（参考表示）
    let elapsed = data.elapsed;
    if (!elapsed && data.startTime?.toMillis) {
      const endMs = data.endTime?.toMillis?.() ?? Date.now();
      elapsed = endMs - data.startTime.toMillis();
    }
    if (elapsedEl) elapsedEl.textContent = elapsed ? fmt(elapsed) : "計測なし";

    // 引換済み
    const redeemedAt = data.redeemedAt?.toDate?.();
    if (redeemedAt) {
      if (redEl) redEl.textContent = `済（${redeemedAt.toLocaleString()}）`;
      if (titleEl) titleEl.textContent = "すでに引き換え済み";
      setBadge("ok", "引換済");
      if (redeemBtn) { redeemBtn.disabled = true; redeemBtn.textContent = "引換済み"; }
      return;
    }

    // 条件未達
    if (foundCount < required) {
      if (titleEl) titleEl.textContent = "未達です";
      setBadge("ng", "宝が規定数に達していません");
      if (redeemBtn) redeemBtn.disabled = true;
      if (noteEl) noteEl.textContent = "参加者をマップへご案内ください。";
      return;
    }

    // パス未入力ならロック画面
    if (!checkLocalPermit()) {
      if (mainEl) mainEl.hidden = true;
      if (layerEl) layerEl.hidden = false;
      pwInput?.focus();
      return;
    }

    // 引換可能
    if (titleEl) titleEl.textContent = "引き換えできます";
    setBadge("ok", "OK");
    if (redeemBtn) {
      redeemBtn.disabled = false;
      redeemBtn.textContent = "引き換える";
      redeemBtn.onclick = async () => {
        redeemBtn.disabled = true;
        redeemBtn.textContent = "登録中…";
        try {
          await updateDoc(ref, { redeemedAt: serverTimestamp() });
          if (titleEl) titleEl.textContent = "引き換え完了しました";
          setBadge("ok", "完了");
          if (redEl) redEl.textContent = `済（${new Date().toLocaleString()}）`;
          redeemBtn.textContent = "完了しました";
        } catch (e) {
          console.error("[verify] redeem failed:", e);
          setBadge("warn", "通信エラー");
          if (noteEl) noteEl.textContent = "ネットワーク状況をご確認ください。";
          redeemBtn.textContent = "もう一度試す";
          redeemBtn.disabled = false;
        }
      };
    }
  } catch (e) {
    console.error("[verify] main error:", e);
    if (titleEl) titleEl.textContent = "エラーが発生しました";
    setBadge("warn", "通信エラー");
    if (redeemBtn) redeemBtn.disabled = true;
    if (noteEl) noteEl.textContent = "ネットワーク状況をご確認ください。";
  }
}

/* ---------- 起動 ---------- */
(() => {
  if (checkLocalPermit()) { layerEl && (layerEl.hidden = true); mainEl && (mainEl.hidden = false); main(); }
  else { layerEl && (layerEl.hidden = false); mainEl && (mainEl.hidden = true); }

  const tryAuth = (e) => { e?.preventDefault?.(); unlock(); };
  pwBtn?.addEventListener("click", tryAuth);
  pwInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") tryAuth(e); });
})();
