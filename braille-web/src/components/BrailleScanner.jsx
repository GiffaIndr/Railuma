import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, Volume2, Download, FileText, TriangleAlert } from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { useA11y } from "../context/useA11y";
import { translateBrailleImage } from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";
import { speakText } from "../utils/speech";
import { createStabilizer } from "../utils/stabilizer";
import { exportToPDF, exportToTXT } from "../utils/exporter";
import Step from "./Step";

// status: idle | nocam | blur | loading | empty | error | done
export default function BrailleScanner() {
  const { videoRef, canvasRef, isCameraActive, cameraError, startCamera, stopCamera, captureFrame } = useCamera();
  const { announce } = useA11y();

  const [status, setStatus] = useState("idle");
  const [sharp, setSharp] = useState(0);
  const [text, setText] = useState("");
  const [auto, setAuto] = useState(false);
  const [pdfBlocked, setPdfBlocked] = useState(false);
  const [rawText, setRawText] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const stabRef = useRef(createStabilizer());

  const busyRef = useRef(false);
  const lastTextRef = useRef("");
  const scanRef = useRef(null);

  const scan = async (fromAuto = false) => {
    if (busyRef.current) return;

    if (!isCameraActive) {
      setStatus("nocam");
      return;
    }

    // 1. Cek ketajaman dulu. Jika buram, API TIDAK dipanggil.
    const s = measureSharpness(videoRef.current);
    setSharp(s.variance);
    if (s.ready && s.isBlurry) {
      setStatus("blur");
      return;
    }

    // 2. Gambar tajam: kirim ke API
    busyRef.current = true;
    if (!fromAuto) {
      setStatus("loading");
      announce("Memindai. Mohon tunggu.");
    }
    try {
      const blob = await captureFrame();
      if (!blob) throw new Error("Gagal mengambil gambar");
      const data = await translateBrailleImage(blob);
      if (data.status === "blurry") {
        // Server juga menolak gambar buram
        setSharp(data.sharpness ?? 0);
        setStatus("blur");
        return;
      }
      if (data.status !== "success") throw new Error(data.message || "Server gagal");

      const result = (data.final_text || "").trim();
      if (!result) {
        if (!fromAuto) setStatus("empty");
        else setStatus((prev) => (prev === "done" ? prev : "empty"));
        return;
      }
      // Pindai otomatis: pilih hasil yang paling sering muncul dari beberapa frame terakhir.
      // Pindai manual: tampilkan langsung.
      let shown = result;
      let ok = true;
      if (fromAuto) {
        const v = stabRef.current.push(result);
        shown = v.text;
        ok = v.confirmed;
      } else {
        stabRef.current.reset();
        stabRef.current.push(result);
      }
      setText(shown);
      setRawText((data.raw_text || "").trim());
      setConfirmed(ok);
      setStatus("done");
      if (ok && shown !== lastTextRef.current) {
        lastTextRef.current = shown;
        announce(`Hasil pindai: ${shown}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      setAuto(false); // hentikan pindai otomatis agar tidak mengulang error
    } finally {
      busyRef.current = false;
    }
  };
  useEffect(() => {
    scanRef.current = scan;
  });

  // Pindai otomatis: ulangi tiap 1,2 detik selama kamera dan pilihan aktif
  useEffect(() => {
    if (!auto || !isCameraActive) return undefined;
    const id = setInterval(() => scanRef.current?.(true), 1200);
    return () => clearInterval(id);
  }, [auto, isCameraActive]);

  // Setelah ada hasil atau peringatan, gulir otomatis agar langsung terlihat
  const resultRef = useRef(null);
  useEffect(() => {
    if (status === "idle" || status === "loading") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [status, text]);

  const turnOnCamera = async () => {
    const ok = await startCamera();
    if (ok) {
      stabRef.current.reset();
      setStatus("idle");
      announce("Kamera menyala. Arahkan kamera ke kertas Braille.");
    }
  };

  const turnOffCamera = () => {
    stopCamera();
    stabRef.current.reset();
    setAuto(false);
    setStatus("idle");
    announce("Kamera dimatikan.");
  };

  const saveTxt = () => {
    exportToTXT(text, "Hasil_Pindai_Braille.txt");
    announce("File teks disimpan.");
  };

  const savePdf = () => {
    const ok = exportToPDF(text, "", "Hasil Pindai Braille");
    setPdfBlocked(!ok);
    announce(ok ? "Jendela cetak dibuka. Pilih Simpan sebagai PDF." : "Jendela cetak diblokir browser.");
  };

  return (
    <ol className="m-0 flex list-none flex-col gap-6 p-0">
      <Step number={1} title="Arahkan kamera, lalu pindai">
        <div className="flex aspect-video max-h-[50vh] w-full items-center justify-center overflow-hidden rounded-[20px] border-[3px] border-deep bg-ink">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Pratinjau kamera"
            className={`h-full w-full object-contain ${isCameraActive ? "block" : "hidden"}`}
          />
          {!isCameraActive && (
            <span className="flex items-center gap-3 px-4 text-center font-bold text-cream">
              <CameraOff size={32} aria-hidden="true" /> Kamera belum menyala
            </span>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        {cameraError && (
          <div role="alert" className="alert-box">
            <strong>Peringatan.</strong> {cameraError}
          </div>
        )}

        {/* Satu tombol utama di tempat yang sama: Nyalakan kamera, lalu Pindai sekarang */}
        {isCameraActive ? (
          <button type="button" className="btn btn-primary" onClick={() => scan(false)} disabled={status === "loading"}>
            <ScanLine size={24} aria-hidden="true" /> {status === "loading" ? "Memindai..." : "Pindai sekarang"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={turnOnCamera}>
            <Camera size={24} aria-hidden="true" /> Nyalakan kamera
          </button>
        )}

        <p className="m-0 text-[0.9rem] text-muted">
          Pegang kertas sekitar satu jengkal dari kamera. Jika gambar buram atau terlalu dekat, pemindaian ditolak dan
          tidak ada data yang dikirim.
        </p>

        {isCameraActive && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-7 w-7 accent-ink"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  announce(e.target.checked ? "Pindai otomatis menyala." : "Pindai otomatis mati.");
                }}
              />
              <span>Pindai otomatis (ulangi sendiri)</span>
            </label>
            <button type="button" className="btn btn-secondary" onClick={turnOffCamera}>
              <CameraOff size={24} aria-hidden="true" /> Matikan kamera
            </button>
          </div>
        )}
      </Step>

      <Step number={2} title="Hasil">
        <div ref={resultRef} className="flex flex-col gap-4">
          {status === "idle" && <p className="m-0 text-muted">Belum ada hasil. Nyalakan kamera, lalu tekan Pindai sekarang.</p>}

          {status === "loading" && <p className="m-0 font-bold">Sedang memindai. Mohon tunggu.</p>}

          {status === "nocam" && (
            <div role="alert" className="alert-box">
              <p className="m-0 flex items-start gap-3">
                <TriangleAlert size={28} className="flex-none" aria-hidden="true" />
                <span>
                  <strong>Peringatan.</strong> Kamera belum menyala. Tekan Nyalakan kamera di langkah 1.
                </span>
              </p>
            </div>
          )}

          {status === "blur" && (
            <div role="alert" className="alert-box">
              <p className="m-0 flex items-start gap-3">
                <TriangleAlert size={28} className="flex-none" aria-hidden="true" />
                <span>
                  <strong>Gambar buram atau kamera terlalu dekat.</strong> Jauhkan kamera sedikit, lalu pindai lagi.
                  Pindai ditolak. Tidak ada data yang dikirim.
                </span>
              </p>
              <p className="m-0 mt-3 font-bold">
                Ketajaman: {sharpnessLabel(sharp)} ({sharp} dari minimal {BLUR_MIN})
              </p>
            </div>
          )}

          {status === "empty" && (
            <div role="alert" className="alert-box">
              <strong>Tidak ada Braille yang terbaca.</strong> Dekatkan kertas sedikit dan pastikan cahaya cukup.
            </div>
          )}

          {status === "error" && (
            <div role="alert" className="alert-box">
              <strong>Peringatan.</strong> Tidak bisa menghubungi server. Periksa koneksi internet atau minta bantuan
              pengelola aplikasi.
            </div>
          )}

          {status === "done" && (
            <>
              <div className="ok-box">
                <p className="m-0 mb-2 font-bold">Teks hasil pindai</p>
                <textarea
                  readOnly
                  aria-label="Teks hasil pindai"
                  value={text}
                  rows={4}
                  className="field text-[1.3rem] font-bold"
                />
                {!confirmed && (
                  <p className="m-0 mt-3 text-[0.9rem]">
                    Memastikan hasil. Tahan kamera tetap stabil beberapa detik.
                  </p>
                )}
                {rawText && rawText !== text && (
                  <details className="mt-3 text-[0.9rem]">
                    <summary>Teks mentah sebelum koreksi kata</summary>
                    <p className="m-0 mt-2 whitespace-pre-wrap">{rawText}</p>
                  </details>
                )}
                <p className="m-0 mt-3 text-[0.9rem]">
                  Ketajaman: {sharpnessLabel(sharp)} ({sharp})
                </p>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => speakText(text)}>
                <Volume2 size={24} aria-hidden="true" /> Bacakan hasil
              </button>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button type="button" className="btn btn-secondary" onClick={saveTxt}>
                  <FileText size={24} aria-hidden="true" /> Simpan sebagai teks
                </button>
                <button type="button" className="btn btn-secondary" onClick={savePdf}>
                  <Download size={24} aria-hidden="true" /> Simpan sebagai PDF
                </button>
              </div>
              {pdfBlocked && (
                <div role="alert" className="alert-box">
                  Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.
                </div>
              )}
            </>
          )}
        </div>
      </Step>
    </ol>
  );
}
