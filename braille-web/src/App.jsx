import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  Contrast,
  HelpCircle,
  History,
  Home,
  LogIn,
  LogOut,
  Menu,
  Mic,
  Moon,
  ScanLine,
  Settings2,
  Sun,
  X,
} from "lucide-react";

import BrailleScanner from "./components/BrailleScanner";
import HomeworkCorrector from "./components/HomeworkCorrector";
import VoiceTranslator from "./components/VoiceTranslator";
import PhoneCameraClient from "./components/PhoneCameraClient";
import AuthCard from "./components/AuthCard";
import LandingView from "./components/LandingView";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import OnboardingTour from "./components/OnboardingTour";
import {
  CLAHE_KEY,
  DATASET_CONSENT_KEY,
  SAVE_IMAGE_KEY,
  clearAuthSession,
  fetchCurrentUser,
  fetchHealth,
  getAuthToken,
  getSavedUser,
  isClaheOn,
  isDatasetConsentOn,
  isSaveImageOn,
  logoutUser,
  parseOAuthHash,
  setAuthSession,
} from "./services/api";
import { A11yProvider } from "./context/A11yProvider";
import { useA11y } from "./context/useA11y";

const THEME_KEY = "railuma-theme";
const CONTRAST_KEY = "railuma-high-contrast";

const APP_NAV_ITEMS = [
  {
    id: "beranda",
    label: "Beranda",
    title: "Beranda Aplikasi",
    hint: "Ringkasan sesi, bacaan terakhir, dan jalan pintas pindai",
    Icon: Home,
  },
  {
    id: "scan",
    label: "Ruang Scan",
    title: "Ruang Scan Braille",
    hint: "Kamera deteksi poligon dan panel hasil berdampingan",
    Icon: ScanLine,
  },
  {
    id: "sesi",
    label: "Sesi & Riwayat",
    title: "Utas Sesi & Riwayat",
    hint: "Daftar sesi per akun, revisi, dan ekspor dokumen",
    Icon: History,
  },
  {
    id: "tugas",
    label: "Koreksi Tugas",
    title: "Koreksi Tugas Siswa",
    hint: "Evaluasi lembar jawaban Braille murid terhadap kunci guru",
    Icon: ClipboardCheck,
  },
  {
    id: "konversi",
    label: "Suara & Reglet",
    title: "Konversi Suara & Reglet",
    hint: "Ubah teks atau dikte suara menjadi titik Braille & Reglet",
    Icon: Mic,
  },
  {
    id: "pengaturan",
    label: "Pengaturan",
    title: "Pengaturan Aplikasi",
    hint: "Optik kamera, pembaca layar, tema tampilan, dan privasi",
    Icon: Settings2,
  },
];

function BrandMark({ size = 32, className = "" }) {
  return (
    <img
      src="/railuma-mark-clean.png"
      alt="Logo Railuma"
      width={Math.round((size * 137) / 158)}
      height={size}
      className={`flex-none object-contain select-none ${className}`}
      style={{ height: `${size}px`, width: "auto" }}
      loading="eager"
      decoding="async"
    />
  );
}

