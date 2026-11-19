// teacher-questions.js — paket soal, form soal, teks bacaan, bank soal bersama, impor Word/Excel
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where } from './firebase-config.js';
import { TYPES, LETTERS, TYPE_LABEL, KEY_INFO, DIFFICULTY, LIMITS } from './constants.js';
import { toArr } from './scoring.js';
import { me, subjects, classes, packages, assignedSubjects, myPackages, on } from './teacher-state.js';
import { $, esc, empty, arCls, compressDataUrl, fileToDataUrl, download } from './util.js';

const { listen, runChunks, log: logActivity } = window.CBT;
let activePackageId = null, importBuf = null, rowsMode = 'OPT';   // rowsMode: isi #optRows saat ini ('OPT' = opsi huruf, 'JODOH' = pasangan)
const curPkg = () => packages.find((p) => p.id === activePackageId);
const pkgPassages = () => curPkg()?.passages || [];

on('packages', () => {
  renderPackageGrid(); renderPackageDetail();
  if (!$('modalPassage').classList.contains('hidden')) drawPassageList();
  if (!$('modalAddQuestion').classList.contains('hidden')) fillPassageSelect($('qPassage').value);   // bacaan baru langsung muncul di form soal
});
on('me', () => startBank());

// ------------------------------------------------------------------
// PAKET SOAL
// ------------------------------------------------------------------
export function renderPackageGrid() {
  const grid = $('packageGrid'); if (!grid) return;
  const list = myPackages();
  grid.innerHTML = list.length ? list.map((p) => `<div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition ${p.id === activePackageId ? 'ring-2 ring-blue-700' : ''}">
    <div class="flex justify-between items-start gap-2"><h4 class="font-bold text-slate-800 text-xs uppercase">${esc(p.title)}</h4>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${esc(p.status)}</span></div>
    <p class="text-[10px] text-slate-500">Mapel: ${esc((p.subject || '').toUpperCase())} | Target: ${esc(p.targetClass)} | Soal: ${p.questions?.length || 0}${p.passages?.length ? ` | Bacaan: ${p.passages.length}` : ''}</p>
    <div class="flex gap-2 pt-2"><button onclick="openPackageDetailFire('${p.id}')" class="btn btn-blue flex-1">Buka Soal</button>
      <button onclick="deletePackageFire('${p.id}')" class="btn btn-red">Hapus</button></div></div>`).join('')
    : '<p class="text-xs text-slate-400 col-span-3 p-4 bg-slate-50 rounded-xl">Belum ada paket soal. Klik "Buat Paket Baru".</p>';
}

window.openCreatePackageModal = function () {
  const mine = assignedSubjects();
  const subs = mine.length ? subjects.filter((s) => mine.includes(s.code)) : subjects;
  $('pkgSubjectSelect').innerHTML = subs.length ? subs.map((s) => `<option value="${esc(s.code.toUpperCase())}">${esc(s.name)} (${esc(s.code.toUpperCase())})</option>`).join('') : '<option value="">-- Belum ada mapel --</option>';
  const cls = mine.length ? [...new Set(me.teacherAssignments.flatMap((a) => a.classes || []))] : classes.map((c) => c.code);
  $('pkgClassSelect').innerHTML = cls.length ? cls.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('') : '<option value="">-- Belum ada kelas --</option>';
  $('modalCreatePackage').classList.remove('hidden');
};
window.closeCreatePackageModal = () => $('modalCreatePackage').classList.add('hidden');
window.handleSavePackage = async function (e) {
  e.preventDefault();
  const title = $('pkgNameInput').value.trim();
  if (!title) return alert('Silakan isi nama paket soal!');
  if (!$('pkgSubjectSelect').value || !$('pkgClassSelect').value) return alert('Mapel dan kelas target wajib dipilih (hubungi admin bila kosong).');
  try {
    await addDoc(collection(db, 'packages'), { title, subject: $('pkgSubjectSelect').value, targetClass: $('pkgClassSelect').value, status: 'Draft', questions: [], passages: [], createdBy: me.uid, createdAt: Date.now() });
    $('pkgNameInput').value = ''; window.closeCreatePackageModal(); logActivity(`Membuat paket soal: ${title}`);
  } catch (err) { alert('Gagal menyimpan paket soal: ' + err.message); }
};
window.openPackageDetailFire = (id) => { activePackageId = id; renderPackageDetail(); renderPackageGrid(); $('packageDetailBox')?.scrollIntoView({ behavior: 'smooth' }); };
window.deletePackageFire = async function (id) {
  const used = await getDocs(query(collection(db, 'schedules'), where('packageId', '==', id)));
  if (!used.empty) return alert('Gagal Menghapus: Paket soal ini dipakai dalam Jadwal Ujian!');
  if (!confirm('Hapus paket soal ini secara permanen?')) return;
  await deleteDoc(doc(db, 'packages', id));
  if (activePackageId === id) activePackageId = null;
};

const chips = (q) => [q.difficulty && `<span class="bg-violet-100 text-violet-800 px-1.5 rounded text-[10px] font-bold">${esc(q.difficulty)}</span>`,
  q.chapter && `<span class="bg-sky-100 text-sky-800 px-1.5 rounded text-[10px]">Bab: ${esc(q.chapter)}</span>`,
  ...(q.tags || []).map((t) => `<span class="bg-slate-200 text-slate-700 px-1.5 rounded text-[10px]">#${esc(t)}</span>`),
  q.fixed && '<span class="bg-amber-100 text-amber-800 px-1.5 rounded text-[10px]">📌 tetap</span>'].filter(Boolean).join(' ');

