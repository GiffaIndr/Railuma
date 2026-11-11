import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { useCamera } from "../hooks/useCamera";
import { useA11y } from "../context/useA11y";
import {
  createPairingToken,
  createSession,
  createSessionScan,
  deleteSession,
  getSessionDetail,
  getWsBaseUrl,
  isClaheOn,
  isDatasetConsentOn,
  listSessions,
  patchScanItem,
  updateSession,
} from "../services/api";
import { measureSharpness, sharpnessLabel, BLUR_MIN } from "../utils/blur";
import { speakText } from "../utils/speech";
import { createStabilizer } from "../utils/stabilizer";
import { exportToPDF, exportToTXT } from "../utils/exporter";
import { getPatternForSymbol } from "../utils/braille";
import BrailleCellDiagram from "./BrailleCellDiagram";
import Tooltip from "./Tooltip";
import EmptyState from "./EmptyState";
import { useToast } from "./Toast";

function formatModelTitle(rawModel) {
  if (!rawModel) return "YOLOv8s";
  const cleaned = String(rawModel).split("@")[0];
  if (cleaned.toLowerCase() === "yolov8s") return "YOLOv8s";
  return cleaned.toUpperCase();
}

function formatModelSubtitle(healthInfo) {
  if (!healthInfo) return "Resolusi 960px · 53 kelas Braille";
  const parts = String(healthInfo.model_version || "").split("@");
  const resPart = parts[1] ? `Resolusi ${parts[1]}px` : "Resolusi 960px";
  return `${resPart} · ${healthInfo.kelas || 53} kelas simbol`;
}

