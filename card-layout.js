// card-layout.js — penataan kartu pada halaman PDF (fungsi murni, ada tesnya di scoring.test.js)
// ratios: tinggi/lebar tiap kartu. Hasil: posisi (mm) tiap kartu per halaman, `cols` kolom, kartu tidak terpotong di batas halaman.
export function layoutCards(ratios, { pageW = 210, pageH = 297, margin = 10, gap = 5, cols = 2 } = {}) {
  const w = (pageW - 2 * margin - gap * (cols - 1)) / cols, out = [];
  let page = 0, y = margin, col = 0, rowH = 0;
  ratios.forEach((r, i) => {
    if (col === 0) {                                               // awal baris: pastikan seluruh baris muat di halaman ini
      const rowRatio = Math.max(...ratios.slice(i, i + cols));
      if (y + w * rowRatio > pageH - margin && y > margin) { page++; y = margin; }
    }
    const h = w * r;
    out.push({ page, x: margin + col * (w + gap), y, w, h });
    rowH = Math.max(rowH, h); col++;
    if (col === cols) { col = 0; y += rowH + gap; rowH = 0; }
  });
  return out;
}
