"""Tahap pra-pemrosesan dan gerbang kualitas citra sebelum gambar masuk ke YOLO."""
import os

import cv2
import numpy as np

# Sinkron dengan braille-web/src/utils/blur.js (lebar 320 px, ambang 60).
BLUR_MIN = float(os.getenv("BLUR_MIN", "30"))
_UKURAN_CEK = 320


def laplacian_variance(img_bgr):
    """Ukur ketajaman gambar pada lebar 320 px (kombinasi global & patch lokal tertajam).

    Pada kertas Braille yang sebagian besar permukaannya polos (mis. hanya 1 kata di sudut kertas),
    varians global terlarut oleh 95% area kertas kosong. Mengambil rata-rata 3 patch lokal tertajam
    (grid 8x8) memastikan ketajaman diukur pada area titik Braille yang sebenarnya.
    """
    abu = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = abu.shape
    tinggi = max(3, round(h / w * _UKURAN_CEK))
    kecil = cv2.resize(abu, (_UKURAN_CEK, tinggi), interpolation=cv2.INTER_AREA)
    lap = cv2.Laplacian(kecil, cv2.CV_64F, ksize=1)
    core = lap[1:-1, 1:-1]
    global_var = float(core.var())

    ch, cw = core.shape
    ph, pw = max(4, ch // 8), max(4, cw // 8)
    patch_vars = []
    for y in range(0, ch - ph + 1, ph):
        for x in range(0, cw - pw + 1, pw):
            patch_vars.append(float(core[y : y + ph, x : x + pw].var()))
    if len(patch_vars) >= 3:
        patch_vars.sort(reverse=True)
        top3_mean = float(np.mean(patch_vars[:3]))
        return max(global_var, top3_mean)
    return global_var


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

    ketajaman = round(laplacian_variance(img_bgr))
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


def enhance_braille_lighting(img_bgr):
    """Normalisasi bayangan besar (HP/tangan) + CLAHE + penajaman mikro untuk kondisi cahaya ekstrem."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    # 1. Estimasi amplop iluminasi latar (bayangan besar) dan ratakan
    bg = cv2.GaussianBlur(l, (0, 0), sigmaX=31, sigmaY=31)
    norm_l = cv2.divide(l, bg, scale=192)
    # 2. Pertegas bayangan lokal titik Braille dengan CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
    l2 = clahe.apply(norm_l)
    # 3. Unsharp mask halus agar tepi titik timbul yang pudar lebih kontras
    blur_small = cv2.GaussianBlur(l2, (0, 0), sigmaX=1.15)
    l3 = cv2.addWeighted(l2, 1.35, blur_small, -0.35, 0)
    return cv2.cvtColor(cv2.merge((l3, a, b)), cv2.COLOR_LAB2BGR)
