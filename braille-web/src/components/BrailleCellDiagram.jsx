import { getPatternForSymbol } from "../utils/braille";

// Menampilkan diagram fisik sel 6 titik (kolom kiri: 1-2-3, kolom kanan: 4-5-6).
export default function BrailleCellDiagram({ symbol = "", pattern = "", size = 56 }) {
  const resolved = pattern || getPatternForSymbol(symbol);
  const activeDots = new Set(String(resolved).split(""));

  const dots = [
    { num: "1", cx: 18, cy: 14 },
    { num: "2", cx: 18, cy: 32 },
    { num: "3", cx: 18, cy: 50 },
    { num: "4", cx: 42, cy: 14 },
    { num: "5", cx: 42, cy: 32 },
    { num: "6", cx: 42, cy: 50 },
  ];

  const h = Math.round((size / 60) * 64);

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 60 64"
      aria-label={`Sel Braille untuk simbol ${symbol || "kosong"}, titik aktif ${resolved || "tidak ada"}`}
      role="img"
      className="flex-none rounded-[14px] bg-[var(--surface-sunken)] p-1 shadow-[inset_0_0_0_1px_var(--border-subtle)]"
    >
      {dots.map((d) => {
        const isOn = activeDots.has(d.num);
        return (
          <g key={d.num}>
            <circle
              cx={d.cx}
              cy={d.cy}
              r={isOn ? 6.2 : 4}
              fill={isOn ? "var(--primary)" : "transparent"}
              stroke={isOn ? "var(--primary)" : "var(--text-muted)"}
              strokeOpacity={isOn ? "1" : "0.45"}
              strokeWidth={isOn ? "2" : "1.5"}
            />
          </g>
        );
      })}
    </svg>
  );
}
