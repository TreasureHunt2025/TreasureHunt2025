// /game3/AB.js — 完全版（5連続正解→CLEAR→5秒後にqr3へ、失敗は場内リトライ）
(() => {
  'use strict';

  // ===== 問題データ（左が正解。both:true は両方正解） =====
  const QUESTIONS = [
    { q: '日本の国鳥は？', a: ['キジ', 'ツル'] },
    { q: 'イカの血の色は？', a: ['青', '赤'] },
    { q: 'ペンギンが住んでいるのは？', a: ['南極', '北極'] },
    { q: '世界で一番売れたゲームは？', a: ['マインクラフト', 'テトリス'] },
    { q: '「おにぎり」と「おむすび」の違いは？', a: ['地域による言い方の違い', '形の違い'] },
    { q: '所沢キャンパスにある学部は人間科学部と？', a: ['スポーツ科学部', '文学部'] },
    { q: '早稲田のライバル校としてよく挙げられるのは？', a: ['慶應義塾大学', '青山学院大学'] },
    { q: 'スイカゲームで最初に出る果物は？', a: ['さくらんぼ', 'みかん'] },
    { q: '人間とバナナのDNAの一致率は？', a: ['60%', '12%'] },
    { q: '大隈講堂と札幌時計台はどちらが高い？', a: ['大隈講堂', '札幌時計台'] },
    { q: '大隈講堂と東大寺大仏殿はどちらが大きい？', a: ['東大寺大仏殿', '大隈講堂'] },
    { q: 'タコの心臓は何個？', a: ['3個', '2個'] },
    { q: '南極と北極、寒いのは？', a: ['南極', '北極'] },
    { q: 'サンタ服が赤い由来は？', a: ['コカコーラの広告', '北欧の伝統衣装'] },
    { q: 'アメリカで最も売れるエナジー飲料は？', a: ['モンスター', 'レッドブル'] },
    { q: '尊敬すべき人はどっち？', a: ['お父さん', 'お母さん'], both: true },
    { q: 'ゼルダの主人公の名前は？', a: ['リンク', 'ゼルダ'] },
    { q: 'ポケモンで「伝説」は？', a: ['アルセウス', 'パチリス'] },
    { q: '2025年10月13日は何の日？', a: ['スポーツの日', '文化の日'] },
    { q: 'うるう年は何日？', a: ['366日', '364日'] },
  ];

  // ===== DOM =====
  const elQ = document.getElementById('question');
  const elA = document.getElementById('btnA');
  const elB = document.getElementById('btnB');
  const elStreak = document.getElementById('streak');
  const elStatus = document.getElementById('status');
  const elProgress = document.getElementById('progress');
  const panel = document.querySelector('.panel');

  // 開始スプラッシュ（CLEARでも再利用）
  const splash = document.getElementById('splash');         // 既存の開始ダイアログを流用（HTMLにあり） :contentReference[oaicite:2]{index=2}
  const startBtn = document.getElementById('startQuiz');    // PLAYボタン（開始時のみ使用） :contentReference[oaicite:3]{index=3}

  // 正誤FX
  const fx = document.createElement('div');
  fx.className = 'fx';
  panel.appendChild(fx);

  // ===== 状態 =====
  const NEED = 5;          // 連続正解でクリア
  let set = [];            // 今回の出題インデックス（5問）
  let index = 0;           // セット内の現在位置
  let streak = 0;          // 連続正解数
  let current = null;      // 現在の問題
  let shownOptions = [];   // 実際に表示している[左,右]
  let correctIdx = 0;      // 正解ボタンindex（0/1）
  let busy = false;        // 入力ロック

  // ===== ユーティリティ =====
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pickRandomSet = (n = NEED) => shuffle([...Array(QUESTIONS.length)].map((_, i) => i)).slice(0, n);
  const setProgress = (n) => { [...elProgress.children].forEach((b, i) => b.classList.toggle('filled', i < n)); };
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { } };
  const clearFx = () => {
    panel.classList.remove('correct', 'wrong', 'both', 'show-correct', 'show-wrong', 'show-both', 'shake');
    elA.classList.remove('good', 'bad'); elB.classList.remove('good', 'bad');
    fx.className = 'fx'; fx.textContent = '';
  };

  // ===== 出題表示 =====
  const render = () => {
    clearFx();
    current = QUESTIONS[set[index]];
    elQ.textContent = current.q;

    // 左右ランダム配置（元データは左が正解）
    const base = [current.a[0], current.a[1]];
    if (Math.random() < 0.5) {
      shownOptions = base; correctIdx = 0; elA.classList.remove('alt'); elB.classList.add('alt');
    } else {
      shownOptions = [base[1], base[0]]; correctIdx = 1; elA.classList.add('alt'); elB.classList.remove('alt');
    }
    elA.textContent = shownOptions[0];
    elB.textContent = shownOptions[1];

    elStreak.textContent = String(streak); setProgress(streak);
    elStatus.textContent = `Q${index + 1} / ${NEED}`;
    busy = false; disableChoices(false);
  };

  // ===== 判定 =====
  const answer = (pickedIdx) => {
    if (busy) return;
    busy = true; disableChoices(true);

    const ok = current.both ? true : (pickedIdx === correctIdx);

    if (ok) {
      const isBoth = !!current.both;
      vibrate(isBoth ? [12, 30, 12] : 12);

      if (isBoth) {
        elA.classList.add('good'); elB.classList.add('good');
        panel.classList.add('both', 'show-both'); fx.textContent = 'どちらも正解！'; fx.classList.add('both');
      } else {
        (pickedIdx === 0 ? elA : elB).classList.add('good');
        panel.classList.add('correct', 'show-correct'); fx.textContent = '◎ 正解！';
      }

      streak++; index++; elStreak.textContent = String(streak); setProgress(streak);

      if (streak >= NEED) {
        // クリア演出 → 5秒後にqr3へ（bridge優先）
        elStatus.textContent = 'CLEAR! おめでとう！';
        vibrate([15, 30, 15]);
        showClearSplash();
        return;
      }
      setTimeout(render, isBoth ? 600 : 460);

    } else {
      vibrate([45]);
      (pickedIdx === 0 ? elA : elB).classList.add('bad');
      panel.classList.add('wrong', 'show-wrong', 'shake'); fx.textContent = '× 不正解';
      // 失敗はその場でリスタート（戻らない）
      setTimeout(() => { start(); }, 680);
    }
  };

  const disableChoices = (v) => { elA.disabled = v; elB.disabled = v; };

  // ===== スプラッシュ表示 =====
  const showStartSplash = () => {
    splash.style.display = 'grid';
    // 既存の文言/ボタン（AB.htmlに含まれる）をそのまま使う :contentReference[oaicite:4]{index=4}
    startBtn.addEventListener('click', () => {
      splash.style.display = 'none';
      start();
    }, { passive: true, once: true });
  };

  const showClearSplash = () => {
    // CLEAR用に #splash の中身を入れ替えて再利用
    splash.innerHTML = `
      <div class="splash-card">
        <h1>CLEAR!</h1>
        <p class="splash-cond">5連続正解達成 🎉</p>
        <p class="splash-sub">5秒後に自動で戻ります</p>
        <button id="claimNow" class="btn-primary">すぐに受け取る</button>
      </div>`;
    splash.style.display = 'grid';

    // 即時復帰ボタン
    const claim = document.getElementById('claimNow');
    claim?.addEventListener('click', () => returnToQR(true), { passive: true });

    // 5秒後に自動復帰（bridgeがあればそれを使う）
    returnToQR(false);
  };

  // ===== ライフサイクル =====
  const start = () => {
    streak = 0; index = 0; set = pickRandomSet(NEED);
    setProgress(0); elStreak.textContent = '0'; elStatus.textContent = 'タップで回答';
    render();
  };

  // ===== クリア後の復帰処理 =====
  const returnToQR = (immediate) => {
    const go = () => {
      if (typeof window.completeAndReturn === 'function') {
        window.completeAndReturn('qr3', { delayMs: 0, replace: true, payload: { streak: NEED } });
      } else {
        const url = '../qr.html?key=qr3';
        try { location.replace(url); } catch { location.href = url; }
      }
    };
    if (immediate) { go(); return; }
    if (typeof window.completeAndReturn === 'function') {
      window.completeAndReturn('qr3', { delayMs: 5000, replace: true, payload: { streak: NEED } });
    } else {
      setTimeout(go, 5000);
    }
  };

  // ===== イベント =====
  elA.addEventListener('click', () => answer(0), { passive: true });
  elB.addEventListener('click', () => answer(1), { passive: true });

  // 起動（開始スプラッシュ経由）
  document.addEventListener('DOMContentLoaded', showStartSplash);
})();