function renderPackageDetail() {
  const p = curPkg(), box = $('packageDetailBox'); if (!box) return;
  if (!p) return box.classList.add('hidden');
  box.classList.remove('hidden');
  $('activePkgTitle').innerText = `${(p.title || '').toUpperCase()} [Status: ${p.status}]`;
  $('activePkgInfo').innerText = `Mapel: ${(p.subject || '').toUpperCase()} | Target: ${p.targetClass} | Total Bobot: ${(p.questions || []).reduce((n, q) => n + (+q.score || 0), 0)} | Bacaan: ${pkgPassages().length}`;
  $('btnValidatePkg').onclick = () => validatePackage(p.id);
  const qs = p.questions || [], ps = Object.fromEntries(pkgPassages().map((x) => [x.id, x]));
  const shown = new Set();
  $('packageQuestionsList').innerHTML = qs.length ? qs.map((q, i) => {
    const err = validateQuestion(q);
    const pass = q.passageId && ps[q.passageId] && !shown.has(q.passageId) ? (shown.add(q.passageId), ps[q.passageId]) : null;
    return `${pass ? `<div class="bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs space-y-1"><div class="font-bold text-emerald-800">📖 Teks Bacaan: ${esc(pass.title)}</div>
      <p dir="auto" class="whitespace-pre-wrap max-h-40 overflow-y-auto ${arCls(pass.text)}">${esc(pass.text)}</p>${pass.image ? `<img src="${pass.image}" class="max-h-32 rounded border" alt="">` : ''}</div>` : ''}<div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2 ${err ? 'border-rose-300' : ''}">
    <div class="flex flex-wrap justify-between items-center gap-2"><strong class="text-slate-800">#${i + 1} [<span class="text-blue-900">${esc(TYPE_LABEL[q.type] || q.type)}</span>] Bobot: ${esc(q.score || 2)} ${err ? `<span class="text-rose-600 font-semibold">⚠ ${esc(err)}</span>` : ''}</strong>
      <div class="space-x-1 shrink-0"><button onclick="openAddQuestionModal(${i})" class="btn btn-sm btn-amber">Edit</button>
        <button onclick="saveQuestionToBank(${i})" class="btn btn-sm btn-green">Ke Bank</button>
        <button onclick="duplicateQuestionFire(${i})" class="btn btn-sm btn-gray">Duplikat</button><button onclick="deleteQuestionFire(${i})" class="btn btn-sm btn-red">Hapus</button></div></div>
    ${chips(q) ? `<div class="flex flex-wrap gap-1">${chips(q)}</div>` : ''}
    ${q.passageId && ps[q.passageId] ? `<div class="text-[10px] bg-emerald-50 border border-emerald-200 rounded px-2 py-1">📖 Bacaan: <b>${esc(ps[q.passageId].title)}</b></div>` : ''}
    <p dir="auto" class="font-medium text-slate-800 whitespace-pre-wrap ${arCls(q.text)}">${esc(q.text)}</p>
    ${q.image ? `<img src="${q.image}" class="max-h-32 rounded border" alt="">` : ''}
    ${q.options?.length ? `<div class="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pl-2">${q.options.map((o, k) => `<div dir="auto"><strong class="text-slate-800">${LETTERS[k]}.</strong> ${esc(o)}</div>`).join('')}</div>` : ''}
    ${q.pairs?.length ? `<div class="text-[11px] text-slate-600 pl-2 space-y-0.5">${q.pairs.map((x) => `<div dir="auto">${esc(x.left)} <b class="text-blue-900">→</b> ${esc(x.right)}</div>`).join('')}</div>` : ''}
    ${q.type !== 'JODOH' ? `<div class="text-[11px] text-slate-600 pt-1 border-t"><strong>Kunci:</strong> <code class="font-bold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">${esc(Array.isArray(q.key) ? q.key.join(', ') : q.key || '-')}</code></div>` : ''}</div>`;
  }).join('') : '<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal. Tambahkan manual, ambil dari Bank, atau impor file Word/Excel.</p>';
}

async function savePackage(questions, passages) {
  const payload = { questions, passages: passages ?? pkgPassages(), status: 'Draft', updatedAt: Date.now() };
  if (JSON.stringify(payload).length > LIMITS.docBytes) { alert('Paket terlalu besar (batas Firestore ±1 MB). Kecilkan/kurangi gambar atau pecah menjadi beberapa paket.'); return false; }
  await updateDoc(doc(db, 'packages', activePackageId), payload);
  return true;
}

// ---- Validasi & normalisasi soal (manual, Word, Excel, bank) ----
export function validateQuestion(q) {
  if (!q.text?.trim()) return 'teks soal kosong';
  if (!(+q.score > 0)) return 'bobot harus > 0';
  if (q.type === 'PG' || q.type === 'PGK') {
    if ((q.options || []).length < 2) return 'opsi kurang dari 2';
    const keys = toArr(q.key);
    if (!keys.length || keys.some((k) => LETTERS.indexOf(k) < 0 || LETTERS.indexOf(k) >= q.options.length)) return 'kunci tidak sesuai opsi';
    if (q.type === 'PG' && keys.length !== 1) return 'PG harus satu kunci';
  } else if (q.type === 'BS') { if (!['BENAR', 'SALAH'].includes(String(q.key).toUpperCase())) return 'kunci harus BENAR/SALAH'; }
  else if (q.type === 'ISIAN') { if (!String(q.key || '').trim()) return 'kunci isian kosong'; }
  else if (q.type === 'JODOH') { if ((q.pairs || []).length < 2 || q.pairs.some((x) => !x.left || !x.right)) return 'minimal 2 pasangan lengkap'; }
  return '';
}
const parsePair = (s) => { const m = String(s || '').split(/\s*(?:=>|->|\|)\s*/); return m.length >= 2 ? { left: m[0].trim(), right: m.slice(1).join(' ').trim() } : null; };

