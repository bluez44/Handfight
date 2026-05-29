import type { RefObject } from "react";
import type { Gesture } from "../utils/handPose";

// ── Gesture labels ────────────────────────────────────────────────────────────

const GESTURE_LABEL: Record<Gesture, string> = {
  none:        "— no hand",
  fist:        "✊ FIST",
  open:        "🖐 OPEN",
  point:       "☝ POINT",
  thumbs_up:   "👍 THUMBS UP",
  thumbs_down: "👎 THUMBS DOWN",
  peace:       "✌ PEACE",
  three:       "3️⃣  THREE",
  four:        "4️⃣  FOUR",
  gun:         "👉 GUN",
  call:        "🤙 CALL",
  rock:        "🤘 ROCK",
  spiderman:   "🕷 SPIDERMAN",
  ok:          "👌 OK",
  pinch:       "🤌 PINCH",
  middle:      "🖕 MIDDLE",
  ring:        "💍 RING",
  pinky:       "🤙 PINKY",
  unknown:     "? UNKNOWN",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  gesture: Gesture;
  /** Controls CSS visibility — the elements remain in the DOM either way
   *  so videoRef/canvasRef are always valid for MediaPipe. */
  show: boolean;
}

/**
 * Camera preview with landmark canvas and gesture label.
 *
 * The video and canvas are always mounted (never conditionally rendered)
 * so the refs passed from useHandTracking remain attached from the first
 * render — MediaPipe needs them before `show` becomes true.
 */
export function HandCamOverlay({ videoRef, canvasRef, gesture, show }: Props) {
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1"
      style={{ display: show ? "flex" : "none" }}
    >
      {/* Gesture label */}
      <div className="font-mono text-[10px] tracking-[3px] text-muted bg-surface border border-border px-2 py-1">
        {GESTURE_LABEL[gesture]}
      </div>

      {/* Camera feed with landmark overlay */}
      <div
        className="relative border border-border overflow-hidden"
        style={{ width: 180, height: 120 }}
      >
        {/* Video is always hidden — it feeds the canvas, never shown directly */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />
        {/* Canvas renders the mirrored feed + landmark skeleton */}
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: 180, height: 120 }}
        />
      </div>

      {/* Jump hint */}
      <div className="font-mono text-[9px] text-muted text-right leading-snug">
        ✊ FIST → ☝ POINT to JUMP
      </div>
    </div>
  );
}
