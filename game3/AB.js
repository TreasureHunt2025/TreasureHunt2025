(() => {
  'use strict';

  // ===== 問題データ（左＝正解。Q16のみ両方正解） =====
  const QUESTIONS = [
    { q: '日本の国鳥は？', a: ['キジ', 'ツル'] },
    { q: 'イカの血の色は？', a: ['青', '赤'] },
    { q: 'ペンギンが住んでいるのは？', a: ['南極', '北極'] },
    { q: '世界で一番売れたゲームは？', a: ['マインクラフト', 'テトリス'] },
    { q: '「おにぎり」と「おむすび」の違いは？', a: ['地域による言い方の違い', '三角・丸などの形の違い'] },
    { q: '所沢キャンパスにある学部は人間科学部と？', a: ['スポーツ科学部', '文学部'] },
    { q: '早稲田のライバル校としてよく挙げられるのは？', a: ['慶應義塾大学', '青山学院大学'] },
    { q: 'スイカゲームで最初に出る果物は？', a: ['さくらんぼ', 'みかん'] },
    { q: '人間とバナナのDNAの一致率は？', a: ['60%', '12%'] },
    { q: '大隈講堂と札幌時計台はどちらの方が高い？', a: ['大隈講堂', '札幌時計台'] },
    { q: '大隈講堂と東大寺大仏殿はどちらの方が大きい？', a: ['東大寺大仏殿', '大隈講堂'] },
    { q: 'タコの心臓は何個ある？', a: ['3個', '2個'] },
    { q: '南極と北極、寒いのはどっち？', a: ['南極', '北極'] },
    { q: 'サンタクロースの服が赤いのはなぜ？', a: ['コカコーラの広告が由来', '北欧の伝統衣装'] },
    { q: 'アメリカで最も多く売られているエナジー飲料は？', a: ['モンスター', 'レッドブル'] },
    { q: '尊敬すべき人はどっち？', a: ['お父さん', 'お母さん'], both: true },
    { q: 'ゼルダの伝説で主人公の名前は？', a: ['リンク', 'ゼルダ'] },
    { q: 'ポケモンで「伝説」と呼ばれるのは？', a: ['アルセウス', 'パチリス'] },
    { q: '2025年10月13日は何の日だった？', a: ['スポーツの日', '文化の日'] },
    { q: '1年間は365日ですが、うるう年は何日？', a: ['366日', '364日'] },
  ];

  // ===== DOM =====
  const elQ = document.getElementById('question');
  const elA = document.getElementById('btnA');
  const elB = document.getElementById('btnB');
  const elStreak = document.getElementById('streak');
  const elStatus = document.getElementById('status');
  const elProgress = document.getElementById('progress');
  const panel = document.querySelector('.panel');

  // 開始スプラッシュ
  const splash = document.getElementById('splash');
  const startBtn = document.getElementById('startQuiz');

  // オーバーレイ（正誤表示）を動的に追加
  const fx = document.createElement('div');
  fx.className = 'fx';
  panel.appendChild(fx);

  // ===== 状態 =====
  let set = [];      // 今回の5問（インデックス配列）
  let index = 0;     // セット内の現在の問題番号
  let streak = 0;    // 連続正解数
  let current = null; // 表示中の問題
  let shownOptions = []; // [textA, textB]
  let correctIdx = 0;    // 正解のボタン index (0/1)
  let busy = false;      // 二重操作防止

  // ===== ユーティリティ =====
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const pickRandomSet = (n = 5) => shuffle([...Array(QUESTIONS.length)].map((_, i) => i)).slice(0, n);
  const setProgress = (n) => { [...elProgress.children].forEach((b, i) => b.classList.toggle('filled', i < n)); };
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { } };
  const clearFx = () => {
    panel.classList.remove('correct', 'wrong', 'both', 'show-correct', 'show-wrong', 'show-both', 'shake');
    elA.classList.remove('good', 'bad'); elB.classList.remove('good', 'bad');
    fx.className = 'fx'; fx.textContent = '';
  };

  // ===== 出題 =====
  const render = () => {
    clearFx();
    current = QUESTIONS[set[index]];
    elQ.textContent = current.q;

    // A/Bの並びをランダム化（左が正解だが表示は入れ替える）
    const base = [current.a[0], current.a[1]];
    if (Math.random() < 0.5) {
      shownOptions = base; correctIdx = 0; elA.classList.remove('alt'); elB.classList.add('alt');
    } else {
      shownOptions = [base[1], base[0]]; correctIdx = 1; elA.classList.add('alt'); elB.classList.remove('alt');
    }
    elA.textContent = shownOptions[0]; elB.textContent = shownOptions[1];

    elStreak.textContent = String(streak); setProgress(streak);
    elStatus.textContent = `Q${index + 1} / 5`;
    busy = false; disableChoices(false);
  };

  // ===== 判定 =====
  const answer = (pickedIdx) => {
    if (busy) return; busy = true; disableChoices(true);
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

      if (streak >= 5) {
        elStatus.textContent = 'CLEAR! おめでとう！'; vibrate([15, 30, 15]);
        try { try { window.parent?.postMessage({ type: 'minigame:clear', detail: { gameId: 'game3', cleared: true } }, '*'); } catch { } } catch { }
        return; // クリア後はボタン無効のまま
      }
      setTimeout(render, isBoth ? 600 : 460);

    } else {
      vibrate([45]);
      (pickedIdx === 0 ? elA : elB).classList.add('bad');
      panel.classList.add('wrong', 'show-wrong', 'shake'); fx.textContent = '× 不正解';
      setTimeout(() => { start(); }, 680); // 自動リスタート
    }
  };

  const disableChoices = (v) => { elA.disabled = v; elB.disabled = v; };

  // ===== ライフサイクル =====
  const start = () => {
    streak = 0; index = 0; set = pickRandomSet(5);
    setProgress(0); elStreak.textContent = '0'; elStatus.textContent = 'タップで回答';
    render();
  };

  // ===== イベント =====
  elA.addEventListener('click', () => answer(0), { passive: true });
  elB.addEventListener('click', () => answer(1), { passive: true });

  // スプラッシュから開始（テトリスの開始フローと同型）
  const boot = () => {
    splash.style.display = 'grid';
    startBtn.addEventListener('click', () => {
      splash.style.display = 'none';
      start();
    }, { passive: true, once: true });
  };
  boot();
})();
