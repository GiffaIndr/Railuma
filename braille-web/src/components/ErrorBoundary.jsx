import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen w-full bg-[#F6F8FB] text-[#0B1C33] flex items-center justify-center p-6 dark:bg-[#081221] dark:text-[#EDF3FB]"
        >
          <div className="max-w-md w-full bg-white dark:bg-[#0F1F36] border border-[#E2E9F2] dark:border-[#1E3A5F] rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#FEE2E2] dark:bg-[#450A0A] text-[#B91C1C] dark:text-[#F87171] flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" aria-hidden="true" />
            </div>

            <h1 className="text-xl font-bold tracking-tight mb-2">
              Terjadi Kendala pada Antarmuka
            </h1>

            <p className="text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed mb-6">
              Aplikasi mengalami galat tak terduga saat memproses tampilan. Data sesi Anda yang tersimpan tetap aman di sistem.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0E4D84] hover:bg-[#09355C] text-white font-medium text-sm transition-colors min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Muat Ulang Halaman
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#CBD5E1] dark:border-[#334155] hover:bg-[#F1F5F9] dark:hover:bg-[#1E293B] text-[#0B1C33] dark:text-[#EDF3FB] font-medium text-sm transition-colors min-h-[44px]"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                Kembali ke Beranda
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
