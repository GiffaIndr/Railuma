"""Tahap pra-pemrosesan dan gerbang kualitas citra sebelum gambar masuk ke YOLO."""
import os

import cv2
import numpy as np

# Sinkron dengan braille-web/src/utils/blur.js (lebar 320 px, ambang 60).
BLUR_MIN = float(os.getenv("BLUR_MIN", "30"))
_UKURAN_CEK = 320


def laplacian_variance(img_bgr):
    """Ukur ketajaman gambar pada lebar 320 px. Makin kecil nilainya, makin buram."""
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


def assess_quality(img_bgr, batas_buram=None):
    """Evaluasi ketajaman, silau (glare), dan kecerahan rata-rata sebelum inferensi."""
    batas = BLUR_MIN if batas_buram is None else batas_buram
    abu = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = abu.shape
    tinggi = max(3, round(h / w * _UKURAN_CEK))
    kecil = cv2.resize(abu, (_UKURAN_CEK, tinggi), interpolation=cv2.INTER_AREA)

    lap = cv2.Laplacian(kecil, cv2.CV_64F, ksize=1)
    ketajaman = round(float(lap[1:-1, 1:-1].var()))
    buram = ketajaman < batas

    kecerahan = float(kecil.mean())
    kontras = float(kecil.std())
    rasio_silau = round(float((kecil >= 248).sum()) / float(kecil.size), 3)

    petunjuk = []
    if buram:
        petunjuk.append("Gambar kurang tajam. Tahan kamera atau jauhkan sedikit dari kertas.")
    if kecerahan < 55:
        petunjuk.append("Cahaya terlalu gelap. Gunakan cahaya miring dari samping kertas.")
    elif kecerahan > 235 or rasio_silau > 0.08:
        petunjuk.append("Terdeteksi silau di kertas. Miringkan sudut lampu atau matikan flash langsung.")
    elif kontras < 14:
        petunjuk.append("Bayangan titik kurang tegas. Arahkan sumber cahaya dari samping (raking light).")

    if not petunjuk:
        petunjuk.append("Kualitas citra baik untuk dipindai.")

    skor_tajam = min(1.0, ketajaman / max(1.0, batas * 2.0))
    skor_silau = max(0.0, 1.0 - (rasio_silau * 4.0))
    skor_cerah = 1.0 if 60 <= kecerahan <= 220 else 0.55
    skor_total = round(0.55 * skor_tajam + 0.25 * skor_silau + 0.20 * skor_cerah, 3)

    return {
        "score": skor_total,
        "sharpness": ketajaman,
        "is_blurry": buram,
        "brightness": round(kecerahan, 1),
        "contrast": round(kontras, 1),
        "glare": rasio_silau,
        "hints": petunjuk,
    }


def apply_clahe(img_bgr, clip_limit=2.0, tile=8):
    """CLAHE pada kanal kecerahan (L) ruang warna LAB."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    l2 = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l2, a, b)), cv2.COLOR_LAB2BGR)
