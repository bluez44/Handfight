import { useEffect, useRef, useState } from "react";
import "./App.css";
import { NetworkManager } from "./network/NetworkManager";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const net = useRef<NetworkManager | null>(null);

  const handleCreateRoom = async () => {
    const manager = new NetworkManager("http://localhost:3000");
    net.current = manager;
    const code = await manager.createRoom();
    if (code) setRoomCode(code);
    console.log("Room code:", code);
    manager.onConnected = () => console.log("Connected to peer!");
    manager.onFrameData = (data) => console.log("Received frame data:", data);
    manager.onDisconnected = () => console.log("Peer disconnected!");
  };

  const handleJoinRoom = (code: string) => {
    const manager = new NetworkManager("http://localhost:3000");
    net.current = manager;
    manager.onConnected = () => console.log("Connected to peer!");
    manager.onFrameData = (data) => console.log("Received frame data:", data);
    manager.onDisconnected = () => console.log("Peer disconnected!");
    manager.joinRoom(code);
  };

  const handleSendData = (data: string) => {
    console.log("Sending data:", data, net.current);
    if (!net.current) return;
    net.current.sendFrame({
      ts: Date.now(),
      wrist: [Math.random(), Math.random()],
      gesture: "punch",
    });
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    let mediaStream: MediaStream | null = null;

    const init = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
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

      if (!active) {
        handLandmarker.close();
        return;
      }
      handLandmarkerRef.current = handLandmarker;

      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
      });
      if (!active) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current!;
      video.srcObject = mediaStream;
      await video.play();

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const drawingUtils = new DrawingUtils(ctx);
      let lastVideoTime = -1;

      const renderLoop = () => {
        if (!active) return;

        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const results = handLandmarkerRef.current!.detectForVideo(
            video,
            Date.now()
          );

          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(
              landmarks,
              HandLandmarker.HAND_CONNECTIONS,
              { color: "#00FF00", lineWidth: 5 }
            );
            drawingUtils.drawLandmarks(landmarks, {
              color: "#FF0000",
              lineWidth: 2,
            });
          }
          ctx.restore();
        }

        animFrameRef.current = requestAnimationFrame(renderLoop);
      };

      renderLoop();
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

  return (
    <>
      {roomCode && <p>Room Code: {roomCode}</p>}
      {!roomCode && <button onClick={handleCreateRoom}>Create Room</button>}

      <input
        type="text"
        placeholder="Enter room code"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleJoinRoom(e.currentTarget.value);
        }}
      />

      <input
        type="text"
        placeholder="Data"
        onChange={(e) => handleSendData(e.currentTarget.value)}
      />

      <div className="container" style={{ position: "relative" }}>
        <video className="input_video" ref={videoRef}></video>
        <canvas
          className="output_canvas"
          style={{ position: "absolute", left: 0, top: 0 }}
          width="1280px"
          height="720px"
          ref={canvasRef}
        ></canvas>
      </div>
    </>
  );
}

export default App;
