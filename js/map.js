// js/map.js  — 既存ロジック + Fantasy Map カスタマイズ
import { db } from "./firebase-init.js";
import {
  collection, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ──────────── 既存: 宝ポイント管理 ──────────── */
let map;
const circleCenters = [
  { id: 1, lat: 35.785017, lng: 139.399029, hint: "1" },
  { id: 2, lat: 35.788606, lng: 139.399474, hint: "2" },
  { id: 3, lat: 35.785553, lng: 139.398972, hint: "3" },
  { id: 4, lat: 35.785894, lng: 139.39942, hint: "4" },
  { id: 5, lat: 35.785200, lng: 139.39942, hint: "5" },
  { id: 6, lat: 35.785131, lng: 139.398385, hint: "6" }
];

export function initMap() {
  const center = { lat: 35.786, lng: 139.3992 };

  map = new google.maps.Map(document.getElementById("map"), {
    center,
    zoom: 17,
    minZoom: 16,
    maxZoom: 20,
    restriction: {
      latLngBounds: {
        north: center.lat + 0.009,
        south: center.lat - 0.009,
        east: center.lng + 0.01,
        west: center.lng - 0.01
      }
    },
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    gestureHandling: "greedy",
    clickableIcons: false
  });

  /* ユーザー現在地マーカー */
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      new google.maps.Marker({
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#4285f4",
          fillOpacity: 1,
          strokeWeight: 0
        },
        title: "現在地"
      });
    });
  }

  /* ── ★ Fantasy カスタマイズを適用 ── */
  applyFantasyStyle();

  /* Firestore 監視開始 */
  loadCompleted();
  watchCompleted();
}
window.initMap = initMap;

/* ──────────── Fantasy カスタマイズ関数 ──────────── */
function applyFantasyStyle() {
  /* 1) 巻物風スタイル */
  const fantasyStyle = [
    { elementType: "geometry", stylers: [{ color: "#d7c4a5" }] },
    { elementType: "labels", stylers: [{ visibility: "off" }] },
    {
      featureType: "road", elementType: "geometry.stroke",
      stylers: [{ color: "#bba788" }, { weight: 1.2 }]
    },
    {
      featureType: "road", elementType: "geometry.fill",
      stylers: [{ color: "#cab9a0" }]
    },
    {
      featureType: "water", elementType: "geometry",
      stylers: [{ color: "#b59f7b" }]
    },
    {
      featureType: "administrative", elementType: "geometry",
      stylers: [{ visibility: "off" }]
    },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] }
  ];
  map.setOptions({ styles: fantasyStyle });

  /* 2) 建物ポリゴン GeoJSON */
  fetch("tokorozawa.geojson")
    .then(r => r.json())
    .then(json => {
      map.data.addGeoJson(json);
      map.data.setStyle({
        strokeColor: "#ffffff",
        strokeWeight: 6,
        fillColor: "#c2ac87",
        fillOpacity: 0.9
      });
    });


  /* 4) ラベル OverlayView */
  class TextLabel extends google.maps.OverlayView {
    constructor(pos, text, size = 20) {
      super();
      this.pos = pos; this.text = text; this.size = size; this.div = null;
    }
    onAdd() {
      this.div = document.createElement("div");
      this.div.className = "campus-label";
      this.div.style.fontSize = this.size + "px";
      this.div.textContent = this.text;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() {
      const p = this.getProjection().fromLatLngToDivPixel(this.pos);
      if (p) { this.div.style.left = p.x + "px"; this.div.style.top = p.y + "px"; }
    }
    onRemove() { this.div.remove(); }
  }
  /* ラベル配置 */
  new TextLabel(new google.maps.LatLng(35.787359, 139.399776), "早稲田大学所沢キャンパス", 22).setMap(map);
  new TextLabel(new google.maps.LatLng(35.788998,139.399433), "101号館").setMap(map);
  new TextLabel(new google.maps.LatLng(35.786226,139.398759), "100号館").setMap(map);
}

/* ──────────── 以下：宝ポイント Firestore ロジック ──────────── */
const completed = new Set();
const uid = new URLSearchParams(location.search).get("uid");

async function loadCompleted() {
  const snap = await getDocs(collection(db, `teams/${uid}/points`));
  snap.forEach(d => completed.add(+d.id));
  drawCircles();
  renderHints();
}
function watchCompleted() {
  onSnapshot(collection(db, `teams/${uid}/points`), snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === "added") completed.add(+ch.doc.id);
    });
    drawCircles();
    renderHints();
  });
}
function drawCircles() {
  circleCenters.forEach(center => {
    if (completed.has(center.id)) return;
    const circle = new google.maps.Circle({
      map, center, radius: 15,
      strokeColor: "#e53935", strokeOpacity: 0.9, strokeWeight: 2,
      fillColor: "#e57373", fillOpacity: 0.35
    });
    const info = new google.maps.InfoWindow({
      content: `<strong>ヒント:</strong> ${center.hint}`
    });
    circle.addListener("click", () => {
      info.setPosition(center);
      info.open(map);
    });
  });
}
function renderHints() {
  const list = document.getElementById("hint-list");
  list.innerHTML = "";
  circleCenters.forEach(c => {
    const div = document.createElement("div");
    div.className = "hint" + (completed.has(c.id) ? " completed" : "");
    div.innerHTML =
      `<span class="index">${c.id}</span>` +
      `<span>${c.hint}</span>` +
      (completed.has(c.id) ? "✅" : "");
    list.appendChild(div);
  });
}

/* ──────────── パネル操作 ──────────── */
document.getElementById("toggle-panel").onclick =
  () => document.getElementById("panel").classList.toggle("open");

document.getElementById("reset").onclick = () => {
  if (confirm("進捗をリセットしますか？")) location.reload();
};
