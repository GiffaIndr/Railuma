import React, { useState, useEffect, useRef } from "react";
import { useCamera } from "../hooks/useCamera";
import { translateBrailleImage } from "../services/api";
import { speakText } from "../utils/speech";
import { exportToTXT, exportToPDF } from "../utils/exporter";
import { Camera, Upload, Trash2, FileText, Download, Focus, Maximize, AlertTriangle } from "lucide-react";

const BrailleScanner = () => {
  const { videoRef, canvasRef, isCameraActive, cameraError, startCamera, stopCamera, captureFrame } = useCamera();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isRealtime, setIsRealtime] = useState(false);
  const [scanMode, setScanMode] = useState("focus");
  
  // STATE BARU: Indikator Gambar Buram
  const [isBlurry, setIsBlurry] = useState(false); 
  const [blurScore, setBlurScore] = useState(0);

  const overlayCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastSpokenRef = useRef("");
  const isProcessingRef = useRef(false);
  const lastBlurWarningTime = useRef(0);

  // =========================================================
  // IMAGE PROCESSING: DETEKSI BURAM (LAPLACIAN VARIANCE)
  // =========================================================
  const checkBlurLaplacian = (videoElement) => {
    if (!videoElement || videoElement.videoWidth === 0) return { isBlurry: false, variance: 0 };
    
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    
    // Perkecil resolusi agar perhitungan matematika tidak membuat HP lag (100px)
    canvas.width = 100; 
    canvas.height = (videoElement.videoHeight / videoElement.videoWidth) * 100;
    
    if (canvas.height === 0) return { isBlurry: false, variance: 0 };

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 1. Konversi ke Grayscale (Abu-abu)
    const gray = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    
    // 2. Terapkan Kernel Laplacian 3x3 untuk mencari Tepi Teks (Edge Detection)
    let sum = 0;
    const laplacian = new Int16Array(canvas.width * canvas.height);
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = y * canvas.width + x;
        const val = 
          gray[idx - canvas.width] + // Atas
          gray[idx - 1] +            // Kiri
          gray[idx + 1] +            // Kanan
          gray[idx + canvas.width] - // Bawah
          4 * gray[idx];             // Tengah
        laplacian[idx] = val;
        sum += val;
      }
    }
    
    // 3. Hitung Varians (Variance)
    const mean = sum / (canvas.width * canvas.height);
    let variance = 0;
    for (let i = 0; i < laplacian.length; i++) {
      variance += Math.pow(laplacian[i] - mean, 2);
    }
    variance = variance / (canvas.width * canvas.height);
    
    // Threshold ketajaman: Jika di bawah 80, berarti gambar buram / terlalu dekat
    return { isBlurry: variance < 80, variance: Math.round(variance) };
  };

  // =========================================================
  // AUDIO-HAPTIC SENSOR
  // =========================================================
  const playSensorFeedback = (boxCount) => {
    if (boxCount === 0) return;
    if (navigator.vibrate) navigator.vibrate(40); 

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(400 + (boxCount * 25), ctx.currentTime); 
      gain.gain.setValueAtTime(0.05, ctx.currentTime); 
      osc.start();
      osc.stop(ctx.currentTime + 0.08); 
    } catch (err) {}
  };

  // =========================================================
  // LOGIKA MENGGAMBAR KOTAK & AREA FOKUS
  // =========================================================
  const drawBoundingBoxes = (boxes, imgWidth, imgHeight) => {
    const canvas = overlayCanvasRef.current;
    const mediaElement = isCameraActive ? videoRef.current : imageRef.current;
    
    if (!mediaElement || !canvas || !boxes) return { validBoxesCount: 0, filteredText: "" };

    const ctx = canvas.getContext("2d");
    canvas.width = mediaElement.clientWidth;
    canvas.height = mediaElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / imgWidth;
    const scaleY = canvas.height / imgHeight;

    const focusRect = { x: canvas.width * 0.1, y: canvas.height * 0.3, w: canvas.width * 0.8, h: canvas.height * 0.4 };

    if (scanMode === "focus") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, canvas.width, focusRect.y);
      ctx.fillRect(0, focusRect.y + focusRect.h, canvas.width, canvas.height - (focusRect.y + focusRect.h));
      ctx.fillRect(0, focusRect.y, focusRect.x, focusRect.h);
      ctx.fillRect(focusRect.x + focusRect.w, focusRect.y, canvas.width - (focusRect.x + focusRect.w), focusRect.h);

      ctx.strokeStyle = "#38BDF8";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(focusRect.x, focusRect.y, focusRect.w, focusRect.h);
      ctx.setLineDash([]);
    }

    let validBoxesCount = 0;
    let filteredText = [];

    const sortedBoxes = [...boxes].sort((a, b) => {
      const yDiff = a.y1 - b.y1;
      return Math.abs(yDiff) > 30 ? yDiff : a.x1 - b.x1;
    });

    sortedBoxes.forEach((box) => {
      const x = box.x1 * scaleX;
      const y = box.y1 * scaleY;
      const w = (box.x2 - box.x1) * scaleX;
      const h = (box.y2 - box.y1) * scaleY;
      const centerX = x + w / 2;
      const centerY = y + h / 2;
      const isInsideFocus = scanMode === "full" || (centerX >= focusRect.x && centerX <= focusRect.x + focusRect.w && centerY >= focusRect.y && centerY <= focusRect.y + focusRect.h);

      if (isInsideFocus) {
        validBoxesCount++;
        filteredText.push(box.label);
        ctx.strokeStyle = scanMode === "focus" ? "#FDE047" : "#38BDF8"; 
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = scanMode === "focus" ? "#FDE047" : "#38BDF8";
        ctx.fillRect(x, y - 24, w > 30 ? w : 30, 24);
        ctx.fillStyle = scanMode === "focus" ? "#000000" : "#FFFFFF";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(box.label.toUpperCase(), x + 4, y - 6);
      } else if (scanMode === "focus") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    });

    return { validBoxesCount, filteredText: filteredText.join("") };
  };

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  };

  // =========================================================
  // LOOP REAL-TIME SCANNER (Dengan Pemeriksaan Buram)
  // =========================================================
  useEffect(() => {
    let timer;

    const runRealtimeScan = async () => {
      if (!isCameraActive || !isRealtime || isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        // 1. LAKUKAN PENGECEKAN BLUR DULU SEBELUM HIT API
        const blurCheck = checkBlurLaplacian(videoRef.current);
        setIsBlurry(blurCheck.isBlurry);
        setBlurScore(blurCheck.variance);

        if (blurCheck.isBlurry) {
          // Jika gambar buram, JANGAN panggil API AI untuk hemat kuota server
          clearOverlay();
          if (scanMode === "focus") drawBoundingBoxes([], 1, 1);
          
          // Audio Peringatan ke Tunanetra (Maksimal berbunyi tiap 3 detik agar tidak spam)
          const now = Date.now();
          if (now - lastBlurWarningTime.current > 3000) {
            speakText("Kamera buram. Mohon fokuskan atau jauhkan sedikit.");
            lastBlurWarningTime.current = now;
          }
          throw new Error("Gambar buram, skip API"); // Lompat ke finally
        }

        // 2. JIKA GAMBAR TAJAM, PROSES AI
        const imageBlob = await captureFrame();
        if (imageBlob) {
          const data = await translateBrailleImage(imageBlob);
          if (data.status === "success" && data.boxes && data.boxes.length > 0) {
            const { validBoxesCount, filteredText } = drawBoundingBoxes(data.boxes, data.image_width, data.image_height);
            
            if (filteredText) {
               setResult({ raw: filteredText, final: filteredText });
               playSensorFeedback(validBoxesCount);
               if (filteredText !== lastSpokenRef.current) {
                 speakText(filteredText);
                 lastSpokenRef.current = filteredText;
               }
            }
          } else {
            clearOverlay();
            if (scanMode === "focus") drawBoundingBoxes([], 1, 1); 
          }
        }
      } catch (err) {
        // Abaikan error "Gambar buram", hanya skip frame
      } finally {
        isProcessingRef.current = false;
        if (isCameraActive && isRealtime) {
          timer = setTimeout(runRealtimeScan, 600);
        }
      }
    };

    if (isCameraActive && isRealtime) {
      runRealtimeScan();
    } else {
      clearOverlay();
      if (isCameraActive && scanMode === "focus") drawBoundingBoxes([], 1, 1);
    }

    return () => clearTimeout(timer);
  }, [isCameraActive, isRealtime, scanMode]);


  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      
      {/* HEADER: PENGATURAN AREA FOKUS */}
      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700 shadow-xl flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400">Area Pemindaian</span>
          <span className="text-xs text-slate-500 mt-1">Pilih seberapa luas area pembacaan</span>
        </div>
        <div className="flex bg-slate-950 rounded-xl p-1 border border-slate-800">
          <button onClick={() => setScanMode("focus")} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${scanMode === "focus" ? "bg-yellow-400 text-slate-900 shadow-md" : "text-slate-400 hover:text-white"}`}>
            <Focus size={14} /> Terpusat
          </button>
          <button onClick={() => setScanMode("full")} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${scanMode === "full" ? "bg-sky-400 text-slate-900 shadow-md" : "text-slate-400 hover:text-white"}`}>
            <Maximize size={14} /> Layar Penuh
          </button>
        </div>
      </div>

      {/* FRAME KAMERA */}
      <div className={`relative w-full aspect-video bg-slate-950 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border-2 transition-colors ${isBlurry && isRealtime ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'border-slate-800'}`}>
        
        <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-contain ${isCameraActive ? "block" : "hidden"}`} />
        <canvas ref={overlayCanvasRef} className={`absolute top-0 left-0 w-full h-full pointer-events-none ${isCameraActive ? "block" : "hidden"}`} />
        <canvas ref={canvasRef} className="hidden" />

        {!isCameraActive && (
          <span className="text-slate-500 font-medium flex flex-col items-center gap-2">
            <Camera size={32} className="opacity-50" /> Nyalakan Kamera
          </span>
        )}

        {/* INDIKATOR KETAHAMAN CITRA (IMAGE PROCESSING) */}
        {isCameraActive && isRealtime && (
          <div className={`absolute top-4 left-4 flex flex-col gap-1`}>
             <div className={`text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-2 shadow-lg backdrop-blur-md border ${
                isBlurry ? 'bg-red-500/90 text-white border-red-400 animate-pulse' : 'bg-slate-900/80 text-sky-400 border-sky-500/50'
              }`}>
              {isBlurry ? <AlertTriangle size={14} /> : <div className="w-2 h-2 bg-sky-400 rounded-full animate-ping"></div>}
              {isBlurry ? "KAMERA BURAM/DEKAT" : "MENGANALISIS..."}
            </div>
            {/* Tampilkan nilai varians Laplacian untuk flex dosen */}
            <span className="text-[10px] text-slate-300 bg-black/50 px-2 py-0.5 rounded-full w-max font-mono">
              Laplacian Var: {blurScore} (Min: 80)
            </span>
          </div>
        )}
      </div>

      {/* TOMBOL KONTROL */}
      <div className="flex flex-wrap gap-3 justify-center">
        {!isCameraActive ? (
          <button onClick={startCamera} className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-lg transition-transform active:scale-95">
            <Camera size={18} /> Nyalakan Kamera
          </button>
        ) : (
          <>
            <button onClick={() => setIsRealtime(!isRealtime)} className={`px-6 py-3 font-bold rounded-xl shadow-lg transition-all active:scale-95 ${isRealtime ? "bg-purple-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
              {isRealtime ? "Auto-Scan (ON)" : "Auto-Scan (OFF)"}
            </button>
            <button onClick={() => { stopCamera(); setIsRealtime(false); clearOverlay(); }} className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2">
              <Trash2 size={18} /> Tutup
            </button>
          </>
        )}
      </div>

      {/* TAMPILAN HASIL */}
      {result && (
        <div className="mt-2 p-6 bg-slate-900 rounded-2xl shadow-xl border border-slate-700 relative overflow-hidden">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-slate-800 pb-3">
            <h3 className="text-lg font-bold text-slate-200">Hasil Pemindaian</h3>
          </div>
          <div>
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">Teks Akhir Terdeteksi</span>
            <p className="mt-1 text-2xl font-bold text-white bg-slate-800 p-4 rounded-xl shadow-inner border border-slate-700">
              {result.final || "-"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrailleScanner;