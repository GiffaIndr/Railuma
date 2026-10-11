import cv2
import difflib
from ultralytics import YOLO

# =========================================================
# 1. MUAT DATASET KAMUS (KBBI) UNTUK AUTO-CORRECTION
# =========================================================
def muat_kamus_kbbi(file_path='kata_kbbi.txt'):
    """
    Membaca dataset kata dari file .txt dan menyimpannya ke dalam Set
    agar pencarian kata berjalan sangat cepat (O(1)).
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Hilangkan spasi/enter dan ubah ke huruf kecil
            kata_set = set(line.strip().lower() for line in f if line.strip())
        print(f"[SUCCESS] Kamus berhasil dimuat: {len(kata_set)} kata terdaftar.")
        return kata_set
    except FileNotFoundError:
        print(f"[WARNING] File '{file_path}' tidak ditemukan!")
        print("[INFO] Menggunakan kamus cadangan sementara...")
        return {"buku", "saya", "kamu", "belajar", "membaca", "menulis", 
                "braille", "kamera", "sekolah", "makan", "minum", "duduk",
                "pagi", "siang", "malam", "indonesia", "tugas", "proyek"}

# Muat kamus saat program dijalankan
KAMUS_KBBI = muat_kamus_kbbi('kata_kbbi.txt')

# =========================================================
# 2. LOGIKA PENGURUTAN HAKIKAT BRAILLE & TANDA ANGKA
# =========================================================
def process_braille_detections(boxes, model_names):
    """
    Mengurutkan bounding box YOLO dari atas-ke-bawah (baris) dan
    kiri-ke-kanan (kolom), mendeteksi spasi, serta menerapkan
    logika Tanda Angka (number sign).
    """
    if len(boxes) == 0:
        return ""

    detections = []
    total_height = 0
    total_width = 0

    # Ekstrak koordinat dan kelas dari YOLO
    for box in boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cls_id = int(box.cls[0])
        label = model_names[cls_id].lower()

        detections.append({'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2, 'label': label})
        total_height += (y2 - y1)
        total_width += (x2 - x1)

    # Hitung rata-rata dimensi karakter untuk batas toleransi dinamis
    avg_h = total_height / len(detections)
    avg_w = total_width / len(detections)

    # 1. Urutkan posisi vertikal (sumbu Y)
    detections.sort(key=lambda d: d['y1'])

    # 2. Kelompokkan menjadi baris-baris
    rows = []
    current_row = []
    y_threshold = avg_h * 0.5  # Toleransi kemiringan baris

    for d in detections:
        if not current_row:
            current_row.append(d)
        else:
            avg_y = sum(item['y1'] for item in current_row) / len(current_row)
            if abs(d['y1'] - avg_y) < y_threshold:
                current_row.append(d)
            else:
                rows.append(current_row)
                current_row = [d]
    if current_row:
        rows.append(current_row)

    # Pemetaan huruf 'a'-'j' menjadi '1'-'0' saat Tanda Angka aktif
    number_map = {
        'a': '1', 'b': '2', 'c': '3', 'd': '4', 'e': '5',
        'f': '6', 'g': '7', 'h': '8', 'i': '9', 'j': '0'
    }

    final_sentences = []
    space_threshold = avg_w * 1.0  # Toleransi jarak antar kata (spasi)

    # 3. Urutkan posisi horizontal (sumbu X) per baris & terjemahkan
    for row in rows:
        row.sort(key=lambda d: d['x1'])

        row_text = ""
        mode_angka = False  # State Machine Tanda Angka

        for i in range(len(row)):
            char = row[i]['label']

            # Deteksi Spasi berdasarkan jarak koordinat X dengan huruf sebelumnya
            if i > 0:
                prev_x2 = row[i - 1]['x2']
                curr_x1 = row[i]['x1']
                if (curr_x1 - prev_x2) > space_threshold:
                    row_text += " "
                    mode_angka = False  # Spasi mereset Tanda Angka kembali ke huruf

            # Deteksi Tanda Angka (sesuaikan label 'number_sign' / '#' dengan dataset Anda)
            if char in ['number_sign', '#', 'tanda_angka']:
                mode_angka = True
                continue  # Tanda Angka tidak dicetak sebagai karakter teks

            # Konversi Angka vs Huruf
            if mode_angka and char in number_map:
                row_text += number_map[char]
            else:
                row_text += char

        final_sentences.append(row_text)

    return "\n".join(final_sentences)

# =========================================================
# 3. KOREKSI OTOMATIS (AUTO-CORRECTION) TEROPTIMASI
# =========================================================
def koreksi_kalimat_optimasi(kalimat_braille, kamus_set):
    """
    Mengoreksi kalimat hasil deteksi YOLO dengan teknik filtering cepat.
    """
    if not kalimat_braille:
        return ""

    baris_kalimat = kalimat_braille.split('\n')
    hasil_koreksi_baris = []

    for baris in baris_kalimat:
        kata_kata = baris.split()
        kata_terkoreksi = []

        for kata in kata_kata:
            kata_clean = kata.lower()

            # 1. Abaikan jika kata berupa angka murni (misal: "123")
            if kata_clean.isdigit():
                kata_terkoreksi.append(kata)
                continue

            # 2. Cek apakah kata SUDAH BENAR ada di kamus
            if kata_clean in kamus_set:
                kata_terkoreksi.append(kata) 
                continue

            # 3. Jika kata kemungkinan TYPO, filter kandidat berdasarkan panjang kata
            len_kata = len(kata_clean)
            # Ambil hanya kata di kamus yang selisih panjangnya max 1 huruf (mempercepat proses)
            kandidat_kamus = [w for w in kamus_set if abs(len(w) - len_kata) <= 1]

            # 4. Cari kemiripan hanya pada daftar kandidat yang sudah difilter
            koreksi = difflib.get_close_matches(kata_clean, kandidat_kamus, n=1, cutoff=0.70)

            if len(koreksi) > 0:
                kata_terkoreksi.append(koreksi[0])
            else:
                kata_terkoreksi.append(kata) # Jika tidak ketemu yg mirip, pertahankan kata asli

        hasil_koreksi_baris.append(" ".join(kata_terkoreksi))

    return "\n".join(hasil_koreksi_baris)

# =========================================================
# 4. MAIN PROGRAM (EKSEKUSI)
# =========================================================
if __name__ == "__main__":
    MODEL_PATH = 'best.pt'
    IMAGE_PATH = 'test_image.png'

    print("\n[INFO] Memuat model YOLOv8...")
    model = YOLO(MODEL_PATH)

    print(f"[INFO] Memproses gambar: {IMAGE_PATH}")
    # Parameter conf=0.35 (Mengambil deteksi dengan tingkat kepercayaan di atas 35%)
    results = model.predict(source=IMAGE_PATH, conf=0.35)

    for r in results:
        # Buat salinan gambar dengan bounding box untuk ditampilkan
        annotated_img = r.plot()

        # 1. Pengurutan Koordinat & Konversi Angka
        teks_mentah = process_braille_detections(r.boxes, model.names)

        # 2. Auto-Correction Ejaan (Memakai Kamus KBBI)
        teks_final = koreksi_kalimat_optimasi(teks_mentah, KAMUS_KBBI)

        # Cetak Hasil ke Console/Terminal
        print("\n==========================================")
        print("1. TEKS MENTAH (Urutan YOLO + Tanda Angka):")
        print(teks_mentah if teks_mentah else "[Tidak ada Braille terdeteksi]")
        print("------------------------------------------")
        print("2. TEKS FINAL (Setelah Auto-Correction KBBI):")
        print(teks_final if teks_final else "[Tidak ada Braille terdeteksi]")
        print("==========================================\n")

        # Tampilkan Jendela Gambar OpenCV
        print("[INFO] Menampilkan gambar. Tekan tombol apapun pada keyboard untuk menutup jendela.")
        cv2.imshow("Hasil Deteksi OBR", annotated_img)

    cv2.waitKey(0)
    cv2.destroyAllWindows()