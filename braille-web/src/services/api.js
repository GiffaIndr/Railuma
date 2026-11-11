export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? (typeof window !== "undefined" &&
       window.location.hostname !== "localhost" &&
       window.location.hostname !== "127.0.0.1"
        ? `http://${window.location.hostname}:8000`
        : "http://127.0.0.1:8000")
    : "");

export const SUPABASE_URL = "https://rkcvkddbccpmhodryspm.supabase.co";
export const CLAHE_KEY = "railuma-clahe";
export const SAVE_IMAGE_KEY = "railuma-save-image";
export const DATASET_CONSENT_KEY = "railuma-dataset-consent";
export const AUTH_TOKEN_KEY = "railuma-auth-token";
export const AUTH_USER_KEY = "railuma-auth-user";

export const signInWithGoogle = () => {
  if (typeof window === "undefined") return;
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
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const getSavedUser = () => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setAuthSession = (token, user) => {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
  } catch {
    // abaikan
  }
};

export const clearAuthSession = () => {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
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

async function fetchJson(url, options = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `Server merespons dengan status ${response.status}.`;
      try {
        const errBody = await response.json();
        if (errBody.detail) detail = errBody.detail;
      } catch {
        // biarkan pesan status
      }
      const err = new Error(detail);
      err.status = response.status;
      throw err;
    }
    return response.json();
  } catch (err) {
    if (err.name === "AbortError") {
      const abortErr = new Error("Koneksi ke layanan server memerlukan waktu lebih lama (cold-start). Silakan coba sesaat lagi.");
      abortErr.status = 504;
      throw abortErr;
    }
    if (err.message && err.message.toLowerCase().includes("failed to fetch")) {
      const netErr = new Error("Tidak dapat terhubung ke backend Railuma. Pastikan koneksi internet aktif.");
      netErr.status = 503;
      throw netErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const registerUser = async ({ name = "", email, password }) => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  }, 30000);
  if (res.access_token && res.user) {
    setAuthSession(res.access_token, res.user);
  }
  return res;
};

export const loginUser = async ({ email, password }) => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, 30000);
  if (res.access_token && res.user) {
    setAuthSession(res.access_token, res.user);
  }
  return res;
};

export const fetchCurrentUser = async () => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/me`, {}, 25000);
  if (res.user) {
    setAuthSession(getAuthToken(), res.user);
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

export const translateBrailleImage = async (imageBlob) => {
  const formData = new FormData();
  formData.append("file", imageBlob, "braille-capture.jpg");
  const query = isClaheOn() ? "?clahe=true" : "";
  return fetchJson(`${API_URL}/translate/${query}`, {
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
  } = {},
) => {
  const formData = new FormData();
  formData.append("file", imageBlob, "braille-scan.jpg");
  formData.append("mode", mode);
  formData.append("source", source);
  formData.append("clahe", isClaheOn() ? "true" : "false");
  formData.append("check_blur", checkBlur ? "true" : "false");
  formData.append("save_image", isSaveImageOn() ? "true" : "false");
  if (overrideFinalText !== null) formData.append("override_final_text", overrideFinalText);
  if (overrideRawText !== null) formData.append("override_raw_text", overrideRawText);

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

export const createPairingToken = async (sessionId = null) =>
  fetchJson(`${API_URL}/api/v1/pairing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
