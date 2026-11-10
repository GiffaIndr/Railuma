# PRODUCT.md: Railuma

## 1. Produk & Pengguna Utama
- **Nama Produk**: Railuma
- **Kategori**: Aplikasi web pembaca, pengoreksi, dan konverter tulisan Braille Indonesia berbasis visi komputer (YOLOv8s) dan aturan pasca-pemrosesan KBBI.
- **Pengguna Utama**:
  1. **Guru Sekolah Luar Biasa (SLB) & Pendamping Awas**: Memindai lembar kerja Braille siswa menggunakan kamera laptop atau kamera HP, memeriksa ketepatan sel 6-titik, memperbaiki huruf yang meragukan, dan menilai tugas siswa terhadap kunci jawaban.
  2. **Siswa & Pengguna Tunanetra / Low-Vision**: Mendengarkan pembacaan hasil terjemahan Braille melalui pembaca layar (`aria-live`) atau suara sintesis (TTS), serta mengubah suara/teks menjadi pola titik Braille biasa maupun mode Reglet (cermin kanan-ke-kiri untuk penusukan stylus dari belakang kertas).

## 2. Arsitektur Permukaan (Surface Modes)
1. **Halaman Beranda / Landing (`Persuade` Mode)**:
   - Memperkenalkan cara kerja Railuma secara jernih dengan estetika **Open Sky** (*airy, bersih, kontras tinggi*).
   - Menampilkan simulasi interaktif matriks 6-titik Braille langsung di layar pertama tanpa membebani pengunjung dengan antarmuka dasbor penuh.
   - Mengarahkan pengunjung untuk **Masuk** atau **Daftar Akun** guna membuka Studio Railuma.
2. **Halaman Autentikasi (`Operate` Mode - Terpisah)**:
   - Halaman khusus untuk **Masuk** dan **Daftar Akun Baru** menggunakan Supabase Auth.
   - Mengamankan akses ke seluruh fitur Studio Railuma dan memastikan setiap sesi riwayat terisolasi per pengguna melalui Row Level Security (`user_id`).
3. **Studio Dasbor Terautentikasi (`Operate` Mode - Terkunci Login)**:
   - Hanya dapat diakses setelah pengguna masuk.
   - Memiliki bilah navigasi kerja yang bersih dan tenang (tanpa poster hero pemasaran di atas ruang kerja) untuk berpindah antar 3 alat utama:
     - **Pemindai & Riwayat**: Pindai live poligon 4-titik, mode kalimat burst 3-frame, unggah foto, penyandingan kamera HP via WebSocket, riwayat sesi per akun, dan inspektor koreksi sel 6-titik berjarak Hamming 1.
     - **Koreksi Tugas**: Bandingkan hasil pindai lembar jawaban siswa dengan kunci jawaban guru hingga tingkat kemiripan karakter.
     - **Suara ke Reglet**: Konversi ucapan mikrofon atau ketikan teks ke simbol Unicode Braille biasa dan mode Reglet terbalik, lengkap dengan ekspor TXT/PDF.
