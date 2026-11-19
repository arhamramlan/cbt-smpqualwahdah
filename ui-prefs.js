// ui-prefs.js — mode gelap, ukuran huruf, dan pembesar teks Arab (disimpan di browser, berlaku untuk semua pengguna)
import { PREF_DEFAULTS } from './constants.js';

const KEY = 'cbt_prefs', clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let p = { ...PREF_DEFAULTS };
try { p = { ...p, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* abaikan */ }

function apply() {
  const r = document.documentElement;
  r.classList.toggle('dark', !!p.dark);
  r.style.setProperty('--fs', p.fs); r.style.setProperty('--ar-fs', p.ar);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* abaikan */ }
  document.querySelectorAll('[data-pref-dark]').forEach((b) => (b.innerHTML = `<i class="fa-solid ${p.dark ? 'fa-sun' : 'fa-moon'}"></i>`));
}
window.CBTPrefs = {
  get: () => ({ ...p }),
  toggleDark: () => { p.dark = !p.dark; apply(); },
  bumpFont: (d) => { p.fs = Math.round(clamp(p.fs + d * 0.1, 0.8, 1.7) * 10) / 10; apply(); },
  bumpArabic: (d) => { p.ar = Math.round(clamp(p.ar + d * 0.15, 1, 2.4) * 100) / 100; apply(); }
};
apply();

// Diagnosa: bila style.css lama/ter-cache, mode gelap & ukuran huruf tidak akan bekerja — beri tahu pengguna
addEventListener('load', () => {
  if (getComputedStyle(document.documentElement).getPropertyValue('--css-v').trim() === '4') return;
  const b = Object.assign(document.createElement('div'), { innerHTML: '⚠ File <b>style.css</b> di server belum versi terbaru, sehingga mode gelap & ukuran huruf belum berfungsi. Unggah ulang style.css lalu tekan Ctrl+F5.' });
  b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;background:#be123c;color:#fff;font:600 12px sans-serif;padding:8px 12px;text-align:center';
  document.body.appendChild(b);
});
