const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Cocokkan jawaban murid dengan kunci.
// - Kunci lebih dari satu baris: satu baris = satu nomor soal.
// - Kunci satu baris: tiap kata = satu nomor.
export const gradeAnswers = (keyText, studentRaw) => {
  const keyLines = keyText.split("\n").map(norm).filter(Boolean);
  const byLine = keyLines.length > 1;
  const keyItems = byLine ? keyLines : norm(keyText).split(" ").filter(Boolean);
  const studentItems = byLine
    ? studentRaw.split("\n").map(norm).filter(Boolean)
    : norm(studentRaw).split(" ").filter(Boolean);

  const rows = keyItems.map((expected, i) => {
    const got = studentItems[i] ?? "";
    return { number: i + 1, expected, got, ok: got === expected };
  });
  const correct = rows.filter((r) => r.ok).length;
  return { rows, total: rows.length, correct, wrong: rows.filter((r) => !r.ok).map((r) => r.number) };
};