export function buildQuestion(raw) {
  const type = String(raw.type || 'PG').trim().toUpperCase();
  if (!TYPES.includes(type)) return { error: `jenis "${raw.type}" tidak dikenal` };
  const q = { type, text: String(raw.text || '').trim(), score: parseInt(raw.score) || 2 };
  if (raw.image) q.image = raw.image;
  if (raw.passageId) q.passageId = raw.passageId;
  if (raw.chapter) q.chapter = String(raw.chapter).trim();
  const dif = DIFFICULTY.find((d) => d.toLowerCase() === String(raw.difficulty || '').trim().toLowerCase());
  if (dif) q.difficulty = dif;
  const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',')).map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
  if (tags.length) q.tags = tags;
  if (raw.fixed === true || /^(ya|y|true|1|tetap)$/i.test(String(raw.fixed || ''))) q.fixed = true;
  if (type === 'PG' || type === 'PGK') {
    q.options = (raw.options || []).map((o) => String(o ?? '').trim()).filter(Boolean);
    const k = [...new Set(toArr(raw.key).map((x) => x.charAt(0)))].sort();
    q.key = type === 'PG' ? k[0] || '' : k;
  } else if (type === 'JODOH') {
    q.pairs = (raw.pairs || (raw.options || []).map(parsePair)).filter((x) => x && (x.left || x.right)).slice(0, LIMITS.maxPairs);
    q.key = 'pairs';
  } else if (type === 'BS') {
    const k = String(raw.key || '').trim().toUpperCase();
    q.key = ['BENAR', 'B', 'TRUE'].includes(k) ? 'BENAR' : ['SALAH', 'S', 'FALSE'].includes(k) ? 'SALAH' : k;
  } else q.key = String(raw.key || '').trim();
  const err = validateQuestion(q);
  return err ? { error: err, q } : { q };
}

async function validatePackage(id) {
  const p = packages.find((x) => x.id === id); if (!p) return;
  const qs = p.questions || [];
  if (!qs.length) return alert('Gagal Tandai Siap: paket belum berisi butir soal!');
  const pids = new Set((p.passages || []).map((x) => x.id));
  const bad = qs.map((q, i) => [i + 1, validateQuestion(q) || (q.passageId && !pids.has(q.passageId) ? 'teks bacaan hilang' : '')]).filter((x) => x[1]);
  if (bad.length) return alert(`Gagal Tandai Siap: ${bad.length} soal belum lengkap:\n` + bad.slice(0, 8).map(([n, e]) => `#${n}: ${e}`).join('\n'));
  await updateDoc(doc(db, 'packages', id), { status: 'Siap' });
  alert('Paket soal berhasil ditandai SIAP dan bisa dijadwalkan!');
}
window.validateAndSetPackageReady = validatePackage;
window.duplicateQuestionFire = async (i) => { const qs = [...curPkg().questions]; qs.splice(i + 1, 0, JSON.parse(JSON.stringify(qs[i]))); await savePackage(qs); };
window.deleteQuestionFire = async (i) => { if (!confirm(`Hapus soal #${i + 1}?`)) return; const qs = [...curPkg().questions]; qs.splice(i, 1); await savePackage(qs); };

