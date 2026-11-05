// Penstabil hasil pindai otomatis.
// Satu frame bisa salah baca (goyang, bayangan). Dengan memilih hasil yang
// paling sering muncul dari beberapa frame terakhir, teks tidak berkedip dan
// satu frame jelek tidak menimpa hasil bagus.
export const createStabilizer = (size = 5, need = 2) => {
  let buffer = [];

  const vote = () => {
    const count = new Map();
    buffer.forEach((t) => count.set(t, (count.get(t) || 0) + 1));
    let best = buffer[buffer.length - 1];
    let bestN = 0;
    // iterasi dari yang terbaru: jika seri, yang terbaru menang
    for (let i = buffer.length - 1; i >= 0; i--) {
      const n = count.get(buffer[i]);
      if (n > bestN) {
        best = buffer[i];
        bestN = n;
      }
    }
    return { text: best, confirmed: bestN >= need, votes: bestN };
  };

  return {
    push(text) {
      buffer.push(text);
      if (buffer.length > size) buffer.shift();
      return vote();
    },
    reset() {
      buffer = [];
    },
  };
};
