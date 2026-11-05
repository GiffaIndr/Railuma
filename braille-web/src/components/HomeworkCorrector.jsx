import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ClipboardCheck, Upload, Volume2, TriangleAlert } from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { useA11y } from "../context/useA11y";
import { translateBrailleImage } from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";
import { joinIndonesian, speakText } from "../utils/speech";
import { gradeAnswers } from "../utils/grade";
import Step from "./Step";

// status: idle | nokey | nocam | blur | loading | empty | error | done
export default function HomeworkCorrector() {
  const { videoRef, canvasRef, isCameraActive, cameraError, startCamera, stopCamera, captureFrame } = useCamera();
  const { announce } = useA11y();

  const [key, setKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [sharp, setSharp] = useState(0);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);
  const resultRef = useRef(null);

  // Setelah ada hasil atau peringatan, gulir otomatis agar langsung terlihat
  useEffect(() => {
    if (status === "idle" || status === "loading" || status === "nokey") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    resultRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [status, report]);

  const finish = (raw) => {
    if (!raw.trim()) {
      setStatus("empty");
      return;
    }
    const r = gradeAnswers(key, raw);
    setReport(r);
    setStatus("done");
    const wrongText = r.wrong.length ? `Nomor yang salah: ${joinIndonesian(r.wrong)}.` : "Semua jawaban benar.";
    announce(`Nilai ${r.correct} dari ${r.total}. Benar ${r.correct}, salah ${r.total - r.correct}. ${wrongText}`);
  };

  const requireKey = () => {
    if (key.trim() === "") {
      setStatus("nokey");
      return false;
    }
    return true;
  };

  const scanCamera = async () => {
    if (!requireKey()) return;
    if (!isCameraActive) {
      setStatus("nocam");
      return;
    }
    const s = measureSharpness(videoRef.current);
    setSharp(s.variance);
    if (s.ready && s.isBlurry) {
      setStatus("blur"); // API tidak dipanggil
      return;
    }
    setStatus("loading");
    announce("Memindai tugas murid. Mohon tunggu.");
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
      // raw_text dipakai (bukan final_text) supaya kesalahan murid tidak ikut dibetulkan kamus
      finish(data.raw_text || "");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const scanFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!requireKey()) return;
    setStatus("loading");
    announce("Memindai foto tugas. Mohon tunggu.");
    try {
      const bmp = await createImageBitmap(file);
      const s = measureSharpness(bmp);
      setSharp(s.variance);
      if (s.ready && s.isBlurry) {
        setStatus("blur");
        return;
      }
      const data = await translateBrailleImage(file);
      if (data.status === "blurry") {
        // Server juga menolak gambar buram
        setSharp(data.sharpness ?? 0);
        setStatus("blur");
        return;
      }
      if (data.status !== "success") throw new Error(data.message || "Server gagal");
      finish(data.raw_text || "");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const speakSummary = () => {
    if (!report) return;
    speakText(`Nilai ${report.correct} dari ${report.total}.`);
  };

  return (
    <ol className="m-0 flex list-none flex-col gap-6 p-0">
      <Step number={1} title="Ketik kunci jawaban">
        <div className="flex flex-col gap-2">
          <label htmlFor="kunci" className="font-bold">
            Kunci jawaban
          </label>
          <p id="kunci-bantuan" className="m-0 text-[0.9rem] text-muted">
            Tulis satu jawaban di setiap baris. Contoh: baris 1 "saya makan", baris 2 "ibu masak".
          </p>
          <textarea
            id="kunci"
            rows={5}
            value={key}
            aria-describedby="kunci-bantuan"
            onChange={(e) => setKey(e.target.value)}
            className="field"
          />
        </div>
        {status === "nokey" && (
          <div role="alert" className="alert-box">
            <p className="m-0 flex items-start gap-3">
              <TriangleAlert size={28} className="flex-none" aria-hidden="true" />
              <span>
                <strong>Peringatan.</strong> Kunci jawaban masih kosong. Isi kunci jawaban dulu.
              </span>
            </p>
          </div>
        )}
      </Step>

      <Step number={2} title="Pindai tugas murid">
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-[20px] border-[3px] border-deep bg-ink">
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

        {isCameraActive ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              stopCamera();
              announce("Kamera dimatikan.");
            }}
          >
            <CameraOff size={24} aria-hidden="true" /> Matikan kamera
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={async () => {
              if (await startCamera()) announce("Kamera menyala. Arahkan kamera ke tugas murid.");
            }}
          >
            <Camera size={24} aria-hidden="true" /> Nyalakan kamera
          </button>
        )}

        <button type="button" className="btn btn-primary" onClick={scanCamera} disabled={status === "loading"}>
          <ClipboardCheck size={24} aria-hidden="true" /> {status === "loading" ? "Memindai..." : "Pindai tugas murid"}
        </button>

        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={scanFile} />
        <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
          <Upload size={24} aria-hidden="true" /> Pilih foto tugas dari galeri
        </button>
      </Step>

      <Step number={3} title="Hasil nilai">
        <div ref={resultRef} className="flex flex-col gap-4">
        {status === "idle" && <p className="m-0 text-muted">Belum ada hasil. Selesaikan langkah 1 dan 2.</p>}
        {status === "nokey" && <p className="m-0 text-muted">Isi kunci jawaban di langkah 1 dulu.</p>}
        {status === "loading" && <p className="m-0 font-bold">Sedang memindai. Mohon tunggu.</p>}

        {status === "nocam" && (
          <div role="alert" className="alert-box">
            <strong>Peringatan.</strong> Kamera belum menyala. Tekan Nyalakan kamera di langkah 2.
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

        {status === "done" && report && (
          <div className="flex flex-col gap-4">
            <div className="ok-box">
              <p className="m-0 text-[1.6rem] font-bold">
                Nilai {report.correct} dari {report.total}
              </p>
              <p className="m-0">
                Benar {report.correct}. Salah {report.total - report.correct}.
              </p>
              <p className="m-0 font-bold">
                {report.wrong.length ? `Nomor yang salah: ${joinIndonesian(report.wrong)}` : "Semua jawaban benar."}
              </p>
            </div>

            <table className="w-full border-collapse text-left text-[0.95rem]">
              <caption className="mb-2 text-left font-bold">Rincian per nomor</caption>
              <thead>
                <tr className="bg-mint">
                  <th scope="col" className="border-2 border-deep p-2">Nomor</th>
                  <th scope="col" className="border-2 border-deep p-2">Kunci</th>
                  <th scope="col" className="border-2 border-deep p-2">Jawaban murid</th>
                  <th scope="col" className="border-2 border-deep p-2">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.number} className="bg-white">
                    <th scope="row" className="border-2 border-deep p-2">{r.number}</th>
                    <td className="border-2 border-deep p-2">{r.expected}</td>
                    <td className="border-2 border-deep p-2">{r.got || "(kosong)"}</td>
                    <td className="border-2 border-deep p-2 font-bold">{r.ok ? "Benar" : "Salah"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button type="button" className="btn btn-secondary" onClick={speakSummary}>
              <Volume2 size={24} aria-hidden="true" /> Bacakan nilai
            </button>
          </div>
        )}
        </div>
      </Step>
    </ol>
  );
}
