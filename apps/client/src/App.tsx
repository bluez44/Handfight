import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { NetworkManager } from "./network/NetworkManager";
import {
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import type { FrameData } from "../packages/shared/src/types";

export type GestureType = "punch" | "block" | "move" | "special" | "idle";

// ─── Types ───────────────────────────────────────────────────────────────────
type Screen = "title" | "lobby" | "game" | "result";
type ConnStatus = "disconnected" | "connecting" | "connected";
type ResultOutcome = "win" | "lose" | "draw";

interface PlayerState {
  health: number; // 0-100
  gesture: GestureType;
}

// ─── Audio Manager ────────────────────────────────────────────────────────────
const AudioCtx = new (
  window.AudioContext ||
  (window as unknown as { webkitAudioContext: typeof AudioContext })
    .webkitAudioContext
)();
const audioCache: Record<string, AudioBuffer> = {};

async function loadSound(url: string): Promise<AudioBuffer | null> {
  if (audioCache[url]) return audioCache[url];
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const decoded = await AudioCtx.decodeAudioData(buf);
    audioCache[url] = decoded;
    return decoded;
  } catch {
    return null;
  }
}

function playSound(url: string, volume = 0.6) {
  loadSound(url).then((buf) => {
    if (!buf) return;
    const src = AudioCtx.createBufferSource();
    const gain = AudioCtx.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain);
    gain.connect(AudioCtx.destination);
    src.start();
  });
}

// Preload all SFX
const SFX = {
  punch: "/assets/audio/punch.mp3",
  kick: "/assets/audio/kick.mp3",
  hit: "/assets/audio/hit.mp3",
  win: "/assets/audio/win.mp3",
  countdown: "/assets/audio/countdown.mp3",
};
Object.values(SFX).forEach(loadSound);

// ─── Gesture Classifier ────────────────────────────────────────────────────
function classifyGesture(
  landmarks: { x: number; y: number; z: number }[],
): GestureType {
  if (!landmarks || landmarks.length < 21) return "idle";

  const wrist = landmarks[0];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];

  const fingersTucked = (tip: { y: number }, mcp: { y: number }) =>
    tip.y > mcp.y;

  const allTucked =
    fingersTucked(indexTip, indexMcp) &&
    fingersTucked(middleTip, middleMcp) &&
    fingersTucked(ringTip, ringMcp) &&
    fingersTucked(pinkyTip, pinkyMcp);

  // Fist → punch
  if (allTucked) return "punch";

  // Open palm (all fingers extended)
  const allExtended =
    indexTip.y < indexMcp.y &&
    middleTip.y < middleMcp.y &&
    ringTip.y < ringMcp.y &&
    pinkyTip.y < pinkyMcp.y;

  if (allExtended) return "block";

  // Move: wrist displaced significantly from centre
  const moveThreshold = 0.15;
  if (Math.abs(wrist.x - 0.5) > moveThreshold) return "move";

  return "idle";
}

// ─── Gesture meta ─────────────────────────────────────────────────────────────
const GESTURE_META: Record<
  GestureType,
  { icon: string; label: string; color: string }
