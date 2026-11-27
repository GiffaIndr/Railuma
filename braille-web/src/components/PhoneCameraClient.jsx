import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Maximize2, Minimize2, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { getWsBaseUrl, isClaheOn } from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";
import { createStabilizer } from "../utils/stabilizer";

// Tampilan kamera ringan untuk HP saat membuka URL ?pair=<token>
export default function PhoneCameraClient({ token, onExit }) {
  const {
    videoRef,
    canvasRef,
    isCameraActive,
    cameraError,
    facingMode,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  } = useCamera();
  const [wsState, setWsState] = useState("connecting");
  const [sharp, setSharp] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Menghubungkan ke dasbor komputer...");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [scanMode, setScanMode] = useState("live");
  const [burstProgress, setBurstProgress] = useState(0);
  const [livePreviewText, setLivePreviewText] = useState("");
  const [liveCellCount, setLiveCellCount] = useState(0);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [livePolygons, setLivePolygons] = useState([]);
  const [liveImageSize, setLiveImageSize] = useState({ w: 1280, h: 720 });
  const wsRef = useRef(null);
  const wsLiveRef = useRef(null);
  const wsLiveBusyRef = useRef(false);
  const overlayCanvasRef = useRef(null);
  const stabRef = useRef(createStabilizer(5, 2));
  const sendCaptureRef = useRef(null);
  const switchCameraRef = useRef(null);

  const handleSelectScanMode = (nextMode) => {
    setScanMode(nextMode);
    const label = nextMode === "photo" ? "Foto Presisi" : "Live";
    setStatusMsg(`Mode ${label} aktif.`);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "sync_scan_mode", scanMode: nextMode }));
    }
  };

  const handleFlipCamera = async () => {
    const nextLabel = facingMode === "environment" ? "Kamera Depan" : "Kamera Belakang";
    const ok = await switchCamera();
    if (ok) {
      setStatusMsg(`Beralih ke ${nextLabel}.`);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "phone_camera_status",
            active: true,
            facingMode: facingMode === "environment" ? "user" : "environment",
          }),
        );
      }
    }
  };

  // Mencegah layar HP mati otomatis saat kamera sedang aktif (Wake Lock API)
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      if ("wakeLock" in navigator && isCameraActive) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
        } catch {
          // peramban tidak mengizinkan wakelock
        }
      }
    };
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release().catch(() => {});
    };
  }, [isCameraActive]);

  const playShutterSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // abaikan jika audio dibatasi
    }
  };

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

  const sendCapture = async (requestedMode = null) => {
    const activeMode = typeof requestedMode === "string" ? requestedMode : scanMode;
    if (!isCameraActive) {
      setStatusMsg("Nyalakan kamera terlebih dahulu.");
      return;
    }
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatusMsg("Gagal mengirim foto. Pastikan koneksi ke dasbor masih aktif.");
      return;
    }

    let blob = null;
    let bestVariance = 0;

    if (activeMode === "sentence") {
      // Mode Kalimat: Ambil 3 frame beruntun dan pilih yang paling tajam
      const candidates = [];
      for (let i = 0; i < 3; i++) {
        setBurstProgress(i + 1);
        setStatusMsg(`Mengambil rangkaian kalimat (${i + 1}/3)... Tahan HP tetap stabil.`);
        setShutterFlash(true);
        setTimeout(() => setShutterFlash(false), 90);
        playShutterSound();
        const s = measureSharpness(videoRef.current);
        const b = await captureFrame();
        if (b) {
          candidates.push({ blob: b, variance: s.variance });
        }
        if (i < 2) {
          await new Promise((r) => setTimeout(r, 240));
        }
      }
      setBurstProgress(0);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.variance - a.variance);
        blob = candidates[0].blob;
        bestVariance = candidates[0].variance;
      }
    } else {
      const s = measureSharpness(videoRef.current);
      bestVariance = s.variance;
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 120);
      playShutterSound();
      blob = await captureFrame();
    }

    setSharp(bestVariance);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50);
    }

    if (!blob || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatusMsg("Gagal mengirim foto. Pastikan koneksi ke dasbor masih aktif.");
      return;
    }
    const buf = await blob.arrayBuffer();
    wsRef.current.send(buf);
    setSentCount((n) => n + 1);
    const modeLabel =
      activeMode === "sentence" ? "Kalimat Burst" : activeMode === "photo" ? "Foto Presisi" : "Frame Live";
    setStatusMsg(`${modeLabel} #${sentCount + 1} terkirim ke dasbor (Ketajaman: ${bestVariance}).`);
  };

  useEffect(() => {
    sendCaptureRef.current = sendCapture;
    switchCameraRef.current = handleFlipCamera;
  });

  // Siarkan live feed kamera HP ke dasbor komputer dengan rasio aspek asli (portrait/landscape tidak gepeng)
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
    const ctx = streamCanvas.getContext("2d");

    let busy = false;
    const interval = setInterval(() => {
      if (busy || !videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (videoRef.current.readyState < 2) return;
      if (wsRef.current.bufferedAmount > 131072) return;

      const vw = videoRef.current.videoWidth || 1280;
      const vh = videoRef.current.videoHeight || 720;
      // Pertahankan rasio aspek asli kamera HP (portrait maupun landscape) pada resolusi 960 px
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const tw = Math.max(2, Math.round(vw * scale));
      const th = Math.max(2, Math.round(vh * scale));
      if (streamCanvas.width !== tw || streamCanvas.height !== th) {
        streamCanvas.width = tw;
        streamCanvas.height = th;
      }

      busy = true;
      try {
        ctx.drawImage(videoRef.current, 0, 0, tw, th);
        const dataUrl = streamCanvas.toDataURL("image/jpeg", 0.84);
        wsRef.current.send(
          JSON.stringify({
            type: "phone_stream_frame",
            image: dataUrl,
            width: tw,
            height: th,
            timestamp: Date.now(),
          }),
        );
      } catch {
        // abaikan eror frame transien
      } finally {
        busy = false;
      }
    }, 300);

    return () => {
      clearInterval(interval);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "phone_camera_status", active: false }));
      }
    };
  }, [isCameraActive, wsState, videoRef]);

  // Jalankan deteksi Live langsung dari frame kamera asli HP (resolusi penuh 1080p, JPEG 0.92)
  // agar akurasinya 100% identik dengan membuka Ruang Scan langsung di HP!
  useEffect(() => {
    if (!isCameraActive || scanMode !== "live") {
      if (wsLiveRef.current) {
        wsLiveRef.current.close();
        wsLiveRef.current = null;
      }
      setLivePolygons([]);
      return undefined;
    }

    const wsLive = new WebSocket(`${getWsBaseUrl()}/ws/live`);
    wsLiveRef.current = wsLive;
    wsLiveBusyRef.current = false;

    wsLive.onopen = () => {
      wsLive.send(JSON.stringify({ type: "config", clahe: isClaheOn() }));
    };

    wsLive.onmessage = (ev) => {
      wsLiveBusyRef.current = false;
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "cells") {
          setLiveImageSize({ w: data.image_width || 1280, h: data.image_height || 720 });
          setSharp(data.quality?.sharpness ?? 0);
          setLivePolygons(data.cells || []);

          const finalTxt = (data.final_text || "").trim();
          let votedText = "";
          let isConfirmed = false;
          if (finalTxt) {
            const voted = stabRef.current.push(finalTxt);
            votedText = voted.text;
            isConfirmed = voted.confirmed;
            setLivePreviewText(voted.text);
            setLiveCellCount((data.cells || []).length);
            setLiveConfirmed(voted.confirmed);
          }

          // Teruskan hasil deteksi resolusi penuh ke dasbor laptop secara real-time
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "phone_live_detection",
                payload: {
                  ...data,
                  voted_text: votedText,
                  voted_confirmed: isConfirmed,
                },
              }),
            );
          }
        }
      } catch {
        // abaikan
      }
    };

    wsLive.onerror = () => {
      wsLiveBusyRef.current = false;
    };

    const interval = setInterval(async () => {
      if (!wsLiveRef.current || wsLiveRef.current.readyState !== WebSocket.OPEN) return;
      if (wsLiveBusyRef.current || !videoRef.current) return;
      const s = measureSharpness(videoRef.current);
      setSharp(s.variance);
      if (s.ready && s.isBlurry) return;

      wsLiveBusyRef.current = true;
      // Gunakan captureFrame() resolusi asli kamera HP (JPEG 0.92), sama persis dengan web di HP!
      const blob = await captureFrame();
      if (!blob) {
        wsLiveBusyRef.current = false;
        return;
      }
      const buf = await blob.arrayBuffer();
      if (wsLiveRef.current?.readyState === WebSocket.OPEN) {
        wsLiveRef.current.send(buf);
      } else {
        wsLiveBusyRef.current = false;
      }
    }, 900);

    return () => {
      clearInterval(interval);
      wsLive.close();
      wsLiveRef.current = null;
    };
  }, [isCameraActive, scanMode, captureFrame, videoRef]);

  // Gambar poligon sel Braille langsung di layar HP juga
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    const rect = video.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width));
    const ch = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.clearRect(0, 0, cw, ch);
    if (!isCameraActive) return;

    if (scanMode === "sentence") {
      const bandTop = ch * 0.32;
      const bandH = ch * 0.36;
      ctx.save();
      ctx.strokeStyle = "#E6FF2E";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(16, bandTop, cw - 32, bandH);
      ctx.restore();
    }

    if (livePolygons.length === 0) return;

    const iw = liveImageSize.w || video.videoWidth || 1280;
    const ih = liveImageSize.h || video.videoHeight || 720;
    const scale = Math.min(cw / iw, ch / ih);
    const offsetX = (cw - iw * scale) / 2;
    const offsetY = (ch - ih * scale) / 2;

    livePolygons.forEach((cell) => {
      const pts = cell.polygon || [
        [cell.x1, cell.y1],
        [cell.x2, cell.y1],
        [cell.x2, cell.y2],
        [cell.x1, cell.y2],
      ];
      if (!pts || pts.length < 4) return;
      const isReview = cell.flag === "review" || (cell.conf ?? 1) < 0.65;
      ctx.save();
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const sx = offsetX + px * scale;
        const sy = offsetY + py * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.lineWidth = 2.5;
      ctx.setLineDash(isReview ? [5, 4] : []);
      ctx.strokeStyle = isReview ? "#E6FF2E" : "#8FC8FF";
      ctx.fillStyle = isReview ? "rgba(230, 255, 46, 0.20)" : "rgba(44, 146, 221, 0.20)";
      ctx.fill();
      ctx.stroke();

      const [x0, y0] = pts[0];
      const lx = offsetX + x0 * scale;
      const ly = Math.max(22, offsetY + y0 * scale - 6);
      const labelTxt = `${cell.symbol}${isReview ? "?" : ""}`;
      ctx.font = "bold 14px 'Plus Jakarta Sans', sans-serif";
      const tw = ctx.measureText(labelTxt).width;
      ctx.setLineDash([]);
      ctx.fillStyle = "#06152D";
      ctx.fillRect(lx - 2, ly - 17, tw + 10, 20);
      ctx.strokeStyle = isReview ? "#E6FF2E" : "#8FC8FF";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(lx - 2, ly - 17, tw + 10, 20);
      ctx.fillStyle = isReview ? "#E6FF2E" : "#FFFFFF";
      ctx.fillText(labelTxt, lx + 3, ly - 2);
      ctx.restore();
    });
  }, [livePolygons, liveImageSize, isCameraActive, scanMode, videoRef]);

  useEffect(() => {
    let unmounted = false;
    let ws = null;
    let pingInterval = null;
    let reconnectTimeout = null;

    const connect = () => {
      if (unmounted) return;
      setWsState("connecting");
      setStatusMsg("Menghubungkan ke dasbor komputer...");

      try {
        ws = new WebSocket(`${getWsBaseUrl()}/ws/device/${encodeURIComponent(token)}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setWsState("connected");
          setStatusMsg("Terhubung ke dasbor. Nyalakan kamera belakang lalu tekan Kirim Foto.");

          // Heartbeat ping berkala agar tidak diputus idle timeout oleh jaringan/hosting
          clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);
        };

        ws.onmessage = async (ev) => {
          try {
            if (typeof ev.data === "string") {
              const msg = JSON.parse(ev.data);
              if (msg.type === "pong") return;
              if (msg.type === "request_capture" && sendCaptureRef.current) {
                if (msg.scanMode) setScanMode(msg.scanMode);
                await sendCaptureRef.current(msg.scanMode || null);
              } else if (msg.type === "request_switch_camera" && switchCameraRef.current) {
                await switchCameraRef.current();
              } else if (msg.type === "sync_scan_mode" && msg.scanMode) {
                setScanMode(msg.scanMode);
              } else if (msg.type === "live_overlay_update") {
                setLivePreviewText(msg.text || "");
                setLiveCellCount(msg.cellCount || 0);
                setLiveConfirmed(Boolean(msg.confirmed));
              }
            }
          } catch {
            // lewati pesan biner
          }
        };

        ws.onerror = () => {
          if (unmounted) return;
          setWsState("error");
          setStatusMsg("Koneksi terganggu. Mencoba menyambung kembali...");
        };

        ws.onclose = () => {
          clearInterval(pingInterval);
          if (unmounted) return;
          setWsState("closed");
          setStatusMsg("Koneksi terputus. Menyambung ulang dalam 2 detik...");
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 2000);
        };
      } catch {
        if (!unmounted) {
          setWsState("error");
          clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      unmounted = true;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
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
        {/* Pilihan Mode Pemindaian Kamera HP: Live, Foto Presisi */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.82rem] font-bold text-muted-theme">Mode Kamera:</span>
          <div
            className="segmented-bar flex-1 sm:flex-none flex flex-nowrap overflow-x-auto no-scrollbar"
            role="group"
            aria-label="Pilih mode pemindaian kamera HP"
          >
            {[
              { id: "live", label: "Live" },
              { id: "photo", label: "Foto Presisi" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={scanMode === m.id}
                onClick={() => handleSelectScanMode(m.id)}
                className="segmented-item flex-1 sm:flex-none text-center"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={
            isFullscreen
              ? "camera-fullscreen-viewport"
              : "camera-viewport relative overflow-hidden"
          }
        >
          {isFullscreen ? (
            <div className="fullscreen-hud-top">
              <span className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-[0.8rem] font-bold text-[#E6FF2E] backdrop-blur-md border border-white/15">
                <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-ping" />
                <span>
                  Kamera HP ({facingMode === "environment" ? "Belakang" : "Depan"})
                </span>
              </span>
              <div className="flex items-center gap-2">
                {isCameraActive && (
                  <button
                    type="button"
                    onClick={handleFlipCamera}
                    aria-label="Ganti kamera depan atau belakang"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/75 text-white hover:bg-black/90 hover:text-[#E6FF2E] backdrop-blur-md border border-white/20 text-[0.8rem] font-bold transition-colors min-h-[40px]"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    <span>Balik Kamera</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 text-white hover:bg-black/90 hover:text-[#E6FF2E] backdrop-blur-md border border-white/20 text-[0.82rem] font-bold transition-colors min-h-[40px]"
                >
                  <Minimize2 size={16} aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              {isCameraActive && (
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  aria-label="Ganti kamera depan atau belakang"
                  title="Ganti kamera depan / belakang"
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-black/65 px-2.5 text-[0.78rem] font-bold text-white hover:bg-black/85 hover:text-[#E6FF2E] backdrop-blur-sm border border-white/15 transition-all shadow-sm"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>{facingMode === "environment" ? "Depan" : "Belakang"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Layar penuh kamera"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 hover:text-[#E6FF2E] backdrop-blur-sm border border-white/15 transition-all shadow-sm"
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Efek Kilat Shutter Kamera */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-40 bg-white transition-opacity duration-150 ${
              shutterFlash ? "opacity-90" : "opacity-0"
            }`}
          />

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
          <canvas
            ref={overlayCanvasRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 h-full w-full ${
              isCameraActive ? "block" : "hidden"
            }`}
          />
          {!isCameraActive && (
            <span className="flex items-center justify-center gap-2 px-4 text-center font-semibold text-white z-10">
              <CameraOff size={22} aria-hidden="true" /> Kamera belum dinyalakan
            </span>
          )}

          {!isFullscreen && isCameraActive && scanMode === "live" && livePreviewText && (
            <div
              aria-hidden="true"
              className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 rounded-[10px] bg-black/70 px-4 py-2.5 backdrop-blur-md text-white"
            >
              <span className="truncate text-[0.92rem] font-bold">{livePreviewText}</span>
              <span className="flex-none text-[0.78rem] font-semibold text-[#E6FF2E] tabular-nums">
                {liveCellCount} sel {liveConfirmed ? "· stabil" : ""}
              </span>
            </div>
          )}

          {isFullscreen && isCameraActive && (
            <div className="fullscreen-hud-bottom">
              {scanMode === "live" && livePreviewText && (
                <div
                  aria-hidden="true"
                  className="w-full max-w-md flex items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-2.5 backdrop-blur-md text-white border border-white/20 shadow-2xl"
                >
                  <span className="truncate text-[0.95rem] font-bold">{livePreviewText}</span>
                  <span className="flex-none text-[0.8rem] font-semibold text-[#E6FF2E] tabular-nums">
                    {liveCellCount} sel {liveConfirmed ? "· stabil" : ""}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 sm:gap-5 w-full max-w-md">
                <div className="flex items-center gap-1 bg-black/70 p-1.5 rounded-full backdrop-blur-md border border-white/20">
                  {[
                    { id: "live", label: "Live" },
                    { id: "photo", label: "Foto Presisi" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectScanMode(m.id)}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all whitespace-nowrap ${
                        scanMode === m.id
                          ? "bg-[#E6FF2E] text-[#0A1628]"
                          : "text-white/80 hover:text-white"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => sendCapture()}
                  disabled={wsState !== "connected" || burstProgress > 0}
                  aria-label="Kirim Foto ke Komputer"
                  className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-full bg-[#E6FF2E] text-[#0A1628] shadow-[0_0_24px_rgba(230,255,46,0.35)] active:scale-95 transition-all border-4 border-white/40 disabled:opacity-50"
                >
                  <Send size={26} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
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
            <button type="button" className="btn btn-primary flex-1" onClick={() => startCamera()}>
              <Camera size={20} aria-hidden="true" /> Nyalakan Kamera HP
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => sendCapture()}
                disabled={wsState !== "connected" || burstProgress > 0}
              >
                <Send size={20} aria-hidden="true" />
                <span>
                  {scanMode === "photo" ? "Tangkap Foto Presisi" : "Tangkap Frame Ini"}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleFlipCamera}
                aria-label="Ganti kamera depan atau belakang"
              >
                <RotateCcw size={18} aria-hidden="true" />
                <span>
                  {facingMode === "environment" ? "Kamera Depan" : "Kamera Belakang"}
                </span>
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
