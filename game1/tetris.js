// ====== スマホ特化・簡潔版 ======
const COLS = 10;
const ROWS = 20;
let BLOCK = 30;
const GHOST_ALPHA = 0.22;

const PARAMS = new URLSearchParams(location.search);
const TARGET_LINES = Number(PARAMS.get("target") || 7); //ここでライン設定(変更する場合はHTMLも対応)
const DROP_MS = Number(PARAMS.get("speed") || 500);
const SOFT_MS = Number(PARAMS.get("soft") || 30);
let EXTRA_BOTTOM_PX = Number(PARAMS.get("bottom") || 90);

// ==== Sound ====
const SFX = (() => {
  const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
  const LS_KEY = 'tetris_audio_v1';

  // 初期値（好みで変更可）
  const state = { master: 0.25, bgm: 0.18, sfx: 0.45 };

  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (saved && typeof saved === 'object') Object.assign(state, saved);
  } catch { }

  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { } };

  const makePool = (src, size = 6, base = 1.0) => {
    const pool = Array.from({ length: size }, () => {
      const a = new Audio(src);
      a.preload = "auto";
      a.volume = base * state.sfx * state.master;
      return a;
    });
    let idx = 0;
    return {
      play() {
        const a = pool[idx];
        idx = (idx + 1) % pool.length;
        try { a.currentTime = 0; a.play(); } catch { }
      },
      updateVolume() {
        const v = base * state.sfx * state.master;
        pool.forEach(p => p.volume = v);
      },
      stopAll() { pool.forEach(p => { try { p.pause(); p.currentTime = 0; } catch { } }); }
    };
  };

  const bgm = new Audio("tetris_8bit.mp3");
  bgm.loop = true; bgm.preload = "auto";
  const setBgmVol = () => { bgm.volume = state.bgm * state.master; };
  setBgmVol();

  const line = makePool("line_8bit.mp3", 8, 1.0);
  const win = makePool("win_8bit.mp3", 2, 1.0);
  const lose = makePool("lose_8bit.mp3", 2, 1.0);

  const updateAll = () => { setBgmVol(); line.updateVolume(); win.updateVolume(); lose.updateVolume(); };

  return {
    startBGM() { try { bgm.currentTime = 0; bgm.play(); } catch (e) { } },
    stopBGM() { try { bgm.pause(); } catch (e) { } },
    line() { line.play(); },
    win() { this.stopBGM(); win.play(); },
    lose() { this.stopBGM(); lose.play(); },

    setMasterVolume(v) { state.master = clamp(v); save(); updateAll(); },
    setBgmVolume(v) { state.bgm = clamp(v); save(); updateAll(); },
    setSfxVolume(v) { state.sfx = clamp(v); save(); updateAll(); },
    getVolumes() { return { ...state }; }
  };
})();

// ---- 形状・色 ----
const SHAPES = {
  I: [[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]]],
  J: [[[2, 0, 0], [2, 2, 2], [0, 0, 0]], [[0, 2, 2], [0, 2, 0], [0, 2, 0]], [[0, 0, 0], [2, 2, 2], [0, 0, 2]], [[0, 2, 0], [0, 2, 0], [2, 2, 0]]],
  L: [[[0, 0, 3], [3, 3, 3], [0, 0, 0]], [[0, 3, 0], [0, 3, 0], [0, 3, 3]], [[0, 0, 0], [3, 3, 3], [3, 0, 0]], [[3, 3, 0], [0, 3, 0], [0, 3, 0]]],
  O: [[[4, 4], [4, 4]]],
  S: [[[0, 5, 5], [5, 5, 0], [0, 0, 0]], [[0, 5, 0], [0, 5, 5], [0, 0, 5]]],
  T: [[[0, 6, 0], [6, 6, 6], [0, 0, 0]], [[0, 6, 0], [0, 6, 6], [0, 6, 0]], [[0, 0, 0], [6, 6, 6], [0, 6, 0]], [[0, 6, 0], [6, 6, 0], [0, 6, 0]]],
  Z: [[[7, 7, 0], [0, 7, 7], [0, 0, 0]], [[0, 0, 7], [0, 7, 7], [0, 7, 0]]]
};
const COLORS = [null, "#00bcd4", "#3f51b5", "#ff9800", "#ffeb3b", "#4caf50", "#9c27b0", "#f44336"];

