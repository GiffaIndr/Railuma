import { useState, useRef, useCallback, useEffect } from "react";

export const useCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Matikan kamera saat pengguna berpindah fitur
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Peramban Anda belum mendukung akses kamera (perlu izin HTTPS).");
      return false;
    }

    try {
      setCameraError(null);

      // Urutan fallback constraint kamera agar kompatibel di semua merek HP (Samsung, Xiaomi, iPhone, dll.)
      const candidateConstraints = [
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: { ideal: "environment" } } },
        { video: { facingMode: "environment" } },
        { video: true },
      ];

      let stream = null;
      let lastErr = null;

      for (const constraints of candidateConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!stream) {
        console.error("Gagal membuka kamera:", lastErr);
        if (lastErr?.name === "NotAllowedError" || lastErr?.name === "PermissionDeniedError") {
          setCameraError("Akses kamera ditolak. Silakan berikan izin kamera pada pengaturan browser HP Anda.");
        } else {
          setCameraError("Kamera tidak dapat diakses. Pastikan tidak sedang dipakai aplikasi lain dan coba lagi.");
        }
        return false;
      }

      streamRef.current = stream;

      // Fokus otomatis terus-menerus bila didukung hardware kamera
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() || {};
        if (caps.focusMode?.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch (e) {
        console.warn("Fokus otomatis tidak bisa diatur:", e);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Gagal memulai putar video otomatis:", playErr);
        }
        setIsCameraActive(true);
        return true;
      }

      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return false;
    } catch (err) {
      console.error(err);
      setCameraError("Kamera tidak bisa dinyalakan. Izinkan akses kamera di browser, lalu coba lagi.");
      return false;
    }
  }, []);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return Promise.resolve(null);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92));
  }, []);

  return { videoRef, canvasRef, isCameraActive, cameraError, startCamera, stopCamera, captureFrame };
};