// ------------------------------------------------------------------
// FORM SOAL (tambah / edit)
// ------------------------------------------------------------------
const readOpts = () => [...document.querySelectorAll('.optInp')].map((i) => i.value);
const readPairs = () => [...document.querySelectorAll('.pairRow')].map((r) => ({ left: r.querySelector('.pairL').value.trim(), right: r.querySelector('.pairR').value.trim() }));
function renderOptRows(vals) {
  rowsMode = 'OPT';
  $('optRows').innerHTML = vals.map((v, i) => `<div class="flex items-center gap-2"><span class="font-bold w-5 text-center">${LETTERS[i]}</span>
    <input type="text" dir="auto" class="inp flex-1 optInp" value="${esc(v)}" placeholder="Pilihan ${LETTERS[i]}">
    <button type="button" onclick="removeOptionRow(${i})" class="text-rose-600 font-bold px-1">✕</button></div>`).join('');
  $('btnAddOpt').classList.toggle('hidden', vals.length >= LETTERS.length);
}
function renderPairRows(pairs) {
  rowsMode = 'JODOH';
  $('optRows').innerHTML = pairs.map((p, i) => `<div class="pairRow flex items-center gap-2"><span class="font-bold w-5 text-center">${i + 1}</span>
    <input type="text" dir="auto" class="inp flex-1 pairL" value="${esc(p.left)}" placeholder="Pernyataan / kiri">
    <span class="font-bold text-blue-900">→</span><input type="text" dir="auto" class="inp flex-1 pairR" value="${esc(p.right)}" placeholder="Pasangan / kanan">
    <button type="button" onclick="removeOptionRow(${i})" class="text-rose-600 font-bold px-1">✕</button></div>`).join('');
  $('btnAddOpt').classList.toggle('hidden', pairs.length >= LIMITS.maxPairs);
}
window.addOptionRow = () => {
  if (rowsMode === 'JODOH') { const v = readPairs(); if (v.length < LIMITS.maxPairs) renderPairRows([...v, { left: '', right: '' }]); }
  else { const v = readOpts(); if (v.length < LETTERS.length) renderOptRows([...v, '']); }
};
window.removeOptionRow = (i) => {
  if (rowsMode === 'JODOH') { const v = readPairs(); if (v.length <= 2) return alert('Minimal 2 pasangan.'); v.splice(i, 1); renderPairRows(v); }
  else { const v = readOpts(); if (v.length <= 2) return alert('Minimal 2 opsi.'); v.splice(i, 1); renderOptRows(v); }
};
window.toggleQuestionOptionsUI = function () {
  const t = $('qTypeInput').value, rows = t === 'PG' || t === 'PGK' || t === 'JODOH';
  $('pgOptionsBox').classList.toggle('hidden', !rows);
  $('qKeyWrap').classList.toggle('hidden', t === 'JODOH');
  const info = KEY_INFO[t];
  $('qKeyLabel').innerText = info[0]; $('qKeyHint').innerText = info[1]; $('qKeyInput').required = t !== 'URAIAN' && t !== 'JODOH';
  const mode = t === 'JODOH' ? 'JODOH' : 'OPT';
  if (rows && (mode !== rowsMode || !$('optRows').children.length)) mode === 'JODOH' ? renderPairRows([{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }]) : renderOptRows(['', '', '', '']);
};
function fillPassageSelect(sel) {
  $('qPassageHint').innerText = pkgPassages().length ? '' : 'Belum ada teks bacaan di paket ini — klik tautan di bawah untuk membuatnya.';
  $('qPassage').innerHTML = '<option value="">— Tanpa teks bacaan —</option>' + pkgPassages().map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  $('qPassage').value = sel || '';
}
window.openAddQuestionModal = function (idx) {
  if (!activePackageId) return alert("Klik 'Buka Soal' pada salah satu paket terlebih dahulu!");
  const edit = Number.isInteger(idx), q = edit ? curPkg().questions[idx] : null;
  $('editQuestionIndex').value = edit ? idx : -1;
  $('modalQuestionTitle').innerText = edit ? `Edit Soal #${idx + 1}` : 'Tambah Soal Manual';
  $('qTypeInput').value = q?.type || 'PG'; $('qScoreInput').value = q?.score || 2; $('qTextInput').value = q?.text || '';
  $('qKeyInput').value = Array.isArray(q?.key) ? q.key.join(',') : q?.type === 'JODOH' ? '' : q?.key || '';
  $('qChapter').value = q?.chapter || ''; $('qDifficulty').value = q?.difficulty || ''; $('qTags').value = (q?.tags || []).join(', '); $('qFixed').checked = !!q?.fixed;
  fillPassageSelect(q?.passageId);
  q?.type === 'JODOH' ? renderPairRows(q.pairs) : renderOptRows(q?.options?.length ? q.options : ['', '', '', '']);
  $('qImageBase64').value = q?.image || ''; setImagePreview(q?.image || '');
  window.toggleQuestionOptionsUI(); $('modalAddQuestion').classList.remove('hidden');
};
window.closeAddQuestionModal = () => $('modalAddQuestion').classList.add('hidden');
function setImagePreview(src) { $('qImagePreviewImg').src = src || ''; $('qImagePreviewContainer').classList.toggle('hidden', !src); }
window.removeQuestionImage = () => { $('qImageBase64').value = ''; $('qImageFileInput').value = ''; setImagePreview(''); };
window.handleQuestionImagePreview = async function (e) {
  const f = e.target.files[0]; if (!f) return;
  try { const out = await compressDataUrl(await fileToDataUrl(f)); $('qImageBase64').value = out; setImagePreview(out); } catch (err) { alert(err.message); }
};
window.handleSaveManualQuestion = async function (e) {
  e.preventDefault();
  const type = $('qTypeInput').value;
  const { q, error } = buildQuestion({ type, text: $('qTextInput').value, score: $('qScoreInput').value, image: $('qImageBase64').value, passageId: $('qPassage').value,
    chapter: $('qChapter').value, difficulty: $('qDifficulty').value, tags: $('qTags').value, fixed: $('qFixed').checked,
    options: type === 'PG' || type === 'PGK' ? readOpts() : [], pairs: type === 'JODOH' ? readPairs() : undefined, key: $('qKeyInput').value });
  if (error && type !== 'URAIAN') return alert('Soal belum valid: ' + error);
  const qs = [...(curPkg().questions || [])], idx = +$('editQuestionIndex').value;
  if (idx >= 0) qs[idx] = q; else qs.push(q);
  try { if (await savePackage(qs)) window.closeAddQuestionModal(); } catch (err) { alert('Gagal menyimpan soal: ' + err.message); }
};

