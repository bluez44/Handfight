import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classifyGesture, LM, type Gesture } from "../utils/handPose";

// ── Physics constants ─────────────────────────────────────────────────────────

const GRAVITY = 1800;       // px/s²
const JUMP_VELOCITY = -700; // px/s — negative = upward
const LERP_X = 0.15;        // horizontal position smoothing per frame
export const BOX_SIZE = 48; // px — shared with BoxEntity

const JUMP_TRIGGER_FROM: Gesture = "fist";
const JUMP_TRIGGER_TO: readonly Gesture[] = ["thumbs_up", "point"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhysicsState {
  x: number;
  y: number;
  vy: number;
  onFloor: boolean;
}

export interface BoxState {
  x: number;
  y: number;
  gesture: Gesture;
  /** Normalized wrist position in image space — forwarded in FrameData. */
  wrist: [number, number];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * rAF physics loop — mirrors wrist X, applies gravity, triggers jumps.
 *
 * @param landmarksRef   Live landmark array from useHandTracking.
 * @param onTick         Called every physics tick with the latest BoxState.
 *                       Stored in a ref so callers can pass an inline function
 *                       without restarting the physics loop.
 */
export function useBoxController(
  landmarksRef: RefObject<NormalizedLandmark[][]>,
  onTick?: (state: BoxState) => void,
): BoxState {
  const floorY = () => window.innerHeight - BOX_SIZE - 80;

  const physicsRef = useRef<PhysicsState>({
    x: window.innerWidth / 2 - BOX_SIZE / 2,
    y: floorY(),
    vy: 0,
    onFloor: true,
  });
  const prevGestureRef = useRef<Gesture>("none");
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  // Keep onTick in a ref so the rAF closure always calls the latest version
  // without the effect needing to restart when the callback identity changes.
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  const [state, setState] = useState<BoxState>(() => ({
    x: physicsRef.current.x,
    y: physicsRef.current.y,
    gesture: "none",
    wrist: [0.5, 0.5],
  }));

  useEffect(() => {
    const tick = (ts: number) => {
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = ts;

      const lm = landmarksRef.current[0] ?? null;
      const gesture: Gesture = lm ? classifyGesture(lm) : "none";
      const wrist: [number, number] = lm
        ? [lm[LM.WRIST].x, lm[LM.WRIST].y]
        : [0.5, 0.5];
      const p = physicsRef.current;
      const floor = floorY();

      // ── Jump trigger ────────────────────────────────────────────────────────
      if (
        prevGestureRef.current === JUMP_TRIGGER_FROM &&
        JUMP_TRIGGER_TO.includes(gesture) &&
        p.onFloor
      ) {
        p.vy = JUMP_VELOCITY;
        p.onFloor = false;
      }
      prevGestureRef.current = gesture;

      // ── Horizontal: mirror wrist X onto viewport ────────────────────────────
      if (lm) {
        const targetX = (1 - wrist[0]) * window.innerWidth - BOX_SIZE / 2;
        p.x += (targetX - p.x) * LERP_X;
      }

      // ── Vertical physics ────────────────────────────────────────────────────
      if (!p.onFloor) {
        p.vy += GRAVITY * dt;
        p.y += p.vy * dt;
      }
      if (p.y >= floor) {
        p.y = floor;
        p.vy = 0;
        p.onFloor = true;
      }

      // ── Clamp to viewport ───────────────────────────────────────────────────
      p.x = Math.max(0, Math.min(window.innerWidth - BOX_SIZE, p.x));

      const next: BoxState = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        gesture,
        wrist,
      };
      setState(next);
      onTickRef.current?.(next);

      rafRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [landmarksRef]);

  return state;
}
