import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FrameData } from "../../packages/shared/src/types";
import { BOX_SIZE, type BoxState } from "./useBoxController";
import type { Gesture } from "../utils/handPose";

const LERP_X = 0.2; // slightly snappier than local for responsiveness

/**
 * Converts incoming FrameData into a BoxState via a rAF loop.
 *
 * The sender normalises box position to their viewport (0-1), so we
 * re-scale to our own viewport on each tick — works across screen sizes.
 */
export function useRemoteBox(
  remoteFrameRef: MutableRefObject<FrameData | null>,
): BoxState {
  const posRef = useRef({ x: window.innerWidth * 0.7, y: window.innerHeight * 0.8 });
  const rafRef = useRef<number>(0);

  const [state, setState] = useState<BoxState>({
    x: posRef.current.x,
    y: posRef.current.y,
    gesture: "none",
    wrist: [0.5, 0.5],
  });

  useEffect(() => {
    const tick = () => {
      const frame = remoteFrameRef.current;

      if (frame) {
        const targetX = frame.normX * window.innerWidth;
        const targetY = frame.normY * window.innerHeight;

        posRef.current.x += (targetX - posRef.current.x) * LERP_X;
        posRef.current.y += (targetY - posRef.current.y) * LERP_X;

        posRef.current.x = Math.max(
          0,
          Math.min(window.innerWidth - BOX_SIZE, posRef.current.x),
        );
        posRef.current.y = Math.max(
          0,
          Math.min(window.innerHeight - BOX_SIZE, posRef.current.y),
        );

        setState({
          x: Math.round(posRef.current.x),
          y: Math.round(posRef.current.y),
          gesture: frame.gesture as Gesture,
          wrist: frame.wrist,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [remoteFrameRef]);

  return state;
}
