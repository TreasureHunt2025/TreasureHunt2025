(() => {
  "use strict";

  // ===== URLパラメータ =====
  const P = new URLSearchParams(location.search);
  const N = clampInt(P.get("n"), 4, 3, 5);         // 3〜5対応、既定4
  const IMG = P.get("img") || "";                  // 画像URL（空なら数字タイル）
  const EXTRA_BOTTOM = 90;
  document.documentElement.style.setProperty("--extra-bottom", EXTRA_BOTTOM + "px");

  // ===== DOM =====
  const boardEl = document.getElementById("board");
  const splashEl = document.getElementById("splash");
  const startBtn = document.getElementById("startGame");
  const clearEl = document.getElementById("clearSplash");
  const claimBtn = document.getElementById("claimBtn");
  const pauseEl = document.getElementById("pauseSplash");
  const resumeBtn = document.getElementById("resumeBtn");
  const hudMoves = document.getElementById("hudMoves");
  const hudTime = document.getElementById("hudTime");
  const resMoves = document.getElementById("resMoves");
  const resTime = document.getElementById("resTime");
  const condText = document.getElementById("condText");

  if (condText) condText.textContent = (N * N - 1) + "整列";

  // ===== 状態 =====
  let tiles = [];         // 長さN*N。最後が空白(=0)
  let blank = { r: N - 1, c: N - 1 };
  let moves = 0;
  let startTs = 0;
  let timerId = null;
  let paused = false;
  let started = false;

  // ===== レイアウト調整 =====
  function fitBoard() {
    // 盤の最大サイズを画面から算出して1タイルのpxを決める
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vvh = window.visualViewport?.height ?? window.innerHeight;
    const goalbarH = document.getElementById("goalbar")?.offsetHeight || 0;
    const helpH = document.getElementById("underHelp")?.offsetHeight || 0;
    const pad = 12 + 6 + 6; // board padding+gap
    // 余白などを引いた高さ
    const usableH = vvh - goalbarH - helpH - EXTRA_BOTTOM - 16;
    const size = Math.min(Math.floor(vw * 0.9), Math.floor(usableH * 0.92));
    const tile = Math.floor((size - 12 - (N - 1) * 6) / N); // padding/gap込み
    const boardSize = tile * N + (N - 1) * 6 + 12;

    boardEl.style.width = boardSize + "px";
    boardEl.style.height = boardSize + "px";
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, 1fr)`;

    // フォントはCSS clampで調整済み
  }
  window.addEventListener("resize", fitBoard);
  window.visualViewport?.addEventListener("resize", fitBoard);
  window.visualViewport?.addEventListener("scroll", fitBoard);
  window.addEventListener("orientationchange", () => setTimeout(fitBoard, 300));

  // ===== 盤生成 =====
  function buildSolved() {
    // [1..N*N-1, 0]
    const total = N * N;
    const arr = Array.from({ length: total - 1 }, (_, i) => i + 1);
    arr.push(0);
    return arr;
  }

  function indexOfRC(r, c) { return r * N + c; }
  function rcOfIndex(idx) { return { r: Math.floor(idx / N), c: idx % N }; }

  // パリティ整合を満たすシャッフル（常に解ける配置）
  function shuffleSolvable() {
    const a = buildSolved();
    // Fisher-Yates
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    // 空白位置・反転数からパリティ調整
    const inv = inversionCount(a);
    const blankIdx = a.indexOf(0);
    const { r: br } = rcOfIndex(blankIdx); // 0-based
    const blankRowFromBottom = N - br;     // 1-based from bottom

    const isSolvable =
      (N % 2 === 1 && inv % 2 === 0) ||
      (N % 2 === 0 && ((blankRowFromBottom % 2 === 0) === (inv % 2 === 1)));

    if (!isSolvable) {
      // 末尾2つの非ゼロをスワップしてパリティ反転
      let i = a.length - 1, j = a.length - 2;
      if (a[i] === 0 || a[j] === 0) { i -= 2; j -= 2; }
      [a[i], a[j]] = [a[j], a[i]];
    }
    // 解状態を避けたいなら一回追加スワップ（安全な2枚）
    if (isSolvedArray(a)) {
      [a[0], a[1]] = [a[1], a[0]];
    }
    return a;
  }

  function inversionCount(arr) {
    const b = arr.filter(v => v !== 0);
    let inv = 0;
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (b[i] > b[j]) inv++;
    return inv;
  }

  function isSolvedArray(arr) {
    for (let i = 0; i < arr.length - 1; i++) if (arr[i] !== i + 1) return false;
    return arr[arr.length - 1] === 0;
  }

  // ===== 描画 =====
  function render() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--n", N);
    tiles.forEach((v, idx) => {
      const d = document.createElement("div");
      d.className = "tile";
      if (v === 0) d.classList.add("blank");
      d.dataset.val = v;

      if (v !== 0) {
        if (IMG) {
          d.classList.add("has-img");
          const total = N * N - 1;
          // 画像をN×Nに分割した風の背景位置（vは1-based）
          const pos = v - 1;
          const pr = Math.floor(pos / N);
          const pc = pos % N;
          d.style.backgroundImage = `url("${IMG}")`;
          d.style.backgroundSize = `${N * 100}% ${N * 100}%`;
          d.style.backgroundPosition = `${(pc / (N - 1)) * 100}% ${(pr / (N - 1)) * 100}%`;
          // 文字は視認用にうっすら
          d.style.textShadow = "0 1px 6px rgba(0,0,0,.75)";
          d.textContent = ""; // 数字非表示にしたいなら空
        } else {
          d.textContent = v;
          const total = N * N - 1;
          const hue = pickHue(v, total);
          const sat = 72, l1 = 54, l2 = 42;
          d.style.background = `linear-gradient(180deg, hsl(${hue} ${sat}% ${l1}%), hsl(${hue} ${sat}% ${l2}%))`;
          d.style.borderColor = `hsl(${hue} 45% 28% / .45)`;
          d.style.textShadow = "0 1px 6px rgba(0,0,0,.55)";
        }
      } else {
        d.textContent = ""; // 空白
      }

      // 位置（CSS Gridの自動配置でOK）

      // イベント
      d.addEventListener("click", onTileTap, { passive: false });
      d.addEventListener("touchstart", touchStart, { passive: false });
      d.addEventListener("touchmove", touchMove, { passive: false });
      d.addEventListener("touchend", touchEnd, { passive: false });

      boardEl.appendChild(d);
    });
  }

  // ===== 入力（タップ・スワイプ） =====
  function onTileTap(e) {
    if (!started || paused) return;
    const idx = Array.prototype.indexOf.call(boardEl.children, e.currentTarget);
    tryMoveIndex(idx, true);
  }

  let tStart = null; // {x,y,idx}
  function pt(ev) {
    const t = (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]) || ev;
    return { x: t.clientX, y: t.clientY };
  }
  function touchStart(e) {
    if (!started) return;
    const p = pt(e);
    tStart = { ...p, idx: childIndexOf(e.currentTarget) };
    // 長押しで一時停止トグル
    clearTimeout(_pressTimer);
    _pressTimer = setTimeout(() => {
      togglePause(true);
    }, 700);
  }
  function touchMove(e) {
    if (!tStart) return;
    const p = pt(e);
    const dx = Math.abs(p.x - tStart.x);
    const dy = Math.abs(p.y - tStart.y);
    if (dx > 8 || dy > 8) {
      clearTimeout(_pressTimer);
    }
    e.preventDefault();
  }
  function touchEnd(e) {
    if (!tStart) return;
    const p = pt(e);
    const dx = p.x - tStart.x;
    const dy = p.y - tStart.y;
    const idx = tStart.idx;

    clearTimeout(_pressTimer);

    // スワイプ方向が明確であればまとめ移動
    if (Math.hypot(dx, dy) > 20) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      trySwipeIndex(idx, dir);
    } else {
      // 単タップ扱い
      tryMoveIndex(idx, true);
    }
    tStart = null;
  }
  let _pressTimer = null;

  function childIndexOf(el) { return Array.prototype.indexOf.call(boardEl.children, el); }

  // 隣接なら1枚、同列/同行に空白があればまとめてスライド
  function tryMoveIndex(idx, countMove) {
    const { r, c } = rcOfIndex(idx);
    if (isAdjacent(r, c, blank.r, blank.c)) {
      slideChain([{ r, c }], countMove);
      return true;
    }
    return false;
  }

  function trySwipeIndex(idx, dir) {
    const { r, c } = rcOfIndex(idx);
    // 空白と隣接していないなら不可
    if (!isAdjacent(r, c, blank.r, blank.c)) return false;

    // スワイプ方向が空白のある向きと一致しているときだけ1枚移動
    if (dir === "left" && r === blank.r && c - 1 === blank.c) { slideChain([{ r, c }], true); return true; }
    if (dir === "right" && r === blank.r && c + 1 === blank.c) { slideChain([{ r, c }], true); return true; }
    if (dir === "up" && c === blank.c && r - 1 === blank.r) { slideChain([{ r, c }], true); return true; }
    if (dir === "down" && c === blank.c && r + 1 === blank.r) { slideChain([{ r, c }], true); return true; }
    return false;
  }


  function isAdjacent(r1, c1, r2, c2) {
    return (r1 === r2 && Math.abs(c1 - c2) === 1) || (c1 === c2 && Math.abs(r1 - r2) === 1);
  }
  function rangeUp(a, b) { return Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i); }
  function rangeDown(a, b) { return Array.from({ length: Math.max(0, a - b) }, (_, i) => a - i); }

  // 複数枚を空白へ向けて順にスライド
  function slideChain(cells, incMove) {
    if (!cells.length) return;
    // 一気に配列を書き換え
    for (let i = 0; i < cells.length; i++) {
      const { r, c } = cells[i];
      swapRC(r, c, blank.r, blank.c);
      blank = { r, c };
    }
    moves += incMove ? 1 : 0;
    updateHud();
    render();
    checkClear();
  }

  function swapRC(r1, c1, r2, c2) {
    const i1 = indexOfRC(r1, c1), i2 = indexOfRC(r2, c2);
    [tiles[i1], tiles[i2]] = [tiles[i2], tiles[i1]];
  }

  // ===== クリア判定 =====
  function checkClear() {
    if (isSolvedArray(tiles)) {
      stopTimer();
      resMoves.textContent = String(moves);
      resTime.textContent = formatTime(secFromStart());
      clearEl.classList.remove("hidden");
    }
  }

  // ===== HUD/タイマー =====
  function updateHud() {
    hudMoves.textContent = String(moves);
    hudTime.textContent = formatTime(secFromStart());
  }
  function startTimer() {
    startTs = performance.now();
    stopTimer();
    timerId = setInterval(updateHud, 250);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  function secFromStart() {
    if (!startTs) return 0;
    const now = performance.now();
    const pausedBias = _pausedAccumMs + (paused ? (now - _pausedStartMs) : 0);
    return Math.max(0, Math.floor((now - startTs - pausedBias) / 1000));
  }
  function formatTime(s) {
    const m = Math.floor(s / 60), ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  // 一時停止（長押し）
  let _pausedStartMs = 0;
  let _pausedAccumMs = 0;
  function togglePause(v) {
    if (!started) return;
    const to = (typeof v === "boolean") ? v : !paused;
    if (to && !paused) {
      paused = true;
      _pausedStartMs = performance.now();
      pauseEl.classList.remove("hidden");
    } else if (!to && paused) {
      paused = false;
      _pausedAccumMs += performance.now() - _pausedStartMs;
      pauseEl.classList.add("hidden");
    }
  }
  resumeBtn.addEventListener("click", () => togglePause(false));

  // ===== 通知（親へ） =====
  function notifyParent(cleared) {
    const detail = {
      gameId: "game6",
      score: moves,
      time: secFromStart(),
      cleared: !!cleared,
      moves
    };
    try { window.parent?.postMessage({ type:'minigame:clear', detail:{ gameId:'game6', cleared:true, moves, time: secFromStart() } }, '*'); } catch { }
    try { window.dispatchEvent(new CustomEvent("minigame:clear", { detail })); } catch { }
  }

  // ===== 起動 =====
  startBtn.addEventListener("click", start);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && splashEl.style.display !== "none") start(); });

  function start() {
    splashEl.style.display = "none";
    initGame();
  }

  function initGame() {
    moves = 0; started = true; paused = false;
    _pausedStartMs = 0; _pausedAccumMs = 0;
    // 盤データ
    tiles = shuffleSolvable();
    const blankIdx = tiles.indexOf(0);
    blank = rcOfIndex(blankIdx);
    fitBoard();
    render();
    updateHud();
    startTimer();
  }

  // クリア画面のボタン
  claimBtn.addEventListener("click", () => {
    clearEl.classList.add("hidden");
    notifyParent(true);
  });

  // ===== ユーティリティ =====
  function clampInt(v, def, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n)) return def;
    return Math.max(min, Math.min(max, n));
  }

  function pickHue(v, total) {
    const baseHues = [
      0,   // red
      24,  // orange
      38,  // amber
      52,  // yellow
      65,  // chartreuse
      80,  // lime
      120, // green
      140, // emerald
      170, // teal
      190, // cyan
      205, // sky
      220, // blue
      245, // indigo
      265, // violet
      295, // purple
      330  // pink/rose
    ];

    if (total <= baseHues.length) {
      const idx = Math.round((v - 1) * (baseHues.length - 1) / Math.max(1, total - 1));
      return baseHues[idx];
    }
    return Math.round(((v - 1) * 360) / total);
  }


})();
