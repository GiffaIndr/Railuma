import React, { useState, useRef, useEffect } from "react";
import { useCamera } from "../hooks/useCamera";
import { translateBrailleImage } from "../services/api";
import { CheckCircle2, XCircle, Award, Target, Upload, Camera, Trash2 } from "lucide-react";

const HomeworkCorrector = () => {
  const { videoRef, canvasRef, isCameraActive, startCamera, stopCamera, captureFrame } = useCamera();

  const [targetText, setTargetText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState(null);
  
  // State untuk gambar yang diunggah
  const [imagePreview, setImagePreview] = useState(null);
  
  const overlayCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const isEvaluatingRef = useRef(false);

  // Bersihkan layar dari coretan
  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
      clearOverlay();
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Fungsi Logika Pencocokan
  const processCorrection = (boxes, target) => {
    if (!boxes || boxes.length === 0) return { score: 0, total: 0, correct: 0, details: [] };

    const sortedBoxes = [...boxes].sort((a, b) => {
      const yDiff = a.y1 - b.y1;
      if (Math.abs(yDiff) > 30) return yDiff;
      return a.x1 - b.x1;
    });
    
    const targetChars = target.toLowerCase().replace(/\s+/g, "").split("");
    
    let correctCount = 0;
    const details = sortedBoxes.map((box, index) => {
      const predictedChar = box.label.toLowerCase();
      const expectedChar = targetChars[index] || "?";
      
      const isCorrect = predictedChar === expectedChar;
      if (isCorrect) correctCount++;

      return { ...box, expected: expectedChar, isCorrect };
    });

    const totalTarget = Math.max(targetChars.length, sortedBoxes.length);
    const score = Math.round((correctCount / totalTarget) * 100);

    return { score, total: totalTarget, correct: correctCount, details };
  };

  // Fungsi Menggambar Bounding Box
  const drawCorrectionOverlay = (details, imgWidth, imgHeight, isVideo = true) => {
    const canvas = overlayCanvasRef.current;
    const mediaElement = isVideo ? videoRef.current : imageRef.current;
    
    if (!mediaElement || !canvas || !details) return;

    const ctx = canvas.getContext("2d");
    canvas.width = mediaElement.clientWidth;
    canvas.height = mediaElement.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / imgWidth;
    const scaleY = canvas.height / imgHeight;

    details.forEach((box) => {
      const x = box.x1 * scaleX;
      const y = box.y1 * scaleY;
      const w = (box.x2 - box.x1) * scaleX;
      const h = (box.y2 - box.y1) * scaleY;

      if (box.isCorrect) {
        ctx.strokeStyle = "#10B981"; 
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      } else {
        ctx.strokeStyle = "#EF4444"; 
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.moveTo(x + w, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();

        ctx.fillStyle = "#EF4444";
        ctx.fillRect(x, y - 30, Math.max(w, 50), 30);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(`Kunci: ${box.expected.toUpperCase()}`, x + 4, y - 10);
      }
    });
  };

  // Handler Evaluasi lewat Kamera
  const handleEvaluateCamera = async () => {
    if (!targetText.trim()) {
      alert("Harap masukkan Kunci Jawaban terlebih dahulu!");
      return;
    }

    if (isEvaluatingRef.current) return;
    isEvaluatingRef.current = true;
    setIsLoading(true);

    try {
      const imageBlob = await captureFrame();
      if (!imageBlob) throw new Error("Gagal mengambil gambar");

      const data = await translateBrailleImage(imageBlob);

      if (data.status === "success" && data.boxes) {
        const evalResult = processCorrection(data.boxes, targetText);
        setReport(evalResult);
        drawCorrectionOverlay(evalResult.details, data.image_width, data.image_height, true);
      } else {
        alert("Tidak ada Braille yang terdeteksi di kamera.");
      }
    } catch (err) {
      console.error("Gagal mengevaluasi PR:", err);
      alert("Terjadi kesalahan saat memproses gambar.");
    } finally {
      setIsLoading(false);
      isEvaluatingRef.current = false;
    }
  };

  // Handler Evaluasi lewat Upload File
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!targetText.trim()) {
      alert("Harap masukkan Kunci Jawaban terlebih dahulu sebelum mengunggah gambar!");
      e.target.value = "";
      return;
    }

    // Matikan kamera jika sedang menyala
    if (isCameraActive) stopCamera();
    clearOverlay();
    setReport(null);

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    setIsLoading(true);
    try {
      const data = await translateBrailleImage(file);

      if (data.status === "success" && data.boxes) {
        const evalResult = processCorrection(data.boxes, targetText);
        setReport(evalResult);
        
        // Timeout kecil agar <img> tag selesai dirender React sebelum canvas mengambil dimensinya
        setTimeout(() => {
          drawCorrectionOverlay(evalResult.details, data.image_width, data.image_height, false);
        }, 150);
      } else {
        alert("Tidak ada Braille yang terdeteksi pada gambar.");
      }
    } catch (err) {
      console.error("Gagal mengevaluasi PR:", err);
      alert("Terjadi kesalahan saat memproses gambar.");
    } finally {
      setIsLoading(false);
      e.target.value = ""; // Reset input file
    }
  };

  // Bersihkan mode upload dan kamera
  const resetKorektor = () => {
    stopCamera();
    clearOverlay();
    setReport(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6">
      
      {/* KOTAK INPUT KUNCI JAWABAN */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg">
        <label className="text-purple-400 font-bold text-sm uppercase flex items-center gap-2 mb-3">
          <Target size={18} /> Kunci Jawaban PR
        </label>
        <input
          type="text"
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          placeholder="Contoh: SAYA MAKAN"
          className="w-full bg-slate-950 text-white font-mono text-lg px-4 py-3 rounded-xl border border-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none transition-all"
        />
      </div>

      {/* FRAME KAMERA / PREVIEW UPLOAD & OVERLAY */}
      <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center">
        
        {/* Tampilan Kamera Real-time */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-contain ${isCameraActive ? "block" : "hidden"}`}
        />
        
        {/* Tampilan Gambar yang Diunggah */}
        {!isCameraActive && imagePreview && (
          <img 
            ref={imageRef} 
            src={imagePreview} 
            alt="Preview Tugas" 
            className="w-full h-full object-contain" 
          />
        )}

        {/* Canvas untuk Silang Merah / Kotak Hijau */}
        <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        <canvas ref={canvasRef} className="hidden" />

        {!isCameraActive && !imagePreview && (
          <span className="text-slate-500 font-medium flex flex-col items-center gap-2">
            <Camera size={32} className="opacity-50" />
            Pilih metode pindai di bawah
          </span>
        )}
      </div>

      {/* KONTROL KAMERA & UPLOAD */}
      <div className="flex flex-wrap justify-center gap-3">
        {/* Input Hidden untuk File Upload */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          className="hidden" 
        />

        {!isCameraActive && !imagePreview ? (
          <>
            <button 
              onClick={startCamera} 
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors shadow-lg"
            >
              <Camera size={18} /> Nyalakan Kamera
            </button>
            <button 
              onClick={() => fileInputRef.current.click()} 
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg"
            >
              <Upload size={18} /> Unggah Foto PR
            </button>
          </>
        ) : (
          <>
            {isCameraActive && (
              <button
                onClick={handleEvaluateCamera}
                disabled={isLoading}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-50 transition-colors shadow-lg"
              >
                {isLoading ? "Mengoreksi..." : "Jepret & Koreksi!"}
              </button>
            )}
            
            {imagePreview && !isLoading && (
               <button 
                onClick={() => fileInputRef.current.click()} 
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors shadow-lg"
              >
                Ganti Foto
              </button>
            )}

            <button 
              onClick={resetKorektor} 
              className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-red-500 text-white font-bold rounded-xl transition-colors shadow-lg"
            >
              <Trash2 size={18} /> Bersihkan Layar
            </button>
          </>
        )}
      </div>

      {/* LAPORAN NILAI */}
      {report && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-xl">
              <Award size={28} /> Nilai Akhir
            </div>
            <div className={`text-4xl font-extrabold px-5 py-2 rounded-xl border ${
              report.score >= 80 ? 'text-emerald-400 bg-emerald-900/40 border-emerald-500/30' : 
              report.score >= 50 ? 'text-yellow-400 bg-yellow-900/40 border-yellow-500/30' : 
              'text-red-400 bg-red-900/40 border-red-500/30'
            }`}>
              {report.score}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-emerald-950/30 p-4 rounded-xl border border-emerald-800/40 flex flex-col gap-1 items-center justify-center text-emerald-400">
              <CheckCircle2 size={24} className="mb-1" />
              <span className="font-semibold text-lg">{report.correct} Huruf</span>
              <span className="text-emerald-500/70 text-xs uppercase">Benar</span>
            </div>
            <div className="bg-red-950/30 p-4 rounded-xl border border-red-800/40 flex flex-col gap-1 items-center justify-center text-red-400">
              <XCircle size={24} className="mb-1" />
              <span className="font-semibold text-lg">{report.total - report.correct} Huruf</span>
              <span className="text-red-500/70 text-xs uppercase">Salah / Meleset</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeworkCorrector;