const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const CLAHE_KEY = 'railuma-clahe';

// Pengaturan "Ratakan cahaya" (CLAHE) disimpan di browser
export const isClaheOn = () => {
  try {
    return localStorage.getItem(CLAHE_KEY) === '1';
  } catch {
    return false;
  }
};

export const translateBrailleImage = async (imageBlob) => {
  const formData = new FormData();
  formData.append('file', imageBlob, 'braille-capture.jpg');

  const query = isClaheOn() ? '?clahe=true' : '';
  // Batalkan jika server tidak menjawab dalam 20 detik agar pindai otomatis tidak menggantung
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(`${API_URL}/translate/${query}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error('Gagal menghubungi server FastAPI.');
  }

  return response.json();
};
