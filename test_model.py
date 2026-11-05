"""Uji cepat satu gambar dari terminal.  python test_model.py [gambar.png]"""
import sys

import cv2

from main import KAMUS, model, jalankan  # noqa: F401

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "test_image.png"
    img = cv2.imread(path)
    if img is None:
        raise SystemExit(f"Gambar tidak ditemukan: {path}")
    hasil = jalankan(img)
    print("\n=== TEKS MENTAH ===")
    print(hasil["raw_text"] or "[Tidak ada Braille terdeteksi]")
    print("\n=== TEKS FINAL (setelah koreksi KBBI) ===")
    print(hasil["final_text"] or "[Tidak ada Braille terdeteksi]")
    print(f"\nsel={hasil['n_cells']}  conf_rata={hasil['mean_conf']}  kemiringan={hasil['skew_deg']} derajat")
    diubah = [(w["raw"], w["final"]) for b in hasil["words"] for w in b if w["diubah"]]
    ragu = [w["raw"] for b in hasil["words"] for w in b if w["ragu"]]
    print("kata dikoreksi:", diubah or "-")
    print("kata ragu (tidak diubah):", ragu or "-")
