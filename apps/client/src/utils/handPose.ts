import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * All recognisable single-hand poses.
 *
 * Finger-extension patterns (T=thumb I=index M=middle R=ring P=pinky):
 *
 *  fist        (0,0,0,0,0)
 *  open        (1,1,1,1,1)
 *  four        (0,1,1,1,1)
 *  three       (0,1,1,1,0)
 *  peace       (0,1,1,0,0)  ✌
 *  point       (0,1,0,0,0)  ☝
 *  middle      (0,0,1,0,0)  🖕
 *  ring        (0,0,0,1,0)
 *  pinky       (0,0,0,0,1)
 *  thumbs_up   (1,0,0,0,0)  thumb tip above wrist  👍
 *  thumbs_down (1,0,0,0,0)  thumb tip below wrist  👎
 *  gun         (1,1,0,0,0)  👉
 *  call        (1,0,0,0,1)  🤙
 *  rock        (0,1,0,0,1)  🤘
 *  spiderman   (1,1,0,0,1)
 *  ok          thumb-index pinch + middle+ring+pinky open  👌
 *  pinch       thumb-index pinch + other fingers curled    🤌
 *  none        no hand detected / landmarks unreadable
 *  unknown     hand detected but pose not matched
 */
export type Gesture =
  | "none"
  | "fist"
  | "open"
  | "four"
  | "three"
  | "peace"
  | "point"
  | "middle"
  | "ring"
  | "pinky"
  | "thumbs_up"
  | "thumbs_down"
  | "gun"
  | "call"
  | "rock"
  | "spiderman"
  | "ok"
  | "pinch"
  | "unknown";

export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  /** Thumb tip is above the wrist in image space (y decreases upward). */
  thumbUp: boolean;
  /**
   * Thumb-to-index-tip distance normalised by palm width.
   * 0 = fully pinched together, ~1+ = wide open.
   */
  pinchRatio: number;
}

export interface HandPose {
  gesture: Gesture;
  fingers: FingerState;
  /** Normalised [0, 1] wrist position in image space. */
  wrist: { x: number; y: number };
  /** Number of extended fingers, thumb excluded. */
  extendedCount: number;
}

// ── Landmark indices ──────────────────────────────────────────────────────────

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

// ── Math helpers ──────────────────────────────────────────────────────────────

function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function magnitude(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return magnitude(a.x - b.x, a.y - b.y);
}

// ── Finger extension ──────────────────────────────────────────────────────────

/**
 * Whether a finger is extended, judged by projecting TIP and PIP onto the
 * hand's primary axis (wrist → middle MCP). Works regardless of in-plane
 * hand rotation.
 */
function isExtended(
  lm: NormalizedLandmark[],
  tipIdx: number,
  pipIdx: number,
  axisX: number,
  axisY: number,
): boolean {
  const w = lm[LM.WRIST];
  const tipProj = dot(lm[tipIdx].x - w.x, lm[tipIdx].y - w.y, axisX, axisY);
  const pipProj = dot(lm[pipIdx].x - w.x, lm[pipIdx].y - w.y, axisX, axisY);
  return tipProj > pipProj;
}

/**
 * Whether the thumb is abducted away from the palm, measured as the distance
 * from THUMB_TIP to INDEX_MCP normalised by palm width. This works for any
 * thumb direction (up, sideways, diagonal), unlike a raw x-delta check.
 */
function isThumbExtended(lm: NormalizedLandmark[]): boolean {
  const palmWidth = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP]);
  return palmWidth > 0.01 &&
    dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) > palmWidth * 0.6;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the full per-finger state from a 21-point landmark array, including
 * thumb direction and normalised pinch ratio.
 * Returns null if landmarks are absent or the hand is too small to read.
 */
