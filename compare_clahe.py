"""Bandingkan hasil YOLO TANPA dan DENGAN CLAHE pada foto uji.

Cara pakai:
  1. Buat folder  uji  di samping file ini, isi dengan foto Braille (.jpg/.png).
  2. (Disarankan) Untuk tiap foto, buat file teks dengan nama sama yang berisi teks
     yang benar. Contoh: uji/foto1.jpg  dan  uji/foto1.txt  (isi: "saya makan").
  3. Jalankan:  python compare_clahe.py
Hasil: tabel di layar dan file hasil_clahe.csv (bisa dibuka di Excel).
"""
import csv
import difflib
import os
import cv2

from main import model, process_braille_detections  # memuat best.pt
from preprocess import apply_clahe, is_blurry

FOLDER = "uji"
EKSTENSI = (".jpg", ".jpeg", ".png")


def baca(img):
    r = model.predict(source=img, conf=0.35, verbose=False)[0]
    return process_braille_detections(r.boxes, model.names), len(r.boxes)


def norm(t):
    return " ".join(t.lower().split())


def mirip(a, b):
    return round(difflib.SequenceMatcher(None, norm(a), norm(b)).ratio() * 100, 1)


baris = []
for nama in sorted(os.listdir(FOLDER)):
    if not nama.lower().endswith(EKSTENSI):
        continue
    img = cv2.imread(os.path.join(FOLDER, nama))
    if img is None:
        continue
    buram, tajam = is_blurry(img)
    teks0, n0 = baca(img)
    teks1, n1 = baca(apply_clahe(img))

    kunci_file = os.path.join(FOLDER, os.path.splitext(nama)[0] + ".txt")
    kunci = open(kunci_file, encoding="utf-8").read() if os.path.exists(kunci_file) else None

    baris.append({
        "foto": nama, "ketajaman": tajam, "buram": buram,
        "kotak_tanpa": n0, "kotak_clahe": n1,
        "teks_tanpa": teks0.replace("\n", " / "), "teks_clahe": teks1.replace("\n", " / "),
        "akurasi_tanpa": mirip(teks0, kunci) if kunci is not None else "",
        "akurasi_clahe": mirip(teks1, kunci) if kunci is not None else "",
    })
    print(baris[-1])

if not baris:
    raise SystemExit(f"Tidak ada foto di folder '{FOLDER}'.")

with open("hasil_clahe.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(baris[0].keys()))
    w.writeheader()
    w.writerows(baris)

nilai = [b for b in baris if b["akurasi_tanpa"] != ""]
if nilai:
    rata0 = sum(b["akurasi_tanpa"] for b in nilai) / len(nilai)
    rata1 = sum(b["akurasi_clahe"] for b in nilai) / len(nilai)
    print(f"\nRata-rata kemiripan teks ({len(nilai)} foto): tanpa CLAHE {rata0:.1f}% | dengan CLAHE {rata1:.1f}%")
else:
    print("\nBelum ada file kunci (.txt), jadi hanya jumlah kotak dan teks yang dibandingkan.")
print("Tersimpan: hasil_clahe.csv")
