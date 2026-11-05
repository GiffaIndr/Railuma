export const speakText = (text, lang = "id-ID") => {
  if (!("speechSynthesis" in window)) {
    console.warn("Browser tidak mendukung Text-to-Speech");
    return;
  }

  window.speechSynthesis.cancel(); // Hentikan suara yang sedang berjalan

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // Sedikit lebih lambat agar jelas

  window.speechSynthesis.speak(utterance);
};

// "3", "3 dan 7", "3, 7, dan 9"
export const joinIndonesian = (items) => {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
};
