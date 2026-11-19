// Jalankan: node scoring.test.js   (tidak butuh Firebase / browser)
import assert from 'node:assert/strict';
import { scoreItem, computeResult, buildOrder, buildOptOrder, isFilled } from './scoring.js';

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
console.log(`\n${n} pengujian lulus.`);
