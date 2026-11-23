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
  const inW = w - 2;
  const inH = h - 2;
  const lap = new Float32Array(inW * inH);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    const rowOff = (y - 1) * inW;
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const val = gray[idx - w] + gray[idx - 1] + gray[idx + 1] + gray[idx + w] - 4 * gray[idx];
      lap[rowOff + (x - 1)] = val;
      sum += val;
      sumSq += val * val;
      n++;
    }
  }

  // 3. Varians global + rata-rata 3 petak lokal tertajam (8x8 grid)
  // agar kertas Braille yang 95% polos dengan hanya 1 kata tidak tertolak buram.
  const mean = sum / n;
  const globalVariance = sumSq / n - mean * mean;

  const grid = 8;
  const stepX = Math.floor(inW / grid);
  const stepY = Math.floor(inH / grid);
  let top3Mean = globalVariance;
  if (stepX >= 8 && stepY >= 8) {
    const patchVars = [];
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        let pSum = 0;
        let pSumSq = 0;
        let pN = 0;
        const y0 = gy * stepY;
        const y1 = y0 + stepY;
        const x0 = gx * stepX;
        const x1 = x0 + stepX;
        for (let py = y0; py < y1; py++) {
          const rOff = py * inW;
          for (let px = x0; px < x1; px++) {
            const v = lap[rOff + px];
            pSum += v;
            pSumSq += v * v;
            pN++;
          }
        }
        if (pN > 0) {
          const pMean = pSum / pN;
          patchVars.push(pSumSq / pN - pMean * pMean);
        }
      }
    }
    if (patchVars.length >= 3) {
      patchVars.sort((a, b) => b - a);
      top3Mean = (patchVars[0] + patchVars[1] + patchVars[2]) / 3;
    }
  }

  const variance = Math.round(Math.max(globalVariance, top3Mean));

  return { variance, isBlurry: variance < BLUR_MIN, ready: true };
};

// Kata untuk pembaca layar dan tampilan (bukan hanya warna)
export const sharpnessLabel = (variance) => {
  if (variance < BLUR_MIN) return "Rendah";
  if (variance < BLUR_MIN * 2) return "Cukup";
  return "Bagus";
};
