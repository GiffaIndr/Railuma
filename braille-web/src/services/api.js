export const API_URL = (() => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    if (!isLocalhost) {
      // Saat diakses via Vercel / domain publik (misal di HP),
      // selalu gunakan path relatif ("") agar melalui reverse proxy Vercel ke backend.
      const envUrl = (import.meta.env.VITE_API_URL || "").trim();
      if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
        return envUrl.replace(/\/$/, "");
      }
      return "";
    }
  }

  if (import.meta.env.DEV) {
    if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return `http://${window.location.hostname}:8000`;
    }
    return import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  }

  const envUrl = (import.meta.env.VITE_API_URL || "").trim();
  if (envUrl.includes("localhost") || envUrl.includes("127.0.0.1")) {
    return "";
  }
  return envUrl.replace(/\/$/, "");
})();

export const SUPABASE_URL = "https://rkcvkddbccpmhodryspm.supabase.co";
export const CLAHE_KEY = "railuma-clahe";
export const SAVE_IMAGE_KEY = "railuma-save-image";
export const DATASET_CONSENT_KEY = "railuma-dataset-consent";
export const AUTH_TOKEN_KEY = "railuma-auth-token";
export const AUTH_REFRESH_KEY = "railuma-refresh-token";
export const AUTH_USER_KEY = "railuma-auth-user";

export const signInWithGoogle = async () => {
  if (typeof window === "undefined") return;
  try {
    const p = await fetchAuthProviders();
    if (!p?.google) {
      alert("Masuk dengan Google belum diaktifkan di dasbor Supabase proyek ini. Silakan gunakan email dan kata sandi.");
      return;
    }
  } catch {
    // abaikan jika jaringan lambat
  }
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
};

export const fetchAuthProviders = async () => {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/providers`);
    if (!res.ok) return { google: false };
    return await res.json();
  } catch {
    return { google: false };
  }
};

export const parseOAuthHash = () => {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.substring(1)
    : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  return {
    access_token: accessToken,
    refresh_token: params.get("refresh_token") || "",
    expires_in: params.get("expires_in") || "",
  };
};

export const getAuthToken = () => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const getRefreshToken = () => {
  try {
    return localStorage.getItem(AUTH_REFRESH_KEY) || sessionStorage.getItem(AUTH_REFRESH_KEY) || "";
  } catch {
    return "";
  }
};

export const getSavedUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setAuthSession = (token, user, remember = true, refreshToken = "") => {
  try {
    const primaryStorage = remember ? localStorage : sessionStorage;
    const secondaryStorage = remember ? sessionStorage : localStorage;

    if (token) {
      primaryStorage.setItem(AUTH_TOKEN_KEY, token);
      secondaryStorage.removeItem(AUTH_TOKEN_KEY);
    }
    if (refreshToken) {
      primaryStorage.setItem(AUTH_REFRESH_KEY, refreshToken);
      secondaryStorage.removeItem(AUTH_REFRESH_KEY);
    }
    if (user) {
      primaryStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      secondaryStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // abaikan
  }
};

export const clearAuthSession = () => {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_REFRESH_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_REFRESH_KEY);
    sessionStorage.removeItem(AUTH_USER_KEY);
  } catch {
    // abaikan
  }
};

export const isClaheOn = () => {
  try {
    return localStorage.getItem(CLAHE_KEY) === "1";
  } catch {
    return false;
  }
};

export const isSaveImageOn = () => {
  try {
    return localStorage.getItem(SAVE_IMAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const isDatasetConsentOn = () => {
  try {
    return localStorage.getItem(DATASET_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};

export const getWsBaseUrl = () => {
  if (API_URL) {
    const base = API_URL.replace(/\/$/, "");
    if (base.startsWith("https://")) return base.replace("https://", "wss://");
    if (base.startsWith("http://")) return base.replace("http://", "ws://");
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
  return "ws://127.0.0.1:8000";
};

export function translateAuthErrorMessage(msg) {
  if (!msg) return "Gagal memproses autentikasi akun.";
  const low = String(msg).trim().toLowerCase();
  if (low.includes("invalid login credentials") || low.includes("invalid_grant")) {
    return "Email atau kata sandi salah. Periksa lagi lalu coba masuk kembali.";
  }
  if (low.includes("email not confirmed")) {
    return "Alamat email belum dikonfirmasi. Periksa kotak masuk email Anda.";
  }
  if (low.includes("user already registered") || low.includes("already registered") || low.includes("already exists")) {
    return "Alamat email ini sudah terdaftar. Silakan masuk menggunakan kata sandi Anda.";
  }
  if (low.includes("password should be at least")) {
    return "Kata sandi minimal harus 6 karakter.";
  }
  if (low.includes("rate limit") || low.includes("too many requests")) {
    return "Terlalu banyak percobaan masuk dalam waktu singkat. Tunggu sebentar lalu coba lagi.";
  }
  if (low.includes("unable to validate email") || low.includes("invalid email")) {
    return "Format alamat email tidak valid. Periksa kembali penulisan email Anda.";
  }
  return msg;
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}, timeoutMs = 35000, isRetry = false, netRetryCount = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const method = (options.method || "GET").toUpperCase();
  const canAutoRetry =
    method === "GET" ||
    url.includes("/translate") ||
    url.includes("/sessions");

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (response.status === 401 && !isRetry && !url.includes("/auth/login") && !url.includes("/auth/refresh")) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            if (refreshed.access_token) {
              const isSessionOnly = Boolean(sessionStorage.getItem(AUTH_TOKEN_KEY));
              setAuthSession(
                refreshed.access_token,
                refreshed.user || getSavedUser(),
                !isSessionOnly,
                refreshed.refresh_token || refreshToken,
              );
              const nextHeaders = { ...(options.headers || {}), Authorization: `Bearer ${refreshed.access_token}` };
              return fetchJson(url, { ...options, headers: nextHeaders }, timeoutMs, true, netRetryCount);
            }
          }
        } catch {
          // lanjut ke penanganan error normal
        }
      }
    }
    if ((response.status === 502 || response.status === 503 || response.status === 504) && canAutoRetry && netRetryCount < 2) {
      clearTimeout(timer);
      await waitMs(netRetryCount === 0 ? 700 : 1500);
      return fetchJson(url, options, timeoutMs, isRetry, netRetryCount + 1);
    }
    if (!response.ok) {
      let detail = `Server merespons dengan status ${response.status}.`;
      try {
        const errBody = await response.json();
        if (errBody.detail) detail = translateAuthErrorMessage(errBody.detail);
      } catch {
        // biarkan pesan status
      }
      const err = new Error(detail);
      err.status = response.status;
      throw err;
    }
    return response.json();
  } catch (err) {
    const isTransientNet =
      err.name === "AbortError" ||
      (err.message && (err.message.toLowerCase().includes("failed to fetch") || err.message.toLowerCase().includes("networkerror")));

    if (isTransientNet && canAutoRetry && netRetryCount < 2) {
      clearTimeout(timer);
      await waitMs(netRetryCount === 0 ? 700 : 1500);
      return fetchJson(url, options, timeoutMs, isRetry, netRetryCount + 1);
    }
    if (err.name === "AbortError") {
      const abortErr = new Error("Server sedang bangun dari mode hemat daya (cold-start). Silakan coba sesaat lagi.");
      abortErr.status = 504;
      throw abortErr;
    }
    if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
      const netErr = new Error("Sedang menghubungkan ulang ke server Railuma. Pastikan koneksi internet aktif lalu coba lagi.");
      netErr.status = 503;
      throw netErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const registerUser = async ({ name = "", email, password, remember = true }) => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  }, 30000);
  if (res.access_token && res.user) {
    setAuthSession(res.access_token, res.user, remember, res.refresh_token || "");
  }
  return res;
};

export const loginUser = async ({ email, password, remember = true }) => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, 30000);
  if (res.access_token && res.user) {
    setAuthSession(res.access_token, res.user, remember, res.refresh_token || "");
  }
  return res;
};

export const fetchCurrentUser = async () => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/me`, {}, 25000);
  if (res.user) {
    const isSessionOnly = Boolean(sessionStorage.getItem(AUTH_TOKEN_KEY));
    setAuthSession(getAuthToken(), res.user, !isSessionOnly, getRefreshToken());
  }
  return res.user;
};

