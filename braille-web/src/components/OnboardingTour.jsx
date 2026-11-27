import { useState, useEffect } from "react";
import { X, ArrowRight, ArrowLeft, Check } from "lucide-react";

const TOUR_STORAGE_KEY = "railuma_onboarding_completed";

function LightingDiagram() {
  return (
    <svg
      viewBox="0 0 440 130"
      className="w-full h-auto rounded-xl border border-[var(--border-subtle)] bg-[#08182E]"
      role="img"
      aria-label="Diagram sudut cahaya samping 30 sampai 45 derajat pada kertas Braille"
    >
      {/* Sisi Kiri: Cahaya Samping (Direkomendasikan) */}
      <g transform="translate(16, 14)">
        <text x="0" y="14" fill="#E6FF2E" fontSize="11" fontWeight="700">
          Cahaya Samping 30-45° (Ideal)
        </text>
        {/* Sumber Cahaya Miring */}
        <circle cx="24" cy="42" r="10" fill="#E6FF2E" />
        <line x1="38" y1="48" x2="88" y2="74" stroke="#E6FF2E" strokeWidth="2" strokeDasharray="4 3" />
        <line x1="35" y1="56" x2="76" y2="78" stroke="#E6FF2E" strokeWidth="1.5" strokeDasharray="4 3" />
        {/* Permukaan Kertas */}
        <line x1="12" y1="88" x2="188" y2="88" stroke="#9EB3D1" strokeWidth="2" />
        {/* Titik Timbul & Bayangan Tegas */}
        <path d="M 88 88 Q 98 72 108 88" fill="#EDF3FB" />
        <ellipse cx="116" cy="88" rx="9" ry="3" fill="#E6FF2E" opacity="0.85" />
        <path d="M 134 88 Q 144 72 154 88" fill="#EDF3FB" />
        <ellipse cx="162" cy="88" rx="9" ry="3" fill="#E6FF2E" opacity="0.85" />
        <text x="12" y="104" fill="#EDF3FB" fontSize="10">
          Bayangan titik kontras &amp; terbaca tajam
        </text>
      </g>

      <line x1="220" y1="14" x2="220" y2="116" stroke="#1E3A5F" strokeWidth="1" />

      {/* Sisi Kanan: Cahaya Tegak Lurus (Hindari) */}
      <g transform="translate(232, 14)">
        <text x="4" y="14" fill="#9EB3D1" fontSize="11" fontWeight="700">
          Cahaya Tegak Lurus 90° (Kurang)
        </text>
        <circle cx="96" cy="34" r="9" fill="#9EB3D1" />
        <line x1="96" y1="47" x2="96" y2="72" stroke="#9EB3D1" strokeWidth="1.5" strokeDasharray="3 3" />
        <line x1="8" y1="88" x2="188" y2="88" stroke="#9EB3D1" strokeWidth="2" />
        <path d="M 62 88 Q 72 73 82 88" fill="#64748B" />
        <path d="M 110 88 Q 120 73 130 88" fill="#64748B" />
        <text x="8" y="104" fill="#9EB3D1" fontSize="9.5">
          Tanpa bayangan, titik sulit dibedakan
        </text>
      </g>
    </svg>
  );
}

