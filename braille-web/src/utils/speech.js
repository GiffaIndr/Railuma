export const speakText = (text, lang = 'id-ID') => {
  if (!('speechSynthesis' in window)) {
    console.warn("Browser tidak mendukung Text-to-Speech");
    return;
  }
  
  window.speechSynthesis.cancel(); // Hentikan suara yang sedang berjalan
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9; // Sedikit lebih lambat agar jelas
  
  window.speechSynthesis.speak(utterance);
};