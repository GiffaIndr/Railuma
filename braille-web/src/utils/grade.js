const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const cleanItem = (s) => norm(s).replace(/^(?:nomor\s*|no\.?\s*|#)?\d+[\.\)\:\-\s]+\s*/i, "").trim();

// Cocokkan jawaban murid dengan kunci.
// - Mendukung format nomor otomatis (1. A, 2. B, dst).
// - Kunci lebih dari satu baris: satu baris = satu nomor soal.
// - Kunci satu baris: tiap kata = satu nomor.
export const gradeAnswers = (keyText, studentRaw) => {
  const keyLines = keyText.split("\n").map(norm).filter(Boolean);
  const byLine = keyLines.length > 1;
  const keyItems = byLine ? keyLines : norm(keyText).split(" ").filter(Boolean);
  const studentItems = byLine
    ? (studentRaw || "").split("\n").map(norm).filter(Boolean)
    : norm(studentRaw || "").split(" ").filter(Boolean);

  const rows = keyItems.map((expected, i) => {
    const got = studentItems[i] ?? "";
    const expClean = cleanItem(expected);
    const gotClean = cleanItem(got);
    const ok = (expClean !== "" && expClean === gotClean) || norm(expected) === norm(got);
    return {
      number: i + 1,
      n: i + 1,
      expected: expClean || expected,
      got: gotClean || got,
      student: gotClean || got,
      ok,
    };
  });
  const correct = rows.filter((r) => r.ok).length;
  return { rows, total: rows.length, correct, wrong: rows.filter((r) => !r.ok).map((r) => r.number) };
};

