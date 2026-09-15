const assert = require('node:assert/strict');
const {pack} = require('../layout.js');
const {test} = require('node:test');
test('A4 passport sheet fits 31 copies with mixed rows at default spacing', () => {
  assert.equal(pack(200, 287, 35, 45, 2).length, 31);
  assert.equal(pack(200, 287, 35, 45, 2, false).length, 30);
});
test('mixed rows improve over either uniform orientation', () => {
  assert.equal(pack(100, 100, 60, 40, 0).length, 3);
});
test('exact fit and impossible fit', () => {
  assert.equal(pack(70, 90, 35, 45, 0, false).length, 4);
  assert.equal(pack(20, 20, 35, 45, 2).length, 0);
  assert.throws(() => pack(-1, 10, 2, 2, 0));
});
test('layouts stay within bounds without overlaps or changing photo dimensions', () => {
  for (let i = 0; i < 150; i++) {
    const W = 50 + (i * 37 % 400), H = 50 + (i * 61 % 400);
    const w = 10 + (i * 13 % 90), h = 10 + (i * 19 % 90), gap = i % 5;
    for (const rotate of [true, false]) {
      const cells = pack(W, H, w, h, gap, rotate);
      for (const [j, a] of cells.entries()) {
        assert(a.x >= 0 && a.y >= 0 && a.x + a.width <= W + 1e-6 && a.y + a.height <= H + 1e-6);
        assert.equal(a.width, a.rotated ? h : w); assert.equal(a.height, a.rotated ? w : h);
        if (!rotate) assert(!a.rotated);
        for (const b of cells.slice(j + 1)) {
          assert(a.x + a.width + gap <= b.x + 1e-6 || b.x + b.width + gap <= a.x + 1e-6 || a.y + a.height + gap <= b.y + 1e-6 || b.y + b.height + gap <= a.y + 1e-6);
        }
      }
    }
  }
});
