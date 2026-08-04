import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream;
}

/**
 * Fixed bottom-left camera preview for the remote player's video stream.
 * Mirrors the video horizontally (same treatment as the local feed).
 */
export function RemoteVideo({ stream }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-1"
    >
      <div className="font-mono text-[10px] tracking-[3px] text-blue bg-surface border border-blue-dim px-2 py-1">
        P2 · OPPONENT
      </div>
      <div
        className="border border-blue-dim overflow-hidden"
        style={{ width: 180, height: 120 }}
      >
        <video
          ref={videoRef}
          className="block"
          style={{ width: 180, height: 120, transform: "scaleX(-1)" }}
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  );
}