// ------------------------------------------------------------------
// TEKS BACAAN (satu teks, banyak soal)
// ------------------------------------------------------------------
window.openPassageModal = function () {
  if (!activePackageId) return alert("Klik 'Buka Soal' pada salah satu paket terlebih dahulu!");
  window.resetPassageForm(); drawPassageList(); $('modalPassage').classList.remove('hidden');
};
window.closePassageModal = () => $('modalPassage').classList.add('hidden');
window.resetPassageForm = () => { ['passageEditId', 'passageTitle', 'passageText', 'passageImageB64'].forEach((id) => ($(id).value = '')); $('passageImageFile').value = ''; $('passageImgNote').innerText = ''; };
function drawPassageList() {
  const used = {}; (curPkg()?.questions || []).forEach((q) => { if (q.passageId) used[q.passageId] = (used[q.passageId] || 0) + 1; });
  $('passageList').innerHTML = pkgPassages().length ? pkgPassages().map((p) => `<div class="border rounded-lg p-2 text-xs flex justify-between items-center gap-2">
    <div class="min-w-0"><strong>${esc(p.title)}</strong> <span class="text-slate-400">(${used[p.id] || 0} soal${p.image ? ', ada gambar' : ''})</span><p dir="auto" class="truncate text-slate-500 ${arCls(p.text)}">${esc(p.text)}</p></div>
    <div class="shrink-0 space-x-1"><button onclick="editPassage('${esc(p.id)}')" class="btn btn-sm btn-amber">Edit</button><button onclick="deletePassage('${esc(p.id)}')" class="btn btn-sm btn-red">Hapus</button></div></div>`).join('')
    : '<p class="text-xs text-slate-400">Belum ada teks bacaan di paket ini.</p>';
}
window.editPassage = (id) => {
  const p = pkgPassages().find((x) => x.id === id); if (!p) return;
  $('passageEditId').value = id; $('passageTitle').value = p.title; $('passageText').value = p.text; $('passageImageB64').value = p.image || '';
  $('passageImgNote').innerText = p.image ? 'Gambar terpasang (pilih file baru untuk mengganti)' : '';
};
window.handlePassageImage = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { $('passageImageB64').value = await compressDataUrl(await fileToDataUrl(f)); $('passageImgNote').innerText = 'Gambar siap disimpan'; } catch (err) { alert(err.message); }
};
window.handleSavePassage = async function (e) {
  e.preventDefault();
  const id = $('passageEditId').value || `ps_${Date.now().toString(36)}`;
  const item = { id, title: $('passageTitle').value.trim(), text: $('passageText').value.trim(), ...($('passageImageB64').value ? { image: $('passageImageB64').value } : {}) };
  if (!item.title || !item.text) return alert('Judul dan teks bacaan wajib diisi!');
  const cur = pkgPassages(), list = cur.some((p) => p.id === id) ? cur.map((p) => (p.id === id ? item : p)) : [...cur, item];
  if (await savePackage(curPkg().questions || [], list)) window.resetPassageForm();
};
window.deletePassage = async (id) => {
  const n = (curPkg().questions || []).filter((q) => q.passageId === id).length;
  if (!confirm(n ? `Bacaan ini dipakai ${n} soal. Hapus bacaan dan lepaskan dari soal tersebut?` : 'Hapus teks bacaan ini?')) return;
  const qs = (curPkg().questions || []).map((q) => { if (q.passageId !== id) return q; const { passageId, ...rest } = q; return rest; });
  await savePackage(qs, pkgPassages().filter((p) => p.id !== id));
};

// ------------------------------------------------------------------
// BANK SOAL BERSAMA (koleksi `bank`: milik sendiri + yang dibagikan guru lain)
// ------------------------------------------------------------------
let bank = [], bankStarted = false;
function startBank() {
  if (bankStarted) return; bankStarted = true;
  listen('tBank', collection(db, 'bank'), (s) => { bank = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.shared || b.owner === me.uid); if (!$('modalBank').classList.contains('hidden')) window.renderBank(); });
}
const bankDoc = (q, share) => {
  const pass = q.passageId ? pkgPassages().find((p) => p.id === q.passageId) : null, { passageId, ...qq } = q, pkg = curPkg();
  return { q: qq, ...(pass ? { passage: { title: pass.title, text: pass.text, ...(pass.image ? { image: pass.image } : {}) } } : {}), subject: pkg.subject, chapter: q.chapter || '', difficulty: q.difficulty || '', tags: q.tags || [],
    owner: me.uid, ownerName: me.name || me.username || '', shared: share, searchText: `${q.text} ${q.chapter || ''} ${(q.tags || []).join(' ')}`.toLowerCase(), createdAt: Date.now() };
};
async function pushToBank(qs) {
  if (!activePackageId) return;
  const share = confirm(`Simpan ${qs.length} soal ke Bank.\n\nOK = bagikan ke semua guru\nBatal = simpan pribadi (hanya Anda)`);
  const have = new Set(bank.filter((b) => b.owner === me.uid).map((b) => `${b.q.type}|${b.q.text}`));
  const fresh = qs.filter((q) => !have.has(`${q.type}|${q.text}`));
  await runChunks(fresh, (q) => addDoc(collection(db, 'bank'), bankDoc(q, share)), 15);
  alert(`${fresh.length} soal masuk ke Bank${qs.length - fresh.length ? ` (${qs.length - fresh.length} sudah ada, dilewati)` : ''}.`);
}
window.saveQuestionToBank = (i) => pushToBank([curPkg().questions[i]]);
window.saveAllToBank = () => { const qs = curPkg()?.questions || []; if (!qs.length) return alert('Paket belum berisi soal.'); pushToBank(qs); };

