import { GAME } from "../game/constants";

interface BarProps {
  hp:    number;
  label: string;
  flip?: boolean;
  color: string;
}

function HpBar({ hp, label, flip = false, color }: BarProps) {
  const pct = Math.max(0, Math.min(100, (hp / GAME.MAX_HP) * 100));
  const barColor =
    pct > 60 ? "bg-green" :
    pct > 30 ? "bg-gold"  :
    "bg-red";

  return (
    <div className="flex flex-col gap-1" style={{ width: 200 }}>
      <div className={`font-mono text-[10px] tracking-[3px] ${color} ${flip ? "text-right" : "text-left"}`}>
        {label}
      </div>
      <div className={`relative w-full h-3 bg-surface2 border border-border overflow-hidden`}>
        <div
          className={`absolute inset-y-0 h-full ${barColor} transition-all duration-75`}
          style={{
            width: `${pct}%`,
            left:  flip ? "auto" : 0,
            right: flip ? 0      : "auto",
          }}
        />
      </div>
      <div className={`font-title text-sm tracking-[2px] ${color} ${flip ? "text-right" : "text-left"}`}>
        {Math.ceil(hp)}{" "}
        <span className="text-muted text-[10px]">HP</span>
      </div>
    </div>
  );
}

interface Props {
  localHp:  number;
  remoteHp: number;
}

export function HpBars({ localHp, remoteHp }: Props) {
  return (
    <div className="fixed top-4 left-0 right-0 flex justify-between items-start px-6 pointer-events-none z-20">
      <HpBar hp={localHp}  label="P1 · YOU"      color="text-red"  />
      <div className="font-title text-3xl tracking-widest text-muted self-center">VS</div>
      <HpBar hp={remoteHp} label="P2 · OPPONENT" color="text-blue" flip />
    </div>
  );
}
