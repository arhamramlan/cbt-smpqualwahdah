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
