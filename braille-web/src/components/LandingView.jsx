import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

// Sel Braille untuk kata "sekolah". Sel ke-3 terbaca l (titik 1-2-3), padahal k (titik 1-3).
const WORD_CELLS = [
  { key: "s", dots: [2, 3, 4] },
  { key: "e", dots: [1, 5] },
  { key: "k", wrong: "l", dots: [1, 3], wrongDots: [1, 2, 3] },
  { key: "o", dots: [1, 3, 5] },
  { key: "l", dots: [1, 2, 3] },
  { key: "a", dots: [1] },
  { key: "h", dots: [1, 2, 5] },
];

function CellMini({ letter, dots, flagged, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex min-w-0 flex-col items-center gap-2 border-0 bg-transparent p-0 text-left transition-transform hover:scale-105 active:scale-95"
      aria-label={`Sel ${letter}, klik untuk simulasi sentuh`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-[6px] text-[0.9rem] font-bold sm:h-8 sm:w-8 transition-all duration-300 ${
          flagged
            ? "bg-[#E6FF2E] text-[#0B1C33] scale-110 shadow-lg shadow-[#E6FF2E]/25 ring-2 ring-white/50"
            : "bg-white/12 text-white scale-100 group-hover:bg-white/20"
        }`}
      >
        {letter}
      </span>
      <div
        className={`grid w-full max-w-[56px] grid-cols-2 justify-items-center gap-x-1 gap-y-2 rounded-[10px] px-1 py-3 transition-all duration-500 ${
          flagged ? "bg-[#E6FF2E]/15 ring-1 ring-[#E6FF2E]" : "bg-white/6 group-hover:bg-white/10"
        }`}
      >
        {[1, 4, 2, 5, 3, 6].map((d) => {
          const isFilled = dots.includes(d);
          const isSpecialDot = flagged && d === 2;
          return (
            <span
              key={d}
              className={`relative rounded-full braille-dot-tactile transition-all duration-300 ${
                isSpecialDot ? "dot-ripple" : ""
              } ${
                isFilled
                  ? "bg-white h-2.5 w-2.5 sm:h-3 sm:w-3 shadow-[0_0_8px_rgba(255,255,255,0.7)] scale-105"
                  : "bg-white/20 h-2 w-2 sm:h-2.5 sm:w-2.5 scale-90"
              }`}
            />
          );
        })}
      </div>
    </button>
  );
}

function CorrectionDemo() {
  const [fixed, setFixed] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const id = setInterval(() => setFixed((v) => !v), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative rounded-[20px] bg-[#08182E] p-5 text-white sm:p-8 overflow-hidden shadow-2xl">
      {/* Corner HUD Accent */}
      <div className="hud-corner hud-corner-tl" aria-hidden="true" />
      <div className="hud-corner hud-corner-tr" aria-hidden="true" />
      <div className="hud-corner hud-corner-bl" aria-hidden="true" />
      <div className="hud-corner hud-corner-br" aria-hidden="true" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-[0.88rem]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#E6FF2E] animate-pulse" />
          <span className="font-semibold">Ruang Scan · Simulasi Optik</span>
        </div>
        <button
          type="button"
          onClick={() => setFixed((v) => !v)}
          className="btn btn-secondary btn-sm !bg-white/10 !text-white !border-white/20 hover:!bg-white/20"
        >
          {fixed ? "Lihat Deteksi Awal" : "Terapkan Koreksi"}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-3" aria-hidden="true">
        {WORD_CELLS.map((c, i) => {
          const isTarget = Boolean(c.wrong);
          const showWrong = isTarget && !fixed;
          return (
            <CellMini
              key={i}
              letter={showWrong ? `${c.wrong}?` : c.key}
              dots={showWrong ? c.wrongDots : c.dots}
              flagged={showWrong}
              onToggle={() => isTarget && setFixed((v) => !v)}
            />
          );
        })}
      </div>

      <dl className="m-0 mt-7 grid grid-cols-2 gap-4 border-t border-white/15 pt-5 text-[0.9rem]">
        <div>
          <dt className="text-white/65">Bacaan awal</dt>
          <dd className="m-0 mt-0.5 text-[1.2rem] font-bold">selolah</dd>
        </div>
        <div>
          <dt className="text-white/65">Hasil setelah kamus</dt>
          <dd
            className={`m-0 mt-0.5 text-[1.2rem] font-bold transition-colors duration-500 ${
              fixed ? "text-[#E6FF2E]" : "text-white/40"
            }`}
          >
            sekolah
          </dd>
        </div>
      </dl>

      <p className="sr-only">
        Contoh: sel ketiga terbaca huruf l dengan titik 1, 2, 3. Kamus menyarankan huruf k dengan
        titik 1 dan 3, sehingga bacaan selolah menjadi sekolah.
      </p>
    </div>
  );
}

function ParallaxImage({
  src,
  srcSet,
  sizes,
  width,
  height,
  alt,
  priority = false,
  className = "",
  rate = 0.3,
  maxTravel = 130,
}) {
  const imgRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    let rafId = null;
    const update = () => {
      if (!imgRef.current) return;
      const parent = imgRef.current.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Hitung hanya ketika bingkai mendekati atau berada di viewport
      if (rect.bottom >= -160 && rect.top <= windowHeight + 160) {
        // Jarak relatif pusat kartu terhadap pusat viewport
        const centerOffset = rect.top + rect.height / 2 - windowHeight / 2;
        // Parallax yang jelas terasa dan sinematik (clamped aman ke maxTravel)
        // Dengan bleed -top-[30%] dan !h-[160%], batas gambar selalu tertutup penuh
        const shiftY = Math.max(-maxTravel, Math.min(maxTravel, centerOffset * rate));
        imgRef.current.style.transform = `translate3d(0, ${shiftY}px, 0)`;
      }
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          update();
          rafId = null;
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [rate, maxTravel]);

  return (
    <img
      ref={imgRef}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`!absolute -top-[30%] left-0 w-full !h-[160%] object-cover pointer-events-none parallax-img will-change-transform ${className}`}
    />
  );
}

export default function LandingView({ onOpenAuth }) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.12 }
    );
    const elements = document.querySelectorAll(".reveal-on-view");
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-24 pb-24 pt-3 lg:gap-32 lg:pb-32 lg:pt-4">
      {/* 1. Hero: foto langit penuh, kata raksasa, satu tindakan */}
      <section aria-labelledby="judul-hero-utama" className="wrap-sky">
        <div className="photo-frame flex min-h-[calc(100svh-96px)] flex-col">
          <ParallaxImage
            src="/img/langit-lebar.jpg"
            srcSet="/img/langit-lebar-960.jpg 960w, /img/langit-lebar.jpg 1280w"
            sizes="100vw"
            width="1280"
            height="826"
            alt="Langit biru dengan awan putih bergumpal"
            priority
            rate={0.34}
            maxTravel={140}
          />
          <div className="photo-shade" aria-hidden="true" />

          <div
            data-enter
            className="relative z-10 flex flex-1 flex-col justify-between gap-10 p-6 sm:p-10 lg:p-14"
          >
            <h1 id="judul-hero-utama" className="display-xl hero-line hero-stagger-1 m-0 text-white">
              Baca <br className="md:hidden" />
              Braille<span className="relative inline-block text-[#E6FF2E]">.<span className="absolute bottom-2 right-1 h-3 w-3 rounded-full bg-[#E6FF2E]/40 animate-ping pointer-events-none" aria-hidden="true" /></span>
            </h1>

            <div className="hero-stagger-2 flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <p className="m-0 max-w-[46ch] text-[1.05rem] leading-relaxed text-white sm:text-[1.15rem]">
                Railuma membaca tulisan Braille lewat kamera dan mengubahnya jadi teks, untuk siswa,
                guru, dan orang tua. Kamus 69.741 kata Bahasa Indonesia ikut memeriksa setiap huruf.
              </p>

              <div className="hero-stagger-3 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenAuth("login")}
                  className="btn btn-limau !px-6 !py-3 text-[0.98rem]"
                >
                  <span>Mulai membaca</span>
                  <ArrowRight size={18} className="arrow-glide" aria-hidden="true" />
                </button>
                <a
                  href="#cara-kerja"
                  className="link-draw inline-flex min-h-[44px] items-center text-[0.98rem] font-semibold text-white"
                >
                  Lihat cara kerjanya
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Siapa yang memakainya: foto nyata dan satu angka */}
      <section id="untuk-siapa" aria-labelledby="judul-untuk-siapa" className="wrap-sky reveal-on-view">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="photo-frame aspect-[3/2] lg:col-span-7">
            <ParallaxImage
              src="/img/siswa-membaca.jpg"
              width="960"
              height="640"
              alt="Dua siswa tunanetra membaca lembar Braille di atas meja kayu"
              rate={0.18}
              maxTravel={60}
            />
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <h2 id="judul-untuk-siapa" className="display-md m-0">
              Dibuat untuk meja belajar
            </h2>
            <p className="m-0 text-[1.02rem] leading-relaxed text-muted-theme">
              Guru yang tidak membaca Braille bisa memeriksa lembar jawaban murid. Orang tua bisa
              membaca catatan anaknya. Siswa bisa mengecek tulisannya sendiri.
            </p>
            <div>
              <div className="font-[family-name:var(--font-display)] text-[clamp(3.5rem,8vw,6rem)] leading-none text-[var(--primary)] tabular-nums">
                69.741
              </div>
              <p className="m-0 mt-1 text-[0.98rem] font-semibold">
                kata Bahasa Indonesia dalam kamus pemeriksa
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Cara kerja: antarmuka nyata, satu koreksi */}
      <section id="cara-kerja" aria-labelledby="judul-cara-kerja" className="wrap-sky reveal-on-view">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-6 lg:col-span-5">
            <h2 id="judul-cara-kerja" className="display-md m-0">
              Satu titik meleset, kamus yang membetulkan
            </h2>
            <p className="m-0 text-[1.02rem] leading-relaxed text-muted-theme">
              Bayangan kertas kadang membuat satu titik timbul tampak samar. Railuma menandai huruf
              yang ragu, lalu mencari kata yang hanya berbeda satu titik. Huruf l (titik 1-2-3) dan
              k (titik 1-3) hanya selisih satu titik, jadi selolah disarankan menjadi sekolah.
            </p>
            <p className="m-0 text-[1.02rem] leading-relaxed text-muted-theme">
              Kamera tidak pernah dicerminkan, sehingga pasangan huruf seperti d dan f tidak
              tertukar.
            </p>
          </div>
          <div className="lg:col-span-7">
            <CorrectionDemo />
          </div>
        </div>
      </section>

      {/* 4. Tiga alat dalam satu akun */}
      <section id="fitur-studio" aria-labelledby="judul-fitur-studio" className="wrap-sky reveal-on-view">
        <h2 id="judul-fitur-studio" className="display-lg m-0 max-w-[16ch]">
          Tiga alat, satu akun
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
          {[
            {
              num: "01",
              title: "Ruang Scan",
              body: "Pindai lewat webcam, foto, atau kamera belakang HP. Setiap tangkapan tersimpan di sesi, bisa dikoreksi huruf demi huruf, lalu diekspor ke PDF atau TXT.",
              cta: "Buka Ruang Scan",
              mode: "login",
            },
            {
              num: "02",
              title: "Koreksi Tugas",
              body: "Tulis kunci jawaban per baris, lalu pindai lembar jawaban murid. Railuma membandingkan baris demi baris dan menyebut nomor yang salah.",
              cta: "Mulai menilai",
              mode: "login",
            },
            {
              num: "03",
              title: "Suara ke Reglet",
              body: "Ucapkan atau ketik kalimat, dan lihat pola titiknya. Pilih urutan biasa atau terbalik per baris sebagai panduan menusuk dengan stylus Reglet.",
              cta: "Coba konversi",
              mode: "login",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="card-interactive flex flex-col gap-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface)] p-6 pt-5"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <span className="font-[family-name:var(--font-display)] text-[1.3rem] font-bold text-[var(--primary)] tabular-nums">
                  {item.num}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              </div>
              <h3 className="display-md m-0 !text-[1.7rem]">{item.title}</h3>
              <p className="m-0 flex-1 text-[0.98rem] leading-relaxed text-muted-theme">
                {item.body}
              </p>
              <button
                type="button"
                onClick={() => onOpenAuth(item.mode)}
                className="link-draw inline-flex min-h-[44px] w-fit items-center gap-2 border-0 bg-transparent p-0 text-[0.96rem] font-bold text-[var(--primary)]"
              >
                <span>{item.cta}</span>
                <ArrowRight size={16} className="arrow-glide" aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* 5. Penutup */}
      <section aria-labelledby="judul-penutup" className="wrap-sky reveal-on-view">
        <div className="photo-frame flex min-h-[70svh] flex-col justify-end">
          <ParallaxImage
            src="/img/langit-tegak.jpg"
            width="960"
            height="1433"
            alt="Langit biru dengan awan putih tipis dan tebal"
            rate={0.3}
            maxTravel={120}
          />
          <div className="photo-shade" aria-hidden="true" />
          <div className="relative z-10 flex flex-col gap-8 p-6 sm:p-10 lg:p-14">
            <h2 id="judul-penutup" className="display-xl m-0 text-white">
              Mulai
              <br />
              membaca<span className="text-[#E6FF2E]">.</span>
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="btn btn-limau !px-6 !py-3 text-[0.98rem]"
              >
                <span>Buat akun</span>
                <ArrowRight size={18} className="arrow-glide" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="link-draw inline-flex min-h-[44px] items-center border-0 bg-transparent p-0 text-[0.98rem] font-semibold text-white"
              >
                Sudah punya akun? Masuk
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
