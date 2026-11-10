import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LogIn, UserPlus } from "lucide-react";
import { loginUser, registerUser } from "../services/api";
import { useA11y } from "../context/useA11y";

export default function AuthCard({
  initialMode = "login",
  onAuthenticated,
  onBackToLanding,
}) {
  const { announce } = useA11y();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      const msg = "Mohon isi alamat email dan kata sandi terlebih dahulu.";
      setErrorMsg(msg);
      announce(msg);
      return;
    }

    if (password.length < 6) {
      const msg = "Kata sandi minimal harus 6 karakter.";
      setErrorMsg(msg);
      announce(msg);
      return;
    }

    setLoading(true);
    try {
      const res =
        mode === "register"
          ? await registerUser({ name: name.trim(), email: trimmedEmail, password })
          : await loginUser({ email: trimmedEmail, password });

      const user = res.user;
      announce(
        mode === "register"
          ? `Pendaftaran berhasil. Selamat datang di Railuma, ${user.name || user.email}.`
          : `Berhasil masuk sebagai ${user.name || user.email}.`,
      );
      if (onAuthenticated) {
        onAuthenticated(user);
      }
    } catch (err) {
      const msg = err.message || "Gagal memproses autentikasi akun.";
      setErrorMsg(msg);
      announce(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap-sky flex flex-1 flex-col justify-center py-8 lg:py-14">
      {onBackToLanding && (
        <div className="mb-6">
          <button
            type="button"
            onClick={onBackToLanding}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Kembali ke Halaman Depan</span>
          </button>
        </div>
      )}

      <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* Kolom Kiri (5 Kolom): Panel Solid Biru Tua yang Tenang */}
        <div className="photo-frame flex min-h-[420px] flex-col justify-between gap-8 p-8 sm:p-10 lg:col-span-5">
          <img
            src="/img/langit-tegak.jpg"
            width="960"
            height="1433"
            alt="Langit biru dengan awan putih"
            decoding="async"
            className="!absolute inset-0"
          />
          <div className="photo-shade" aria-hidden="true" />
          <div className="relative z-10">
            <div className="mb-4 inline-flex items-center gap-2.5 rounded-full bg-[#0B1E36]/80 px-3 py-1.5 backdrop-blur-sm border border-white/15">
              <img src="/railuma-mark-clean.png" alt="" className="h-6 w-auto" />
              <span className="text-[0.92rem] font-bold tracking-tight text-white">Railuma</span>
            </div>
            <h1 className="m-0 text-white">
              <span className="display-lg block">
                {mode === "login" ? "Selamat datang kembali" : "Buat akun baru"}
              </span>
              <span className="font-serif-accent mt-2 block text-[1.85rem] leading-tight text-[#E6FF2E]">
                Ruang kerja Braille pribadi.
              </span>
            </h1>
            <p className="m-0 mt-4 text-[0.98rem] leading-relaxed text-white">
              Setiap tangkapan kamera, revisi huruf, dan penilaian tugas tersimpan terpisah di akun
              Anda.
            </p>
          </div>

          <ul className="relative z-10 m-0 flex list-none flex-col gap-3 border-t border-white/30 pt-6 p-0 text-[0.92rem] text-white">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="flex-none text-[#E6FF2E]" aria-hidden="true" />
              <span>Riwayat sesi terpisah untuk setiap akun</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="flex-none text-[#E6FF2E]" aria-hidden="true" />
              <span>Kamus 69.741 kata Bahasa Indonesia</span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="flex-none text-[#E6FF2E]" aria-hidden="true" />
              <span>Kamera belakang HP bisa disambungkan</span>
            </li>
          </ul>
        </div>

        {/* Kolom Kanan (7 Kolom): Formulir Masuk / Daftar */}
        <section
          aria-labelledby="judul-form-auth"
          className="card flex flex-col justify-between gap-6 p-7 sm:p-10 lg:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-5">
            <div>
              <h2 id="judul-form-auth" className="m-0 text-[1.35rem] font-bold">
                {mode === "login" ? "Masuk ke Akun Railuma" : "Pendaftaran Akun Baru"}
              </h2>
              <p className="m-0 mt-1 text-[0.88rem] text-muted-theme">
                {mode === "login"
                  ? "Masukkan email dan kata sandi untuk membuka ruang kerja Anda."
                  : "Isi data singkat di bawah ini untuk langsung mulai memindai."}
              </p>
            </div>

            <div className="segmented-bar" role="group" aria-label="Pilih mode autentikasi">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMsg("");
                }}
                aria-pressed={mode === "login"}
                className="segmented-item"
              >
                <LogIn size={15} aria-hidden="true" />
                <span>Masuk</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrorMsg("");
                }}
                aria-pressed={mode === "register"}
                className="segmented-item"
              >
                <UserPlus size={15} aria-hidden="true" />
                <span>Daftar</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div role="alert" className="alert-box text-[0.9rem]">
              <strong>Perhatian:</strong> {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="my-auto flex flex-col gap-4" noValidate>
            {mode === "register" && (
              <div>
                <label htmlFor="auth-nama" className="mb-1.5 block text-[0.88rem] font-semibold">
                  Nama Lengkap atau Panggilan
                </label>
                <input
                  id="auth-nama"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama Anda"
                  className="field"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-[0.88rem] font-semibold">
                Alamat Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="field"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-[0.88rem] font-semibold">
                Kata Sandi
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="field"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
              <span className="text-[0.85rem] text-muted-theme">
                {mode === "login"
                  ? "Belum punya akun? Pilih tab Daftar di kanan atas."
                  : "Akun langsung aktif setelah pendaftaran selesai."}
              </span>

              <button type="submit" disabled={loading} className="btn btn-primary !px-6">
                <span>
                  {loading
                    ? "Memproses..."
                    : mode === "login"
                      ? "Masuk ke Aplikasi"
                      : "Daftar & Buka Aplikasi"}
                </span>
                {!loading && <ArrowRight size={17} aria-hidden="true" />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
