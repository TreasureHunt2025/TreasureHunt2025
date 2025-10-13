// js/map.js
import { db, requireUidOrRedirect } from "./firebase-init.js";
import { doc, getDocs, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ---------- DOM ---------- */
const elMap = document.getElementById("map");
const tpl = document.getElementById("map-config");
const fab = document.getElementById("toggle-panel");
const panel = document.getElementById("panel");
const resetBtn = document.getElementById("reset");
const hintList = document.getElementById("hint-list");

/* ---------- utils ---------- */
const J = (t, fb) => { try { return JSON.parse(t); } catch { return fb; } };
const N = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
const getFoundSet = () => { try { const a = JSON.parse(localStorage.getItem("found") || "[]"); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); } };
const setFoundSet = (s) => { try { localStorage.setItem("found", JSON.stringify([...s])); } catch { } };

/* ---------- 設定（#map-config の data-* を読む） ---------- */
const cfg = (() => {
  const d = tpl?.dataset ?? {};
  return {
    geojson: d.geojson || "",
    qrHints: J(d.qrHints, []),        // [{id, hint}]
    qrPoints: J(d.qrPoints, []),      // [{id, name, lat, lng}]
    fallbackCenter: { lat: 35.7863, lng: 139.4722 },
    fallbackZoom: N(d.initialZoom, 16),
    circleRadius: N(d.circleRadius, 30), // meters
    goalRequired: N(d.goalRequired, 4)
  };
})();

/* ---------- Google Maps 初期化 ---------- */
let map;
const circlesById = new Map();
let __mapBooted = false;

async function initializeMap() {
  if (__mapBooted) return; __mapBooted = true;
  if (!elMap) { console.warn("[map] #map が見つかりません"); return; }

  map = new google.maps.Map(elMap, {
    center: cfg.fallbackCenter,
    zoom: cfg.fallbackZoom,
    mapTypeControl: false, fullscreenControl: false, streetViewControl: false, clickableIcons: false
  });

  applyBaseStyle();
  fitToQrPoints();
  await addGeoJsonIfAny();
  ensureLabelCss(); addCustomLabels();
  renderHints();
  redrawCircles();
  setupPanelUI();

  // 他タブで found が変わったらUI更新
  window.addEventListener("storage", (e) => {
    if (e.key === "found") { redrawCircles(); renderHints(); }
  });
}
window.initMap = initializeMap;

function applyBaseStyle() {
  map.setOptions({
    styles: [
      { elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] }, 
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "administrative", stylers: [{ visibility: "off" }] },
      { featureType: "water", stylers: [{ visibility: "off" }] },
      { elementType: "geometry", stylers: [{ color: "#d7c4a5" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#b79a75" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#8c6e4f" }] },
      { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#d7c4a5" }] },
      { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#a07d58" }] },
      { featureType: "landscape.man_made", elementType: "all", stylers: [{ visibility: "off" }] }
    ]
  });
}

function fitToQrPoints() {
  if (!Array.isArray(cfg.qrPoints) || !cfg.qrPoints.length) return;
  const bounds = new google.maps.LatLngBounds();
  cfg.qrPoints.forEach(p => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) bounds.extend({ lat: p.lat, lng: p.lng });
  });
  if (!bounds.isEmpty()) {
    const pad = { top: 80, right: 24, bottom: 100, left: 24 };
    if (google.maps.Padding) map.fitBounds(bounds, pad); else map.fitBounds(bounds, 80);
  }
}

async function addGeoJsonIfAny() {
  const path = (cfg.geojson || "").trim();
  if (!path) return;
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const gj = await res.json();
    map.data.addGeoJson(gj);
    map.data.setStyle({
      strokeColor: "#000000ff", strokeOpacity: 0.9, strokeWeight: 2,
      fillColor: "#000000ff", fillOpacity: 0.06
    });
  } catch (e) {
    console.warn("[map] GeoJSON 読み込み失敗:", e);
  }
}

function ensureLabelCss() {
  if (document.getElementById("map-label-css")) return;
  const s = document.createElement("style");
  s.id = "map-label-css";
  s.textContent = `.map-label{position:absolute;transform:translate(-50%,-100%);font:700 14px/1.2 "Noto Sans JP",system-ui,sans-serif;color:#3e2f28;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0);pointer-events:none;user-select:none;white-space:nowrap;}`;
  document.head.appendChild(s);
}
function addCustomLabels() {
  if (!window.google || !google.maps) return;
  class HtmlLabel extends google.maps.OverlayView {
    constructor({ position, text, offsetPx = { x: 0, y: 0 }, className = "map-label" }) { super(); this.position = position; this.text = text; this.offsetPx = offsetPx; this.className = className; this.div = null; }
    onAdd() { this.div = document.createElement("div"); this.div.className = this.className; this.div.textContent = this.text; this.getPanes().overlayMouseTarget.appendChild(this.div); }
    draw() { if (!this.div) return; const p = this.getProjection().fromLatLngToDivPixel(this.position); this.div.style.left = `${p.x + (this.offsetPx.x || 0)}px`; this.div.style.top = `${p.y + (this.offsetPx.y || 0)}px`; }
    onRemove() { this.div?.remove(); this.div = null; }
  }
  const LABELS = [
    { text: "101号館", lat: 35.788937, lng: 139.399460 },
    { text: "スポーツホール", lat: 35.787986, lng: 139.398860 },
    { text: "100号館", lat: 35.785246, lng: 139.398903 },
    { text: "野球場", lat: 35.787352, lng: 139.400279 },
    { text: "陸上競技場", lat: 35.785722, lng: 139.400640 }
  ];
  LABELS.forEach(({ text, lat, lng }) => new HtmlLabel({ position: new google.maps.LatLng(lat, lng), text }).setMap(map));
}

