"""Periksa model: nama kelas dan pengaturan augmentasi saat training.

Jalankan:  python inspect_model.py [best.pt]
"""
import sys

from ultralytics import YOLO

import braille_logic as bl

path = sys.argv[1] if len(sys.argv) > 1 else "best.pt"
m = YOLO(path)
nama = {int(k): v for k, v in m.names.items()}
print(f"{len(nama)} kelas:")
print(", ".join(f"{k}={v}" for k, v in nama.items()))

label = {v.strip().lower() for v in nama.values()}
print("\n--- Pemeriksaan label khusus ---")
print("Tanda angka :", "ADA" if label & bl.NUMBER_LABELS else "TIDAK ADA di model -> angka tidak akan terbaca")
print("Tanda kapital:", "ADA" if label & bl.CAPITAL_LABELS else "tidak ada (huruf besar tidak dibedakan)")
print("Spasi       :", "ada kelas spasi" if label & bl.SPACE_LABELS else "tidak ada (spasi dihitung dari jarak sel)")
huruf_besar = [v for v in nama.values() if len(v) == 1 and v.isupper()]
huruf_kecil = [v for v in nama.values() if len(v) == 1 and v.islower()]
if huruf_besar and huruf_kecil:
    print(f"Kelas huruf besar ({len(huruf_besar)}) dan kecil ({len(huruf_kecil)}) sama-sama ada. "
          f"Pastikan artinya (MERGE_CASE di braille_logic.py = {bl.MERGE_CASE}).")

args = getattr(m, "ckpt", {}).get("train_args", {}) if hasattr(m, "ckpt") else {}
if args:
    print("\n--- Pengaturan training ---")
    for k in ("model", "epochs", "imgsz", "batch", "fliplr", "flipud", "degrees", "scale", "hsv_v"):
        print(f"{k:8}: {args.get(k)}")
    if args.get("fliplr", 0) > 0 or args.get("flipud", 0) > 0:
        print("\n!! PERINGATAN: augmentasi flip aktif. Pada Braille, gambar yang dicerminkan "
              "mengubah huruf (d<->f, e<->i, h<->j, r<->w). Latih ulang dengan fliplr=0, flipud=0 "
              "(lihat train_braille.py).")
