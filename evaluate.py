"""Ukur akurasi pembacaan pada foto uji, dengan CER (Character Error Rate).

Siapkan folder `uji/` berisi foto (.jpg/.png) dan, untuk tiap foto, file .txt
bernama sama berisi teks yang BENAR (mis. uji/foto1.jpg + uji/foto1.txt).
Foto uji TIDAK BOLEH ikut dipakai saat training.

Contoh:
  python evaluate.py                       # imgsz bawaan, tanpa & dengan CLAHE
  python evaluate.py --imgsz 640 960       # bandingkan ukuran input
  python evaluate.py --folder uji --conf 0.2

Keluaran: tabel di layar + hasil_evaluasi.csv. CER lebih kecil = lebih baik.
Kolom 'raw' = sebelum koreksi KBBI, 'final' = sesudah. Jika CER final lebih
BURUK daripada raw, koreksi kata sedang merusak hasil.
"""
import argparse
import csv
import os

import cv2

from main import IMGSZ, jalankan
from preprocess import is_blurry


def jarak_edit(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def norm(t: str) -> str:
    return " ".join(t.lower().split())


def cer(hasil: str, kunci: str) -> float:
    k = norm(kunci)
    return jarak_edit(norm(hasil), k) / max(1, len(k))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", default="uji")
    ap.add_argument("--imgsz", type=int, nargs="+", default=[IMGSZ])
    ap.add_argument("--conf", type=float, default=None)
    ap.add_argument("--out", default="hasil_evaluasi.csv")
    a = ap.parse_args()

    foto = [n for n in sorted(os.listdir(a.folder)) if n.lower().endswith((".jpg", ".jpeg", ".png"))]
    if not foto:
        raise SystemExit(f"Tidak ada foto di folder '{a.folder}'.")

    baris = []
    for imgsz in a.imgsz:
        for clahe in (False, True):
            for nama in foto:
                img = cv2.imread(os.path.join(a.folder, nama))
                if img is None:
                    continue
                kf = os.path.join(a.folder, os.path.splitext(nama)[0] + ".txt")
                kunci = open(kf, encoding="utf-8").read() if os.path.exists(kf) else None
                h = jalankan(img, clahe=clahe, imgsz=imgsz, conf=a.conf)
                buram, tajam = is_blurry(img)
                baris.append({
                    "foto": nama, "imgsz": imgsz, "clahe": clahe, "ketajaman": tajam, "buram": buram,
                    "sel": h["n_cells"], "conf_rata": h["mean_conf"],
                    "teks_raw": h["raw_text"].replace("\n", " / "),
                    "teks_final": h["final_text"].replace("\n", " / "),
                    "cer_raw": round(cer(h["raw_text"], kunci), 3) if kunci is not None else "",
                    "cer_final": round(cer(h["final_text"], kunci), 3) if kunci is not None else "",
                })

    with open(a.out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(baris[0].keys()))
        w.writeheader()
        w.writerows(baris)

    print(f"\n{'imgsz':>6} {'clahe':>6} {'foto':>5} {'CER raw':>9} {'CER final':>10}")
    for imgsz in a.imgsz:
        for clahe in (False, True):
            sub = [b for b in baris if b["imgsz"] == imgsz and b["clahe"] == clahe and b["cer_raw"] != ""]
            if sub:
                r = sum(b["cer_raw"] for b in sub) / len(sub)
                fn = sum(b["cer_final"] for b in sub) / len(sub)
                print(f"{imgsz:>6} {str(clahe):>6} {len(sub):>5} {r:>9.3f} {fn:>10.3f}")
    print(f"\nTersimpan: {a.out}")


if __name__ == "__main__":
    main()
