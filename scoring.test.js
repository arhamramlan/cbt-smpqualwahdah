// Jalankan: node scoring.test.js   (tidak butuh Firebase / browser)
import assert from 'node:assert/strict';
import { layoutCards } from './card-layout.js';
import { scoreItem, computeResult, buildOrder, buildOptOrder, isFilled, scaleWeights } from './scoring.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✔', name); };

t('PG benar/salah/kosong', () => {
  const q = { type: 'PG', key: 'C', score: 2 };
  assert.equal(scoreItem(q, 'C'), 2); assert.equal(scoreItem(q, 'c'), 2);
  assert.equal(scoreItem(q, 'A'), 0); assert.equal(scoreItem(q, ''), 0); assert.equal(scoreItem(q, undefined), 0);
});
t('PGK parsial: benar dikurangi salah', () => {
  const q = { type: 'PGK', key: ['A', 'C', 'D'], score: 3 };
  assert.equal(scoreItem(q, ['A', 'C', 'D']), 3);
  assert.equal(scoreItem(q, ['A', 'C']), 2);            // 2 benar dari 3
  assert.equal(scoreItem(q, ['A', 'B']), 0);            // 1 benar - 1 salah
  assert.equal(scoreItem(q, ['B']), 0);                 // tidak boleh negatif
});
t('BS', () => { const q = { type: 'BS', key: 'BENAR', score: 2 }; assert.equal(scoreItem(q, 'benar'), 2); assert.equal(scoreItem(q, 'SALAH'), 0); });
t('ISIAN: variasi & spasi', () => {
  const q = { type: 'ISIAN', key: 'zabur|Kitab Zabur', score: 4 };
  assert.equal(scoreItem(q, '  ZABUR '), 4); assert.equal(scoreItem(q, 'kitab   zabur'), 4); assert.equal(scoreItem(q, 'injil'), 0);
});
t('JODOH parsial per pasangan', () => {
  const q = { type: 'JODOH', pairs: [{}, {}, {}, {}], score: 8 };
  assert.equal(scoreItem(q, ['0', '1', '2', '3']), 8);
  assert.equal(scoreItem(q, ['0', '1', '3', '2']), 4);
  assert.equal(scoreItem(q, ['', '', '', '']), 0);
});
t('computeResult: otomatis + uraian pending + manual', () => {
  const qs = [{ type: 'PG', key: 'A', score: 2 }, { type: 'URAIAN', score: 6 }, { type: 'BS', key: 'SALAH', score: 2 }];
  let r = computeResult(qs, { 0: 'A', 1: 'jawaban', 2: 'BENAR' }, {});
  assert.deepEqual([r.auto, r.man, r.max, r.pending, r.pct], [2, 0, 10, 1, 20]);
  r = computeResult(qs, { 0: 'A', 1: 'jawaban', 2: 'BENAR' }, { 1: 4 });
  assert.deepEqual([r.auto, r.man, r.pending, r.pct], [2, 4, 0, 60]);
  r = computeResult(qs, {}, {});                         // uraian kosong tidak pending
  assert.equal(r.pending, 0); assert.equal(r.pct, 0);
});
t('koreksi manual menimpa ISIAN otomatis', () => {
  const qs = [{ type: 'ISIAN', key: 'a', score: 4 }];
  const r = computeResult(qs, { 0: 'b' }, { 0: 3 });
  assert.equal(r.auto, 0); assert.equal(r.man, 3); assert.equal(r.pct, 75);
});
t('paket kosong tidak error', () => assert.equal(computeResult([], {}, {}).pct, 0));
t('isFilled', () => { assert.ok(!isFilled([])); assert.ok(!isFilled(['', ''])); assert.ok(isFilled(['', '1'])); assert.ok(!isFilled('  ')); });

