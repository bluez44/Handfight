import { useEffect, useRef, useState } from "react";
import type { RefObject, MutableRefObject } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { classifyGesture, LM, type Gesture } from "../utils/handPose";

export interface PlayerInput {
  gesture: Gesture;
  wrist: [number, number]; // normalized image-space [0,1]
}

const DEFAULT: PlayerInput = { gesture: "none", wrist: [0.5, 0.5] };

/**
 * Thin hook that classifies gesture + extracts wrist position each rAF frame.
 * Returns both a React state (for UI labels) and a stable ref (for Phaser reads).
 */
export function usePlayerInput(
  landmarksRef: RefObject<NormalizedLandmark[][]>,
): { input: PlayerInput; inputRef: MutableRefObject<PlayerInput> } {
  const inputRef = useRef<PlayerInput>(DEFAULT);
  const rafRef   = useRef<number>(0);
  const [input, setInput] = useState<PlayerInput>(DEFAULT);

  useEffect(() => {
    const tick = () => {
      const lm      = landmarksRef.current[0] ?? null;
      const gesture = lm ? classifyGesture(lm) : "none";
      const wrist: [number, number] = lm
        ? [lm[LM.WRIST].x, lm[LM.WRIST].y]
        : [0.5, 0.5];
      const next = { gesture, wrist };
      inputRef.current = next;
      setInput(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [landmarksRef]);

  return { input, inputRef };
}