function VerificationFlowDiagram() {
  return (
    <div
      role="img"
      aria-label="Alur 3 tahap: Tangkap pratinjau, verifikasi sel, lalu simpan ke sesi"
      className="rounded-xl border border-[var(--border-subtle)] bg-[#08182E] p-3.5 sm:p-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
        {/* Langkah 1 */}
        <div className="flex flex-col justify-between rounded-xl bg-[#0F1F36] border border-[#1E3A5F] p-3 text-left">
          <div>
            <span className="block text-[0.8rem] font-bold text-[#E6FF2E]">
              1. Tangkap Citra
            </span>
            <p className="m-0 mt-1 text-[0.76rem] leading-snug text-[#EDF3FB]">
              Hasil masuk sebagai <strong>Pratinjau (Draft)</strong>
            </p>
          </div>
          <span className="mt-2 block text-[0.7rem] font-medium text-[#9EB3D1]">
            Database tetap bersih
          </span>
        </div>

        {/* Langkah 2 */}
        <div className="flex flex-col justify-between rounded-xl bg-[#0F1F36] border-2 border-[#E6FF2E] p-3 text-left">
          <div>
            <span className="block text-[0.8rem] font-bold text-[#E6FF2E]">
              2. Verifikasi Sel
            </span>
            <p className="m-0 mt-1 text-[0.76rem] leading-snug text-[#EDF3FB]">
              Setujui &amp; kunci huruf atau pilih alternatif
            </p>
          </div>
          <span className="mt-2 block text-[0.7rem] font-medium text-[#9EB3D1]">
            Bisa kembali ke huruf awal
          </span>
        </div>

        {/* Langkah 3 */}
        <div className="flex flex-col justify-between rounded-xl bg-[#064E3B] border border-[#34D399] p-3 text-left">
          <div>
            <span className="block text-[0.8rem] font-bold text-white">
              3. Simpan Sesi
            </span>
            <p className="m-0 mt-1 text-[0.76rem] leading-snug text-[#D1FAE5]">
              Klik tombol hijau <strong className="text-white">Simpan ke Sesi Ini</strong>
            </p>
          </div>
          <span className="mt-2 block text-[0.7rem] font-medium text-[#A7F3D0]">
            Tercatat permanen
          </span>
        </div>
      </div>
    </div>
  );
}

function RegletDiagram() {
  return (
    <svg
      viewBox="0 0 440 124"
      className="w-full h-auto rounded-xl border border-[var(--border-subtle)] bg-[#08182E]"
      role="img"
      aria-label="Perbandingan pola titik Braille normal dan mode cermin Reglet"
    >
      {/* Baca Normal */}
      <g transform="translate(24, 16)">
        <text x="0" y="14" fill="#EDF3FB" fontSize="11" fontWeight="700">
          Baca Normal (Depan Kertas)
        </text>
        <text x="0" y="30" fill="#9EB3D1" fontSize="10">
          Huruf &ldquo;B&rdquo; (Titik 1 &amp; 2 di Kiri)
        </text>
        <rect x="0" y="40" width="54" height="56" rx="8" fill="#0F1F36" stroke="#1E3A5F" />
        <circle cx="17" cy="54" r="5" fill="#E6FF2E" />
        <circle cx="17" cy="68" r="5" fill="#E6FF2E" />
        <circle cx="17" cy="82" r="4" fill="#334155" />
        <circle cx="37" cy="54" r="4" fill="#334155" />
        <circle cx="37" cy="68" r="4" fill="#334155" />
        <circle cx="37" cy="82" r="4" fill="#334155" />
      </g>

      <line x1="220" y1="16" x2="220" y2="108" stroke="#1E3A5F" strokeWidth="1" />

      {/* Mode Reglet */}
      <g transform="translate(240, 16)">
        <text x="0" y="14" fill="#E6FF2E" fontSize="11" fontWeight="700">
          Tusuk Reglet (Belakang Kertas)
        </text>
        <text x="0" y="30" fill="#9EB3D1" fontSize="10">
          Ditusuk Cermin (Kanan ke Kiri)
        </text>
        <rect x="0" y="40" width="54" height="56" rx="8" fill="#0F1F36" stroke="#E6FF2E" />
        <circle cx="17" cy="54" r="4" fill="#334155" />
        <circle cx="17" cy="68" r="4" fill="#334155" />
        <circle cx="17" cy="82" r="4" fill="#334155" />
        <circle cx="37" cy="54" r="5" fill="#E6FF2E" />
        <circle cx="37" cy="68" r="5" fill="#E6FF2E" />
        <circle cx="37" cy="82" r="4" fill="#334155" />
      </g>
    </svg>
  );
}

