import { useRef, useState } from "react";
import { ScanLine, ClipboardCheck, Mic } from "lucide-react";

import BrailleScanner from "./components/BrailleScanner";
import HomeworkCorrector from "./components/HomeworkCorrector";
import VoiceTranslator from "./components/VoiceTranslator";
import { CLAHE_KEY, isClaheOn } from "./services/api";
import { A11yProvider } from "./context/A11yProvider";
import { useA11y } from "./context/useA11y";

const TABS = [
  { id: "scan", label: "Pemindai Braille", hint: "Baca kertas Braille dengan kamera", Icon: ScanLine, Panel: BrailleScanner },
  { id: "check", label: "Koreksi Tugas", hint: "Beri nilai tugas Braille murid", Icon: ClipboardCheck, Panel: HomeworkCorrector },
  { id: "voice", label: "Suara ke Braille", hint: "Ubah ucapan menjadi Braille", Icon: Mic, Panel: VoiceTranslator },
];

function Shell() {
  const { message, announce, voiceOn, setVoiceOn } = useA11y();
  const [active, setActive] = useState(0);
  const [clahe, setClahe] = useState(isClaheOn);
  const tabRefs = useRef([]);

  const goTo = (index) => {
    const next = (index + TABS.length) % TABS.length;
    setActive(next);
    announce(`${TABS[next].label} dipilih. ${TABS[next].hint}.`);
    // Pindahkan fokus ke tab baru supaya posisi kursor ikut berpindah
    setTimeout(() => tabRefs.current[next]?.focus(), 0);
  };

  const onTabKey = (e) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        goTo(active + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        goTo(active - 1);
        break;
      case "Home":
        e.preventDefault();
        goTo(0);
        break;
      case "End":
        e.preventDefault();
        goTo(TABS.length - 1);
        break;
      default:
    }
  };

  const { Panel } = TABS[active];

  return (
    <div className="relative min-h-screen">
      <a className="skip-link" href="#isi">
        Lewati ke isi utama
      </a>

      <header className="border-b-4 border-ink bg-mint">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <rect width="48" height="48" rx="14" fill="#0A2A2B" />
              <circle cx="18" cy="13" r="4" fill="#FFF0C5" />
              <circle cx="30" cy="13" r="4" fill="#FFF0C5" fillOpacity=".3" />
              <circle cx="18" cy="24" r="4" fill="#FFF0C5" />
              <circle cx="30" cy="24" r="4" fill="#FFF0C5" fillOpacity=".3" />
              <circle cx="18" cy="35" r="4" fill="#FFF0C5" fillOpacity=".3" />
              <circle cx="30" cy="35" r="4" fill="#FF8C52" />
            </svg>
            <h1 className="m-0 text-[1.6rem] font-bold leading-tight">Railuma</h1>
          </div>
          <p className="m-0 text-[0.9rem] font-bold">Baca dan tulis Braille dengan kamera dan suara</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-[960px] flex-col gap-7 px-6 pb-20 pt-8">
        <p className="m-0 text-[1.1rem]">Ada tiga fitur. Pilih salah satu di bawah ini.</p>

        <nav aria-label="Pilih fitur" className="flex flex-col gap-3.5">
          <div role="tablist" aria-label="Fitur Railuma" onKeyDown={onTabKey} className="flex flex-wrap gap-3.5">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => (tabRefs.current[i] = el)}
                role="tab"
                id={`tab-${t.id}`}
                type="button"
                className="tab"
                aria-selected={i === active}
                aria-controls="panel"
                tabIndex={i === active ? 0 : -1}
                onClick={() => goTo(i)}
              >
                <span className="tab-icon">
                  <t.Icon size={28} aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[1.05rem] font-bold">{t.label}</span>
                  <span className="text-[0.85rem] text-muted">{t.hint}</span>
                  {i === active && <span className="text-[0.85rem] font-bold">Dipilih</span>}
                </span>
              </button>
            ))}
          </div>
          <p className="m-0 text-[0.9rem] text-muted">
            Pindah fitur: tekan <kbd>←</kbd> <kbd>→</kbd>. Lompat ke awal atau akhir: <kbd>Home</kbd> <kbd>End</kbd>.
            Masuk ke isi fitur: <kbd>Tab</kbd>.
          </p>
        </nav>

        <section aria-labelledby="judul-suara" className="card flex flex-col gap-3 !p-5">
          <h2 id="judul-suara" className="m-0 text-[0.95rem] font-bold text-muted">
            Pengumuman suara
          </h2>
          <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.6em] text-[1.05rem] font-bold">
            {message || "Belum ada pengumuman."}
          </div>
          <label className="flex items-center gap-3 text-[0.9rem]">
            <input
              type="checkbox"
              className="h-7 w-7 accent-ink"
              checked={clahe}
              onChange={(e) => {
                setClahe(e.target.checked);
                try {
                  localStorage.setItem(CLAHE_KEY, e.target.checked ? "1" : "0");
                } catch {
                  /* abaikan */
                }
                announce(e.target.checked ? "Ratakan cahaya foto menyala." : "Ratakan cahaya foto mati.");
              }}
            />
            <span>Ratakan cahaya foto (CLAHE). Coba nyalakan jika foto gelap atau berbayang.</span>
          </label>
          <label className="flex items-center gap-3 text-[0.9rem]">
            <input
              type="checkbox"
              className="h-7 w-7 accent-ink"
              checked={voiceOn}
              onChange={(e) => {
                setVoiceOn(e.target.checked);
              }}
            />
            <span>
              Bacakan pengumuman dengan suara aplikasi. Matikan jika sudah memakai pembaca layar.
            </span>
          </label>
        </section>

        <main id="isi" tabIndex={-1}>
          <section role="tabpanel" id="panel" aria-labelledby={`tab-${TABS[active].id}`}>
            <h2 className="mb-5 mt-0 text-[1.5rem] font-bold leading-tight">{TABS[active].label}</h2>
            <Panel />
          </section>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <A11yProvider>
      <Shell />
    </A11yProvider>
  );
}
