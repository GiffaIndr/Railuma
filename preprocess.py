"""Tahap pra-pemrosesan citra (OpenCV) sebelum gambar masuk ke model YOLO."""
import os

import cv2
import numpy as np

# Ketajaman diukur pada gambar yang diperkecil ke lebar 320 px (varians Laplacian).
# Versi lama memakai lebar 100 px: pada ukuran itu detail titik Braille sudah hilang,
# sehingga gambar yang sangat buram pun masih lolos (nilai tetap jauh di atas 80).
# Nilai ini harus SAMA dengan braille-web/src/utils/blur.js.
# Ambang awal 60 hanya titik awal: kalibrasi dengan foto Anda sendiri
# (evaluate.py mencetak kolom ketajaman untuk tiap foto uji).
BLUR_MIN = float(os.getenv("BLUR_MIN", "60"))
_UKURAN_CEK = 320


def laplacian_variance(img_bgr):
    """Ukur ketajaman gambar. Makin kecil nilainya, makin buram."""
    abu = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = abu.shape
    tinggi = max(3, round(h / w * _UKURAN_CEK))
    kecil = cv2.resize(abu, (_UKURAN_CEK, tinggi), interpolation=cv2.INTER_AREA)
    lap = cv2.Laplacian(kecil, cv2.CV_64F, ksize=1)
    return float(lap[1:-1, 1:-1].var())


def is_blurry(img_bgr, batas=None):
    batas = BLUR_MIN if batas is None else batas
    nilai = laplacian_variance(img_bgr)
    return nilai < batas, round(nilai)


def apply_clahe(img_bgr, clip_limit=2.0, tile=8):
    """CLAHE pada kanal kecerahan (L) ruang warna LAB.

    Kontras diratakan per kotak kecil, sehingga bayangan dan cahaya tidak rata
    berkurang. Hasilnya tetap gambar 3 kanal agar bisa langsung dipakai YOLO.
    CATATAN: model sebaiknya dilatih dengan jenis gambar yang sama dengan yang
    dilihat saat inferensi. Jika CLAHE dipakai di sini, tambahkan variasi
    kecerahan/bayangan saat training (lihat train_braille.py).
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    l2 = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l2, a, b)), cv2.COLOR_LAB2BGR)
