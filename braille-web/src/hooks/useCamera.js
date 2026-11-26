import { useState, useRef, useCallback, useEffect } from "react";

export const useCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const activeDeviceIdRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState("environment");

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

  const startCamera = useCallback(async (preferredFacing = null) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Peramban Anda belum mendukung akses kamera (perlu izin HTTPS).");
      return false;
    }

    const targetFacing = typeof preferredFacing === "string" ? preferredFacing : (facingMode || "environment");
    const isSwitching = typeof preferredFacing === "string" && Boolean(streamRef.current);
    const prevDeviceId = activeDeviceIdRef.current;

    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (isSwitching) {
        // Beri jeda singkat agar sensor kamera HP melepas lock sebelum pindah depan/belakang
        await new Promise((r) => setTimeout(r, 80));
      }

      // Urutan fallback constraint kamera agar kompatibel di semua merek HP (Samsung, Xiaomi, iPhone, dll.)
      const candidateConstraints = [
        { video: { facingMode: { exact: targetFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { video: { facingMode: { exact: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: { exact: targetFacing } } },
        { video: { facingMode: { ideal: targetFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
        { video: { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: { ideal: targetFacing } } },
        { video: { facingMode: targetFacing } },
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

      // Jika sedang ganti kamera (depan <-> belakang) tetapi browser HP mengembalikan deviceId yang sama,
      // cari kamera alternatif melalui enumerateDevices()
      if (stream && isSwitching && prevDeviceId && navigator.mediaDevices?.enumerateDevices) {
        try {
          const curTrack = stream.getVideoTracks()[0];
          const curId = curTrack?.getSettings?.()?.deviceId;
          if (curId && curId === prevDeviceId) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
            if (videoInputs.length > 1) {
              const wantFront = targetFacing === "user";
              const byLabel = videoInputs.find((d) =>
                d.deviceId !== prevDeviceId &&
                (wantFront
                  ? /front|user|depan|selfie/i.test(d.label)
                  : /back|rear|environment|belakang/i.test(d.label)),
              );
              const altDevice = byLabel || videoInputs.find((d) => d.deviceId !== prevDeviceId);
              if (altDevice) {
                stream.getTracks().forEach((t) => t.stop());
                stream = await navigator.mediaDevices.getUserMedia({
                  video: { deviceId: { exact: altDevice.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                });
              }
            }
          }
        } catch {
          // tetap gunakan stream yang sudah didapat
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
      try {
        activeDeviceIdRef.current = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId || null;
      } catch {
        activeDeviceIdRef.current = null;
      }

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
        setFacingMode(targetFacing);
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
  }, [facingMode]);

  const switchCamera = useCallback(async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    return startCamera(nextFacing);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return Promise.resolve(null);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92));
  }, []);

  return { videoRef, canvasRef, isCameraActive, cameraError, facingMode, startCamera, stopCamera, switchCamera, captureFrame };
};
