// scoring.js — fungsi murni (tanpa Firebase/DOM) agar mudah diuji: node scoring.test.js
import { LETTERS } from './constants.js';

export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const toArr = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/).filter(Boolean)).map((x) => String(x).toUpperCase());
export function shuffle(a, rnd = Math.random) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// apakah jawaban terisi (string, array PGK, atau array pasangan JODOH)
export function isFilled(a) {
  if (Array.isArray(a)) return a.some((x) => x !== '' && x != null);
  return a != null && String(a).trim() !== '';
}

// skor satu butir (0..bobot). Uraian tidak dinilai otomatis (selalu 0 di sini).
export function scoreItem(q, ans) {
  const max = +q.score || 0;
  if (!isFilled(ans)) return 0;
  switch (q.type) {
    case 'PG': return String(ans).toUpperCase() === String(q.key).toUpperCase() ? max : 0;
    case 'BS': return norm(ans) === norm(q.key) ? max : 0;
    case 'PGK': {
      const keys = toArr(q.key), sel = toArr(ans), hit = sel.filter((k) => keys.includes(k)).length;
      return keys.length ? Math.max(0, (hit - (sel.length - hit)) / keys.length) * max : 0;
    }
    case 'ISIAN': return String(q.key).split('|').map(norm).includes(norm(ans)) ? max : 0;
    case 'JODOH': {
      const n = (q.pairs || []).length; if (!n) return 0;
      const right = (Array.isArray(ans) ? ans : []).filter((v, i) => String(v) === String(i)).length;
      return (right / n) * max;
    }
    default: return 0;
  }
}

export function computeResult(questions, answers = {}, manual = {}) {
  let auto = 0, man = 0, max = 0, pending = 0;
  questions.forEach((q, i) => {
    max += +q.score || 0;
    const m = manual[i];
    if (m != null) man += +m;
    else if (q.type === 'URAIAN') { if (isFilled(answers[i])) pending++; }
    else auto += scoreItem(q, answers[i]);
  });
  return { auto, man, max, pending, pct: max ? Math.round(((auto + man) / max) * 1000) / 10 : 0 };
}
export const resultFields = (r) => ({ scoreAuto: r.auto, scoreManualPts: r.man, maxScore: r.max, pct: r.pct, needsGrading: r.pending > 0 });
export const sessResult = (sched, s) => computeResult(sched.packageSnapshot?.questions || [], s.answers, s.scoreManual);

// urutan soal. Soal sebuah bacaan (passageId sama) selalu menjadi satu blok berurutan — juga tanpa pengacakan,
// agar teks bacaan tidak muncul berulang di tengah soal lain. Blok bertanda `fixed` tetap di posisinya
// saat diacak; blok lain diacak mengisi posisi sisanya.
export function buildOrder(qs, randomize, rnd = Math.random) {
  const blocks = [], byPassage = new Map();
  qs.forEach((q, i) => {
    const p = q.passageId;
    if (p) { if (!byPassage.has(p)) { const b = []; byPassage.set(p, b); blocks.push(b); } byPassage.get(p).push(i); }
    else blocks.push([i]);
  });
  if (!randomize) return blocks.flat();
  const fixed = blocks.map((b) => b.some((i) => qs[i].fixed));
  const free = shuffle(blocks.filter((_, k) => !fixed[k]), rnd);
  let f = 0;
  return blocks.flatMap((b, k) => (fixed[k] ? b : free[f++]));
}
// urutan opsi per soal: PG/PGK diacak bila diminta; JODOH (kolom kanan) selalu diacak
export function buildOptOrder(qs, randomizeOptions, rnd = Math.random) {
  const out = {};
  qs.forEach((q, i) => {
    if ((randomizeOptions && (q.type === 'PG' || q.type === 'PGK')) && q.options?.length) out[i] = shuffle(q.options.map((_, k) => k), rnd);
    if (q.type === 'JODOH' && q.pairs?.length) out[i] = shuffle(q.pairs.map((_, k) => k), rnd);
  });
  return out;
}
export const optionLetter = (k) => LETTERS[k];
