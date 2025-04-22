// js/map.js

import { db } from "./firebase-init.js";
import {
  collection, getDocs, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let map;
const circleCenters = [
  { id: 1, lat: 35.785014, lng: 139.399027, hint: "図書館前の○○像の足元" },
  { id: 2, lat: 35.788606, lng: 139.399474, hint: "大講義棟裏の小さな庭" },
  { id: 3, lat: 35.785553, lng: 139.398972, hint: "噴水の中心を見よ" },
  { id: 4, lat: 35.785894, lng: 139.39942,  hint: "桜並木のベンチ下" },
  { id: 5, lat: 35.785200, lng: 139.39942,  hint: "カフェテリア横の木陰" },
  { id: 6, lat: 35.785894, lng: 139.39500,  hint: "グラウンド入口付近" }
];

function initMap() {
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
        east:  center.lng + 0.01,
        west:  center.lng - 0.01
      }
    },
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    gestureHandling: "greedy",
    clickableIcons: false
  });

  // ユーザー現在地マーカー
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

  // Firestore からポイント状況をロード
  loadCompleted();
  watchCompleted();
}
window.initMap = initMap;


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

// ── ❸ 描画ヘルパー ──
function drawCircles() {
  circleCenters.forEach(center => {
    if (completed.has(center.id)) return;
    const circle = new google.maps.Circle({
      map,
      center,
      radius: 15,
      strokeColor: "#e53935",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#e57373",
      fillOpacity: 0.35
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

// パネル操作
document.getElementById("toggle-panel").onclick = () =>
  document.getElementById("panel").classList.toggle("open");

document.getElementById("reset").onclick = () => {
  if (confirm("進捗をリセットしますか？")) {
    // Firestore からは Cloud Function 等で削除するかスクリプト実行が必要
    // クライアントキャッシュのみなら localStorage.clear()
    location.reload();
  }
};