window.openBankModal = function () {
  const subs = [...new Set(bank.map((b) => b.subject).filter(Boolean))].sort();
  $('bankSubject').innerHTML = '<option value="">Semua Mapel</option>' + subs.map((s) => `<option>${esc(s)}</option>`).join('');
  const pkg = curPkg(); if (pkg && subs.includes(pkg.subject)) $('bankSubject').value = pkg.subject;
  $('bankAddBtn').classList.toggle('hidden', !pkg);
  $('modalBank').classList.remove('hidden'); window.renderBank();
};
window.closeBankModal = () => $('modalBank').classList.add('hidden');
window.renderBank = function () {
  const q = $('bankSearch').value.toLowerCase().trim(), sub = $('bankSubject').value, dif = $('bankDifficulty').value, mine = $('bankScope').value === 'mine';
  const list = bank.filter((b) => (!q || b.searchText?.includes(q)) && (!sub || b.subject === sub) && (!dif || b.difficulty === dif) && (!mine || b.owner === me.uid));
  $('bankCount').innerText = `${list.length} soal${list.length > LIMITS.bankRenderMax ? ` (menampilkan ${LIMITS.bankRenderMax} pertama — persempit pencarian)` : ''}`;
  $('bankList').innerHTML = list.slice(0, LIMITS.bankRenderMax).map((b) => `<div class="border rounded-lg p-2 text-xs flex gap-2 items-start">
    <input type="checkbox" name="bankSel" value="${b.id}" onchange="bankSelChanged()" class="mt-1">
    <div class="flex-1 min-w-0 space-y-1"><div class="flex flex-wrap gap-1 items-center"><span class="bg-blue-100 text-blue-800 px-1.5 rounded text-[10px] font-bold">${esc(TYPE_LABEL[b.q.type] || b.q.type)}</span>
      <span class="text-[10px] text-slate-500">${esc(b.subject)} • ${esc(b.ownerName || '-')} ${b.shared ? '• 🌐 dibagikan' : '• 🔒 pribadi'}</span>${chips({ ...b.q, tags: b.tags, chapter: b.chapter, difficulty: b.difficulty, fixed: false })}</div>
      ${b.passage ? `<div class="text-[10px] text-emerald-700">📖 ${esc(b.passage.title)}</div>` : ''}
      <p dir="auto" class="line-clamp-2 ${arCls(b.q.text)}">${esc(b.q.text)}</p></div>
    ${b.owner === me.uid ? `<div class="shrink-0 space-y-1"><button onclick="toggleBankShare('${b.id}')" class="btn btn-sm btn-gray block">${b.shared ? 'Jadikan Pribadi' : 'Bagikan'}</button><button onclick="deleteBankItem('${b.id}')" class="btn btn-sm btn-red block w-full">Hapus</button></div>` : ''}</div>`).join('')
    || '<p class="text-xs text-slate-400 p-4">Tidak ada soal yang cocok.</p>';
  window.bankSelChanged();
};
window.bankSelChanged = () => { const n = document.querySelectorAll('input[name="bankSel"]:checked').length; $('bankSelCount').innerText = n; $('bankAddBtn').disabled = !n; };
window.toggleBankShare = async (id) => { const b = bank.find((x) => x.id === id); if (b?.owner === me.uid) await updateDoc(doc(db, 'bank', id), { shared: !b.shared }); };
window.deleteBankItem = async (id) => { const b = bank.find((x) => x.id === id); if (b?.owner === me.uid && confirm('Hapus soal ini dari Bank?')) await deleteDoc(doc(db, 'bank', id)); };
window.addBankToPackage = async function () {
  if (!activePackageId) return alert("Buka salah satu paket terlebih dahulu ('Buka Soal').");
  const ids = new Set([...document.querySelectorAll('input[name="bankSel"]:checked')].map((c) => c.value));
  const items = bank.filter((b) => ids.has(b.id)); if (!items.length) return;
  const passages = [...pkgPassages()], qs = [...(curPkg().questions || [])];
  items.forEach((b) => {
    const q = JSON.parse(JSON.stringify(b.q));
    if (b.passage) {
      let p = passages.find((x) => x.title === b.passage.title && x.text === b.passage.text);
      if (!p) { p = { id: `ps_${Date.now().toString(36)}${passages.length}`, ...b.passage }; passages.push(p); }
      q.passageId = p.id;
    }
    qs.push(q);
  });
  if (await savePackage(qs, passages)) { alert(`${items.length} soal ditambahkan ke paket. Status paket kembali Draft.`); window.closeBankModal(); }
};

// ------------------------------------------------------------------
// IMPOR WORD (.docx, termasuk gambar & bacaan) / EXCEL
// ------------------------------------------------------------------
window.openImportQuestionModal = function () {
  if (!activePackageId) return alert("Klik 'Buka Soal' pada salah satu paket terlebih dahulu!");
  importBuf = null; $('docxQuestionFile').value = ''; $('importPreviewReport').classList.add('hidden');
  $('btnSaveImportedDocx').disabled = true; $('modalImportQuestion').classList.remove('hidden');
};
window.closeImportQuestionModal = () => $('modalImportQuestion').classList.add('hidden');

