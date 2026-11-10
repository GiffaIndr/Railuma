"""Mengubah kotak deteksi YOLO (satu kotak = satu sel Braille) menjadi teks dan poligon."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from koreksi import alternatif_sel, pola_titik

NUMBER_LABELS = {"number_sign", "numbersign", "number", "num", "#", "tanda_angka", "angka"}
CAPITAL_LABELS = {"capital", "capital_sign", "cap", "kapital", "tanda_kapital"}
SPACE_LABELS = {"space", "spasi"}
IGNORE_LABELS: set[str] = set()

MERGE_CASE = True

NUMBER_MAP = {"a": "1", "b": "2", "c": "3", "d": "4", "e": "5",
              "f": "6", "g": "7", "h": "8", "i": "9", "j": "0"}

RASIO_BARIS = 0.6
RASIO_SPASI = 1.5
RASIO_DUPLIKAT = 0.45
MAX_SKEW = 12.0


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
    huruf: list = field(default_factory=list)

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
    baris: list
    sudut: float = 0.0
    pitch: float = 0.0
    n_sel: int = 0
    sel_detail: list = field(default_factory=list)

    def teks(self) -> str:
        return "\n".join(" ".join(k.teks for k in b) for b in self.baris)

    @property
    def konf_rata(self) -> float:
        semua = [c for b in self.baris for k in b for c in k.konf]
        return float(np.mean(semua)) if semua else 0.0


@dataclass
class _Sel:
    det: Det
    x: float
    y: float


def dets_dari_boxes(boxes, names) -> list:
    hasil = []
    for b in boxes:
        x1, y1, x2, y2 = b.xyxy[0].tolist()
        hasil.append(Det(x1, y1, x2, y2, str(names[int(b.cls[0])]), float(b.conf[0])))
    return hasil


def hapus_duplikat(dets: list) -> list:
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
    rapi = label.strip()
    return rapi, rapi.lower()


def _poligon_sel(det: Det, sudut_deg: float) -> list[list[float]]:
    """Kembalikan 4 titik sudut poligon sel yang diputar mengikuti sudut kemiringan baris."""
    cx, cy = det.cx, det.cy
    hw, hh = max(4.0, det.w / 2.0), max(6.0, det.h / 2.0)
    r = math.radians(-sudut_deg)
    c, s = math.cos(r), math.sin(r)
    sudut_lokal = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    return [
        [round(cx + dx * c - dy * s, 1), round(cy + dx * s + dy * c, 1)]
        for dx, dy in sudut_lokal
    ]


def baca_deteksi(dets: list, deskew: bool = True) -> HasilBaca:
    dets = [d for d in dets if d.w > 0 and d.h > 0]
    dets = hapus_duplikat(dets)
    if not dets:
        return HasilBaca([], 0.0, 0.0, 0, [])

    h_ref = float(np.percentile([d.h for d in dets], 80))
    sudut = estimasi_kemiringan(dets, h_ref) if deskew else 0.0
    r = math.radians(sudut)
    c, s = math.cos(r), math.sin(r)
    sel = [_Sel(d, d.cx * c + d.cy * s, -d.cx * s + d.cy * c) for d in dets]

    baris_sel = _kelompok_baris(sel, h_ref)
    pitch_global = _estimasi_pitch(baris_sel) or 1.3 * float(np.median([d.w for d in dets]))

    hasil_baris = []
    sel_detail = []
    idx_sel = 0

    for idx_baris, row in enumerate(baris_sel):
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

            konf_bulat = round(float(sl.det.conf), 3)
            sel_detail.append({
                "id": f"c{idx_sel}",
                "line": idx_baris,
                "col": i,
                "symbol": ch,
                "pattern": pola_titik(ch),
                "conf": konf_bulat,
                "flag": "ok" if konf_bulat >= 0.65 else "review",
                "x1": round(sl.det.x1, 1),
                "y1": round(sl.det.y1, 1),
                "x2": round(sl.det.x2, 1),
                "y2": round(sl.det.y2, 1),
                "polygon": _poligon_sel(sl.det, sudut),
                "alternates": alternatif_sel(ch, konf_bulat),
            })
            idx_sel += 1

        tutup()
        if kata_baris:
            hasil_baris.append(kata_baris)

    return HasilBaca(hasil_baris, sudut, pitch_global, len(dets), sel_detail)


def baca_boxes(boxes, names, deskew: bool = True) -> HasilBaca:
    return baca_deteksi(dets_dari_boxes(boxes, names), deskew=deskew)


def process_braille_detections(boxes, model_names) -> str:
    return baca_boxes(boxes, model_names).teks()
