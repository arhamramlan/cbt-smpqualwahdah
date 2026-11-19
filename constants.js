// constants.js — data konstan yang dipakai banyak modul (ubah di sini saja)
export const TYPES = ['PG', 'PGK', 'BS', 'ISIAN', 'URAIAN', 'JODOH'];
export const LETTERS = 'ABCDEF';
export const DIFFICULTY = ['Mudah', 'Sedang', 'Sulit'];
export const TYPE_LABEL = { PG: 'Pilihan Ganda', PGK: 'PG Kompleks', BS: 'Benar / Salah', ISIAN: 'Isian Singkat', URAIAN: 'Uraian', JODOH: 'Menjodohkan' };
export const EXAM_HINT = { PG: 'Pilih satu jawaban', PGK: 'Pilih satu atau lebih jawaban', BS: 'Pilih Benar atau Salah', ISIAN: 'Isi jawaban singkat', URAIAN: 'Jawab dengan uraian', JODOH: 'Pasangkan setiap pernyataan dengan jawaban yang sesuai' };
export const KEY_INFO = {
  PG: ['Kunci (satu huruf)', 'Contoh: C'],
  PGK: ['Kunci (boleh lebih dari satu)', 'Contoh: A,C,D — skor parsial: benar dikurangi salah'],
  BS: ['Kunci', 'Tulis BENAR atau SALAH'],
  ISIAN: ['Jawaban benar', 'Beberapa variasi dipisah tanda | , mis. zabur|Zabur'],
  URAIAN: ['Pedoman jawaban (opsional)', 'Tidak dinilai otomatis — dikoreksi guru'],
  JODOH: ['', 'Skor parsial: tiap pasangan benar mendapat bagian yang sama']
};
export const LIMITS = {
  docBytes: 900000,          // batas aman dokumen Firestore (±1 MB)
  imageMaxPx: 640, imageMaxChars: 150000,
  saveDebounceMs: 1500, violationThrottleMs: 3000, rosterTtlMs: 300000,
  pageSizes: [25, 50, 100], bankRenderMax: 100, maxPairs: 6
};
export const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F]/;
export const PREF_DEFAULTS = { dark: false, fs: 1, ar: 1.25 };
