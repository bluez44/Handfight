import { useState } from "react";

interface Props {
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (code: string) => void;
  /** Show a banner when the opponent disconnected mid-game. */
  disconnected?: boolean;
}

export function LobbyScreen({ onCreateRoom, onJoinRoom, disconnected }: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await onCreateRoom();
    setCreating(false);
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length > 0) onJoinRoom(code);
  };

  return (
    <div className="text-center flex flex-col items-center gap-0">
      <div className="font-title text-7xl tracking-widest leading-none">
        <span className="text-red">HAND</span>{" "}
        <span className="text-blue">FIGHT</span>
      </div>
      <div className="font-mono text-xs tracking-[10px] text-muted mt-1 mb-8">
        SPRITE EDITION
      </div>

      {disconnected && (
        <div className="font-mono text-xs text-gold border border-gold px-4 py-2 mb-6 tracking-widest">
          ⚡ OPPONENT DISCONNECTED
        </div>
      )}

      {/* Create room */}
      <button
        className="font-title text-xl tracking-[4px] px-14 py-3 bg-red text-white border-none cursor-pointer hover:brightness-125 transition-all active:scale-95 mb-3"
        style={{ clipPath: "polygon(14px 0%,100% 0%,calc(100% - 14px) 100%,0% 100%)" }}
        onClick={handleCreate}
        disabled={creating}
      >
        {creating ? "CREATING…" : "CREATE ROOM"}
      </button>

      {/* Join room */}
      <div className="flex items-center gap-2 mt-2">
        <input
          className="font-mono text-sm bg-surface border border-border text-text px-3 py-2 w-32 text-center tracking-[4px] uppercase focus:outline-none focus:border-gold"
          placeholder="CODE"
          maxLength={8}
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />
        <button
          className="font-title text-sm tracking-[3px] px-6 py-2 bg-transparent text-muted border border-border cursor-pointer hover:text-text hover:border-text transition-all"
          onClick={handleJoin}
          disabled={!joinCode.trim()}
        >
          JOIN ▶
        </button>
      </div>
    </div>
  );
}