> = {
  punch: { icon: "👊", label: "PUNCH", color: "var(--clr-p2)" },
  block: { icon: "🛡️", label: "BLOCK", color: "var(--clr-p1)" },
  move: { icon: "🏃", label: "MOVE", color: "var(--clr-accent)" },
  special: { icon: "⚡", label: "SPECIAL", color: "#a020f0" },
  idle: { icon: "✋", label: "IDLE", color: "var(--clr-text-dim)" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("disconnected");
  const [p1State, setP1State] = useState<PlayerState>({
    health: 100,
    gesture: "idle",
  });
  const [p2State, setP2State] = useState<PlayerState>({
    health: 100,
    gesture: "idle",
  });
  const [timer, setTimer] = useState(99);
  const [round] = useState(1);
  const [result, setResult] = useState<ResultOutcome | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [isHost, setIsHost] = useState(false);

  const net = useRef<NetworkManager | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const p1Health = useRef(100);
  const p2Health = useRef(100);

  // ─── MediaPipe Init ─────────────────────────────────────────────────────
  const initCamera = useCallback(async () => {
    if (AudioCtx.state === "suspended") await AudioCtx.resume();

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
    );
    const hl = await HandLandmarker.createFromOptions(vision, {
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
    landmarkerRef.current = hl;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    const video = videoRef.current!;
    video.srcObject = stream;
    await video.play();

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const draw = new DrawingUtils(ctx);
    let lastTime = -1;

    const loop = () => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const res = landmarkerRef.current!.detectForVideo(video, Date.now());

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Mirror the video
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Draw landmarks
        for (const lm of res.landmarks) {
          draw.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
            color: "#00d4ff",
            lineWidth: 3,
          });
          draw.drawLandmarks(lm, { color: "#ffffff", lineWidth: 1, radius: 3 });
        }

        // Classify gesture for local player (P1)
        if (res.landmarks[0]) {
          const gesture = classifyGesture(res.landmarks[0]);
          const wrist = res.landmarks[0][0];

          setP1State((prev) => ({ ...prev, gesture }));

          if (net.current && screen === "game") {
            net.current.sendFrame({
              ts: Date.now(),
              wrist: [wrist.x, wrist.y],
              gesture,
              normX: 0.5,
              normY: 0.5,
              hp: p1Health.current,
            });
          }
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, [screen]);

  // ─── Game timer ────────────────────────────────────────────────────────
  const endGame = useCallback((outcome: ResultOutcome) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResult(outcome);
    setScreen("result");
    if (outcome === "win") playSound(SFX.win, 0.8);
  }, []);

  const startGameTimer = useCallback(() => {
    setTimer(99);
    let t = 99;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      t--;
      setTimer(t);
      if (t <= 5 && t > 0) playSound(SFX.countdown, 0.4);
      if (t <= 0) {
        clearInterval(timerRef.current!);
        // Time up — compare health
        const p1hp = p1Health.current;
        const p2hp = p2Health.current;
        if (p1hp > p2hp) endGame("win");
        else if (p2hp > p1hp) endGame("lose");
        else endGame("draw");
      }
    }, 1000);
  }, [endGame]);

  // ─── Process incoming opponent frame ───────────────────────────────────
  const handleRemoteFrame = useCallback(
    (data: FrameData) => {
      setP2State((prev) => ({ ...prev, gesture: data.gesture as GestureType }));

      // Simple damage model
      if (data.gesture === "punch") {
        const dmg = 8;
        p1Health.current = Math.max(0, p1Health.current - dmg);
        setP1State((prev) => ({ ...prev, health: p1Health.current }));
        playSound(SFX.hit, 0.6);
        if (p1Health.current <= 0) endGame("lose");
      }
    },
    [endGame],
  );

  // Apply local punch damage to opponent
  useEffect(() => {
    if (p1State.gesture === "punch" && screen === "game") {
      const dmg = 8;
      p2Health.current = Math.max(0, p2Health.current - dmg);
      setP2State((prev) => ({ ...prev, health: p2Health.current }));
      playSound(SFX.punch, 0.6);
      if (p2Health.current <= 0) endGame("win");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1State.gesture]);

  // ─── Lobby actions ────────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (AudioCtx.state === "suspended") await AudioCtx.resume();
    setConnStatus("connecting");
    const manager = new NetworkManager(
      import.meta.env.VITE_API_URL || "http://localhost:3000",
    );
    net.current = manager;

    manager.onConnected = () => {
      setConnStatus("connected");
      setScreen("game");
      p1Health.current = 100;
      p2Health.current = 100;
      setP1State({ health: 100, gesture: "idle" });
      setP2State({ health: 100, gesture: "idle" });
      setShowSplash(true);
      setTimeout(() => setShowSplash(false), 1200);
      startGameTimer();
      initCamera();
    };
    manager.onFrameData = handleRemoteFrame;
    manager.onDisconnected = () => {
      setConnStatus("disconnected");
    };

    const code = await manager.createRoom();
    setRoomCode(code);
    setIsHost(true);
    setScreen("lobby");
  };

  const handleJoinRoom = async () => {
    const code = joinInput.trim().toUpperCase();
    if (!code) return;
    if (AudioCtx.state === "suspended") await AudioCtx.resume();
    setConnStatus("connecting");
    const manager = new NetworkManager(
      import.meta.env.VITE_API_URL || "http://localhost:3000",
    );
    net.current = manager;

    manager.onConnected = () => {
      setConnStatus("connected");
      setScreen("game");
      p1Health.current = 100;
      p2Health.current = 100;
      setP1State({ health: 100, gesture: "idle" });
      setP2State({ health: 100, gesture: "idle" });
      setShowSplash(true);
      setTimeout(() => setShowSplash(false), 1200);
      startGameTimer();
      initCamera();
    };
    manager.onFrameData = handleRemoteFrame;
    manager.onDisconnected = () => setConnStatus("disconnected");

    manager.joinRoom(code);
    setRoomCode(code);
    setIsHost(false);
    setScreen("lobby");
  };

  const handlePlayAgain = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current);
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    net.current?.disconnect();
    net.current = null;
    setConnStatus("disconnected");
    setResult(null);
    setRoomCode(null);
    setJoinInput("");
    setShowJoin(false);
    setScreen("title");
  };

  // ─── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      landmarkerRef.current?.close();
      net.current?.disconnect();
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────
  const p1Meta = GESTURE_META[p1State.gesture];
  const p2Meta = GESTURE_META[p2State.gesture];

  return (
    <>
      {/* Background layers */}
      <div className="bg-gradient" />
      <div className="bg-grid" />

      {/* ── Persistent Game Arena ── */}
      <div className="game-arena">
        <img src="/assets/arena_bg.jpg" alt="Arena" className="arena-bg" />
        
        <div className="fighters-container">
          <img 
            src="/assets/sprites/fighter_p1.jpg" 
            alt="P1" 
            className={`fighter-avatar p1 ${p1State.gesture}`} 
          />
          <img 
            src="/assets/sprites/fighter_p2.jpg" 
            alt="P2" 
            className={`fighter-avatar p2 ${p2State.gesture}`} 
          />
        </div>

        <div className="camera-container">
          <video
            className="input_video"
            ref={videoRef}
            style={{
              transform: "scaleX(-1)",
              display: "block",
              width: "100%",
            }}
          />
          <canvas
            className="output_canvas"
            ref={canvasRef}
          />
        </div>
      </div>


      {/* ── Title Screen ── */}
      <div
        className={`screen title-screen${screen !== "title" ? " hidden" : ""}`}
      >
        <div className="game-logo">
          <img src="/assets/logo.jpg" alt="HandFight" className="logo-img" />
          <h1 className="game-title">HANDFIGHT</h1>
          <p className="game-subtitle">2-Player Webcam Fighting Game</p>
        </div>

        <div className="menu-actions">
          <button className="btn btn-primary" onClick={handleCreateRoom}>
            🎮 Create Room
          </button>

          {!showJoin ? (
            <button className="btn btn-ghost" onClick={() => setShowJoin(true)}>
              🔗 Join Room
            </button>
          ) : (
            <div className="join-form">
              <div className="input-group">
                <input
                  className="game-input"
                  type="text"
                  maxLength={5}
                  placeholder="ENTER CODE"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                  autoFocus
                />
                <button className="btn btn-danger" onClick={handleJoinRoom}>
                  JOIN
                </button>
              </div>
              <button
                className="btn btn-ghost"
                style={{ width: "100%", fontSize: "0.8rem" }}
                onClick={() => {
                  setShowJoin(false);
                  setJoinInput("");
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Gesture Guide */}
        <div className="gesture-guide">
          {Object.entries(GESTURE_META)
            .filter(([k]) => k !== "idle")
            .map(([k, m]) => (
              <div className="guide-item" key={k}>
                <span className="guide-icon">{m.icon}</span>
                <span className="guide-text" style={{ color: m.color }}>
                  {m.label}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* ── Lobby Screen ── */}
      <div
        className={`screen lobby-screen${screen !== "lobby" ? " hidden" : ""}`}
      >
        <div className="lobby-card">
          <h2 className="lobby-title">
            {isHost ? "⚡ Room Created" : "🔗 Joining Room"}
          </h2>

          <div className="room-code-display">
            <span className="room-code-label">Room Code</span>
            <span className="room-code-value">{roomCode ?? "—"}</span>
          </div>

          <div className="players-status">
            <div
              className={`player-slot p1${connStatus !== "disconnected" ? " connected" : ""}`}
            >
              <div className="player-avatar">👊</div>
              <span className="player-name" style={{ color: "var(--clr-p1)" }}>
                YOU
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--clr-success)" }}>
                ✓ Ready
              </span>
            </div>
            <span className="vs-badge">VS</span>
            <div
              className={`player-slot p2${connStatus === "connected" ? " connected" : ""}`}
            >
              <div
                className="player-avatar"
                style={{ color: "var(--clr-p2)", borderColor: "var(--clr-p2)" }}
              >
                🥊
              </div>
              <span className="player-name" style={{ color: "var(--clr-p2)" }}>
                OPPONENT
              </span>
              {connStatus === "connected" ? (
                <span
                  style={{ fontSize: "0.7rem", color: "var(--clr-success)" }}
                >
                  ✓ Ready
                </span>
              ) : (
                <div className="waiting-dots">
                  <div className="dot" />
                  <div className="dot" />
                  <div className="dot" />
                </div>
              )}
            </div>
          </div>

          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--clr-text-dim)",
              textAlign: "center",
            }}
          >
            {connStatus === "connecting" || connStatus === "disconnected"
              ? isHost
                ? "Share the room code with your opponent"
                : "Connecting to room..."
              : "Opponent connected! Starting game..."}
          </p>

          <button
            className="btn btn-ghost"
            style={{ width: "100%" }}
            onClick={handlePlayAgain}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* ── Game Screen ── */}
      <div
        className={`screen game-screen${screen !== "game" ? " hidden" : ""}`}
      >
        {/* HUD */}
        <div className="hud">
          <div className="health-section p1">
            <span className="player-label">👊 YOU (P1)</span>
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{ width: `${p1State.health}%` }}
              />
            </div>
            <span className="health-pct">{p1State.health} HP</span>
          </div>

          <div className="hud-center">
            <span className="round-badge">ROUND {round}</span>
            <div className={`timer-display${timer <= 10 ? " urgent" : ""}`}>
              {timer}
            </div>
          </div>

          <div className="health-section p2">
            <span className="player-label">OPPONENT (P2) 🥊</span>
            <div className="health-bar-track">
              <div
                className="health-bar-fill"
                style={{ width: `${p2State.health}%` }}
              />
            </div>
            <span className="health-pct">{p2State.health} HP</span>
          </div>
        </div>

        {/* Gesture Display */}
        <div className="gesture-display">
          <div
            className={`gesture-card p1${p1State.gesture !== "idle" ? " active" : ""}`}
          >
            <span className="gesture-icon">{p1Meta.icon}</span>
            <span className="gesture-label" style={{ color: p1Meta.color }}>
              {p1Meta.label}
            </span>
          </div>
          <div
            className={`gesture-card p2${p2State.gesture !== "idle" ? " active" : ""}`}
          >
            <span className="gesture-icon">{p2Meta.icon}</span>
            <span className="gesture-label" style={{ color: p2Meta.color }}>
              {p2Meta.label}
            </span>
          </div>
        </div>

        {/* Gesture Guide */}
        <div className="gesture-guide">
          {Object.entries(GESTURE_META)
            .filter(([k]) => k !== "idle")
            .map(([k, m]) => (
              <div className="guide-item" key={k}>
                <span className="guide-icon">{m.icon}</span>
                <span className="guide-text" style={{ color: m.color }}>
                  {m.label}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* ── Result Screen ── */}
      {screen === "result" && (
        <div className="screen result-screen">
          <div className="result-content">
            {result === "win" && (
              <>
                <div className="result-title win">🏆 YOU WIN!</div>
                <p className="result-subtitle">
                  Excellent fighting! Your hands are deadly weapons.
                </p>
              </>
            )}
            {result === "lose" && (
              <>
                <div className="result-title lose">💀 YOU LOSE</div>
                <p className="result-subtitle">
                  Better luck next time. Train harder!
                </p>
              </>
            )}
            {result === "draw" && (
              <>
                <div className="result-title draw">🤝 DRAW!</div>
                <p className="result-subtitle">Perfectly matched fighters!</p>
              </>
            )}
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button className="btn btn-gold" onClick={handlePlayAgain}>
                🔄 Play Again
              </button>
              <button className="btn btn-ghost" onClick={handlePlayAgain}>
                ← Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fight! Splash ── */}
      {showSplash && (
        <div className="fight-splash">
          <div className="fight-splash-text">FIGHT!</div>
        </div>
      )}

      {/* ── Connection Status Badge ── */}
      {screen !== "title" && (
        <div className="connection-badge">
          <div className={`status-dot ${connStatus}`} />
          <span>
            {connStatus === "connected"
              ? "P2P Connected"
              : connStatus === "connecting"
                ? "Connecting..."
                : "Offline"}
          </span>
        </div>
      )}
    </>
  );
}
