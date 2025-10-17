const { Bodies, Body, Composite, Engine, Events, Render, Runner, Sleeping } = Matter;

/* ========= 投入テンポ ========= */
const POST_DROP_INTERVAL = 350; // 連続投入までの待ち(ms)

/* ========= 物理 ========= */
const PHYS = {
  gravityY: 1.25,         // 重力加速度
  restitution: 0.03,      // 反発係数
  friction: 0.40,         // 接触摩擦
  frictionStatic: 0.60,   // 静止摩擦
  frictionAir: 0.02,      // 空気抵抗
  positionIterations: 10, // 物理解の反復回数
  velocityIterations: 8,  // 
  wallColor: "#2b3b86",  //壁の塗り色
};

/* ========= ゲーム定数 ========= */
const WIDTH = 420;
const HEIGHT = 700;
const WALL_T = 10;
const DEADLINE = 600;
const MAX_LEVEL = 11;
const TARGET_SCORE = 300;

/* 高コントラストの12色パレット（レベル0〜11） */
const BUBBLE_COLORS = {
  0: "#ff3b30", // red
  1: "#ff9500", // orange
  2: "#ffd60a", // yellow
  3: "#34c759", // green
  4: "#00c7be", // teal
  5: "#32ade6", // cyan
  6: "#0a84ff", // blue
  7: "#5e5ce6", // indigo
  8: "#bf5af2", // purple
  9: "#ff2d55", // pink
  10: "#a2845e", // brown-ish
  11: "#ffffff", // white (最大合体などに備え)
};

const OBJECT_CATEGORIES = { WALL: 0x0001, BUBBLE: 0x0002, BUBBLE_PENDING: 0x0004 };

class BubbleGame {
  engine; render; runner;
  currentBubble = undefined;
  score = 0;
  gameover = false;
  gameStatus = "idle"; // "ready" | "canput" | "interval" | "idle"
  defaultX = WIDTH / 2;
  _scale = 1;

  constructor(container, message, scoreChangeCallBack) {
    this.container = container;
    this.message = message;
    this.onScoreChange = scoreChangeCallBack;

    this.engine = Engine.create({
      enableSleeping: false,
      positionIterations: PHYS.positionIterations,
      velocityIterations: PHYS.velocityIterations,
    });
    this.engine.world.gravity.y = PHYS.gravityY;

    this.render = Render.create({
      element: container,
      engine: this.engine,
      options: {
        width: WIDTH,
        height: HEIGHT,
        wireframes: false,
        background: "transparent",
        showSleeping: false,
      },
    });
    this.runner = Runner.create();
    Render.run(this.render);

    // 入力（Pointer統一）
    this.bindPointer(container);

    // 物理イベント
    Events.on(this.engine, "collisionStart", this.handleCollision.bind(this));
    Events.on(this.engine, "afterUpdate", this.checkGameOver.bind(this));

    // 画面フィット
    this.fitStage = this.fitStage.bind(this);
    window.addEventListener("resize", this.fitStage);
    window.visualViewport?.addEventListener("resize", this.fitStage);
    window.addEventListener("orientationchange", this.fitStage);
    this.fitStage();
  }

  /* ====== ライフサイクル ====== */
  init() {
    Composite.clear(this.engine.world);
    this.resetMessage();

    this.gameover = false;
    this.setScore(0);
    this.gameStatus = "ready";

    // 壁と床
    const wallOpts = { isStatic: true, label: "wall", render: { fillStyle: PHYS.wallColor } };
    const ground = Bodies.rectangle(WIDTH / 2, HEIGHT - WALL_T / 2, WIDTH, WALL_T, wallOpts);
    const left = Bodies.rectangle(WALL_T / 2, HEIGHT / 2, WALL_T, HEIGHT, wallOpts);
    const right = Bodies.rectangle(WIDTH - WALL_T / 2, HEIGHT / 2, WALL_T, HEIGHT, wallOpts);
    Composite.add(this.engine.world, [ground, left, right]);

    Runner.run(this.runner, this.engine);
    this.showReadyMessage();
  }

  start(e) {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (this.gameStatus !== "ready") return;
    this.gameStatus = "canput";
    this.createNewBubble();
    this.resetMessage();
  }

  /* ====== UI ====== */
  showReadyMessage() {
    this.message.innerHTML = `
      <div class="card">
        <p class="mainText">バブルゲーム</p>
        <p class="subText">指で左右にドラッグして位置調整／指を離すと落下</p>
        <button type="button" class="button startBtn">ゲーム開始</button>
        <div class="hint">目標スコア ${TARGET_SCORE} に到達でクリア</div>
      </div>`;
    this.message.style.display = "grid";
    this.message.querySelector(".startBtn").addEventListener("click", this.start.bind(this));
  }