window.handleProcessImportFile = function (e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  if (/\.docx$/i.test(f.name)) {
    if (typeof mammoth === 'undefined') return alert('Pustaka Mammoth.js belum dimuat. Muat ulang halaman.');
    r.onload = (ev) => mammoth.convertToHtml({ arrayBuffer: ev.target.result }, { convertImage: mammoth.images.imgElement((img) => img.read('base64').then((b) => ({ src: `data:${img.contentType};base64,${b}` }))) })
      .then((res) => showImport(parseWordHtml(res.value))).catch((err) => alert('Gagal membaca file Word: ' + err.message));
  } else {
    if (typeof XLSX === 'undefined') return alert('Pustaka XLSX belum dimuat. Muat ulang halaman.');
    r.onload = (ev) => {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const pick = (row, k) => row[Object.keys(row).find((x) => x.trim().toLowerCase() === k) || ''] ?? '';
      const passages = {}, items = rows.map((row) => {
        const txt = String(pick(row, 'teks bacaan') || '').trim(); let pk = null;
        if (txt) { pk = txt; passages[pk] ||= { title: String(pick(row, 'bacaan') || 'Bacaan').trim() || 'Bacaan', text: txt }; }
        return { type: pick(row, 'jenis'), text: pick(row, 'soal'), options: LETTERS.split('').map((l) => pick(row, l.toLowerCase())), key: pick(row, 'kunci'), score: pick(row, 'bobot'),
          chapter: pick(row, 'bab'), difficulty: pick(row, 'tingkat'), tags: pick(row, 'tag'), fixed: pick(row, 'tetap'), passageKey: pk };
      });
      showImport({ items, passages });
    };
  }
  r.readAsArrayBuffer(f);
};

function parseWordHtml(html) {
  const dom = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html'), lines = [];
  dom.body.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6').forEach((el) => {
    el.textContent.split('\n').map((t) => t.trim()).filter(Boolean).forEach((t) => lines.push({ t }));
    el.querySelectorAll('img').forEach((im) => lines.push({ img: im.getAttribute('src') }));
  });
  const items = [], passages = {}; let cur = null, pass = null, collecting = false, last = null;
  for (const ln of lines) {
    if (ln.img) { if (collecting && pass) passages[pass].image ||= ln.img; else if (cur && !cur.image) cur.image = ln.img; continue; }
    const l = ln.t; let m;
    if ((m = l.match(/^bacaan\s*:\s*(.*)$/i))) { pass = `p${Object.keys(passages).length}`; passages[pass] = { title: m[1] || 'Bacaan', text: '' }; collecting = true; cur = null; last = null; continue; }
    if (/^selesai\s+bacaan/i.test(l)) { pass = null; collecting = false; cur = null; last = null; continue; }
    if ((m = l.match(/^jenis\s*:\s*(.*)$/i))) { collecting = false; cur = { type: m[1], options: [], passageKey: pass }; items.push(cur); last = null; continue; }
    if (collecting) { passages[pass].text += (passages[pass].text ? '\n' : '') + l; continue; }
    if (!cur) continue;
    if ((m = l.match(/^soal\s*:\s*(.*)$/i))) { cur.text = m[1]; last = 'text'; }
    else if ((m = l.match(/^([A-F])\s*[:.)]\s*(.*)$/i))) { const k = LETTERS.indexOf(m[1].toUpperCase()); cur.options[k] = m[2]; last = `opt${k}`; }
    else if ((m = l.match(/^kunci\s*:\s*(.*)$/i))) { cur.key = m[1]; last = null; }
    else if ((m = l.match(/^bobot\s*:\s*(.*)$/i))) { cur.score = m[1]; last = null; }
    else if ((m = l.match(/^bab\s*:\s*(.*)$/i))) { cur.chapter = m[1]; last = null; }
    else if ((m = l.match(/^tingkat\s*:\s*(.*)$/i))) { cur.difficulty = m[1]; last = null; }
    else if ((m = l.match(/^tag\s*:\s*(.*)$/i))) { cur.tags = m[1]; last = null; }
    else if ((m = l.match(/^tetap\s*:\s*(.*)$/i))) { cur.fixed = m[1]; last = null; }
    else if (last === 'text') cur.text += `\n${l}`;
    else if (last?.startsWith('opt')) cur.options[+last.slice(3)] += ` ${l}`;
  }
  return { items, passages };
}

