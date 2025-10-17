(() => {
  'use strict';

  // ===== 段階別の難易度（1回目ゆっくり→2回目ふつう→3回目かなり速い） =====
  const TIERS = [
    { name: 'SLOW', BEAT_MS: 480, SHUFFLE_BEATS_MIN: 9, SHUFFLE_BEATS_JITTER: 3, ORDER_SWAP_EVERY_BEATS: 3 },
    { name: 'NORM', BEAT_MS: 340, SHUFFLE_BEATS_MIN: 10, SHUFFLE_BEATS_JITTER: 3, ORDER_SWAP_EVERY_BEATS: 2 },
    { name: 'FAST', BEAT_MS: 250, SHUFFLE_BEATS_MIN: 12, SHUFFLE_BEATS_JITTER: 4, ORDER_SWAP_EVERY_BEATS: 2 },
  ];
  const ENABLE_DOM_SWAP = true;   // 位置入替ON/OFF（OFFで易化）
  const START_DELAY_MS = 520;     // 💎投入→シャッフル開始まで
  const JIGGLE_PX = 6;            // 揺れ幅(px)

  // ===== DOM =====
  const grid = document.getElementById('grid');
  const chests = [...grid.querySelectorAll('.chest')];
  const CHEST_CT = chests.length;
  const panel = document.getElementById('panel');
  const fx = document.getElementById('fx');
  const splash = document.getElementById('splash');     // クリア時にも流用
  const startBtn = document.getElementById('startBtn'); // 開始ボタン（HTMLにあり） :contentReference[oaicite:1]{index=1}
  const phaseEl = document.getElementById('phase');
  const streakEl = document.getElementById('streak');

  // ===== 状態 =====
  let treasureIdx = -1;
  let shuffling = false;
  let busy = false;
  let actx = null;
  let streak = 0;               // 連勝（0..3）
  let tierIdx = 0;              // 0:ゆっくり / 1:ふつう / 2:速い

  // ===== ユーティリティ =====
  const randInt = (n) => (Math.random() * n) | 0;
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { } };
  const setBeatCSS = (ms) => document.documentElement.style.setProperty('--beat', `${ms}ms`);
  const shuffleDomOrder = () => {
    const frag = document.createDocumentFragment();
    const order = chests.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[order[i], order[j]] = [order[j], order[i]]; }
    order.forEach(el => frag.appendChild(el));
    grid.appendChild(frag);
  };

  // ===== SFX（Web Audio） =====
  const ensureAudio = () => { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); };
  const tone = (freq, dur = 0.12, type = 'square', gain = 0.06, when = 0) => {
    const t0 = (actx.currentTime || 0) + when;
    const osc = actx.createOscillator(); const g = actx.createGain();
    osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
    osc.connect(g).connect(actx.destination);
    osc.start(t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  };
  const sfxShuffle = (beatMs) => tone(400 + randInt(30), Math.min(0.07, beatMs / 1000 * 0.28), 'triangle', 0.03);
  const sfxDeposit = () => { tone(660, .08, 'square', .05); tone(880, .10, 'square', .05, .05); };
  const sfxWin = () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.08)); };
  const sfxLose = () => { tone(200, 0.24, 'sawtooth', 0.05); tone(140, 0.24, 'sawtooth', 0.04, 0.05); };

  // ===== 表示補助 =====
  const setPhase = (t) => phaseEl.textContent = t;
  const clearFx = () => { panel.classList.remove('show'); fx.className = 'fx'; fx.textContent = ''; };
  const showFx = (text, cls) => { fx.textContent = text; fx.className = `fx ${cls}`; panel.classList.add('show'); };
  const confetti = (count = 60) => {
    const wrap = document.createElement('div'); wrap.className = 'confetti';
    const colors = ['#7cff6b', '#ff5bd1', '#60a5fa', '#fde047', '#fb7185', '#34d399'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.top = (-Math.random() * 20) + '%';
      piece.style.background = colors[randInt(colors.length)];
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      piece.style.transform = `translateY(-10px) rotate(${Math.random() * 180}deg)`;
      wrap.appendChild(piece);
    }
    panel.appendChild(wrap); setTimeout(() => wrap.remove(), 1100);
  };
  const resetVisual = () => {
    clearFx();
    chests.forEach(c => {
      c.classList.remove('open', 'win', 'lose', 'jiggle', 'jiggle-hold', 'deposit');
      const coin = c.querySelector('.coin'); if (coin) coin.remove();
      c.disabled = true;
    });
  };
  const updateHUD = () => {
    streakEl.textContent = String(streak);
    setPhase(`ラウンド ${tierIdx + 1}/3：シャッフル中…`);
  };

  // ===== 1拍ぶんの“揺れ”（WAAPI） =====
  const playJiggle = (el, beatMs, ampPx = JIGGLE_PX) => {
    if (el && el.animate) {
      el.animate(
        [
          { transform: 'translateY(0)' },
          { transform: `translateY(-${ampPx}px)`, offset: 0.5 },
          { transform: 'translateY(0)' }
        ],
        { duration: beatMs, easing: 'ease-in-out' }
      );
    } else {
      el.classList.remove('jiggle'); void el.offsetWidth;
      el.classList.add('jiggle');
      setTimeout(() => el.classList.remove('jiggle'), beatMs + 20);
    }
  };

  // ===== クリア後の復帰（bridge優先・5秒既定） =====
  const returnToQR = (immediate) => {
    const go = () => {
      if (typeof window.completeAndReturn === 'function') {
        window.completeAndReturn('qr4', { delayMs: 0, replace: true });
      } else {
        const url = '../qr.html?key=qr4';
        try { location.replace(url); } catch { location.href = url; }
      }
    };
    if (immediate) { go(); return; }
    if (typeof window.completeAndReturn === 'function') {
      window.completeAndReturn('qr4', { delayMs: 5000, replace: true });
    } else {
      setTimeout(go, 5000);
    }
  };

  // ===== ラウンド開始 =====
  const startRound = () => {
    resetVisual();
    treasureIdx = randInt(CHEST_CT);

    const T = TIERS[tierIdx];
    setBeatCSS(T.BEAT_MS);
    shuffling = true; busy = true;
    updateHUD();

    // 1) 当たり箱に💎投入（視覚ヒント）
    const first = chests[treasureIdx];
    const coin = document.createElement('span');
    coin.className = 'coin'; coin.textContent = '💎';
    first.appendChild(coin);
    first.classList.add('deposit');
    ensureAudio(); sfxDeposit(); vibrate(12);
    playJiggle(first, T.BEAT_MS, JIGGLE_PX);
    setTimeout(() => { first.classList.remove('deposit'); coin.remove(); }, 700);

    // 2) 一定テンポのビートループ
    const totalBeats = T.SHUFFLE_BEATS_MIN + randInt(T.SHUFFLE_BEATS_JITTER + 1);
    let beat = 0;

    setTimeout(() => {
      const jiggleTimer = setInterval(() => {
        const beatsLeft = totalBeats - beat;

        if (beatsLeft === 1) {
          playJiggle(chests[treasureIdx], T.BEAT_MS, JIGGLE_PX);
          sfxShuffle(T.BEAT_MS);
          clearInterval(jiggleTimer);

          // 1拍待ってから選択フェーズ
          setTimeout(() => {
            shuffling = false; busy = false;
            chests.forEach(c => c.disabled = false);
            setPhase(`ラウンド ${tierIdx + 1}/3：選ぶなら今！`);
            showFx('選ぶなら今！', 'hint');
            setTimeout(clearFx, 700);
          }, T.BEAT_MS);
          return;
        }

        let idx = randInt(CHEST_CT);
        if (beatsLeft === 2 && idx === treasureIdx) idx = (idx + 1) % CHEST_CT;

        playJiggle(chests[idx], T.BEAT_MS, JIGGLE_PX);
        sfxShuffle(T.BEAT_MS);

        // 等間隔で見た目の配置も入替（難度要素）
        if (ENABLE_DOM_SWAP && (beat % T.ORDER_SWAP_EVERY_BEATS === 0)) shuffleDomOrder();

        beat++;
      }, T.BEAT_MS);
    }, START_DELAY_MS);
  };

  // ===== CLEAR / REVEAL =====
  const showClearSplash = () => {
    splash.innerHTML = `
      <div class="splash-card">
        <h1>ALL CLEAR!!</h1>
        <p class="splash-cond">3回連続で当てました 🎉</p>
        <p class="splash-sub">5秒後に自動で戻ります</p>
        <button id="claimNow" class="btn-primary">お宝を受け取る</button>
      </div>`;
    splash.style.display = 'grid';
    document.getElementById('claimNow')?.addEventListener('click', () => returnToQR(true), { passive: true });
    returnToQR(false); // 既定は5秒後
  };

  const reveal = (pickedIdx) => {
    const picked = chests[pickedIdx];
    picked.classList.add('open');

    if (pickedIdx === treasureIdx) {
      // 成功
      picked.classList.add('win');
      showFx('当たり！', 'win'); ensureAudio(); sfxWin(); confetti(50); vibrate([12, 30, 12]);
      chests.forEach((c, i) => { if (i !== pickedIdx) c.disabled = true; });

      streak++;
      streakEl.textContent = String(streak);

      if (streak >= 3) {
        setPhase('おめでとう！');
        // 3連続クリア → CLEARスプラ → 5秒後にqr4へ
        setTimeout(() => showClearSplash(), 600);
      } else {
        tierIdx = streak; // 0→1→2
        setPhase(`ラウンド ${streak}/3 クリア！ 次へ…`);
        setTimeout(() => startRound(), 900);
      }
    } else {
      // ミス：最初から（戻らない）
      picked.classList.add('lose'); ensureAudio(); sfxLose(); vibrate([40]);
      const correct = chests[treasureIdx]; setTimeout(() => correct.classList.add('open', 'win'), 380);
      showFx('ハズレ…！ 連勝リセット', 'lose'); setPhase('もう一回！');
      streak = 0; tierIdx = 0; chests.forEach(c => c.disabled = true);
      setTimeout(() => {
        showFx('タップで再挑戦', 'hint');
        panel.addEventListener('click', () => { clearFx(); startRound(); }, { once: true });
      }, 760);
      streakEl.textContent = '0';
    }
  };

  // ===== クリック =====
  chests.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      if (busy || shuffling) return;
      busy = true; chests.forEach(c => c.disabled = true);
      reveal(i);
    }, { passive: true });
  });

  // ===== 起動（スプラッシュ→開始 & iOS対策） =====
  startBtn.addEventListener('click', async () => {
    splash.style.display = 'none';
    try { ensureAudio(); if (actx.state === 'suspended') await actx.resume(); } catch { }
    streak = 0; tierIdx = 0; streakEl.textContent = '0';
    startRound();
  }, { passive: true, once: true });
})();