  showGameOverMessage() {
    this.message.innerHTML = `
      <div class="card">
        <p class="mainText">Game Over</p>
        <p class="subText">Score: ${this.score}</p>
        <button type="button" class="button retryBtn">もう一度</button>
      </div>`;
    this.message.style.display = "grid";
    this.message.querySelector(".retryBtn").addEventListener("click", this.init.bind(this));
  }

  showClearMessage() {
    this.message.innerHTML = `
      <div class="card">
        <p class="mainText">CLEAR!</p>
        <p class="subText">Score: ${this.score}</p>
        <button type="button" class="button claimBtn">お宝を受け取る</button>
        <div class="hint" id="cdHint">5秒後に自動で戻ります</div>
      </div>`;
    this.message.style.display = "grid";
    const claim = this.message.querySelector(".claimBtn");
    claim.addEventListener("click", () => this.returnToQR(true));
    let left = 5;
    const hint = this.message.querySelector("#cdHint");
    const timer = setInterval(() => {
      left--;
      if (left >= 0 && hint) hint.textContent = `${left}秒後に自動で戻ります`;
      if (left < 0) clearInterval(timer);
    }, 1000);
  }

  resetMessage() {
    this.message.replaceChildren();
    this.message.style.display = "none";
  }

  /* ====== バブル生成/落下 ====== */
  createNewBubble() {
    if (this.gameover) return;
    const level = Math.floor(Math.random() * 5); // 0〜4
    const radius = level * 10 + 20;

    const bubble = Bodies.circle(this.defaultX, 30, radius, {
      label: "bubble_" + level,
      friction: PHYS.friction,
      frictionStatic: PHYS.frictionStatic,
      frictionAir: PHYS.frictionAir,
      restitution: PHYS.restitution,
      collisionFilter: {
        group: 0,
        category: OBJECT_CATEGORIES.BUBBLE_PENDING,
        mask: OBJECT_CATEGORIES.WALL | OBJECT_CATEGORIES.BUBBLE,
      },
      render: { fillStyle: BUBBLE_COLORS[level], lineWidth: 1, opacity: 1 }
    });
    Body.setStatic(bubble, true); // 待機中は落ちない（位置合わせ用）
    this.currentBubble = bubble;
    Composite.add(this.engine.world, [bubble]);
  }

  putCurrentBubble() {
    if (!this.currentBubble) return;
    Body.setStatic(this.currentBubble, false);
    Sleeping.set(this.currentBubble, false);
    this.currentBubble.collisionFilter.category = OBJECT_CATEGORIES.BUBBLE;
    this.currentBubble = undefined;
  }

  /* ====== 判定 ====== */
  checkGameOver() {
    if (this.gameover) return;
    const bodies = Composite.allBodies(this.engine.world);
    for (const b of bodies) {
      if (!b.label?.startsWith?.("bubble_")) continue;
      if (b.position.y < HEIGHT - DEADLINE && b.velocity.y < 0) {
        Runner.stop(this.runner);
        this.gameover = true;
        this.showGameOverMessage();
        return;
      }
    }
  }

  checkClear() {
    if (this.gameover) return;
    if (this.score >= TARGET_SCORE) {
      Runner.stop(this.runner);
      this.gameover = true;
      this.showClearMessage();
      this.returnToQR(false);
    }
  }

