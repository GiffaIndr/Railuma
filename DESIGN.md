# Railuma v2 · Sistem Desain "Kertas & Langit Solid"

## 1. Konsep & Prinsip Utama
**Satu kalimat:** *Permukaan solid tanpa gradasi, tata letak terbuka tanpa kotak bertumpuk.*

- **Tanpa Gradasi (100% Warna Solid):** Seluruh latar belakang, panggung hero, tombol, dan viewfinder kamera menggunakan warna solid yang tegas dan bersih (`#0B3B68` untuk panggung sambutan, `#F6F8FB` untuk kanvas halaman, `#FFFFFF` untuk permukaan utama, dan `#08182E` untuk viewfinder kamera).
- **Tanpa Tumpukan Kotak (*Zero Nested Cards*):** Mengikuti panduan `distill` dan `layout`, konten dikelompokkan melalui jarak ruang putih (*whitespace*) dan garis pemisah tipis (`1px solid #E2E9F2`), bukan dengan membungkus kotak di dalam kotak atau menumpuk kartu kaca di atas panggung hero.
- **Ruang Kerja Fokus Tugas:** Di dalam aplikasi, bilah navigasi berada di atas secara datar tanpa tumpang tindih (*overlap*) dengan isi halaman, sementara kamera dan panel hasil tetap berdampingan (`7:5`) agar pengguna langsung melihat terjemahan tanpa menggulir layar.

### Tiga Dial Kerajinan (Antislop Part 3)
- **ENERGY: 2 (Balanced)** · Kontras warna solid biru tua dan putih kertas yang tenang tanpa ornamen berlebihan.
- **RHYTHM: 3 (Varied)** · Peralihan jelas antara panggung hero dua kolom, bagian penjelasan terbuka, dan daftar instrumen 3-kolom tanpa bingkai kartu.
- **MOTION: 1 (Hover & Focus States Only)** · Transisi warna `160ms` yang tenang pada kontrol interaktif dan penghormatan penuh pada `prefers-reduced-motion: reduce`.

---

## 2. Palet Warna Solid & Kontras Terukur (WCAG 2.2 AA)

### Token Dasar (`@theme`)
- `awan-50`: `#F6F8FB` (Latar halaman tema siang)
- `awan-100`: `#EDF2F8` (Permukaan cekung lembut)
- `langit-600`: `#0E4D84` (Warna utama: tombol, tautan, cincin fokus; kontras `> 8:1` di atas putih)
- `langit-700`: `#09355C` (Hover tombol utama)
- `tinta`: `#0B1C33` (Teks utama, `> 16:1` di atas `#F6F8FB`)
- `limau`: `#E6FF2E` (Satu aksen khusus tombol utama di atas kanvas biru tua `#0B3B68`)
- `rumput-600`: `#166534` (Status yakin / berhasil)
- `bahaya`: `#B91C1C` (Status galat)
- `peringatan`: `#78350F` di atas `#FEF3C7`

### Tema Malam (`html.dark` / `[data-theme="dark"]`)
- `--bg`: `#081221`
- `--surface`: `#0F1F36`
- `--surface-sunken`: `#162B47`
- `--text`: `#EDF3FB`
- `--text-muted`: `#9EB3D1`
- `--primary`: `#E6FF2E` dengan `--on-primary`: `#0B1C33`

---

## 3. Tipografi Bersih
- **Utama & Display (`--font-poster` & `--font-ui`)**: `Plus Jakarta Sans` (bobot 400 hingga 800) dengan ukuran display maksimum `5.25rem` (`<= 6rem`) dan pelacakan huruf `-0.035em`.
- **Aksen Editorial (`--font-serif`)**: `Instrument Serif` (miring) untuk satu aksen kalimat pada judul utama.
- **Angka Terukur (`.tabular-nums`)**: `font-variant-numeric: tabular-nums` pada metrik sesi dan persentase keyakinan.
