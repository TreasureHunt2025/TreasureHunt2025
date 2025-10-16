const CLEAR_SCORE = 800; // 目標スコア（調整可）
const { Bodies, Body, Composite, Engine, Events, Render, Runner, Sleeping } = Matter;

const WIDTH = 420;
const HEIGHT = 700;
const WALL_T = 10;
const DEADLINE = 600;          // 元のゲームオーバー条件は維持
const FRICTION = 0.3;
const MASS = 1;
const MAX_LEVEL = 11;
const TARGET_SCORE = 300;      // ★ クリア目標スコア（好みで調整）
const WALL_COLOR = "#2b3b86";

const BUBBLE_COLORS = {
  0: "#ff7f7f", 1: "#ff7fbf", 2: "#ff7fff", 3: "#bf7fff", 4: "#7f7fff",
  5: "#7fbfff", 6: "#7fffff", 7: "#7fffbf", 8: "#7fff7f", 9: "#bfff7f", 10: "#ffff7f", 11: "#ffffff"
};

const OBJECT_CATEGORIES = {
  WALL: 0x0001,
  BUBBLE: 0x0002,
  BUBBLE_PENDING: 0x0004,
};

class BubbeGame {
  engine; render; runner;
  currentBubble = undefined;
  score = 0;
  scoreChangeCallBack;
  gameover = false;
  defaultX = WIDTH / 2;
  message;
  gameStatus = "idle";
  _scale = 1;

  constructor(container, message, scoreChangeCallBack) {
    this.message = message;
    this.scoreChangeCallBack = scoreChangeCallBack;

    this.engine = Engine.create({ constraintIterations: 3 });
    this.render = Render.create({
      element: container,
      engine: this.engine,
      options: {
        width: WIDTH,
        height: HEIGHT,
        wireframes: false,
        background: "transparent",
        showSleeping: false // 🔴 寝てても暗くしない
      },
    });
    this.runner = Runner.create();
    Render.run(this.render);

    // Pointer（タッチ/マウス統一）
    this.bindPointer(container);

    // 物理イベント
    Events.on(this.engine, "collisionStart", this.handleCollision.bind(this));
    Events.on(this.engine, "afterUpdate", this.checkGameOver.bind(this));

    // 画面フィット
    this.fitStage = this.fitStage.bind(this);
    window.addEventListener("resize", this.fitStage);
    window.visualViewport?.addEventListener("resize", this.fitStage);
    this.fitStage();
  }

  init() {
    Composite.clear(this.engine.world);
    this.resetMessage();

    // 状態初期化
    this.gameover = false;
    this.setScore(0);
    this.gameStatus = "ready";

    // 地面と壁
    const ground = Bodies.rectangle(WIDTH / 2, HEIGHT - WALL_T / 2, WIDTH, WALL_T, {
      isStatic: true, label: "ground",
      render: { fillStyle: WALL_COLOR }
    });
    const leftWall = Bodies.rectangle(WALL_T / 2, HEIGHT / 2, WALL_T, HEIGHT, { isStatic: true, label: "leftWall", render: { fillStyle: WALL_COLOR } });
    const rightWall = Bodies.rectangle(WIDTH - WALL_T / 2, HEIGHT / 2, WALL_T, HEIGHT, { isStatic: true, label: "rightWall", render: { fillStyle: WALL_COLOR } });

    Composite.add(this.engine.world, [ground, leftWall, rightWall]);
    Runner.run(this.runner, this.engine);

    this.showReadyMessage();
  }

  /* ---------- 開始/終了UI ---------- */
  showReadyMessage() {
    this.message.innerHTML = `
      <div class="card">
        <p class="mainText">バブルゲーム</p>
        <p class="subText">タップ/クリックで落下・左右スワイプ/ドラッグで位置調整</p>
        <button type="button" class="button startBtn">ゲーム開始</button>
        <div class="hint">目標スコアに到達でクリア（デフォルト: ${TARGET_SCORE}）</div>
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
        <button type="button" class="button retryBtn">もう一度</button>
      </div>`;
    this.message.style.display = "grid";
    this.message.querySelector(".retryBtn").addEventListener("click", this.init.bind(this));
  }

  resetMessage() {
    this.message.replaceChildren();
    this.message.style.display = "none";
  }

  start(e) {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (this.gameStatus !== "ready") return;
    this.gameStatus = "canput";
    this.createNewBubble();
    this.resetMessage();
  }