function SidebarContent({
  currentNavId,
  onSelectNav,
  currentUser,
  firstName,
  initials,
  darkMode,
  setDarkMode,
  highContrast,
  setHighContrast,
  onLogout,
  onGoHome,
  onCloseMobile,
  announce,
}) {
  return (
    <div className="flex h-full flex-col justify-between">
      {/* Brand & Title */}
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-2.5 border-0 bg-transparent p-0 text-left text-[var(--text)] group cursor-pointer"
            aria-label="Kembali ke Halaman Depan"
          >
            <BrandMark />
            <div>
              <span className="block text-[1.12rem] font-black tracking-tight text-[var(--text)] group-hover:opacity-85 transition-opacity">
                Railuma
              </span>
              <span className="block text-[0.72rem] font-semibold text-muted-theme">
                Ruang Kerja Braille
              </span>
            </div>
          </button>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden btn-icon !h-8 !w-8"
              aria-label="Tutup menu navigasi"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <nav aria-label="Instrumen kerja" className="mt-4 flex flex-col gap-1">
          <span className="px-3 pb-2 text-[0.72rem] font-bold uppercase tracking-wider text-muted-theme/80">
            Instrumen
          </span>
          {APP_NAV_ITEMS.map((item) => {
            const isActive = currentNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectNav(item.id)}
                className="sidebar-nav-item"
              >
                <item.Icon
                  size={18}
                  className={isActive ? "text-current" : "text-muted-theme"}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Utilities */}
      <div className="border-t border-[var(--border-subtle)] pt-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 rounded-[10px] bg-[var(--surface-sunken)] p-2">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)] text-[0.78rem] font-bold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[0.82rem] font-bold text-[var(--text)]">
              {currentUser.name || firstName}
            </span>
            <span className="block truncate text-[0.72rem] text-muted-theme">
              {currentUser.email || "Akun Terdaftar"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDarkMode((d) => {
                const next = !d;
                announce(next ? "Tema malam aktif." : "Tema siang aktif.");
                return next;
              });
            }}
            className="btn btn-secondary btn-sm !justify-center !px-2 text-[0.78rem]"
            aria-pressed={darkMode}
            title={darkMode ? "Ganti ke Tema Siang" : "Ganti ke Tema Malam"}
          >
            {darkMode ? (
              <Sun size={14} aria-hidden="true" />
            ) : (
              <Moon size={14} aria-hidden="true" />
            )}
            <span>{darkMode ? "Siang" : "Malam"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setHighContrast((c) => {
                const next = !c;
                announce(
                  next ? "Kontras tinggi aktif." : "Kontras tinggi mati.",
                );
                return next;
              });
            }}
            className="btn btn-secondary btn-sm !justify-center !px-2 text-[0.78rem]"
            aria-pressed={highContrast}
            title="Mode Kontras Tinggi"
          >
            <Contrast size={14} aria-hidden="true" />
            <span>{highContrast ? "Tinggi" : "Kontras"}</span>
          </button>
        </div>

        <div className="flex items-center justify-between pt-1 text-[0.8rem]">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-1.5 text-muted-theme hover:text-[var(--text)] transition-colors border-0 bg-transparent p-1 font-semibold cursor-pointer"
          >
            <Home size={14} aria-hidden="true" />
            <span>Halaman Depan</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 text-[var(--bahaya)] hover:underline border-0 bg-transparent p-1 font-semibold cursor-pointer"
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function Shell() {
  const { message, announce, voiceOn, setVoiceOn } = useA11y();
  const [currentUser, setCurrentUser] = useState(getSavedUser);
  const [view, setView] = useState(() =>
    getSavedUser() ? "studio" : "landing",
  );
  const [authMode, setAuthMode] = useState("login");
  const [navId, setNavId] = useState("scan");
  const [clahe, setClahe] = useState(isClaheOn);
  const [saveImage, setSaveImage] = useState(isSaveImageOn);
  const [datasetConsent, setDatasetConsent] = useState(isDatasetConsentOn);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === "dark";
    } catch {
      return false;
    }
  });
  const [highContrast, setHighContrast] = useState(() => {
    try {
      return localStorage.getItem(CONTRAST_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [healthInfo, setHealthInfo] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [pairTokenUrl, setPairTokenUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("pair") || "";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
    try {
      localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
    } catch {
      // abaikan
    }
  }, [darkMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.classList.add("high-contrast");
    } else {
      root.classList.remove("high-contrast");
    }
    try {
      localStorage.setItem(CONTRAST_KEY, highContrast ? "1" : "0");
    } catch {
      // abaikan
    }
  }, [highContrast]);

  useEffect(() => {
    fetchHealth()
      .then((h) => setHealthInfo(h))
      .catch(() => setHealthInfo(null));

    // Periksa kembalian Google OAuth dari URL hash (#access_token=...)
    const oauth = parseOAuthHash();
    if (oauth?.access_token) {
      setAuthSession(oauth.access_token, null);
      fetchCurrentUser()
        .then((u) => {
          if (u) {
            setCurrentUser(u);
            setView("studio");
            setNavId("scan");
            announce(`Berhasil masuk via Google sebagai ${u.name || u.email}.`);
          }
        })
        .catch((err) => {
          console.error("Gagal memuat profil OAuth:", err);
        })
        .finally(() => {
          if (typeof window !== "undefined" && window.history?.replaceState) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        });
      return;
    }

    if (getAuthToken()) {
      fetchCurrentUser()
        .then((u) => {
          if (u) {
            setCurrentUser(u);
          }
        })
        .catch((err) => {
          if (err?.status === 401) {
            clearAuthSession();
            setCurrentUser(null);
            setView("landing");
          }
        });
    }
  }, []);

  useEffect(() => {
    if (currentUser && view === "studio") {
      try {
        const completed = localStorage.getItem("railuma_onboarding_completed");
        if (completed !== "1") {
          setShowTour(true);
        }
      } catch {
        // abaikan
      }
    }
  }, [currentUser, view]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  const handleOpenAuth = (mode = "login") => {
    setAuthMode(mode);
    setMobileMenuOpen(false);
    setView("auth");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setMobileMenuOpen(false);
    setView("landing");
    announce("Anda telah keluar dari akun Railuma.");
  };

  const handleSelectNav = (id) => {
    setNavId(id);
    setMobileMenuOpen(false);
    const target = APP_NAV_ITEMS.find((x) => x.id === id);
    if (target) {
      announce(`${target.title}. ${target.hint}.`);
    }
  };

  if (pairTokenUrl) {
    return (
      <div className="min-h-screen">
        <PhoneCameraClient
          token={pairTokenUrl}
          onExit={() => {
            window.history.replaceState({}, "", window.location.pathname);
            setPairTokenUrl("");
          }}
        />
      </div>
    );
  }

  const isStudioView = view === "studio" && Boolean(currentUser);
  const currentNavItem =
    APP_NAV_ITEMS.find((x) => x.id === navId) || APP_NAV_ITEMS[1];

  // ============================================================================
  // KERANGKA 1: PUBLIC SHELL (Halaman Depan & Autentikasi, Solid & Bersih)
  // ============================================================================
  if (!isStudioView) {
    return (
      <div className="flex min-h-screen flex-col">
        <a className="skip-link" href="#isi">
          Lewati ke isi utama
        </a>

        <header className="top-nav-shell">
          <div className="nav-container">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setView("landing");
              }}
              aria-label="Beranda Railuma"
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 -ml-2.5 border-0 bg-transparent text-left text-[var(--text)] transition-all duration-200 hover:bg-[var(--surface-sunken)] cursor-pointer"
            >
              <BrandMark className="transition-transform duration-200 group-hover:scale-105" />
              <span className="text-[1.2rem] font-extrabold tracking-tight transition-colors duration-200 group-hover:text-[var(--primary)]">
                Railuma
              </span>
            </button>

            <nav
              aria-label="Navigasi publik"
              className="hidden md:flex items-center gap-1.5"
            >
              {view === "landing" ? (
                <>
                  <a
                    href="#cara-kerja"
                    className="rounded-lg px-3.5 py-2 text-[0.92rem] font-semibold text-muted-theme no-underline transition-all duration-200 hover:text-[var(--text)] hover:bg-[var(--surface-sunken)] hover:shadow-xs active:scale-[0.98]"
                  >
                    Cara Kerja
                  </a>
                  <a
                    href="#fitur-studio"
                    className="rounded-lg px-3.5 py-2 text-[0.92rem] font-semibold text-muted-theme no-underline transition-all duration-200 hover:text-[var(--text)] hover:bg-[var(--surface-sunken)] hover:shadow-xs active:scale-[0.98]"
                  >
                    Instrumen
                  </a>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setView("landing")}
                  className="rounded-lg px-3.5 py-2 text-[0.92rem] font-semibold text-muted-theme border-0 bg-transparent transition-all duration-200 hover:text-[var(--text)] hover:bg-[var(--surface-sunken)] cursor-pointer active:scale-[0.98]"
                >
                  Halaman Depan
                </button>
              )}
              {currentUser && (
                <button
                  type="button"
                  onClick={() => setView("studio")}
                  className="rounded-lg px-3.5 py-2 text-[0.92rem] font-bold text-[var(--primary)] border-0 bg-transparent transition-all duration-200 hover:bg-[var(--surface-sunken)] cursor-pointer active:scale-[0.98]"
                >
                  Buka Aplikasi
                </button>
              )}
            </nav>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDarkMode((d) => {
                    const next = !d;
                    announce(
                      next
                        ? "Tema malam diaktifkan."
                        : "Tema siang diaktifkan.",
                    );
                    return next;
                  });
                }}
                aria-pressed={darkMode}
                aria-label={
                  darkMode ? "Ganti ke tema siang" : "Ganti ke tema malam"
                }
                className="btn btn-secondary btn-sm"
              >
                {darkMode ? (
                  <Sun size={16} aria-hidden="true" />
                ) : (
                  <Moon size={16} aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {darkMode ? "Siang" : "Malam"}
                </span>
              </button>

              {currentUser ? (
                <button
                  type="button"
                  onClick={() => setView("studio")}
                  className="btn btn-primary btn-sm hidden sm:inline-flex"
                >
                  <span>Buka Aplikasi</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth("login")}
                    className="btn btn-secondary btn-sm hidden sm:inline-flex"
                  >
                    <LogIn size={15} aria-hidden="true" />
                    <span>Masuk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth("login")}
                    className="btn btn-primary btn-sm hidden sm:inline-flex"
                  >
                    <span>Mulai Pindai</span>
                  </button>
                </>
              )}

              {/* Tombol Hamburger Khusus Seluler */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px] min-w-[44px]"
              >
                {mobileMenuOpen ? (
                  <X size={19} aria-hidden="true" />
                ) : (
                  <Menu size={19} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Laci Navigasi Seluler Halaman Depan */}
          {mobileMenuOpen && (
            <div
              className="md:hidden border-b border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4 shadow-md animate-in slide-in-from-top-1 duration-150"
              role="dialog"
              aria-modal="true"
              aria-label="Menu navigasi seluler"
            >
              <div className="flex flex-col gap-2">
                <a
                  href="#cara-kerja"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-sunken)] transition-colors no-underline min-h-[44px]"
                >
                  <span>Cara Kerja</span>
                  <ArrowRight size={15} className="text-muted-theme" aria-hidden="true" />
                </a>

                <a
                  href="#fitur-studio"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-sunken)] transition-colors no-underline min-h-[44px]"
                >
                  <span>Instrumen & Alat</span>
                  <ArrowRight size={15} className="text-muted-theme" aria-hidden="true" />
                </a>

                <div className="h-px bg-[var(--border-subtle)] my-1" />

                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setView("studio");
                    }}
                    className="btn btn-primary w-full !justify-center !min-h-[44px]"
                  >
                    <span>Buka Studio Aplikasi</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenAuth("login")}
                      className="btn btn-secondary w-full !justify-center !min-h-[44px]"
                    >
                      <LogIn size={16} aria-hidden="true" />
                      <span>Masuk ke Akun</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAuth("register")}
                      className="btn btn-primary w-full !justify-center !min-h-[44px]"
                    >
                      <span>Daftar Akun Baru</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        <main id="isi" tabIndex={-1} className="flex flex-1 flex-col">
          {view === "landing" ? (
            <LandingView onOpenAuth={handleOpenAuth} healthInfo={healthInfo} />
          ) : (
            <AuthCard
              key={authMode}
              initialMode={authMode}
              onBackToLanding={() => setView("landing")}
              onAuthenticated={(user) => {
                setCurrentUser(user);
                setNavId("scan");
                setView("studio");
              }}
            />
          )}
        </main>

        <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface)] py-6 text-[0.85rem]">
          <div className="wrap-sky flex flex-wrap items-center justify-between gap-3 text-muted-theme">
            <span className="font-semibold text-[var(--text)]">
              Railuma · Ruang Kerja &amp; Pembaca Optik Braille
            </span>
            <span>
              Foto: Lance Vanlewen (CC BY-SA 4.0), Trixia Lao (CC0), M Joko
              Apriyo Putro (CC BY-SA 4.0), melalui Wikimedia Commons.
            </span>
          </div>
        </footer>
      </div>
    );
  }

  // ============================================================================
  // KERANGKA 2: RUANG KERJA DENGAN SIDEBAR & BREADCRUMB FUNGSIONAL (Operate Mode)
  // ============================================================================
  const isScannerSubView =
    navId === "beranda" || navId === "scan" || navId === "sesi";
  const firstName = (currentUser.name || currentUser.email || "Pengguna").split(
    " ",
  )[0];
  const initials = (currentUser.name || currentUser.email || "P")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh flex bg-[var(--bg)]">
      <a className="skip-link" href="#isi">
        Lewati ke isi utama
      </a>

      {/* Wilayah Pengumuman Pembaca Layar Terkendali */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message || "Siap digunakan."}
      </div>

      {/* 1. SIDEBAR DESKTOP (Sticky & Mewah di Sisi Kiri Layar) */}
      <aside
        className="workspace-sidebar hidden lg:flex"
        aria-label="Navigasi instrumen utama"
      >
        <SidebarContent
          currentNavId={navId}
          onSelectNav={handleSelectNav}
          currentUser={currentUser}
          firstName={firstName}
          initials={initials}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          highContrast={highContrast}
          setHighContrast={setHighContrast}
          onLogout={handleLogout}
          onGoHome={() => setView("landing")}
          announce={announce}
        />
      </aside>

      {/* 2. SIDEBAR DRAWER UNTUK SELULER & TABLET (Hanya Aktif di < 1024px) */}
      {mobileMenuOpen && (
        <div className="lg:hidden">
          <div
            className="sheet-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="mobile-sidebar-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi instrumen"
          >
            <SidebarContent
              currentNavId={navId}
              onSelectNav={handleSelectNav}
              currentUser={currentUser}
              firstName={firstName}
              initials={initials}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              highContrast={highContrast}
              setHighContrast={setHighContrast}
              onLogout={handleLogout}
              onGoHome={() => {
                setMobileMenuOpen(false);
                setView("landing");
              }}
              onCloseMobile={() => setMobileMenuOpen(false)}
              announce={announce}
            />
          </aside>
        </div>
      )}

      {/* 3. AREA KERJA UTAMA & BREADCRUMB */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-8">
        {/* BILAH ATAS KERJA: BREADCRUMB FUNGSIONAL & DAPAT DIKLIK */}
        <header className="workspace-topbar">
          <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              {/* Tombol hamburger menu HANYA untuk seluler */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileMenuOpen(true);
                }}
                className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-sunken)] transition-colors"
                aria-label="Buka menu navigasi instrumen"
              >
                <Menu size={18} aria-hidden="true" />
              </button>

              {/* BREADCRUMB FUNGSIONAL & JELAS (Bebas Bug Blur) */}
              <nav
                aria-label="Navigasi remah roti"
                className="flex items-center gap-1.5 sm:gap-2 text-[0.86rem] sm:text-[0.88rem]"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileMenuOpen(false);
                    handleSelectNav("beranda");
                  }}
                  className="font-medium text-muted-theme hover:text-[var(--text)] transition-colors border-0 bg-transparent px-2 py-1 rounded-md hover:bg-[var(--surface-sunken)] cursor-pointer"
                  title="Kembali ke Beranda Ruang Kerja"
                >
                  Ruang Kerja
                </button>
                <span
                  className="text-muted-theme/40 text-[0.75rem]"
                  aria-hidden="true"
                >
                  /
                </span>
                <span
                  className="font-bold text-[var(--text)] px-1 py-1"
                  aria-current="page"
                >
                  {currentNavItem.label}
                </span>
              </nav>
            </div>

            {/* Kontrol Cepat di Sisi Kanan Bilah Atas */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowTour(true)}
                title="Buka panduan pengguna interaktif"
                className="btn btn-secondary btn-sm !px-2.5 sm:!px-3 text-xs"
              >
                <HelpCircle size={15} aria-hidden="true" />
                <span className="hidden sm:inline">Panduan</span>
              </button>

              {navId !== "scan" && (
                <button
                  type="button"
                  onClick={() => handleSelectNav("scan")}
                  className="btn btn-primary btn-sm hidden sm:inline-flex"
                >
                  <ScanLine size={15} aria-hidden="true" />
                  <span>Ruang Scan</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setDarkMode((d) => {
                    const next = !d;
                    announce(
                      next
                        ? "Tema malam diaktifkan."
                        : "Tema siang diaktifkan.",
                    );
                    return next;
                  });
                }}
                aria-pressed={darkMode}
                aria-label={
                  darkMode ? "Ganti ke tema siang" : "Ganti ke tema malam"
                }
                title={darkMode ? "Tema Siang" : "Tema Malam"}
                className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                {darkMode ? (
                  <Sun size={16} aria-hidden="true" />
                ) : (
                  <Moon size={16} aria-hidden="true" />
                )}
              </button>

              <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--on-primary)] text-[0.74rem] font-bold">
                  {initials}
                </span>
                <span className="hidden xl:inline text-[0.82rem] font-semibold text-[var(--text)] max-w-[120px] truncate">
                  {firstName}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* KONTEN UTAMA DENGAN TRANSISI HALUS */}
        <main
          id="isi"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto"
        >
          <div key={navId} className="page-fade-enter">
            {/* Judul halaman */}
            {navId === "beranda" ? (
              <div className="mb-6 flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-[0.82rem] font-semibold text-muted-theme">
                    Ruang Kerja Railuma · {getTimeGreeting()}
                  </span>
                  <h1 className="m-0 mt-1 text-[1.65rem] sm:text-[2.1rem] font-extrabold tracking-tight text-[var(--text)]">
                    Selamat datang, {firstName}.
                  </h1>
                  <p className="m-0 mt-1 max-w-[56ch] text-[0.88rem] leading-relaxed text-muted-theme">
                    Lanjutkan pemindaian tulisan Braille, evaluasi lembar tugas
                    murid, atau telusuri riwayat sesi Anda.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectNav("sesi")}
                    className="btn btn-secondary btn-sm"
                  >
                    <History size={15} aria-hidden="true" />
                    <span>Riwayat Sesi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectNav("scan")}
                    className="btn btn-primary btn-sm"
                  >
                    <ScanLine size={15} aria-hidden="true" />
                    <span>Mulai Pindai</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
                <div>
                  <h1 className="heading-app m-0">{currentNavItem.title}</h1>
                  <p className="m-0 mt-0.5 text-[0.88rem] text-muted-theme">
                    {currentNavItem.hint}
                  </p>
                </div>

                {navId !== "scan" && (
                  <button
                    type="button"
                    onClick={() => handleSelectNav("scan")}
                    className="btn btn-primary btn-sm"
                  >
                    <ScanLine size={16} aria-hidden="true" />
                    <span>Buka Ruang Scan</span>
                  </button>
                )}
              </div>
            )}

            {isScannerSubView && (
              <BrailleScanner
                currentUser={currentUser}
                subView={navId}
                onChangeSubView={(next) => setNavId(next)}
                healthInfo={healthInfo}
                onAuthExpired={() => {
                  clearAuthSession();
                  setCurrentUser(null);
                  setView("auth");
                }}
              />
            )}

            {navId === "tugas" && <HomeworkCorrector />}

            {navId === "konversi" && <VoiceTranslator />}

            {navId === "pengaturan" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <section
                  aria-labelledby="judul-pengaturan-optik"
                  className="card flex flex-col gap-4 lg:col-span-6"
                >
                  <div className="border-b border-[var(--border-subtle)] pb-3">
                    <h2
                      id="judul-pengaturan-optik"
                      className="m-0 text-[1.1rem] font-bold"
                    >
                      Kamera, Optik, &amp; Pembaca Layar
                    </h2>
                    <p className="m-0 mt-1 text-[0.86rem] text-muted-theme">
                      Perubahan langsung tersimpan di perangkat Anda.
                    </p>
                  </div>

                  <label className="radio-card">
                    <input
                      type="checkbox"
                      checked={clahe}
                      onChange={(e) => {
                        setClahe(e.target.checked);
                        try {
                          localStorage.setItem(
                            CLAHE_KEY,
                            e.target.checked ? "1" : "0",
                          );
                        } catch {
                          // abaikan
                        }
                        announce(
                          e.target.checked
                            ? "Pemerataan kontras CLAHE diaktifkan."
                            : "Pemerataan kontras CLAHE dimatikan.",
                        );
                      }}
                    />
                    <span>
                      <strong>Ratakan cahaya foto (CLAHE)</strong>
                      <br />
                      <span className="text-[0.86rem] text-muted-theme">
                        Membantu memperjelas bayangan titik timbul ketika
                        pencahayaan ruangan kurang merata.
                      </span>
                    </span>
                  </label>

                  <label className="radio-card">
                    <input
                      type="checkbox"
                      checked={voiceOn}
                      onChange={(e) => setVoiceOn(e.target.checked)}
                    />
                    <span>
                      <strong>Suara pengumuman bawaan (TTS)</strong>
                      <br />
                      <span className="text-[0.86rem] text-muted-theme">
                        Matikan bila Anda sudah menggunakan pembaca layar
                        seperti NVDA atau VoiceOver.
                      </span>
                    </span>
                  </label>
                </section>

                <section
                  aria-labelledby="judul-pengaturan-tampilan"
                  className="card flex flex-col gap-4 lg:col-span-6"
                >
                  <div className="border-b border-[var(--border-subtle)] pb-3">
                    <h2
                      id="judul-pengaturan-tampilan"
                      className="m-0 text-[1.1rem] font-bold"
                    >
                      Tampilan &amp; Privasi Data
                    </h2>
                    <p className="m-0 mt-1 text-[0.86rem] text-muted-theme">
                      Kendalikan tema kontras serta izin penyimpanan gambar
                      sesi.
                    </p>
                  </div>

                  <label className="radio-card">
                    <input
                      type="checkbox"
                      checked={highContrast}
                      onChange={(e) => setHighContrast(e.target.checked)}
                    />
                    <span>
                      <strong>Mode kontras tinggi</strong>
                      <br />
                      <span className="text-[0.86rem] text-muted-theme">
                        Menaikkan seluruh garis batas ke warna tinta penuh agar
                        lebih tegas.
                      </span>
                    </span>
                  </label>

                  <label className="radio-card">
                    <input
                      type="checkbox"
                      checked={saveImage}
                      onChange={(e) => {
                        setSaveImage(e.target.checked);
                        try {
                          localStorage.setItem(
                            SAVE_IMAGE_KEY,
                            e.target.checked ? "1" : "0",
                          );
                        } catch {
                          // abaikan
                        }
                        announce(
                          e.target.checked
                            ? "Penyimpanan thumbnail gambar ke sesi diaktifkan."
                            : "Penyimpanan gambar dimatikan.",
                        );
                      }}
                    />
                    <span>
                      <strong>Simpan pratinjau gambar di sesi</strong>
                      <br />
                      <span className="text-[0.86rem] text-muted-theme">
                        Secara bawaan mati agar hanya teks dan koordinat sel
                        yang disimpan.
                      </span>
                    </span>
                  </label>

                  <label className="radio-card">
                    <input
                      type="checkbox"
                      checked={datasetConsent}
                      onChange={(e) => {
                        setDatasetConsent(e.target.checked);
                        try {
                          localStorage.setItem(
                            DATASET_CONSENT_KEY,
                            e.target.checked ? "1" : "0",
                          );
                        } catch {
                          // abaikan
                        }
                        announce(
                          e.target.checked
                            ? "Izin kontribusi koreksi ke dataset diaktifkan."
                            : "Izin kontribusi koreksi ke dataset dimatikan.",
                        );
                      }}
                    />
                    <span>
                      <strong>
                        Sumbangkan koreksi huruf untuk pelatihan model
                      </strong>
                      <br />
                      <span className="text-[0.86rem] text-muted-theme">
                        Boleh dipakai untuk melatih model? Hanya jika Anda
                        setuju dan bisa dicabut kapan saja.
                      </span>
                    </span>
                  </label>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bilah Tab Bawah untuk HP */}
      <nav
        aria-label="Navigasi bawah perangkat seluler"
        className="mobile-bottom-bar"
      >
        <button
          type="button"
          aria-current={navId === "beranda" ? "page" : undefined}
          onClick={() => handleSelectNav("beranda")}
          className="mobile-tab-btn"
        >
          <Home size={19} aria-hidden="true" />
          <span>Beranda</span>
        </button>
        <button
          type="button"
          aria-current={navId === "scan" ? "page" : undefined}
          onClick={() => handleSelectNav("scan")}
          className="mobile-tab-btn"
        >
          <ScanLine size={19} aria-hidden="true" />
          <span>Scan</span>
        </button>
        <button
          type="button"
          aria-current={navId === "sesi" ? "page" : undefined}
          onClick={() => handleSelectNav("sesi")}
          className="mobile-tab-btn"
        >
          <History size={19} aria-hidden="true" />
          <span>Sesi</span>
        </button>
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="mobile-tab-btn"
        >
          <Menu size={19} aria-hidden="true" />
          <span>Lainnya</span>
        </button>
      </nav>
      <OnboardingTour isOpen={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <A11yProvider>
          <Shell />
        </A11yProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