/* ---------- 円の再描画（UIキャッシュと連動） ---------- */
function redrawCircles() {
  for (const c of circlesById.values()) c?.setMap?.(null);
  circlesById.clear();
  const pts = Array.isArray(cfg.qrPoints) ? cfg.qrPoints : [];
  for (const p of pts) {
    if (!p?.id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const circle = new google.maps.Circle({
      map, center: { lat: p.lat, lng: p.lng }, radius: cfg.circleRadius,
      strokeColor: "#d93025", strokeOpacity: 1, strokeWeight: 2, fillColor: "#ea4335", fillOpacity: 0.28,
      clickable: false, zIndex: 5
    });
    circlesById.set(p.id, circle);
  }
}

/* ---------- ヒント描画（取得済みは薄く） ---------- */
function renderHints() {
  if (!hintList) return;
  hintList.innerHTML = "";
  const hints = Array.isArray(cfg.qrHints) ? cfg.qrHints : [];
  const ul = document.createElement("ul"); ul.className = "bullets";
  const found = getFoundSet();
  hints.forEach(h => {
    const li = document.createElement("li");
    li.textContent = String(h.hint || "");
    if (h.id && found.has(h.id)) li.style.opacity = ".45";
    ul.appendChild(li);
  });
  hintList.appendChild(ul);
}

/* ---------- パネルUI（開閉・リセット） ---------- */
function setupPanelUI() {
  if (fab && panel) {
    let closeBtn = panel.querySelector(".panel-close");
    if (!closeBtn) {
      closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "panel-close";
      closeBtn.setAttribute("aria-label", "ヒントを閉じる");
      closeBtn.textContent = "×";
      panel.querySelector(".panel-header")?.appendChild(closeBtn);
    }
    const setOpen = (open) => {
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      panel.classList.toggle("open", open);
      fab.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("panel-open", open);
      if (map && typeof google !== "undefined") setTimeout(() => google.maps.event.trigger(map, "resize"), 150);
    };
    setOpen(false);
    fab.addEventListener("click", () => { const now = fab.getAttribute("aria-expanded") === "true"; setOpen(!now); });
    closeBtn.addEventListener("click", () => setOpen(false));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      try { localStorage.removeItem("found"); } catch { }
      redrawCircles(); renderHints();
      resetBtn.disabled = true; resetBtn.textContent = "リセット完了";
      setTimeout(() => { resetBtn.disabled = false; resetBtn.textContent = "リセット"; }, 1200);
    });
  }
}

/* ---------- QR取得時に円を消す（UIキャッシュ用） ---------- */
window.markTreasureFound = function (id) {
  if (!id) return;
  const set = getFoundSet(); set.add(id); setFoundSet(set);
  const c = circlesById.get(id); if (c) { c.setMap(null); circlesById.delete(id); }
};

/* ---------- 終了ボタン制御（サーバが正） ---------- */
function toggleFinishButton(show, uid) {
  const btn = document.getElementById("finishBtn") || document.getElementById("finish-btn");
  if (!btn) return;
  btn.style.display = show ? "block" : "none";
  if (show) btn.onclick = () => { location.href = `goal.html?uid=${encodeURIComponent(uid)}`; };
}

/* ---------- Firestore同期 & スキャナ ---------- */
let uid;

(async () => {
  uid = await requireUidOrRedirect();
  await initializeMap();

  // 初期：サーバの取得済みをUIに反映
  const snap = await getDocs(collection(db, "teams", uid, "points"));
  const foundServer = new Set(); snap.forEach(d => foundServer.add(d.id));
  const cacheSet = getFoundSet(); foundServer.forEach(id => cacheSet.add(id)); setFoundSet(cacheSet);
  redrawCircles(); renderHints();
  foundServer.forEach(id => window.markTreasureFound(id));
  toggleFinishButton(foundServer.size >= cfg.goalRequired, uid);

  // リアルタイム
  onSnapshot(collection(db, "teams", uid, "points"), (qs) => {
    const s = new Set(); qs.forEach(d => s.add(d.id));
    setFoundSet(s);
    redrawCircles(); renderHints();
    s.forEach(id => window.markTreasureFound(id));
    toggleFinishButton(s.size >= cfg.goalRequired, uid);
  });

  // QRスキャナ
  setupScanner(uid);
})();

