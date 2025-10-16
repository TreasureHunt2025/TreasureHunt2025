(() => {
  const $ = (s) => document.querySelector(s);

  // === 定数 ===
  const ROWS = 20, COLS = 10;
  const TARGET_LINES = 7;                 // クリア条件
  const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };

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
      // HTML構成に合わせる（tetris.html を参照）
      this.canvas = $("#board");
      this.ctx = this.canvas.getContext("2d");
      this.splash = $("#splash");
      this.clearSplash = $("#clearSplash");
      this.overSplash = $("#overSplash");
      this.startBtn = $("#startGame");     // ← HTML側の開始ボタンに接続（id="startGame"） :contentReference[oaicite:3]{index=3}
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

      // 描画キャッシュ
      this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      this.cellW = 0;
      this.cellH = 0;

      this.#bindUI();
      this.#bindInputs();
      this.#setupTouch();
      this.#resize();
      this.#draw();
    }

    // --- 初期化/UI ---
    #bindUI() {
      // 開始ダイアログから開始
      const start = () => {
        this.splash?.classList.add("hidden");
        this.start();
      };
      this.startBtn?.addEventListener("click", start);
      // 全面タップでも開始OK
      this.splash?.addEventListener("click", (e) => {
        if (e.target === this.startBtn) return;
        start();
      });

      // クリアダイアログ：手動即時遷移
      this.claimBtn?.addEventListener("click", () => this.#returnToQR(true));

      // オーバーダイアログ：リトライ
      this.retryBtn?.addEventListener("click", () => {
        this.overSplash?.classList.add("hidden");
        this.start();
      });

      // リサイズ
      window.addEventListener("resize", () => this.#resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.#resize(), 200));
    }

    // 盤面リセット
    start() {
      this.board = this.#createBoard(ROWS, COLS);
      this.score = 0;
      this.lines = 0;
      this.live = true;
      this.bag.length = 0;
      this.#updateGoalbar();
      this.#spawn();
      this.#draw();
    }

    // --- キャンバスサイズ調整（常に 10:20 を維持、HiDPI対応） ---
    #resize() {
      const vw = Math.max(240, Math.min(560, Math.floor(window.innerWidth * 0.92)));
      const headerH = this.goalbar ? this.goalbar.offsetHeight : 0;
      const usableH = Math.max(300, Math.floor((window.innerHeight - headerH) * 0.9));
      // 高さに収まる最大幅
      const maxWByH = Math.floor(usableH / 2); // 10:20 = 1:2
      const cssW = Math.min(vw, maxWByH);
      const cssH = cssW * 2;

      this.canvas.style.width = cssW + "px";
      this.canvas.style.height = cssH + "px";
      this.canvas.width = Math.floor(cssW * this.dpr);
      this.canvas.height = Math.floor(cssH * this.dpr);

      this.cellW = this.canvas.width / COLS;
      this.cellH = this.canvas.height / ROWS;

      this.#draw();
    }

    // --- 入力（キーボード：PCデバッグ用） ---
    #bindInputs() {
      document.addEventListener("keydown", (e) => {
        if (!this.live || !this.active) return;
        switch (e.key) {
          case "ArrowLeft": this.#move(-1, 0); break;
          case "ArrowRight": this.#move(1, 0); break;
          case "ArrowDown": this.softDrop(); break;
          case "ArrowUp":
          case " ":
          case "x":
          case "X":
            this.#rotateCW(); break;
        }
      }, { passive: true });
    }

    // --- タッチ操作：タップ/スワイプ/長押し ---
    #setupTouch() {
      const el = this.canvas;
      if (!el) return;
      try { el.style.touchAction = "none"; } catch { }

      let sx = 0, sy = 0, moved = false, holdTimer = null, dropTimer = null;
      const SWIPE = 16;        // 1マス移動のしきい値(px)
      const HOLD_DELAY = 450;  // 長押し判定
      const DROP_EVERY = 60;   // 長押し時の連続ドロップ間隔

      const clearHolds = () => {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (dropTimer) { clearInterval(dropTimer); dropTimer = null; }
      };

      const onStart = (ev) => {
        const t = ev.touches?.[0] ?? ev;
        sx = t.clientX; sy = t.clientY; moved = false;
        clearHolds();
        holdTimer = setTimeout(() => {
          // 長押し開始 → 連続ドロップ
          dropTimer = setInterval(() => { if (this.live) this.softDrop(); }, DROP_EVERY);
        }, HOLD_DELAY);
      };

      const onMove = (ev) => {
        if (!this.live || !this.active) return;
        const t = ev.touches?.[0] ?? ev;
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;

        if (Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > SWIPE) {
            const dir = dx > 0 ? 1 : -1;
            this.#move(dir, 0);
            sx = t.clientX;
            moved = true;
          }
        } else {
          if (dy > SWIPE) {
            this.softDrop();
            sy = t.clientY;
            moved = true;
          }
        }
      };

      const onEnd = () => {
        // 長押し停止
        clearHolds();
        // 移動量が小さい＝タップ → 回転
        if (!moved) this.#rotateCW();
      };

      el.addEventListener("touchstart", onStart, { passive: true });
      el.addEventListener("touchmove", onMove, { passive: true });
      el.addEventListener("touchend", onEnd, { passive: true });

      // マウス（PCでも操作可能に。UI表示は不要）
      el.addEventListener("mousedown", onStart);
      el.addEventListener("mousemove", (e) => { if (e.buttons === 1) onMove(e); });
      el.addEventListener("mouseup", onEnd);
    }

    // --- ゲーム進行 ---
    #createBoard(h, w) { return Array.from({ length: h }, () => Array(w).fill(0)); }

    #nextType() {
      if (this.bag.length === 0) {
        this.bag = ["I", "O", "T", "S", "Z", "J", "L"];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;[this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
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
      if (!this.#valid(x, y, type, rot)) {
        this.#gameOver();
      }
    }

    #gameOver() {
      this.live = false;
      this.overSplash?.classList.remove("hidden"); // 失敗時は戻らず、その場で再挑戦
    }

    #returnToQR(immediate = false) {
      // クリア後、5秒待ちで戻す（手動なら即時）
      const go = () => {
        if (typeof window.completeAndReturn === "function") {
          window.completeAndReturn("qr1", { delayMs: 0, replace: true });
        } else {
          // フォールバック（bridge未読込でも戻せるように）
          const url = "../qr.html?key=qr1";
          try { location.replace(url); } catch { location.href = url; }
        }
      };
      if (immediate) { go(); return; }
      // 既定5秒は minigame-bridge.js に任せてもよいが、ここで担保しておく
      if (typeof window.completeAndReturn === "function") {
        window.completeAndReturn("qr1", { delayMs: 5000, replace: true });
      } else {
        setTimeout(go, 5000);
      }
    }

    #endClear() {
      this.live = false;
      // クリアスプラを表示し、5秒後に戻す（ボタンタップで即時）
      this.clearSplash?.classList.remove("hidden");
      // ボタンにカウントダウン表示（任意）
      let left = 5;
      const btn = this.claimBtn;
      const orig = btn?.textContent || "宝箱を受け取る";
      const tick = () => {
        if (!btn) return;
        btn.textContent = `${orig}（${left}）`;
        left--;
        if (left < 0) btn.textContent = orig;
      };
      tick();
      const cd = setInterval(tick, 1000);
      // 5秒後 or 即時
      const schedule = () => { clearInterval(cd); this.#returnToQR(false); };
      setTimeout(schedule, 5000);
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

    // 自動落下なし。ユーザー操作のみで1段落とす
    softDrop() {
      if (!this.active) return false;
      const moved = this.#move(0, 1);
      if (!moved) this.#lock();
      return moved;
    }

    #lock() {
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
        } else {
          r--;
        }
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
      // ハイライト影
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

  // 自動起動（HTML 側で追加呼び出し不要）
  document.addEventListener("DOMContentLoaded", () => new Tetris());
})();
