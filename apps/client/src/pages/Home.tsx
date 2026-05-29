import { useEffect, useRef, useState } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const [loadingPercent, setLoadingPercent] = useState(0);

  useEffect(() => {
    let active = true;
    let mediaStream: MediaStream | null = null;

    const init = async () => {
      try {
        setLoadingPercent(0);

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
        );
        setLoadingPercent(20);

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        setLoadingPercent(40);

        if (!active) {
          handLandmarker.close();
          return;
        }
        handLandmarkerRef.current = handLandmarker;

        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 300, height: 200 },
        });
        if (!active) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLoadingPercent(60);

        const video = videoRef.current!;
        video.srcObject = mediaStream;
        await video.play();

        const canvas = canvasRef.current!;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        const drawingUtils = new DrawingUtils(ctx);
        let lastVideoTime = -1;
        setLoadingPercent(80);

        const renderLoop = () => {
          if (!active) return;

          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const results = handLandmarkerRef.current!.detectForVideo(
              video,
              Date.now(),
            );

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            for (const landmarks of results.landmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                HandLandmarker.HAND_CONNECTIONS,
                { color: "#00FF00", lineWidth: 1 },
              );
              drawingUtils.drawLandmarks(landmarks, {
                color: "#FF0000",
                lineWidth: 1,
              });
            }
            ctx.restore();
          }

          animFrameRef.current = requestAnimationFrame(renderLoop);
        };

        renderLoop();
        setLoadingPercent(100);
      } catch (e) {
        console.error("Failed to initialize HandLandmarker:", e);
        setLoadingPercent(100);
      }
    };

    init();

    return () => {
      active = false;
      cancelAnimationFrame(animFrameRef.current);
      handLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, canvasRef, loadingPercent };
}

const Home = () => {
  const { videoRef, canvasRef, loadingPercent } = useHandTracking();
  const isReady = loadingPercent === 100;
  const statusText = isReady
    ? "Sẵn sàng!"
    : `Đang khởi động... ${loadingPercent}%`;

  return (
    <div className="text-center">
      <div className="font-title text-7xl tracking-widest leading-none">
        <span className="text-red">HAND</span>{" "}
        <span className="text-blue">FIGHT</span>
      </div>
      <div className="font-mono text-xs tracking-[10px] text-muted my-1">
        SPRITE EDITION
      </div>

      <div className="w-60 h-0.75 bg-surface2 mt-5 mx-auto mb-2">
        <div
          className="h-full bg-linear-to-r from-red to-gold transition-all duration-300"
          style={{ width: `${loadingPercent}%` }}
        />
      </div>
      <div className="font-mono text-xs text-muted tracking-wide">
        {statusText}
      </div>

      {/* Required by MediaPipe — not displayed */}
      <div className="relative w-full max-w-3xl aspect-video mt-5 mx-auto">

        <video ref={videoRef} className="hidden" playsInline muted />
      <canvas width={300} height={200} ref={canvasRef} />
      </div>
    </div>
  );
};

export default Home;
