"""Tes logika pasca-pemrosesan TANPA model/kamera.

Membuat deteksi palsu (kotak ketat di sekitar titik, seperti hasil YOLO),
lalu memeriksa apakah teks yang dibaca sudah benar.
Jalankan:  python test_postprocess.py
"""
import math
import os
import random
import time

from braille_logic import Det, baca_deteksi
from koreksi import Kamus, koreksi_hasil, koreksi_kata
from braille_logic import Kata

TITIK = {
    "a": "1", "b": "12", "c": "14", "d": "145", "e": "15", "f": "124", "g": "1245",
    "h": "125", "i": "24", "j": "245", "k": "13", "l": "123", "m": "134", "n": "1345",
    "o": "135", "p": "1234", "q": "12345", "r": "1235", "s": "234", "t": "2345",
    "u": "136", "v": "1236", "w": "2456", "x": "1346", "y": "13456", "z": "1356",
    "#": "3456",
}
PITCH, BARIS = 60.0, 160.0


def kotak_ketat(label, x0, y0, rnd):
    """Kotak yang membungkus titik saja (bukan seluruh sel)."""
    dots = TITIK[label]
    xs = [x0 - 10 if int(d) <= 3 else x0 + 10 for d in dots]
    ys = [y0 + (int(d) - 1) % 3 * 25 - 25 for d in dots]
    j = lambda: rnd.uniform(-1.5, 1.5)
    return (min(xs) - 7 + j(), min(ys) - 7 + j(), max(xs) + 7 + j(), max(ys) + 7 + j())


def buat(baris_teks, sudut=0.0, duplikat=False, seed=1):
    rnd = random.Random(seed)
    dets = []
    for r, teks in enumerate(baris_teks):
        for c, ch in enumerate(teks):
            if ch == " ":
                continue
            label = "number_sign" if ch == "#" else ch
            x1, y1, x2, y2 = kotak_ketat("#" if ch == "#" else ch, 100 + c * PITCH, 100 + r * BARIS, rnd)
            dets.append(Det(x1, y1, x2, y2, label, rnd.uniform(0.5, 0.95)))
            if duplikat and rnd.random() < 0.3:
                dets.append(Det(x1 + 3, y1 + 2, x2 + 3, y2 + 2, label, 0.3))
    # putar seluruh titik pusat sebesar `sudut` terhadap titik (400, 300)
    a = math.radians(sudut)
    hasil = []
    for d in dets:
        cx, cy = d.cx - 400, d.cy - 300
        nx = cx * math.cos(a) - cy * math.sin(a) + 400
        ny = cx * math.sin(a) + cy * math.cos(a) + 300
        hw, hh = d.w / 2, d.h / 2
        hasil.append(Det(nx - hw, ny - hh, nx + hw, ny + hh, d.label, d.conf))
    return hasil


gagal = 0


def cek(nama, hasil, harap):
    global gagal
    ok = hasil == harap
    gagal += 0 if ok else 1
    print(("OK   " if ok else "GAGAL"), nama, "->", repr(hasil), "" if ok else f"(harap {harap!r})")


# --- Tes baca ---
cek("satu baris", baca_deteksi(buat(["saya makan nasi"])).teks(), "saya makan nasi")
cek("dua baris", baca_deteksi(buat(["buku baru", "kamu belajar"])).teks(), "buku baru\nkamu belajar")
for sdt in (-6, -3, 3, 6):
    cek(f"miring {sdt} derajat", baca_deteksi(buat(["saya makan nasi", "kamu belajar"], sudut=sdt)).teks(),
        "saya makan nasi\nkamu belajar")
PANJANG = ["saya makan nasi di rumah", "kamu belajar buku baru ya"]
SEBAR = "\n".join(PANJANG)
cek("baris panjang miring 10 derajat (deskew)", baca_deteksi(buat(PANJANG, sudut=10)).teks(), SEBAR)
cek("tanpa deskew salah pada kasus yang sama (bukti deskew bermanfaat)",
    baca_deteksi(buat(PANJANG, sudut=10), deskew=False).teks() != SEBAR, True)
cek("kotak ganda", baca_deteksi(buat(["saya makan nasi"], duplikat=True)).teks(), "saya makan nasi")
cek("tanda angka", baca_deteksi(buat(["#abj ab"])).teks(), "120 ab")
cek("angka berhenti di huruf non-angka", baca_deteksi(buat(["#ak"])).teks(), "1k")

# --- Tes koreksi ---
kamus = Kamus(os.path.join(os.path.dirname(os.path.abspath(__file__)), "kata_kbbi.txt"))
print(f"kamus: {len(kamus)} kata")


def kata(teks, konf):
    return Kata([(c, konf) for c in teks])


def uji(nama, teks, konf, harap_final, harap_ragu=False):
    global gagal
    t0 = time.perf_counter()
    info = koreksi_kata(kata(teks, konf), kamus)
    ms = (time.perf_counter() - t0) * 1000
    ok = info["final"] == harap_final and info["ragu"] == harap_ragu
    gagal += 0 if ok else 1
    print(("OK   " if ok else "GAGAL"), f"koreksi {nama}: {teks} -> {info['final']} (ragu={info['ragu']}) {ms:.0f} ms")


uji("huruf mirip titik (l->k)", "selolah", 0.5, "sekolah")
uji("kata benar tidak diubah", "braille", 0.5, "braille")
uji("nama yakin dibiarkan", "giffa", 0.95, "giffa")
uji("kata pendek dibiarkan", "xy", 0.3, "xy")
uji("angka dibiarkan", "120", 0.3, "120")
uji("kata tak dikenal tanpa kandidat", "qzxwvk", 0.4, "qzxwvk")

# kecepatan: kata panjang yang tidak ada di kamus
t0 = time.perf_counter()
koreksi_kata(kata("pembelajaranxq", 0.5), kamus)
print(f"waktu kata 14 huruf: {(time.perf_counter() - t0) * 1000:.0f} ms")

# end-to-end: baca + koreksi
hasil = baca_deteksi(buat(["saya makan nasi"]))
teks, _ = koreksi_hasil(hasil, kamus)
cek("end-to-end baca+koreksi", teks, "saya makan nasi")

print("\nSEMUA TES LULUS" if gagal == 0 else f"\n{gagal} TES GAGAL")
raise SystemExit(1 if gagal else 0)
