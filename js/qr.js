const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "http://localhost:5500", "https://fistkk71.github.io"];

import { db, ensureAuthed } from "./firebase-init.js";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}時間${m}分${s}秒` : `${m}分${s}秒`;
};

function yyyymmddJST() {
  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  return `${p.find(x => x.type === "year").value}${p.find(x => x.type === "month").value}${p.find(x => x.type === "day").value}`;
}

const TOKEN_TABLE = Object.freeze({
  "TH-GOAL-GRAND": "qr1",
  "TH-GOAL-CITY": "qr2",
  "TH-QR1": "qr1",
  "TH-QR2": "qr2",
  "TH-QR3": "qr3",
  "TH-QR4": "qr4",
  "TH-QR5": "qr5",
  "TH-QR6": "qr6",
  "G7fS9LzA": "qr1",
  "T9nDv4We": "qr2"
});

async function init() {
  // ===== メタ（qr.html内template 未変更でも動くが、可能なら data-total="1" に） =====
  const metaEl = document.getElementById("qr-meta");
  const META = metaEl?.dataset || {};
  const TOTAL = 6; // ← 強制 1 個で終了
  const VIDEO_SRC = META.video || "./image/treasure.mp4";
  const POINTS = [
  { id: "qr1", name: "treasure1" },
  { id: "qr2", name: "treasure2" },
  { id: "qr3", name: "treasure3" },
  { id: "qr4", name: "treasure4" },
  { id: "qr5", name: "treasure5" },
  { id: "qr6", name: "treasure6" }
];

  // ===== HUD =====
  const totalCountEl = document.getElementById("totalCount");
  const foundCountEl = document.getElementById("foundCount");
  const remainCountEl = document.getElementById("remainCount");
  const elapsedTimeEl = document.getElementById("elapsedTime");
  const progressBarEl = document.getElementById("progress-bar");
  const titleEl = document.getElementById("qrTitle");
  const placeEl = document.getElementById("qrPlace");
  const goalNote = document.getElementById("goalNote");
  totalCountEl && (totalCountEl.textContent = String(TOTAL));

  document.getElementById("skipBtn")?.remove();
  await ensureAuthed();

  // ===== uid 決定 =====
  const qs = new URLSearchParams(location.search);
  const qsUid = qs.get("uid");
  const TEST_MODE = qs.get("test") === "1" || qsUid === "test" || location.hostname === "localhost";

  if (qsUid) localStorage.setItem("uid", qsUid);
  let uid = localStorage.getItem("uid");
  if (!uid && TEST_MODE) { uid = "test"; localStorage.setItem("uid", "test"); }
  if (!uid) { showRegisterOverlay(); return; }

  try {
    const teamSnap = await getDoc(doc(db, "teams", uid));
  let REQUIRED = 4;
    const team = teamSnap.exists() ? teamSnap.data() : null;
    const today = (() => {
      const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      return `${p.find(x => x.type === "year").value}${p.find(x => x.type === "month").value}${p.find(x => x.type === "day").value}`;
    })();
    if (!team || team.playDay !== today) {
      localStorage.removeItem("uid");
      showRegisterOverlay();
      return;
    }
    if (team.redeemedAt) {
      titleEl && (titleEl.textContent = "本日の参加は終了しました");
      placeEl && (placeEl.textContent = "受付にて引換済みです。");
      setPrimaryCTA("トップへ戻る", () => location.href = "index.html");
      return;
    }
  } catch {
    localStorage.removeItem("uid");
    showRegisterOverlay();
    return;
  }

  // ===== 地点判定 =====
  const rawKey = (qs.get("key") || qs.get("k") || qs.get("id") || "").toLowerCase();
  const token = qs.get("token") || qs.get("t") || "";
  const key = rawKey || TOKEN_TABLE[token] || "";
  const point = POINTS.find(p => p.id === key);

  if (!key || !point) {
    titleEl.textContent = "QRが無効です";
    placeEl.textContent = "もう一度スキャンしてください。";
    setPrimaryCTA("無効なQRです", null, { disabled: true });
  } else {
    titleEl.textContent = "お宝のQRを発見！";
    placeEl.textContent = `地点：${point.name}`;
    setPrimaryCTA("ゲームをプレイする", runFlow);
  }

  updateHUD();

  const teamSnap = await getDoc(doc(db, "teams", uid));
  let REQUIRED = 4;
  const team = teamSnap.data();
  if (team && Number.isFinite(Number(team.goalRequired))) REQUIRED = Number(team.goalRequired);
  if (team?.redeemedAt) {
    titleEl.textContent = "このチームは引き換え済みです";
    placeEl.textContent = "ゲームは終了しています。";
    setPrimaryCTA("引き換え済み", null, { disabled: true });
    return;
  }

  if (key) {
    const pointRef = doc(db, "teams", uid, "points", key);
    const doneSnap = await getDoc(pointRef);
    if (doneSnap.exists()) {
      await updateHUD();
      const count = (await getDocs(collection(db, "teams", uid, "points"))).size;

      titleEl && (titleEl.textContent = "このスポットはクリア済みです");
      placeEl && (placeEl.textContent = "次のスポットへお進みください。");

      if (count >= TOTAL) { window.location.href = "./goal.html"; } else if (count >= REQUIRED) { try { localStorage.setItem("canFinish","1"); } catch(e){} } else if (
        try { localStorage.setItem('th_cleared', '1'); } catch { }
        goalNote?.classList.remove("hidden");
        setPrimaryCTA("クーポン券を受け取る", () => {
          location.href = `goal.html?uid=${encodeURIComponent(uid)}`;
        });
      } else {
        setPrimaryCTA("次のお宝を探す", () => { location.href = "map.html"; });
      }
      return;
    }
  }

  async function updateHUD() {
    try {
      const pointsSnap = await getDocs(collection(db, "teams", uid, "points"));
      const count = pointsSnap.size;
      foundCountEl && (foundCountEl.textContent = String(count));
      remainCountEl && (remainCountEl.textContent = String(Math.max(TOTAL - count, 0)));
      progressBarEl && (progressBarEl.style.width = `${Math.min(100, (count / TOTAL) * 100)}%`);

      const teamSnap = await getDoc(doc(db, "teams", uid));
  let REQUIRED = 4;
      if (teamSnap.exists() && teamSnap.data().startTime) {
        const startMs = teamSnap.data().startTime.toMillis();
        elapsedTimeEl && (elapsedTimeEl.textContent = fmt(Date.now() - startMs));
      }
    } catch (e) { console.error("HUD更新失敗:", e); }
  }

  function setPrimaryCTA(label, onClick, opts = {}) {
    const current = document.getElementById("primaryCta");
    if (!current) return null;
    const btn = current.cloneNode(true);
    btn.id = "primaryCta";
    btn.textContent = label;
    btn.className = opts.className || current.className;
    btn.disabled = !!opts.disabled;
    current.replaceWith(btn);
    if (typeof onClick === "function") btn.addEventListener("click", onClick);
    return btn;
  }

  function playTetrisInOverlay(targetLines = 7) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, { position: "fixed", inset: "0", background: "#000", display: "grid", placeItems: "center", zIndex: "4000" });
      const frame = document.createElement("iframe");
      frame.src = `./game1/tetris.html?target=${encodeURIComponent(targetLines)}`;
      frame.setAttribute("allow", "fullscreen *; autoplay *; gamepad *");
      Object.assign(frame.style, { width: "100vw", height: "100vh", border: "0", background: "#000" });
      overlay.appendChild(frame);
      document.body.appendChild(overlay);

      const onMsg = (ev) => {
        const d = ev.data;
        if (!d || d.type !== "minigame:clear") return;
        cleanup();
        resolve(Boolean(d.detail?.cleared));
      };
      window.addEventListener("message", onMsg);
      function cleanup() { window.removeEventListener("message", onMsg); overlay.remove(); }
    });
  }
  function playDummyCountdown() {
    return new Promise(async (resolve) => {
      const btn = setPrimaryCTA("プレイ中…", null, { disabled: true });
      for (let i = 3; i >= 1; i--) { if (btn) btn.textContent = `プレイ中… ${i}`; await sleep(1000); }
      resolve(true);
    });
  }

  async function recordTreasureIfNeeded(pointId) {
    const ref = doc(db, "teams", uid, "points", pointId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      try {
        await setDoc(ref, { foundAt: serverTimestamp() });
      } catch (e) {
        console.error("ポイント保存失敗:", e);
        if (e?.code === "permission-denied") {
          titleEl && (titleEl.textContent = "登録した端末で読み取ってください");
          placeEl && (placeEl.textContent = "受付で登録したスマホ（同じブラウザ）をご使用ください。");
          setPrimaryCTA("トップへ戻る", () => location.href = "index.html");
        } else {
          setPrimaryCTA("通信エラーでもう一度", () => runFlow());
        }
        return false;
      }
    }
    try {
      window.markTreasureFound?.(pointId);
      const s = new Set(JSON.parse(localStorage.getItem("found") || "[]"));
      s.add(pointId); localStorage.setItem("found", JSON.stringify([...s]));
    } catch { }
    return true;
  }

  async function saveElapsedIfNeeded(uid) {
    try {
      const teamRef = doc(db, "teams", uid);
      const snap = await getDoc(teamRef);
      if (!snap.exists()) return;

      const data = snap.data();
      // まだ記録されていなくて startTime がある時だけ保存
      if (!data.elapsed && data.startTime?.toMillis) {
        const elapsed = Date.now() - data.startTime.toMillis(); // ms
        await updateDoc(teamRef, { endTime: serverTimestamp(), elapsed });
      }
    } catch (e) {
      console.error("[qr] saveElapsedIfNeeded failed:", e);
    }
  }

  function playRewardFull() {
    return new Promise(async (resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        background: "#000",
        display: "grid",
        placeItems: "center",
        zIndex: "5000",
      });

      const video = document.createElement("video");
      video.src = VIDEO_SRC;
      video.playsInline = true;
      video.setAttribute("webkit-playsinline", "");
      video.autoplay = true;
      video.muted = false;
      video.controls = false;
      video.setAttribute("controlsList", "nodownload noplaybackrate noremoteplayback");
      video.disablePictureInPicture = true;

      Object.assign(video.style, {
        width: "100vw",
        height: "100vh",
        objectFit: "contain",
        background: "#000",
      });

      overlay.appendChild(video);
      document.body.appendChild(overlay);

      let hideTimer = null;
      const showControlsTemporarily = () => {
        video.controls = true;
        try {
          video.muted = false;
          video.play().catch(() => { });
        } catch { }
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          video.controls = false;
        }, 2000);
      };

      overlay.addEventListener("pointerdown", showControlsTemporarily);

      const finish = async () => {
        overlay.removeEventListener("pointerdown", showControlsTemporarily);
        clearTimeout(hideTimer);
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
        } catch { }
        overlay.remove();
        resolve();
      };

      video.addEventListener("ended", finish, { once: true });

      video.play().catch(() => {
        const onTapToPlay = () => {
          try { video.currentTime = 0; video.muted = false; video.play().catch(() => { }); } catch { }
          overlay.removeEventListener("pointerdown", onTapToPlay);
        };
        overlay.addEventListener("pointerdown", onTapToPlay, { once: true });
        showControlsTemporarily();
      });

      try {
        const p = overlay.requestFullscreen?.() || video.requestFullscreen?.();
        if (p && typeof p.then === "function") await p;
      } catch { }
    });
  }


  async function runAfterGame() {
    await playRewardFull();
    try {
      const ok = key ? await recordTreasureIfNeeded(key) : true;
      if (!ok) return;
      await updateHUD();
      const count = (await getDocs(collection(db, "teams", uid, "points"))).size;
      if (count >= TOTAL) { window.location.href = "./goal.html"; } else if (count >= REQUIRED) { try { localStorage.setItem("canFinish","1"); } catch(e){} } else if (
        try { localStorage.setItem('th_cleared', '1'); } catch { }
        await saveElapsedIfNeeded(uid);
        goalNote?.classList.remove("hidden");
        setPrimaryCTA("クーポン券を受け取る", () => { location.href = `goal.html?uid=${encodeURIComponent(uid)}`; });
      } else {
        setPrimaryCTA("次のお宝を探す", () => { location.href = "map.html"; });
      }
    } catch (e) {
      console.error(e);
      setPrimaryCTA("次のお宝を探す", () => { location.href = "map.html"; });
    }
  }

  async function runFlow() {
    if (!key || !point) return;
    setPrimaryCTA("ゲーム起動中…", null, { disabled: true });
    let cleared = false;
    const TARGET_BY_POINT = { qr1: 7, qr2: 7 }; // ← 目標ライン数。必要なら値を変えてOK
    const targetLines = TARGET_BY_POINT[key] ?? 7;
    if (key === "qr1" || key === "qr2") {
      cleared = await playTetrisInOverlay(targetLines);
    } else {
      cleared = true;
    }
    if (!cleared) { setPrimaryCTA("再チャレンジしますか？", runFlow); return; }
    await runAfterGame();
  }
}

function showRegisterOverlay() {
  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "5000",
    background: "rgba(0,0,0,.85)", display: "grid", placeItems: "center", padding: "24px"
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(720px, 96%)", background: "#fff", color: "#222",
    borderRadius: "16px", padding: "24px", textAlign: "center",
    boxShadow: "0 14px 40px rgba(0,0,0,.25)"
  });

  card.innerHTML = `
    <h2 style="margin:.2rem 0 .6rem; font-size:1.4rem;">まずはエミテラスの受付へ</h2>
    <p style="margin:0 0 1rem; line-height:1.7;">
      このQRは<span style="font-weight:700;">参加登録後</span>に挑戦できます。<br>
      先にエミテラス受付で参加登録をお願いします。
    </p>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  try { document.body.style.overflow = "hidden"; } catch { }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { init().catch(console.error); });
} else {
  init().catch(console.error);
}

function ensureMovieLayer() {
  if (document.getElementById("movieLayer")) return;
  const layer = document.createElement("div");
  layer.id = "movieLayer";
  Object.assign(layer.style, { position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "grid", placeItems: "center", zIndex: 5000, padding: "16px" });
  layer.innerHTML = `
    <div style="width:min(920px,96%); background:#000; border-radius:12px; padding:12px; box-shadow:0 20px 60px rgba(0,0,0,.5);">
      <video id="moviePlayer" style="width:100%; height:auto; display:block; background:#000;" playsinline controls></video>
      <div style="display:flex; gap:8px; justify-content:center; margin-top:8px;">
        <button id="mvClose" class="btn-secondary">閉じる</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  document.getElementById("mvClose")?.addEventListener("click", () => { layer.style.display = "none"; const v = document.getElementById("moviePlayer"); v && (v.pause(), v.removeAttribute("src"), v.load()); });
}

function maybeFinish(count, REQUIRED, TOTAL) {
  if (count >= TOTAL) {
    window.location.href = "./goal.html";
  } else if (count >= REQUIRED) {
    try { localStorage.setItem("canFinish","1"); } catch(e){}
  }
}