async function showImport({ items, passages }) {
  const box = $('importPreviewReport'); box.classList.remove('hidden'); box.innerHTML = 'Memproses…';
  const squeeze = async (o) => { if (o.image) { try { o.image = await compressDataUrl(o.image); } catch (e) { delete o.image; } } };
  await Promise.all([...items, ...Object.values(passages)].map(squeeze));
  const qs = [], lines = []; let bad = 0;
  items.forEach((raw, i) => {
    const { q, error } = buildQuestion(raw);
    if (q && (!error || q.type === 'URAIAN')) qs.push({ q, pk: raw.passageKey }); else { bad++; lines.push(`<div class="text-rose-600">✖ #${i + 1}: ${esc(error)}</div>`); }
  });
  importBuf = { qs, passages };
  const withImg = qs.filter((x) => x.q.image).length, pcount = new Set(qs.map((x) => x.pk).filter(Boolean)).size;
  box.innerHTML = `<div class="font-bold ${qs.length ? 'text-emerald-700' : 'text-rose-700'}">${qs.length} soal valid${bad ? `, ${bad} ditolak` : ''} • ${withImg} bergambar • ${pcount} bacaan</div>` + lines.join('') +
    qs.slice(0, 50).map(({ q }, i) => `<div class="text-slate-600">#${i + 1} [${q.type}] ${esc(q.text.slice(0, 50))}…</div>`).join('');
  $('btnSaveImportedDocx').disabled = !qs.length;
}
window.saveImportedQuestionsDocx = async function () {
  if (!activePackageId || !importBuf?.qs.length) return alert('Tidak ada soal valid untuk disimpan!');
  const newPass = [...pkgPassages()], idOf = {};
  importBuf.qs.forEach(({ pk }) => {
    if (pk == null || idOf[pk]) return;
    const src = importBuf.passages[pk]; if (!src) return;
    const found = newPass.find((p) => p.title === src.title && p.text === src.text);
    idOf[pk] = found ? found.id : `ps_${Date.now().toString(36)}${newPass.length}`;
    if (!found) newPass.push({ id: idOf[pk], title: src.title, text: src.text, ...(src.image ? { image: src.image } : {}) });
  });
  const added = importBuf.qs.map(({ q, pk }) => (idOf[pk] ? { ...q, passageId: idOf[pk] } : q));
  try {
    if (await savePackage([...(curPkg().questions || []), ...added], newPass)) {
      alert(`${added.length} soal berhasil ditambahkan. Status paket kembali Draft — jangan lupa "Tandai Siap".`);
      importBuf = null; window.closeImportQuestionModal();
    }
  } catch (err) { alert('Gagal menyimpan soal: ' + err.message); }
};

window.downloadWordTemplate = function () {
  const txt = `PANDUAN FORMAT IMPOR SOAL WORD (.DOCX)
(Salin ke Word. Tiap soal diawali JENIS:. Gambar boleh disisipkan langsung di Word — otomatis ikut terimpor.)
=================================================
JENIS: PG
SOAL: Siapakah Nabi terakhir yang diutus Allah SWT?
A: Nabi Musa AS
B: Nabi Isa AS
C: Nabi Muhammad SAW
D: Nabi Ibrahim AS
KUNCI: C
BOBOT: 2
BAB: Sirah Nabawiyah        (opsional)
TINGKAT: Mudah             (opsional: Mudah / Sedang / Sulit)
TAG: nabi, sirah           (opsional, pisahkan koma)

JENIS: PGK
SOAL: Manakah yang termasuk Rukun Islam?
A: Membayar Zakat
B: Membaca Al-Qur'an setiap hari
C: Syahadat
D: Puasa Ramadan
KUNCI: A, C, D
BOBOT: 3

JENIS: BS
SOAL: Al-Qur'an terdiri dari 114 Surah.
KUNCI: BENAR

JENIS: ISIAN
SOAL: Kitab suci yang diturunkan kepada Nabi Daud AS adalah Kitab ....
KUNCI: zabur|Zabur

JENIS: URAIAN
SOAL: Jelaskan pengertian sifat Siddiq!
KUNCI: Jujur artinya berkata sesuai fakta...
BOBOT: 5

JENIS: JODOH
SOAL: Jodohkan nabi dengan kitabnya!
A: Nabi Musa AS => Taurat
B: Nabi Daud AS => Zabur
C: Nabi Isa AS => Injil
BOBOT: 6

--- SOAL BERBASIS BACAAN (satu teks, banyak soal) ---
BACAAN: Kisah Nabi Yusuf
(tulis teks bacaan di sini, boleh beberapa baris/paragraf, boleh teks Arab, boleh gambar)
JENIS: PG
SOAL: Siapakah ayah Nabi Yusuf?
A: Ibrahim
B: Yaqub
KUNCI: B
JENIS: ISIAN
SOAL: Saudara Yusuf yang paling kecil bernama ....
KUNCI: Bunyamin
SELESAI BACAAN

--- PENGACAKAN ---
Soal dalam satu BACAAN selalu tetap berurutan sebagai satu blok.
Tambahkan baris  TETAP: ya  pada soal yang posisinya tidak boleh diacak.
`;
  download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), 'Panduan_Format_Soal_Docx.txt');
  if (typeof XLSX === 'undefined') return;
  const base = { Jenis: '', Soal: '', A: '', B: '', C: '', D: '', E: '', F: '', Kunci: '', Bobot: 2, Bab: '', Tingkat: '', Tag: '', Bacaan: '', 'Teks Bacaan': '', Tetap: '' };
  const ws = XLSX.utils.json_to_sheet([
    { ...base, Jenis: 'PG', Soal: 'Ibu kota Indonesia?', A: 'Jakarta', B: 'Bandung', C: 'Surabaya', D: 'Medan', Kunci: 'A', Bab: 'Geografi', Tingkat: 'Mudah', Tag: 'ibukota' },
    { ...base, Jenis: 'BS', Soal: 'Matahari terbit dari timur.', Kunci: 'BENAR' },
    { ...base, Jenis: 'JODOH', Soal: 'Jodohkan negara dan ibu kotanya', A: 'Jepang => Tokyo', B: 'Mesir => Kairo', Bobot: 4 },
    { ...base, Jenis: 'PG', Soal: 'Siapa tokoh utama?', A: 'Yusuf', B: 'Musa', Kunci: 'A', Bacaan: 'Kisah Yusuf', 'Teks Bacaan': 'Yusuf adalah putra Yaqub…' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Soal'); XLSX.writeFile(wb, 'Template_Impor_Soal.xlsx');
};
