export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

export const CLAHE_KEY = "railuma-clahe";
export const SAVE_IMAGE_KEY = "railuma-save-image";
export const DATASET_CONSENT_KEY = "railuma-dataset-consent";
export const AUTH_TOKEN_KEY = "railuma-auth-token";
export const AUTH_USER_KEY = "railuma-auth-user";

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

async function fetchJson(url, options = {}, timeoutMs = 20000) {
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
  } finally {
    clearTimeout(timer);
  }
}

export const registerUser = async ({ name = "", email, password }) => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
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
  });
  if (res.access_token && res.user) {
    setAuthSession(res.access_token, res.user);
  }
  return res;
};

export const fetchCurrentUser = async () => {
  const res = await fetchJson(`${API_URL}/api/v1/auth/me`, {}, 8000);
  if (res.user) {
    setAuthSession(getAuthToken(), res.user);
  }
  return res.user;
};

export const logoutUser = async () => {
  try {
    if (getAuthToken()) {
      await fetchJson(`${API_URL}/api/v1/auth/logout`, { method: "POST" }, 6000);
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
  });
};

export const fetchHealth = async () => fetchJson(`${API_URL}/api/v1/health`, {}, 6000);

export const listSessions = async () => fetchJson(`${API_URL}/api/v1/sessions`, {}, 10000);

export const createSession = async (title = "Sesi Pindai Baru") =>
  fetchJson(`${API_URL}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

export const getSessionDetail = async (sessionId) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {}, 10000);

export const updateSession = async (sessionId, patch) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

export const deleteSession = async (sessionId) =>
  fetchJson(`${API_URL}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });

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
  });
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
