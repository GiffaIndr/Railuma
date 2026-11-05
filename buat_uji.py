"""Buat folder 'uji' otomatis dari beberapa foto Braille yang bagus.

Cara pakai:
  1. Buat folder  foto_asli  di samping file ini.
  2. Isi dengan 3 sampai 5 foto Braille yang jelas dan terang (.jpg/.png).
     Untuk tiap foto, buat file teks dengan nama sama berisi teks yang benar
     (contoh: foto1.jpg dan foto1.txt, isi: "saya makan").
  3. Jalankan:  python buat_uji.py
  4. Lalu jalankan:  python compare_clahe.py

Tiap foto dibuat menjadi 5 versi: asli, redup, bayangan separuh, cahaya miring,
dan redup + bayangan. Kondisi cahaya ini SIMULASI. Tulis hal itu di jurnal,
dan kalau bisa tambahkan juga foto asli yang memang difoto di tempat redup.
"""
import os
import shutil
import cv2
import numpy as np

SUMBER = "foto_asli"
TUJUAN = "uji"
EKSTENSI = (".jpg", ".jpeg", ".png")


def kali(img, peta):
    """Kalikan kecerahan gambar dengan peta (0..1 gelap, 1 asli)."""
    hasil = img.astype(np.float32) * peta[..., None]
    return np.clip(hasil, 0, 255).astype(np.uint8)


def peta_gradien(h, w, kiri, kanan):
    return np.tile(np.linspace(kiri, kanan, w, dtype=np.float32), (h, 1))


def peta_bayangan(h, w):
    """Separuh gambar gelap dengan tepi lembut, seperti bayangan tangan."""
    p = np.ones((h, w), np.float32)
    p[:, w // 2:] = 0.35
    return cv2.GaussianBlur(p, (0, 0), w / 25)


def variasi(img):
    h, w = img.shape[:2]
    redup = kali(img, np.full((h, w), 0.45, np.float32))
    return {
        "asli": img,
        "redup": redup,
        "bayangan": kali(img, peta_bayangan(h, w)),
        "miring": kali(img, peta_gradien(h, w, 1.0, 0.3)),
        "redup_bayangan": kali(redup, peta_bayangan(h, w)),
    }


if not os.path.isdir(SUMBER):
    raise SystemExit(f"Folder '{SUMBER}' belum ada. Buat dulu, lalu isi dengan foto Braille.")

os.makedirs(TUJUAN, exist_ok=True)
jumlah = 0
for nama in sorted(os.listdir(SUMBER)):
    if not nama.lower().endswith(EKSTENSI):
        continue
    img = cv2.imread(os.path.join(SUMBER, nama))
    if img is None:
        continue
    dasar = os.path.splitext(nama)[0]
    kunci = os.path.join(SUMBER, dasar + ".txt")
    for label, gambar in variasi(img).items():
        cv2.imwrite(os.path.join(TUJUAN, f"{dasar}_{label}.jpg"), gambar)
        if os.path.exists(kunci):
            shutil.copy(kunci, os.path.join(TUJUAN, f"{dasar}_{label}.txt"))
        jumlah += 1

print(f"Selesai: {jumlah} foto dibuat di folder '{TUJUAN}'.")