  /* ---------- バブル生成/落下 ---------- */
  createNewBubble() {
    if (this.gameover) return;
    const level = Math.floor(Math.random() * 5); // 0〜4は従来通り
    const radius = level * 10 + 20;
    const bubble = Bodies.circle(this.defaultX, 30, radius, {
      label: "bubble_" + level,
      friction: FRICTION,
      mass: MASS,
      collisionFilter: {
        group: 0,
        category: OBJECT_CATEGORIES.BUBBLE_PENDING,
        mask: OBJECT_CATEGORIES.WALL | OBJECT_CATEGORIES.BUBBLE,
      },
      render: { fillStyle: BUBBLE_COLORS[level], lineWidth: 1, opacity: 1 }
    });
    Body.setStatic(bubble, true); // ★ 待機中は落ちない
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

  /* ---------- クリア/ゲームオーバー ---------- */
  // 元のロジックを尊重（上向き速度でDEADLINEを上回ると終了）
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

  // クリア判定：スコア到達
  checkClear() {
    if (this.gameover) return;
    if (this.score >= TARGET_SCORE) {
      Runner.stop(this.runner);
      this.gameover = true;
      try { window.parent && window.parent.postMessage({ type: 'minigame:clear', detail: { gameId: 'game2', cleared: true, score: this.score } }, '*'); } catch { }
    }
  }

  /* ---------- 衝突（合体&スコア） ---------- */
  handleCollision({ pairs }) {
    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;
      if (!Composite.get(this.engine.world, bodyA.id, "body") ||
        !Composite.get(this.engine.world, bodyB.id, "body")) continue;

      if (bodyA.label === bodyB.label && bodyA.label.startsWith("bubble_")) {
        const lvl = Number(bodyA.label.substring(7));
        // スコア加算（既存式そのまま）
        this.setScore(this.score + 2 ** lvl);
        this.checkClear();

        if (lvl === MAX_LEVEL) { // いちおう安全
          Composite.remove(this.engine.world, [bodyA, bodyB]);
          continue;
        }
        const newLevel = Math.min(lvl + 1, MAX_LEVEL);
        const newX = (bodyA.position.x + bodyB.position.x) / 2;
        const newY = (bodyA.position.y + bodyB.position.y) / 2;
        const newRadius = newLevel * 10 + 20;

        const merged = Bodies.circle(newX, newY, newRadius, {
          label: "bubble_" + newLevel,
          friction: FRICTION,
          mass: MASS,
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

  /* ---------- Pointer操作（スマホ/PC共通） ---------- */
  bindPointer(surface) {
    try { surface.style.touchAction = "none"; } catch { }
    let isDown = false, pid = null, startX = 0, startY = 0, moved = false, startT = 0;

    const localX = (e) => {
      const rect = surface.getBoundingClientRect();
      // transform: scale(_scale) を逆変換
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
      if (this.gameStatus === "ready") return; // スタート時はボタンで
      isDown = true; pid = e.pointerId; moved = false; startT = Date.now();
      startX = localX(e); startY = e.clientY;
      surface.setPointerCapture(pid);
      movePending(localX(e));
      e.preventDefault();
    }, { passive: false });

    surface.addEventListener("pointermove", (e) => {
      if (!isDown || e.pointerId !== pid) return;
      const dx = Math.abs(localX(e) - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > 4 || dy > 4) moved = true;
      movePending(localX(e));
      e.preventDefault();
    }, { passive: false });

    const endLike = (e) => {
      if (!isDown || e.pointerId !== pid) return;
      isDown = false; surface.releasePointerCapture(pid); pid = null;
      // クイックタップ判定で落下
      if (this.gameStatus === "canput" && !this.gameover) {
        const quick = (Date.now() - startT) <= 250 && !moved;
        if (quick) this.putCurrentBubble();
        // 連続投入インターバル
        if (quick) {
          this.gameStatus = "interval";
          setTimeout(() => {
            if (!this.gameover) { this.createNewBubble(); this.gameStatus = "canput"; }
          }, 500);
        }
      }
      e.preventDefault();
    };
    surface.addEventListener("pointerup", endLike, { passive: false });
    surface.addEventListener("pointercancel", endLike, { passive: false });

    // 既存の click / mousemove は二重発火の元なのでバインドしない
  }

  /* ---------- 画面フィット（CSSスケール） ---------- */
  fitStage() {
    const container = this.render.canvas?.parentElement;
    if (!container) return;
    const vw = Math.min(window.innerWidth, (window.visualViewport?.width || window.innerWidth));
    const vh = Math.min(window.innerHeight, (window.visualViewport?.height || window.innerHeight));
    // 余白を多めに見て安全にフィット
    const scaleW = Math.max(0.5, (vw - 12) / WIDTH);
    const scaleH = Math.max(0.5, (vh - 120) / HEIGHT); // スコア行＋余白ぶん
    const scale = Math.min(scaleW, scaleH, 1.0); // 等倍を上限に
    this._scale = scale;
    container.style.transformOrigin = "top center";
    container.style.transform = `scale(${scale})`;
  }


  /* ---------- スコア ---------- */
  setScore(score) {
    this.score = score;
    this.scoreChangeCallBack?.(score);
  }
}

window.onload = () => {
  const container = document.querySelector(".container");
  const message = document.querySelector(".message");
  const onChangeScore = (val) => {
    const scoreEl = document.querySelector(".score");
    scoreEl.textContent = `Score: ${val}`;
    const target = document.createElement("span");
    target.className = "target";
    target.textContent = `(Target: ${TARGET_SCORE})`;
    scoreEl.appendChild(target);
  };

  const game = new BubbeGame(container, message, onChangeScore);
  game.init();
};