/* ---------- スキャナ実装（BarcodeDetector → jsQR フォールバック） ---------- */
function setupScanner(uid) {
  const btn = document.getElementById("scan-qr");
  const wrap = document.getElementById("scanner");
  const video = document.getElementById("qrVideo");
  const canvas = document.getElementById("qrCanvas");
  const statusEl = document.getElementById("scan-status");
  const btnClose = document.getElementById("scan-close");
  const btnBack = document.getElementById("scan-back");
  const btnSwitch = document.getElementById("scan-switch");
  const btnTorch = document.getElementById("scan-torch");
  if (!btn || !wrap || !video) return;

  let stream = null, tracks = [], devices = [], currentDeviceId = null, scanning = false, rafId = 0, torchOn = false;

  const isUrl = (s) => /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(s);

  function handleDecoded(text) {
    try { navigator.vibrate?.(150); } catch { }
    stopScan();
    const t = String(text || "").trim(); if (!t) return;
    if (isUrl(t)) { location.href = t; return; }
    const m = t.match(/^qr([1-6])$/i);
    if (m) { location.href = `qr.html?key=${t.toLowerCase()}&uid=${encodeURIComponent(uid)}`; return; }
    if (/^[A-Za-z0-9_\-]{6,}$/.test(t)) { location.href = `qr.html?token=${encodeURIComponent(t)}&uid=${encodeURIComponent(uid)}`; return; }
    alert(`QRを認識しましたが遷移先を判定できません:\n${t}`);
  }

  async function listCameras() { try { const all = await navigator.mediaDevices.enumerateDevices(); devices = all.filter(d => d.kind === "videoinput"); } catch { devices = []; } }
  async function startScan(deviceId = null) {
    document.body.classList.add("scanner-open");
    wrap.classList.remove("hidden"); wrap.setAttribute("aria-hidden", "false");
    statusEl && (statusEl.textContent = "カメラ起動中…");
    await listCameras(); await stopStreamOnly();
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, focusMode: "continuous" }, audio: false }
      : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, focusMode: "continuous" }, audio: false };
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { console.warn("getUserMedia失敗", e); alert("カメラを起動できませんでした。ブラウザの権限設定をご確認ください。"); closeUI(); return; }
    tracks = stream.getVideoTracks(); video.srcObject = stream; video.setAttribute("playsinline", "true"); await video.play().catch(() => { });
    try { const s = tracks[0]?.getSettings?.(); currentDeviceId = s?.deviceId || deviceId || null; } catch { }
    scanning = true; torchOn = false; loopScan();
  }
  async function stopStreamOnly() { try { tracks.forEach(t => t.stop()); } catch { } tracks = []; try { video.pause(); } catch { } video.srcObject = null; }
  async function stopScan() { scanning = false; cancelAnimationFrame(rafId); await stopStreamOnly(); closeUI(); }
  function closeUI() { document.body.classList.remove("scanner-open"); wrap.classList.add("hidden"); wrap.setAttribute("aria-hidden", "true"); statusEl && (statusEl.textContent = ""); }
  async function switchCamera() { if (!devices.length) await listCameras(); if (!devices.length) return; const idx = Math.max(0, devices.findIndex(d => d.deviceId === currentDeviceId)); const next = devices[(idx + 1) % devices.length]; if (next) startScan(next.deviceId); }
  async function toggleTorch() {
    try {
      const track = stream?.getVideoTracks?.()[0]; if (!track) return;
      const caps = track.getCapabilities?.() || {}; if (!caps.torch) { statusEl && (statusEl.textContent = "この端末はライト非対応です"); return; }
      await track.applyConstraints({ advanced: [{ torch: !(torchOn) }] }); torchOn = !torchOn;
      statusEl && (statusEl.textContent = torchOn ? "ライトON" : "ライトOFF");
    } catch { statusEl && (statusEl.textContent = "ライト切替に失敗しました"); }
  }

  function loopScan() {
    if (!scanning) return;
    if ("BarcodeDetector" in window) {
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      const step = async () => {
        if (!scanning) return;
        try { const codes = await det.detect(video); if (codes?.length) { handleDecoded(codes[0].rawValue || ""); return; } }
        catch { }
        statusEl && (statusEl.textContent = "読み取り中…");
        rafId = requestAnimationFrame(step);
      };
      step(); return;
    }
    const w = video.videoWidth || 1280, h = video.videoHeight || 720;
    canvas.width = w; canvas.height = h;
    const tick = () => {
      if (!scanning) return;
      try {
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        if (window.jsQR) {
          const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) { handleDecoded(code.data); return; }
        } else { statusEl && (statusEl.textContent = "ライブラリ読み込み待ち…"); }
      } catch { }
      statusEl && (statusEl.textContent = "読み取り中…");
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  btn?.addEventListener("click", () => startScan());
  btnClose?.addEventListener("click", () => stopScan());
  btnBack?.addEventListener("click", () => stopScan());
  btnSwitch?.addEventListener("click", () => switchCamera());
  btnTorch?.addEventListener("click", () => toggleTorch());
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !wrap.classList.contains("hidden")) stopScan(); });
}
