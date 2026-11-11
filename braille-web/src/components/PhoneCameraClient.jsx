import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Maximize2, Minimize2, Send, TriangleAlert } from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { getWsBaseUrl } from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";

// Tampilan kamera ringan untuk HP saat membuka URL ?pair=<token>
export default function PhoneCameraClient({ token, onExit }) {
  const {
    videoRef,
    canvasRef,
    isCameraActive,
    cameraError,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();
  const [wsState, setWsState] = useState("connecting");
  const [sharp, setSharp] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Menghubungkan ke dasbor komputer...");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wsRef = useRef(null);
  const sendCaptureRef = useRef(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isFullscreen) {
        document.body.classList.add("camera-fullscreen-open");
      } else {
        document.body.classList.remove("camera-fullscreen-open");
      }
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("camera-fullscreen-open");
      }
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  };

  const sendCapture = async () => {
    if (!isCameraActive) {
      setStatusMsg("Nyalakan kamera terlebih dahulu.");
      return;
    }
    const s = measureSharpness(videoRef.current);
    setSharp(s.variance);
    const blob = await captureFrame();
    if (!blob || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatusMsg("Gagal mengirim foto. Pastikan koneksi ke dasbor masih aktif.");
      return;
    }
    const buf = await blob.arrayBuffer();
    wsRef.current.send(buf);
    setSentCount((n) => n + 1);
    setStatusMsg(`Foto #${sentCount + 1} terkirim ke dasbor (Ketajaman: ${s.variance}).`);
  };

  useEffect(() => {
    sendCaptureRef.current = sendCapture;
  });

  // Siarkan live feed kamera HP ke dasbor komputer secara berkala
  useEffect(() => {
    if (!isCameraActive || wsState !== "connected") {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "phone_camera_status", active: false }));
      }
      return undefined;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "phone_camera_status", active: true }));
    }

    const streamCanvas = document.createElement("canvas");
    streamCanvas.width = 480;
    streamCanvas.height = 270;
    const ctx = streamCanvas.getContext("2d");

    let busy = false;
    const interval = setInterval(() => {
      if (busy || !videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (videoRef.current.readyState < 2) return;

      busy = true;
      try {
        ctx.drawImage(videoRef.current, 0, 0, 480, 270);
        const dataUrl = streamCanvas.toDataURL("image/jpeg", 0.55);
        wsRef.current.send(
          JSON.stringify({
            type: "phone_stream_frame",
            image: dataUrl,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // abaikan eror frame transien
      } finally {
        busy = false;
      }
    }, 280);

    return () => {
      clearInterval(interval);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "phone_camera_status", active: false }));
      }
    };
  }, [isCameraActive, wsState, videoRef]);

  useEffect(() => {
    const ws = new WebSocket(`${getWsBaseUrl()}/ws/device/${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("connected");
      setStatusMsg("Terhubung ke dasbor. Nyalakan kamera belakang lalu tekan Kirim Foto.");
    };
    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "request_capture" && sendCaptureRef.current) {
          await sendCaptureRef.current();
        }
      } catch {
        // lewati pesan biner
      }
    };
    ws.onerror = () => {
      setWsState("error");
      setStatusMsg("Koneksi ke server terputus atau token kedaluwarsa.");
    };
    ws.onclose = () => {
      setWsState("closed");
    };

    return () => {
      ws.close();
    };
  }, [token]);

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 py-6">
      <header className="card flex flex-wrap items-center justify-between gap-3 !p-4">
        <div>
          <h1 className="m-0 text-[1.2rem] font-bold">Kamera HP Railuma</h1>
          <p className="m-0 text-[0.84rem] text-muted-theme">Kode penyandingan: {token}</p>
        </div>
        {onExit && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onExit}>
            Kembali ke Dasbor
          </button>
        )}
      </header>

      <div className="surface-subtle p-4 text-[0.9rem]" role="status" aria-live="polite">
        <p className="m-0 font-bold">
          Status:{" "}
          {wsState === "connected"
            ? "Terhubung"
            : wsState === "connecting"
              ? "Menghubungkan..."
              : "Terputus"}
        </p>
        <p className="m-0 mt-1 text-muted-theme">{statusMsg}</p>
      </div>

      <div className="card flex flex-col gap-4">
        <div
          className={
            isFullscreen
              ? "fixed inset-0 z-[99999] h-[100dvh] w-screen bg-black flex flex-col justify-between overflow-hidden p-0 sm:p-4 select-none"
              : "camera-viewport relative overflow-hidden"
          }
        >
          {isFullscreen ? (
            <div className="relative z-30 flex items-center justify-between w-full px-4 pt-[max(12px,env(safe-area-inset-top))]">
              <span className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-[0.8rem] font-bold text-[#E6FF2E] backdrop-blur-md border border-white/15">
                <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-ping" />
                <span>Kamera HP Layar Penuh</span>
              </span>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 text-white hover:bg-black/90 hover:text-[#E6FF2E] backdrop-blur-md border border-white/20 text-[0.82rem] font-bold transition-colors min-h-[40px]"
              >
                <Minimize2 size={16} aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Layar penuh kamera"
              className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 hover:text-[#E6FF2E] backdrop-blur-sm border border-white/15 transition-all shadow-sm"
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            width={1280}
            height={720}
            aria-label="Pratinjau kamera HP"
            className={
              isFullscreen
                ? `absolute inset-0 h-full w-full object-cover sm:object-contain pointer-events-none ${isCameraActive ? "block" : "hidden"}`
                : `h-full w-full object-contain ${isCameraActive ? "block" : "hidden"}`
            }
          />
          {!isCameraActive && (
            <span className="flex items-center justify-center gap-2 px-4 text-center font-semibold text-white z-10">
              <CameraOff size={22} aria-hidden="true" /> Kamera belum dinyalakan
            </span>
          )}

          {isFullscreen && isCameraActive && (
            <div className="relative z-30 flex items-center justify-center w-full px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={sendCapture}
                disabled={wsState !== "connected"}
                aria-label="Kirim Foto ke Komputer"
                className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#E6FF2E] text-[#0A1628] shadow-[0_0_24px_rgba(230,255,46,0.35)] active:scale-95 transition-all border-4 border-white/40 disabled:opacity-50"
              >
                <Send size={28} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        {cameraError && (
          <div role="alert" className="alert-box">
            <TriangleAlert size={20} className="mr-2 inline" aria-hidden="true" />
            <strong>Peringatan:</strong> {cameraError}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!isCameraActive ? (
            <button type="button" className="btn btn-primary flex-1" onClick={startCamera}>
              <Camera size={20} aria-hidden="true" /> Nyalakan Kamera Belakang
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={sendCapture}
                disabled={wsState !== "connected"}
              >
                <Send size={20} aria-hidden="true" /> Kirim Foto ke Dasbor
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={toggleFullscreen}
                aria-label="Mode layar penuh kamera"
              >
                <Maximize2 size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Layar Penuh</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={stopCamera}>
                <CameraOff size={20} aria-hidden="true" /> Matikan
              </button>
            </>
          )}
        </div>

        {sharp > 0 && (
          <p className="m-0 text-[0.85rem] text-muted-theme">
            Ketajaman foto terakhir: <strong>{sharpnessLabel(sharp)}</strong> ({sharp} dari minimal{" "}
            {BLUR_MIN})
          </p>
        )}
        {sentCount > 0 && (
          <p className="m-0 flex items-center gap-2 text-[0.85rem] font-bold">
            <CheckCircle2 size={18} aria-hidden="true" /> {sentCount} foto telah dikirim ke sesi
            aktif.
          </p>
        )}
      </div>
    </div>
  );
}
