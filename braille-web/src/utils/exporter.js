// Cegah teks pengguna ikut dibaca sebagai kode HTML
const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const exportToTXT = (text, filename = "Hasil_Braille.txt") => {
  if (!text) return;
  const element = document.createElement("a");
  const file = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(file);
  element.href = url;
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Buka jendela cetak, lalu pilih "Simpan sebagai PDF".
// Mengembalikan false jika jendela diblokir browser.
export const exportToPDF = (mainText, secondaryText = "", title = "Dokumen Braille", isReglet = false) => {
  if (!mainText) return false;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const content = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #0a2a2b; }
  h1 { color: #1b6566; border-bottom: 3px solid #1b6566; padding-bottom: 10px; margin-bottom: 5px; }
  .meta { font-size: 13px; color: #2f4f50; margin-bottom: 30px; }
  .section { margin-bottom: 25px; }
  .section-title { font-weight: bold; font-size: 14px; color: #2f4f50; margin-bottom: 6px; }
  .braille-box {
    background: #fff0c5; padding: 20px; border-radius: 10px;
    font-size: 36px; letter-spacing: 0.15em; line-height: 1.4;
    border: 2px solid #1b6566; word-break: break-all; white-space: pre-wrap;
    ${isReglet ? "text-align: right;" : ""}
  }
  .braille-box span { display: inline-block; ${isReglet ? "transform: scaleX(-1);" : ""} }
  .text-box { background: #fff; padding: 15px; border-radius: 8px; font-size: 16px; border: 2px solid #1b6566; white-space: pre-wrap; }
  .badge { display: inline-block; background: #0a2a2b; color: #fff0c5; font-size: 13px; padding: 4px 10px; border-radius: 6px; font-weight: bold; margin-bottom: 10px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Dibuat pada: ${escapeHtml(new Date().toLocaleString("id-ID"))} | Railuma</div>
  ${isReglet ? '<div class="badge">MODE REGLET (terbalik, arah tulis kanan ke kiri)</div>' : ""}
  <div class="section">
    <div class="section-title">Hasil:</div>
    <div class="braille-box">${[...mainText].map((c) => (c === "\n" ? "<br>" : `<span>${escapeHtml(c)}</span>`)).join("")}</div>
  </div>
  ${
    secondaryText
      ? `<div class="section"><div class="section-title">Teks asli:</div><div class="text-box">${escapeHtml(secondaryText)}</div></div>`
      : ""
  }
</body>
</html>`;

  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
  return true;
};
