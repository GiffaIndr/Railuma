import { useRef, useState } from "react";
import { Mic, MicOff, Volume2, Download, FileText, Trash2, TriangleAlert } from "lucide-react";
import { useA11y } from "../context/useA11y";
import { exportToPDF, exportToTXT } from "../utils/exporter";
import { speakText } from "../utils/speech";
import Step from "./Step";

// Kamus teks ke Braille Unicode (Grade 1 sederhana)
const brailleDict = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
  k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
  u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
  1: "⠼⠁", 2: "⠼⠃", 3: "⠼⠉", 4: "⠼⠙", 5: "⠼⠑", 6: "⠼⠋", 7: "⠼⠛", 8: "⠼⠓", 9: "⠼⠊", 0: "⠼⠚",
  " ": " ", ",": "⠂", ".": "⠲", "?": "⠦", "!": "⠖", "\n": "\n",
};

const textToBraille = (text) =>
  text
    .toLowerCase()
    .split("")
    .map((c) => brailleDict[c] || c)
    .join("");

export default function VoiceTranslator() {
  const { announce } = useA11y();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [format, setFormat] = useState("normal"); // normal | reglet
  const [micError, setMicError] = useState("");
  const [pdfBlocked, setPdfBlocked] = useState(false);
  const recRef = useRef(null);

  const isReglet = format === "reglet";
  const braille = textToBraille(text);
  // Reglet: urutan dibalik dan tiap karakter dicerminkan (untuk menulis dengan reglet)
  const shown = isReglet ? [...braille].reverse().join("") : braille;
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
      setMicError("Browser ini belum mendukung pengenalan suara. Gunakan Chrome atau Edge, atau ketik teksnya.");
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
      if (finalText) setText((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
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
    announce(ok ? "Jendela cetak dibuka. Pilih Simpan sebagai PDF." : "Jendela cetak diblokir browser.");
  };

  return (
    <ol className="m-0 flex list-none flex-col gap-6 p-0">
      <Step number={1} title="Ucapkan atau ketik kalimat">
        <button
          type="button"
          className={`btn ${listening ? "mic-live" : "btn-primary"}`}
          onClick={toggleMic}
          aria-pressed={listening}
        >
          {listening ? <MicOff size={24} aria-hidden="true" /> : <Mic size={24} aria-hidden="true" />}
          {listening ? "Berhenti bicara" : "Mulai bicara"}
        </button>

        {micError && (
          <div role="alert" className="alert-box">
            <p className="m-0 flex items-start gap-3">
              <TriangleAlert size={28} className="flex-none" aria-hidden="true" />
              <span>
                <strong>Peringatan.</strong> {micError}
              </span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="teks" className="font-bold">
            Teks
          </label>
          <textarea id="teks" rows={4} value={text} onChange={(e) => setText(e.target.value)} className="field" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button type="button" className="btn btn-secondary" disabled={!hasText} onClick={() => speakText(text)}>
            <Volume2 size={24} aria-hidden="true" /> Bacakan teks
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
            <Trash2 size={24} aria-hidden="true" /> Hapus teks
          </button>
        </div>
      </Step>

      <Step number={2} title="Pilih format Braille">
        <fieldset className="m-0 flex flex-col gap-3.5 border-0 p-0">
          <legend className="mb-3 font-bold">Format Braille</legend>
          <label className="radio-card">
            <input type="radio" name="format" value="normal" checked={!isReglet} onChange={() => pick("normal", "Braille biasa")} />
            <span>
              <strong>Braille biasa</strong>
              <br />
              <span className="text-[0.9rem] text-muted">Dibaca dari kiri ke kanan, seperti hasil cetak.</span>
            </span>
          </label>
          <label className="radio-card">
            <input type="radio" name="format" value="reglet" checked={isReglet} onChange={() => pick("reglet", "Reglet terbalik")} />
            <span>
              <strong>Reglet (terbalik)</strong>
              <br />
              <span className="text-[0.9rem] text-muted">Dicerminkan, untuk menulis sendiri dengan reglet dari kanan ke kiri.</span>
            </span>
          </label>
        </fieldset>
        <p className="m-0 text-[0.9rem] text-muted">Pindah pilihan dengan tombol <kbd>↑</kbd> <kbd>↓</kbd>.</p>
      </Step>

      <Step number={3} title="Hasil dan simpan">
        {hasText ? (
          <>
            <p className="sr-only">
              Braille sudah dibuat untuk {text.length} karakter, format {isReglet ? "Reglet terbalik" : "Braille biasa"}.
              Tekan Simpan sebagai PDF untuk mendapatkan hasilnya.
            </p>
            <div
              aria-hidden="true"
              className={`ok-box flex flex-wrap break-all text-[2.2rem] leading-[1.6] tracking-[0.2em] ${
                isReglet ? "justify-end" : "justify-start"
              }`}
            >
              {[...shown].map((c, i) =>
                c === "\n" ? (
                  <span key={i} className="basis-full" />
                ) : (
                  <span key={i} className={`inline-block ${isReglet ? "scale-x-[-1]" : ""}`}>
                    {c === " " ? "  " : c}
                  </span>
                ),
              )}
            </div>
          </>
        ) : (
          <p className="m-0 text-muted">Belum ada hasil. Ucapkan atau ketik kalimat di langkah 1.</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasText}
            onClick={savePdf}
          >
            <Download size={24} aria-hidden="true" /> Simpan sebagai PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasText}
            onClick={() => {
              exportToTXT(`Teks asli: ${text}\nBraille (${isReglet ? "Reglet" : "biasa"}): ${shown}`, "Hasil_Suara_Braille.txt");
              announce("File teks disimpan.");
            }}
          >
            <FileText size={24} aria-hidden="true" /> Simpan sebagai teks
          </button>
        </div>
        {pdfBlocked && (
          <div role="alert" className="alert-box">
            Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.
          </div>
        )}
      </Step>
    </ol>
  );
}
