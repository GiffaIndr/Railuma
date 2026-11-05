# Perbaikan akurasi pembacaan Braille

## Penyebab utama (ditemukan dari file `best.pt` Anda)
Model dilatih dengan `fliplr=0.5`, jadi setengah gambar training dicerminkan.
Pada Braille, cermin mengubah huruf: **d↔f, e↔i, h↔j, r↔w**. Model belajar dari
label yang bertentangan, sehingga pasangan huruf ini sulit dibedakan.
**Kode di paket ini tidak bisa memperbaiki itu. Anda harus melatih ulang model.**

## Langkah (urut)
1. **Latih ulang**: buka `train_braille.py` di Colab (isi `ROBOFLOW_API_KEY` di Colab Secrets).
   Di Roboflow juga pastikan tidak ada augmentasi *Flip* pada versi dataset.
   Salin `best.pt` baru ke folder ini, lalu jalankan API dengan `IMGSZ=960`.
2. **Cabut API key Roboflow lama** (tertulis di `Braille.ipynb`) dan buat yang baru.
3. Salin file di paket ini ke proyek. Hapus `compare_clahe.py` (diganti `evaluate.py`).
   `pip install -r requirements.txt`
4. `python inspect_model.py` — cek nama kelas. Jika tidak ada kelas tanda angka/kapital,
   atau namanya beda dari `NUMBER_LABELS`/`CAPITAL_LABELS` di `braille_logic.py`, sesuaikan.
   Perhatikan juga `MERGE_CASE` (model Anda punya kelas A–Z dan a–z).
5. `python test_postprocess.py` — tes logika tanpa model (harus "SEMUA TES LULUS").
6. Kumpulkan 30–50 foto uji nyata + kunci `.txt` di folder `uji/`
   (foto ini jangan dipakai training), lalu `python evaluate.py --imgsz 640 960`.
   Bandingkan **CER raw vs final**: jika final lebih buruk, koreksi KBBI merusak hasil.
7. Kalibrasi ambang ketajaman (`BLUR_MIN`, default 60) dengan kolom `ketajaman` di hasil evaluasi.
   Nilai yang sama harus ada di `preprocess.py` (atau env `BLUR_MIN`) dan `utils/blur.js`.

## Yang berubah
| File | Perubahan |
|---|---|
| `braille_logic.py` (baru) | baris dari titik tengah, deskew, spasi dari pitch sel, buang kotak ganda, tanda angka/kapital, confidence per huruf |
| `koreksi.py` (baru) | kamus disaring (hanya kata tunggal), kandidat cepat, biaya ganti huruf mengikuti pola titik, nama/kata yakin tidak diubah, kandidat seri tidak ditebak |
| `main.py` | conf 0.25, iou 0.45, `agnostic_nms`, `IMGSZ` bisa diatur, endpoint tidak memblokir server, CORS valid, output tambahan (`words`, `mean_conf`, `skew_deg`), `/labels` & `/health` |
| `preprocess.py` | ketajaman diukur pada lebar 320 px (100 px terlalu kecil: gambar sangat buram pun lolos) |
| `evaluate.py` (baru) | CER raw vs final, bandingkan imgsz dan CLAHE |
| `inspect_model.py` (baru) | cek kelas dan peringatan flip |
| `train_braille.py` (baru) | tanpa flip, yolov8s, imgsz 960, augmentasi cahaya/rotasi, tanpa API key di kode |
| web: `blur.js`, `useCamera.js`, `api.js`, `BrailleScanner.jsx`, `stabilizer.js` | ketajaman 320 px, kamera 1080p + JPEG 0.92 + fokus kontinu, timeout, penstabil suara terbanyak dari 5 frame, teks mentah ditampilkan |

## Batasan yang jujur
* Belum diuji dengan `best.pt` dan kamera Anda. Yang sudah diuji: logika baca/koreksi dengan data sintetis (`test_postprocess.py`) dan sintaks kode web.
* Ambang (`conf`, `BLUR_MIN`, `RASIO_SPASI`, `KONF_LINDUNG`) adalah titik awal; setel dengan `evaluate.py`.
* Perspektif (kertas difoto serong) belum dikoreksi, hanya kemiringan (rotasi).
