import type { ConnectionState } from "../hooks/useRoomConnection";

interface Props {
  state: ConnectionState;
  roomCode: string | null;
  onCancel: () => void;
}

const STATUS: Partial<Record<ConnectionState, string>> = {
  creating: "CREATING ROOM…",
  waiting:  "WAITING FOR OPPONENT",
  joining:  "CONNECTING…",
};

export function WaitingScreen({ state, roomCode, onCancel }: Props) {
  return (
    <div className="text-center flex flex-col items-center gap-6">
      <div className="font-title text-7xl tracking-widest leading-none">
        <span className="text-red">HAND</span>{" "}
        <span className="text-blue">FIGHT</span>
      </div>

      <div className="font-mono text-xs tracking-[6px] text-muted animate-pulse">
        {STATUS[state] ?? "PLEASE WAIT…"}
      </div>

      {/* Room code — only shown when waiting (room was created) */}
      {state === "waiting" && roomCode && (
        <div className="flex flex-col items-center gap-2">
          <div className="font-mono text-[10px] tracking-[4px] text-muted">
            SHARE THIS CODE
          </div>
          <div
            className="font-title text-5xl tracking-[12px] text-gold border border-gold px-8 py-3 select-all"
            style={{ letterSpacing: "0.35em" }}
          >
            {roomCode}
          </div>
          <div className="font-mono text-[9px] text-muted tracking-widest">
            CLICK TO SELECT · SHARE WITH OPPONENT
          </div>
        </div>
      )}

      <button
        className="font-title text-sm tracking-[3px] px-8 py-2 bg-transparent text-muted border border-border cursor-pointer hover:text-text transition-all mt-2"
        onClick={onCancel}
      >
        ← CANCEL
      </button>
    </div>
  );
}
