import Phaser from "phaser";
import type { MutableRefObject } from "react";
import type { FrameData } from "../../packages/shared/src/types";
import type { PlayerInput } from "../hooks/usePlayerInput";
import { GAME } from "./constants";

// ── Bridge — React ↔ Phaser data contract ────────────────────────────────────

export interface GameBridge {
  localInputRef:  MutableRefObject<PlayerInput>;
  remoteFrameRef: MutableRefObject<FrameData | null>;
  onSendFrame:    (frame: FrameData) => void;
  isConnected:    () => boolean;
  onHpChange:     (localHp: number, remoteHp: number) => void;
  onGameOver:     (winner: "local" | "remote") => void;
}

// ── Colours ───────────────────────────────────────────────────────────────────

const GESTURE_COLOR: Record<string, number> = {
  fist:        0xe24b4a,
  open:        0x378add,
  point:       0xef9f27,
  thumbs_up:   0x5dc985,
  thumbs_down: 0x191924,
  gun:         0xe24b4a,
  rock:        0xe24b4a,
  call:        0x5dc985,
  ok:          0xef9f27,
  pinch:       0xef9f27,
};

const JUMP_TRIGGERS      = new Set(["thumbs_up", "point"]);

// ── Scene ─────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  // Physics state — local
  private lx = 0; private ly = 0; private lvy = 0;
  private lonFloor = true; private lknockX = 0;

  // Physics state — remote
  private rx = 0; private ry = 0;

  // Game state
  private localHp: number  = GAME.MAX_HP;
  private remoteHp: number = GAME.MAX_HP;
  private prevLocalGesture  = "none";
  private prevRemoteGesture = "none";
  private hitCooldown = 0;
  private gameOver    = false;

  // Visuals
  private localSprite!:  Phaser.GameObjects.Sprite;
  private remoteSprite!: Phaser.GameObjects.Sprite;
  private hitFlash!:  Phaser.GameObjects.Rectangle;

  constructor() { super({ key: "GameScene" }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  preload() {
    const asset = (name: string) => `assets/sprites/male_hero_template-${name}.png`;
    this.load.spritesheet('hero_idle', asset('idle'), { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_walk', asset('walk'), { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_run', asset('run'), { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_jump', asset('jump'), { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_fall', asset('fall'), { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('hero_combo_1', asset('combo_1'), { frameWidth: 128, frameHeight: 128 });
  }

  create() {
    const { width: W, height: H } = this.scale;
    const S     = GAME.PLAYER_SIZE;
    const floorY = H - GAME.FLOOR_MARGIN;

    this.lx = W * 0.3 - S / 2;  this.ly = floorY - S;
    this.rx = W * 0.7 - S / 2;  this.ry = floorY - S;

    // Floor line
    this.add.rectangle(W / 2, floorY, W, 2, 0x2a2a38).setOrigin(0.5, 0);

    // Animations
    const createAnim = (key: string, repeat = -1, frameRate = 10) => {
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, {}), frameRate, repeat });
    };
    createAnim('hero_idle');
    createAnim('hero_walk');
    createAnim('hero_run', -1, 15);
    createAnim('hero_jump', 0, 10);
    createAnim('hero_fall', -1, 10);
    createAnim('hero_combo_1', 0, 15);

    // Player sprites
    this.localSprite  = this.add.sprite(this.lx + S/2, this.ly + S, 'hero_idle').setOrigin(0.5, 1);
    this.remoteSprite = this.add.sprite(this.rx + S/2, this.ry + S, 'hero_idle').setOrigin(0.5, 1).setVisible(false);

    // Hit flash overlay (starts invisible)
    this.hitFlash  = this.add.rectangle(0, 0, S, S, 0xffffff, 1).setOrigin(0).setAlpha(0);
  }

  // ── Public reset (called by PhaserGame on "Play Again") ──────────────────

  reset() {
    const { width: W, height: H } = this.scale;
    const floorY = H - GAME.FLOOR_MARGIN;

    this.lx = W * 0.3 - GAME.PLAYER_SIZE / 2;
    this.ly = floorY  - GAME.PLAYER_SIZE;
    this.lvy = 0; this.lonFloor = true; this.lknockX = 0;
    this.rx = W * 0.7 - GAME.PLAYER_SIZE / 2;
    this.ry = floorY  - GAME.PLAYER_SIZE;

    this.localHp  = GAME.MAX_HP;
    this.remoteHp = GAME.MAX_HP;
    this.prevLocalGesture  = "none";
    this.prevRemoteGesture = "none";
    this.hitCooldown = 0;
    this.gameOver    = false;
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.gameOver) return;

    const dt     = Math.min(delta / 1000, 0.05);
    const bridge = (this.game.registry.get("bridge") as MutableRefObject<GameBridge>).current;
    const { width: W, height: H } = this.scale;
    const floorTop = H - GAME.FLOOR_MARGIN - GAME.PLAYER_SIZE;

    // ── Local player ────────────────────────────────────────────────────────
    const input = bridge.localInputRef.current;
    const lg    = input.gesture;

    // Jump trigger: fist → point/thumbs_up
    if (this.prevLocalGesture === "fist" && JUMP_TRIGGERS.has(lg) && this.lonFloor) {
      this.lvy      = GAME.JUMP_VELOCITY;
      this.lonFloor = false;
    }
    this.prevLocalGesture = lg;

    const oldLx = this.lx;
    // Horizontal — mirror wrist, LERP, apply knockback
    const targetLX = (1 - input.wrist[0]) * W - GAME.PLAYER_SIZE / 2;
    this.lx += (targetLX - this.lx) * GAME.MOVE_LERP;
    this.lx += this.lknockX * dt;
    this.lknockX *= Math.max(0, 1 - GAME.KNOCKBACK_DECAY * dt);
    const ldx = (this.lx - oldLx) / dt; // velocity x

    // Vertical
    if (!this.lonFloor) {
      this.lvy += GAME.GRAVITY * dt;
      this.ly  += this.lvy * dt;
    }
    if (this.ly >= floorTop) {
      this.ly = floorTop; this.lvy = 0; this.lonFloor = true;
    }
    this.lx = Phaser.Math.Clamp(this.lx, 0, W - GAME.PLAYER_SIZE);

    this.localSprite.setPosition(this.lx + GAME.PLAYER_SIZE/2, this.ly + GAME.PLAYER_SIZE);

    // Animation resolving
    const resolveAnim = (gesture: string, onFloor: boolean, vy: number, dx: number) => {
      if (gesture === "fist") return "hero_combo_1";
      if (!onFloor) return vy < 0 ? "hero_jump" : "hero_fall";
      if (Math.abs(dx) > 150) return "hero_run";
      if (Math.abs(dx) > 20) return "hero_walk";
      return "hero_idle";
    };
    
    this.localSprite.play(resolveAnim(lg, this.lonFloor, this.lvy, ldx), true);
    
    // Tint to signify local color vs default (optional, could just use default)
    this.localSprite.setTint(GESTURE_COLOR[lg] ?? 0xffffff);

    // Send frame with current HP
    if (bridge.isConnected()) {
      bridge.onSendFrame({
        ts:      Date.now(),
        wrist:   input.wrist,
        gesture: lg,
        normX:   this.lx / W,
        normY:   this.ly / H,
        hp:      this.localHp,
      });
    }

    // ── Remote player ────────────────────────────────────────────────────────
    const connected = bridge.isConnected();
    this.remoteSprite.setVisible(connected);
    if (!connected) return;

    const frame = bridge.remoteFrameRef.current;
    if (frame) {
      // Update remote HP from network
      const prevRemoteHp = this.remoteHp;
      this.remoteHp = frame.hp ?? GAME.MAX_HP;

      // Remote HP just hit 0 — local player wins
      if (prevRemoteHp > 0 && this.remoteHp <= 0) {
        this.gameOver = true;
        bridge.onHpChange(this.localHp, 0);
        bridge.onGameOver("local");
        return;
      }

      // Smooth remote position
      const oldRx = this.rx;
      this.rx += (frame.normX * W - this.rx) * GAME.REMOTE_LERP;
      this.ry += (frame.normY * H - this.ry) * GAME.REMOTE_LERP;
      const rdx = (this.rx - oldRx) / dt;

      bridge.onHpChange(this.localHp, this.remoteHp);
      
      this.rx = Phaser.Math.Clamp(this.rx, 0, W - GAME.PLAYER_SIZE);
      this.ry = Phaser.Math.Clamp(this.ry, 0, H - GAME.PLAYER_SIZE);
      this.remoteSprite.setPosition(this.rx + GAME.PLAYER_SIZE/2, this.ry + GAME.PLAYER_SIZE);

      const rg = frame.gesture ?? "none";
      const ronFloor = this.ry >= floorTop - 2; // rough estimation
      // We don't have remote vy directly, we can estimate it or just use ry diff
      // For simplicity, just check floor
      const rAnim = rg === "fist" ? "hero_combo_1" :
                    !ronFloor ? "hero_jump" :
                    Math.abs(rdx) > 150 ? "hero_run" :
                    Math.abs(rdx) > 20 ? "hero_walk" : "hero_idle";
      
      this.remoteSprite.play(rAnim, true);
      this.remoteSprite.setTint(rg === "fist" ? 0xffaaaa : 0xaaaaaa);
    } else {
      this.remoteSprite.play("hero_idle", true);
      this.remoteSprite.setTint(0xaaaaaa);
    }
    
    // Facing direction
    if (this.lx <= this.rx) {
      this.localSprite.setFlipX(false);
      this.remoteSprite.setFlipX(true);
    } else {
      this.localSprite.setFlipX(true);
      this.remoteSprite.setFlipX(false);
    }

    const rg = frame?.gesture ?? "none";

    // ── Combat — detect incoming punch ───────────────────────────────────────
    this.hitCooldown = Math.max(0, this.hitCooldown - delta);

    if (
      this.prevRemoteGesture !== "fist" &&
      rg === "fist" &&
      this.hitCooldown === 0
    ) {
      const dist = Math.abs(this.lx - this.rx);
      if (dist < GAME.PUNCH_RANGE) {
        const blocked = lg === "open";
        const dmg     = blocked ? GAME.PUNCH_DAMAGE_BLOCKED : GAME.PUNCH_DAMAGE;
        this.localHp  = Math.max(0, this.localHp - dmg);
        this.hitCooldown = GAME.HIT_COOLDOWN_MS;

        // Knockback
        this.lknockX  = (this.lx > this.rx ? 1 : -1) * GAME.KNOCKBACK_X;
        this.lvy      = GAME.KNOCKBACK_Y;
        this.lonFloor = false;

        // Flash
        this.hitFlash.setPosition(this.lx, this.ly).setAlpha(0.85);
        this.tweens.add({
          targets: this.hitFlash,
          alpha: 0,
          duration: GAME.HIT_FLASH_MS,
          ease: "Linear",
        });

        bridge.onHpChange(this.localHp, this.remoteHp);

        if (this.localHp <= 0) {
          this.gameOver = true;
          bridge.onGameOver("remote");
        }
      }
    }
    this.prevRemoteGesture = rg;
  }
}