export const logoutUser = async () => {
  try {
    if (getAuthToken()) {
      await fetchJson(`${API_URL}/api/v1/auth/logout`, { method: "POST" }, 15000);
    }
  } catch {
    // tetap hapus token lokal
  } finally {
    clearAuthSession();
  }
};

export const translateBrailleImage = async (imageBlob, checkBlur = false) => {
  const formData = new FormData();
  formData.append("file", imageBlob, "braille-capture.jpg");
  const params = new URLSearchParams();
  if (isClaheOn()) params.append("clahe", "true");
  if (!checkBlur) params.append("check_blur", "false");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return fetchJson(`${API_URL}/translate/${qs}`, {
    method: "POST",
    body: formData,
  }, 45000);
};

export const fetchHealth = async () => fetchJson(`${API_URL}/api/v1/health`, {}, 30000);

export const listSessions = async () => fetchJson(`${API_URL}/api/v1/sessions`, {}, 30000);

export const createSession = async (title = "Sesi Pindai Baru") =>
  fetchJson(`${API_URL}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }, 30000);

export const getSessionDetail = async (sessionId) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {}, 30000);

export const updateSession = async (sessionId, patch) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }, 25000);

export const deleteSession = async (sessionId) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  }, 25000);

export const createSessionScan = async (
  sessionId,
  imageBlob,
  {
    mode = "photo",
    source = "webcam",
    checkBlur = true,
    overrideFinalText = null,
    overrideRawText = null,
    cellsJson = null,
  } = {},
) => {
  const formData = new FormData();
  if (imageBlob instanceof Blob) {
    formData.append("file", imageBlob, "braille-scan.jpg");
  }
  formData.append("mode", mode);
  formData.append("source", source);
  formData.append("clahe", isClaheOn() ? "true" : "false");
  formData.append("check_blur", checkBlur ? "true" : "false");
  formData.append("save_image", isSaveImageOn() ? "true" : "false");
  if (overrideFinalText !== null) formData.append("override_final_text", overrideFinalText);
  if (overrideRawText !== null) formData.append("override_raw_text", overrideRawText);
  if (cellsJson !== null) {
    formData.append("cells_json", typeof cellsJson === "string" ? cellsJson : JSON.stringify(cellsJson));
  }

  return fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/scans`, {
    method: "POST",
    body: formData,
  }, 60000);
};

export const patchScanItem = async (itemId, payload) =>
  fetchJson(`${API_URL}/api/v1/scans/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const deleteSessionScan = async (sessionId, itemId) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}/scans/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });

export const createPairingToken = async (sessionId = null) =>
  fetchJson(`${API_URL}/api/v1/pairing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
