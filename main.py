import cv2
import numpy as np
import difflib
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="Braille Translator API")

# =========================================================
# PENGATURAN CORS (Agar web frontend bisa akses API ini)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Mengizinkan semua domain website mengakses API ini
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# INISIALISASI MODEL & KAMUS (Dijalankan saat server nyala)
# =========================================================
print("[INFO] Memuat Model YOLO dan Kamus KBBI...")
model = YOLO('best.pt')

def muat_kamus_kbbi(file_path='kata_kbbi.txt'):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return set(line.strip().lower() for line in f if line.strip())
    except FileNotFoundError:
        return {"buku", "saya", "kamu", "belajar", "membaca"}

KAMUS_KBBI = muat_kamus_kbbi('kata_kbbi.txt')

# =========================================================
# FUNGSI LOGIKA BRAILLE (Dari kode kita sebelumnya)
# =========================================================
def process_braille_detections(boxes, model_names):
    if len(boxes) == 0: return ""
    detections = []
    total_height, total_width = 0, 0

    for box in boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cls_id = int(box.cls[0])
        label = model_names[cls_id].lower()
        detections.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'label': label})
        total_height += (y2 - y1)
        total_width += (x2 - x1)

    avg_h = total_height / len(detections)
    avg_w = total_width / len(detections)

    detections.sort(key=lambda d: d['y1'])
    rows, current_row = [], []
    y_threshold = avg_h * 0.5

    for d in detections:
        if not current_row: current_row.append(d)
        else:
            avg_y = sum(item['y1'] for item in current_row) / len(current_row)
            if abs(d['y1'] - avg_y) < y_threshold: current_row.append(d)
            else:
                rows.append(current_row)
                current_row = [d]
    if current_row: rows.append(current_row)

    number_map = {'a': '1', 'b': '2', 'c': '3', 'd': '4', 'e': '5', 'f': '6', 'g': '7', 'h': '8', 'i': '9', 'j': '0'}
    final_sentences = []
    space_threshold = avg_w * 1.0

    for row in rows:
        row.sort(key=lambda d: d['x1'])
        row_text, mode_angka = "", False
        for i in range(len(row)):
            char = row[i]['label']
            if i > 0 and (row[i]['x1'] - row[i-1]['x2']) > space_threshold:
                row_text += " "
                mode_angka = False
            
            if char in ['number_sign', '#', 'tanda_angka']:
                mode_angka = True
                continue
                
            if mode_angka and char in number_map: row_text += number_map[char]
            else: row_text += char
        final_sentences.append(row_text)
    return "\n".join(final_sentences)


def koreksi_kalimat_optimasi(kalimat_braille, kamus_set):
    if not kalimat_braille: return ""
    hasil_koreksi_baris = []
    for baris in kalimat_braille.split('\n'):
        kata_terkoreksi = []
        for kata in baris.split():
            kata_clean = kata.lower()
            if kata_clean.isdigit() or kata_clean in kamus_set:
                kata_terkoreksi.append(kata)
                continue
            
            kandidat_kamus = [w for w in kamus_set if abs(len(w) - len(kata_clean)) <= 1]
            koreksi = difflib.get_close_matches(kata_clean, kandidat_kamus, n=1, cutoff=0.70)
            kata_terkoreksi.append(koreksi[0] if koreksi else kata)
        hasil_koreksi_baris.append(" ".join(kata_terkoreksi))
    return "\n".join(hasil_koreksi_baris)

# =========================================================
# ENDPOINT API (Pintu Masuk Gambar dari Web)
# =========================================================
# Ubah fungsi return di endpoint @app.post("/translate/")
@app.post("/translate/")
async def translate_braille(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        results = model.predict(source=img, conf=0.35)
        r = results[0]

        teks_mentah = process_braille_detections(r.boxes, model.names)
        teks_final = koreksi_kalimat_optimasi(teks_mentah, KAMUS_KBBI)

        # BUAT LIST KOORDINAT KOTAK UNTUK DIKIRIM KE REACT
        boxes_data = []
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cls_id = int(box.cls[0])
            label = model.names[cls_id]
            boxes_data.append({
                "label": label,
                "x1": x1, "y1": y1, "x2": x2, "y2": y2
            })

        # Kirim balasan dengan tambahan "boxes"
        return {
            "status": "success",
            "raw_text": teks_mentah,
            "final_text": teks_final,
            "boxes": boxes_data,
            "image_width": img.shape[1],
            "image_height": img.shape[0]
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}