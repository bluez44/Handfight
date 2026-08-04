import type { Gesture } from "../utils/handPose";
import { BOX_SIZE } from "../hooks/useBoxController";

// ── Visual style per gesture ──────────────────────────────────────────────────

interface GestureStyle {
  bg: string;
  border: string;
  label: string;
}

const GESTURE_STYLE: Partial<Record<Gesture, GestureStyle>> = {
  fist:        { bg: "bg-red",      border: "border-red",    label: "✊" },
  open:        { bg: "bg-blue",     border: "border-blue",   label: "🖐" },
  point:       { bg: "bg-gold",     border: "border-gold",   label: "☝" },
  thumbs_up:   { bg: "bg-green",    border: "border-green",  label: "👍" },
  thumbs_down: { bg: "bg-surface2", border: "border-border", label: "👎" },
  peace:       { bg: "bg-blue",     border: "border-blue",   label: "✌" },
  rock:        { bg: "bg-red",      border: "border-red",    label: "🤘" },
  call:        { bg: "bg-green",    border: "border-green",  label: "🤙" },
  ok:          { bg: "bg-gold",     border: "border-gold",   label: "👌" },
  pinch:       { bg: "bg-gold",     border: "border-gold",   label: "🤌" },
  gun:         { bg: "bg-red",      border: "border-red",    label: "👉" },
  spiderman:   { bg: "bg-blue",     border: "border-blue",   label: "🕷" },
};

const FALLBACK_STYLE: GestureStyle = {
  bg: "bg-surface2",
  border: "border-border",
  label: "·",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  x: number;
  y: number;
  gesture: Gesture;
  /** "local" uses gesture-driven colours; "remote" uses blue-tinted colours. */
  player?: "local" | "remote";
}

export function BoxEntity({ x, y, gesture, player = "local" }: Props) {
  const { bg, border, label } =
    player === "remote"
      ? { bg: "bg-blue-dim", border: "border-blue", label: GESTURE_STYLE[gesture]?.label ?? "·" }
      : (GESTURE_STYLE[gesture] ?? FALLBACK_STYLE);

  return (
    <div
      className={`fixed border-2 ${bg} ${border} flex items-center justify-center text-xl select-none pointer-events-none transition-colors duration-100`}
      style={{ left: x, top: y, width: BOX_SIZE, height: BOX_SIZE }}
    >
      {label}
    </div>
  );
}
