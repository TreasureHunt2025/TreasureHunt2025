(() => {
  'use strict';

  // ========= ラウンド設計（4R固定：個数↑ & テンポ↑） =========
  const ROUNDS = 4;
  const SEQ_LENGTHS = [2, 3, 4, 5];            // 覚える総数：2→3→4→5
  const BEAT_BY_ROUND = [520, 440, 360, 300];  // 点滅テンポ（ms）小さいほど速い
  const INPUT_GRACE_MS_BY_ROUND = [1200, 1000, 900, 800]; // 入力開始の猶予

  // ========= DOM =========
  const pads = [...document.querySelectorAll('.pad')];
  const roundEl = document.getElementById('round');
  const targetEl = document.getElementById('target');
  const panel = document.getElementById('panel');
  const fx = document.getElementById('fx');
  const phaseEl = document.getElementById('phase');
  const progressEl = document.getElementById('progress');
  const splash = document.getElementById('splash');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retry');

  targetEl.textContent = String(ROUNDS);

  // ========= 状態 =========
  let actx = null;
  let seq = [];           // 正解シーケンス（色index）
  let step = 0;           // 今入力中の位置
  let round = 0;          // 現在ラウンド(1..ROUNDS)
  let playing = false;    // デモ再生中
  let accepting = false;  // 入力受付中

  // ========= オーディオ =========
  const ensureAudio = () => { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); };
  const tone = (freq, dur = 0.13, type = 'sine', gain = 0.07, when = 0) => {
    const t0 = (actx.currentTime || 0) + when;
    const osc = actx.createOscillator(), g = actx.createGain();
    osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
    osc.connect(g).connect(actx.destination);
    osc.start(t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  };
  const padFreq = [523.25, 659.25, 783.99, 587.33]; // C5, E5, G5, D5
  const sfxGood = () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.08)); };
  const sfxBad = () => { tone(200, .24, 'sawtooth', .05); tone(140, .24, 'sawtooth', .04, .05); };

  // ========= 見た目補助 =========
  const setBeatCSS = (ms) => document.documentElement.style.setProperty('--beat', `${ms}ms`);
  const showFx = (text, cls = 'hint', keep = false) => {
    fx.textContent = text; fx.className = `fx ${cls}`; panel.classList.add('show');
    if (!keep) setTimeout(() => { panel.classList.remove('show'); }, 800);
  };
  const setPhase = (t) => phaseEl.textContent = t;

  // コンフェッティ
  const confetti = (count = 100) => {
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    const colors = ['#7cff6b', '#ff5bd1', '#60a5fa', '#fde047', '#fb7185', '#34d399'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('i');
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.top = (-Math.random() * 20) + '%';
      piece.style.background = colors[(Math.random() * colors.length) | 0];
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      piece.style.transform = `translateY(-10px) rotate(${Math.random() * 180}deg)`;
      wrap.appendChild(piece);
    }
    panel.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1100);
  };

  // WAAPIで“確実”に点滅（光りと音を同期）
  const flashPad = (idx, beatMs) => {
    const el = pads[idx];
    el.classList.add('glow');
    if (el.animate) {
      el.animate(
        [
          { filter: 'brightness(1) saturate(1)' },
          { filter: 'brightness(1.35) saturate(1.15)', offset: .4 },
          { filter: 'brightness(1) saturate(1)' }
        ],
        { duration: beatMs, easing: 'ease-in-out' }
      );
    }
    setTimeout(() => el.classList.remove('glow'), beatMs - 10);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const resetProgress = () => {
    progressEl.innerHTML = '';
    for (let i = 0; i < ROUNDS; i++) {
      const dot = document.createElement('i');
      progressEl.appendChild(dot);
    }
  };
  const setProgress = (n) => {
    [...progressEl.children].forEach((el, i) => el.classList.toggle('on', i < n));
  };

  // ========= ゲーム進行 =========
  const startGame = async () => {
    seq = []; step = 0; round = 0;
    resetProgress(); setProgress(0);
    retryBtn.hidden = true;
    await sleep(150);
    await nextRound();
  };

  const nextRound = async () => {
    round++; roundEl.textContent = String(round);
    setProgress(round - 1);

    const beat = BEAT_BY_ROUND[round - 1] ?? 360;
    const grace = INPUT_GRACE_MS_BY_ROUND[round - 1] ?? 900;
    setBeatCSS(beat);
    setPhase(`ラウンド ${round}：見て覚えて…`);

    // 目標長までシーケンスを増やす（徐々に負荷UP）
    const targetLen = SEQ_LENGTHS[round - 1] ?? (seq.length + 1);
    while (seq.length < targetLen) {
      seq.push((Math.random() * 4 | 0)); // 同色連続OK（サイモン準拠）
    }

    // デモ再生
    playing = true; accepting = false; step = 0;
    await playSequence(seq, beat, grace);

    // 入力開始
    playing = false; accepting = true;
    setPhase(`ラウンド ${round}：入力してね`);
    showFx('同じ順でタップ！', 'hint');
  };

  const playSequence = async (arr, beatMs, graceMs) => {
    await sleep(260);
    ensureAudio();
    for (let i = 0; i < arr.length; i++) {
      const idx = arr[i];
      // 光り＆音 同期
      flashPad(idx, beatMs);
      tone(padFreq[idx], Math.min(0.26, beatMs / 1000 * 0.5), 'sine', 0.08);
      await sleep(beatMs);
    }
    await sleep(graceMs);
  };

  const handlePad = async (idx) => {
    if (!accepting) return;
    // タップ即反応（光＋音）
    ensureAudio();
    const beatCss = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--beat'));
    flashPad(idx, Math.max(180, beatCss));
    tone(padFreq[idx], 0.15, 'sine', 0.09);

    // 判定
    const correct = (idx === seq[step]);
    if (!correct) return onMiss();

    step++;
    if (step >= seq.length) {
      // ラウンドクリア
      accepting = false;
      setProgress(round);
      if (round >= ROUNDS) {
        // オールクリア
        showFx('ALL CLEAR!!', 'ok', true);
        confetti(140);
        sfxGood();
        try { window.parent && window.parent.postMessage({ gameId: 'game5', status: 'clear' }, '*'); } catch { }
        setPhase('おめでとう！');
        retryBtn.hidden = false;
        retryBtn.textContent = 'もう一度';
        return;
      }
      showFx('ナイス！', 'ok');
      await sleep(600);
      await nextRound();
    }
  };

  const onMiss = async () => {
    accepting = false;
    showFx('× ミス！ 最初から', 'bad');
    sfxBad();
    try { navigator.vibrate && navigator.vibrate([35]); } catch { }
    await sleep(900);
    await startGame();
  };

  // ========= イベント =========
  pads.forEach(btn => {
    btn.addEventListener('click', () => handlePad(+btn.dataset.idx), { passive: true });
  });
  retryBtn.addEventListener('click', () => startGame(), { passive: true });
  startBtn.addEventListener('click', async () => {
    splash.style.display = 'none';
    try { ensureAudio(); if (actx.state === 'suspended') await actx.resume(); } catch { }
    await startGame();
  }, { passive: true, once: true });
})();