// ---- ピース ----
class Piece {
  constructor(type) {
    this.type = type;
    this.shape = SHAPES[type];
    this.rot = 0;
    this.mat = this.shape[this.rot];
    this.x = Math.floor(COLS / 2) - Math.ceil(this.mat[0].length / 2);
    this.y = -this.mat.length;
  }
  rotate(board) {
    const nxt = (this.rot + 1) % this.shape.length;
    const nm = this.shape[nxt];
    if (!this.collide(board, this.x, this.y, nm)) {
      this.rot = nxt; this.mat = nm;
    }
  }
  move(dx, dy, board) {
    if (!this.collide(board, this.x + dx, this.y + dy, this.mat)) {
      this.x += dx; this.y += dy; return true;
    }
    return false;
  }
  hardDrop(board) { while (this.move(0, 1, board)) { } }
  collide(board, nx, ny, mat) {
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        if (!mat[y][x]) continue;
        const px = nx + x, py = ny + y;
        if (py >= ROWS || px < 0 || px >= COLS || (py >= 0 && board[py][px])) return true;
      }
    }
    return false;
  }
  lock(board) {
    for (let y = 0; y < this.mat.length; y++) {
      for (let x = 0; x < this.mat[y].length; x++) {
        if (!this.mat[y][x]) continue;
        const px = this.x + x, py = this.y + y;
        if (py >= 0) board[py][px] = this.mat[y][x];
      }
    }
  }
}

// ---- 本体 ----
class Tetris {
  constructor() {
    this.canvas = document.getElementById("board");
    this.ctx = this.canvas.getContext("2d");

    this.board = this.makeMatrix(ROWS, COLS);
    this.curr = null;
    this.next = this.randPiece();

    this.lines = 0;
    this.dropMs = 550; // 自動で1段落ちるまでのms
    this.timer = 0;
    this.live = true;
    this.prev = 0;

    this.bindInputs();
    this.reset();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  makeMatrix(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }
  randPiece() { const k = Object.keys(SHAPES); return new Piece(k[(Math.random() * k.length) | 0]); }

  bindInputs() {
    document.addEventListener("keydown", (e) => {
      if (!this.live) return;
      switch (e.key) {
        case "ArrowLeft": this.curr.move(-1, 0, this.board); break;
        case "ArrowRight": this.curr.move(1, 0, this.board); break;
        case "ArrowDown": this.softDrop(); break;
        case "ArrowUp": this.curr.rotate(this.board); break;
        case " ": this.curr.hardDrop(this.board); this.drop(true); break;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(e.key)) {
        e.preventDefault();
      }
    });

    setupTouchControls(this);

    window.addEventListener("resize", fitCanvasToViewport);
    window.visualViewport?.addEventListener("resize", fitCanvasToViewport);
    window.visualViewport?.addEventListener("scroll", fitCanvasToViewport);
    window.addEventListener("orientationchange", () => setTimeout(fitCanvasToViewport, 300));
  }

  reset() {
    this.board.forEach(r => r.fill(0));
    this.curr = this.next; this.next = this.randPiece();
    this.lines = 0;
    fitCanvasToViewport();
    updateGoalText();
  }

  restart() {
    this.live = true;
    this.timer = 0;
    this.prev = 0;
    this.next = this.randPiece();
    this.reset();
    SFX.startBGM();
    requestAnimationFrame(this.loop);
  }

  loop(ts) {
    if (!this.prev) this.prev = ts;
    const dt = ts - this.prev; this.prev = ts;

    if (!this.live) return;
    this.timer += dt;
    if (this.timer >= this.dropMs) {
      this.drop(false);
      this.timer = 0;
    }

    this.draw();
    if (this.live) requestAnimationFrame(this.loop);
  }

  softDrop() { this.curr.move(0, 1, this.board); }


  drop(hard = false) {
    if (!this.curr.move(0, 1, this.board)) {

      const lockedAboveTop = this.curr.mat.some((row, yy) =>
        row.some((v, xx) => v && (this.curr.y + yy) < 0)
      );

      this.curr.lock(this.board);
      this.clearLines();

      if (lockedAboveTop) {
        this.live = false;
        SFX.lose();
        showGameOverSplash();
        return;
      }

      this.curr = this.next;
      this.next = this.randPiece();

      if (this.curr.collide(this.board, this.curr.x, this.curr.y, this.curr.mat)) {
        this.live = false;
        SFX.lose();
        showGameOverSplash();
        return;
      }
    }
  }


  clearLines() {
    let cleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; --y) {
      for (let x = 0; x < COLS; ++x) if (!this.board[y][x]) continue outer;
      this.board.splice(y, 1);
      this.board.unshift(Array(COLS).fill(0));
      ++cleared; ++y;
    }
    if (cleared) {
      SFX.line();
      this.lines += cleared;
      if (this.lines >= TARGET_LINES) {
        this.live = false;
        SFX.win();
        showClearSplash(this.lines);
      }
    }
  }

