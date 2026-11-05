// Satu kartu langkah. Dipakai di dalam <ol> supaya urutan terbaca jelas.
export default function Step({ number, title, children }) {
  return (
    <li className="card flex flex-col gap-5">
      <h3 className="m-0 text-[1.2rem] font-bold leading-tight">
        <span className="text-muted">Langkah {number}: </span>
        {title}
      </h3>
      {children}
    </li>
  );
}