const STEPS = [
  {
    tabLabel: "1. Kamera & Cahaya",
    title: "Pencahayaan Samping & Pemilihan Sumber Gambar",
    Diagram: LightingDiagram,
    points: [
      {
        label: "Kamera Perangkat",
        text: "Gunakan langsung kamera belakang saat membuka Railuma di HP, atau webcam saat membuka di laptop.",
      },
      {
        label: "Mirror Kamera HP",
        text: "Khusus pengguna laptop yang ingin menjadikan HP sebagai kamera dokumen nirkabel di atas meja.",
      },
      {
        label: "Unggah Foto",
        text: "Mengubah kotak tengah menjadi area tarik-dan-lepas (dropzone) untuk memindai foto lembar Braille.",
      },
    ],
  },
  {
    tabLabel: "2. Tangkap & Verifikasi",
    title: "Tangkap Pratinjau Dulu, Verifikasi, Baru Simpan",
    Diagram: VerificationFlowDiagram,
    points: [
      {
        label: "Pratinjau Tanpa Mengotori Sesi",
        text: "Setiap tangkapan masuk ke panel kanan sebagai draf pratinjau dan belum ditulis ke database sampai Anda menekan Simpan ke Sesi Ini.",
      },
      {
        label: "Kunci Huruf & Pulihkan Huruf Awal",
        text: "Di tab Alternatif, huruf yang sudah Anda setujui akan dikunci agar tidak terganti tanpa sengaja. Jika salah pilih, tombol Kembalikan ke Huruf Awal selalu tersedia.",
      },
    ],
  },
  {
    tabLabel: "3. Reglet & Evaluasi",
    title: "Koreksi Tugas Siswa & Panduan Tusuk Reglet",
    Diagram: RegletDiagram,
    points: [
      {
        label: "Koreksi Tugas Otomatis",
        text: "Unggah foto lembar Braille siswa dan masukkan kunci jawaban guru untuk melihat perbandingan karakter serta rincian sel yang keliru.",
      },
      {
        label: "Teks/Suara ke Braille & Reglet",
        text: "Ubah ketikan atau dikte suara menjadi titik Braille bacaan normal maupun mode cermin kanan-ke-kiri untuk penusukan stylus dari belakang kertas.",
      },
    ],
  },
];

export default function OnboardingTour({ isOpen, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        handleDismiss();
      } else if (e.key === "ArrowRight") {
        if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
      } else if (e.key === "ArrowLeft") {
        if (currentStep > 0) setCurrentStep((s) => s - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // abaikan
    }
    if (onClose) onClose();
  };

  const step = STEPS[currentStep];
  const StepDiagram = step.Diagram;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      onClick={handleDismiss}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/65"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[580px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-7 text-[var(--text)] shadow-2xl flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
          <h2 id="tour-title" className="m-0 text-[1.18rem] sm:text-[1.3rem] font-extrabold tracking-tight">
            {step.title}
          </h2>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Tutup panduan"
            className="btn btn-secondary btn-sm !h-9 !w-9 !p-0 flex-none"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Navigasi Tab Langkah Langsung */}
        <div className="segmented-bar w-full flex" role="tablist" aria-label="Topik panduan pemakaian">
          {STEPS.map((s, idx) => (
            <button
              key={s.tabLabel}
              type="button"
              role="tab"
              aria-selected={currentStep === idx}
              onClick={() => setCurrentStep(idx)}
              className="segmented-item flex-1 !min-w-0 !px-2 !py-1.5 text-center truncate text-[0.78rem]"
            >
              {s.tabLabel}
            </button>
          ))}
        </div>

        {/* Diagram Teknis Solid */}
        <StepDiagram />

        {/* Daftar Poin Ringkas Tanpa Tumpukan Kartu */}
        <dl className="m-0 flex flex-col gap-2.5 divide-y divide-[var(--border-subtle)] text-[0.86rem]">
          {step.points.map((pt) => (
            <div key={pt.label} className="pt-2.5 first:pt-0">
              <dt className="font-bold text-[var(--text)]">{pt.label}</dt>
              <dd className="m-0 mt-0.5 text-muted-theme leading-relaxed">{pt.text}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-secondary btn-sm"
          >
            Tutup Panduan
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="btn btn-secondary btn-sm"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Sebelumnya</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  handleDismiss();
                } else {
                  setCurrentStep((s) => s + 1);
                }
              }}
              className="btn btn-primary btn-sm"
            >
              <span>{isLast ? "Selesai & Mulai" : "Topik Berikutnya"}</span>
              {isLast ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <ArrowRight size={15} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