  // ---- 描画 ----
  draw() {
    const w = COLS * BLOCK, h = ROWS * BLOCK;
    this.ctx.fillStyle = "#000"; this.ctx.fillRect(0, 0, w, h);
    this.drawGrid();
    this.drawMatrix(this.board, { x: 0, y: 0 }, this.ctx);
    const gy = this.getGhostY();
    this.drawMatrixGhost(this.curr.mat, { x: this.curr.x, y: gy }, this.ctx);
    this.drawMatrix(this.curr.mat, { x: this.curr.x, y: this.curr.y }, this.ctx);
  }

  drawGrid() {
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255,255,255,0.06)";
    this.ctx.setLineDash([4, 4]);
    for (let x = 0; x <= COLS; x++) {
      this.ctx.beginPath(); this.ctx.moveTo(x * BLOCK, 0); this.ctx.lineTo(x * BLOCK, ROWS * BLOCK); this.ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y * BLOCK); this.ctx.lineTo(COLS * BLOCK, y * BLOCK); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawMatrix(mat, off, ctx) {
    for (let y = 0; y < mat.length; y++) {
      for (let x = 0; x < mat[y].length; x++) {
        const v = mat[y][x]; if (!v) continue;
        ctx.fillStyle = COLORS[v];
        ctx.fillRect((off.x + x) * BLOCK, (off.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
      }
    }
  }
  drawMatrixGhost(mat, off, ctx) {
    ctx.save(); ctx.globalAlpha = GHOST_ALPHA;
    this.drawMatrix(mat, off, ctx); ctx.restore();
  }
  getGhostY() {
    let y = this.curr.y;
    while (!this.curr.collide(this.board, this.curr.x, y + 1, this.curr.mat)) y++;
    return y;
  }
}

// ====== フィット ======
function fitCanvasToViewport() {
  const canvas = document.getElementById("board");
  const controlsH = document.getElementById("touchControls")?.offsetHeight || 0;
  const goalbarH = document.getElementById("goalbar")?.offsetHeight || 0;
  const EXTRA_BOTTOM = 90;
  document.documentElement.style.setProperty("--extra-bottom", EXTRA_BOTTOM + "px");
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vvh = window.visualViewport?.height ?? window.innerHeight;
  const vh = vvh - controlsH - goalbarH - EXTRA_BOTTOM - 8;
  BLOCK = Math.max(14, Math.floor(Math.min(vw / COLS, vh / ROWS)));
  const width = COLS * BLOCK;
  const height = ROWS * BLOCK;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
}

// ====== テキスト更新 ======
function updateGoalText() {
  const bar = document.getElementById("goalbar");
  const sc = document.querySelector(".splash-cond strong");
  if (bar) bar.textContent = `${TARGET_LINES}ライン消したらクリア`;
  if (sc) sc.textContent = `${TARGET_LINES}ライン`;
}

// ====== クリアスプラッシュ（押下で親へ通知） ======
function showClearSplash(lines) {
  const wrap = document.getElementById("clearSplash");
  wrap.classList.remove("hidden");
  const btn = document.getElementById("claimBtn");
  btn.onclick = () => {
    wrap.classList.add("hidden");
    notifyParent(true, 0, lines);
  };
}

// ====== ゲームオーバースプラッシュ（押下で同じiFrame内で再開） ======
function showGameOverSplash() {
  const wrap = document.getElementById("overSplash");
  wrap.classList.remove("hidden");
  const btn = document.getElementById("retryBtn");
  btn.onclick = () => {
    wrap.classList.add("hidden");
    if (window._tetris) window._tetris.restart();
  };
}

// ====== 親（qr.js）への結果送信 ======
const LINES_TO_CLEAR = 7;
function notifyParent(cleared, score, lines) {
  const detail = { gameId: "game1", score, time: null, cleared, lines };
  try { window.parent?.postMessage({ type: 'minigame:clear', detail: { gameId: 'game1', cleared: true, lines: totalLines, score: score ?? null } }, '*'); } catch { }
  try { window.dispatchEvent(new CustomEvent("minigame:clear", { detail })); } catch { }
}

// ====== タッチ操作 ======
function setupTouchControls(game) {
  const canvas = document.getElementById("board");
  const surface = canvas || document.body;
  try { surface.style.touchAction = "none"; } catch { }

  let startX = 0, startY = 0, startT = 0, appliedX = 0;
  let movedAny = false, longPressTimer = null, softDropTimer = null;

  const unit = () => {
    const u = (typeof BLOCK === "number" && BLOCK > 0) ? Math.floor(BLOCK * 0.6) : 24;
    return Math.max(14, Math.min(48, u));
  };
  const pt = (e) => {
    const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    return { x: t.clientX, y: t.clientY };
  };
  const clearTimers = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (softDropTimer) { clearInterval(softDropTimer); softDropTimer = null; }
  };
  const startSoftDrop = () => {
    if (!game || !game.live) return;
    clearInterval(softDropTimer);
    softDropTimer = setInterval(() => {
      if (!game || !game.live || !game.curr) return clearTimers();
      const beforeY = game.curr.y;
      game.softDrop();
      if (typeof game.draw === "function") game.draw();
      if (game.curr.y === beforeY) clearTimers();
    }, 45); // 落下速度（30〜80msで調整可）
  };

  function onStart(e) {
    if (!game || !game.live) return;
    movedAny = false;
    const p = pt(e);
    startX = appliedX = p.x; startY = p.y; startT = Date.now();
    clearTimers();
    longPressTimer = setTimeout(startSoftDrop, 300); // ← 長押し判定
    e.preventDefault();
  }

  function onMove(e) {
    if (!game || !game.live) return;
    const p = pt(e);
    const dx = p.x - appliedX;
    const u = unit();

    if (Math.abs(p.x - startX) > 6 || Math.abs(p.y - startY) > 6) movedAny = true;

    if (Math.abs(dx) >= u) {
      const steps = (dx > 0) ? Math.floor(dx / u) : Math.ceil(dx / u);
      const dir = steps > 0 ? 1 : -1;
      for (let i = 0; i < Math.abs(steps); i++) { game.curr?.move(dir, 0, game.board); }
      appliedX += steps * u;
      if (typeof game.draw === "function") game.draw();
    }

    if (movedAny && longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } // 誤爆防止
    e.preventDefault();
  }
  function onEnd(e) {
    if (!game) return;
    const p = pt(e);
    const dt = Date.now() - startT;
    const moved = Math.hypot(p.x - startX, p.y - startY);

    if (softDropTimer) { clearInterval(softDropTimer); softDropTimer = null; } // 長押し停止

    // タップ（短時間＆移動ほぼなし）は回転
    if (dt <= 250 && moved < 12 && !movedAny) {
      if (game.live && game.curr) game.curr.rotate(game.board);
    }

    clearTimers();
    e.preventDefault();
  }
  surface.addEventListener("touchstart", onStart, { passive: false });
  surface.addEventListener("touchmove", onMove, { passive: false });
  surface.addEventListener("touchend", onEnd, { passive: false });
  surface.addEventListener("touchcancel", (e) => { clearTimers(); e.preventDefault(); }, { passive: false });

  surface.addEventListener("mousedown", onStart);
  surface.addEventListener("mousemove", onMove);
  surface.addEventListener("mouseup", onEnd);
}

// ====== 起動 ======
window.addEventListener("load", () => {
  // ボタンUIは使わないので非表示にする（CSS変更なしで対応）
  ["#touchControls", "#btnLeft", "#btnRight", "#btnDrop", "#btnRotate"].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => { el.style.display = "none"; el.style.visibility = "hidden"; });
  });

  updateGoalText();
  fitCanvasToViewport();

  const splash = document.getElementById("splash");
  const startBtn = document.getElementById("startGame");
  const start = () => {
    splash.style.display = "none";
    try { localStorage.removeItem('tetris_audio_v1'); } catch { }
    SFX.setMasterVolume(0.28);
    SFX.setBgmVolume(0.18);
    SFX.setSfxVolume(0.45);
    window._tetris = new Tetris();
    SFX.startBGM();
  };
  startBtn.addEventListener("click", start);
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && splash.style.display !== "none") start(); });
});
