import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  FolderOpen,
  ImagePlus,
  Info,
  Lock,
  Maximize2,
  Minimize2,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  Unlock,
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
  deleteSessionScan,
  getSessionDetail,
  getWsBaseUrl,
  isClaheOn,
  isDatasetConsentOn,
  listSessions,
  patchScanItem,
  translateBrailleImage,
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
    facingMode,
    startCamera,
    stopCamera,
    switchCamera,
    captureFrame,
  } = useCamera();
  const { announce } = useA11y();
  const toast = useToast();

  // Sesi dan item riwayat (Supabase) - Inisialisasi cepat dari cache lokal
  const [sessions, setSessions] = useState(() => {
    try {
      const cached = localStorage.getItem("railuma_cached_sessions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  });
  const [sessionsState, setSessionsState] = useState(() => {
    try {
      const cached = localStorage.getItem("railuma_cached_sessions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return "ready";
      }
    } catch {
      /* ignore */
    }
    return "loading";
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      const savedActive = localStorage.getItem("railuma_active_session_id");
      if (savedActive) return savedActive;
      const cached = localStorage.getItem("railuma_cached_sessions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed[0]?.id) return parsed[0].id;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  useEffect(() => {
    if (activeSessionId && !activeSessionId.startsWith("temp-")) {
      try {
        localStorage.setItem("railuma_active_session_id", activeSessionId);
      } catch {
        /* ignore */
      }
    }
  }, [activeSessionId]);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionFilter, setSessionFilter] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const sessionDropdownRef = useRef(null);

  // Mode scan: live | sentence | photo
  const [scanMode, setScanMode] = useState("live");
  // Sumber kamera: webcam | phone | upload
  const [sourceMode, setSourceMode] = useState("webcam");
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);

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
  const executeSingleOrFreezeScanRef = useRef(null);
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
  const pairPingRef = useRef(null);

  // Sensory feedback layar penuh (Flash, audio click, getaran, banner responsif)
  const [shutterFlash, setShutterFlash] = useState(false);
  const [fullscreenFeedback, setFullscreenFeedback] = useState(null);
  const feedbackTimerRef = useRef(null);

  const playShutterSound = useCallback(() => {
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
      // abaikan jika audio otomatis diblokir browser
    }
  }, []);

  const triggerShutterSensory = useCallback(() => {
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 120);
    playShutterSound();
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, [playShutterSound]);

  useEffect(() => {
    return () => {
      clearInterval(pairPingRef.current);
      clearTimeout(feedbackTimerRef.current);
      if (pairWsRef.current) {
        pairWsRef.current.close();
      }
    };
  }, []);

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
  const [copiedKey, setCopiedKey] = useState(null);

  const sessionCacheRef = useRef((() => {
    const map = new Map();
    try {
      const raw = localStorage.getItem("railuma_session_details_cache");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.entries(parsed).forEach(([k, v]) => map.set(k, v));
        }
      }
    } catch {
      /* ignore */
    }
    return map;
  })());

  const persistSessionDetailCache = useCallback((id, detail) => {
    if (!id || !detail) return;
    sessionCacheRef.current.set(id, detail);
    try {
      const obj = {};
      // Simpan maksimal 25 sesi terakhir di localStorage agar ringan
      const entries = Array.from(sessionCacheRef.current.entries()).slice(-25);
      entries.forEach(([k, v]) => {
        if (!String(k).startsWith("temp-")) obj[k] = v;
      });
      localStorage.setItem("railuma_session_details_cache", JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }, []);

  const deletedSessionIdsRef = useRef(new Set());
  const localOverridesRef = useRef(new Map());
  const pendingCreatesRef = useRef(new Map());
  const tempToRealIdRef = useRef(new Map());
  const detailReqSeqRef = useRef(0);
  const onAuthExpiredRef = useRef(onAuthExpired);
  useEffect(() => {
    onAuthExpiredRef.current = onAuthExpired;
  }, [onAuthExpired]);
  const lastValidLiveResultRef = useRef(null);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
    try {
      const clean = sessions.filter((s) => !String(s.id).startsWith("temp-"));
      localStorage.setItem("railuma_cached_sessions", JSON.stringify(clean));
    } catch {
      /* ignore */
    }
  }, [sessions]);

  useEffect(() => {
    if (!sessionDropdownOpen) return undefined;
    const handleOutside = (e) => {
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target)) {
        setSessionDropdownOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setSessionDropdownOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [sessionDropdownOpen]);

  const triggerCopy = useCallback((key, textToCopy, msg = "Teks disalin ke papan klip.") => {
    if (!textToCopy) return;
    try {
      navigator.clipboard?.writeText(textToCopy);
    } catch {
      // abaikan jika diblokir
    }
    setCopiedKey(key);
    announce(msg);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  }, [announce]);

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

  const mergeServerSessions = useCallback((serverList) => {
    const filtered = (serverList || [])
      .filter((s) => !deletedSessionIdsRef.current.has(s.id))
      .map((s) => {
        const override = localOverridesRef.current.get(s.id);
        const cachedDetail = sessionCacheRef.current.get(s.id);
        const cachedCount = Array.isArray(cachedDetail?.items) ? cachedDetail.items.length : null;
        return {
          ...s,
          ...(override || {}),
          scan_count: cachedCount !== null ? Math.max(s.scan_count || 0, cachedCount) : (s.scan_count ?? 0),
        };
      });
    const pendingList = Array.from(pendingCreatesRef.current.values()).filter(
      (p) => !deletedSessionIdsRef.current.has(p.id),
    );
    const combined = [...pendingList, ...filtered];
    combined.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return combined;
  }, []);

  const applySelectedItemFromDetail = useCallback((detail) => {
    const items = detail?.items || [];
    setSelectedItem((prev) => {
      if (prev?.isDraft) return prev;
      if (items.length > 0) {
        const last = items[items.length - 1];
        setEditingText(last.final_text || "");
        setEditingNote(last.notes || "");
        const firstReviewIdx = (last.cells_json || []).findIndex(
          (c) => c.flag === "review" || (c.conf ?? 1) < 0.65,
        );
        setSelectedCellIdx(firstReviewIdx >= 0 ? firstReviewIdx : null);
        return last;
      }
      setEditingText("");
      setEditingNote("");
      setSelectedCellIdx(null);
      return null;
    });
  }, []);

  const loadSessionsList = useCallback(
    async (selectId = null) => {
      try {
        const res = await listSessions();
        const daftar = mergeServerSessions(res.sessions || []);
        setSessions(daftar);
        setSessionsState("ready");
        if (selectId && !deletedSessionIdsRef.current.has(selectId)) {
          setActiveSessionId(selectId);
        }
      } catch (err) {
        console.error("Gagal mengambil sesi dari server:", err);
        if (err?.status === 401 && onAuthExpiredRef.current) {
          onAuthExpiredRef.current();
          return;
        }
        setSessionsState("ready");
      }
    },
    [mergeServerSessions],
  );

  const loadActiveSessionDetail = useCallback(
    async (id) => {
      const resolvedId = tempToRealIdRef.current.get(id) || id;
      if (!resolvedId || deletedSessionIdsRef.current.has(resolvedId)) {
        setActiveSession(null);
        setSelectedItem((prev) => (prev?.isDraft ? prev : null));
        return;
      }

      if (String(resolvedId).startsWith("temp-")) {
        const pending =
          pendingCreatesRef.current.get(resolvedId) ||
          sessionsRef.current.find((s) => s.id === resolvedId) || {
            id: resolvedId,
            title: "Sesi Baru",
            items: [],
          };
        const detailObj = { ...pending, items: pending.items || [] };
        setActiveSession(detailObj);
        applySelectedItemFromDetail(detailObj);
        return;
      }

      // 0ms instant response from memory cache or session list summary
      if (sessionCacheRef.current.has(resolvedId)) {
        const cached = sessionCacheRef.current.get(resolvedId);
        const override = localOverridesRef.current.get(resolvedId);
        const detailObj = { ...cached, ...(override || {}) };
        setActiveSession(detailObj);
        applySelectedItemFromDetail(detailObj);
      } else {
        const summary = sessionsRef.current.find((s) => s.id === resolvedId);
        if (summary) {
          setActiveSession((prev) =>
            prev?.id === resolvedId ? prev : { ...summary, items: [] },
          );
        }
      }

      const reqSeq = ++detailReqSeqRef.current;
      try {
        const detail = await getSessionDetail(resolvedId);
        if (!detail || deletedSessionIdsRef.current.has(resolvedId)) return;
        const override = localOverridesRef.current.get(resolvedId);
        const mergedDetail = { ...detail, ...(override || {}) };
        persistSessionDetailCache(resolvedId, mergedDetail);

        // Sinkronkan jumlah tangkapan & pratinjau ke kartu daftar sesi
        const items = mergedDetail.items || [];
        const lastPreview = items.length > 0 ? items[items.length - 1].final_text || "" : "";
        setSessions((prev) =>
          prev.map((s) =>
            s.id === resolvedId
              ? {
                  ...s,
                  title: mergedDetail.title || s.title,
                  pinned: mergedDetail.pinned ?? s.pinned,
                  scan_count: items.length,
                  last_preview: lastPreview || s.last_preview,
                }
              : s,
          ),
        );

        if (reqSeq === detailReqSeqRef.current) {
          setActiveSession(mergedDetail);
          applySelectedItemFromDetail(mergedDetail);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [applySelectedItemFromDetail, persistSessionDetailCache],
  );

  // Hanya jalankan sekali saat mount awal
  useEffect(() => {
    let active = true;
    let retryTimer = null;
    const applyLoadedSessions = (res) => {
      if (!active) return;
      const daftar = mergeServerSessions(res.sessions || []);
      setSessions(daftar);
      setSessionsState("ready");
      setActiveSessionId((currId) => {
        if (currId && (String(currId).startsWith("temp-") || daftar.some((d) => d.id === currId))) {
          return currId;
        }
        try {
          const saved = localStorage.getItem("railuma_active_session_id");
          if (saved && daftar.some((d) => d.id === saved)) return saved;
        } catch {
          /* ignore */
        }
        return daftar[0]?.id || null;
      });
    };

    listSessions()
      .then(applyLoadedSessions)
      .catch((err) => {
        if (!active) return;
        if (err?.status === 401 && onAuthExpiredRef.current) {
          onAuthExpiredRef.current();
          return;
        }
        setSessionsState("ready");
        // Coba muat ulang otomatis di latar belakang bila server sedang bangun (cold-start)
        retryTimer = setTimeout(() => {
          if (!active) return;
          listSessions().then(applyLoadedSessions).catch(() => {});
        }, 2500);
      });
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [mergeServerSessions]);

  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }
    loadActiveSessionDetail(activeSessionId);
  }, [activeSessionId, loadActiveSessionDetail]);

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
            const rawTxt = (data.raw_text || "").trim() || voted.text;
            setLivePreviewText(voted.text);
            setLiveRawText(rawTxt);
            setLiveConfirmed(voted.confirmed);
            lastValidLiveResultRef.current = {
              final_text: voted.text,
              raw_text: rawTxt,
              cells: (data.cells || []).map((c) => ({
                ...c,
                original_symbol: c.original_symbol || c.symbol,
                original_pattern: c.original_pattern || c.pattern,
              })),
              words: data.words || [],
              mean_conf: data.mean_conf ?? 0.85,
              n_cells: (data.cells || []).length,
              skew_deg: data.skew_deg ?? 0,
              pitch_px: data.pitch_px ?? 0,
              quality: data.quality || null,
              sharpness: data.quality?.sharpness ?? 0,
              timestamp: Date.now(),
            };
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
    let blob = customBlob;

    if (!blob) {
      if (!isCameraActive) {
        setStatus("nocam");
        setFullscreenFeedback({
          type: "error",
          message: "Kamera Belum Aktif",
          detail: "Nyalakan kamera terlebih dahulu sebelum mengambil foto.",
        });
        return;
      }
      const s = measureSharpness(videoRef.current);
      setSharp(s.variance);
      const hasLiveCached =
        scanMode === "live" &&
        (livePreviewText?.trim() || lastValidLiveResultRef.current?.final_text);

      if (!hasLiveCached && s.ready && s.variance < 15) {
        setStatus("blur");
        announce("Gambar terlalu gelap atau kamera tertutup. Tahan kamera sebentar lalu coba lagi.");
        setFullscreenFeedback({
          type: "blur",
          message: "Kamera Tertutup atau Terlalu Gelap",
          detail: `Ketajaman: ${s.variance} (minimal 15). Beri pencahayaan cukup dan coba lagi.`,
        });
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([80, 50, 80]);
        }
        return;
      }
      triggerShutterSensory();
      blob = await captureFrame();
    } else {
      triggerShutterSensory();
    }

    if (!blob) {
      setStatus("error");
      setErrorMessage("Gagal mengambil gambar dari kamera.");
      setFullscreenFeedback({
        type: "error",
        message: "Gagal Mengambil Gambar",
        detail: "Tidak dapat mengekstrak frame dari sensor kamera.",
      });
      return;
    }

    // JALUR INSTAN 0ms PADA MODE LIVE: jika di layar live sudah ada hasil bacaan, langsung tampilkan ke panel kanan tanpa menunggu request ulang!
    if (
      scanMode === "live" &&
      customSource === "webcam" &&
      (livePreviewText?.trim() || lastValidLiveResultRef.current?.final_text)
    ) {
      const liveSnap = lastValidLiveResultRef.current || {};
      const finalTxt = (livePreviewText || liveSnap.final_text || "").trim();
      const rawTxt = (liveRawText || liveSnap.raw_text || finalTxt).trim();
      const rawCells = livePolygons.length > 0 ? livePolygons : (liveSnap.cells || []);
      const cellsData = rawCells.map((c, idx) => ({
        ...c,
        id: c.id ?? `cell-${idx + 1}`,
        original_symbol: c.original_symbol || c.symbol,
        original_pattern: c.original_pattern || c.pattern || getPatternForSymbol(c.symbol),
      }));
      const wordsData = liveSnap.words || [];
      const hasReview =
        (liveSnap.mean_conf || 1) < 0.72 ||
        cellsData.some((c) => c.flag === "review" || (c.conf ?? 1) < 0.65);

      const draftItem = {
        id: `draft-${Date.now()}`,
        isDraft: true,
        blob,
        mode: scanMode,
        source: customSource,
        status: hasReview ? "needs_review" : "done",
        confidence: liveSnap.mean_conf ?? 0.88,
        cell_count: cellsData.length || finalTxt.replace(/\s+/g, "").length,
        raw_text: rawTxt,
        final_text: finalTxt,
        cells_json: cellsData,
        words_json: wordsData,
        sharpness: liveSnap.sharpness || sharp || 90,
        skew_deg: liveSnap.skew_deg ?? 0,
        pitch_px: liveSnap.pitch_px ?? 0,
        quality: liveSnap.quality || qualityInfo || null,
        created_at: new Date().toISOString(),
      };

      setStatus("done");
      setSelectedItem(draftItem);
      setEditingText(draftItem.final_text);
      setEditingNote("");
      setSelectedCellIdx(0);
      setRightTab("hasil");
      announce(`Tangkapan live siap diverifikasi: "${draftItem.final_text}". Silakan periksa di panel kanan lalu simpan ke sesi.`);
      toast.success("Tangkapan live siap! Periksa di panel kanan lalu simpan ke sesi.");

      setFullscreenFeedback({
        type: "done",
        message: `Tangkapan Siap: "${draftItem.final_text}"`,
        detail: "Hasil masuk ke panel kanan. Verifikasi lalu klik Simpan ke Sesi.",
      });
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFullscreenFeedback(null);
      }, 4500);
      return;
    }

    setStatus("loading");
    clearTimeout(feedbackTimerRef.current);
    setFullscreenFeedback({
      type: "loading",
      message: "Memproses foto Braille...",
      detail: "Menganalisis kisi titik dan mencocokkan kata...",
    });
    announce("Menganalisis foto Braille...");

    try {
      const res = await translateBrailleImage(blob, false);

      if (res.status === "blurry") {
        setSharp(res.sharpness ?? 0);
        setQualityInfo(res.quality || null);
        setStatus("blur");
        announce(res.message || "Gambar buram, pemindaian ditolak.");
        setFullscreenFeedback({
          type: "blur",
          message: "Gambar Terdeteksi Buram",
          detail: `Ketajaman: ${res.sharpness ?? sharp} (minimal ${BLUR_MIN}). Tahan kamera stabil.`,
        });
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([80, 50, 80]);
        }
        return;
      }

      if (res.status === "error") {
        throw new Error(res.message || "Gagal memproses gambar Braille.");
      }

      setQualityInfo(res.quality || null);
      setSharp(res.sharpness ?? 0);

      const finalTxt =
        scanMode === "live" && livePreviewText
          ? livePreviewText
          : (res.final_text || "").trim();
      const rawTxt =
        scanMode === "live" && liveRawText
          ? liveRawText
          : (res.raw_text || finalTxt).trim();

      if (!finalTxt) {
        setStatus("empty");
        announce("Belum ada Braille terbaca. Coba lebih dekat atau ubah arah cahaya.");
        setFullscreenFeedback({
          type: "empty",
          message: "Belum Ada Titik Braille Terbaca",
          detail: "Dekatkan kamera ke kertas atau posisikan cahaya dari samping.",
        });
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([80, 50, 80]);
        }
        return;
      }

      setStatus("done");
      const cellsData = (res.cells || []).map((c, idx) => ({
        ...c,
        id: c.id ?? `cell-${idx + 1}`,
        original_symbol: c.original_symbol || c.symbol,
        original_pattern: c.original_pattern || c.pattern || getPatternForSymbol(c.symbol),
      }));
      const wordsData = res.words || [];
      const hasReview =
        (res.mean_conf || 1) < 0.72 ||
        cellsData.some((c) => c.flag === "review" || (c.conf ?? 1) < 0.65) ||
        wordsData.some((row) => row.some((w) => w.ragu));

      const draftItem = {
        id: `draft-${Date.now()}`,
        isDraft: true,
        blob,
        mode: scanMode,
        source: customSource,
        status: hasReview ? "needs_review" : "done",
        confidence: res.mean_conf ?? 0.85,
        cell_count: res.n_cells ?? cellsData.length,
        raw_text: rawTxt,
        final_text: finalTxt,
        cells_json: cellsData,
        words_json: wordsData,
        sharpness: res.sharpness ?? sharp,
        skew_deg: res.skew_deg ?? 0,
        pitch_px: res.pitch_px ?? 0,
        quality: res.quality || null,
        created_at: new Date().toISOString(),
      };

      setSelectedItem(draftItem);
      setEditingText(draftItem.final_text);
      setEditingNote("");
      setSelectedCellIdx(0);
      setRightTab(scanMode === "sentence" && hasReview ? "alternatif" : "hasil");
      announce(`Tangkapan terbaca: "${draftItem.final_text}". Silakan periksa di panel kanan lalu simpan ke sesi.`);
      toast.success("Tangkapan selesai! Tinjau di panel kanan lalu simpan.");

      setFullscreenFeedback({
        type: "done",
        message: `Tangkapan Siap: "${draftItem.final_text}"`,
        detail: "Hasil belum disimpan. Periksa di panel kanan lalu klik Simpan ke Sesi.",
      });
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => {
        setFullscreenFeedback(null);
      }, 5000);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Tidak dapat menghubungi server.");
      setFullscreenFeedback({
        type: "error",
        message: "Gagal Memproses Gambar",
        detail: err.message || "Periksa koneksi internet dan coba lagi.",
      });
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([90, 60, 90]);
      }
    }
  };
  executeSingleOrFreezeScanRef.current = executeSingleOrFreezeScan;

  const executeSentenceBurstScan = async () => {
    if (!isCameraActive) {
      setStatus("nocam");
      setFullscreenFeedback({
        type: "error",
        message: "Kamera Belum Aktif",
        detail: "Nyalakan kamera terlebih dahulu.",
      });
      return;
    }
    setStatus("loading");
    setBurstProgress(1);
    clearTimeout(feedbackTimerRef.current);
    setFullscreenFeedback({
      type: "loading",
      message: "Mengambil Rangkaian Foto (1/3)...",
      detail: "Tahan kamera tetap stabil dan tidak goyang.",
    });
    announce("Mengambil 3 frame beruntun untuk kalimat. Tahan kamera tetap stabil.");

    const candidates = [];
    for (let i = 0; i < 3; i++) {
      setBurstProgress(i + 1);
      setFullscreenFeedback({
        type: "loading",
        message: `Mengambil Rangkaian Foto (${i + 1}/3)...`,
        detail: "Tahan kamera tetap stabil dan tidak goyang.",
      });
      triggerShutterSensory();
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
      setFullscreenFeedback({
        type: "error",
        message: "Gagal Menangkap Frame",
        detail: "Tidak ada frame yang berhasil diambil dari kamera.",
      });
      return;
    }

    candidates.sort((a, b) => b.variance - a.variance);
    const best = candidates[0];
    setSharp(best.variance);
    if (best.variance < BLUR_MIN) {
      setStatus("blur");
      announce("Gambar buram. Tahan kamera sebentar lalu coba lagi.");
      setFullscreenFeedback({
        type: "blur",
        message: "Gambar Terdeteksi Buram",
        detail: `Ketajaman: ${best.variance} (minimal ${BLUR_MIN}). Tahan kamera stabil.`,
      });
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([80, 50, 80]);
      }
      return;
    }

    setFullscreenFeedback({
      type: "loading",
      message: "Menganalisis Rangkaian Kalimat...",
      detail: "Memilih frame tertajam dan menyusun urutan kata...",
    });
    await executeSingleOrFreezeScan(best.blob, "webcam");
  };

  const processUploadedFileObj = async (file) => {
    if (!file) return;
    try {
      const objUrl = URL.createObjectURL(file);
      setUploadedPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objUrl;
      });
    } catch {
      /* ignore */
    }
    await executeSingleOrFreezeScan(file, "upload");
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processUploadedFileObj(file);
  };

  const handleDropUploadFile = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingUpload(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await processUploadedFileObj(file);
  };

  const startPhonePairing = async () => {
    try {
      const res = await createPairingToken(activeSessionId);
      setPairToken(res.token);
      if (pairWsRef.current) pairWsRef.current.close();

      const ws = new WebSocket(`${getWsBaseUrl()}/ws/device/${encodeURIComponent(res.token)}`);
      pairWsRef.current = ws;

      clearInterval(pairPingRef.current);
      pairPingRef.current = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 10000);

      ws.onmessage = async (ev) => {
        if (typeof ev.data === "string") {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "pong") return;
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
    const existingNums = sessionsRef.current.map((s) => {
      const m = /^Sesi\s+(\d+)$/i.exec((s.title || "").trim());
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextNum = Math.max(0, ...existingNums, sessionsRef.current.length) + 1;
    const num = String(nextNum).padStart(3, "0");
    const title = `Sesi ${num}`;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticSession = {
      id: tempId,
      title,
      scan_count: 0,
      last_preview: "",
      pinned: false,
      created_at: new Date().toISOString(),
      items: [],
    };

    pendingCreatesRef.current.set(tempId, optimisticSession);
    sessionCacheRef.current.set(tempId, optimisticSession);

    // Instan 0ms respon antarmuka tanpa jeda jaringan
    setSessions((prev) => {
      const next = [optimisticSession, ...prev];
      return next.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    });
    setActiveSessionId(tempId);
    setActiveSession(optimisticSession);
    setSessionDropdownOpen(false);
    announce(`${title} dibuat.`);
    toast.success(`${title} berhasil dibuat.`);

    try {
      const baru = await createSession(title);
      pendingCreatesRef.current.delete(tempId);
      tempToRealIdRef.current.set(tempId, baru.id);

      // Jika pengguna menghapus sesi ini saat request create masih di jalan, langsung hapus di server
      if (deletedSessionIdsRef.current.has(tempId)) {
        deletedSessionIdsRef.current.add(baru.id);
        deleteSession(baru.id).catch(() => {});
        return;
      }

      const override = localOverridesRef.current.get(tempId);
      if (override) {
        localOverridesRef.current.set(baru.id, override);
        localOverridesRef.current.delete(tempId);
        updateSession(baru.id, override).catch(() => {});
      }

      const cachedTemp = sessionCacheRef.current.get(tempId);
      const finalSes = {
        ...baru,
        scan_count: cachedTemp?.items?.length || 0,
        last_preview: baru.last_preview || "",
        ...(override || {}),
      };
      const finalDetail = {
        ...finalSes,
        items: cachedTemp?.items || [],
      };
      sessionCacheRef.current.delete(tempId);
      persistSessionDetailCache(baru.id, finalDetail);

      setSessions((prev) => {
        const mapped = prev.map((s) => (s.id === tempId ? finalSes : s));
        return mapped.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      });
      setActiveSessionId((curr) => (curr === tempId ? baru.id : curr));
      setActiveSession((curr) => (curr?.id === tempId ? finalDetail : curr));
    } catch (err) {
      console.error(err);
      pendingCreatesRef.current.delete(tempId);
      toast.error("Gagal menyinkronkan sesi baru ke server.");
    }
  };

  const handleTogglePin = async (ses) => {
    const targetId = tempToRealIdRef.current.get(ses.id) || ses.id;
    const nextPinned = !ses.pinned;

    const existingOverride = localOverridesRef.current.get(targetId) || {};
    localOverridesRef.current.set(targetId, { ...existingOverride, pinned: nextPinned });

    // Instan 0ms update & urutkan ulang
    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === ses.id || s.id === targetId ? { ...s, pinned: nextPinned } : s,
      );
      return [...updated].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    });
    if (sessionCacheRef.current.has(targetId)) {
      const c = sessionCacheRef.current.get(targetId);
      persistSessionDetailCache(targetId, { ...c, pinned: nextPinned });
    }
    setActiveSession((prev) =>
      prev && (prev.id === ses.id || prev.id === targetId) ? { ...prev, pinned: nextPinned } : prev,
    );

    announce(nextPinned ? "Sesi disematkan di atas." : "Semat sesi dilepas.");
    toast.info(nextPinned ? "Sesi disematkan di atas." : "Semat sesi dilepas.");

    if (String(targetId).startsWith("temp-")) return;
    try {
      await updateSession(targetId, { pinned: nextPinned });
    } catch (err) {
      console.warn("Sinkronisasi status semat ke server tertunda:", err);
    }
  };

  const handleSaveRename = async (sesId) => {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    const targetId = tempToRealIdRef.current.get(sesId) || sesId;
    const updatedTitle = renameText.trim();

    const existingOverride = localOverridesRef.current.get(targetId) || {};
    localOverridesRef.current.set(targetId, { ...existingOverride, title: updatedTitle });

    setSessions((prev) =>
      prev.map((s) => (s.id === sesId || s.id === targetId ? { ...s, title: updatedTitle } : s)),
    );
    if (sessionCacheRef.current.has(targetId)) {
      const c = sessionCacheRef.current.get(targetId);
      persistSessionDetailCache(targetId, { ...c, title: updatedTitle });
    }
    setActiveSession((prev) =>
      prev && (prev.id === sesId || prev.id === targetId) ? { ...prev, title: updatedTitle } : prev,
    );
    setRenamingId(null);
    announce("Nama sesi diperbarui.");
    toast.success("Nama sesi berhasil diperbarui.");

    if (String(targetId).startsWith("temp-")) return;
    try {
      await updateSession(targetId, { title: updatedTitle });
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengubah nama sesi di server.");
    }
  };

  const handleDeleteSession = async (ses) => {
    const targetId = tempToRealIdRef.current.get(ses.id) || ses.id;
    deletedSessionIdsRef.current.add(ses.id);
    deletedSessionIdsRef.current.add(targetId);
    pendingCreatesRef.current.delete(ses.id);
    sessionCacheRef.current.delete(ses.id);
    sessionCacheRef.current.delete(targetId);

    const nextList = sessionsRef.current.filter(
      (x) => x.id !== ses.id && x.id !== targetId && !deletedSessionIdsRef.current.has(x.id),
    );
    setSessions(nextList);

    if (activeSessionId === ses.id || activeSessionId === targetId) {
      const nextId = nextList[0]?.id || null;
      setActiveSessionId(nextId);
      if (!nextId) {
        setActiveSession(null);
        setSelectedItem((prev) => (prev?.isDraft ? prev : null));
      }
    }
    announce(`Sesi "${ses.title}" dihapus.`);
    toast.success(`Sesi "${ses.title}" berhasil dihapus.`);

    if (String(targetId).startsWith("temp-")) return;
    try {
      await deleteSession(targetId);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus sesi di server.");
    }
  };

  const handleCommitDraftToSession = async () => {
    if (!selectedItem || !selectedItem.isDraft) return;
    let targetSessionId = tempToRealIdRef.current.get(activeSessionId) || activeSessionId;

    setSavingRevision(true);
    announce("Menyimpan hasil tangkapan ke sesi aktif...");

    try {
      // Jika belum ada sesi sama sekali atau masih tempId, pastikan sesi dibuat di server dulu
      if (!targetSessionId || String(targetSessionId).startsWith("temp-")) {
        const tempTitle = activeSession?.title || "Sesi 001";
        const created = await createSession(tempTitle);
        targetSessionId = created.id;
        setActiveSessionId(targetSessionId);
      }

      const finalTxt = (editingText || selectedItem.final_text || "").trim();
      const res = await createSessionScan(targetSessionId, selectedItem.blob, {
        mode: selectedItem.mode,
        source: selectedItem.source,
        checkBlur: false,
        overrideFinalText: finalTxt,
        overrideRawText: selectedItem.raw_text,
        cellsJson: selectedItem.cells_json,
      });

      const savedItem = res?.item || {
        ...selectedItem,
        id: res?.id || `item-${Date.now()}`,
        final_text: finalTxt,
        notes: editingNote || "",
      };
      delete savedItem.isDraft;
      delete savedItem.blob;

      // Update state lokal secara instan tanpa menunggu reload penuh
      setSelectedItem(savedItem);
      setEditingText(savedItem.final_text || "");
      setEditingNote(savedItem.notes || "");

      setActiveSession((prev) => {
        const prevItems = prev?.items || [];
        const nextItems = [...prevItems, savedItem];
        const nextDetail = {
          ...(prev || { id: targetSessionId, title: "Sesi Aktif" }),
          items: nextItems,
          scan_count: nextItems.length,
          last_preview: savedItem.final_text,
        };
        persistSessionDetailCache(targetSessionId, nextDetail);
        return nextDetail;
      });

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                scan_count: (s.scan_count || 0) + 1,
                last_preview: savedItem.final_text,
              }
            : s,
        ),
      );

      announce(`Berhasil disimpan ke sesi: ${savedItem.final_text}`);
      toast.success("Berhasil disimpan ke sesi aktif!");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Gagal menyimpan tangkapan ke sesi.");
    } finally {
      setSavingRevision(false);
    }
  };

  const handleDiscardDraft = () => {
    if (!selectedItem?.isDraft) return;
    const items = activeSession?.items || [];
    const last = items.length > 0 ? items[items.length - 1] : null;
    setSelectedItem(last);
    setEditingText(last?.final_text || "");
    setEditingNote(last?.notes || "");
    setSelectedCellIdx(0);
    announce("Tangkapan dibatalkan. Tidak ada data yang tersimpan.");
    toast.info("Tangkapan dibatalkan.");
  };

  const handleApproveCell = async (cell) => {
    if (!selectedItem) return;
    const cells = [...(selectedItem.cells_json || [])];
    const targetIdx = cells.findIndex((c) => c.id === cell.id);
    if (targetIdx === -1) return;

    cells[targetIdx] = {
      ...cells[targetIdx],
      original_symbol: cells[targetIdx].original_symbol || cells[targetIdx].symbol,
      original_pattern:
        cells[targetIdx].original_pattern ||
        cells[targetIdx].pattern ||
        getPatternForSymbol(cells[targetIdx].symbol),
      flag: "ok",
      conf: 1.0,
      verified: true,
      locked: true,
    };

    if (selectedItem.isDraft) {
      const updatedItem = { ...selectedItem, cells_json: cells };
      setSelectedItem(updatedItem);
      announce(`Huruf "${cell.symbol}" telah disetujui dan dikunci.`);
      toast.success(`Huruf "${cell.symbol}" disetujui & dikunci.`);
      return;
    }

    const optimisticItem = { ...selectedItem, cells_json: cells };
    setSelectedItem(optimisticItem);
    announce(`Huruf "${cell.symbol}" telah disetujui dan dikunci.`);
    toast.success(`Huruf "${cell.symbol}" disetujui & dikunci.`);

    setSavingRevision(true);
    try {
      const res = await patchScanItem(selectedItem.id, {
        final_text: editingText || selectedItem.final_text,
        notes: editingNote,
        cells_json: cells,
      });
      if (res?.item) {
        const mergedCells = (res.item.cells_json || cells).map((c, idx) => ({
          ...c,
          verified: cells[idx]?.verified ?? c.verified,
          locked: cells[idx]?.locked ?? c.locked,
          original_symbol: cells[idx]?.original_symbol || c.original_symbol || c.symbol,
          original_pattern: cells[idx]?.original_pattern || c.original_pattern || c.pattern,
        }));
        setSelectedItem({ ...res.item, cells_json: mergedCells });
      }
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan persetujuan huruf.");
    } finally {
      setSavingRevision(false);
    }
  };

  const handleUnlockCell = (cell) => {
    if (!selectedItem) return;
    const cells = [...(selectedItem.cells_json || [])];
    const targetIdx = cells.findIndex((c) => c.id === cell.id);
    if (targetIdx === -1) return;

    cells[targetIdx] = {
      ...cells[targetIdx],
      verified: false,
      locked: false,
    };
    setSelectedItem({ ...selectedItem, cells_json: cells });
    announce(`Kunci huruf "${cell.symbol}" dibuka. Anda dapat memilih huruf alternatif.`);
    toast.info(`Kunci huruf "${cell.symbol}" dibuka.`);
  };

  const handleDeleteScanItem = async (itemId) => {
    if (!window.confirm("Hapus hasil tangkapan ini dari sesi?")) return;
    const targetSessionId = tempToRealIdRef.current.get(activeSessionId) || activeSessionId;
    try {
      setActiveSession((prev) => {
        if (!prev) return prev;
        const nextItems = (prev.items || []).filter((x) => x.id !== itemId);
        const nextDetail = {
          ...prev,
          items: nextItems,
          scan_count: nextItems.length,
          last_preview: nextItems.length > 0 ? nextItems[nextItems.length - 1].final_text : "",
        };
        persistSessionDetailCache(targetSessionId, nextDetail);
        if (selectedItem?.id === itemId) {
          const fallback = nextItems.length > 0 ? nextItems[nextItems.length - 1] : null;
          setSelectedItem(fallback);
          setEditingText(fallback?.final_text || "");
          setEditingNote(fallback?.notes || "");
        }
        return nextDetail;
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId || s.id === targetSessionId
            ? { ...s, scan_count: Math.max(0, (s.scan_count || 1) - 1) }
            : s,
        ),
      );
      announce("Tangkapan dihapus dari sesi.");
      toast.success("Tangkapan berhasil dihapus.");
      await deleteSessionScan(targetSessionId, itemId);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus tangkapan dari server.");
      await loadActiveSessionDetail(targetSessionId);
    }
  };

  const handleApplyCellCorrection = async (cell, newSymbol) => {
    if (!selectedItem) return;
    if (cell.locked || cell.verified) {
      toast.info("Huruf ini sudah dikunci. Klik 'Buka Kunci Pilihan' jika ingin mengubah.");
      return;
    }
    const cells = [...(selectedItem.cells_json || [])];
    const targetIdx = cells.findIndex((c) => c.id === cell.id);
    if (targetIdx === -1) return;

    const currentCell = cells[targetIdx];
    const oldSymbol = currentCell.symbol;
    if (oldSymbol === newSymbol) return;
    const oldPattern = currentCell.pattern || getPatternForSymbol(oldSymbol);
    const origSymbol = currentCell.original_symbol || oldSymbol;
    const origPattern = currentCell.original_pattern || oldPattern;
    const newPattern = getPatternForSymbol(newSymbol);

    // Pastikan huruf awal (original_symbol) & huruf sebelumnya tetap tersimpan di daftar kandidat
    // sehingga pengguna tidak kehilangan huruf awal jika salah pencet!
    const existingAlts = [...(currentCell.alternates || [])];
    if (!existingAlts.some((a) => a.symbol === origSymbol)) {
      existingAlts.unshift({
        symbol: origSymbol,
        pattern: origPattern,
        isOriginal: true,
      });
    }
    if (!existingAlts.some((a) => a.symbol === oldSymbol)) {
      existingAlts.push({
        symbol: oldSymbol,
        pattern: oldPattern,
      });
    }

    cells[targetIdx] = {
      ...currentCell,
      symbol: newSymbol,
      pattern: newPattern,
      original_symbol: origSymbol,
      original_pattern: origPattern,
      alternates: existingAlts,
      flag: "ok",
      conf: 1.0,
    };

    const tokens = (editingText || selectedItem.final_text || "").split("");
    if (targetIdx < tokens.length) {
      tokens[targetIdx] = newSymbol;
    }
    const updatedText = tokens.join("");
    setEditingText(updatedText);

    if (selectedItem.isDraft) {
      setSelectedItem({
        ...selectedItem,
        final_text: updatedText,
        cells_json: cells,
      });
      announce(`Sel diubah dari ${oldSymbol} menjadi ${newSymbol}.`);
      toast.success(`Huruf diganti ke "${newSymbol}".`);
      return;
    }

    const optimisticItem = {
      ...selectedItem,
      final_text: updatedText,
      cells_json: cells,
    };
    setSelectedItem(optimisticItem);
    announce(`Sel diubah dari ${oldSymbol} menjadi ${newSymbol}.`);
    toast.success(`Huruf diganti ke "${newSymbol}".`);

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
      if (res?.item) {
        setSelectedItem({ ...res.item, cells_json: cells });
      }
      const targetSessionId = tempToRealIdRef.current.get(activeSessionId) || activeSessionId;
      setActiveSession((prev) => {
        if (!prev) return prev;
        const nextItems = (prev.items || []).map((it) =>
          it.id === selectedItem.id ? { ...it, final_text: updatedText, cells_json: cells } : it,
        );
        const nextDetail = { ...prev, items: nextItems };
        persistSessionDetailCache(targetSessionId, nextDetail);
        return nextDetail;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRevision(false);
    }
  };

  const handleSaveManualRevision = async () => {
    if (!selectedItem) return;
    if (selectedItem.isDraft) {
      setSelectedItem({
        ...selectedItem,
        final_text: editingText,
        notes: editingNote,
      });
      announce("Pratinjau teks tangkapan diperbarui.");
      toast.success("Pratinjau teks diperbarui.");
      return;
    }
    setSavingRevision(true);
    try {
      const res = await patchScanItem(selectedItem.id, {
        final_text: editingText,
        notes: editingNote,
      });
      const updated = res?.item || { ...selectedItem, final_text: editingText, notes: editingNote };
      setSelectedItem(updated);
      const targetSessionId = tempToRealIdRef.current.get(activeSessionId) || activeSessionId;
      setActiveSession((prev) => {
        if (!prev) return prev;
        const nextItems = (prev.items || []).map((it) => (it.id === updated.id ? updated : it));
        const nextDetail = { ...prev, items: nextItems };
        persistSessionDetailCache(targetSessionId, nextDetail);
        return nextDetail;
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId || s.id === targetSessionId
            ? { ...s, last_preview: editingText }
            : s,
        ),
      );
      announce("Revisi baru tersimpan.");
      toast.success("Perubahan teks berhasil disimpan.");
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan perubahan teks.");
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
        <aside aria-label="Daftar sesi pindai" className="card flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-100px)]">
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

          <ul className="m-0 flex flex-1 list-none flex-col gap-2.5 overflow-y-auto p-0 pr-1">
            {filteredSessions.length === 0 ? (
              <li className="p-4 text-center text-xs text-muted-theme">
                {sessions.length === 0
                  ? "Belum ada sesi tersimpan. Klik 'Sesi Baru' di atas untuk membuat sesi."
                  : "Tidak ada sesi yang cocok dengan kata kunci pencarian."}
              </li>
            ) : (
              filteredSessions.map((ses, idx) => {
                const isSelected = ses.id === activeSessionId;
                return (
                  <li
                    key={ses.id}
                    onClick={() => setActiveSessionId(ses.id)}
                    className={`rounded-[16px] border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--surface-sunken)] shadow-sm ring-1 ring-[var(--primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]/60"
                    }`}
                  >
                    {renamingId === ses.id ? (
                      <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
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
                        <div className="flex items-center gap-1.5 text-left text-[0.96rem] font-bold text-[var(--text)]">
                          {ses.pinned && (
                            <Pin size={14} className="flex-none text-[var(--primary)]" aria-hidden="true" />
                          )}
                          <span className="truncate">{ses.title}</span>
                        </div>
                        <p className="m-0 line-clamp-2 text-[0.83rem] text-muted-theme">
                          {ses.last_preview || "Belum ada hasil pindai."}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem]"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTogglePin(ses);
                            }}
                          >
                            <Pin size={13} aria-hidden="true" />
                            <span>{ses.pinned ? "Lepas" : "Semat"}</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingId(ses.id);
                              setRenameText(ses.title);
                            }}
                          >
                            Ubah Nama
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary !min-h-[32px] !px-2.5 !py-1 !text-[0.76rem] hover:!border-red-400 hover:!text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSession(ses);
                            }}
                            aria-label={`Hapus sesi ${ses.title}`}
                            title="Hapus sesi ini"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })
            )}
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
                      triggerCopy("sesi-all", gabungan, "Seluruh teks sesi disalin.");
                    }}
                  >
                    {copiedKey === "sesi-all" ? (
                      <Check size={15} className="text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                    <span>{copiedKey === "sesi-all" ? "Tersalin!" : "Salin Semua"}</span>
                  </button>
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
                        onClick={() => triggerCopy(`hist-${it.id}`, it.final_text || "", "Teks tangkapan disalin ke papan klip.")}
                      >
                        {copiedKey === `hist-${it.id}` ? (
                          <Check size={15} className="text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy size={15} aria-hidden="true" />
                        )}
                        <span>{copiedKey === `hist-${it.id}` ? "Tersalin!" : "Salin"}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm text-[var(--bahaya)] hover:!border-[var(--bahaya)] ml-auto"
                        onClick={() => handleDeleteScanItem(it.id)}
                        aria-label={`Hapus tangkapan nomor ${idx + 1}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        <span>Hapus</span>
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
      {/* DECK KONTROL TERPADU RUANG SCAN */}
      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-3.5">
          {/* Baris 1: Pemilih Sesi Kustom Visual & Indikator Sesi */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[0.8rem] font-semibold text-muted-theme hidden sm:inline">
                Sesi Aktif:
              </span>
              <div ref={sessionDropdownRef} className="relative flex items-center gap-2 min-w-0 flex-1 max-w-[360px]">
                <button
                  type="button"
                  id="pilih-sesi-aktif"
                  aria-haspopup="listbox"
                  aria-expanded={sessionDropdownOpen}
                  onClick={() => setSessionDropdownOpen((o) => !o)}
                  className="flex min-h-[42px] w-full items-center justify-between gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-1.5 text-left transition-colors hover:border-[var(--border-strong)] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--on-primary)]">
                      <FolderOpen size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[0.88rem] font-bold text-[var(--text)] truncate">
                        {activeSession?.pinned && (
                          <Pin size={12} className="flex-none text-[var(--primary)]" aria-hidden="true" />
                        )}
                        <span className="truncate">
                          {activeSession?.title || sessions[0]?.title || "Belum ada sesi"}
                        </span>
                      </div>
                      <span className="block truncate text-[0.73rem] text-muted-theme">
                        {sessionItems.length} tangkapan tersimpan
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`flex-none text-muted-theme transition-transform duration-150 ${
                      sessionDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={handleCreateSession}
                  aria-label="Buat sesi pindai baru"
                  title="Buat sesi baru"
                  className="btn btn-secondary btn-sm !h-[42px] !w-[42px] flex-none !p-0"
                >
                  <Plus size={17} aria-hidden="true" />
                </button>

                {sessionDropdownOpen && (
                  <div
                    role="listbox"
                    aria-label="Daftar sesi pindai"
                    className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[290px] sm:min-w-[340px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2 shadow-xl"
                  >
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1.5">
                      <span className="text-[0.76rem] font-bold text-muted-theme">
                        Pilih Sesi ({sessions.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSessionDropdownOpen(false);
                          switchSubView("sesi");
                        }}
                        className="border-0 bg-transparent p-0 text-[0.76rem] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                      >
                        Kelola Semua
                      </button>
                    </div>

                    <div className="flex max-h-[260px] flex-col gap-1 overflow-y-auto pr-0.5">
                      {sessions.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[0.82rem] text-muted-theme">
                          Belum ada sesi. Klik tombol di bawah untuk membuat sesi pertama.
                        </div>
                      ) : (
                        sessions.map((s) => {
                          const isCurrent = s.id === activeSessionId;
                          const rawChar = (s.last_preview || s.title || "s").trim()[0]?.toLowerCase() || "s";
                          const previewChar = /[a-z]/.test(rawChar) ? rawChar : "s";
                          return (
                            <button
                              key={s.id}
                              type="button"
                              role="option"
                              aria-selected={isCurrent}
                              onClick={() => {
                                setActiveSessionId(s.id);
                                setSessionDropdownOpen(false);
                                announce(`Beralih ke ${s.title}.`);
                              }}
                              className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer border ${
                                isCurrent
                                  ? "border-[var(--primary)] bg-[var(--surface-sunken)]"
                                  : "border-transparent bg-transparent hover:bg-[var(--surface-sunken)]/70"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="flex-none rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-1">
                                  <BrailleCellDiagram
                                    symbol={previewChar}
                                    pattern={getPatternForSymbol(previewChar)}
                                    size={24}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 text-[0.86rem] font-bold text-[var(--text)] truncate">
                                    {s.pinned && (
                                      <Pin size={12} className="flex-none text-[var(--primary)]" aria-hidden="true" />
                                    )}
                                    <span className="truncate">{s.title}</span>
                                  </div>
                                  <div className="truncate text-[0.75rem] text-muted-theme">
                                    {s.last_preview ? `"${s.last_preview}"` : "Belum ada bacaan"}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-none">
                                <span className="rounded-md bg-[var(--surface-sunken)] px-2 py-0.5 text-[0.72rem] font-semibold text-muted-theme tabular-nums border border-[var(--border-subtle)]">
                                  {s.scan_count ?? 0} data
                                </span>
                                {isCurrent && (
                                  <Check size={15} className="text-[var(--primary)]" aria-hidden="true" />
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={handleCreateSession}
                        className="btn btn-primary btn-sm w-full !min-h-[36px]"
                      >
                        <Plus size={15} aria-hidden="true" />
                        <span>Buat Sesi Pindai Baru</span>
                      </button>
                    </div>
                  </div>
                )}
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

          {/* Baris 2: Pemilihan Sumber Citra & Mode Kamera */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[0.8rem] font-semibold text-muted-theme hidden sm:inline">
                Sumber:
              </span>
              <div
                className="segmented-bar flex-1 sm:flex-none flex flex-nowrap overflow-x-auto no-scrollbar max-w-full"
                role="group"
                aria-label="Pilih sumber gambar Braille"
              >
                <Tooltip text="Gunakan kamera perangkat ini (Kamera belakang di HP atau Webcam di Laptop)" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "webcam"}
                    onClick={() => {
                      setSourceMode("webcam");
                      announce("Sumber Kamera Perangkat dipilih.");
                    }}
                    className="segmented-item w-full"
                  >
                    <Camera size={14} aria-hidden="true" />
                    <span>Kamera Perangkat</span>
                  </button>
                </Tooltip>

                <Tooltip text="Gunakan kamera HP secara nirkabel untuk memindai ke layar laptop ini" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "phone"}
                    onClick={() => {
                      setSourceMode("phone");
                      setLiveStreaming(false);
                      if (!pairToken) startPhonePairing();
                      announce("Sumber Mirror Kamera HP dipilih.");
                    }}
                    className="segmented-item w-full"
                  >
                    <Smartphone size={14} aria-hidden="true" />
                    <span>Mirror Kamera HP</span>
                  </button>
                </Tooltip>

                <Tooltip text="Unggah foto lembar Braille di kotak tengah" position="top">
                  <button
                    type="button"
                    aria-pressed={sourceMode === "upload"}
                    onClick={() => {
                      setSourceMode("upload");
                      setLiveStreaming(false);
                      announce("Area Unggah Foto aktif di kotak tengah.");
                    }}
                    className="segmented-item w-full"
                  >
                    <Upload size={14} aria-hidden="true" />
                    <span>Unggah Foto</span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {sourceMode !== "upload" && (
              <div className="flex items-center gap-2">
                <span className="text-[0.8rem] font-semibold text-muted-theme hidden sm:inline">
                  Mode Kamera:
                </span>
                <div
                  className="segmented-bar flex-1 sm:flex-none flex flex-nowrap overflow-x-auto no-scrollbar max-w-full"
                  role="group"
                  aria-label="Pilih mode pemindaian kamera"
                >
                  {[
                    { id: "live", label: "Live" },
                    { id: "sentence", label: "Kalimat" },
                    { id: "photo", label: "Foto Presisi" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={scanMode === m.id}
                      onClick={() => {
                        setScanMode(m.id);
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
            )}

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

      {/* RUANG KERJA BERDAMPINGAN 7:5 (Kamera/Tempat Unggah di Kiri, Panel Hasil di Kanan) */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* KOLOM KIRI (7/12): VIEWFINDER KAMERA / TEMPAT UNGGAH & KONTROL */}
        <section
          aria-labelledby="judul-viewfinder"
          className="card flex flex-col gap-4 xl:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="judul-viewfinder" className="m-0 text-[1.06rem] font-bold">
              {sourceMode === "upload"
                ? "Tempat Unggah Foto Braille"
                : sourceMode === "phone"
                  ? "Mirror Kamera HP ke Layar Ini"
                  : "Kamera & Deteksi Poligon"}
            </h2>

            <div className="flex items-center gap-2">
              {liveStreaming && liveLatencyMs > 0 && sourceMode === "webcam" && (
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

          {/* Viewfinder Kamera / Dropzone Unggah / Mirror HP */}
          <div
            onDragOver={
              sourceMode === "upload"
                ? (e) => {
                    e.preventDefault();
                    setIsDraggingUpload(true);
                  }
                : undefined
            }
            onDragLeave={
              sourceMode === "upload"
                ? () => setIsDraggingUpload(false)
                : undefined
            }
            onDrop={sourceMode === "upload" ? handleDropUploadFile : undefined}
            className={
              isCameraFullscreen
                ? "camera-fullscreen-viewport"
                : `camera-viewport relative overflow-hidden ${
                    sourceMode === "upload" && isDraggingUpload
                      ? "ring-4 ring-[#E6FF2E]"
                      : ""
                  }`
            }
          >
            {/* Header Kontrol Khusus Layar Penuh */}
            {isCameraFullscreen ? (
              <div className="fullscreen-hud-top">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 rounded-full bg-black/80 px-3.5 py-1.5 text-[0.82rem] font-bold text-white backdrop-blur-md border border-white/20 shadow-lg">
                    <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-pulse" />
                    <span>Mode: {scanMode === "sentence" ? "Kalimat" : scanMode === "photo" ? "Foto Presisi" : "Live"}</span>
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
              sourceMode !== "upload" && (
                <button
                  type="button"
                  onClick={toggleCameraFullscreen}
                  aria-label="Layar penuh kamera"
                  title="Buka kamera layar penuh"
                  className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 hover:text-[#E6FF2E] backdrop-blur-sm border border-white/15 transition-all shadow-sm"
                >
                  <Maximize2 size={18} aria-hidden="true" />
                </button>
              )
            )}

            {/* HUD Optical Corners */}
            <div className={`hud-corner hud-corner-tl ${isCameraFullscreen ? "!top-6 !left-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-tr ${isCameraFullscreen ? "!top-6 !right-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-bl ${isCameraFullscreen ? "!bottom-44 !left-6" : ""}`} aria-hidden="true" />
            <div className={`hud-corner hud-corner-br ${isCameraFullscreen ? "!bottom-44 !right-6" : ""}`} aria-hidden="true" />

            {/* Kilat Shutter Kamera */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 z-40 bg-white transition-opacity duration-150 ${
                shutterFlash ? "opacity-90" : "opacity-0"
              }`}
            />

            {sourceMode === "upload" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Klik atau tarik berkas foto Braille ke kotak ini untuk mengunggah"
                className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer hover:bg-white/5 transition-colors"
              >
                {uploadedPreviewUrl ? (
                  <>
                    <img
                      src={uploadedPreviewUrl}
                      alt="Pratinjau berkas foto Braille yang diunggah"
                      className="max-h-[260px] w-auto max-w-full rounded-xl object-contain border border-white/20 shadow-lg"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                      <span className="rounded-lg bg-black/75 px-3 py-1.5 text-[0.8rem] font-bold text-[#E6FF2E] border border-white/15">
                        {status === "loading" ? "Sedang Menganalisis Foto..." : "Klik untuk Mengganti Foto Lain"}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E6FF2E] text-[#0B1C33] shadow-md">
                      <ImagePlus size={28} aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-1 max-w-[38ch]">
                      <span className="text-[1.08rem] font-extrabold text-white">
                        Klik atau Tarik Foto Braille ke Sini
                      </span>
                      <span className="text-[0.83rem] leading-relaxed text-white/80">
                        Mendukung format JPG, PNG, atau WEBP. Hasil terjemahan akan muncul di panel kanan untuk Anda verifikasi sebelum disimpan ke sesi.
                      </span>
                    </div>
                    <span className="mt-1 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-[0.84rem] font-bold text-white border border-white/20 hover:bg-white/25 transition-colors">
                      <Upload size={16} aria-hidden="true" />
                      <span>Pilih Foto dari Perangkat</span>
                    </span>
                  </>
                )}
              </div>
            ) : sourceMode === "phone" ? (
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
                    {!isCameraFullscreen && (
                      <div
                        aria-hidden="true"
                        className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full bg-black/75 px-3 py-1 text-[0.78rem] font-bold text-[#E6FF2E] backdrop-blur-sm shadow-sm"
                      >
                        <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-ping" />
                        <span>Live Mirror Kamera HP</span>
                      </div>
                    )}
                    <div className="scanner-sweep-line" aria-hidden="true" />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 px-5 py-6 text-center z-10 max-w-[440px]">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#E6FF2E]">
                      <Smartphone size={24} aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="text-[1.04rem] font-bold text-white">
                        {pairPeers > 0
                          ? "HP Terhubung · Siap Mirror Kamera"
                          : "Mirror Kamera Belakang HP ke Laptop Ini"}
                      </span>
                      <span className="text-[0.8rem] leading-relaxed text-white/75">
                        {pairPeers > 0
                          ? "Nyalakan kamera pada halaman di HP Anda untuk menampilkan pratinjau langsung di layar ini."
                          : "Fitur ini berguna saat Anda membuka Railuma di Laptop dan ingin memakai kamera belakang HP untuk memotret lembar Braille di meja."}
                      </span>
                    </div>

                    <div className="w-full flex flex-col gap-2 rounded-xl bg-black/55 p-3 border border-white/15">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          aria-label="Tautan mirror kamera HP"
                          value={pairUrl || "Membuat tautan penyandingan..."}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[0.78rem] text-white font-mono truncate"
                        />
                        <button
                          type="button"
                          disabled={!pairUrl}
                          onClick={() => triggerCopy("pairUrl", pairUrl, "Tautan mirror kamera HP disalin.")}
                          className="btn btn-primary btn-sm !bg-[#E6FF2E] !text-[#0B1C33] font-bold flex-none"
                        >
                          {copiedKey === "pairUrl" ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedKey === "pairUrl" ? "Tersalin" : "Salin"}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSourceMode("webcam")}
                        className="border-0 bg-transparent p-0 text-[0.75rem] font-semibold text-[#E6FF2E] hover:underline cursor-pointer"
                      >
                        Sedang membuka langsung di HP? Klik di sini untuk memakai Kamera Perangkat langsung.
                      </button>
                    </div>
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
              <div className="fullscreen-hud-bottom">
                {/* Banner Feedback Layar Penuh (Hasil, Loading, Buram, Error) */}
                {fullscreenFeedback && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className={`w-full max-w-md rounded-2xl px-4 py-3 backdrop-blur-md shadow-2xl border transition-all animate-in slide-in-from-bottom-2 duration-200 ${
                      fullscreenFeedback.type === "done"
                        ? "bg-[#064E3B]/95 border-[#34D399] text-white"
                        : fullscreenFeedback.type === "blur"
                          ? "bg-[#78350F]/95 border-[#FBBF24] text-white"
                          : fullscreenFeedback.type === "error"
                            ? "bg-[#7F1D1D]/95 border-[#F87171] text-white"
                            : fullscreenFeedback.type === "empty"
                              ? "bg-[#1E293B]/95 border-[#94A3B8] text-white"
                              : "bg-[#0F172A]/95 border-white/20 text-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-none">
                        {fullscreenFeedback.type === "done" && (
                          <CheckCircle2 size={20} className="text-[#34D399]" aria-hidden="true" />
                        )}
                        {fullscreenFeedback.type === "blur" && (
                          <TriangleAlert size={20} className="text-[#FBBF24]" aria-hidden="true" />
                        )}
                        {fullscreenFeedback.type === "error" && (
                          <AlertCircle size={20} className="text-[#F87171]" aria-hidden="true" />
                        )}
                        {fullscreenFeedback.type === "empty" && (
                          <Info size={20} className="text-[#94A3B8]" aria-hidden="true" />
                        )}
                        {fullscreenFeedback.type === "loading" && (
                          <RefreshCw size={20} className="text-[#E6FF2E] animate-spin" aria-hidden="true" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="m-0 text-[0.92rem] font-bold leading-snug truncate">
                          {fullscreenFeedback.message}
                        </p>
                        {fullscreenFeedback.detail && (
                          <p className="m-0 mt-0.5 text-[0.8rem] text-white/80 leading-normal line-clamp-2">
                            {fullscreenFeedback.detail}
                          </p>
                        )}
                      </div>
                      {fullscreenFeedback.type !== "loading" && (
                        <button
                          type="button"
                          onClick={() => setFullscreenFeedback(null)}
                          className="flex-none p-1 text-white/60 hover:text-white"
                          aria-label="Tutup notifikasi"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

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

                <div className="flex items-center justify-center gap-3 sm:gap-5 w-full max-w-md">
                  <div className="flex items-center gap-1 bg-black/70 p-1.5 rounded-full backdrop-blur-md border border-white/20">
                    <button
                      type="button"
                      onClick={() => {
                        setScanMode("live");
                        setLiveStreaming(true);
                        announce("Mode Live");
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all whitespace-nowrap ${
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
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all whitespace-nowrap ${
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
                        announce("Mode Foto Presisi");
                      }}
                      className={`px-3 py-1.5 rounded-full text-[0.78rem] font-bold transition-all whitespace-nowrap ${
                        scanMode === "photo"
                          ? "bg-[#E6FF2E] text-[#0A1628]"
                          : "text-white/80 hover:text-white"
                      }`}
                    >
                      Foto Presisi
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
                    aria-label={status === "loading" ? "Sedang memproses foto Braille" : "Ambil foto Braille"}
                    className="flex h-[66px] w-[66px] flex-none items-center justify-center rounded-full bg-[#E6FF2E] text-[#0A1628] shadow-[0_0_24px_rgba(230,255,46,0.35)] active:scale-95 transition-all border-4 border-white/40 disabled:opacity-50"
                  >
                    {status === "loading" ? (
                      <RefreshCw size={28} className="animate-spin text-[#0A1628]" aria-hidden="true" />
                    ) : (
                      <Camera size={28} strokeWidth={2.4} aria-hidden="true" />
                    )}
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
                        : "Tangkap dari Mirror HP"}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (!pairToken) {
                      startPhonePairing();
                    } else {
                      triggerCopy("pairBtn", pairUrl, "Tautan mirror HP disalin.");
                    }
                  }}
                >
                  {copiedKey === "pairBtn" ? (
                    <Check size={16} className="text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  <span>{copiedKey === "pairBtn" ? "Tersalin!" : "Salin Tautan Mirror"}</span>
                </button>
              </>
            ) : sourceMode === "upload" ? (
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={status === "loading"}
              >
                <Upload size={18} aria-hidden="true" />
                <span>
                  {status === "loading"
                    ? "Memproses Foto..."
                    : uploadedPreviewUrl
                      ? "Pilih Foto Braille Lain"
                      : "Pilih Foto Braille dari Perangkat"}
                </span>
              </button>
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
                          ? "Tangkap Frame Ini"
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

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    switchCamera();
                    announce(
                      facingMode === "environment"
                        ? "Beralih ke kamera depan."
                        : "Beralih ke kamera belakang.",
                    );
                  }}
                  title="Putar kamera depan / belakang"
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Putar Kamera</span>
                </button>

                <button type="button" className="btn btn-secondary" onClick={handleTurnOffCamera}>
                  <CameraOff size={18} aria-hidden="true" />
                  <span>Matikan</span>
                </button>
              </>
            )}

            {sourceMode !== "upload" && (
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
            )}
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
                  {/* Banner Verifikasi Tangkapan Baru (Draft) - Satu-satunya tempat tombol Simpan ke Sesi */}
                  {selectedItem.isDraft && (
                    <div className="rounded-2xl border-2 border-[var(--primary)] bg-[var(--primary)]/10 p-4 text-[0.88rem] flex flex-col gap-2.5 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold text-[0.92rem]">
                          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>Tangkapan Baru (Pratinjau)</span>
                        </div>
                        <span className="status-chip status-chip-review !text-[0.74rem]">
                          Belum Masuk Sesi
                        </span>
                      </div>
                      <p className="m-0 text-muted-theme text-[0.82rem] leading-relaxed">
                        Periksa hasil bacaan atau koreksi teks di bawah terlebih dahulu. Klik <strong>Simpan ke Sesi Ini</strong> jika hasil sudah benar.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          className="btn btn-primary flex-1 !bg-emerald-600 hover:!bg-emerald-700 !text-white font-bold"
                          disabled={savingRevision}
                          onClick={handleCommitDraftToSession}
                        >
                          <Check size={16} aria-hidden="true" />
                          <span>{savingRevision ? "Menyimpan ke Sesi..." : "Simpan ke Sesi Ini"}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary flex-none text-rose-500 hover:text-rose-600 font-semibold"
                          disabled={savingRevision}
                          onClick={handleDiscardDraft}
                        >
                          <X size={16} aria-hidden="true" />
                          <span>Buang / Batal</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="surface-subtle p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.8rem] font-semibold text-muted-theme">
                        {selectedItem.isDraft ? "Teks Hasil Tangkapan (Pratinjau)" : "Hasil Terjemahan Aktif"}
                      </span>
                      <span
                        className={`status-chip ${
                          selectedItem.isDraft
                            ? "status-chip-review"
                            : selectedItem.status === "needs_review"
                              ? "status-chip-review"
                              : "status-chip-ok"
                        }`}
                      >
                        {selectedItem.isDraft
                          ? "Draft Belum Disimpan"
                          : selectedItem.status === "needs_review"
                            ? "Perlu ditinjau"
                            : "Tersimpan di Sesi"}{" "}
                        ({Math.round((selectedItem.confidence || 0) * 100)}%)
                      </span>
                    </div>

                    <p className="m-0 mt-2.5 whitespace-pre-wrap text-[1.35rem] font-bold leading-snug">
                      {editingText || selectedItem.final_text || "(Kosong)"}
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
                      onClick={() => triggerCopy("res-text", editingText || selectedItem.final_text || "", "Teks hasil disalin.")}
                    >
                      {copiedKey === "res-text" ? (
                        <Check size={15} className="text-emerald-500" aria-hidden="true" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )}
                      <span>{copiedKey === "res-text" ? "Tersalin!" : "Salin"}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm flex-1"
                      onClick={() => speakText(editingText || selectedItem.final_text || "")}
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
                      {selectedItem.isDraft ? "Edit Teks Pratinjau (Opsional)" : "Koreksi Manual (Opsional)"}
                    </label>
                    <textarea
                      id="editor-revisi-cepat"
                      rows={2}
                      value={editingText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingText(val);
                        if (selectedItem.isDraft) {
                          setSelectedItem((prev) => (prev ? { ...prev, final_text: val } : prev));
                        }
                      }}
                      placeholder="Ubah atau perbaiki teks bacaan di sini jika perlu..."
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
                      {!selectedItem.isDraft && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={savingRevision}
                          onClick={handleSaveManualRevision}
                        >
                          {savingRevision ? "Menyimpan..." : "Simpan Hasil Perbaikan"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ALTERNATIF SEL 6-TITIK (Hamming 1) */}
              {rightTab === "alternatif" && (
                <div className="flex flex-col gap-4">
                  <p className="m-0 text-[0.86rem] text-muted-theme">
                    Pilih salah satu huruf di bawah untuk memeriksa pola 6-titik, menyetujui &amp; mengunci huruf, atau menggantinya dengan kandidat berjarak 1 titik:
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
                        const isLocked = Boolean(c.verified || c.locked);
                        const isApproved = c.flag === "ok" || isLocked;
                        const isLow = !isApproved && (c.flag === "review" || (c.conf ?? 1) < 0.65);
                        const isPicked = selectedCellIdx === idx;
                        return (
                          <button
                            key={c.id || idx}
                            type="button"
                            onClick={() => setSelectedCellIdx(isPicked ? null : idx)}
                            aria-pressed={isPicked}
                            className={`min-h-[42px] min-w-[42px] rounded-[11px] px-2.5 py-1 font-bold text-[0.95rem] transition-colors inline-flex items-center justify-center gap-1 ${
                              isPicked
                                ? "border border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                                : isLow
                                  ? "border border-dashed border-[var(--peringatan-fg)] bg-[var(--peringatan-bg)] text-[var(--peringatan-fg)]"
                                  : isLocked
                                    ? "border border-[#166534] bg-[#F0FDF4] text-[#166534] dark:border-[#34D399] dark:bg-[#064E3B] dark:text-[#EDF3FB]"
                                    : "border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text)] hover:bg-[var(--awan-100)]"
                            }`}
                          >
                            <span>{c.symbol}</span>
                            {isLow && <span>?</span>}
                            {isLocked && <Lock size={11} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {activeCell ? (
                    <div className="surface-subtle flex flex-col gap-3.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-[0.94rem]">
                            Sel #{selectedCellIdx + 1} · Huruf &ldquo;{activeCell.symbol}&rdquo;
                          </strong>
                          {activeCell.original_symbol && activeCell.original_symbol !== activeCell.symbol && (
                            <span className="status-chip status-chip-review !text-[0.72rem]">
                              Awalnya: &ldquo;{activeCell.original_symbol}&rdquo;
                            </span>
                          )}
                        </div>
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

                      {/* Status Terkunci vs Tombol Setujui & Pilihan Alternatif */}
                      {activeCell.verified || activeCell.locked ? (
                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3 flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2 text-[0.84rem] font-bold text-[var(--text)]">
                            <span className="status-chip status-chip-ok !px-2 !py-0.5">
                              <Lock size={13} aria-hidden="true" />
                              <span>Terkunci</span>
                            </span>
                            <span>Huruf &ldquo;{activeCell.symbol}&rdquo; Telah Disetujui</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnlockCell(activeCell)}
                            className="btn btn-secondary btn-sm !min-h-[32px] !px-2.5 !py-1 !text-[0.78rem]"
                          >
                            <Unlock size={13} aria-hidden="true" />
                            <span>Buka Kunci Pilihan</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                            <button
                              type="button"
                              disabled={savingRevision}
                              onClick={() => handleApproveCell(activeCell)}
                              className="btn btn-primary btn-sm flex items-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white"
                            >
                              <Check size={14} aria-hidden="true" />
                              <span>Setujui &amp; Kunci Huruf Ini ({activeCell.symbol}) Sudah Benar</span>
                            </button>

                            {activeCell.original_symbol &&
                              activeCell.original_symbol !== activeCell.symbol && (
                                <button
                                  type="button"
                                  disabled={savingRevision}
                                  onClick={() =>
                                    handleApplyCellCorrection(activeCell, activeCell.original_symbol)
                                  }
                                  className="btn btn-secondary btn-sm flex items-center gap-1.5"
                                >
                                  <RotateCcw size={13} aria-hidden="true" />
                                  <span>
                                    Kembalikan ke Huruf Awal ({activeCell.original_symbol})
                                  </span>
                                </button>
                              )}
                          </div>

                          {(() => {
                            const origSym = activeCell.original_symbol || activeCell.symbol;
                            const origPat =
                              activeCell.original_pattern ||
                              getPatternForSymbol(origSym);
                            const rawAlts = [...(activeCell.alternates || [])];
                            if (
                              origSym &&
                              !rawAlts.some((a) => a.symbol === origSym)
                            ) {
                              rawAlts.unshift({
                                symbol: origSym,
                                pattern: origPat,
                                isOriginal: true,
                              });
                            }
                            const visibleAlts = rawAlts.filter(
                              (alt) => alt.symbol !== activeCell.symbol,
                            );
                            if (visibleAlts.length === 0) return null;
                            return (
                              <div className="border-t border-[var(--border-subtle)] pt-3">
                                <span className="mb-2 block text-[0.8rem] font-semibold text-muted-theme">
                                  Alternatif Terdekat (Selisih 1 Titik):
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {visibleAlts.map((alt) => {
                                    const isOrig = alt.symbol === origSym;
                                    return (
                                      <button
                                        key={alt.symbol}
                                        type="button"
                                        disabled={savingRevision}
                                        onClick={() =>
                                          handleApplyCellCorrection(activeCell, alt.symbol)
                                        }
                                        className={`btn btn-secondary btn-sm flex items-center gap-2 ${
                                          isOrig
                                            ? "!border-[var(--primary)] bg-[var(--primary)]/10"
                                            : ""
                                        }`}
                                      >
                                        <BrailleCellDiagram
                                          symbol={alt.symbol}
                                          pattern={alt.pattern || getPatternForSymbol(alt.symbol)}
                                          size={28}
                                        />
                                        <span>
                                          Ganti ke <strong>{alt.symbol}</strong> (
                                          {alt.pattern || getPatternForSymbol(alt.symbol)})
                                          {isOrig ? " · Huruf Awal" : ""}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="m-0 text-[0.84rem] text-muted-theme">
                      Pilih salah satu tombol huruf di atas untuk melihat diagram titik, menyetujui, atau menggantinya.
                    </p>
                  )}
                  {selectedItem.isDraft && (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="text-[0.82rem] text-[var(--text)]">
                        <strong className="block">Pratinjau Tangkapan</strong>
                        <span className="text-muted-theme">Selesai memeriksa sel? Simpan hasil ini ke sesi aktif.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm !bg-emerald-600 hover:!bg-emerald-700 !text-white font-bold"
                          disabled={savingRevision}
                          onClick={handleCommitDraftToSession}
                        >
                          <Check size={14} aria-hidden="true" />
                          <span>Simpan ke Sesi Ini</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm text-rose-500"
                          disabled={savingRevision}
                          onClick={handleDiscardDraft}
                        >
                          <X size={14} aria-hidden="true" />
                          <span>Buang</span>
                        </button>
                      </div>
                    </div>
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
