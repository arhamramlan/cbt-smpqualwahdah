// util.js — helper tampilan yang dipakai modul guru & siswa (butuh window.CBT dari app-core-firebase.js)
import { ARABIC_RE, LIMITS } from './constants.js';

export const { $, esc } = window.CBT;
export const empty = (cols, msg) => `<tr><td colspan="${cols}" class="p-4 text-center text-slate-400">${msg}</td></tr>`;
export const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
export const fmtDT = (ts) => (ts ? window.CBT.fmtDateTime(ts) : '-');
// kelas CSS untuk teks yang mengandung huruf Arab (ukuran bisa diperbesar siswa)
export const arCls = (t) => (ARABIC_RE.test(t || '') ? 'ar-text' : '');

// kecilkan gambar (data URL) agar muat batas dokumen Firestore
export function compressDataUrl(src, maxPx = LIMITS.imageMaxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxPx / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/jpeg', 0.7);
      if (out.length > LIMITS.imageMaxChars) out = c.toDataURL('image/jpeg', 0.5);
      resolve(out);
    };
    img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
    img.src = src;
  });
}
export const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
export const slug = (s) => String(s || 'file').replace(/[^\w-]+/g, '_');
