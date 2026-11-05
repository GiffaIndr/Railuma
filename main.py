"""API terjemahan Braille (FastAPI + YOLOv8).

Jalankan:  uvicorn main:app --host 0.0.0.0 --port 8000
Variabel lingkungan (semua opsional):
  MODEL_PATH       lokasi bobot YOLO            (default: best.pt di folder ini)
  IMGSZ            ukuran input inferensi       (default: 640; samakan dengan imgsz training)
  CONF / IOU       ambang deteksi               (default: 0.25 / 0.45)
  BLUR_MIN         ambang ketajaman             (default: 60)
  ALLOWED_ORIGINS  daftar origin dipisah koma   (default: *)
"""
import os

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

from braille_logic import baca_boxes, process_braille_detections  # noqa: F401 (kompatibilitas)
from koreksi import Kamus, koreksi_hasil
from preprocess import apply_clahe, is_blurry

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(BASE, "best.pt"))
IMGSZ = int(os.getenv("IMGSZ", "640"))
CONF = float(os.getenv("CONF", "0.25"))
IOU = float(os.getenv("IOU", "0.45"))
ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title="Braille Translator API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,  # "*" bersama credentials=True tidak valid di browser
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[INFO] Memuat model YOLO dan kamus KBBI...")
model = YOLO(MODEL_PATH)
KAMUS = Kamus(os.path.join(BASE, "kata_kbbi.txt"))
print(f"[INFO] Kamus: {len(KAMUS)} kata. Kelas model: {len(model.names)}")


def jalankan(img, clahe=False, imgsz=None, conf=None, deskew=True):
    """Pipeline lengkap pada satu gambar BGR. Dipakai endpoint dan evaluate.py."""
    img_model = apply_clahe(img) if clahe else img
    r = model.predict(
        source=img_model,
        conf=CONF if conf is None else conf,
        iou=IOU,
        imgsz=imgsz or IMGSZ,
        agnostic_nms=True,   # satu sel tidak boleh jadi dua huruf
        max_det=500,
        verbose=False,
    )[0]
    hasil = baca_boxes(r.boxes, model.names, deskew=deskew)
    teks_final, kata_info = koreksi_hasil(hasil, KAMUS)
    boxes = []
    for b in r.boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        boxes.append({"label": model.names[int(b.cls[0])], "conf": round(float(b.conf[0]), 3),
                      "x1": x1, "y1": y1, "x2": x2, "y2": y2})
    return {
        "raw_text": hasil.teks(),
        "final_text": teks_final,
        "words": kata_info,
        "boxes": boxes,
        "n_cells": hasil.n_sel,
        "mean_conf": round(hasil.konf_rata, 3),
        "skew_deg": round(hasil.sudut, 1),
    }


@app.get("/health")
def health():
    return {"status": "ok", "kelas": len(model.names), "imgsz": IMGSZ, "conf": CONF}


@app.get("/labels")
def labels():
    """Daftar kelas model, untuk mencocokkan label tanda angka/kapital."""
    return {"labels": {int(k): v for k, v in model.names.items()}}


# `def` biasa (bukan async): inferensi YOLO memblokir, jadi biarkan FastAPI
# menjalankannya di thread pool dan event loop tetap bebas melayani permintaan lain.
@app.post("/translate/")
def translate_braille(
    file: UploadFile = File(...),
    clahe: bool = False,       # ?clahe=true -> ratakan pencahayaan sebelum YOLO
    check_blur: bool = True,   # ?check_blur=false -> lewati pengecekan buram
):
    try:
        data = np.frombuffer(file.file.read(), np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if img is None:
            return {"status": "error", "message": "File bukan gambar yang valid"}

        buram, ketajaman = is_blurry(img)
        if check_blur and buram:
            return {"status": "blurry", "sharpness": ketajaman,
                    "message": "Gambar buram atau terlalu dekat"}

        hasil = jalankan(img, clahe=clahe)
        hasil.update({"status": "success", "image_width": img.shape[1],
                      "image_height": img.shape[0], "sharpness": ketajaman, "clahe": clahe})
        return hasil
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
