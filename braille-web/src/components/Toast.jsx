import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ type = "info", title, message, duration = 4000 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast = { id, type, title, message };

      setToasts((prev) => [...prev.slice(-3), newToast]); // Maksimal 4 toast bersamaan

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (message, title = "Berhasil") => addToast({ type: "success", title, message }),
    [addToast],
  );

  const error = useCallback(
    (message, title = "Kendala") => addToast({ type: "error", title, message, duration: 6000 }),
    [addToast],
  );

  const info = useCallback(
    (message, title = "Informasi") => addToast({ type: "info", title, message }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          const bgClass = isSuccess
            ? "bg-[#064E3B] text-white border-[#059669]"
            : isError
              ? "bg-[#7F1D1D] text-white border-[#DC2626]"
              : "bg-[#0B1C33] text-white border-[#1E3A5F]";

          const IconComponent = isSuccess
            ? CheckCircle2
            : isError
              ? AlertCircle
              : Info;

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${bgClass}`}
            >
              <IconComponent className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <p className="text-xs font-bold uppercase tracking-wider opacity-90 mb-0.5">
                    {toast.title}
                  </p>
                )}
                <p className="text-sm font-medium leading-snug break-words">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="p-1 -mr-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback sederhana jika dipakai di luar provider
    return {
      addToast: () => {},
      removeToast: () => {},
      success: (msg) => console.log("[Toast Success]", msg),
      error: (msg) => console.error("[Toast Error]", msg),
      info: (msg) => console.log("[Toast Info]", msg),
    };
  }
  return context;
}