export default function BrailleScanner({
  currentUser,
  onAuthExpired,
  subView = "scan",
  onChangeSubView,
  healthInfo,
  onFullscreenChange,
}) {
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
  const toast = useToast();

  // Sesi dan item riwayat (Supabase)
  const [sessions, setSessions] = useState([]);
  const [sessionsState, setSessionsState] = useState("loading"); // loading | ready | error
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionFilter, setSessionFilter] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");

  // Mode scan: live | sentence | photo | file
  const [scanMode, setScanMode] = useState("live");
  // Sumber kamera: webcam | phone | upload
  const [sourceMode, setSourceMode] = useState("webcam");

  // Tab Panel Kanan pada Ruang Scan: hasil | alternatif | mutu
  const [rightTab, setRightTab] = useState("hasil");

  // Status proses pindai
  const [status, setStatus] = useState("idle"); // idle | nocam | blur | loading | empty | error | done
  const [errorMessage, setErrorMessage] = useState("");
  const [sharp, setSharp] = useState(0);
  const [qualityInfo, setQualityInfo] = useState(null);
  const [pdfBlocked, setPdfBlocked] = useState(false);

  // Live Poligon WebSocket state
  const [liveStreaming, setLiveStreaming] = useState(false);
  const [livePolygons, setLivePolygons] = useState([]);
  const [livePreviewText, setLivePreviewText] = useState("");
  const [liveRawText, setLiveRawText] = useState("");
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const [liveLatencyMs, setLiveLatencyMs] = useState(0);
  const [liveImageSize, setLiveImageSize] = useState({ w: 1280, h: 720 });

  // Mode Kalimat (multi-frame burst)
  const [burstProgress, setBurstProgress] = useState(0);

  // Penyandingan Kamera HP & Live Stream dari HP
  const [pairToken, setPairToken] = useState("");
  const [pairPeers, setPairPeers] = useState(0);
  const [phoneStreamUrl, setPhoneStreamUrl] = useState(null);
  const [, setPhoneCameraActive] = useState(false);
  const pairWsRef = useRef(null);

  // Mode Layar Penuh (Fullscreen Camera) untuk HP / Desktop
  const [isCameraFullscreen, setIsCameraFullscreen] = useState(false);

  const toggleCameraFullscreen = useCallback(() => {
    setIsCameraFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (!isCameraActive && sourceMode !== "phone") {
          startCamera();
        }
        try {
          if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch {
          // abaikan
        }
        announce("Kamera layar penuh aktif.");
      } else {
        try {
          if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
        } catch {
          // abaikan
        }
        announce("Keluar dari kamera layar penuh.");
      }
      return next;
    });
  }, [isCameraActive, sourceMode, startCamera, announce]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape" && isCameraFullscreen) {
        setIsCameraFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isCameraFullscreen]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isCameraFullscreen) {
        document.body.classList.add("camera-fullscreen-open");
      } else {
        document.body.classList.remove("camera-fullscreen-open");
      }
    }
    if (onFullscreenChange) {
      onFullscreenChange(isCameraFullscreen);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("camera-fullscreen-open");
      }
      if (onFullscreenChange) {
        onFullscreenChange(false);
      }
    };
  }, [isCameraFullscreen, onFullscreenChange]);

  // Panel Inspektor Sel & Revisi
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedCellIdx, setSelectedCellIdx] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingNote, setEditingNote] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);

  const overlayCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const wsLiveRef = useRef(null);
  const wsBusyRef = useRef(false);
  const stabRef = useRef(createStabilizer(5, 2));

  const switchSubView = (target) => {
    if (onChangeSubView) {
      onChangeSubView(target);
    }
  };

  const loadSessionsList = useCallback(
    async (selectId = null) => {
      try {
        const res = await listSessions();
        let daftar = res.sessions || [];
        if (daftar.length === 0) {
          const baru = await createSession("Sesi 001 · Catatan Braille");
          daftar = [baru];
        }
        setSessions(daftar);
        try {
          localStorage.setItem("railuma_cached_sessions", JSON.stringify(daftar));
        } catch {
          // abaikan
        }
        setSessionsState("ready");
        const targetId = selectId || activeSessionId || daftar[0]?.id;
        if (targetId) {
          setActiveSessionId(targetId);
        }
      } catch (err) {
        console.error("Gagal mengambil sesi dari server:", err);
        if (err?.status === 401 && onAuthExpired) {
          onAuthExpired();
          return;
        }
        try {
          const cached = localStorage.getItem("railuma_cached_sessions");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSessions(parsed);
              setSessionsState("ready");
              setActiveSessionId(selectId || activeSessionId || parsed[0]?.id);
              return;
            }
          }
        } catch {
          // abaikan
        }
        const fallbackSessions = [
          {
            id: "sesi-lokal-1",
            title: "Sesi 001 · Catatan Braille",
            last_preview: "Siap digunakan. Sambungkan kamera atau unggah foto untuk membaca.",
            scan_count: 0,
            pinned: false,
          },
        ];
        setSessions(fallbackSessions);
        setSessionsState("ready");
        setActiveSessionId(fallbackSessions[0].id);
      }
    },
    [activeSessionId, onAuthExpired],
  );

  const loadActiveSessionDetail = useCallback(async (id) => {
    if (!id) return;
    try {
      const detail = await getSessionDetail(id);
      setActiveSession(detail);
      const items = detail.items || [];
      if (items.length > 0) {
        const last = items[items.length - 1];
        setSelectedItem(last);
        setEditingText(last.final_text || "");
        setEditingNote(last.notes || "");
        const firstReviewIdx = (last.cells_json || []).findIndex(
          (c) => c.flag === "review" || (c.conf ?? 1) < 0.65,
        );
        setSelectedCellIdx(firstReviewIdx >= 0 ? firstReviewIdx : null);
      } else {
        setSelectedItem(null);
        setEditingText("");
        setEditingNote("");
        setSelectedCellIdx(null);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listSessions()
      .then(async (res) => {
        if (!active) return;
        let daftar = res.sessions || [];
        if (daftar.length === 0) {
          const baru = await createSession("Sesi 001 · Catatan Braille");
          daftar = [baru];
        }
        if (!active) return;
        setSessions(daftar);
        try {
          localStorage.setItem("railuma_cached_sessions", JSON.stringify(daftar));
        } catch {
          // abaikan
        }
        setSessionsState("ready");
        if (daftar[0]?.id) {
          setActiveSessionId(daftar[0].id);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("Gagal memuat sesi:", err);
        if (err?.status === 401 && onAuthExpired) {
          onAuthExpired();
          return;
        }
        try {
          const cached = localStorage.getItem("railuma_cached_sessions");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSessions(parsed);
              setSessionsState("ready");
              if (parsed[0]?.id) setActiveSessionId(parsed[0].id);
              return;
            }
          }
        } catch {
          // abaikan
        }
        const fallbackSessions = [
          {
            id: "sesi-lokal-1",
            title: "Sesi 001 · Catatan Braille",
            last_preview: "Siap digunakan. Sambungkan kamera atau unggah foto untuk membaca.",
            scan_count: 0,
            pinned: false,
          },
        ];
        setSessions(fallbackSessions);
        setSessionsState("ready");
        setActiveSessionId(fallbackSessions[0].id);
      });
    return () => {
      active = false;
    };
  }, [onAuthExpired]);

  useEffect(() => {
    if (!activeSessionId) return undefined;
    let active = true;
    getSessionDetail(activeSessionId)
      .then((detail) => {
        if (!active) return;
        setActiveSession(detail);
        const items = detail.items || [];
        if (items.length > 0) {
          const last = items[items.length - 1];
          setSelectedItem(last);
          setEditingText(last.final_text || "");
          setEditingNote(last.notes || "");
          const firstReviewIdx = (last.cells_json || []).findIndex(
            (c) => c.flag === "review" || (c.conf ?? 1) < 0.65,
          );
          setSelectedCellIdx(firstReviewIdx >= 0 ? firstReviewIdx : null);
        } else {
          setSelectedItem(null);
          setEditingText("");
          setEditingNote("");
          setSelectedCellIdx(null);
        }
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      active = false;
    };
  }, [activeSessionId]);

  // Gambar overlay poligon di atas elemen <video>
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

    if (!isCameraActive || livePolygons.length === 0) return;

    const iw = liveImageSize.w || video.videoWidth || 1280;
    const ih = liveImageSize.h || video.videoHeight || 720;
    const scale = Math.min(cw / iw, ch / ih);
    const offsetX = (cw - iw * scale) / 2;
    const offsetY = (ch - ih * scale) / 2;

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
    if (!liveStreaming || !isCameraActive) {
      if (wsLiveRef.current) {
        wsLiveRef.current.close();
        wsLiveRef.current = null;
      }
      return undefined;
    }

    const ws = new WebSocket(`${getWsBaseUrl()}/ws/live`);
    wsLiveRef.current = ws;
    wsBusyRef.current = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "config", clahe: isClaheOn() }));
    };

    ws.onmessage = (ev) => {
      wsBusyRef.current = false;
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "cells") {
          setLiveLatencyMs(data.latency_ms || 0);
          setLiveImageSize({ w: data.image_width || 1280, h: data.image_height || 720 });
          setQualityInfo(data.quality || null);
          setSharp(data.quality?.sharpness ?? 0);
          setLivePolygons(data.cells || []);

          const finalTxt = (data.final_text || "").trim();
          if (finalTxt) {
            const voted = stabRef.current.push(finalTxt);
            setLivePreviewText(voted.text);
            setLiveRawText((data.raw_text || "").trim());
            setLiveConfirmed(voted.confirmed);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    ws.onerror = () => {
      wsBusyRef.current = false;
    };

    const interval = setInterval(async () => {
      if (!wsLiveRef.current || wsLiveRef.current.readyState !== WebSocket.OPEN) return;
      if (wsBusyRef.current) return;
      const s = measureSharpness(videoRef.current);
      setSharp(s.variance);
      if (s.ready && s.isBlurry) return;

      wsBusyRef.current = true;
      const blob = await captureFrame();
      if (!blob) {
        wsBusyRef.current = false;
        return;
      }
      const buf = await blob.arrayBuffer();
      if (wsLiveRef.current?.readyState === WebSocket.OPEN) {
        wsLiveRef.current.send(buf);
      } else {
        wsBusyRef.current = false;
      }
    }, 950);

    return () => {
      clearInterval(interval);
      ws.close();
      wsLiveRef.current = null;
    };
  }, [liveStreaming, isCameraActive, captureFrame, videoRef]);

  const handleTurnOnCamera = async () => {
    const ok = await startCamera();
    if (ok) {
      stabRef.current.reset();
      setLivePolygons([]);
      setLivePreviewText("");
      setStatus("idle");
      if (scanMode === "live") {
        setLiveStreaming(true);
      }
      announce("Kamera menyala. Arahkan kamera ke kertas Braille.");
    }
  };

  const handleTurnOffCamera = () => {
    setLiveStreaming(false);
    stopCamera();
    stabRef.current.reset();
    setLivePolygons([]);
    setStatus("idle");
    announce("Kamera dimatikan.");
  };

  const executeSingleOrFreezeScan = async (customBlob = null, customSource = sourceMode) => {
    if (!activeSessionId) return;
    let blob = customBlob;

    if (!blob) {
      if (!isCameraActive) {
        setStatus("nocam");
        return;
      }
      const s = measureSharpness(videoRef.current);
      setSharp(s.variance);
      if (s.ready && s.isBlurry) {
        setStatus("blur");
        announce("Gambar buram. Tahan kamera sebentar lalu coba lagi.");
        return;
      }
      blob = await captureFrame();
    }

    if (!blob) {
      setStatus("error");
      setErrorMessage("Gagal mengambil gambar dari kamera.");
      return;
    }

    setStatus("loading");
    announce("Memproses dan menyimpan pindai ke sesi...");

    try {
      const res = await createSessionScan(activeSessionId, blob, {
        mode: scanMode,
        source: customSource,
        checkBlur: customSource !== "upload",
        overrideFinalText: scanMode === "live" && livePreviewText ? livePreviewText : null,
        overrideRawText: scanMode === "live" && liveRawText ? liveRawText : null,
      });

      if (res.status === "blurry") {
        setSharp(res.sharpness ?? 0);
        setQualityInfo(res.quality || null);
        setStatus("blur");
        announce(res.message || "Gambar buram, pemindaian ditolak.");
        return;
      }

      const item = res.item;
      setQualityInfo(res.quality || null);
      setSharp(item?.sharpness ?? 0);

      if (!item?.final_text?.trim()) {
        setStatus("empty");
        announce("Belum ada Braille terbaca. Coba lebih dekat atau ubah arah cahaya.");
      } else {
        setStatus("done");
        const hasReview =
          item.status === "needs_review" ||
          (item.cells_json || []).some((c) => c.flag === "review" || (c.conf ?? 1) < 0.65);
        setRightTab(scanMode === "sentence" && hasReview ? "alternatif" : "hasil");
        announce(`Tersimpan di sesi: ${item.final_text}`);
      }

      await loadActiveSessionDetail(activeSessionId);
      await loadSessionsList(activeSessionId, false);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Tidak dapat menghubungi server.");
    }
  };

  const executeSentenceBurstScan = async () => {
    if (!isCameraActive) {
      setStatus("nocam");
      return;
    }
    setStatus("loading");
    setBurstProgress(1);
    announce("Mengambil 3 frame beruntun untuk kalimat. Tahan kamera tetap stabil.");

    const candidates = [];
    for (let i = 0; i < 3; i++) {
      setBurstProgress(i + 1);
      const s = measureSharpness(videoRef.current);
      const blob = await captureFrame();
      if (blob) {
        candidates.push({ blob, variance: s.variance });
      }
      await new Promise((r) => setTimeout(r, 260));
    }
    setBurstProgress(0);

    if (candidates.length === 0) {
      setStatus("error");
      setErrorMessage("Gagal menangkap burst frame.");
      return;
    }

    candidates.sort((a, b) => b.variance - a.variance);
    const best = candidates[0];
    setSharp(best.variance);
    if (best.variance < BLUR_MIN) {
      setStatus("blur");
      announce("Gambar buram. Tahan kamera sebentar lalu coba lagi.");
      return;
    }

    await executeSingleOrFreezeScan(best.blob, "webcam");
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await executeSingleOrFreezeScan(file, "upload");
  };

  const startPhonePairing = async () => {
    try {
      const res = await createPairingToken(activeSessionId);
      setPairToken(res.token);
      if (pairWsRef.current) pairWsRef.current.close();

      const ws = new WebSocket(`${getWsBaseUrl()}/ws/device/${encodeURIComponent(res.token)}`);
      pairWsRef.current = ws;
      ws.onmessage = async (ev) => {
        if (typeof ev.data === "string") {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "peer_joined" || msg.type === "peer_left") {
              const peers = Math.max(0, (msg.peers || 1) - 1);
              setPairPeers(peers);
              if (peers === 0) {
                setPhoneStreamUrl(null);
                setPhoneCameraActive(false);
              }
              announce(
                msg.type === "peer_joined"
                  ? "Kamera HP terhubung ke dasbor."
                  : "Kamera HP terputus.",
              );
            } else if (msg.type === "phone_camera_status") {
              setPhoneCameraActive(Boolean(msg.active));
              if (!msg.active) {
                setPhoneStreamUrl(null);
              }
            } else if (msg.type === "phone_stream_frame") {
              if (msg.image) {
                setPhoneStreamUrl(msg.image);
                setPhoneCameraActive(true);
              }
            }
          } catch {
            // abaikan pesan transien
          }
        } else if (ev.data instanceof Blob) {
          announce("Foto diterima dari kamera HP. Memproses...");
          await executeSingleOrFreezeScan(ev.data, "phone");
        }
      };
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMessage("Gagal membuat kode penyandingan HP.");
    }
  };

  const handleRequestCaptureFromPhone = () => {
    if (pairWsRef.current && pairWsRef.current.readyState === WebSocket.OPEN) {
      pairWsRef.current.send(JSON.stringify({ type: "request_capture" }));
      announce("Meminta kamera HP mengambil gambar...");
    } else {
      announce("Kamera HP belum terhubung.");
    }
  };

  const handleCreateSession = async () => {
    try {
      const num = String(sessions.length + 1).padStart(3, "0");
      const title = `Sesi ${num}`;
      const baru = await createSession(title);
      await loadSessionsList(baru.id, false);
      setActiveSessionId(baru.id);
      announce(`${title} dibuat.`);
      toast.success(`${title} berhasil dibuat.`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membuat sesi baru.");
    }
  };

  const handleTogglePin = async (ses) => {
    try {
      await updateSession(ses.id, { pinned: !ses.pinned });
      await loadSessionsList(activeSessionId, false);
      announce(ses.pinned ? "Semat sesi dilepas." : "Sesi disematkan di atas.");
      toast.info(ses.pinned ? "Semat sesi dilepas." : "Sesi disematkan di atas.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengubah status sematan sesi.");
    }
  };

  const handleSaveRename = async (sesId) => {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateSession(sesId, { title: renameText.trim() });
      setRenamingId(null);
      await loadSessionsList(activeSessionId, false);
      if (sesId === activeSessionId) await loadActiveSessionDetail(sesId);
      announce("Nama sesi diperbarui.");
      toast.success("Nama sesi berhasil diperbarui.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengubah nama sesi.");
    }
  };

  const handleDeleteSession = async (ses) => {
    try {
      await deleteSession(ses.id);
      const nextList = sessions.filter((x) => x.id !== ses.id);
      setSessions(nextList);
      if (activeSessionId === ses.id) {
        const nextId = nextList[0]?.id || null;
        setActiveSessionId(nextId);
        if (!nextId) await loadSessionsList();
      }
      announce(`Sesi ${ses.title} dihapus.`);
      toast.success(`Sesi "${ses.title}" berhasil dihapus.`);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus sesi.");
    }
  };

  const handleApplyCellCorrection = async (cell, newSymbol) => {
    if (!selectedItem) return;
    const cells = [...(selectedItem.cells_json || [])];
    const targetIdx = cells.findIndex((c) => c.id === cell.id);
    if (targetIdx === -1) return;

    const oldSymbol = cells[targetIdx].symbol;
    const oldPattern = cells[targetIdx].pattern || getPatternForSymbol(oldSymbol);
    const newPattern = getPatternForSymbol(newSymbol);

    cells[targetIdx] = {
      ...cells[targetIdx],
      symbol: newSymbol,
      pattern: newPattern,
      flag: "ok",
      conf: 1.0,
    };

    const tokens = (editingText || selectedItem.final_text || "").split("");
    if (targetIdx < tokens.length) {
      tokens[targetIdx] = newSymbol;
    }
    const updatedText = tokens.join("");
    setEditingText(updatedText);

    setSavingRevision(true);
    try {
      const res = await patchScanItem(selectedItem.id, {
        final_text: updatedText,
        notes: editingNote,
        cells_json: cells,
        correction: {
          cell_id: cell.id,
          from_symbol: oldSymbol,
          to_symbol: newSymbol,
          from_pattern: oldPattern,
          to_pattern: newPattern,
          consent_dataset: isDatasetConsentOn(),
        },
      });
      setSelectedItem(res.item);
      await loadActiveSessionDetail(activeSessionId);
      await loadSessionsList(activeSessionId, false);
      announce(
        `Sel ${cell.id} diubah dari ${oldSymbol} menjadi ${newSymbol}. Revisi baru tersimpan.`,
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRevision(false);
    }
  };

  const handleSaveManualRevision = async () => {
    if (!selectedItem) return;
    setSavingRevision(true);
    try {
      const res = await patchScanItem(selectedItem.id, {
        final_text: editingText,
        notes: editingNote,
      });
      setSelectedItem(res.item);
      await loadActiveSessionDetail(activeSessionId);
      await loadSessionsList(activeSessionId, false);
      announce("Revisi baru tersimpan.");
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRevision(false);
    }
  };

  const handleMergeSessionParagraph = () => {
    const items = activeSession?.items || [];
    if (items.length === 0) return "";
    return items
      .map((it) => (it.final_text || "").trim())
      .filter(Boolean)
      .join(" ");
  };

  const filteredSessions = sessions.filter((s) => {
    const q = sessionFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.title || "").toLowerCase().includes(q) ||
      (s.last_preview || "").toLowerCase().includes(q)
    );
  });

  const pairUrl = pairToken
    ? `${window.location.origin}${window.location.pathname}?pair=${encodeURIComponent(pairToken)}`
    : "";

  const sessionItems = activeSession?.items || [];
  const selectedCells = selectedItem?.cells_json || [];
  const reviewCellsCount = selectedCells.filter(
    (c) => c.flag === "review" || (c.conf ?? 1) < 0.65,
  ).length;
  const activeCell = selectedCellIdx !== null ? selectedCells[selectedCellIdx] : null;
  const reviewItemsInSession = sessionItems.filter((it) => it.status === "needs_review").length;

  // ============================================================================
  // TAMPILAN 1: BERANDA APLIKASI (Bersih, Solid, Responsif, Tanpa Slop)
  // ============================================================================
  if (subView === "beranda") {
    const modelTitle = formatModelTitle(healthInfo?.model_version);
    const modelSub = formatModelSubtitle(healthInfo);

    return (
      <div className="flex flex-col gap-7">
        {/* Metrik Data Akun & Sesi (Responsif di HP, Tablet, & Desktop) */}
        <section aria-label="Ringkasan akun dan sesi">
          <dl className="m-0 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="card-interactive rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
              <dt className="text-[0.78rem] sm:text-[0.82rem] font-semibold text-muted-theme">
                Sesi Tersimpan
              </dt>
              <dd className="m-0 mt-1 font-[family-name:var(--font-display)] text-[1.8rem] sm:text-[2.4rem] leading-none text-[var(--text)] tabular-nums">
                {sessions.length}
              </dd>
            </div>

            <div className="card-interactive rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
              <dt className="text-[0.78rem] sm:text-[0.82rem] font-semibold text-muted-theme">
                Item Sesi Aktif
              </dt>
              <dd className="m-0 mt-1 font-[family-name:var(--font-display)] text-[1.8rem] sm:text-[2.4rem] leading-none text-[var(--text)] tabular-nums">
                {sessionItems.length}
              </dd>
            </div>

            <div className="card-interactive rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
              <dt className="flex items-center justify-between text-[0.78rem] sm:text-[0.82rem] font-semibold text-muted-theme">
                <span>Perlu Ditinjau</span>
                {reviewItemsInSession > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRightTab("alternatif");
                      switchSubView("scan");
                    }}
                    className="border-0 bg-transparent p-0 text-[0.76rem] font-bold text-[var(--primary)] underline"
                  >
                    Buka
                  </button>
                )}
              </dt>
              <dd
                className={`m-0 mt-1 font-[family-name:var(--font-display)] text-[1.8rem] sm:text-[2.4rem] leading-none tabular-nums ${
                  reviewItemsInSession > 0 ? "text-[var(--primary)]" : "text-[var(--text)]"
                }`}
              >
                {reviewItemsInSession}
              </dd>
            </div>

            <div className="card-interactive rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
              <dt className="truncate text-[0.78rem] sm:text-[0.82rem] font-semibold text-muted-theme" title={modelSub}>
                {modelSub}
              </dt>
              <dd className="m-0 mt-1 truncate font-[family-name:var(--font-display)] text-[1.8rem] sm:text-[2.4rem] leading-none text-[var(--text)]">
                {modelTitle}
              </dd>
            </div>
          </dl>
        </section>

        {/* Dua Kolom Bersih: Sesi Terbaru (7 Kolom) + Pratinjau Sesi Aktif (5 Kolom) */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Kolom Kiri (7 Kolom): 5 Sesi Terbaru dengan Batas Tinggi Terkendali */}
          <section
            aria-labelledby="judul-sesi-terbaru"
            className="flex flex-col gap-4 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h2 id="judul-sesi-terbaru" className="m-0 text-[1.12rem] font-bold text-[var(--text)]">
                  Sesi Terbaru
                </h2>
                <p className="m-0 mt-0.5 text-[0.84rem] text-muted-theme">
                  Ringkasan 5 sesi terakhir Anda di ruang kerja.
                </p>
              </div>

              <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
                <div className="relative flex flex-1 sm:w-[170px] items-center">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 text-muted-theme"
                    aria-hidden="true"
                  />
                  <label htmlFor="cari-sesi-beranda" className="sr-only">
                    Cari sesi
                  </label>
                  <input
                    id="cari-sesi-beranda"
                    type="search"
                    value={sessionFilter}
                    onChange={(e) => setSessionFilter(e.target.value)}
                    placeholder="Cari sesi..."
                    className="field !min-h-[36px] !py-1 !pl-8 !text-[0.84rem]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  className="btn btn-primary btn-sm !min-h-[36px]"
                >
                  <Plus size={15} aria-hidden="true" />
                  <span>Sesi Baru</span>
                </button>
              </div>
            </div>

            {sessionsState === "loading" && (
              <p className="m-0 py-6 text-[0.88rem] text-muted-theme" role="status">
                Memuat daftar sesi dari ruang penyimpanan...
              </p>
            )}

            {sessionsState === "ready" && filteredSessions.length === 0 && (
              <p className="m-0 py-6 text-[0.88rem] text-muted-theme">
                Tidak ada sesi yang cocok dengan pencarian &ldquo;{sessionFilter}&rdquo;.
              </p>
            )}

            {/* Daftar Sesi Terbatas (Maksimal 5) dengan Scroll Mandiri (Bukan Mengulur Layar) */}
            <div className="m-0 flex flex-col divide-y divide-[var(--border-subtle)] max-h-[360px] overflow-y-auto pr-1">
              {filteredSessions.slice(0, 5).map((ses) => {
                const isSelected = ses.id === activeSessionId;
                return (
                  <div
                    key={ses.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-[0.94rem] text-[var(--text)]">
                          {ses.pinned ? "[Disematkan] " : ""}
                          {ses.title}
                        </strong>
                        {isSelected && (
                          <span className="status-chip status-chip-ok">Aktif</span>
                        )}
                      </div>
                      <p className="m-0 mt-0.5 line-clamp-1 text-[0.82rem] text-muted-theme">
                        {ses.last_preview ||
                          "Belum ada tangkapan. Tekan Pindai untuk mulai membaca."}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t border-[var(--border-subtle)]/40 sm:border-0">
                      <span className="text-[0.78rem] font-semibold text-muted-theme tabular-nums mr-1">
                        {ses.scan_count ?? 0} item
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSessionId(ses.id);
                            switchSubView("scan");
                          }}
                          className="btn btn-primary btn-sm !min-h-[32px] !px-3 !text-[0.8rem]"
                        >
                          Pindai
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSessionId(ses.id);
                            switchSubView("sesi");
                          }}
                          className="btn btn-secondary btn-sm !min-h-[32px] !px-3 !text-[0.8rem]"
                        >
                          Detail
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tombol Footer ke Tab Riwayat bila ada lebih dari 5 sesi */}
            {filteredSessions.length > 5 && (
              <div className="border-t border-[var(--border-subtle)] pt-3">
                <button
                  type="button"
                  onClick={() => switchSubView("sesi")}
                  className="btn btn-secondary w-full !justify-center !min-h-[38px] text-[0.84rem] font-bold"
                >
                  <span>Buka Semua {filteredSessions.length} Sesi di Tab Riwayat</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </section>

          {/* Kolom Kanan (5 Kolom): Pratinjau Bacaan Terakhir di Sesi Aktif */}
          <section
            aria-labelledby="judul-tangkapan-terakhir"
            className="flex flex-col gap-4 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-6 lg:col-span-5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h2 id="judul-tangkapan-terakhir" className="m-0 text-[1.12rem] font-bold text-[var(--text)]">
                  Bacaan Terakhir
                </h2>
                <p className="m-0 mt-0.5 truncate text-[0.84rem] text-muted-theme max-w-[200px]">
                  {activeSession?.title || "Sesi aktif"}
                </p>
              </div>
              {selectedItem && (
                <span
                  className={`status-chip ${
                    selectedItem.status === "needs_review"
                      ? "status-chip-review"
                      : "status-chip-ok"
                  }`}
                >
                  {Math.round((selectedItem.confidence || 0) * 100)}% yakin
                </span>
              )}
            </div>

            {selectedItem ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-[14px] bg-[var(--surface-sunken)] p-4 sm:p-5">
                  <span className="text-[0.78rem] font-semibold text-muted-theme">
                    Teks Terjemahan
                  </span>
                  <p className="m-0 mt-1.5 break-words text-[1.25rem] font-bold leading-snug">
                    {selectedItem.final_text}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[0.84rem] text-muted-theme">
                  <span>{selectedItem.cell_count || selectedCells.length} sel terdeteksi</span>
                  <span>{reviewCellsCount} sel perlu ditinjau</span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => speakText(selectedItem.final_text || "")}
                    className="btn btn-secondary btn-sm flex-1 !min-h-[40px]"
                  >
                    <Volume2 size={15} aria-hidden="true" />
                    <span>Bacakan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSubView("scan")}
                    className="btn btn-primary btn-sm flex-1 !min-h-[40px]"
                  >
                    <span>Buka di Ruang Scan</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Camera}
                title="Belum ada bacaan di sesi ini"
                description="Arahkan kamera ke lembaran Braille atau unggah foto untuk melihat hasil bacaan dan diagram 6-titik di sini."
                actionLabel="Mulai Pindai Sekarang"
                onAction={() => switchSubView("scan")}
              />
            )}
          </section>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TAMPILAN 3: UTAS SESI & RIWAYAT
  // ============================================================================
  if (subView === "sesi") {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Kolom Kiri (4 Kolom): Daftar Semua Sesi */}
        <aside aria-label="Daftar sesi pindai" className="card flex flex-col gap-4 lg:col-span-4">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <h2 className="m-0 text-[1.08rem] font-bold">Daftar Sesi</h2>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleCreateSession}>
              <Plus size={16} aria-hidden="true" />
              <span>Sesi Baru</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 text-muted-theme"
              aria-hidden="true"
            />
            <label htmlFor="cari-sesi-utas" className="sr-only">
              Cari sesi
            </label>
            <input
              id="cari-sesi-utas"
              type="search"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              placeholder="Cari sesi atau teks..."
              className="field !min-h-[40px] !py-1.5 !pl-9 !text-[0.86rem]"
            />
          </div>

          <ul className="m-0 flex max-h-[540px] list-none flex-col gap-2.5 overflow-y-auto p-0">
            {filteredSessions.map((ses, idx) => {
              const isSelected = ses.id === activeSessionId;
              return (
                <li
                  key={ses.id}
                  className={`rounded-[16px] border p-3.5 transition-colors ${
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--surface-sunken)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface)]"
                  }`}
                >
                  {renamingId === ses.id ? (
                    <div className="flex flex-col gap-2">
                      <label htmlFor={`rename-${ses.id}`} className="sr-only">
                        Nama sesi baru
                      </label>
                      <input
                        id={`rename-${ses.id}`}
                        type="text"
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="field !min-h-[38px] !py-1 !text-[0.86rem]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm flex-1"
                          onClick={() => handleSaveRename(ses.id)}
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setRenamingId(null)}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-[0.76rem] font-semibold text-muted-theme">
                        <span>Sesi #{idx + 1}</span>
                        <span>{ses.scan_count ?? 0} tangkapan</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSessionId(ses.id)}
                        className="border-0 bg-transparent p-0 text-left text-[0.96rem] font-bold text-[var(--text)]"
                      >
                        {ses.pinned ? "★ " : ""}
                        {ses.title}
                      </button>
                      <p className="m-0 line-clamp-2 text-[0.83rem] text-muted-theme">
                        {ses.last_preview || "Belum ada hasil pindai."}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem]"
                          onClick={() => handleTogglePin(ses)}
                        >
                          <Pin size={13} aria-hidden="true" />
                          <span>{ses.pinned ? "Lepas" : "Semat"}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem]"
                          onClick={() => {
                            setRenamingId(ses.id);
                            setRenameText(ses.title);
                          }}
                        >
                          Ubah Nama
                        </button>
                        {sessions.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem]"
                            onClick={() => handleDeleteSession(ses)}
                            aria-label={`Hapus sesi ${ses.title}`}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Kolom Kanan (8 Kolom): Utas Sesi Terpilih */}
        <section
          aria-labelledby="judul-utas-aktif"
          className="card flex flex-col gap-5 lg:col-span-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="judul-utas-aktif" className="m-0 text-[1.28rem] font-bold">
                {activeSession?.title || "Utas Sesi"}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => switchSubView("scan")}
                className="btn btn-primary btn-sm"
              >
                <Camera size={15} aria-hidden="true" />
                <span>Tambah Pindai Baru</span>
              </button>
              {sessionItems.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const gabungan = handleMergeSessionParagraph();
                      exportToTXT(gabungan, `${activeSession?.title || "Sesi_Braille"}.txt`);
                      announce("Seluruh sesi diekspor sebagai TXT.");
                    }}
                  >
                    <FileText size={15} aria-hidden="true" />
                    <span>Ekspor TXT</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const gabungan = handleMergeSessionParagraph();
                      const ok = exportToPDF(
                        gabungan,
                        "",
                        activeSession?.title || "Sesi Pindai Braille",
                      );
                      setPdfBlocked(!ok);
                    }}
                  >
                    <Download size={15} aria-hidden="true" />
                    <span>Ekspor PDF</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <dl className="meta-grid">
            <div>
              <dt>Jumlah Tangkapan</dt>
              <dd>{sessionItems.length} item</dd>
            </div>
            <div>
              <dt>Perlu Ditinjau</dt>
              <dd>{reviewItemsInSession} item</dd>
            </div>
            <div>
              <dt>Pemilik Sesi</dt>
              <dd className="truncate">{currentUser?.name || currentUser?.email || "Pengguna"}</dd>
            </div>
            <div>
              <dt>Model Deteksi</dt>
              <dd className="truncate">{formatModelTitle(healthInfo?.model_version)}</dd>
            </div>
          </dl>

          {pdfBlocked && (
            <div role="alert" className="alert-box">
              Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.
            </div>
          )}

          {sessionItems.length === 0 ? (
            <EmptyState
              icon={Camera}
              title="Belum ada hasil pindai di sesi ini"
              description="Arahkan kamera ke tulisan Braille atau unggah berkas foto di Ruang Scan untuk memulai pencatatan."
              actionLabel="Buka Ruang Scan"
              onAction={() => switchSubView("scan")}
            />
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3.5 p-0">
              {sessionItems.map((it, idx) => {
                const needsReview = it.status === "needs_review";
                return (
                  <li
                    key={it.id}
                    className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]/50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[0.8rem] font-semibold text-muted-theme">
                        Tangkapan #{idx + 1} · Mode {it.mode} · Sumber {it.source} ·{" "}
                        {it.cell_count || 0} sel
                      </span>
                      <span
                        className={`status-chip ${
                          needsReview ? "status-chip-review" : "status-chip-ok"
                        }`}
                      >
                        {needsReview ? (
                          <TriangleAlert size={13} aria-hidden="true" />
                        ) : (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        )}
                        <span>
                          {needsReview ? "Perlu ditinjau" : "Yakin"} (
                          {Math.round((it.confidence || 0) * 100)}%)
                        </span>
                      </span>
                    </div>

                    <p className="m-0 my-2.5 whitespace-pre-wrap text-[1.22rem] font-bold">
                      {it.final_text || "(Tidak ada teks)"}
                    </p>

                    {it.raw_text && it.raw_text !== it.final_text && (
                      <p className="m-0 mb-2 text-[0.83rem] text-muted-theme">
                        Bacaan awal sebelum kamus: <strong>{it.raw_text}</strong>
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedItem(it);
                          setEditingText(it.final_text || "");
                          setEditingNote(it.notes || "");
                          setSelectedCellIdx(0);
                          setRightTab("alternatif");
                          switchSubView("scan");
                          announce(`Membuka tangkapan nomor ${idx + 1} di panel alternatif.`);
                        }}
                      >
                        Periksa Sel ({it.cell_count || 0})
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => speakText(it.final_text || "")}
                      >
                        <Volume2 size={15} aria-hidden="true" />
                        <span>Bacakan</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(it.final_text || "");
                          announce("Teks disalin ke papan klip.");
                        }}
                      >
                        <Copy size={15} aria-hidden="true" />
                        <span>Salin</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    );
  }

  // ============================================================================
  // TAMPILAN 2 (DEFAULT): RUANG SCAN BERDAMPINGAN 7:5
  // (Toolbar Rapi di HP & Desktop, Tanpa Label Monospace Kaku)
  // ============================================================================
  return (
    <div className="flex flex-col gap-5">
      {/* JEJAK NAVIGASI RUANG SCAN */}
      <nav
        aria-label="Jejak Navigasi Sesi"
        className="flex items-center gap-1.5 text-xs font-medium text-muted-theme px-1"
      >
        <button
          type="button"
          onClick={() => switchSubView("beranda")}
          className="hover:text-[var(--text)] transition-colors border-0 bg-transparent p-0 cursor-pointer font-medium"
        >
          Studio
        </button>
        <span aria-hidden="true" className="opacity-40">/</span>
        <button
          type="button"
          onClick={() => switchSubView("sesi")}
          className="hover:text-[var(--text)] transition-colors border-0 bg-transparent p-0 cursor-pointer font-medium"
        >
          Riwayat Sesi
        </button>
        {activeSession?.title && (
          <>
            <span aria-hidden="true" className="opacity-40">/</span>
            <span className="font-semibold text-[var(--text)] truncate max-w-[200px] sm:max-w-[320px]">
              {activeSession.title}
            </span>
          </>
        )}
      </nav>

      {/* DECK KONTROL TERPADU RUANG SCAN */}
      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3.5">
          {/* Baris 1: Sesi Aktif & Indikator Sesi */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--primary)] font-bold text-[0.85rem] flex-none">
                #
              </span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <label htmlFor="pilih-sesi-aktif" className="sr-only">
                  Pilih Sesi Braille
                </label>
                <select
                  id="pilih-sesi-aktif"
                  value={activeSessionId || ""}
                  onChange={(e) => setActiveSessionId(e.target.value)}
                  className="field !min-h-[38px] !max-w-[280px] sm:!max-w-[320px] flex-1 !py-1 !px-3 !text-[0.86rem] font-bold text-[var(--text)]"
                >
                  {sessions.length === 0 ? (
                    <option value="">Sesi 001 · Catatan Braille</option>
                  ) : (
                    sessions.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        Sesi {String(i + 1).padStart(2, "0")} · {s.title}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  aria-label="Buat sesi pindai baru"
                  title="Buat sesi baru"
                  className="btn btn-secondary btn-sm !h-[38px] !w-[38px] flex-none !p-0"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="status-chip status-chip-ok text-[0.78rem]">
                {activeSession?.title ? `${activeSession.title} aktif` : "Sesi Aktif"}
              </span>
              <span className="text-[0.8rem] text-muted-theme font-medium tabular-nums">
                {sessionItems.length} hasil
              </span>
            </div>
          </div>

          {/* Baris 2: Pemilihan Mode & Sumber Citra */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[0.78rem] font-semibold text-muted-theme uppercase tracking-wider hidden sm:inline">
                Mode:
              </span>
              <div
                className="segmented-bar flex-1 sm:flex-none flex flex-nowrap overflow-x-auto no-scrollbar max-w-full"
                role="group"
                aria-label="Pilih mode pemindaian"
              >
                {[
                  { id: "live", label: "Live" },
                  { id: "sentence", label: "Kalimat" },
                  { id: "photo", label: "Foto Presisi" },
                  { id: "file", label: "Berkas" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={scanMode === m.id}
                    onClick={() => {
                      setScanMode(m.id);
                      if (m.id === "file") {
                        setSourceMode("upload");
                        setLiveStreaming(false);
                      } else if (sourceMode === "upload") {
                        setSourceMode("webcam");
                      }
                      if (m.id === "live" && isCameraActive) setLiveStreaming(true);
                      if (m.id !== "live") setLiveStreaming(false);
                      announce(`Mode ${m.label} dipilih.`);
                    }}
                    className="segmented-item flex-1 sm:flex-none text-center"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[0.78rem] font-semibold text-muted-theme uppercase tracking-wider hidden sm:inline">
                Sumber:
              </span>
              <div
                className="segmented-bar flex-1 sm:flex-none flex flex-nowrap overflow-x-auto no-scrollbar max-w-full"
                role="group"
                aria-label="Pilih sumber kamera"
              >
                <Tooltip text="Gunakan webcam laptop / komputer utama" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "webcam"}
                    onClick={() => setSourceMode("webcam")}
                    className="segmented-item w-full"
                  >
                    <Camera size={14} aria-hidden="true" />
                    <span>Kamera</span>
                  </button>
                </Tooltip>

                <Tooltip text="Hubungkan kamera HP via QR code untuk memindai dari atas meja" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "phone"}
                    onClick={() => {
                      setSourceMode("phone");
                      if (!pairToken) startPhonePairing();
                    }}
                    className="segmented-item w-full"
                  >
                    <Smartphone size={14} aria-hidden="true" />
                    <span>Kamera HP</span>
                  </button>
                </Tooltip>

                <Tooltip text="Unggah foto lembar Braille dari penyimpanan berkas" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "upload"}
                    onClick={() => {
                      setSourceMode("upload");
                      fileInputRef.current?.click();
                    }}
                    className="segmented-item w-full"
                  >
                    <Upload size={14} aria-hidden="true" />
                    <span>Unggah</span>
                  </button>
                </Tooltip>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={handleUploadFile}
            />
          </div>
        </div>
      </div>

      {/* RUANG KERJA BERDAMPINGAN 7:5 (Kamera di Kiri, Panel Hasil di Kanan) */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* KOLOM KIRI (7/12): VIEWFINDER KAMERA & KONTROL */}
        <section
          aria-labelledby="judul-viewfinder"
          className="card flex flex-col gap-4 xl:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="judul-viewfinder" className="m-0 text-[1.06rem] font-bold">
              Kamera &amp; Deteksi Poligon
            </h2>

            <div className="flex items-center gap-2">
              {liveStreaming && liveLatencyMs > 0 && (
                <span className="text-[0.78rem] font-semibold text-muted-theme tabular-nums">
                  {liveLatencyMs} ms
                </span>
              )}
              <span
                className={`status-chip ${
                  sharp > 0 && sharp < BLUR_MIN ? "status-chip-review" : "status-chip-ok"
                }`}
              >
                {sharp > 0 && sharp < BLUR_MIN ? (
                  <TriangleAlert size={13} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={13} aria-hidden="true" />
                )}
                <span>
                  {sharp > 0
                    ? `Ketajaman: ${sharpnessLabel(sharp)} (${sharp})`
                    : "Siap memeriksa mutu"}
                </span>
              </span>
            </div>
          </div>

          {/* Panel Penyandingan HP bila sumber = phone */}
          {sourceMode === "phone" && (
            <div className="surface-subtle flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-[0.95rem]">Sambungkan Kamera Belakang HP</strong>
                <span className="status-chip">
                  {pairPeers > 0 ? `${pairPeers} HP Terhubung` : "Menunggu HP..."}
                </span>
              </div>
              <p className="m-0 text-[0.85rem] text-muted-theme">
                Buka tautan di bawah ini pada browser HP untuk mengirim foto langsung ke{" "}
                <strong>{activeSession?.title || "sesi aktif"}</strong>:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label="Tautan penyandingan kamera HP"
                  value={pairUrl || "Membuat tautan..."}
                  className="field flex-1 !min-h-[38px] !py-1.5 !text-[0.82rem]"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!pairUrl}
                  onClick={() => {
                    navigator.clipboard?.writeText(pairUrl);
                    announce("Tautan penyandingan HP disalin.");
                  }}
                >
                  <Copy size={15} aria-hidden="true" />
                  <span>Salin Tautan</span>
                </button>
              </div>
            </div>
          )}

          {/* Viewfinder Kamera Halus dengan HUD Sudut & Laser Scan */}
          <div
            className={
              isCameraFullscreen
                ? "fixed inset-0 z-[99999] h-[100dvh] w-screen bg-black flex flex-col justify-between overflow-hidden p-0 sm:p-4 select-none"
                : "camera-viewport relative overflow-hidden"
            }
          >
            {/* Header Kontrol Khusus Layar Penuh */}
            {isCameraFullscreen ? (
              <div className="relative z-30 flex items-center justify-between w-full px-4 pt-[max(12px,env(safe-area-inset-top))]">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-[0.8rem] font-bold text-[#E6FF2E] backdrop-blur-md border border-white/15">
                    <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-ping" />
                    <span>Kamera Layar Penuh</span>
                  </span>
                  <span className="hidden sm:inline-flex rounded-full bg-black/60 px-2.5 py-1 text-[0.76rem] font-semibold text-white/80 backdrop-blur-md border border-white/10">
                    Mode: {scanMode === "sentence" ? "Kalimat" : scanMode === "photo" ? "Foto Presisi" : "Live"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={toggleCameraFullscreen}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 text-white hover:bg-black/90 hover:text-[#E6FF2E] backdrop-blur-md border border-white/20 text-[0.82rem] font-bold transition-colors min-h-[40px]"
                >
                  <Minimize2 size={16} aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={toggleCameraFullscreen}
                aria-label="Layar penuh kamera"
                title="Buka kamera layar penuh"
                className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 hover:text-[#E6FF2E] backdrop-blur-sm border border-white/15 transition-all shadow-sm"
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
            )}

            {/* HUD Optical Corners */}
            <div className={`hud-corner hud-corner-tl ${isCameraFullscreen ? "!top-6 !left-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-tr ${isCameraFullscreen ? "!top-6 !right-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-bl ${isCameraFullscreen ? "!bottom-28 !left-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-br ${isCameraFullscreen ? "!bottom-28 !right-6" : ""}`} aria-hidden="true" />

            {sourceMode === "phone" ? (
              <>
                {phoneStreamUrl ? (
                  <>
                    <img
                      src={phoneStreamUrl}
                      alt="Pratinjau langsung kamera HP"
                      className={
                        isCameraFullscreen
                          ? "absolute inset-0 h-full w-full object-cover sm:object-contain"
                          : "h-full w-full object-contain"
                      }
                    />
                    <div
                      aria-hidden="true"
                      className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/75 px-3 py-1 text-[0.78rem] font-bold text-[#E6FF2E] backdrop-blur-sm shadow-sm"
                    >
                      <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-ping" />
                      <span>Live Kamera HP</span>
                    </div>
                    <div className="scanner-sweep-line" aria-hidden="true" />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center z-10">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                      <Smartphone size={22} aria-hidden="true" />
                    </span>
                    <span className="text-[1.02rem] font-bold text-white">
                      {pairPeers > 0
                        ? "HP Terhubung · Siap Pindai"
                        : "Kamera HP Belum Terhubung"}
                    </span>
                    <span className="max-w-[36ch] text-[0.82rem] leading-relaxed text-white/75">
                      {pairPeers > 0
                        ? "Buka kamera di layar HP Anda untuk memunculkan pratinjau live di sini."
                        : "Buka tautan penyandingan di peramban HP Anda untuk menampilkan pratinjau langsung."}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                {isCameraActive && <div className="hud-crosshair" aria-hidden="true" />}

                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  width={1280}
                  height={720}
                  aria-label="Pratinjau kamera dengan overlay poligon Braille"
                  className={
                    isCameraFullscreen
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

                {isCameraActive && (
                  <div className="scanner-sweep-line" aria-hidden="true" />
                )}

                {!isCameraActive && (
                  <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center z-10">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
                      <CameraOff size={22} aria-hidden="true" />
                    </span>
                    <span className="text-[1.02rem] font-bold text-white">Kamera Belum Aktif</span>
                    <span className="max-w-[34ch] text-[0.82rem] leading-relaxed text-white/75">
                      Posisikan lembar Braille dengan pencahayaan dari samping agar bayangan titik timbul jelas.
                    </span>
                  </div>
                )}

                {!isCameraFullscreen && isCameraActive && scanMode === "live" && livePreviewText && (
                  <div
                    aria-hidden="true"
                    className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 rounded-[10px] bg-black/65 px-4 py-2.5 backdrop-blur-md text-white"
                  >
                    <span className="truncate text-[0.94rem] font-bold">
                      {livePreviewText}
                    </span>
                    <span className="flex-none text-[0.78rem] font-semibold text-[#E6FF2E] tabular-nums">
                      {livePolygons.length} sel {liveConfirmed ? "· stabil" : ""}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Kontrol Bawah Khusus Layar Penuh */}
            {isCameraFullscreen && (
              <div className="relative z-30 flex flex-col items-center gap-3 w-full px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                {scanMode === "live" && livePreviewText && (
                  <div
                    aria-hidden="true"
                    className="w-full max-w-md flex items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-2.5 backdrop-blur-md text-white border border-white/20 shadow-2xl"
                  >
                    <span className="truncate text-[0.95rem] font-bold">{livePreviewText}</span>
                    <span className="flex-none text-[0.8rem] font-semibold text-[#E6FF2E] tabular-nums">
                      {livePolygons.length} sel {liveConfirmed ? "· stabil" : ""}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-center gap-4 sm:gap-6 w-full max-w-sm">
                  <div className="flex items-center gap-1 bg-black/70 p-1.5 rounded-full backdrop-blur-md border border-white/20">
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode("live");
                        setLiveStreaming(true);
                        announce("Mode Live");
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all ${
                        scanMode === "live"
                          ? "bg-[#E6FF2E] text-[#0A1628]"
                          : "text-white/80 hover:text-white"
                      }`}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode("sentence");
                        setLiveStreaming(false);
                        announce("Mode Kalimat");
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all ${
                        scanMode === "sentence"
                          ? "bg-[#E6FF2E] text-[#0A1628]"
                          : "text-white/80 hover:text-white"
                      }`}
                    >
                      Kalimat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode("photo");
                        setLiveStreaming(false);
                        announce("Mode Foto");
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all ${
                        scanMode === "photo"
                          ? "bg-[#E6FF2E] text-[#0A1628]"
                          : "text-white/80 hover:text-white"
                      }`}
                    >
                      Foto
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (sourceMode === "phone") {
                        handleRequestCaptureFromPhone();
                      } else if (scanMode === "sentence") {
                        executeSentenceBurstScan();
                      } else {
                        executeSingleOrFreezeScan(null, "webcam");
                      }
                    }}
                    disabled={status === "loading" || (!isCameraActive && sourceMode !== "phone")}
                    aria-label="Ambil foto Braille"
                    className="flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[#E6FF2E] text-[#0A1628] shadow-[0_0_24px_rgba(230,255,46,0.35)] active:scale-95 transition-all border-4 border-white/40 disabled:opacity-50"
                  >
                    <Camera size={28} strokeWidth={2.4} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

          {/* Bar Kontrol Kamera */}
          <div className="flex flex-wrap items-center gap-2.5">
            {sourceMode === "phone" ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary flex-1"
                  onClick={handleRequestCaptureFromPhone}
                  disabled={pairPeers === 0 || status === "loading"}
                >
                  <Camera size={18} aria-hidden="true" />
                  <span>
                    {status === "loading"
                      ? "Memproses foto..."
                      : pairPeers === 0
                        ? "Menunggu HP Terhubung..."
                        : "Tangkap dari Kamera HP"}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!pairToken) {
                      startPhonePairing();
                    } else {
                      navigator.clipboard?.writeText(pairUrl);
                      announce("Tautan penyandingan HP disalin.");
                    }
                  }}
                >
                  <Copy size={16} aria-hidden="true" />
                  <span>Salin Tautan HP</span>
                </button>
              </>
            ) : !isCameraActive ? (
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={handleTurnOnCamera}
              >
                <Camera size={18} aria-hidden="true" />
                <span>Nyalakan Kamera</span>
              </button>
            ) : (
              <>
                {scanMode === "sentence" ? (
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={executeSentenceBurstScan}
                    disabled={status === "loading"}
                  >
                    <Check size={18} aria-hidden="true" />
                    <span>
                      {burstProgress > 0
                        ? `Menangkap Frame ${burstProgress}/3...`
                        : "Tangkap Kalimat (Burst 3 Frame)"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => executeSingleOrFreezeScan(null, "webcam")}
                    disabled={status === "loading"}
                  >
                    <Check size={18} aria-hidden="true" />
                    <span>
                      {status === "loading"
                        ? "Memproses..."
                        : scanMode === "live"
                          ? "Tangkap & Simpan ke Sesi"
                          : "Tangkap Foto Presisi"}
                    </span>
                  </button>
                )}

                {scanMode === "live" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setLiveStreaming((v) => !v)}
                  >
                    {liveStreaming ? "Jeda Live" : "Lanjutkan Live"}
                  </button>
                )}

                <button type="button" className="btn btn-secondary" onClick={handleTurnOffCamera}>
                  <CameraOff size={18} aria-hidden="true" />
                  <span>Matikan</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={toggleCameraFullscreen}
              aria-label="Mode layar penuh kamera"
              title="Mode layar penuh"
            >
              <Maximize2 size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Layar Penuh</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={18} aria-hidden="true" />
              <span>Unggah Berkas</span>
            </button>
          </div>

          {/* Pesan Status & Peringatan */}
          {cameraError && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Kamera tidak bisa dibuka.</strong> {cameraError} Izinkan akses kamera di
              pengaturan browser, atau unggah berkas foto.
            </div>
          )}

          {status === "blur" && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Gambar masih buram (Ketajaman {sharp} &lt; {BLUR_MIN}).</strong> Tahan kamera
              sebentar dan tambah cahaya dari samping lalu coba lagi.
            </div>
          )}

          {status === "empty" && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Belum ada titik Braille terbaca.</strong> Coba dekatkan kamera sedikit atau
              ubah arah cahaya dari samping kertas.
            </div>
          )}

          {status === "error" && (
            <div role="alert" className="alert-box text-[0.88rem]">
              <strong>Gagal memproses pindai.</strong> {errorMessage}
            </div>
          )}
        </section>

        {/* KOLOM KANAN (5/12): PANEL HASIL LENGKET 3-TAB (Hasil | Alternatif | Revisi) */}
        <aside
          aria-label="Panel hasil dan koreksi sel"
          className="card flex flex-col gap-4 xl:sticky xl:top-6 xl:col-span-5"
        >
          {/* Tab Panel Kanan */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div className="segmented-bar w-full" role="tablist" aria-label="Panel instrumen hasil">
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "hasil"}
                onClick={() => setRightTab("hasil")}
                className="segmented-item flex-1 !min-w-0 !px-1.5 sm:!px-3 truncate text-center"
              >
                Hasil
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "alternatif"}
                onClick={() => setRightTab("alternatif")}
                className="segmented-item flex-1 !min-w-0 !px-1.5 sm:!px-3 truncate text-center flex items-center justify-center gap-1.5"
              >
                <span>Alternatif</span>
                {reviewCellsCount > 0 && (
                  <span className="rounded-full bg-[var(--limau)] px-1.5 py-0.2 text-[0.7rem] font-extrabold text-[#0B1E36]">
                    {reviewCellsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === "mutu"}
                onClick={() => setRightTab("mutu")}
                title="Rincian Mutu & Revisi"
                className="segmented-item flex-1 !min-w-0 !px-1.5 sm:!px-3 truncate text-center"
              >
                Revisi
              </button>
            </div>
          </div>

          {!selectedItem ? (
            <div className="surface-subtle flex flex-col gap-2 p-5 text-[0.9rem]">
              <strong>Belum ada hasil pindai.</strong>
              <p className="m-0 text-muted-theme">
                Arahkan kamera ke tulisan Braille lalu tekan Tangkap, atau unggah berkas foto untuk
                melihat hasil terjemahan dan koreksi per huruf di panel ini.
              </p>
            </div>
          ) : (
            <>
              {/* TAB 1: HASIL BACAAN & AKSI CEPAT */}
              {rightTab === "hasil" && (
                <div className="flex flex-col gap-4">
                  <div className="surface-subtle p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.8rem] font-semibold text-muted-theme">
                        Hasil Terjemahan Aktif
                      </span>
                      <span
                        className={`status-chip ${
                          selectedItem.status === "needs_review"
                            ? "status-chip-review"
                            : "status-chip-ok"
                        }`}
                      >
                        {selectedItem.status === "needs_review" ? "Perlu ditinjau" : "Yakin"} (
                        {Math.round((selectedItem.confidence || 0) * 100)}%)
                      </span>
                    </div>

                    <p className="m-0 mt-2.5 whitespace-pre-wrap text-[1.35rem] font-bold leading-snug">
                      {selectedItem.final_text || "(Kosong)"}
                    </p>
                  </div>

                  {/* MetaGrid Mini 4 Kolom */}
                  <dl className="meta-grid !grid-cols-2 sm:!grid-cols-4 !p-3.5">
                    <div>
                      <dt>Keyakinan</dt>
                      <dd>{Math.round((selectedItem.confidence || 0) * 100)}%</dd>
                    </div>
                    <div>
                      <dt>Jumlah Sel</dt>
                      <dd>{selectedItem.cell_count || selectedCells.length}</dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd className="capitalize">{selectedItem.mode}</dd>
                    </div>
                    <div>
                      <dt>Sumber</dt>
                      <dd className="capitalize">{selectedItem.source}</dd>
                    </div>
                  </dl>

                  {/* Aksi Cepat: Salin, Bacakan, Cek Alternatif */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => {
                        navigator.clipboard?.writeText(selectedItem.final_text || "");
                        announce("Teks hasil disalin.");
                      }}
                    >
                      <Copy size={15} aria-hidden="true" />
                      <span>Salin</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => speakText(selectedItem.final_text || "")}
                    >
                      <Volume2 size={15} aria-hidden="true" />
                      <span>Bacakan</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => setRightTab("alternatif")}
                    >
                      <span>Periksa {selectedCells.length} Sel</span>
                    </button>
                  </div>

                  {/* Teks Mentah sebelum koreksi kamus */}
                  <div className="surface-subtle px-4 py-3 text-[0.83rem]">
                    <span className="block font-semibold text-muted-theme">
                      Bacaan awal sebelum koreksi kamus
                    </span>
                    <strong className="mt-0.5 block text-[0.94rem]">
                      {selectedItem.raw_text || selectedItem.final_text || "-"}
                    </strong>
                  </div>

                  {/* Editor Revisi Langsung di Tempat */}
                  <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
                    <label htmlFor="editor-revisi-cepat" className="text-[0.86rem] font-semibold">
                      Ubah Teks atau Catatan (Menyimpan Revisi Baru)
                    </label>
                    <textarea
                      id="editor-revisi-cepat"
                      rows={2}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="field font-semibold"
                    />
                    <div className="flex flex-wrap gap-2">
                      <label htmlFor="catatan-item-cepat" className="sr-only">
                        Catatan pemeriksaan
                      </label>
                      <input
                        id="catatan-item-cepat"
                        type="text"
                        value={editingNote}
                        onChange={(e) => setEditingNote(e.target.value)}
                        placeholder="Catatan opsional (mis. halaman buku)..."
                        className="field flex-1 !min-h-[38px] !py-1.5 !text-[0.84rem]"
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={savingRevision}
                        onClick={handleSaveManualRevision}
                      >
                        {savingRevision ? "Menyimpan..." : "Simpan Revisi"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ALTERNATIF SEL 6-TITIK (Hamming 1) */}
              {rightTab === "alternatif" && (
                <div className="flex flex-col gap-4">
                  <p className="m-0 text-[0.86rem] text-muted-theme">
                    Pilih salah satu huruf di bawah untuk memeriksa pola 6-titik dan menggantinya
                    dengan kandidat berjarak 1 titik:
                  </p>

                  {selectedCells.length === 0 ? (
                    <p className="m-0 text-[0.86rem] text-muted-theme">
                      Tidak ada rincian koordinat sel pada tangkapan ini.
                    </p>
                  ) : (
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label="Daftar sel Braille terdeteksi"
                    >
                      {selectedCells.map((c, idx) => {
                        const isLow = c.flag === "review" || (c.conf ?? 1) < 0.65;
                        const isPicked = selectedCellIdx === idx;
                        return (
                          <button
                            key={c.id || idx}
                            type="button"
                            onClick={() => setSelectedCellIdx(isPicked ? null : idx)}
                            aria-pressed={isPicked}
                            className={`min-h-[42px] min-w-[42px] rounded-[11px] px-2.5 py-1 font-bold text-[0.95rem] transition-colors ${
                              isPicked
                                ? "border border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                                : isLow
                                  ? "border border-dashed border-[var(--peringatan-fg)] bg-[var(--peringatan-bg)] text-[var(--peringatan-fg)]"
                                  : "border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--awan-100)]"
                            }`}
                          >
                            {c.symbol}
                            {isLow ? "?" : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeCell ? (
                    <div className="surface-subtle flex flex-col gap-3.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-[0.94rem]">
                          Sel #{selectedCellIdx + 1} · Huruf &ldquo;{activeCell.symbol}&rdquo;
                        </strong>
                        <button
                          type="button"
                          className="btn btn-secondary !min-h-[32px] !px-2 !py-0.5"
                          onClick={() => setSelectedCellIdx(null)}
                          aria-label="Tutup rincian sel"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <BrailleCellDiagram
                          symbol={activeCell.symbol}
                          pattern={activeCell.pattern}
                          size={54}
                        />
                        <div className="text-[0.85rem]">
                          <div>
                            Titik aktif:{" "}
                            <strong>
                              {activeCell.pattern || getPatternForSymbol(activeCell.symbol) || "-"}
                            </strong>
                          </div>
                          <div className="text-muted-theme">
                            Keyakinan detektor: {Math.round((activeCell.conf || 0) * 100)}%
                          </div>
                        </div>
                      </div>

                      {activeCell.alternates?.length > 0 && (
                        <div className="border-t border-[var(--border-subtle)] pt-3">
                          <span className="mb-2 block text-[0.8rem] font-semibold text-muted-theme">
                            Alternatif Terdekat (Selisih 1 Titik):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {activeCell.alternates.map((alt) => (
                              <button
                                key={alt.symbol}
                                type="button"
                                disabled={savingRevision}
                                onClick={() => handleApplyCellCorrection(activeCell, alt.symbol)}
                                className="btn btn-secondary btn-sm flex items-center gap-2"
                              >
                                <BrailleCellDiagram
                                  symbol={alt.symbol}
                                  pattern={alt.pattern}
                                  size={28}
                                />
                                <span>
                                  Ganti ke <strong>{alt.symbol}</strong> ({alt.pattern})
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="m-0 text-[0.84rem] text-muted-theme">
                      Pilih salah satu tombol huruf di atas untuk melihat diagram titik dan
                      alternatifnya.
                    </p>
                  )}
                </div>
              )}

              {/* TAB 3: RINCIAN OPTIK & RIWAYAT REVISI */}
              {rightTab === "mutu" && (
                <div className="flex flex-col gap-4">
                  <dl className="meta-grid !grid-cols-2 !p-3.5">
                    <div>
                      <dt>Ketajaman</dt>
                      <dd>{selectedItem.sharpness ?? sharp}</dd>
                    </div>
                    <div>
                      <dt>Kemiringan Baris</dt>
                      <dd>{selectedItem.skew_deg ?? 0}°</dd>
                    </div>
                    <div>
                      <dt>Jarak Sel</dt>
                      <dd>{selectedItem.pitch_px ?? "-"} px</dd>
                    </div>
                    <div>
                      <dt>Model Optik</dt>
                      <dd className="truncate">{formatModelTitle(selectedItem.model_version)}</dd>
                    </div>
                  </dl>

                  {qualityInfo?.hints?.length > 0 && (
                    <div className="surface-subtle p-3.5 text-[0.85rem]">
                      <strong className="block">Saran Pencahayaan &amp; Jarak:</strong>
                      <span className="text-muted-theme">{qualityInfo.hints.join(" ")}</span>
                    </div>
                  )}

                  <div>
                    <h3 className="m-0 mb-2 text-[0.92rem] font-bold">
                      Riwayat Revisi ({selectedItem.revisions?.length || 1} versi)
                    </h3>
                    <ol className="m-0 flex max-h-[220px] list-none flex-col gap-2 overflow-y-auto p-0 text-[0.83rem]">
                      {(selectedItem.revisions || []).map((rv) => (
                        <li
                          key={rv.id || rv.revision_number}
                          className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]/60 p-3"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>
                              Revisi #{rv.revision_number} (
                              {rv.author === "model" ? "Bacaan Awal" : "Koreksi Pengguna"})
                            </span>
                            <button
                              type="button"
                              className="border-0 bg-transparent p-0 font-bold text-[var(--primary)] underline"
                              onClick={() => {
                                setEditingText(rv.text_content);
                                setRightTab("hasil");
                              }}
                            >
                              Pulihkan
                            </button>
                          </div>
                          <p className="m-0 mt-1 font-bold">{rv.text_content}</p>
                          {rv.note && <p className="m-0 mt-0.5 text-muted-theme">{rv.note}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