export function getFingerState(lm: NormalizedLandmark[]): FingerState | null {
  if (!lm || lm.length < 21) return null;

  const dx = lm[LM.MIDDLE_MCP].x - lm[LM.WRIST].x;
  const dy = lm[LM.MIDDLE_MCP].y - lm[LM.WRIST].y;
  const mag = magnitude(dx, dy);
  if (mag < 0.01) return null;

  const ax = dx / mag;
  const ay = dy / mag;

  const palmWidth = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP]);
  const pinchRatio = palmWidth > 0
    ? dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / palmWidth
    : 1;

  return {
    thumb:      isThumbExtended(lm),
    index:      isExtended(lm, LM.INDEX_TIP,  LM.INDEX_PIP,  ax, ay),
    middle:     isExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP, ax, ay),
    ring:       isExtended(lm, LM.RING_TIP,   LM.RING_PIP,   ax, ay),
    pinky:      isExtended(lm, LM.PINKY_TIP,  LM.PINKY_PIP,  ax, ay),
    thumbUp:    lm[LM.THUMB_TIP].y < lm[LM.WRIST].y,
    pinchRatio,
  };
}

/**
 * Maps a FingerState to a Gesture. Evaluated in priority order so that
 * pinch-based gestures (ok, pinch) are not shadowed by extension-only rules.
 */
export function gestureFromFingers(f: FingerState): Gesture {
  const { thumb, index, middle, ring, pinky, thumbUp, pinchRatio } = f;
  const count = [index, middle, ring, pinky].filter(Boolean).length;
  const isPinching = pinchRatio < 0.35;

  // ── Pinch-based ──────────────────────────────────────────────────────────
  if (isPinching) {
    if (middle && ring && pinky) return "ok";       // 👌 thumb+index touch, rest open
    if (!middle && !ring && !pinky) return "pinch"; // 🤌 thumb+index touch, rest curled
  }

  // ── Thumb only ───────────────────────────────────────────────────────────
  if (thumb && count === 0) {
    return thumbUp ? "thumbs_up" : "thumbs_down";   // 👍 / 👎
  }

  // ── No extensions at all ─────────────────────────────────────────────────
  if (!thumb && count === 0) return "fist";          // ✊

  // ── All five ─────────────────────────────────────────────────────────────
  if (thumb && count === 4) return "open";           // 🖐

  // ── Thumb + specific combos ───────────────────────────────────────────────
  if (thumb && index && !middle && !ring &&  pinky) return "spiderman"; // 🕷
  if (thumb && index && !middle && !ring && !pinky) return "gun";       // 👉
  if (thumb && !index && !middle && !ring &&  pinky) return "call";     // 🤙

  // ── Four fingers (no thumb) ──────────────────────────────────────────────
  if (count === 4) return "four";

  // ── Three fingers ────────────────────────────────────────────────────────
  if (index && middle && ring && !pinky) return "three";

  // ── Two fingers ──────────────────────────────────────────────────────────
  if (index && middle && !ring && !pinky) return "peace"; // ✌
  if (index && !middle && !ring &&  pinky) return "rock"; // 🤘

  // ── One finger ───────────────────────────────────────────────────────────
  if (index  && !middle && !ring && !pinky) return "point";  // ☝
  if (!index &&  middle && !ring && !pinky) return "middle"; // 🖕
  if (!index && !middle &&  ring && !pinky) return "ring";
  if (!index && !middle && !ring &&  pinky) return "pinky";

  return "unknown";
}

/**
 * Classifies the gesture directly from a landmark array.
 * Returns "none" if landmarks are absent or the hand is unreadable.
 */
export function classifyGesture(lm: NormalizedLandmark[]): Gesture {
  const fingers = getFingerState(lm);
  return fingers ? gestureFromFingers(fingers) : "none";
}

/**
 * Returns the full HandPose from a single landmark array.
 * Returns null when landmarks are absent or unreadable.
 */
export function getHandPose(lm: NormalizedLandmark[]): HandPose | null {
  const fingers = getFingerState(lm);
  if (!fingers) return null;

  return {
    gesture:       gestureFromFingers(fingers),
    fingers,
    wrist:         { x: lm[LM.WRIST].x, y: lm[LM.WRIST].y },
    extendedCount: [fingers.index, fingers.middle, fingers.ring, fingers.pinky]
      .filter(Boolean).length,
  };
}
