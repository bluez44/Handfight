interface Props {
  percent: number;
}

export function LoadingScreen({ percent }: Props) {
  const isReady = percent === 100;
  const statusText = isReady
    ? "Sẵn sàng!"
    : `Đang khởi động... ${percent}%`;

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
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="font-mono text-xs text-muted tracking-wide">
        {statusText}
      </div>
    </div>
  );
}
