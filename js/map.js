"use strict";
const ALLOWED = ["https://tokosai.net", "https://www.tokosai.net", "http://localhost:5500", "https://fistkk71.github.io"];
/* ---------- DOM ---------- */
const elMap = document.getElementById("map");
const tpl = document.getElementById("map-config");
const fab = document.getElementById("toggle-panel");
const panel = document.getElementById("panel");
const resetBtn = document.getElementById("reset");
const hintList = document.getElementById("hint-list");


/* ---------- utils ---------- */
function parseJSONSafe(txt, fb) { try { return JSON.parse(txt); } catch { return fb; } }
function getNumber(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function getFoundSet() {
  try { const arr = JSON.parse(localStorage.getItem("found") || "[]"); return new Set(Array.isArray(arr) ? arr : []); }
  catch { return new Set(); }
}
function setFoundSet(set) { localStorage.setItem("found", JSON.stringify([...set])); }

/* ---------- 設定 ---------- */
const cfg = (() => {
  const d = tpl?.dataset ?? {};
  return {
    geojson: d.geojson || "",
    qrHints: parseJSONSafe(d.qrHints, []),
    qrPoints: parseJSONSafe(d.qrPoints, []),  // [{id,name,lat,lng}]
    fallbackCenter: { lat: 35.7863, lng: 139.4722 }, // 所沢駅近辺
    fallbackZoom: getNumber(d.initialZoom, 16),
    circleRadius: 50 // meters
  };
})();



/* ---------- Google Maps 初期化 ---------- */
let map;
const circlesById = new Map();
let __mapBooted = false;
async function initializeMap() {
  if (__mapBooted) return;
  __mapBooted = true;

  if (!elMap) { console.warn("[map] #map が見つかりません"); return; }

  // Map生成
  map = new google.maps.Map(elMap, {
    center: cfg.fallbackCenter,
    zoom: cfg.fallbackZoom,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    clickableIcons: false
  });

  applyScrollBaseStyle();
  fitToQrPoints();
  await addGeoJsonBuildings();
  addCustomLabels();
  renderHints();
  redrawCircles();
  setupPanelUI();

  window.addEventListener("storage", (e) => {
    if (e.key === "found") { redrawCircles(); renderHints(); }
  });
}

function applyScrollBaseStyle() {
  const scrollStyles = [
    { elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "administrative", stylers: [{ visibility: "off" }] },
    { featureType: "water", stylers: [{ visibility: "off" }] },
    { elementType: "geometry", stylers: [{ color: "#d7c4a5" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#b79a75" }] },
    { featureType: "transit.line", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#000000" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#8c6e4f" }] },
    { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#d7c4a5" }] },
    { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#a07d58" }] }
  ];
  map.setOptions({ styles: scrollStyles });
}

async function addGeoJsonBuildings() {
  const path = (cfg.geojson || "").trim();
  if (!path) return;

  const candidates = [
    path,
    new URL(path, location.href).href,
    path.endsWith(".geojson") ? path.replace(/\.geojson$/i, ".json") : path,
    "/" + path.replace(/^\//, ""),
    "./" + path.replace(/^\.\//, "")
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  async function loadInline() {
    const el = document.getElementById("geojson-inline");
    if (!el?.textContent?.trim()) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  }

  let gj = null, lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) { console.warn("GeoJSON HTTP", res.status, url); continue; }
      gj = await res.json();
      console.info("GeoJSON loaded:", url);
      break;
    } catch (e) {
      lastErr = e;
      console.warn("GeoJSON fetch failed:", url, e);
    }
  }
  if (!gj) {
    gj = await loadInline();
    if (!gj) { console.error("GeoJSON load failed (all).", lastErr || ""); return; }
    console.info("GeoJSON loaded from inline <script#geojson-inline>.");
  }

  map.data.forEach(f => map.data.remove(f));
  map.data.addGeoJson(gj);

  map.data.setStyle(feature => {
    const t = feature.getGeometry()?.getType();
    if (t === "Polygon" || t === "MultiPolygon") {
      return {
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: "#c9b28f",
        fillOpacity: 0.99,
        zIndex: 4
      };
    }
    return { visible: false };
  });
}

window.initMap = initializeMap;

/* ---------- 3地点にフィット ---------- */
function fitToQrPoints() {
  if (!Array.isArray(cfg.qrPoints) || cfg.qrPoints.length === 0) return;
  const bounds = new google.maps.LatLngBounds();
  cfg.qrPoints.forEach(p => {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
      bounds.extend({ lat: p.lat, lng: p.lng });
    }
  });
  if (!bounds.isEmpty()) {
    const pad = { top: 80, right: 24, bottom: 100, left: 24 };
    if (google.maps.Padding) map.fitBounds(bounds, pad);
    else map.fitBounds(bounds, 80);
  }
}

/* ---------- GeoJSON（任意） ---------- */
async function addGeoJsonIfAny() {
  if (!cfg.geojson) return;
  try {
    const res = await fetch(cfg.geojson, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const gj = await res.json();
    if (map.data) {
      map.data.addGeoJson(gj);
      map.data.setStyle({
        strokeColor: "#2f5e3f",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#2f5e3f",
        fillOpacity: 0.06
      });
    }
  } catch (e) {
    console.warn("[map] GeoJSON 読み込み失敗:", e);
  }
}

(function ensureLabelCss() {
  if (document.getElementById("map-label-css")) return;
  const s = document.createElement("style");
  s.id = "map-label-css";
  s.textContent = `
    .map-label{
      position:absolute; transform:translate(-50%, -100%);
      font: 700 14px/1.2 "Noto Sans JP", system-ui, sans-serif;
      color:#3e2f28;
      text-shadow:
        -1px -1px 0 #fff, 1px -1px 0 #fff,
        -1px  1px 0 #fff, 1px  1px 0 #fff;
      padding:2px 6px; border-radius:6px;
      background:rgba(255,255,255,0);
      pointer-events:none; user-select:none; white-space:nowrap;
    }
  `;
  document.head.appendChild(s);
})();

/* 2) APIロード後にだけ生成・配置する */
function addCustomLabels() {
  if (!window.google || !google.maps) {
    console.warn("Google Maps API が未ロードです");
    return;
  }

  // 関数内で OverlayView を宣言（グローバルで google を参照しない）
  class HtmlLabel extends google.maps.OverlayView {
    constructor({ position, text, offsetPx = { x: 0, y: 0 }, className = "map-label" }) {
      super();
      this.position = position;
      this.text = text;
      this.offsetPx = offsetPx;
      this.className = className;
      this.div = null;
    }
    onAdd() {
      this.div = document.createElement("div");
      this.div.className = this.className;
      this.div.textContent = this.text;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() {
      if (!this.div) return;
      const p = this.getProjection().fromLatLngToDivPixel(this.position);
      this.div.style.left = `${p.x + (this.offsetPx.x || 0)}px`;
      this.div.style.top = `${p.y + (this.offsetPx.y || 0)}px`;
    }
    onRemove() { this.div?.remove(); this.div = null; }
  }

  // ★ ラベル定義は関数内ローカルに（TDZ回避 & google未定義回避）
  const LABELS = [
    { text: "グランエミオ所沢", lat: 35.78697, lng: 139.47433, offset: { x: 0, y: -40 } },
    { text: "エミテラス所沢", lat: 35.78512, lng: 139.47035, offset: { x: 30, y: 50 } },
    { text: "シティタワー所沢クラッシィ", lat: 35.78673, lng: 139.47145, offset: { x: -20, y: -20} },
    { text: "西武SC", lat: 35.785675, lng: 139.472470, offset: { x: 0, y: 0 } }
  ];

  LABELS.forEach(({ text, lat, lng, offset }) => {
    const pos = new google.maps.LatLng(lat, lng);
    new HtmlLabel({ position: pos, text, offsetPx: offset }).setMap(map);
  });
}



/* ---------- 円の再描画 ---------- */
function redrawCircles() {
  for (const c of circlesById.values()) if (c && c.setMap) c.setMap(null);
  circlesById.clear();

  const points = Array.isArray(cfg.qrPoints) ? cfg.qrPoints : [];
  const EXCLUDE_IDS = new Set([ "EMITERACE", "emiterace", "emi"]);

  for (const p of points) {
    if (!p?.id || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const idStr = String(p.id);
    const nameStr = String(p.name || "");
    if (EXCLUDE_IDS.has(idStr) || /エミテラス/i.test(nameStr)) continue;

    const circle = new google.maps.Circle({
      map,
      center: { lat: p.lat, lng: p.lng },
      radius: cfg.circleRadius,
      strokeColor: "#d93025",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#ea4335",
      fillOpacity: 0.28,
      clickable: false,
      zIndex: 5
    });
    circlesById.set(p.id, circle);
  }
}



/* ---------- ヒント描画 ---------- */
function renderHints() {
  if (!hintList) return;
  hintList.innerHTML = "";
  const hints = Array.isArray(cfg.qrHints) ? cfg.qrHints : [];
  const ul = document.createElement("ul");
  ul.className = "bullets";
  const found = getFoundSet();
  hints.forEach(h => {
    const li = document.createElement("li");
    li.textContent = String(h.hint || "");
    if (h.id && found.has(h.id)) li.style.opacity = ".45"; // 取得済みは薄く
    ul.appendChild(li);
  });
  hintList.appendChild(ul);
}

/* ---------- panel UI（開閉・リセット） ---------- */
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
      fab.setAttribute("aria-label", open ? "ヒントを閉じる" : "ヒントを開く");
      document.body.classList.toggle("panel-open", open);

      // マップリサイズ（アニメ後）
      if (map && typeof google !== "undefined") {
        setTimeout(() => google.maps.event.trigger(map, "resize"), 150);
      }
    };

    setOpen(false);

    fab.addEventListener("click", () => {
      const now = fab.getAttribute("aria-expanded") === "true";
      setOpen(!now);
    });
    closeBtn.addEventListener("click", () => setOpen(false));
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  }

  // リセット：ローカルの取得状態を初期化（赤円を戻す）
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      try { localStorage.removeItem("found"); } catch { }
      redrawCircles(); renderHints();
      resetBtn.disabled = true; resetBtn.textContent = "リセット完了";
      setTimeout(() => { resetBtn.disabled = false; resetBtn.textContent = "リセット"; }, 1200);
    });
  }
}

/* ---------- 公開：QR取得時に円を消すAPI（qr.jsから呼べます） ---------- */
window.markTreasureFound = function (id) {
  if (!id) return;
  const set = getFoundSet(); set.add(id); setFoundSet(set);
  const c = circlesById.get(id); if (c) { c.setMap(null); circlesById.delete(id); }
};

(() => {
  const btn = document.getElementById("scan-qr");
  const wrap = document.getElementById("scanner");
  const video = document.getElementById("qrVideo");
  const canvas = document.getElementById("qrCanvas");
  const ctx = canvas?.getContext("2d");
  const btnClose = document.getElementById("scan-close");
  const btnBack = document.getElementById("scan-back");
  const btnSwitch = document.getElementById("scan-switch");
  const btnTorch = document.getElementById("scan-torch");
  const statusEl = document.getElementById("scan-status");

  if (!btn || !wrap || !video) return;

  let stream = null;
  let tracks = [];
  let devices = [];
  let currentDeviceId = null;
  let scanning = false;
  let rafId = 0;
  let torchOn = false;

  function isProbablyUrl(s) { return /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(s); }
  function handleDecoded(text) {
    try { navigator.vibrate?.(150); } catch { }
    stopScan();

    const t = String(text || "").trim();
    if (!t) return;

    if (isProbablyUrl(t)) { location.href = t; return; }
    const m = t.match(/^qr([1-3])$/i);
    if (m) { location.href = `qr.html?key=${t.toLowerCase()}`; return; }
    if (/^[A-Za-z0-9_\-]{6,}$/.test(t)) {
      location.href = `qr.html?token=${encodeURIComponent(t)}`;
      return;
    }
    alert(`QRを認識しましたが遷移先を判定できません:\n${t}`);
  }

  async function listCameras() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      devices = all.filter(d => d.kind === "videoinput");
    } catch { devices = []; }
  }

  async function startScan(deviceId = null) {
    document.body.classList.add("scanner-open");
    wrap.classList.remove("hidden");
    wrap.setAttribute("aria-hidden", "false");
    statusEl.textContent = "カメラ起動中…";

    await listCameras();
    await stopStreamOnly();

    const constraints = deviceId ? {
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, focusMode: "continuous" },
      audio: false
    } : {
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, focusMode: "continuous" },
      audio: false
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      console.warn("getUserMedia失敗", e);
      alert("カメラを起動できませんでした。ブラウザの権限設定をご確認ください。");
      closeUI(); return;
    }

    tracks = stream.getVideoTracks();
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    await video.play().catch(() => { });

    try {
      const s = stream.getVideoTracks()[0]?.getSettings?.();
      currentDeviceId = s?.deviceId || deviceId || null;
    } catch { }

    scanning = true;
    torchOn = false;
    loopScan();
  }

  async function stopStreamOnly() {
    try { tracks.forEach(t => t.stop()); } catch { }
    tracks = [];
    if (video) { try { video.pause(); } catch { }; video.srcObject = null; }
  }

  async function stopScan() {
    scanning = false;
    cancelAnimationFrame(rafId);
    await stopStreamOnly();
    closeUI();
  }
  function closeUI() {
    document.body.classList.remove("scanner-open");
    wrap.classList.add("hidden");
    wrap.setAttribute("aria-hidden", "true");
    statusEl.textContent = "";
  }

  async function switchCamera() {
    if (!devices.length) await listCameras();
    if (!devices.length) return;
    const idx = Math.max(0, devices.findIndex(d => d.deviceId === currentDeviceId));
    const next = devices[(idx + 1) % devices.length];
    if (next) startScan(next.deviceId);
  }

  async function toggleTorch() {
    try {
      const track = stream?.getVideoTracks?.()[0];
      if (!track) return;
      const caps = track.getCapabilities?.() || {};
      if (!caps.torch) { statusEl.textContent = "この端末はライト非対応です"; return; }
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      statusEl.textContent = torchOn ? "ライトON" : "ライトOFF";
    } catch {
      statusEl.textContent = "ライト切替に失敗しました";
    }
  }

  function loopScan() {
    if (!scanning) return;

    // BarcodeDetectorが使えれば優先
    if ('BarcodeDetector' in window) {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const step = async () => {
        if (!scanning) return;
        try {
          const codes = await det.detect(video);
          if (codes && codes.length) {
            handleDecoded(codes[0].rawValue || "");
            return;
          }
        } catch { }
        statusEl.textContent = "読み取り中…";
        rafId = requestAnimationFrame(step);
      };
      step();
      return;
    }

    // jsQR フォールバック
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
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
        } else {
          statusEl.textContent = "ライブラリ読み込み待ち…";
        }
      } catch { }
      statusEl.textContent = "読み取り中…";
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  // イベント
  btn?.addEventListener("click", () => startScan());
  btnClose?.addEventListener("click", () => stopScan());
  btnBack?.addEventListener("click", () => stopScan()); // ← 戻る＝閉じる
  btnSwitch.addEventListener("click", () => switchCamera());
  btnTorch.addEventListener("click", () => toggleTorch());

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !wrap.classList.contains("hidden")) stopScan();
  });
})();
