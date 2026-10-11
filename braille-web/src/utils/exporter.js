export const exportToTXT = (text, filename = "Hasil_Braille.txt") => {
  if (!text) return;
  const element = document.createElement("a");
  const file = new Blob([text], { type: "text/plain;charset=utf-8" });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

// Function untuk Download/Print sebagai Dokumen .PDF
export const exportToPDF = (mainText, secondaryText = "", title = "Dokumen Braille", isReglet = false) => {
  if (!mainText) return;
  
  const printWindow = window.open("", "_blank");
  const content = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Segoe+UI+Symbol&display=swap');
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111; }
          h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; margin-bottom: 5px; }
          .meta { font-size: 12px; color: #666; margin-bottom: 30px; }
          .section { margin-bottom: 25px; }
          .section-title { font-weight: bold; font-size: 13px; text-transform: uppercase; color: #666; margin-bottom: 6px; }
          .braille-box { 
            background: #f4f4f5; 
            padding: 20px; 
            border-radius: 10px; 
            font-size: 36px; 
            letter-spacing: 0.15em; 
            line-height: 1.4; 
            border: 1px solid #e4e4e7;
            word-break: break-all;
            ${isReglet ? 'text-align: right; transform: scaleX(-1); display: block;' : ''}
          }
          .text-box { background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 16px; color: #334155; border: 1px solid #e2e8f0; }
          .badge { display: inline-block; background: #7c3aed; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">Dipindai/Dibuat pada: ${new Date().toLocaleString('id-ID')} | AI Braille Hub</div>
        
        ${isReglet ? '<div class="badge">MODE REGLET (CETAK TERBALIK - Arah Tulis Kanan ke Kiri)</div>' : ''}

        <div class="section">
          <div class="section-title">Hasil Braille:</div>
          <div class="braille-box">${mainText}</div>
        </div>

        ${secondaryText ? `
        <div class="section">
          <div class="section-title">Teks Asli (Bahasa Indonesia):</div>
          <div class="text-box">${secondaryText}</div>
        </div>
        ` : ''}
      </body>
    </html>
  `;

  printWindow.document.write(content);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
};