import { useEffect, useRef, useState } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  /** Updated every detection frame; read by other hooks via ref (no re-render). */
  const landmarksRef = useRef<NormalizedLandmark[][]>([]);
  const streamRef = useRef<MediaStream | null>(null);
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
        streamRef.current = mediaStream;
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

            landmarksRef.current = results.landmarks;

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
      streamRef.current = null;
      mediaStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, canvasRef, loadingPercent, landmarksRef, streamRef };
}
