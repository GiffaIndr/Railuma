import { useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  TriangleAlert,
  Upload,
  Volume2,
} from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { useA11y } from "../context/useA11y";
import { translateBrailleImage } from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";
import { joinIndonesian, speakText } from "../utils/speech";
import { gradeAnswers } from "../utils/grade";

export default function HomeworkCorrector() {
  const {
    videoRef,
    canvasRef,
    isCameraActive,
    cameraError,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();
  const { announce } = useA11y();

  const [key, setKey] = useState("");
  const [status, setStatus] = useState("idle");
  const [sharp, setSharp] = useState(0);
  const [report, setReport] = useState(null);
  const fileRef = useRef(null);

  const finish = (raw) => {
    if (!raw.trim()) {
      setStatus("empty");
      return;
    }
    const r = gradeAnswers(key, raw);
    setReport(r);
    setStatus("done");
    const wrongText = r.wrong.length
      ? `Nomor yang salah: ${joinIndonesian(r.wrong)}.`
      : "Semua jawaban benar.";
    announce(
      `Nilai ${r.correct} dari ${r.total}. Benar ${r.correct}, salah ${
        r.total - r.correct
      }. ${wrongText}`,
    );
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
      setStatus("blur");
      return;
    }
    setStatus("loading");
    announce("Memindai tugas murid. Mohon tunggu.");
    try {
      const blob = await captureFrame();
      if (!blob) throw new Error("Gagal mengambil gambar");
      const data = await translateBrailleImage(blob);
      if (data.status === "blurry") {
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
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* Kolom Kiri (7/12): Kunci Jawaban & Viewfinder Kamera */}
      <div className="flex flex-col gap-5 lg:col-span-7">
        <section aria-labelledby="judul-kunci-jawaban" className="card flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <h2 id="judul-kunci-jawaban" className="m-0 text-[1.08rem] font-bold">
              1. Kunci Jawaban Guru
            </h2>
            <span className="status-chip">Satu baris per nomor soal</span>
          </div>

          <label htmlFor="kunci" className="text-[0.88rem] font-semibold">
            Ketik kunci jawaban sesuai urutan baris soal
          </label>
          <p id="kunci-bantuan" className="m-0 text-[0.84rem] text-muted-theme">
            Contoh: baris 1 &ldquo;saya makan&rdquo;, baris 2 &ldquo;ibu masak&rdquo;.
          </p>
          <textarea
            id="kunci"
            rows={4}
            value={key}
            aria-describedby="kunci-bantuan"
            onChange={(e) => setKey(e.target.value)}
            placeholder="Ketik kunci jawaban per baris..."
            className="field"
          />

          {status === "nokey" && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Perhatian:</strong> Isi kunci jawaban di atas terlebih dahulu sebelum
              memindai lembar murid.
            </div>
          )}
        </section>

        <section aria-labelledby="judul-pindai-tugas" className="card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <h2 id="judul-pindai-tugas" className="m-0 text-[1.08rem] font-bold">
              2. Pindai Lembar Jawaban Murid
            </h2>
            <span className="status-chip">Dinilai murni dari titik murid</span>
          </div>

          <div className="camera-viewport">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              width={1280}
              height={720}
              aria-label="Pratinjau kamera"
              className={`h-full w-full object-contain ${isCameraActive ? "block" : "hidden"}`}
            />
            {!isCameraActive && (
              <div className="flex flex-col items-center gap-2.5 px-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                  <CameraOff size={22} aria-hidden="true" />
                </span>
                <span className="font-bold text-white">Kamera belum dinyalakan</span>
                <span className="max-w-[36ch] text-[0.83rem] text-white/75">
                  Nyalakan kamera atau unggah foto lembar jawaban Braille murid untuk mulai menilai.
                </span>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

          {cameraError && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Kamera tidak bisa dibuka.</strong> {cameraError}
            </div>
          )}

          <div className="flex flex-wrap gap-2.5">
            {isCameraActive ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  stopCamera();
                  announce("Kamera dimatikan.");
                }}
              >
                <CameraOff size={18} aria-hidden="true" />
                <span>Matikan Kamera</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  if (await startCamera())
                    announce("Kamera menyala. Arahkan kamera ke tugas murid.");
                }}
              >
                <Camera size={18} aria-hidden="true" />
                <span>Nyalakan Kamera</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={scanCamera}
              disabled={status === "loading"}
            >
              <ClipboardCheck size={18} aria-hidden="true" />
              <span>{status === "loading" ? "Memindai..." : "Pindai Tugas Murid"}</span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={scanFile}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={18} aria-hidden="true" />
              <span>Unggah Foto Tugas</span>
            </button>
          </div>
        </section>
      </div>

      {/* Kolom Kanan (5/12): Panel Hasil Nilai Lengket */}
      <aside
        aria-labelledby="judul-hasil-nilai"
        className="card flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-5"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <h2 id="judul-hasil-nilai" className="m-0 text-[1.08rem] font-bold">
            3. Hasil Evaluasi
          </h2>
          {status === "done" && report && (
            <span className="status-chip status-chip-ok">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>
                {report.correct}/{report.total} Benar
              </span>
            </span>
          )}
        </div>

        {status === "idle" && (
          <div className="surface-subtle p-4 text-[0.9rem] text-muted-theme">
            Belum ada hasil evaluasi. Isi kunci jawaban di kiri lalu pindai atau unggah foto lembar
            jawaban murid.
          </div>
        )}
        {status === "nokey" && (
          <p className="m-0 text-[0.9rem] text-muted-theme">
            Isi kunci jawaban di langkah 1 terlebih dahulu.
          </p>
        )}
        {status === "loading" && (
          <p className="m-0 font-semibold">Sedang memindai lembar jawaban. Mohon tunggu...</p>
        )}

        {status === "nocam" && (
          <div role="alert" className="alert-box text-[0.88rem]">
            <strong>Kamera belum menyala.</strong> Tekan Nyalakan Kamera atau unggah berkas foto.
          </div>
        )}

        {status === "blur" && (
          <div role="alert" className="alert-box text-[0.88rem]">
            <p className="m-0 flex items-start gap-2.5">
              <TriangleAlert size={18} className="mt-0.5 flex-none" aria-hidden="true" />
              <span>
                <strong>Gambar buram.</strong> Tahan kamera sebentar lalu pindai lagi. Ketajaman:{" "}
                {sharpnessLabel(sharp)} ({sharp} dari minimal {BLUR_MIN}).
              </span>
            </p>
          </div>
        )}

        {status === "empty" && (
          <div role="alert" className="alert-box text-[0.88rem]">
            <strong>Belum ada Braille terbaca.</strong> Dekatkan kertas sedikit dan pastikan cahaya
            cukup dari arah samping.
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="alert-box text-[0.88rem]">
            <strong>Gagal menghubungi server.</strong> Periksa koneksi jaringan lalu coba lagi.
          </div>
        )}

        {status === "done" && report && (
          <div className="flex flex-col gap-4">
            <div className="surface-subtle p-4">
              <p className="m-0 text-[1.85rem] font-extrabold leading-none tabular-nums">
                Nilai {report.correct} dari {report.total}
              </p>
              <p className="m-0 mt-2 text-[0.9rem] text-muted-theme">
                Benar {report.correct} · Salah {report.total - report.correct}
              </p>
              <p className="m-0 mt-1 text-[0.9rem] font-semibold">
                {report.wrong.length
                  ? `Nomor yang salah: ${joinIndonesian(report.wrong)}`
                  : "Semua jawaban benar."}
              </p>
            </div>

            <button type="button" className="btn btn-secondary w-full" onClick={speakSummary}>
              <Volume2 size={18} aria-hidden="true" />
              <span>Bacakan Nilai</span>
            </button>

            <ul className="m-0 flex max-h-[380px] list-none flex-col gap-2.5 overflow-y-auto p-0">
              {report.rows.map((r) => (
                <li
                  key={r.n}
                  className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]/50 p-3.5 text-[0.88rem]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>Nomor {r.n}</strong>
                    <span
                      className={`status-chip ${
                        r.ok ? "status-chip-ok" : "status-chip-review"
                      }`}
                    >
                      {r.ok ? "Benar" : "Salah"}
                    </span>
                  </div>
                  <p className="m-0 mt-1.5">
                    Jawaban murid: <strong>{r.student}</strong>
                  </p>
                  {!r.ok && (
                    <p className="m-0 mt-0.5 text-muted-theme">
                      Kunci guru: <strong>{r.expected}</strong>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
