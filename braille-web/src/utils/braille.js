// Konverter Teks <-> Braille Grade 1 (Standar dasar Indonesia) dan peta pola 6 titik.

export const DOT_PATTERNS = {
  a: "1", b: "12", c: "14", d: "145", e: "15", f: "124", g: "1245",
  h: "125", i: "24", j: "245", k: "13", l: "123", m: "134", n: "1345",
  o: "135", p: "1234", q: "12345", r: "1235", s: "234", t: "2345",
  u: "136", v: "1236", w: "2456", x: "1346", y: "13456", z: "1356",
  1: "1", 2: "12", 3: "14", 4: "145", 5: "15",
  6: "124", 7: "1245", 8: "125", 9: "24", 0: "245",
};

const LETTER_BRAILLE = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
  k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
  u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
};

const DIGIT_BRAILLE = {
  1: "⠁", 2: "⠃", 3: "⠉", 4: "⠙", 5: "⠑",
  6: "⠋", 7: "⠛", 8: "⠓", 9: "⠊", 0: "⠚",
};

const PUNCT_BRAILLE = {
  " ": " ",
  ",": "⠂",
  ";": "⠆",
  ":": "⠒",
  ".": "⠲",
  "?": "⠦",
  "!": "⠖",
  "-": "⠤",
};

const NUMBER_SIGN = "⠼";

export function textToBraille(input = "") {
  return String(input)
    .split("\n")
    .map((line) => {
      let out = "";
      let inNumber = false;
      for (const ch of line) {
        if (ch >= "0" && ch <= "9") {
          if (!inNumber) {
            out += NUMBER_SIGN;
            inNumber = true;
          }
          out += DIGIT_BRAILLE[ch];
          continue;
        }
        inNumber = false;
        const low = ch.toLowerCase();
        if (LETTER_BRAILLE[low]) {
          out += LETTER_BRAILLE[low];
        } else if (PUNCT_BRAILLE[ch] !== undefined) {
          out += PUNCT_BRAILLE[ch];
        } else {
          out += ch;
        }
      }
      return out;
    })
    .join("\n");
}

// Membalik urutan karakter per baris (bukan membalik urutan baris) untuk penulisan reglet
export function reverseLinesForReglet(brailleText = "") {
  return String(brailleText)
    .split("\n")
    .map((line) => [...line].reverse().join(""))
    .join("\n");
}

export function getPatternForSymbol(symbol = "") {
  const s = String(symbol).trim().toLowerCase();
  return DOT_PATTERNS[s] || "";
}
