import { useState, useEffect } from "react";
import { Camera, CheckCheck, Volume2, X, ArrowRight, ArrowLeft } from "lucide-react";

const TOUR_STORAGE_KEY = "railuma_onboarding_completed";

const STEPS = [
  {
    icon: Camera,
    title: "1. Arahkan Kamera ke Tulisan Braille",
    description:
      "Gunakan kamera laptop atau hubungkan kamera HP Anda. Pastikan lembar kertas Braille mendapatkan pencahayaan yang cukup dan tegak lurus terhadap kamera.",
    tip: "Tip: Tekan tombol 'Kamera HP' jika ingin memindai lembar kertas dari atas meja dengan nyaman.",
  },
  {
    icon: CheckCheck,
    title: "2. Verifikasi & Koreksi Sel 6-Titik",
    description:
      "Model visi komputer Railuma akan memetakan setiap sel 6-titik secara otomatis. Jika ada huruf yang pudar atau miring, sistem kamus KBBI 69.741 kata akan memberi saran koreksi.",
    tip: "Tip: Anda dapat mengetuk sel huruf mana pun untuk melihat alternatif karakter berjarak Hamming 1.",
  },
  {
    icon: Volume2,
    title: "3. Dengarkan Pembacaan & Kelola Sesi",
    description:
      "Hasil terjemahan dapat langsung dibacakan dengan suara sintesis atau dibaca pembaca layar. Seluruh hasil tersimpan rapi per sesi di akun Anda.",
    tip: "Tip: Tersedia juga konversi Suara ke Reglet untuk membantu penusukan stylus dari belakang kertas.",
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
  const StepIcon = step.icon;
  const isLast = currentStep === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0F1F36] border border-[#CBD5E1] dark:border-[#1E3A5F] rounded-2xl p-6 sm:p-8 shadow-2xl text-[#0B1C33] dark:text-[#EDF3FB]">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Tutup panduan pengenalan"
          className="absolute top-4 right-4 p-2 rounded-xl text-[#64748B] hover:text-[#0B1C33] dark:text-[#94A3B8] dark:hover:text-white hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#0E4D84] text-[#E6FF2E] flex items-center justify-center">
            <StepIcon className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#0E4D84] dark:text-[#38BDF8]">
              Langkah {currentStep + 1} dari {STEPS.length}
            </span>
            <div className="flex gap-1.5 mt-1">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentStep
                      ? "w-7 bg-[#0E4D84] dark:bg-[#38BDF8]"
                      : "w-2.5 bg-[#E2E8F0] dark:bg-[#334155]"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <h2 id="tour-title" className="text-lg sm:text-xl font-bold mb-2">
          {step.title}
        </h2>

        <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed mb-4">
          {step.description}
        </p>

        <div className="p-3.5 rounded-xl bg-[#F0FDF4] dark:bg-[#064E3B]/30 border border-[#BBF7D0] dark:border-[#059669]/40 text-[#166534] dark:text-[#86EFAC] text-xs leading-relaxed mb-6 font-medium">
          {step.tip}
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0] dark:border-[#1E3A5F]">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] hover:text-[#0B1C33] dark:hover:text-white px-3 py-2 transition-colors min-h-[44px]"
          >
            Lewati Panduan
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-medium hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] transition-colors min-h-[44px]"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Sebelumnya
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
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0E4D84] hover:bg-[#09355C] text-white text-xs font-semibold transition-colors min-h-[44px]"
            >
              {isLast ? "Mulai Menggunakan Railuma" : "Lanjutkan"}
              {!isLast && <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
