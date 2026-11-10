import { useRef, useState } from "react";
import { Download, FileText, Mic, MicOff, Trash2, TriangleAlert, Volume2 } from "lucide-react";
import { useA11y } from "../context/useA11y";
import { exportToPDF, exportToTXT } from "../utils/exporter";
import { speakText } from "../utils/speech";
import { reverseLinesForReglet, textToBraille } from "../utils/braille";

export default function VoiceTranslator() {
  const { announce } = useA11y();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [format, setFormat] = useState("normal");
  const [micError, setMicError] = useState("");
  const [pdfBlocked, setPdfBlocked] = useState(false);
  const recRef = useRef(null);

  const isReglet = format === "reglet";
  const braille = textToBraille(text);
  const shown = isReglet ? reverseLinesForReglet(braille) : braille;
  const hasText = text.trim() !== "";

  const toggleMic = () => {
    setMicError("");
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      announce("Berhenti mendengarkan.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicError(
        "Browser ini belum mendukung pengenalan suara. Gunakan Chrome atau Edge, atau ketik teksnya.",
      );
      return;
    }
    const rec = new SR();
    rec.lang = "id-ID";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText)
        setText((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
    };
    rec.onerror = (event) => {
      setListening(false);
      setMicError(
        event.error === "not-allowed"
          ? "Mikrofon belum diizinkan. Izinkan akses mikrofon di browser, lalu coba lagi."
          : "Suara tidak bisa dikenali. Coba lagi atau ketik teksnya.",
      );
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    announce("Mendengarkan. Silakan bicara.");
  };

  const pick = (value, label) => {
    setFormat(value);
    announce(`Format ${label} dipilih.`);
  };

  const savePdf = () => {
    const ok = exportToPDF(shown, text, "Hasil Suara ke Braille", isReglet);
    setPdfBlocked(!ok);
    announce(
      ok
        ? "Jendela cetak dibuka. Pilih Simpan sebagai PDF."
        : "Jendela cetak diblokir browser.",
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Kolom Kiri (6/12): Input Suara/Teks & Pilihan Format */}
      <div className="flex flex-col gap-5 lg:col-span-6">
        <section aria-labelledby="judul-input-konversi" className="card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <h2 id="judul-input-konversi" className="m-0 text-[1.08rem] font-bold">
              1. Ucapkan atau Ketik Kalimat
            </h2>
            <span className="status-chip">Bahasa Indonesia</span>
          </div>

          <button
            type="button"
            className={`btn w-full ${listening ? "mic-live" : "btn-primary"}`}
            onClick={toggleMic}
            aria-pressed={listening}
          >
            {listening ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            <span>{listening ? "Berhenti Bicara" : "Mulai Dikte Suara"}</span>
          </button>

          {micError && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <p className="m-0 flex items-start gap-2.5">
                <TriangleAlert size={18} className="mt-0.5 flex-none" aria-hidden="true" />
                <span>
                  <strong>Peringatan:</strong> {micError}
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="teks" className="text-[0.88rem] font-semibold">
              Teks Masukan
            </label>
            <textarea
              id="teks"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ketik kalimat atau angka di sini..."
              className="field"
            />
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasText}
              onClick={() => speakText(text)}
            >
              <Volume2 size={18} aria-hidden="true" />
              <span>Bacakan Teks</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasText}
              onClick={() => {
                setText("");
                announce("Teks dihapus.");
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
              <span>Hapus Teks</span>
            </button>
          </div>
        </section>

        <section aria-labelledby="judul-format-braille" className="card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <h2 id="judul-format-braille" className="m-0 text-[1.08rem] font-bold">
              2. Pilih Format Titik Braille
            </h2>
            <span className="status-chip">Baca vs Tusuk Stylus</span>
          </div>

          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Format Braille</legend>
            <label className="radio-card">
              <input
                type="radio"
                name="format"
                value="normal"
                checked={!isReglet}
                onChange={() => pick("normal", "Braille biasa")}
              />
              <span>
                <strong>Braille Biasa (Kiri ke Kanan)</strong>
                <br />
                <span className="text-[0.86rem] text-muted-theme">
                  Urutan baca standar dari kiri ke kanan, cocok untuk layar dan embosser.
                </span>
              </span>
            </label>

            <label className="radio-card">
              <input
                type="radio"
                name="format"
                value="reglet"
                checked={isReglet}
                onChange={() => pick("reglet", "Reglet terbalik")}
              />
              <span>
                <strong>Reglet (Terbalik per Baris)</strong>
                <br />
                <span className="text-[0.86rem] text-muted-theme">
                  Dicerminkan per baris untuk panduan menusuk stylus Reglet dari belakang kertas.
                </span>
              </span>
            </label>
          </fieldset>
        </section>
      </div>

      {/* Kolom Kanan (6/12): Panel Hasil Konversi & Ekspor Lengket */}
      <aside
        aria-labelledby="judul-hasil-konversi"
        className="card flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-6"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <h2 id="judul-hasil-konversi" className="m-0 text-[1.08rem] font-bold">
            3. Hasil Pola Braille &amp; Ekspor
          </h2>
          <span className="status-chip">
            {isReglet ? "Mode Reglet" : "Mode Standar"} · {text.length} karakter
          </span>
        </div>

        {hasText ? (
          <>
            <p className="sr-only">
              Braille sudah dibuat untuk {text.length} karakter, format{" "}
              {isReglet ? "Reglet terbalik" : "Braille biasa"}. Tekan Simpan sebagai PDF untuk
              mendapatkan hasilnya.
            </p>
            <div
              aria-hidden="true"
              className={`surface-subtle flex min-h-[160px] flex-wrap break-all p-5 text-[2.1rem] leading-[1.6] tracking-[0.18em] ${
                isReglet ? "justify-end" : "justify-start"
              }`}
            >
              {[...shown].map((c, i) =>
                c === "\n" ? (
                  <span key={i} className="basis-full" />
                ) : (
                  <span key={i} className={`inline-block ${isReglet ? "scale-x-[-1]" : ""}`}>
                    {c === " " ? "\u00A0\u00A0" : c}
                  </span>
                ),
              )}
            </div>
          </>
        ) : (
          <div className="surface-subtle flex min-h-[160px] items-center justify-center p-5 text-center text-[0.9rem] text-muted-theme">
            Belum ada hasil konversi. Ucapkan atau ketik kalimat di kolom kiri.
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasText}
            onClick={savePdf}
          >
            <Download size={18} aria-hidden="true" />
            <span>Simpan sebagai PDF</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasText}
            onClick={() => {
              exportToTXT(
                `Teks asli: ${text}\nBraille (${isReglet ? "Reglet" : "biasa"}): ${shown}`,
                "Hasil_Suara_Braille.txt",
              );
              announce("Berkas teks disimpan.");
            }}
          >
            <FileText size={18} aria-hidden="true" />
            <span>Simpan sebagai TXT</span>
          </button>
        </div>

        {pdfBlocked && (
          <div role="alert" className="alert-box text-[0.88rem]">
            Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.
          </div>
        )}
      </aside>
    </div>
  );
}
