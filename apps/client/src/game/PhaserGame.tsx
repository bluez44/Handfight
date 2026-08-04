import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import type { MutableRefObject } from "react";
import type { FrameData } from "../../packages/shared/src/types";
import type { PlayerInput } from "../hooks/usePlayerInput";
import { GameScene, type GameBridge } from "./GameScene";
import { HpBars } from "../components/HpBars";
import { GAME } from "./constants";

interface Props {
  localInputRef:  MutableRefObject<PlayerInput>;
  remoteFrameRef: MutableRefObject<FrameData | null>;
  onSendFrame:    (frame: FrameData) => void;
  isConnected:    boolean;
  onPlayAgain?:   () => void;
}

export function PhaserGame({
  localInputRef, remoteFrameRef, onSendFrame, isConnected, onPlayAgain,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);

  const [localHp,  setLocalHp]  = useState<number>(GAME.MAX_HP);
  const [remoteHp, setRemoteHp] = useState<number>(GAME.MAX_HP);
  const [winner, setWinner]     = useState<"local" | "remote" | null>(null);

  // Stable bridge object — properties mutated in place so Phaser always reads
  // the latest callbacks without re-creating the game.
  const bridgeRef = useRef<GameBridge>({
    localInputRef,
    remoteFrameRef,
    onSendFrame,
    isConnected:  () => false,
    onHpChange:   () => {},
    onGameOver:   () => {},
  });

  // Update mutable bridge fields on every render
  bridgeRef.current.onSendFrame  = onSendFrame;
  bridgeRef.current.isConnected  = () => isConnected;
  bridgeRef.current.onHpChange   = (lHp: number, rHp: number) => {
    setLocalHp(lHp);
    setRemoteHp(rHp);
  };
  bridgeRef.current.onGameOver   = (w: "local" | "remote") => setWinner(w);

  // Mount Phaser once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const game = new Phaser.Game({
      type:        Phaser.AUTO,
      width:       window.innerWidth,
      height:      window.innerHeight,
      transparent: true,
      parent:      container,
      scale: { mode: Phaser.Scale.RESIZE },
      scene:       [GameScene],
    });

    game.registry.set("bridge", bridgeRef);
    game.canvas.style.pointerEvents = "none";
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const handlePlayAgain = () => {
    setLocalHp(GAME.MAX_HP);
    setRemoteHp(GAME.MAX_HP);
    setWinner(null);
    (gameRef.current?.scene.getScene("GameScene") as GameScene | null)?.reset();
    onPlayAgain?.();
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Phaser canvas mounts here */}
      <div ref={containerRef} className="w-full h-full" />

      {/* HP bars — only when connected and game is live */}
      {isConnected && !winner && (
        <HpBars localHp={localHp} remoteHp={remoteHp} />
      )}

      {/* Game-over overlay */}
      {winner && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg/75 backdrop-blur-sm pointer-events-auto z-50">
          <div className="font-title text-8xl tracking-widest leading-none mb-2">
            {winner === "remote"
              ? <><span className="text-red">YOU </span><span className="text-muted">LOSE</span></>
              : <><span className="text-blue">YOU </span><span className="text-green">WIN</span></>
            }
          </div>
          <div className="font-mono text-xs text-muted tracking-[6px] mb-10">
            {winner === "remote" ? "OPPONENT WINS" : "FLAWLESS VICTORY"}
          </div>
          <button
            className="font-title text-xl tracking-[4px] px-14 py-3 bg-gold text-bg border-none cursor-pointer hover:brightness-125 active:scale-95 transition-all"
            style={{ clipPath: "polygon(14px 0%,100% 0%,calc(100% - 14px) 100%,0% 100%)" }}
            onClick={handlePlayAgain}
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