  /* ====== 衝突（合体&スコア） ====== */
  handleCollision({ pairs }) {
    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      if (!Composite.get(this.engine.world, bodyA.id, "body") ||
        !Composite.get(this.engine.world, bodyB.id, "body")) continue;

      if (bodyA.label === bodyB.label && bodyA.label.startsWith("bubble_")) {
        const lvl = Number(bodyA.label.substring(7));
        this.setScore(this.score + (2 ** lvl));
        this.checkClear();

        if (lvl === MAX_LEVEL) {
          Composite.remove(this.engine.world, [bodyA, bodyB]);
          continue;
        }

        const newLevel = Math.min(lvl + 1, MAX_LEVEL);
        const nx = (bodyA.position.x + bodyB.position.x) / 2;
        const ny = (bodyA.position.y + bodyB.position.y) / 2;
        const nr = newLevel * 10 + 20;

        const merged = Bodies.circle(nx, ny, nr, {
          label: "bubble_" + newLevel,
          friction: PHYS.friction,
          frictionStatic: PHYS.frictionStatic,
          frictionAir: PHYS.frictionAir,
          restitution: PHYS.restitution,
          collisionFilter: {
            group: 0,
            category: OBJECT_CATEGORIES.BUBBLE,
            mask: OBJECT_CATEGORIES.WALL | OBJECT_CATEGORIES.BUBBLE,
          },
          render: { fillStyle: BUBBLE_COLORS[newLevel], lineWidth: 1, opacity: 1 }
        });
        Composite.remove(this.engine.world, [bodyA, bodyB]);
        Composite.add(this.engine.world, [merged]);
      }
    }
  }

  /* ====== Pointer操作（スマホ/PC共通） ====== */
  bindPointer(surface) {
    try { surface.style.touchAction = "none"; } catch { }
    let isDown = false, pid = null, sx = 0, sy = 0, moved = false;

    const localX = (e) => {
      const rect = surface.getBoundingClientRect();
      return (e.clientX - rect.left) / this._scale;
    };
    const clampX = (x, r) => Math.max(10 + r, Math.min(x, WIDTH - 10 - r));

    const movePending = (x) => {
      if (this.gameStatus !== "canput" || !this.currentBubble) return;
      const r = Number(this.currentBubble.label.substring(7)) * 10 + 20;
      const nx = clampX(x, r);
      Body.setPosition(this.currentBubble, { x: nx, y: this.currentBubble.position.y });
      this.defaultX = nx;
    };

    surface.addEventListener("pointerdown", (e) => {
      if (this.gameStatus !== "canput") return; // 準備中・インターバルは無視
      isDown = true; pid = e.pointerId; moved = false;
      sx = localX(e); sy = e.clientY;
      surface.setPointerCapture(pid);
      movePending(localX(e));
      e.preventDefault();
    }, { passive: false });

    surface.addEventListener("pointermove", (e) => {
      if (!isDown || e.pointerId !== pid) return;
      const cx = localX(e);
      if (Math.abs(cx - sx) > 4 || Math.abs(e.clientY - sy) > 4) moved = true; // しっかりドラッグしたか
      movePending(cx);
      e.preventDefault();
    }, { passive: false });

    const endLike = (e) => {
      if (!isDown || e.pointerId !== pid) return;
      isDown = false;
      try { surface.releasePointerCapture(pid); } catch { }

      // ★タップ落とし禁止：十分にドラッグしていない場合は落とさない
      if (this.gameStatus === "canput" && !this.gameover && moved) {
        this.putCurrentBubble();
        this.gameStatus = "interval";
        setTimeout(() => {
          if (!this.gameover) { this.createNewBubble(); this.gameStatus = "canput"; }
        }, POST_DROP_INTERVAL);
      }
      pid = null;
      e.preventDefault();
    };
    surface.addEventListener("pointerup", endLike, { passive: false });
    surface.addEventListener("pointercancel", endLike, { passive: false });
  }

  /* ====== 画面フィット（端末ごとに実画面へ合わせてscale） ====== */
  fitStage() {
    const wrap = this.render.canvas?.parentElement;
    if (!wrap) return;

    // 実効ビューポート幅・高
    const vw = Math.min(window.innerWidth, (window.visualViewport?.width || window.innerWidth));
    const vhRaw = Math.min(window.innerHeight, (window.visualViewport?.height || window.innerHeight));

    // 上部のスコア表示などを差し引いて可用高さを見積もる
    const scoreH = document.querySelector(".score-container")?.getBoundingClientRect().height || 0;
    const margin = 28; // ちょい余白
    const vh = Math.max(320, vhRaw - scoreH - margin);

    const scaleW = (vw - 12) / WIDTH;
    const scaleH = vh / HEIGHT;

    const scale = Math.max(0.5, Math.min(scaleW, scaleH, 1.0));
    this._scale = scale;

    wrap.style.transformOrigin = "top center";
    wrap.style.transform = `scale(${scale})`;
  }

  /* ====== スコア ====== */
  setScore(val) {
    this.score = val;
    this.onScoreChange?.(val);
  }

  /* ====== クリア後遷移 ====== */
  returnToQR(immediate) {
    const go = () => {
      if (typeof window.completeAndReturn === "function") {
        window.completeAndReturn("qr2", { delayMs: 0, replace: true, payload: { score: this.score } });
      } else {
        const url = "../qr.html?key=qr2";
        try { location.replace(url); } catch { location.href = url; }
      }
    };
    if (immediate) { go(); return; }
    if (typeof window.completeAndReturn === "function") {
      window.completeAndReturn("qr2", { delayMs: 5000, replace: true, payload: { score: this.score } });
    } else {
      setTimeout(go, 5000);
    }
  }
}

/* ====== 起動 ====== */
window.onload = () => {
  const container = document.querySelector(".container");
  const message = document.querySelector(".message");
  const onChangeScore = (val) => {
    const scoreEl = document.querySelector(".score");
    const target = `(Target: ${TARGET_SCORE})`;
    scoreEl.textContent = `Score: ${val} `;
    const span = document.createElement("span");
    span.className = "target";
    span.textContent = target;
    scoreEl.appendChild(span);
  };

  const game = new BubbleGame(container, message, onChangeScore);
  game.init();
};