t('buildOrder: tanpa acak = urutan asli', () => assert.deepEqual(buildOrder([{}, {}, {}], false), [0, 1, 2]));
t('buildOrder: tanpa acak, soal satu bacaan tetap dikumpulkan berdampingan', () => {
  const qs = [{ passageId: 'p' }, {}, { passageId: 'p' }, { passageId: 'q' }, {}, { passageId: 'q' }];
  assert.deepEqual(buildOrder(qs, false), [0, 2, 1, 3, 5, 4]);
});
t('buildOrder: soal bacaan tetap berurutan dan satu blok', () => {
  const qs = [{}, { passageId: 'p' }, {}, { passageId: 'p' }, { passageId: 'p' }, {}];
  for (let k = 0; k < 200; k++) {
    const o = buildOrder(qs, true), pos = [1, 3, 4].map((i) => o.indexOf(i));
    assert.deepEqual([...o].sort(), [0, 1, 2, 3, 4, 5]);
    assert.ok(pos[0] < pos[1] && pos[1] < pos[2] && pos[2] - pos[0] === 2, `blok bacaan rusak: ${o}`);
  }
});
t('buildOrder: soal fixed tetap di posisinya', () => {
  const qs = [{ fixed: true }, {}, {}, {}, { fixed: true }];
  for (let k = 0; k < 100; k++) { const o = buildOrder(qs, true); assert.equal(o[0], 0); assert.equal(o[4], 4); }
});
t('buildOptOrder: JODOH selalu diacak, PG sesuai flag', () => {
  const qs = [{ type: 'PG', options: ['a', 'b', 'c'] }, { type: 'JODOH', pairs: [{}, {}, {}] }];
  const a = buildOptOrder(qs, false); assert.ok(!(0 in a)); assert.equal(a[1].length, 3);
  assert.equal(buildOptOrder(qs, true)[0].length, 3);
});
const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
t('scaleWeights: total tepat 100, perbandingan tetap', () => {
  assert.deepEqual(scaleWeights([2, 2, 2, 2, 2]), [20, 20, 20, 20, 20]);
  assert.deepEqual(scaleWeights([2, 3, 5]), [20, 30, 50]);
  const w = scaleWeights([1, 1, 1]); assert.equal(sum(w), 100); assert.deepEqual(w.slice().sort(), [33.33, 33.33, 33.34]);
});
t('scaleWeights: jumlah selalu 100 untuk berbagai paket', () => {
  for (const arr of [[2, 3, 2, 5, 3, 3, 2], Array(7).fill(2), Array(40).fill(1), Array(33).fill(3), [1, 99, 7]]) {
    const w = scaleWeights(arr); assert.equal(sum(w), 100); assert.ok(w.every((x) => x > 0));
  }
});
t('semua benar → nilai 100 walau total bobot bukan 100', () => {
  const qs = [{ type: 'PG', key: 'A', score: 2 }, { type: 'BS', key: 'BENAR', score: 3 }, { type: 'ISIAN', key: 'x', score: 5 }];
  assert.equal(computeResult(qs, { 0: 'A', 1: 'BENAR', 2: 'x' }, {}).pct, 100);
  assert.equal(computeResult(scaleWeights(qs.map((q) => q.score)).map((s, i) => ({ ...qs[i], score: s })), { 0: 'A', 1: 'BENAR', 2: 'x' }, {}).pct, 100);
});
t('layoutCards: 2 kolom, tidak melewati batas halaman, halaman baru bila penuh', () => {
  const pos = layoutCards(Array(12).fill(0.5));
  assert.equal(pos[0].x, 10); assert.ok(pos[1].x > pos[0].x && pos[1].y === pos[0].y);
  assert.ok(pos.every((p) => p.y + p.h <= 287.001), 'ada kartu melewati margin bawah');
  assert.equal(pos.filter((p) => p.page === 0).length, 10); assert.equal(pos[10].page, 1); assert.equal(pos[10].y, 10);
});
t('layoutCards: kartu lebih tinggi pada satu baris tidak membuat baris terpotong', () => {
  const pos = layoutCards([0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5]);
  assert.ok(pos.every((p) => p.y + p.h <= 287.001));
});
t('layoutCards: kartu ganjil dan daftar kosong', () => { assert.equal(layoutCards([0.5, 0.5, 0.5]).length, 3); assert.deepEqual(layoutCards([]), []); });
console.log(`\n${n} pengujian lulus.`);
