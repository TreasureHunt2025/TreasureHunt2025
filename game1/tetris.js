// /game1/tetris.js — 回転の二重発火をPointer Eventsで解消＋自動落下を実装
(() => {
  const $ = (s) => document.querySelector(s);

  // === 定数 ===
  const ROWS = 20, COLS = 10;
  const TARGET_LINES = 7;                 // クリア条件
  const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };

  // タップ判定しきい値（回転が暴発しないように）
  const TAP_MAX_MS = 220;
  const TAP_MAX_MOVE = 12;  // px

  // 自動落下（重力）
  const GRAVITY_BASE_MS = 800;   // 開始間隔
  const GRAVITY_MIN_MS = 120;   // 最短間隔
  const SPEEDUP_EVERY_LINES = 10; // 10ラインごとに速く
  const SPEEDUP_STEP_MS = 80;     // 速くなる量

  // テトリミノ
  const SHAPES = {
    I: [
      [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
      [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
      [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
      [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
    ],
    O: [
      [[1, 1], [1, 1]], [[1, 1], [1, 1]], [[1, 1], [1, 1]], [[1, 1], [1, 1]],
    ],
    T: [
      [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 1, 0], [0, 1, 0]],
    ],
    S: [
      [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 1], [0, 0, 1]],
      [[0, 0, 0], [0, 1, 1], [1, 1, 0]],
      [[1, 0, 0], [1, 1, 0], [0, 1, 0]],
    ],
    Z: [
      [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
      [[0, 0, 1], [0, 1, 1], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 0], [0, 1, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 0, 0]],
    ],
    J: [
      [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 1], [0, 1, 0], [0, 1, 0]],
      [[0, 0, 0], [1, 1, 1], [0, 0, 1]],
      [[0, 1, 0], [0, 1, 0], [1, 1, 0]],
    ],
    L: [
      [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
      [[0, 1, 0], [0, 1, 0], [0, 1, 1]],
      [[0, 0, 0], [1, 1, 1], [1, 0, 0]],
      [[1, 1, 0], [0, 1, 0], [0, 1, 0]],
    ],
  };

  // SRSキック
  const JLSTZ_KICKS = {
    0: [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    1: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    2: [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    3: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  };
  const I_KICKS = {
    0: [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    1: [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    2: [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    3: [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  };

  class Tetris {
    constructor() {
      // HTML構成に合わせる（tetris.html） :contentReference[oaicite:2]{index=2}
      this.canvas = $("#board");
      this.ctx = this.canvas.getContext("2d");
      this.splash = $("#splash");
      this.clearSplash = $("#clearSplash");
      this.overSplash = $("#overSplash");
      this.startBtn = $("#startGame");
      this.claimBtn = $("#claimBtn");
      this.retryBtn = $("#retryBtn");
      this.goalbar = $("#goalbar");

      // 状態
      this.board = this.#createBoard(ROWS, COLS);
      this.active = null;
      this.bag = [];
      this.score = 0;
      this.lines = 0;
      this.live = false;

      // 自動落下
      this.gravityTimer = null;

      // 描画キャッシュ
      this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      this.cellW = 0;
      this.cellH = 0;

      this.#bindUI();
      this.#bindKeyboard();
      this.#bindPointer(); // ← Pointer Eventsで一元化（タップ回転の暴発を防止）
      this.#resize();
      this.#draw();
    }

    // --- 初期化/UI ---
    #bindUI() {
      const start = () => { this.splash?.classList.add("hidden"); this.start(); };
      this.startBtn?.addEventListener("click", start);
      this.splash?.addEventListener("click", (e) => { if (e.target !== this.startBtn) start(); });

      this.claimBtn?.addEventListener("click", () => this.#returnToQR(true));
      this.retryBtn?.addEventListener("click", () => { this.overSplash?.classList.add("hidden"); this.start(); });

      window.addEventListener("resize", () => this.#resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.#resize(), 200));
    }

    // 盤面リセット
    start() {
      this.#stopGravity();
      this.board = this.#createBoard(ROWS, COLS);
      this.score = 0;
      this.lines = 0;
      this.live = true;
      this.bag.length = 0;
      this.#updateGoalbar();
      this.#spawn();
      this.#draw();
      this.#startGravity(); // ← 自動落下開始
    }

    // --- キャンバスサイズ調整 ---
    #resize() {
      const vw = Math.max(240, Math.min(560, Math.floor(window.innerWidth * 0.92)));
      const headerH = this.goalbar ? this.goalbar.offsetHeight : 0;
      const usableH = Math.max(300, Math.floor((window.innerHeight - headerH) * 0.9));
      const maxWByH = Math.floor(usableH / 2); // 10:20
      const cssW = Math.min(vw, maxWByH), cssH = cssW * 2;

      this.canvas.style.width = cssW + "px";
      this.canvas.style.height = cssH + "px";
      this.canvas.width = Math.floor(cssW * this.dpr);
      this.canvas.height = Math.floor(cssH * this.dpr);

      this.cellW = this.canvas.width / COLS;
      this.cellH = this.canvas.height / ROWS;
      this.#draw();
    }

    // --- キーボード（PCデバッグ用） ---
    #bindKeyboard() {
      document.addEventListener("keydown", (e) => {
        if (!this.live || !this.active) return;
        switch (e.key) {
          case "ArrowLeft": this.#move(-1, 0); break;
          case "ArrowRight": this.#move(1, 0); break;
          case "ArrowDown": this.softDrop(); break;
          case "ArrowUp":
          case " ":
          case "x": case "X":
            this.#rotateCW(); break;
        }
      }, { passive: true });
    }

    // --- Pointer（タップ/ドラッグ/長押し） ---
    #bindPointer() {
      const el = this.canvas;
      if (!el) return;
      el.style.touchAction = "none"; // CSSでも指定済み :contentReference[oaicite:3]{index=3}

      let pid = null, sx = 0, sy = 0, moved = false, t0 = 0, holdInt = null, holdTO = null;

      const clearHolds = () => { if (holdTO) { clearTimeout(holdTO); holdTO = null; } if (holdInt) { clearInterval(holdInt); holdInt = null; } };

      const onDown = (e) => {
        if (!this.live) return;
        if (pid !== null) return; // 1本だけ
        pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false; t0 = performance.now();
        el.setPointerCapture(pid);
        clearHolds();
        // 長押しで高速ソフトドロップ
        holdTO = setTimeout(() => { holdInt = setInterval(() => { if (this.live) this.softDrop(); }, 55); }, 420);
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!this.live || e.pointerId !== pid) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > 16) {
            this.#move(dx > 0 ? 1 : -1, 0);
            sx = e.clientX; moved = true;
          }
        } else {
          if (dy > 16) {
            this.softDrop();
            sy = e.clientY; moved = true;
          }
        }
        e.preventDefault();
      };

      const onUp = (e) => {
        if (e.pointerId !== pid) return;
        // 合成マウスイベントを無視（Pointerで一元管理）
        clearHolds();
        const dt = performance.now() - t0;
        const totalMove = Math.hypot(e.clientX - sx, e.clientY - sy);
        if (!moved && dt <= TAP_MAX_MS && totalMove <= TAP_MAX_MOVE) {
          // 単純タップ → 1回だけ回転
          this.#rotateCW();
        }
        try { el.releasePointerCapture(pid); } catch { }
        pid = null; e.preventDefault();
      };

      el.addEventListener("pointerdown", onDown, { passive: false });
      el.addEventListener("pointermove", onMove, { passive: false });
      el.addEventListener("pointerup", onUp, { passive: false });
      el.addEventListener("pointercancel", () => { clearHolds(); pid = null; }, { passive: true });
    }

    // --- 自動落下（重力タイマ） ---
    #currentGravityMs() {
      const steps = Math.floor(this.lines / SPEEDUP_EVERY_LINES);
      return Math.max(GRAVITY_MIN_MS, GRAVITY_BASE_MS - steps * SPEEDUP_STEP_MS);
    }
    #startGravity() {
      const tick = () => {
        if (!this.live) return;
        if (!this.active) { this.#spawn(); this.#draw(); }
        else {
          const moved = this.#move(0, 1);
          if (!moved) this.#lock(); // 接地で確定
        }
        this.gravityTimer = setTimeout(tick, this.#currentGravityMs());
      };
      this.gravityTimer = setTimeout(tick, this.#currentGravityMs());
    }
    #stopGravity() {
      if (this.gravityTimer) { clearTimeout(this.gravityTimer); this.gravityTimer = null; }
    }

    // --- ゲーム進行 ---
    #createBoard(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }

    #nextType() {
      if (this.bag.length === 0) {
        this.bag = ["I", "O", "T", "S", "Z", "J", "L"];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      return this.bag.pop();
    }

    #spawn() {
      const type = this.#nextType();
      const rot = 0;
      const m = SHAPES[type][rot];
      const x = Math.floor((COLS - m[0].length) / 2);
      const y = 0;
      this.active = { type, x, y, rot };
      if (!this.#valid(x, y, type, rot)) this.#gameOver();
    }

    #gameOver() {
      this.live = false;
      this.#stopGravity();
      this.overSplash?.classList.remove("hidden"); // 失敗時は戻らず、その場で再挑戦
    }

    #returnToQR(immediate = false) {
      const go = () => {
        if (typeof window.completeAndReturn === "function") {
          window.completeAndReturn("qr1", { delayMs: 0, replace: true });
        } else {
          const url = "../qr.html?key=qr1";
          try { location.replace(url); } catch { location.href = url; }
        }
      };
      if (immediate) { go(); return; }
      if (typeof window.completeAndReturn === "function") {
        window.completeAndReturn("qr1", { delayMs: 5000, replace: true });
      } else {
        setTimeout(go, 5000);
      }
    }

    #endClear() {
      this.live = false;
      this.#stopGravity();
      this.clearSplash?.classList.remove("hidden");
      let left = 5;
      const btn = this.claimBtn;
      const orig = btn?.textContent || "宝箱を受け取る";
      const tick = () => { if (!btn) return; btn.textContent = `${orig}（${left}）`; left--; if (left < 0) btn.textContent = orig; };
      tick();
      const cd = setInterval(tick, 1000);
      setTimeout(() => { clearInterval(cd); this.#returnToQR(false); }, 5000);
    }

    // --- ルール ---
    #valid(nx, ny, type, rot) {
      const m = SHAPES[type][rot];
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          const bx = nx + x, by = ny + y;
          if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS) return false;
          if (this.board[by][bx]) return false;
        }
      }
      return true;
    }

    #move(dx, dy) {
      if (!this.active) return false;
      const nx = this.active.x + dx, ny = this.active.y + dy;
      if (this.#valid(nx, ny, this.active.type, this.active.rot)) {
        this.active.x = nx; this.active.y = ny; this.#draw(); return true;
      }
      return false;
    }

    #rotateCW() {
      if (!this.active) return false;
      const { type, x, y, rot } = this.active;
      const nextRot = (rot + 1) & 3;
      const kicks = (type === "I") ? I_KICKS[rot] : (type === "O") ? [[0, 0]] : JLSTZ_KICKS[rot];
      for (const [kx, ky] of kicks) {
        const nx = x + kx, ny = y - ky;
        if (this.#valid(nx, ny, type, nextRot)) {
          this.active.rot = nextRot; this.active.x = nx; this.active.y = ny; this.#draw(); return true;
        }
      }
      return false;
    }

    softDrop() {
      if (!this.active) return false;
      const moved = this.#move(0, 1);
      if (!moved) this.#lock();
      return moved;
    }

    #lock() {
      if (!this.active) return;
      const { type, x, y, rot } = this.active;
      const m = SHAPES[type][rot];
      for (let yy = 0; yy < m.length; yy++) {
        for (let xx = 0; xx < m[yy].length; xx++) {
          if (!m[yy][xx]) continue;
          const bx = x + xx, by = y + yy;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) this.board[by][bx] = this.#colorCode(type);
        }
      }
      this.active = null;

      const cleared = this.#clearLines();
      if (cleared > 0) {
        this.lines += cleared;
        this.score += (SCORE_TABLE[cleared] || 0);
        this.#updateGoalbar();
        if (this.lines >= TARGET_LINES) {
          this.#draw();
          this.#endClear();
          return;
        }
      }
      this.#spawn();
      this.#draw();
    }

    #clearLines() {
      let removed = 0;
      for (let r = ROWS - 1; r >= 0;) {
        if (this.board[r].every(v => v !== 0)) {
          this.board.splice(r, 1);
          this.board.unshift(Array(COLS).fill(0));
          removed++;
        } else r--;
      }
      return removed;
    }

    #colorCode(type) { return ({ I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }[type] || 8); }

    // --- 描画 ---
    #draw() {
      const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // グリッド
      ctx.globalAlpha = .08; ctx.fillStyle = "#000";
      for (let y = 1; y < ROWS; y++) { ctx.fillRect(0, (ch / ROWS) * y, cw, 1); }
      for (let x = 1; x < COLS; x++) { ctx.fillRect((cw / COLS) * x, 0, 1, ch); }
      ctx.globalAlpha = 1;

      // 既存ブロック
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = this.board[y][x];
          if (!c) continue;
          this.#cell(x, y, this.#colorFromCode(c));
        }
      }

      // ゴースト
      if (this.active) {
        const gy = this.#ghostY(this.active);
        this.#drawPiece(this.active.type, this.active.rot, this.active.x, gy, true);
      }
      // アクティブ
      if (this.active) {
        this.#drawPiece(this.active.type, this.active.rot, this.active.x, this.active.y, false);
      }
    }

    #drawPiece(type, rot, ox, oy, ghost) {
      const m = SHAPES[type][rot];
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m[y].length; x++) {
          if (!m[y][x]) continue;
          this.#cell(ox + x, oy + y, this.#colorFromType(type), ghost);
        }
      }
    }

    #cell(cx, cy, color, ghost = false) {
      const x = cx * this.cellW, y = cy * this.cellH, ctx = this.ctx;
      if (ghost) {
        ctx.globalAlpha = .25; ctx.fillStyle = color;
        ctx.fillRect(x, y, this.cellW, this.cellH);
        ctx.globalAlpha = 1; return;
      }
      ctx.fillStyle = color; ctx.fillRect(x, y, this.cellW, this.cellH);
      ctx.globalAlpha = .15; ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, this.cellW, 4); ctx.fillRect(x, y, 4, this.cellH);
      ctx.globalAlpha = .2; ctx.fillStyle = "#000";
      ctx.fillRect(x, y + this.cellH - 3, this.cellW, 3); ctx.fillRect(x + this.cellW - 3, y, 3, this.cellH);
      ctx.globalAlpha = 1;
    }

    #colorFromCode(c) {
      const pal = ["#00ffff", "#ffff00", "#aa00ff", "#00cc66", "#ff3355", "#3355ff", "#ff9900", "#888"];
      return pal[(c - 1) % pal.length];
    }
    #colorFromType(type) {
      const map = { I: "#00ffff", O: "#ffff00", T: "#aa00ff", S: "#00cc66", Z: "#ff3355", J: "#3355ff", L: "#ff9900" };
      return map[type] || "#888";
    }
    #ghostY(p) {
      let gy = p.y; while (this.#valid(p.x, gy + 1, p.type, p.rot)) gy++; return gy;
    }

    #updateGoalbar() {
      if (this.goalbar) {
        const remain = Math.max(0, TARGET_LINES - this.lines);
        this.goalbar.textContent = remain > 0
          ? `7ライン消したらクリア（残り: ${remain}）`
          : `クリア！`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => new Tetris());
})();
