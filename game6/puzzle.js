(() => {
  "use strict";

  // ===== URLパラメータ =====
  const P = new URLSearchParams(location.search);
  const N = clampInt(P.get("n"), 4, 3, 5);      // 3〜5。既定4
  const IMG = P.get("img") || "";               // 画像URL（空なら数字タイル）
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

  if (condText) condText.textContent = `1〜8を左上から整列`;

  // ===== 状態 =====
  let tiles = [];               // 長さN*N。最後が空白(=0)
  let blank = { r: N - 1, c: N - 1 };
  let moves = 0;
  let startTs = 0;
  let timerId = null;
  let paused = false;
  let started = false;

  // ===== レイアウト =====
  function fitBoard() {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vvh = window.visualViewport?.height ?? window.innerHeight;
    const goalbarH = document.getElementById("goalbar")?.offsetHeight || 0;
    const helpH = document.getElementById("underHelp")?.offsetHeight || 0;
    const usableH = vvh - goalbarH - helpH - EXTRA_BOTTOM - 16;
    const size = Math.min(Math.floor(vw * 0.9), Math.floor(usableH * 0.92));
    const tile = Math.floor((size - 12 - (N - 1) * 6) / N); // padding/gap込み
    const boardSize = tile * N + (N - 1) * 6 + 12;

    boardEl.style.width = boardSize + "px";
    boardEl.style.height = boardSize + "px";
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${N}, 1fr)`;
  }
  window.addEventListener("resize", fitBoard);
  window.visualViewport?.addEventListener("resize", fitBoard);
  window.visualViewport?.addEventListener("scroll", fitBoard);
  window.addEventListener("orientationchange", () => setTimeout(fitBoard, 300));

  // ===== 盤生成 =====
  function buildSolved() {
    const total = N * N;
    const arr = Array.from({ length: total - 1 }, (_, i) => i + 1);
    arr.push(0);
    return arr;
  }
  function indexOfRC(r, c) { return r * N + c; }
  function rcOfIndex(idx) { return { r: Math.floor(idx / N), c: idx % N }; }

  // パリティ整合（常に解ける配置）
  function shuffleSolvable() {
    const a = buildSolved();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    const inv = inversionCount(a);
    const blankIdx = a.indexOf(0);
    const { r: br } = rcOfIndex(blankIdx);
    const blankRowFromBottom = N - br;

    const isSolvable =
      (N % 2 === 1 && inv % 2 === 0) ||
      (N % 2 === 0 && ((blankRowFromBottom % 2 === 0) === (inv % 2 === 1)));

    if (!isSolvable) {
      // 0 以外の末尾2つを入替えてパリティ反転
      let i = a.length - 1, j = a.length - 2;
      if (a[i] === 0 || a[j] === 0) { i -= 2; j -= 2; }
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (isSolvedArray(a)) { [a[0], a[1]] = [a[1], a[0]]; }
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
          const pos = v - 1;
          const pr = Math.floor(pos / N);
          const pc = pos % N;
          d.style.backgroundImage = `url("${IMG}")`;
          d.style.backgroundSize = `${N * 100}% ${N * 100}%`;
          d.style.backgroundPosition = `${(pc / (N - 1)) * 100}% ${(pr / (N - 1)) * 100}%`;
          d.textContent = "";
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
        d.textContent = "";
      }

      // 入力イベント
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
    tryMoveAdjacent(idx); // 隣接のみ
  }

  let tStart = null; // {x,y,idx}
  let _pressTimer = null;

  function pt(ev) {
    const t = (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]) || ev;
    return { x: t.clientX, y: t.clientY };
  }
  function childIndexOf(el) { return Array.prototype.indexOf.call(boardEl.children, el); }

  function touchStart(e) {
    if (!started || paused) return;
    const p = pt(e);
    tStart = { ...p, idx: childIndexOf(e.currentTarget) };
    // 長押しで一時停止
    clearTimeout(_pressTimer);
  }
  function touchMove(e) {
    if (!tStart) return;
    const p = pt(e);
    if (Math.abs(p.x - tStart.x) > 8 || Math.abs(p.y - tStart.y) > 8) {
      clearTimeout(_pressTimer); // 長押しキャンセル
    }
    e.preventDefault();
  }
  function touchEnd(e) {
    if (!tStart || paused) return;
    const p = pt(e);
    const dx = p.x - tStart.x;
    const dy = p.y - tStart.y;
    const idx = tStart.idx;
    clearTimeout(_pressTimer);

    // スワイプ判定
    if (Math.hypot(dx, dy) > 20) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      trySwipeChain(idx, dir);   // まとめスライド（同列/同行に空白がある場合）
    } else {
      tryMoveAdjacent(idx);      // 単タップ：隣接のみ
    }
    tStart = null;
  }

  // 隣接なら1枚だけ動かす
  function tryMoveAdjacent(idx) {
    const { r, c } = rcOfIndex(idx);
    if (isAdjacent(r, c, blank.r, blank.c)) {
      slideChain([{ r, c }], true);
      return true;
    }
    return false;
  }

  // スワイプ：同列/同行で空白の方向へ“まとめて”スライド
  function trySwipeChain(idx, dir) {
    const { r, c } = rcOfIndex(idx);
    const chain = [];

    // 同じ行
    if (r === blank.r) {
      // 左に空白がある → 左スワイプ時のみOK
      if (blank.c < c && dir === "left") {
        for (let cc = c; cc > blank.c; cc--) chain.push({ r, c: cc });
      }
      // 右に空白がある → 右スワイプ時のみOK
      if (blank.c > c && dir === "right") {
        for (let cc = c; cc < blank.c; cc++) chain.push({ r, c: cc });
      }
    }

    // 同じ列
    if (c === blank.c && chain.length === 0) {
      if (blank.r < r && dir === "up") {
        for (let rr = r; rr > blank.r; rr--) chain.push({ r: rr, c });
      }
      if (blank.r > r && dir === "down") {
        for (let rr = r; rr < blank.r; rr++) chain.push({ r: rr, c });
      }
    }

    if (chain.length > 0) {
      slideChain(chain, true); // 1手としてカウント
      return true;
    }
    // まとめ移動ができない場合は、隣接チェックにフォールバック
    return tryMoveAdjacent(idx);
  }

  function isAdjacent(r1, c1, r2, c2) {
    return (r1 === r2 && Math.abs(c1 - c2) === 1) || (c1 === c2 && Math.abs(r1 - r2) === 1);
  }

  // 複数枚を空白へ向けて順にスライド
  function slideChain(cells, incMove) {
    if (!cells.length) return;
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
      showClear();
    }
  }
  function showClear() {
    resMoves.textContent = String(moves);
    resTime.textContent = formatTime(secFromStart());
    clearEl.classList.remove("hidden");
    // 5秒後に復帰（bridge優先）
    returnToQR(false);
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

  // ===== 一時停止（長押し） =====
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

  // ===== 復帰（qr6へ） =====
  function returnToQR(immediate) {
    const go = () => {
      if (typeof window.completeAndReturn === "function") {
        window.completeAndReturn("qr6", { delayMs: 0, replace: true, payload: { moves, time: secFromStart() } });
      } else {
        const url = "../qr.html?key=qr6";
        try { location.replace(url); } catch { location.href = url; }
      }
    };
    if (immediate) { go(); return; }

    // カウントダウンはUIに出していないが、5秒待機は保証
    if (typeof window.completeAndReturn === "function") {
      window.completeAndReturn("qr6", { delayMs: 5000, replace: true, payload: { moves, time: secFromStart() } });
    } else {
      setTimeout(go, 5000);
    }
  }

  // ===== 起動 =====
  startBtn.addEventListener("click", start);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && splashEl.style.display !== "none") start();
  });

  function start() {
    splashEl.style.display = "none";
    initGame();
  }

  function initGame() {
    moves = 0; started = true; paused = false;
    _pausedStartMs = 0; _pausedAccumMs = 0;

    tiles = shuffleSolvable();
    const blankIdx = tiles.indexOf(0);
    blank = rcOfIndex(blankIdx);

    fitBoard();
    render();
    updateHud();
    startTimer();
  }

  // クリア画面のボタン（即時復帰）
  claimBtn.addEventListener("click", () => {
    clearEl.classList.add("hidden");
    returnToQR(true);
  });

  // ===== ユーティリティ =====
  function clampInt(v, def, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n)) return def;
    return Math.max(min, Math.min(max, n));
  }
  function pickHue(v, total) {
    const baseHues = [0, 24, 38, 52, 65, 80, 120, 140, 170, 190, 205, 220, 245, 265, 295, 330];
    if (total <= baseHues.length) {
      const idx = Math.round((v - 1) * (baseHues.length - 1) / Math.max(1, total - 1));
      return baseHues[idx];
    }
    return Math.round(((v - 1) * 360) / total);
  }
})();
