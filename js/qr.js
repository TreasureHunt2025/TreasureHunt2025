import { db } from "./firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ▼▼ 本番用トークンに置き換えてください ▼▼
const TOKEN_TABLE = {
  "G7fS9LzA": 1,
  "Kq3vX21b": 2,
  "T9nDv4We": 3,
  "P5yLm8Qr": 4,
  "Z1hCx6Ua": 5,
  "R2sBj7Op": 6
};

// 登録済み uid を localStorage から取得
const uid = localStorage.getItem('uid');
// URL パラメータからトークン取得
const token = new URLSearchParams(location.search).get('t');
const nextBtn = document.getElementById('nextBtn');

async function handleTreasure() {
  if (!uid) {
    alert('参加者情報が見つかりません');
    return;
  }
  const pointId = TOKEN_TABLE[token];
  if (!pointId) {
    alert('無効なQRコードです');
    return;
  }

  // ポイント記録（重複チェック）
  const pointRef = doc(db, 'teams', uid, 'points', String(pointId));
  const snap = await getDoc(pointRef);
  if (!snap.exists()) {
    await setDoc(pointRef, { foundAt: serverTimestamp() });
  }

  // 発見済み数を取得
  const pointsSnap = await getDocs(collection(db, 'teams', uid, 'points'));
  const count = pointsSnap.size;

  // 4~5個なら選択ダイアログ、6個なら自動ゴール
  const goalUrl = `goal.html?uid=${uid}`;
  const mapUrl = `map.html?uid=${uid}`;

  if (count >= 6) {
    // 6個すべて発見でゴールへ
    location.href = goalUrl;
  } else if (count >= 4) {
    // 4~5個目：続けるか確認
    const finish = confirm(`お宝を${count}個見つけました！\n終了してゴールへ進みますか？`);
    if (finish) {
      location.href = goalUrl;
    } else {
      location.href = mapUrl;
    }
  } else {
    // 1~3個：自動マップへ
    location.href = mapUrl;
  }
}

// ボタンクリックおよび読み込み時に実行
nextBtn.addEventListener('click', handleTreasure);
