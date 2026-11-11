import { useEffect, useState, useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { fetchAuthProviders, loginUser, registerUser, signInWithGoogle } from "../services/api";
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAuthProviders().then((p) => {
      if (active) setGoogleEnabled(Boolean(p?.google));
    });
    return () => {
      active = false;
    };
  }, []);

  const emailIsValid = useMemo(() => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }, [email]);

  const passwordIsValid = useMemo(() => {
    return password.length >= 6;
  }, [password]);

  const nameIsValid = useMemo(() => {
    return mode !== "register" || name.trim().length >= 2;
  }, [name, mode]);

  const formIsValid = emailIsValid && passwordIsValid && nameIsValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true });
    setErrorMsg("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      const msg = "Mohon isi alamat email dan kata sandi terlebih dahulu.";
      setErrorMsg(msg);
      announce(msg);
      return;
    }

    if (!emailIsValid) {
      const msg = "Format alamat email belum tepat (contoh: nama@domain.com).";
      setErrorMsg(msg);
      announce(msg);
      return;
    }

    if (!passwordIsValid) {
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
          className="card flex flex-col p-7 sm:p-10 lg:col-span-7"
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

          {/* Opsi Sign in with Google: tampil hanya bila penyedia aktif di Supabase */}
          {googleEnabled && (
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#0B1C33] dark:text-[#EDF3FB] font-semibold text-sm hover:bg-[#F8FAFC] dark:hover:bg-[#283950] transition-colors shadow-sm min-h-[44px]"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>{mode === "login" ? "Masuk dengan Google" : "Daftar dengan Google"}</span>
              </button>

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                <span className="text-xs uppercase font-medium text-muted-theme tracking-wider">
                  atau gunakan email
                </span>
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="alert-box text-[0.9rem] mt-4">
              <strong>Perhatian:</strong> {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-1 flex-col justify-between gap-6" noValidate>
            <div className="flex flex-col gap-4">
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
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Anda"
                    className="field"
                  />
                  {touched.name && !nameIsValid && (
                    <p className="mt-1 text-xs text-[#DC2626] dark:text-[#F87171] flex items-center gap-1 font-medium">
                      <AlertCircle size={13} aria-hidden="true" />
                      Nama minimal terdiri dari 2 karakter.
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="auth-email" className="block text-[0.88rem] font-semibold">
                    Alamat Email
                  </label>
                  {touched.email && email && (
                    <span className={`text-xs font-medium flex items-center gap-1 ${emailIsValid ? "text-[#166534] dark:text-[#86EFAC]" : "text-[#DC2626] dark:text-[#F87171]"}`}>
                      {emailIsValid ? (
                        <>
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Format email valid
                        </>
                      ) : (
                        <>
                          <AlertCircle size={13} aria-hidden="true" />
                          Format email belum sesuai
                        </>
                      )}
                    </span>
                  )}
                </div>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  className="field"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="auth-password" className="block text-[0.88rem] font-semibold">
                    Kata Sandi
                  </label>
                  {touched.password && password && (
                    <span className={`text-xs font-medium flex items-center gap-1 ${passwordIsValid ? "text-[#166534] dark:text-[#86EFAC]" : "text-[#DC2626] dark:text-[#F87171]"}`}>
                      {passwordIsValid ? (
                        <>
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Kata sandi memenuhi syarat
                        </>
                      ) : (
                        <>
                          <AlertCircle size={13} aria-hidden="true" />
                          Kurang {6 - password.length} karakter
                        </>
                      )}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="field !pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-theme hover:text-[var(--text)] p-1 rounded transition-colors"
                  >
                    {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-muted-theme pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-strong)] text-[var(--accent)]"
                  />
                  <span>Ingat sesi masuk di perangkat ini</span>
                </label>
                <span className="hidden sm:inline-flex items-center gap-1 text-muted-theme">
                  <ShieldCheck size={13} className="text-[#166534] dark:text-[#86EFAC]" aria-hidden="true" />
                  Keamanan terenkripsi via Supabase RLS
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-5">
              <span className="text-[0.85rem] text-muted-theme">
                {mode === "login"
                  ? "Belum punya akun? Pilih tab Daftar di kanan atas."
                  : "Akun langsung aktif setelah pendaftaran selesai."}
              </span>

              <button
                type="submit"
                disabled={loading || (touched.email && !formIsValid)}
                className="btn btn-primary !px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
