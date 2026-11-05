"""Mengubah kotak deteksi YOLO (satu kotak = satu sel Braille) menjadi teks.

Perbaikan dibanding versi lama (process_braille_detections):
  * Baris dikelompokkan dengan TITIK TENGAH kotak (bukan y1), jadi kotak yang
    ketat di sekitar titik (huruf 'a' pendek, huruf 'l' tinggi) tidak memecah baris.
  * Kemiringan kertas diperkirakan lalu dikoreksi (deskew) sebelum baris dibentuk.
  * Spasi ditentukan dari JARAK ANTAR-PUSAT SEL relatif terhadap jarak sel normal
    (pitch), bukan dari lebar kotak yang berubah-ubah.
  * Kotak ganda pada sel yang sama dibuang (dengan mempertahankan yang paling yakin).
  * Tanda angka berhenti saat muncul karakter non-angka; tanda kapital didukung.
  * Setiap huruf membawa skor keyakinan (confidence) untuk tahap koreksi kata.

Nama label khusus (tanda angka, kapital, spasi) disesuaikan dengan nama kelas
di model Anda lewat konstanta di bawah. Jalankan `python inspect_model.py`
untuk melihat nama kelas model Anda.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# ----------------------------------------------------------------------------
# KONFIGURASI (sesuaikan dengan nama kelas di model Anda)
# ----------------------------------------------------------------------------
NUMBER_LABELS = {"number_sign", "numbersign", "number", "num", "#", "tanda_angka", "angka"}
CAPITAL_LABELS = {"capital", "capital_sign", "cap", "kapital", "tanda_kapital"}
SPACE_LABELS = {"space", "spasi"}
IGNORE_LABELS: set[str] = set()

# True  : kelas 'A' dan 'a' dianggap sama (perilaku lama, huruf kecil semua)
# False : huruf besar dari model dipertahankan apa adanya
MERGE_CASE = True

NUMBER_MAP = {"a": "1", "b": "2", "c": "3", "d": "4", "e": "5",
              "f": "6", "g": "7", "h": "8", "i": "9", "j": "0"}

RASIO_BARIS = 0.6       # selisih y-tengah > 0.6 x tinggi sel -> baris baru
RASIO_SPASI = 1.5       # jarak pusat > 1.5 x pitch sel -> ada spasi
RASIO_DUPLIKAT = 0.45   # dua pusat lebih dekat dari 0.45 x lebar sel -> duplikat
MAX_SKEW = 12.0         # derajat maksimum yang dicari saat deskew


# ----------------------------------------------------------------------------
# STRUKTUR DATA
# ----------------------------------------------------------------------------
@dataclass
class Det:
    x1: float
    y1: float
    x2: float
    y2: float
    label: str
    conf: float = 1.0

    @property
    def w(self) -> float:
        return self.x2 - self.x1

    @property
    def h(self) -> float:
        return self.y2 - self.y1

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2


@dataclass
class Kata:
    huruf: list = field(default_factory=list)  # [(karakter, confidence), ...]

    @property
    def teks(self) -> str:
        return "".join(ch for ch, _ in self.huruf)

    @property
    def konf(self) -> list:
        return [c for _, c in self.huruf]

    @property
    def konf_min(self) -> float:
        return min(self.konf) if self.huruf else 0.0


@dataclass
class HasilBaca:
    baris: list          # list[list[Kata]]
    sudut: float = 0.0   # kemiringan yang dikoreksi (derajat)
    pitch: float = 0.0   # jarak antar-pusat sel normal (piksel)
    n_sel: int = 0

    def teks(self) -> str:
        return "\n".join(" ".join(k.teks for k in b) for b in self.baris)

    @property
    def konf_rata(self) -> float:
        semua = [c for b in self.baris for k in b for c in k.konf]
        return float(np.mean(semua)) if semua else 0.0


@dataclass
class _Sel:
    det: Det
    x: float  # pusat x setelah deskew
    y: float  # pusat y setelah deskew


# ----------------------------------------------------------------------------
# LANGKAH-LANGKAH
# ----------------------------------------------------------------------------
def dets_dari_boxes(boxes, names) -> list:
    """Ubah ultralytics `r.boxes` menjadi list Det."""
    hasil = []
    for b in boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        hasil.append(Det(x1, y1, x2, y2, str(names[int(b.cls[0])]), float(b.conf[0])))
    return hasil


def hapus_duplikat(dets: list) -> list:
    """Buang kotak ganda pada sel yang sama; simpan yang confidence-nya tertinggi."""
    if len(dets) < 2:
        return list(dets)
    w_ref = float(np.median([d.w for d in dets]))
    batas = RASIO_DUPLIKAT * w_ref
    simpan: list = []
    for d in sorted(dets, key=lambda d: -d.conf):
        if all(math.hypot(d.cx - k.cx, d.cy - k.cy) >= batas for k in simpan):
            simpan.append(d)
    return simpan


def estimasi_kemiringan(dets: list, h_ref: float) -> float:
    """Cari sudut yang membuat titik-tengah sel paling 'menumpuk' per baris
    (projection profile). Mengembalikan derajat; 0 jika tidak meyakinkan."""
    if len(dets) < 6:
        return 0.0
    pts = np.array([[d.cx, d.cy] for d in dets], dtype=float)
    bin_h = max(1.0, 0.5 * h_ref)

    def skor(a: float) -> float:
        r = math.radians(a)
        y = -pts[:, 0] * math.sin(r) + pts[:, 1] * math.cos(r)
        y0 = float(y.min())
        nb = max(1, int(math.ceil((float(y.max()) - y0) / bin_h)) + 1)
        hist, _ = np.histogram(y, bins=nb, range=(y0, y0 + nb * bin_h))
        return float((hist.astype(float) ** 2).sum())

    sudut = np.arange(-MAX_SKEW, MAX_SKEW + 0.01, 0.5)
    nilai = [skor(float(a)) for a in sudut]
    terbaik = float(sudut[int(np.argmax(nilai))])
    if max(nilai) < 1.03 * skor(0.0):
        return 0.0
    return terbaik


def _kelompok_baris(sel: list, h_ref: float) -> list:
    sel = sorted(sel, key=lambda s: s.y)
    baris = [[sel[0]]]
    for s in sel[1:]:
        if s.y - baris[-1][-1].y > RASIO_BARIS * h_ref:
            baris.append([s])
        else:
            baris[-1].append(s)
    for b in baris:
        b.sort(key=lambda s: s.x)
    return baris


def _estimasi_pitch(baris: list):
    jarak = [b.x - a.x for row in baris for a, b in zip(row, row[1:])]
    jarak = np.array([j for j in jarak if j > 0], dtype=float)
    if jarak.size == 0:
        return None
    dasar = float(np.percentile(jarak, 25))
    dekat = jarak[jarak <= 1.35 * dasar]
    return float(np.median(dekat)) if dekat.size else dasar


def _kanon(label: str):
    """Kembalikan (label_asli_dirapikan, label_huruf_kecil)."""
    rapi = label.strip()
    return rapi, rapi.lower()


def baca_deteksi(dets: list, deskew: bool = True) -> HasilBaca:
    dets = [d for d in dets if d.w > 0 and d.h > 0]
    dets = hapus_duplikat(dets)
    if not dets:
        return HasilBaca([], 0.0, 0.0, 0)

    h_ref = float(np.percentile([d.h for d in dets], 80))
    sudut = estimasi_kemiringan(dets, h_ref) if deskew else 0.0
    r = math.radians(sudut)
    c, s = math.cos(r), math.sin(r)
    sel = [_Sel(d, d.cx * c + d.cy * s, -d.cx * s + d.cy * c) for d in dets]

    baris_sel = _kelompok_baris(sel, h_ref)
    pitch_global = _estimasi_pitch(baris_sel) or 1.3 * float(np.median([d.w for d in dets]))

    hasil_baris = []
    for row in baris_sel:
        pitch = _estimasi_pitch([row]) if len(row) >= 8 else None
        pitch = pitch or pitch_global
        batas_spasi = RASIO_SPASI * pitch

        kata_baris: list = []
        kata = Kata()
        mode_angka = False
        kapital = False

        def tutup():
            nonlocal kata
            if kata.huruf:
                kata_baris.append(kata)
            kata = Kata()

        for i, sl in enumerate(row):
            if i > 0 and (sl.x - row[i - 1].x) > batas_spasi:
                tutup()
                mode_angka = False
                kapital = False

            rapi, rendah = _kanon(sl.det.label)
            if rendah in SPACE_LABELS:
                tutup()
                mode_angka = False
                continue
            if rendah in NUMBER_LABELS:
                mode_angka = True
                continue
            if rendah in CAPITAL_LABELS:
                kapital = True
                continue
            if rendah in IGNORE_LABELS:
                continue

            ch = rendah if MERGE_CASE else rapi
            if mode_angka:
                if ch.lower() in NUMBER_MAP:
                    ch = NUMBER_MAP[ch.lower()]
                else:
                    mode_angka = False
            if kapital and ch.isalpha():
                ch = ch.upper()
                kapital = False
            kata.huruf.append((ch, sl.det.conf))
        tutup()
        if kata_baris:
            hasil_baris.append(kata_baris)

    return HasilBaca(hasil_baris, sudut, pitch_global, len(dets))


def baca_boxes(boxes, names, deskew: bool = True) -> HasilBaca:
    return baca_deteksi(dets_dari_boxes(boxes, names), deskew=deskew)


def process_braille_detections(boxes, model_names) -> str:
    """Nama lama, dipertahankan agar skrip lama tetap jalan."""
    return baca_boxes(boxes, model_names).teks()
