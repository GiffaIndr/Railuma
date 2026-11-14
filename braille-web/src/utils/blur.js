// Deteksi buram dengan Laplacian Variance.
// Makin kecil nilainya, makin buram (atau kamera terlalu dekat).
// HARUS sama dengan preprocess.py di server: lebar 320 px, ambang awal 60.
// Pada lebar 100 px (versi lama) detail titik Braille sudah hilang, sehingga
// gambar yang sangat buram pun masih lolos. Kalibrasi ambang dengan foto Anda.
export const BLUR_MIN = 30;
const UKURAN_CEK = 320;

// source bisa berupa <video>, <img>, <canvas>, atau ImageBitmap.
export const measureSharpness = (source) => {
  const srcW = source?.videoWidth || source?.naturalWidth || source?.width || 0;
  const srcH = source?.videoHeight || source?.naturalHeight || source?.height || 0;
  if (!srcW || !srcH) return { variance: 0, isBlurry: false, ready: false };

  const w = UKURAN_CEK;
  const h = Math.max(3, Math.round((srcH / srcW) * w));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // 1. Abu-abu
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // 2. Kernel Laplacian 3x3, hanya piksel dalam (sama dengan server: lap[1:-1, 1:-1])
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const val = gray[idx - w] + gray[idx - 1] + gray[idx + 1] + gray[idx + w] - 4 * gray[idx];
      sum += val;
      sumSq += val * val;
      n++;
    }
  }

  // 3. Varians
  const mean = sum / n;
  const variance = Math.round(sumSq / n - mean * mean);

  return { variance, isBlurry: variance < BLUR_MIN, ready: true };
};

// Kata untuk pembaca layar dan tampilan (bukan hanya warna)
export const sharpnessLabel = (variance) => {
  if (variance < BLUR_MIN) return "Rendah";
  if (variance < BLUR_MIN * 2) return "Cukup";
  return "Bagus";
};
