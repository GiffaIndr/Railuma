# Railuma: Pembaca & Ruang Kerja Optik Braille Berbasis YOLOv8s dan OpenCV

Railuma adalah aplikasi web dan API pembaca huruf Braille cetak maupun tulis tangan (reglet) berbasis visi komputer (**OpenCV** + **YOLOv8s @ 960 px**) dengan koreksi leksikal berbobot pola titik Braille 6-titik serta ruang kerja sesi pengguna berbasis **Supabase Auth & Row-Level Security (RLS)**.

- **Aplikasi Web Produksi**: [https://railumabaca.vercel.app](https://railumabaca.vercel.app)
- **Model Deteksi**: `best.pt` (`yolov8s@960`, 53 kelas: `A`-`Z`, `a`-`z`, `space`, dilatih dengan `fliplr=0.0` dan `flipud=0.0` agar orientasi titik Braille tidak terbalik)

---

## 1. Arsitektur & Parameter Pipeline

| Komponen | Berkas | Parameter / Ketentuan |
| :--- | :--- | :--- |
| **Gerbang Kualitas & Pra-pemrosesan** | [`preprocess.py`](./preprocess.py), [`braille-web/src/utils/blur.js`](./braille-web/src/utils/blur.js) | Pengukuran varians Laplacian seluruh citra pada lebar standar `_UKURAN_CEK = 320` px dengan ambang **`BLUR_MIN = 30`** (sinkron di server Python dan klien JavaScript). Menyediakan CLAHE ruang warna LAB (`clipLimit=2.0`, `tileGridSize=(8,8)`) dan adaptasi pencahayaan bayangan (`enhance_braille_lighting`). |
| **Deteksi Sel Braille (CNN)** | [`main.py`](./main.py), `best.pt` | YOLOv8s pada resolusi `IMGSZ = 960`, `CONF = 0.25`, `IOU = 0.45`, `agnostic_nms = True`, `max_det = 500`. |
| **Rekonstruksi Baris, Spasi & Angka** | [`braille_logic.py`](./braille_logic.py) | Koreksi kemiringan (*deskew*) berbasis median sudut antar-sel sebaris, pengelompokan baris (`RASIO_BARIS = 0.6`), penyisipan spasi otomatis dari median jarak pusat sel (`RASIO_SPASI = 1.65`), dan aturan kontekstual angka / huruf kapital. |
| **Koreksi Leksikal Berbobot Titik** | [`koreksi.py`](./koreksi.py), [`kata_kbbi.txt`](./kata_kbbi.txt) | Jarak edit Levenshtein berbobot kemiripan pola 6-titik Braille (`biaya_ganti`: `0.45` untuk selisih 1 titik, `0.85` untuk 2 titik, `1.25` untuk $\ge 3$ titik) dengan perlindungan kata berkeyakinan tinggi (`KONF_LINDUNG = 0.90`). |

---

## 2. Spesifikasi Dataset Pelatihan

Model `best.pt` dilatih menggunakan dataset publik **Roboflow Universe**:
- **Proyek**: `braille-sight-s6rpk / braille-okym2` (Versi 1)
- **Jumlah Berkas Terverifikasi**: **3.670 citra** dan **29.024 anotasi** kotak pembatas (*bounding box*) sel Braille pada 53 kelas (`A`-`Z`, `a`-`z`, `space`).
- **Pelatihan Ulang Tanpa Cermin (*No-Flip*)**: Skrip pelatihan resmi disimpan di [`train_braille.py`](./train_braille.py) dengan `fliplr=0.0` dan `flipud=0.0`.
- **Keamanan Kunci API**: Kunci API Roboflow **tidak pernah ditulis di dalam kode**. Skrip [`train_braille.py`](./train_braille.py) membaca `ROBOFLOW_API_KEY` melalui **Google Colab Secrets** (`google.colab.userdata.get("ROBOFLOW_API_KEY")`) atau variabel lingkungan `ROBOFLOW_API_KEY`. Kunci API lama yang pernah digunakan pada notebook eksperimen awal telah dicabut (*revoked*).

---

## 3. Sumber Data & Lisensi Daftar Kata (`kata_kbbi.txt`)

- **Kode Sumber Aplikasi Railuma**: Dilisensikan di bawah **MIT License** (lihat berkas [`LICENSE`](./LICENSE)).
- **Daftar Kata Leksikon ([`kata_kbbi.txt`](./kata_kbbi.txt))**:
  - Berisi **69.741 entri baris** yang saat *runtime* disaring oleh [`koreksi.py`](./koreksi.py) (`^[a-z]{2,25}$`) menjadi **61.976 kata tunggal alfabet murni**.
  - **Sumber Hulu**: Diunduh dari repositori publik GitHub [`damzaky/kumpulan-kata-bahasa-indonesia-KBBI`](https://github.com/damzaky/kumpulan-kata-bahasa-indonesia-KBBI) (`legacy/list_1.0.0.txt`, commit `3366aa0c06c9d1d1b818c3db51b235bbad1fb83d`).
  - **Status Lisensi Daftar Kata**: Repositori hulu `damzaky/kumpulan-kata-bahasa-indonesia-KBBI` tidak menyertakan berkas lisensi terbuka formal, dan kosakata bahasa Indonesia di dalamnya bersumber dari Kamus Besar Bahasa Indonesia (KBBI) yang disusun oleh **Badan Pengembangan dan Pembinaan Bahasa, Kementerian Pendidikan Dasar dan Menengah Republik Indonesia**. Di dalam proyek Railuma, daftar kata ini digunakan semata-mata sebagai indeks pencocokan ejaan untuk keperluan penelitian akademik dan pendidikan aksesibilitas tunanetra non-komersial.
- **Aset Foto Antarmuka**:
  - Foto ilustrasi pada halaman depan berasal dari Wikimedia Commons di bawah lisensi masing-masing pembuat: Lance Vanlewen (CC BY-SA 4.0), Trixia Lao (CC0), dan M Joko Apriyo Putro (CC BY-SA 4.0).

---

## 4. Menjalankan Proyek Secara Lokal

### Backend (FastAPI + YOLOv8s)
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend (React + Vite)
```bash
cd braille-web
npm install
npm run dev
```

### Pengujian Logika & Evaluasi Akurasi (CER)
```bash
python test_postprocess.py
python evaluate.py --folder uji --imgsz 960
```
