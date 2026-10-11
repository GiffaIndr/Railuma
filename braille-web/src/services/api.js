const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export const translateBrailleImage = async (imageBlob) => {
  const formData = new FormData();
  formData.append('file', imageBlob, 'braille-capture.jpg');

  const response = await fetch(`${API_URL}/translate/`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Gagal menghubungi server FastAPI.');
  }

  return response.json();
};