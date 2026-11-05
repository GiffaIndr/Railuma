"""Koreksi kata hasil baca Braille memakai kamus KBBI.

Beda dengan versi lama (difflib + cutoff 0.70 atas seluruh kamus):
  * Kamus disaring: hanya kata tunggal huruf a-z. File kata_kbbi.txt berisi
    puluhan ribu frasa/peribahasa (mis. "(air) susu dibalas dng (air) tuba")
    yang hanya menambah noise.
  * Kandidat dihasilkan dari kata hasil baca (ganti/hapus/sisip huruf) lalu
    dicek ke set kamus. Tidak lagi memindai seluruh kamus per kata, jadi cepat.
  * Biaya penggantian huruf mengikuti POLA TITIK: huruf yang hanya beda satu
    titik (mis. k <-> l) murah, huruf yang jauh beda mahal. Ini meniru jenis
    salah baca yang memang sering terjadi pada model.
  * Huruf dengan confidence tinggi lebih mahal diubah.
  * Kata yang yakin semua (nama, singkatan, kata asing) dibiarkan.
  * Kalau ada dua kandidat yang sama bagusnya, kata TIDAK diubah (ditandai ragu).
  * Selalu mengembalikan kata asli dan kata final, agar UI bisa menampilkan keduanya.
"""
from __future__ import annotations

import os
import re

ALFABET = "abcdefghijklmnopqrstuvwxyz"

# Nomor titik tiap huruf pada sel Braille (1-2-3 kolom kiri, 4-5-6 kolom kanan)
_TITIK_STR = {
    "a": "1", "b": "12", "c": "14", "d": "145", "e": "15", "f": "124", "g": "1245",
    "h": "125", "i": "24", "j": "245", "k": "13", "l": "123", "m": "134", "n": "1345",
    "o": "135", "p": "1234", "q": "12345", "r": "1235", "s": "234", "t": "2345",
    "u": "136", "v": "1236", "w": "2456", "x": "1346", "y": "13456", "z": "1356",
}
TITIK = {k: set(v) for k, v in _TITIK_STR.items()}
HAM = {a: {b: len(TITIK[a] ^ TITIK[b]) for b in ALFABET} for a in ALFABET}
MIRIP = {a: [b for b in ALFABET if 0 < HAM[a][b] <= 2] for a in ALFABET}

# Parameter (boleh disetel)
KONF_LINDUNG = 0.90   # jika semua huruf >= nilai ini, kata tak dikoreksi (mungkin nama)
PANJANG_MIN = 3       # kata lebih pendek dari ini tidak dikoreksi
BIAYA_MAKS = 1.0      # biaya maksimum koreksi 1 langkah
BIAYA_MAKS_PANJANG = 1.3  # untuk kata >= 7 huruf (boleh 2 langkah)
SELISIH_AMBIGU = 0.10 # dua kandidat selisih biaya < ini dianggap ragu


class Kamus:
    def __init__(self, path: str | None = None):
        self.kata: set = set()
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for baris in f:
                    w = baris.strip().lower()
                    if re.fullmatch(r"[a-z]+", w):
                        self.kata.add(w)
        if not self.kata:
            self.kata = {"buku", "saya", "kamu", "belajar", "membaca", "menulis",
                         "braille", "kamera", "sekolah", "makan", "minum", "duduk",
                         "pagi", "siang", "malam", "indonesia", "tugas", "proyek"}

    def __contains__(self, w: str) -> bool:
        return w in self.kata

    def __len__(self) -> int:
        return len(self.kata)


def _langkah_penuh(s: str, konf: list):
    """Semua perubahan 1 langkah: hapus, ganti, sisip. Menghasilkan (s2, konf2, biaya)."""
    n = len(s)
    for i in range(n):
        f = 0.6 + 0.8 * konf[i]          # huruf yakin -> lebih mahal diubah
        yield s[:i] + s[i + 1:], konf[:i] + konf[i + 1:], 1.0 * f
        a = s[i]
        for ch in ALFABET:
            if ch != a:
                yield (s[:i] + ch + s[i + 1:], konf[:i] + [0.5] + konf[i + 1:],
                       (0.4 + 0.1 * HAM[a][ch]) * f)
    for i in range(n + 1):
        for ch in ALFABET:
            yield s[:i] + ch + s[i:], konf[:i] + [0.5] + konf[i:], 0.9


def _langkah_mirip(s: str, konf: list):
    """Hanya ganti huruf dengan huruf yang beda <= 2 titik."""
    for i in range(len(s)):
        f = 0.6 + 0.8 * konf[i]
        a = s[i]
        for ch in MIRIP[a]:
            yield (s[:i] + ch + s[i + 1:], konf[:i] + [0.5] + konf[i + 1:],
                   (0.4 + 0.1 * HAM[a][ch]) * f)


def cari_kandidat(kata: str, konf: list, kamus: Kamus) -> dict:
    """Kembalikan {kandidat: biaya_terkecil}."""
    ada: dict = {}
    for s1, _, k1 in _langkah_penuh(kata, konf):
        if s1 in kamus.kata and s1 != kata:
            if k1 < ada.get(s1, 9.0):
                ada[s1] = k1
    if len(kata) >= 7:
        for s1, c1, k1 in _langkah_mirip(kata, konf):
            for s2, _, k2 in _langkah_mirip(s1, c1):
                if s2 in kamus.kata and s2 != kata:
                    total = k1 + k2
                    if total < ada.get(s2, 9.0):
                        ada[s2] = total
    return ada


def _pulihkan_huruf(asli: str, baru: str) -> str:
    if len(asli) > 1 and asli.isupper():
        return baru.upper()
    if asli[:1].isupper():
        return baru.capitalize()
    return baru


def koreksi_kata(kata, kamus: Kamus) -> dict:
    """`kata` adalah braille_logic.Kata. Mengembalikan dict info."""
    asli = kata.teks
    info = {"raw": asli, "final": asli, "diubah": False, "ragu": False,
            "konf_min": round(kata.konf_min, 3)}
    rendah = asli.lower()
    if len(rendah) < PANJANG_MIN or not re.fullmatch(r"[a-z]+", rendah):
        return info                      # angka, tanda baca, kata sangat pendek
    if rendah in kamus:
        return info                      # sudah benar
    if kata.konf_min >= KONF_LINDUNG:
        return info                      # yakin semua: kemungkinan nama/kata asing

    kandidat = cari_kandidat(rendah, kata.konf, kamus)
    if not kandidat:
        return info
    urut = sorted(kandidat.items(), key=lambda kv: kv[1])
    terbaik, biaya = urut[0]
    batas = BIAYA_MAKS_PANJANG if len(rendah) >= 7 else BIAYA_MAKS
    if biaya > batas:
        return info
    if len(urut) > 1 and urut[1][1] - biaya < SELISIH_AMBIGU:
        info["ragu"] = True              # dua pilihan sama bagus: jangan menebak
        return info
    info["final"] = _pulihkan_huruf(asli, terbaik)
    info["diubah"] = True
    return info


def koreksi_hasil(hasil, kamus: Kamus):
    """Koreksi seluruh HasilBaca. Mengembalikan (teks_final, daftar_baris_info)."""
    baris_info = []
    for baris in hasil.baris:
        baris_info.append([koreksi_kata(k, kamus) for k in baris])
    teks = "\n".join(" ".join(w["final"] for w in b) for b in baris_info)
    return teks, baris_info
