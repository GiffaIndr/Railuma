import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Send, TriangleAlert } from "lucide-react";
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
  const wsRef = useRef(null);
  const sendCaptureRef = useRef(null);

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
        <div className="camera-viewport">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            width={1280}
            height={720}
            aria-label="Pratinjau kamera HP"
            className={`h-full w-full object-contain ${isCameraActive ? "block" : "hidden"}`}
          />
          {!isCameraActive && (
            <span className="flex items-center gap-2 px-4 text-center font-semibold text-white">
              <CameraOff size={22} aria-hidden="true" /> Kamera belum dinyalakan
            </span>
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
