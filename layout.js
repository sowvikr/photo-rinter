/* Millimetres throughout. Compare mixed-orientation rows and columns. */
(function (root) {
  function pack(width, height, photoWidth, photoHeight, gap, rotate = true) {
    if (![width, height, photoWidth, photoHeight, gap].every(Number.isFinite) ||
        width <= 0 || height <= 0 || photoWidth <= 0 || photoHeight <= 0 || gap < 0) {
      throw new Error('Layout dimensions must be positive and gap must be nonnegative.');
    }
    const eps = 1e-8;
    let best = [];
    function rows(W, H, w, h, transpose) {
      const acrossNormal = Math.floor((W + gap + eps) / (w + gap));
      const acrossRotated = rotate ? Math.floor((W + gap + eps) / (h + gap)) : 0;
      const maxNormal = acrossNormal ? Math.floor((H + gap + eps) / (h + gap)) : 0;
      for (let normal = 0; normal <= maxNormal; normal++) {
        const remaining = H + gap - normal * (h + gap);
        const turned = acrossRotated ? Math.max(0, Math.floor((remaining + eps) / (w + gap))) : 0;
        const count = normal * acrossNormal + turned * acrossRotated;
        if (count <= best.length) continue;
        const result = [];
        let y = 0;
        for (let row = 0; row < normal + turned; row++) {
          const rotated = row >= normal;
          const cellW = rotated ? h : w;
          const cellH = rotated ? w : h;
          const across = rotated ? acrossRotated : acrossNormal;
          for (let col = 0; col < across; col++) {
            const x = col * (cellW + gap);
            result.push(transpose
              ? {x: y, y: x, width: cellH, height: cellW, rotated}
              : {x, y, width: cellW, height: cellH, rotated});
          }
          y += cellH + gap;
        }
        best = result;
      }
    }
    rows(width, height, photoWidth, photoHeight, false);
    rows(height, width, photoHeight, photoWidth, true);
    return best;
  }
  if (typeof module !== 'undefined') module.exports = {pack};
  else root.PhotoLayout = {pack};
})(typeof window !== 'undefined' ? window : globalThis);
