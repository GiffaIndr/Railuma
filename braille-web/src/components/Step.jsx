// Satu kartu langkah berformat editorial Swiss di dalam <ol>.
export default function Step({ number, title, children }) {
  return (
    <li className="card flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] pb-3">
        <div className="flex items-center gap-3">
          <span className="index-badge" aria-hidden="true">
            {number}
          </span>
          <h3 className="m-0 text-[1.12rem] font-bold leading-tight">{title}</h3>
        </div>
        <span className="meta-mono text-muted-theme">LANGKAH 0{number}</span>
      </div>
      {children}
    </li>
  );
}
