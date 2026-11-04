// app-exam-firebase.js — modul guru (bank soal, jadwal, monitoring, koreksi, laporan) + mesin ujian siswa
import { db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from './firebase-config.js';

const { $, esc, listen, stopListen, runChunks, randomString, log: logActivity } = window.CBT;
const TYPES = ['PG', 'PGK', 'BS', 'ISIAN', 'URAIAN'];
const LETTERS = 'ABCDEF';
const fmtDT = (ts) => (ts ? window.CBT.fmtDateTime(ts) : '-');
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
const empty = (cols, msg) => `<tr><td colspan="${cols}" class="p-4 text-center text-slate-400">${msg}</td></tr>`;
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const toArr = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\s]+/).filter(Boolean)).map((x) => String(x).toUpperCase());
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// ------------------------------------------------------------------
// PENILAIAN (dipakai siswa saat selesai, guru saat koreksi & penilaian ulang)
// ------------------------------------------------------------------
function scoreItem(q, ans) {
  const max = +q.score || 0;
  if (ans == null || ans === '' || (Array.isArray(ans) && !ans.length)) return 0;
  switch (q.type) {
    case 'PG': return String(ans).toUpperCase() === String(q.key).toUpperCase() ? max : 0;
    case 'BS': return norm(ans) === norm(q.key) ? max : 0;
    case 'PGK': { const keys = toArr(q.key), sel = toArr(ans), hit = sel.filter((k) => keys.includes(k)).length; return keys.length ? Math.max(0, (hit - (sel.length - hit)) / keys.length) * max : 0; }
    case 'ISIAN': return String(q.key).split('|').map(norm).includes(norm(ans)) ? max : 0;
    default: return 0;
  }
}
function computeResult(questions, answers = {}, manual = {}) {
  let auto = 0, man = 0, max = 0, pending = 0;
  questions.forEach((q, i) => {
    max += +q.score || 0;
    const m = manual[i];
    if (m != null) man += +m;
    else if (q.type === 'URAIAN') { if (answers[i]) pending++; }
    else auto += scoreItem(q, answers[i]);
  });
  return { auto, man, max, pending, pct: max ? Math.round(((auto + man) / max) * 1000) / 10 : 0 };
}
const resultFields = (r) => ({ scoreAuto: r.auto, scoreManualPts: r.man, maxScore: r.max, pct: r.pct, needsGrading: r.pending > 0 });
const sessResult = (sched, s) => computeResult(sched.packageSnapshot?.questions || [], s.answers, s.scoreManual);

// ------------------------------------------------------------------
// STATE GURU
// ------------------------------------------------------------------
let me = null, subjects = [], classes = [], packages = [], schedules = [];
let activePackageId = null, importBuf = [], teacherStarted = null, rosterCache = null;
let monSched = '', gradeData = { sched: null, sessions: [] }, repData = { sched: null, rows: [], items: [] };

window.initTeacherFirebaseDashboard = function (user) {
  if (teacherStarted === user.uid) return;
  teacherStarted = user.uid; me = user;
  listen('tMe', doc(db, 'users', user.uid), (s) => { if (s.exists()) { me = { ...me, ...s.data(), uid: user.uid }; fillScheduleForm(); } });
  listen('tSubjects', collection(db, 'subjects'), (s) => { subjects = s.docs.map((d) => d.data()).sort((a, b) => a.code.localeCompare(b.code)); fillScheduleForm(); });
  listen('tClasses', collection(db, 'classes'), (s) => { classes = s.docs.map((d) => d.data()).sort((a, b) => a.code.localeCompare(b.code)); });
  listen('tPackages', collection(db, 'packages'), (s) => {
    packages = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPackageGrid(); renderPackageDetail(); fillScheduleForm(); renderSummary();
  });
  listen('tSchedules', collection(db, 'schedules'), (s) => {
    schedules = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.createdBy || x.createdBy === user.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderScheduleTable(); fillExamSelects(); renderSummary(); startSummaryListeners();
  });
};

const assignedSubjects = () => (me?.teacherAssignments || []).map((a) => a.subject);
const myPackages = () => packages.filter((p) => !p.createdBy || p.createdBy === me.uid || p.createdBy === 'guru' || assignedSubjects().includes(p.subject));

window.switchTeacherTab = function (tabId) {
  document.querySelectorAll('.teacher-tab-content').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.teacher-tab-btn').forEach((el) => el.classList.remove('active-tab'));
  $(tabId)?.classList.remove('hidden');
  $('btn' + tabId.charAt(0).toUpperCase() + tabId.slice(1))?.classList.add('active-tab');
  if (tabId === 'tabSummary') renderSummary();
  if (tabId === 'tabMonitoring') window.renderMonitoringData();
  if (tabId === 'tabGrading') window.renderGradingModule();
  if (tabId === 'tabReports') window.renderReportModule();
};

// ------------------------------------------------------------------
// 1. RINGKASAN
// ------------------------------------------------------------------
let sumOn = [], sumGrade = [], sumStarted = false;
function startSummaryListeners() {
  if (sumStarted) return; sumStarted = true;
  listen('tSumOn', query(collection(db, 'sessions'), where('status', '==', 'Mengerjakan')), (s) => { sumOn = s.docs.map((d) => d.data()); renderSummary(); });
  listen('tSumGrade', query(collection(db, 'sessions'), where('needsGrading', '==', true)), (s) => { sumGrade = s.docs.map((d) => d.data()); renderSummary(); });
}
function renderSummary() {
  if (!me || !$('statActiveExams')) return;
  const ids = new Set(schedules.map((s) => s.id));
  const today = new Date().toDateString();
  const todays = schedules.filter((s) => s.active !== false && (!s.startAt || new Date(s.startAt).toDateString() === today));
  $('statActiveExams').innerText = todays.length;
  $('statTotalQuestions').innerText = myPackages().reduce((n, p) => n + (p.questions?.length || 0), 0);
  const pend = sumGrade.filter((s) => ids.has(s.schedId));
  $('statPendingGrading').innerText = pend.length;
  $('statOnlineStudents').innerText = sumOn.filter((s) => ids.has(s.schedId)).length;
  $('summaryExamsList').innerHTML = todays.length ? todays.map((s) => `<div class="flex justify-between items-center border rounded-lg p-2.5 text-xs">
    <div><strong>${esc(s.title)}</strong><span class="block text-[10px] text-slate-500">${esc((s.classes || []).join(', '))} • ${esc(s.startTime || '')} • ${s.duration} mnt</span></div>
    <button onclick="openMonitoring('${s.id}')" class="btn btn-sm btn-blue">Pantau</button></div>`).join('') : '<p class="text-xs text-slate-400">Tidak ada ujian hari ini.</p>';
  const by = {}; pend.forEach((s) => (by[s.schedId] = (by[s.schedId] || 0) + 1));
  $('summaryGradingPendingList').innerHTML = Object.keys(by).length ? Object.entries(by).map(([id, n]) => `<div class="flex justify-between items-center border rounded-lg p-2.5 text-xs">
    <span><strong>${esc(schedules.find((x) => x.id === id)?.title || id)}</strong><span class="block text-[10px] text-slate-500">${n} siswa menunggu koreksi</span></span>
    <button onclick="openGrading('${id}')" class="btn btn-sm btn-amber">Koreksi</button></div>`).join('') : '<p class="text-xs text-slate-400">Tidak ada yang perlu dikoreksi.</p>';
}
window.openMonitoring = (id) => { window.switchTeacherTab('tabMonitoring'); $('monitorExamSelect').value = id; window.renderMonitoringData(); };
window.openGrading = (id) => { window.switchTeacherTab('tabGrading'); $('gradingExamSelect').value = id; window.renderGradingModule(); };

// ------------------------------------------------------------------
// 2. BANK SOAL
// ------------------------------------------------------------------
function renderPackageGrid() {
  const grid = $('packageGrid'); if (!grid) return;
  const list = myPackages();
  grid.innerHTML = list.length ? list.map((p) => `<div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition ${p.id === activePackageId ? 'ring-2 ring-blue-700' : ''}">
    <div class="flex justify-between items-start gap-2"><h4 class="font-bold text-slate-800 text-xs uppercase">${esc(p.title)}</h4>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${esc(p.status)}</span></div>
    <p class="text-[10px] text-slate-500">Mapel: ${esc((p.subject || '').toUpperCase())} | Target: ${esc(p.targetClass)} | Jml Soal: ${p.questions?.length || 0}</p>
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
    await addDoc(collection(db, 'packages'), { title, subject: $('pkgSubjectSelect').value, targetClass: $('pkgClassSelect').value, status: 'Draft', questions: [], createdBy: me.uid, createdAt: Date.now() });
    $('pkgNameInput').value = ''; window.closeCreatePackageModal(); logActivity(`Membuat paket soal: ${title}`);
  } catch (err) { alert('Gagal menyimpan paket soal: ' + err.message); }
};

const curPkg = () => packages.find((p) => p.id === activePackageId);
window.openPackageDetailFire = (id) => { activePackageId = id; renderPackageDetail(); renderPackageGrid(); $('packageDetailBox')?.scrollIntoView({ behavior: 'smooth' }); };

function renderPackageDetail() {
  const p = curPkg(), box = $('packageDetailBox'); if (!box) return;
  if (!p) return box.classList.add('hidden');
  box.classList.remove('hidden');
  $('activePkgTitle').innerText = `${(p.title || '').toUpperCase()} [Status: ${p.status}]`;
  $('activePkgInfo').innerText = `Mapel: ${(p.subject || '').toUpperCase()} | Target: ${p.targetClass} | Total Bobot: ${(p.questions || []).reduce((n, q) => n + (+q.score || 0), 0)}`;
  $('btnValidatePkg').onclick = () => validatePackage(p.id);
  const qs = p.questions || [];
  $('packageQuestionsList').innerHTML = qs.length ? qs.map((q, i) => {
    const err = validateQuestion(q);
    return `<div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2 ${err ? 'border-rose-300' : ''}">
    <div class="flex justify-between items-center gap-2"><strong class="text-slate-800">#${i + 1} [<span class="text-blue-900">${esc(q.type)}</span>] Bobot: ${esc(q.score || 2)} ${err ? `<span class="text-rose-600 font-semibold">⚠ ${esc(err)}</span>` : ''}</strong>
      <div class="space-x-1 shrink-0"><button onclick="openAddQuestionModal(${i})" class="btn btn-sm btn-amber">Edit</button>
        <button onclick="duplicateQuestionFire(${i})" class="btn btn-sm btn-gray">Duplikat</button><button onclick="deleteQuestionFire(${i})" class="btn btn-sm btn-red">Hapus</button></div></div>
    <p dir="auto" class="font-medium text-slate-800 whitespace-pre-wrap">${esc(q.text)}</p>
    ${q.image ? `<img src="${q.image}" class="max-h-32 rounded border" alt="">` : ''}
    ${q.options?.length ? `<div class="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pl-2">${q.options.map((o, k) => `<div dir="auto"><strong class="text-slate-800">${LETTERS[k]}.</strong> ${esc(o)}</div>`).join('')}</div>` : ''}
    <div class="text-[11px] text-slate-600 pt-1 border-t"><strong>Kunci:</strong> <code class="font-bold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">${esc(Array.isArray(q.key) ? q.key.join(', ') : q.key || '-')}</code></div></div>`;
  }).join('') : '<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal. Tambahkan manual atau impor file Word/Excel.</p>';
}

async function savePackageQuestions(questions) {
  if (JSON.stringify(questions).length > 900000) { alert('Paket terlalu besar (batas Firestore ±1 MB). Kecilkan/kurangi gambar atau pecah menjadi beberapa paket.'); return false; }
  await updateDoc(doc(db, 'packages', activePackageId), { questions, status: 'Draft', updatedAt: Date.now() });
  return true;
}

// ---- Validasi & normalisasi soal (dipakai manual, impor Word, impor Excel) ----
function validateQuestion(q) {
  if (!q.text?.trim()) return 'teks soal kosong';
  if (!(+q.score > 0)) return 'bobot harus > 0';
  if (q.type === 'PG' || q.type === 'PGK') {
    if ((q.options || []).length < 2) return 'opsi kurang dari 2';
    const keys = toArr(q.key);
    if (!keys.length || keys.some((k) => LETTERS.indexOf(k) < 0 || LETTERS.indexOf(k) >= q.options.length)) return 'kunci tidak sesuai opsi';
    if (q.type === 'PG' && keys.length !== 1) return 'PG harus satu kunci';
  } else if (q.type === 'BS') { if (!['BENAR', 'SALAH'].includes(String(q.key).toUpperCase())) return 'kunci harus BENAR/SALAH'; }
  else if (q.type === 'ISIAN') { if (!String(q.key || '').trim()) return 'kunci isian kosong'; }
  return '';
}
function buildQuestion(raw) {
  const type = String(raw.type || 'PG').trim().toUpperCase();
  if (!TYPES.includes(type)) return { error: `jenis "${raw.type}" tidak dikenal` };
  const q = { type, text: String(raw.text || '').trim(), score: parseInt(raw.score) || 2 };
  if (raw.image) q.image = raw.image;
  let key = raw.key;
  if (type === 'PG' || type === 'PGK') {
    q.options = (raw.options || []).map((o) => String(o ?? '').trim()).filter(Boolean);
    const k = [...new Set(toArr(key).map((x) => x.charAt(0)))].sort();
    q.key = type === 'PG' ? k[0] || '' : k;
  } else if (type === 'BS') {
    const k = String(key || '').trim().toUpperCase();
    q.key = ['BENAR', 'B', 'TRUE'].includes(k) ? 'BENAR' : ['SALAH', 'S', 'FALSE'].includes(k) ? 'SALAH' : k;
  } else q.key = String(key || '').trim();
  const err = validateQuestion(q);
  return err ? { error: err, q } : { q };
}

async function validatePackage(id) {
  const p = packages.find((x) => x.id === id); if (!p) return;
  const qs = p.questions || [];
  if (!qs.length) return alert('Gagal Tandai Siap: paket belum berisi butir soal!');
  const bad = qs.map((q, i) => [i + 1, validateQuestion(q)]).filter((x) => x[1]);
  if (bad.length) return alert(`Gagal Tandai Siap: ${bad.length} soal belum lengkap:\n` + bad.slice(0, 8).map(([n, e]) => `#${n}: ${e}`).join('\n'));
  await updateDoc(doc(db, 'packages', id), { status: 'Siap' });
  alert('Paket soal berhasil ditandai SIAP dan bisa dijadwalkan!');
}
window.validateAndSetPackageReady = validatePackage;

window.deletePackageFire = async function (id) {
  const used = await getDocs(query(collection(db, 'schedules'), where('packageId', '==', id)));
  if (!used.empty) return alert('Gagal Menghapus: Paket soal ini dipakai dalam Jadwal Ujian!');
  if (!confirm('Hapus paket soal ini secara permanen?')) return;
  await deleteDoc(doc(db, 'packages', id));
  if (activePackageId === id) activePackageId = null;
};
window.duplicateQuestionFire = async function (i) {
  const qs = [...(curPkg()?.questions || [])]; qs.splice(i + 1, 0, JSON.parse(JSON.stringify(qs[i]))); await savePackageQuestions(qs);
};
window.deleteQuestionFire = async function (i) {
  if (!confirm(`Hapus soal #${i + 1}?`)) return;
  const qs = [...(curPkg()?.questions || [])]; qs.splice(i, 1); await savePackageQuestions(qs);
};

// ---- Modal soal manual (tambah / edit) ----
const readOpts = () => [...document.querySelectorAll('.optInp')].map((i) => i.value);
function renderOptRows(vals) {
  $('optRows').innerHTML = vals.map((v, i) => `<div class="flex items-center gap-2"><span class="font-bold w-5 text-center">${LETTERS[i]}</span>
    <input type="text" dir="auto" class="inp flex-1 optInp" value="${esc(v)}" placeholder="Pilihan ${LETTERS[i]}">
    <button type="button" onclick="removeOptionRow(${i})" class="text-rose-600 font-bold px-1">✕</button></div>`).join('');
  $('btnAddOpt').classList.toggle('hidden', vals.length >= LETTERS.length);
}
window.addOptionRow = () => { const v = readOpts(); if (v.length < LETTERS.length) renderOptRows([...v, '']); };
window.removeOptionRow = (i) => { const v = readOpts(); if (v.length <= 2) return alert('Minimal 2 opsi.'); v.splice(i, 1); renderOptRows(v); };
window.toggleQuestionOptionsUI = function () {
  const t = $('qTypeInput').value;
  $('pgOptionsBox').classList.toggle('hidden', !(t === 'PG' || t === 'PGK'));
  const info = { PG: ['Kunci (satu huruf)', 'Contoh: C'], PGK: ['Kunci (boleh lebih dari satu)', 'Contoh: A,C,D — skor parsial: benar dikurangi salah'],
    BS: ['Kunci', 'Tulis BENAR atau SALAH'], ISIAN: ['Jawaban benar', 'Beberapa variasi jawaban dipisah tanda | , mis. zabur|Zabur'], URAIAN: ['Pedoman jawaban (opsional)', 'Tidak dinilai otomatis — dikoreksi guru'] }[t];
  $('qKeyLabel').innerText = info[0]; $('qKeyHint').innerText = info[1];
  $('qKeyInput').required = t !== 'URAIAN';
  if ((t === 'PG' || t === 'PGK') && !document.querySelector('.optInp')) renderOptRows(['', '', '', '']);
};
window.openAddQuestionModal = function (idx) {
  if (!activePackageId) return alert("Klik 'Buka Soal' pada salah satu paket terlebih dahulu!");
  const edit = Number.isInteger(idx), q = edit ? curPkg().questions[idx] : null;
  $('editQuestionIndex').value = edit ? idx : -1;
  $('modalQuestionTitle').innerText = edit ? `Edit Soal #${idx + 1}` : 'Tambah Soal Manual';
  $('qTypeInput').value = q?.type || 'PG'; $('qScoreInput').value = q?.score || 2; $('qTextInput').value = q?.text || '';
  $('qKeyInput').value = Array.isArray(q?.key) ? q.key.join(',') : q?.key || '';
  renderOptRows(q?.options?.length ? q.options : ['', '', '', '']);
  $('qImageBase64').value = q?.image || ''; setImagePreview(q?.image || '');
  window.toggleQuestionOptionsUI(); $('modalAddQuestion').classList.remove('hidden');
};
window.closeAddQuestionModal = () => $('modalAddQuestion').classList.add('hidden');
function setImagePreview(src) { $('qImagePreviewImg').src = src || ''; $('qImagePreviewContainer').classList.toggle('hidden', !src); }
window.removeQuestionImage = () => { $('qImageBase64').value = ''; $('qImageFileInput').value = ''; setImagePreview(''); };
window.handleQuestionImagePreview = function (e) {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const r = Math.min(1, 640 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/jpeg', 0.7);
    if (out.length > 150000) out = c.toDataURL('image/jpeg', 0.5);
    $('qImageBase64').value = out; setImagePreview(out); URL.revokeObjectURL(img.src);
  };
  img.onerror = () => alert('File gambar tidak dapat dibaca.');
  img.src = URL.createObjectURL(f);
};
window.handleSaveManualQuestion = async function (e) {
  e.preventDefault();
  const type = $('qTypeInput').value;
  const { q, error } = buildQuestion({ type, text: $('qTextInput').value, score: $('qScoreInput').value, image: $('qImageBase64').value,
    options: type === 'PG' || type === 'PGK' ? readOpts() : [], key: $('qKeyInput').value });
  if (error && type !== 'URAIAN') return alert('Soal belum valid: ' + error);
  const qs = [...(curPkg().questions || [])], idx = +$('editQuestionIndex').value;
  if (idx >= 0) qs[idx] = q; else qs.push(q);
  try { if (await savePackageQuestions(qs)) window.closeAddQuestionModal(); } catch (err) { alert('Gagal menyimpan soal: ' + err.message); }
};

// ---- Impor Word / Excel ----
window.openImportQuestionModal = function () {
  if (!activePackageId) return alert("Klik 'Buka Soal' pada salah satu paket terlebih dahulu!");
  importBuf = []; $('docxQuestionFile').value = ''; $('importPreviewReport').classList.add('hidden');
  $('btnSaveImportedDocx').disabled = true; $('modalImportQuestion').classList.remove('hidden');
};
window.closeImportQuestionModal = () => $('modalImportQuestion').classList.add('hidden');

window.handleProcessImportFile = function (e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  if (/\.docx$/i.test(f.name)) {
    if (typeof mammoth === 'undefined') return alert('Pustaka Mammoth.js belum dimuat. Muat ulang halaman.');
    r.onload = (ev) => mammoth.extractRawText({ arrayBuffer: ev.target.result }).then((res) => showImport(parseWordContent(res.value))).catch((err) => alert('Gagal membaca file Word: ' + err.message));
  } else {
    if (typeof XLSX === 'undefined') return alert('Pustaka XLSX belum dimuat. Muat ulang halaman.');
    r.onload = (ev) => {
      const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const pick = (row, k) => row[Object.keys(row).find((x) => x.trim().toLowerCase() === k) || ''] ?? '';
      showImport(rows.map((row) => ({ type: pick(row, 'jenis'), text: pick(row, 'soal'), options: LETTERS.split('').map((l) => pick(row, l.toLowerCase())), key: pick(row, 'kunci'), score: pick(row, 'bobot') })));
    };
  }
  r.readAsArrayBuffer(f);
};
function parseWordContent(text) {
  const raws = []; let cur = null, last = null;
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
    let m;
    if ((m = l.match(/^jenis\s*:\s*(.*)$/i))) { cur = { type: m[1], options: [] }; raws.push(cur); last = null; }
    else if (!cur) return;
    else if ((m = l.match(/^soal\s*:\s*(.*)$/i))) { cur.text = m[1]; last = 'text'; }
    else if ((m = l.match(/^([A-F])\s*[:.)]\s*(.*)$/i))) { cur.options[LETTERS.indexOf(m[1].toUpperCase())] = m[2]; last = 'opt' + LETTERS.indexOf(m[1].toUpperCase()); }
    else if ((m = l.match(/^kunci\s*:\s*(.*)$/i))) { cur.key = m[1]; last = 'key'; }
    else if ((m = l.match(/^bobot\s*:\s*(.*)$/i))) { cur.score = m[1]; last = null; }
    else if (last === 'text') cur.text += '\n' + l;                // soal beberapa baris
    else if (last?.startsWith('opt')) cur.options[+last.slice(3)] += ' ' + l;
  });
  return raws;
}
function showImport(raws) {
  importBuf = []; const lines = []; let bad = 0;
  raws.forEach((raw, i) => {
    const { q, error } = buildQuestion(raw);
    if (q && !error) importBuf.push(q);
    else if (q && q.type === 'URAIAN') importBuf.push(q);
    else { bad++; lines.push(`<div class="text-rose-600">✖ #${i + 1}: ${esc(error)}</div>`); }
  });
  const box = $('importPreviewReport'); box.classList.remove('hidden');
  box.innerHTML = `<div class="font-bold ${importBuf.length ? 'text-emerald-700' : 'text-rose-700'}">${importBuf.length} soal valid${bad ? `, ${bad} ditolak` : ''}</div>` + lines.join('') +
    importBuf.slice(0, 50).map((q, i) => `<div class="text-slate-600">#${i + 1} [${q.type}] ${esc(q.text.slice(0, 50))}…</div>`).join('');
  $('btnSaveImportedDocx').disabled = !importBuf.length;
}
window.saveImportedQuestionsDocx = async function () {
  if (!activePackageId || !importBuf.length) return alert('Tidak ada soal valid untuk disimpan!');
  try {
    if (await savePackageQuestions([...(curPkg().questions || []), ...importBuf])) {
      alert(`${importBuf.length} soal berhasil ditambahkan. Status paket kembali Draft — jangan lupa "Tandai Siap".`);
      importBuf = []; window.closeImportQuestionModal();
    }
  } catch (err) { alert('Gagal menyimpan soal: ' + err.message); }
};
window.downloadWordTemplate = function () {
  const txt = `PANDUAN FORMAT IMPOR SOAL WORD (.DOCX)\n(salin ke Word; tiap soal diawali JENIS:, opsi A–F, soal boleh beberapa baris)\n=========================================\nJENIS: PG\nSOAL: Siapakah Nabi terakhir yang diutus Allah SWT?\nA: Nabi Musa AS\nB: Nabi Isa AS\nC: Nabi Muhammad SAW\nD: Nabi Ibrahim AS\nKUNCI: C\nBOBOT: 2\n\nJENIS: PGK\nSOAL: Manakah yang termasuk Rukun Islam?\nA: Membayar Zakat\nB: Membaca Al-Qur'an setiap hari\nC: Syahadat\nD: Puasa Ramadan\nKUNCI: A, C, D\nBOBOT: 3\n\nJENIS: BS\nSOAL: Al-Qur'an terdiri dari 114 Surah.\nKUNCI: BENAR\nBOBOT: 2\n\nJENIS: ISIAN\nSOAL: Kitab suci yang diturunkan kepada Nabi Daud AS adalah Kitab ....\nKUNCI: zabur|Zabur\nBOBOT: 2\n\nJENIS: URAIAN\nSOAL: Jelaskan pengertian sifat Siddiq!\nKUNCI: Jujur artinya berkata sesuai fakta...\nBOBOT: 5\n`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' })), download: 'Panduan_Format_Soal_Docx.txt' });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.json_to_sheet([{ Jenis: 'PG', Soal: 'Ibu kota Indonesia?', A: 'Jakarta', B: 'Bandung', C: 'Surabaya', D: 'Medan', E: '', F: '', Kunci: 'A', Bobot: 2 },
      { Jenis: 'BS', Soal: 'Matahari terbit dari timur.', A: '', B: '', C: '', D: '', E: '', F: '', Kunci: 'BENAR', Bobot: 2 }]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Soal'); XLSX.writeFile(wb, 'Template_Impor_Soal.xlsx');
  }
};

// ------------------------------------------------------------------
// 3. JADWAL UJIAN
// ------------------------------------------------------------------
function fillScheduleForm() {
  const sel = $('schedSubject'); if (!sel || !me) return;
  const keep = sel.value, mine = assignedSubjects();
  const subs = mine.length ? subjects.filter((s) => mine.includes(s.code)) : subjects;
  sel.innerHTML = subs.length ? subs.map((s) => `<option value="${esc(s.code.toUpperCase())}">${esc(s.name)} (${esc(s.code.toUpperCase())})</option>`).join('') : '<option value="">-- Belum Ada Mapel --</option>';
  if (keep) sel.value = keep;
  window.filterSchedBankOptions();
}
window.filterSchedBankOptions = function () {
  const subj = $('schedSubject').value;
  const ready = myPackages().filter((p) => p.status === 'Siap' && p.questions?.length && (!subj || (p.subject || '').toUpperCase() === subj));
  const keep = $('schedBank').value;
  $('schedBank').innerHTML = ready.length ? ready.map((p) => `<option value="${p.id}">${esc(p.title.toUpperCase())} [${p.questions.length} Soal]</option>`).join('') : '<option value="">-- Tidak ada paket Siap --</option>';
  if (keep) $('schedBank').value = keep;
  const asg = (me.teacherAssignments || []).filter((a) => !subj || a.subject.toUpperCase() === subj);
  const cls = [...new Set((asg.length ? asg : me.teacherAssignments || []).flatMap((a) => a.classes || []))];
  const checked = new Set([...document.querySelectorAll('input[name="schedCls"]:checked')].map((c) => c.value));
  $('schedClassesCheckbox').innerHTML = cls.length ? cls.map((c) => `<label class="flex items-center text-xs space-x-1.5"><input type="checkbox" name="schedCls" value="${esc(c)}" ${checked.size ? (checked.has(c) ? 'checked' : '') : 'checked'} class="rounded"><span>Kelas ${esc(c)}</span></label>`).join('')
    : '<p class="text-xs text-rose-600 font-bold p-2 bg-rose-50 rounded">Belum ada kelas ditugaskan, hubungi admin.</p>';
};
window.generateRandomToken = () => { $('schedToken').value = randomString(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'); };

const schedState = (s) => {
  if (s.active === false) return ['Nonaktif', 'bg-slate-200 text-slate-700'];
  const now = Date.now(), st = s.startAt || 0, end = st + ((s.duration || 0) + (s.lateTolerance || 0)) * 60000;
  return !st || (now >= st && now <= end) ? ['Berlangsung', 'bg-emerald-100 text-emerald-800'] : now < st ? ['Akan Datang', 'bg-blue-100 text-blue-800'] : ['Selesai', 'bg-slate-100 text-slate-600'];
};
function renderScheduleTable() {
  const tb = $('schedTableBody'); if (!tb) return;
  tb.innerHTML = schedules.length ? schedules.map((s) => { const [lbl, cls] = schedState(s); return `<tr class="border-b text-xs">
    <td class="p-2.5"><strong class="text-slate-800">${esc(s.title)}</strong> <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${cls}">${lbl}</span><br>
      <span class="text-[10px] text-slate-500">Token: <code class="font-bold text-blue-900 bg-blue-50 px-1 rounded">${esc(s.token)}</code> • ${s.packageSnapshot?.questions?.length || 0} soal</span></td>
    <td class="p-2.5">${esc((s.startTime || '').replace('T', ' ') || 'Sekarang')} (${s.duration} Mnt)</td>
    <td class="p-2.5">${esc((s.classes || []).join(', '))} | KKM: ${s.kkm}</td>
    <td class="p-2.5 text-center space-x-1"><button onclick="toggleScheduleActive('${s.id}')" class="btn btn-sm btn-gray">${s.active === false ? 'Aktifkan' : 'Nonaktifkan'}</button>
      <button onclick="triggerReScoring('${s.id}')" class="btn btn-sm btn-amber">Penilaian Ulang</button>
      <button onclick="deleteScheduleFire('${s.id}')" class="btn btn-sm btn-red">Hapus</button></td></tr>`; }).join('') : empty(4, 'Belum ada jadwal ujian yang diterbitkan.');
}

window.handleSaveSchedule = async function (e) {
  e.preventDefault();
  const pkgId = $('schedBank').value, title = $('schedTitle').value.trim(), token = $('schedToken').value.trim().toUpperCase();
  const cls = [...document.querySelectorAll('input[name="schedCls"]:checked')].map((c) => c.value);
  const pkg = packages.find((p) => p.id === pkgId);
  if (!pkg?.questions?.length) return alert('Pilih paket soal berstatus Siap!');
  if (!cls.length) return alert('Pilih minimal satu kelas peserta!');
  if (!/^[A-Z0-9]{3,8}$/.test(token)) return alert('Token 3–8 karakter huruf/angka.');
  const startTime = $('schedStartTime').value, startAt = new Date(startTime).getTime();
  if (!startAt) return alert('Isi waktu mulai ujian!');
  const dup = await getDocs(query(collection(db, 'schedules'), where('token', '==', token)));
  if (dup.docs.some((d) => d.data().active !== false)) return alert('Token sudah dipakai jadwal aktif lain. Gunakan token berbeda.');
  try {
    await addDoc(collection(db, 'schedules'), {
      title, subject: $('schedSubject').value, packageId: pkgId,
      packageSnapshot: { title: pkg.title, subject: pkg.subject, questions: pkg.questions },
      classes: cls, startTime, startAt, duration: parseInt($('schedDuration').value) || 60, kkm: parseInt($('schedKKM').value) || 75,
      maxViolations: parseInt($('schedMaxViolations').value) || 3, lateTolerance: parseInt($('schedLateTolerance').value) || 0,
      randomizeQuestions: $('schedRandomizeSoal').checked, randomizeOptions: $('schedRandomizeOpsi').checked, showResult: $('schedShowResult').checked,
      token, active: true, createdBy: me.uid, createdByName: me.name || '', createdAt: Date.now() });
    logActivity(`Menerbitkan jadwal ujian: ${title} (token ${token})`);
    alert('Jadwal ujian berhasil diterbitkan!'); $('schedTitle').value = ''; window.generateRandomToken();
  } catch (err) { alert('Gagal menerbitkan jadwal: ' + err.message); }
};
window.toggleScheduleActive = async (id) => { const s = schedules.find((x) => x.id === id); if (s) await updateDoc(doc(db, 'schedules', id), { active: s.active === false }); };
window.deleteScheduleFire = async function (id) {
  const sess = await getDocs(query(collection(db, 'sessions'), where('schedId', '==', id)));
  if (!confirm(`Hapus jadwal ini${sess.size ? ` beserta ${sess.size} data jawaban/nilai siswa` : ''}? Tindakan tidak dapat dibatalkan.`)) return;
  await runChunks(sess.docs, (d) => deleteDoc(d.ref), 25); await deleteDoc(doc(db, 'schedules', id));
  logActivity(`Menghapus jadwal ujian ${id}`);
};
window.triggerReScoring = async function (id) {
  const s = schedules.find((x) => x.id === id); if (!s) return;
  if (!confirm('Penilaian ulang akan memuat ulang soal & kunci terbaru dari paket, lalu menghitung ulang nilai semua siswa. Lanjutkan?')) return;
  const pkg = packages.find((p) => p.id === s.packageId);
  if (pkg?.questions?.length) { s.packageSnapshot = { title: pkg.title, subject: pkg.subject, questions: pkg.questions }; await updateDoc(doc(db, 'schedules', id), { packageSnapshot: s.packageSnapshot }); }
  const snap = await getDocs(query(collection(db, 'sessions'), where('schedId', '==', id)));
  const targets = snap.docs.filter((d) => d.data().status === 'Selesai');
  await runChunks(targets, (d) => updateDoc(d.ref, resultFields(sessResult(s, d.data()))), 25);
  alert(`Penilaian ulang selesai untuk ${targets.length} siswa.`); logActivity(`Penilaian ulang ujian: ${s.title}`);
};

function fillExamSelects() {
  [['monitorExamSelect', 'Pilih Ujian Untuk Memantau'], ['gradingExamSelect', 'Pilih Ujian Untuk Penilaian'], ['reportExamSelect', 'Pilih Ujian Untuk Laporan']].forEach(([id, label]) => {
    const el = $(id); if (!el) return; const keep = el.value;
    el.innerHTML = `<option value="">-- ${label} --</option>` + schedules.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('');
    if (keep && schedules.some((s) => s.id === keep)) el.value = keep;
  });
}
const schedOf = (id) => schedules.find((s) => s.id === id);
const sessionsListener = (key, schedId, cb) => listen(key, query(collection(db, 'sessions'), where('schedId', '==', schedId)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

// ------------------------------------------------------------------
// 4. MONITORING
// ------------------------------------------------------------------
async function getRoster() {
  if (rosterCache && Date.now() - rosterCache.t < 300000) return rosterCache.list;
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'siswa')));
  rosterCache = { t: Date.now(), list: snap.docs.map((d) => ({ uid: d.id, name: d.data().name, username: d.data().username, class: d.data().class })) };
  return rosterCache.list;
}
window.renderMonitoringData = async function () {
  monSched = $('monitorExamSelect').value; const s = schedOf(monSched);
  if (!s) { stopListen('monSessions'); $('monitoringTableBody').innerHTML = empty(6, 'Pilih ujian untuk memantau.'); return; }
  const roster = (await getRoster()).filter((u) => (s.classes || []).includes(u.class)).sort((a, b) => (a.class + a.name).localeCompare(b.class + b.name));
  const total = s.packageSnapshot?.questions?.length || 0;
  sessionsListener('monSessions', monSched, (sess) => {
    const by = Object.fromEntries(sess.map((x) => [x.uid, x])); const c = { pending: 0, ongoing: 0, finished: 0, locked: 0 };
    $('monitoringTableBody').innerHTML = roster.map((u) => {
      const x = by[u.uid], st = x?.status || 'Belum Masuk';
      if (!x) c.pending++; else if (st === 'Mengerjakan') c.ongoing++; else if (st === 'Selesai') c.finished++; else c.locked++;
      const b = (a, cl, t) => `<button onclick="controlStudentSession('${u.uid}','${a}')" ${x ? '' : 'disabled'} class="btn btn-sm ${cl}">${t}</button>`;
      return `<tr class="border-b text-xs"><td class="p-2.5 font-bold text-slate-800">${esc(u.name || u.username)}</td><td class="p-2.5">${esc(u.class || '-')}</td>
        <td class="p-2.5"><span class="px-2 py-0.5 rounded font-bold ${{ Mengerjakan: 'bg-blue-100 text-blue-800', Selesai: 'bg-emerald-100 text-emerald-800', Terkunci: 'bg-rose-100 text-rose-800' }[st] || 'bg-slate-100 text-slate-700'}">${st}</span></td>
        <td class="p-2.5 font-bold">${x?.answeredCount || 0} / ${total}</td><td class="p-2.5 font-bold text-rose-600">${x?.violations || 0}x</td>
        <td class="p-2.5 text-center space-x-1">${b('addTime', 'btn-amber', '+15 Mnt')}${b('forceSubmit', 'btn-blue', 'Paksa Kumpul')}${b('unlock', 'btn-green', 'Buka Kunci')}${b('reset', 'btn-red', 'Reset')}</td></tr>`;
    }).join('') || empty(6, 'Tidak ada siswa terdaftar pada kelas peserta.');
    $('monCountPending').innerText = c.pending; $('monCountOngoing').innerText = c.ongoing; $('monCountFinished').innerText = c.finished; $('monCountLocked').innerText = c.locked;
    $('monitoringLastUpdated').innerText = `Diperbarui ${new Date().toLocaleTimeString('id-ID')}`;
  });
};
window.controlStudentSession = async function (uid, action) {
  const s = schedOf(monSched); if (!s) return;
  const ref = doc(db, 'sessions', `${monSched}_${uid}`), snap = await getDoc(ref); if (!snap.exists()) return;
  const x = snap.data(), label = { addTime: 'menambah waktu 15 menit untuk', forceSubmit: 'mengumpulkan paksa ujian', unlock: 'membuka kunci', reset: 'MERESET (menghapus jawaban)' }[action];
  if (!confirm(`Yakin ${label} siswa ${x.name || x.username}?`)) return;
  if (action === 'addTime') await updateDoc(ref, { extraMs: (x.extraMs || 0) + 15 * 60000 });
  if (action === 'forceSubmit') await updateDoc(ref, { status: 'Selesai', finishedAt: Date.now(), ...resultFields(sessResult(s, x)) });
  if (action === 'unlock') await updateDoc(ref, { status: 'Mengerjakan', violations: 0 });
  if (action === 'reset') await deleteDoc(ref);
  logActivity(`Kontrol sesi (${action}) siswa ${x.username} pada ujian ${s.title}`);
};

// ------------------------------------------------------------------
// 5. KOREKSI URAIAN & PENINJAUAN ISIAN
// ------------------------------------------------------------------
window.renderGradingModule = function () {
  const s = schedOf($('gradingExamSelect').value), box = $('gradingContainer');
  if (!s) { stopListen('gradeSessions'); box.innerHTML = '<p class="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">Pilih ujian untuk mulai mengoreksi.</p>'; return; }
  sessionsListener('gradeSessions', s.id, (sess) => { gradeData = { sched: s, sessions: sess.filter((x) => x.status === 'Selesai') }; drawGrading(); });
};
function gradable(q, i, x) {
  if (!x.answers?.[i]) return false;
  if (q.type === 'URAIAN') return true;
  return q.type === 'ISIAN' && (x.scoreManual?.[i] != null || scoreItem(q, x.answers[i]) === 0);    // isian salah → bisa ditinjau
}
function drawGrading() {
  const { sched: s, sessions } = gradeData, qs = s.packageSnapshot?.questions || [], box = $('gradingContainer');
  const cards = sessions.map((x) => ({ x, items: qs.map((q, i) => (gradable(q, i, x) ? i : -1)).filter((i) => i >= 0) })).filter((c) => c.items.length)
    .sort((a, b) => Number(!!b.x.needsGrading) - Number(!!a.x.needsGrading) || (a.x.name || '').localeCompare(b.x.name || ''));
  if (!cards.length) { box.innerHTML = '<p class="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">Belum ada jawaban uraian atau isian yang perlu dikoreksi.</p>'; return; }
  const focus = document.activeElement?.id;
  box.innerHTML = cards.map(({ x, items }) => `<div class="border rounded-xl p-3 space-y-2 ${x.needsGrading ? 'border-amber-400 bg-amber-50/40' : ''}">
    <div class="flex justify-between items-center"><strong class="text-xs">${esc(x.name || x.username)} <span class="text-slate-400 font-normal">(${esc(x.class)})</span></strong>
      <span class="text-[10px] font-bold ${x.needsGrading ? 'text-amber-700' : 'text-emerald-700'}">${x.needsGrading ? 'Belum dikoreksi' : 'Sudah dikoreksi'} • Nilai ${x.pct ?? 0}</span></div>
    ${items.map((i) => { const q = qs[i], max = +q.score || 0, cur = x.scoreManual?.[i];
      return `<div class="bg-white border rounded-lg p-2.5 text-xs space-y-1"><p dir="auto" class="font-semibold whitespace-pre-wrap">#${i + 1} [${q.type}] ${esc(q.text)}</p>
        <p class="text-[11px] text-slate-500">Kunci/pedoman: <span dir="auto">${esc(q.key || '-')}</span></p>
        <p dir="auto" class="bg-slate-50 border rounded p-2 whitespace-pre-wrap">${esc(x.answers[i])}</p>
        <label class="text-[11px] font-bold">Skor (0–${max}): <input type="number" min="0" max="${max}" step="0.5" id="g_${x.id}_${i}" value="${cur ?? ''}" class="inp w-20 inline-block"></label></div>`; }).join('')}
    <button onclick="saveGrade('${x.id}')" class="btn btn-green">Simpan Nilai</button></div>`).join('');
  if (focus) $(focus)?.focus();
}
window.saveGrade = async function (sid) {
  const { sched: s, sessions } = gradeData, x = sessions.find((a) => a.id === sid); if (!x) return;
  const qs = s.packageSnapshot.questions, manual = { ...(x.scoreManual || {}) };
  for (let i = 0; i < qs.length; i++) {
    const el = $(`g_${sid}_${i}`); if (!el || el.value === '') continue;
    const v = parseFloat(el.value), max = +qs[i].score || 0;
    if (isNaN(v) || v < 0 || v > max) return alert(`Skor soal #${i + 1} harus antara 0 dan ${max}.`);
    manual[i] = v;
  }
  await updateDoc(doc(db, 'sessions', sid), { scoreManual: manual, ...resultFields(computeResult(qs, x.answers, manual)) });
  logActivity(`Mengoreksi jawaban ${x.username} pada ujian ${s.title}`);
};

// ------------------------------------------------------------------
// 6. LAPORAN & ANALISIS BUTIR SOAL
// ------------------------------------------------------------------
window.renderReportModule = function () {
  const s = schedOf($('reportExamSelect').value);
  if (!s) { stopListen('repSessions'); repData = { sched: null, rows: [], items: [] }; $('reportTableBody').innerHTML = empty(6, 'Pilih ujian untuk melihat laporan.'); $('reportSummaryBox').innerHTML = ''; $('itemAnalysisBox').innerHTML = ''; return; }
  sessionsListener('repSessions', s.id, (sess) => drawReport(s, sess.filter((x) => x.status === 'Selesai')));
};
const levelOf = (p) => (p >= 0.7 ? 'Mudah' : p >= 0.3 ? 'Sedang' : 'Sulit');
const discOf = (d) => (d >= 0.4 ? 'Sangat baik' : d >= 0.3 ? 'Baik' : d >= 0.2 ? 'Cukup' : 'Perlu revisi');
function drawReport(s, sess) {
  const qs = s.packageSnapshot?.questions || [];
  const rows = sess.map((x) => { const r = sessResult(s, x); return { x, r, tuntas: r.pct >= s.kkm }; }).sort((a, b) => (a.x.class + a.x.name).localeCompare(b.x.class + b.x.name));
  const pcts = rows.map((o) => o.r.pct), n = rows.length;
  $('reportTableBody').innerHTML = n ? rows.map(({ x, r, tuntas }) => `<tr class="border-b text-xs"><td class="p-2.5 font-bold">${esc(x.name || x.username)}</td><td class="p-2.5">${esc(x.class || '-')}</td>
    <td class="p-2.5">${r.auto.toFixed(1)}</td><td class="p-2.5">${r.man.toFixed(1)}${r.pending ? ` <span class="text-amber-600">(+${r.pending} belum)</span>` : ''}</td>
    <td class="p-2.5 font-bold text-blue-900">${r.pct.toFixed(1)}</td><td class="p-2.5"><span class="px-2 py-0.5 rounded font-bold ${tuntas ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${tuntas ? 'TUNTAS' : 'REMEDIAL'}</span></td></tr>`).join('') : empty(6, 'Belum ada siswa yang menyelesaikan ujian.');
  const avg = n ? pcts.reduce((a, b) => a + b, 0) / n : 0;
  const card = (l, v) => `<div class="bg-slate-50 border rounded-lg p-2"><span class="block text-[10px] text-slate-500 font-bold uppercase">${l}</span><strong class="text-lg text-blue-900">${v}</strong></div>`;
  $('reportSummaryBox').innerHTML = card('Peserta', n) + card('Rata-rata', avg.toFixed(1)) + card('Tertinggi', n ? Math.max(...pcts).toFixed(1) : '-') + card('Terendah', n ? Math.min(...pcts).toFixed(1) : '-') + card('Ketuntasan', n ? Math.round(rows.filter((o) => o.tuntas).length / n * 100) + '%' : '-');
  // analisis butir (objektif saja)
  const sorted = [...rows].sort((a, b) => b.r.pct - a.r.pct), k = Math.max(1, Math.round(n * 0.27)), top = sorted.slice(0, k), bot = sorted.slice(-k);
  const ratio = (list, i) => list.reduce((a, o) => a + scoreItem(qs[i], o.x.answers?.[i]) / (+qs[i].score || 1), 0) / (list.length || 1);
  const items = qs.map((q, i) => (q.type === 'URAIAN' ? null : { no: i + 1, type: q.type, text: q.text, p: n ? ratio(rows, i) : 0, d: n >= 5 ? ratio(top, i) - ratio(bot, i) : null })).filter(Boolean);
  repData = { sched: s, rows, items };
  $('itemAnalysisBox').innerHTML = n ? `<h4 class="font-bold text-xs text-slate-700 pt-3 border-t">Analisis Butir Soal (objektif)</h4><div class="overflow-x-auto"><table class="w-full text-xs text-left text-slate-600">
    <thead class="bg-slate-100 font-bold uppercase"><tr><th class="p-2">No</th><th class="p-2">Soal</th><th class="p-2">% Benar</th><th class="p-2">Kesulitan</th><th class="p-2">Daya Pembeda</th></tr></thead><tbody>
    ${items.map((it) => `<tr class="border-b"><td class="p-2 font-bold">${it.no}</td><td class="p-2" dir="auto">${esc(it.text.slice(0, 70))}</td><td class="p-2">${Math.round(it.p * 100)}%</td><td class="p-2">${levelOf(it.p)}</td>
      <td class="p-2">${it.d == null ? '<span class="text-slate-400">min. 5 peserta</span>' : `${it.d.toFixed(2)} (${discOf(it.d)})`}</td></tr>`).join('')}</tbody></table></div>` : '';
}
const reportMatrix = () => repData.rows.map(({ x, r, tuntas }, i) => [i + 1, x.name || x.username, x.nisn || '', x.class || '', +r.auto.toFixed(1), +r.man.toFixed(1), +r.pct.toFixed(1), tuntas ? 'TUNTAS' : 'REMEDIAL']);
const REPORT_HEAD = ['No', 'Nama', 'NISN', 'Kelas', 'Skor Otomatis', 'Skor Manual', 'Nilai Akhir', 'Keterangan'];
window.exportResultsToExcel = function () {
  if (!repData.sched || !repData.rows.length) return alert('Pilih ujian yang sudah memiliki hasil terlebih dahulu.');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([REPORT_HEAD, ...reportMatrix()]), 'Nilai');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repData.items.map((i) => ({ No: i.no, Jenis: i.type, Soal: i.text, 'Persen Benar': Math.round(i.p * 100), Kesulitan: levelOf(i.p), 'Daya Pembeda': i.d == null ? '' : +i.d.toFixed(2) }))), 'Analisis Butir');
  XLSX.writeFile(wb, `Nilai_${repData.sched.title.replace(/[^\w-]+/g, '_')}.xlsx`);
};
window.exportResultsToPDF = function () {
  if (!repData.sched || !repData.rows.length) return alert('Pilih ujian yang sudah memiliki hasil terlebih dahulu.');
  if (!window.jspdf) return alert('Pustaka jsPDF belum dimuat. Muat ulang halaman.');
  const pdf = new window.jspdf.jsPDF(), s = window.CBT.getSettings();
  pdf.setFontSize(13); pdf.text(s.schoolName || "SMP Qur'an Al Wahdah", 14, 15);
  pdf.setFontSize(10); pdf.text(`Laporan Nilai: ${repData.sched.title} (KKM ${repData.sched.kkm})`, 14, 22);
  pdf.autoTable({ head: [REPORT_HEAD], body: reportMatrix(), startY: 27, styles: { fontSize: 8 }, headStyles: { fillColor: [30, 58, 138] } });
  pdf.save(`Nilai_${repData.sched.title.replace(/[^\w-]+/g, '_')}.pdf`);
};

// ==================================================================
// MESIN UJIAN SISWA
// ==================================================================
let ex = null;       // { sched, sid, ref, sess, order, cur, timer, saveT, lastViol }

window.initStudentView = (u) => { const w = $('studentWelcome'); if (w) w.innerText = `${u.name} • Kelas ${u.class || '-'}`; };

window.validateStudentToken = async function () {
  const u = window.CBT.getSession(), token = $('studentTokenInput').value.trim().toUpperCase();
  if (!token) return alert('Masukkan token ujian!');
  try {
    const snap = await getDocs(query(collection(db, 'schedules'), where('token', '==', token)));
    const s = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((x) => x.active !== false && (x.classes || []).includes(u.class));
    if (!s) return alert('Token tidak valid, ujian tidak aktif, atau bukan untuk kelas Anda.');
    const now = Date.now(), sid = `${s.id}_${u.uid}`, ref = doc(db, 'sessions', sid), got = await getDoc(ref);
    if (got.exists() && got.data().status === 'Selesai') return alert('Anda sudah menyelesaikan ujian ini. Hubungi guru/pengawas bila perlu mengulang.');
    if (!got.exists()) {
      if (s.startAt && now < s.startAt) return alert(`Ujian belum dimulai. Mulai: ${(s.startTime || '').replace('T', ' ')}`);
      if (s.startAt && s.lateTolerance > 0 && now > s.startAt + s.lateTolerance * 60000) return alert('Waktu masuk ujian telah lewat (melebihi toleransi keterlambatan). Hubungi pengawas.');
    }
    const qs = s.packageSnapshot?.questions || [];
    let sess = got.data();
    if (!sess) {
      const order = qs.map((_, i) => i), optOrder = {};
      qs.forEach((q, i) => { if (s.randomizeOptions && (q.type === 'PG' || q.type === 'PGK')) optOrder[i] = shuffle(q.options.map((_, k) => k)); });
      sess = { schedId: s.id, uid: u.uid, username: u.username, name: u.name, class: u.class || '', nisn: u.nisn || '', status: 'Mengerjakan', answers: {}, doubt: {}, answeredCount: 0,
        violations: 0, startedAt: now, extraMs: 0, order: s.randomizeQuestions ? shuffle(order) : order, optOrder, needsGrading: false };
      await setDoc(ref, sess);
      logActivity(`Memulai ujian: ${s.title}`);
    }
    startExam(s, sid, ref, sess);
  } catch (err) { alert('Gagal memulai ujian: ' + err.message); }
};

function startExam(sched, sid, ref, sess) {
  ex = { sched, sid, ref, sess: { answers: {}, doubt: {}, ...sess }, cur: 0, lastViol: 0, qs: sched.packageSnapshot?.questions || [] };
  $('viewStudent').classList.add('hidden'); $('viewExam').classList.remove('hidden'); $('examOverlay').classList.add('hidden');
  $('examTitle').innerText = sched.title; $('examStudentInfo').innerText = `${sess.name} • Kelas ${sess.class}`;
  $('btnPrevQ').onclick = () => goTo(ex.cur - 1); $('btnNextQ').onclick = () => goTo(ex.cur + 1);
  $('btnDoubt').onclick = () => { const q = ex.sess.order[ex.cur]; ex.sess.doubt[q] = !ex.sess.doubt[q]; markDirty(); drawNav(); drawQuestion(); };
  $('btnFinishExam').onclick = () => finishExam(false);
  document.documentElement.requestFullscreen?.().catch(() => {});
  window.addEventListener('beforeunload', warnLeave);
  document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', onBlur);
  document.addEventListener('fullscreenchange', onFs);
  ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.addEventListener(t, blockEvt));
  listen('mySession', ref, (snap) => {
    if (!ex) return;
    if (!snap.exists()) { alert('Sesi ujian Anda direset oleh guru.'); return leaveExam(); }
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.data(); ex.sess.extraMs = d.extraMs || 0; ex.sess.violations = d.violations || 0;
    if (d.status === 'Selesai' && ex.sess.status !== 'Selesai') { ex.sess.status = 'Selesai'; clearInterval(ex.timer); return showResult(d); }
    if (d.status !== ex.sess.status) { ex.sess.status = d.status; if (d.status === 'Terkunci') showLocked(); else $('examOverlay').classList.add('hidden'); }
    drawViolations();
  });
  ex.timer = setInterval(tick, 1000); tick();
  if (sess.status === 'Terkunci') showLocked();
  drawNav(); drawQuestion(); drawViolations();
}
const warnLeave = (e) => { if (ex && ex.sess.status !== 'Selesai') { e.preventDefault(); e.returnValue = ''; } };
const blockEvt = (e) => { if (ex) e.preventDefault(); };
const deadline = () => ex.sess.startedAt + ex.sched.duration * 60000 + (ex.sess.extraMs || 0);
function tick() {
  if (!ex || ex.sess.status === 'Selesai') return;
  const left = deadline() - Date.now();
  $('examTimer').innerText = clock(left); $('examTimer').classList.toggle('bg-rose-600', left < 300000);
  if (left <= 0) finishExam(true);
}
function goTo(i) { if (i < 0 || i >= ex.qs.length) return; flushSave(); ex.cur = i; drawQuestion(); drawNav(); }
function drawNav() {
  $('examNav').innerHTML = ex.sess.order.map((qi, pos) => `<button class="nav-q ${isAnswered(qi) ? 'answered' : ''} ${ex.sess.doubt[qi] ? 'doubt' : ''} ${pos === ex.cur ? 'current' : ''}" onclick="examGo(${pos})">${pos + 1}</button>`).join('');
}
window.examGo = (p) => goTo(p);
const isAnswered = (qi) => { const a = ex.sess.answers[qi]; return Array.isArray(a) ? a.length > 0 : a != null && String(a).trim() !== ''; };

function drawQuestion() {
  const qi = ex.sess.order[ex.cur], q = ex.qs[qi], a = ex.sess.answers[qi], total = ex.qs.length;
  $('examQNo').innerText = `Soal ${ex.cur + 1} dari ${total}`;
  $('examQMeta').innerText = { PG: 'Pilih satu jawaban', PGK: 'Pilih satu atau lebih jawaban', BS: 'Pilih Benar atau Salah', ISIAN: 'Isi jawaban singkat', URAIAN: 'Jawab dengan uraian' }[q.type] + ` • Bobot ${q.score}`;
  $('btnDoubt').classList.toggle('btn-gray', !ex.sess.doubt[qi]); $('btnDoubt').classList.toggle('btn-amber', !!ex.sess.doubt[qi]);
  $('btnPrevQ').disabled = ex.cur === 0; $('btnNextQ').disabled = ex.cur === total - 1;
  let body = `<p dir="auto" class="text-sm font-medium text-slate-800 whitespace-pre-wrap leading-relaxed">${esc(q.text)}</p>${q.image ? `<img src="${q.image}" class="max-h-64 rounded border" alt="">` : ''}`;
  if (q.type === 'PG' || q.type === 'PGK') {
    const ord = ex.sess.optOrder?.[qi] || q.options.map((_, k) => k), sel = toArr(a ?? []);
    body += ord.map((orig, pos) => `<div class="opt-row ${sel.includes(LETTERS[orig]) ? 'picked' : ''}" onclick="examPick('${LETTERS[orig]}')"><span class="font-bold w-6 shrink-0">${LETTERS[pos]}.</span><span dir="auto" class="flex-1 text-sm">${esc(q.options[orig])}</span></div>`).join('');
  } else if (q.type === 'BS') {
    body += ['BENAR', 'SALAH'].map((v) => `<div class="opt-row ${a === v ? 'picked' : ''}" onclick="examPick('${v}')"><span class="flex-1 font-bold text-sm">${v === 'BENAR' ? 'Benar' : 'Salah'}</span></div>`).join('');
  } else if (q.type === 'ISIAN') body += `<input id="examText" dir="auto" class="inp text-sm py-2" placeholder="Ketik jawaban…" value="${esc(a || '')}" autocomplete="off">`;
  else body += `<textarea id="examText" dir="auto" rows="8" class="inp text-sm" placeholder="Tulis jawaban Anda…">${esc(a || '')}</textarea>`;
  $('examQBody').innerHTML = body;
  const t = $('examText'); if (t) t.oninput = () => setAnswer(qi, t.value);
}
window.examPick = function (val) {
  const qi = ex.sess.order[ex.cur], q = ex.qs[qi];
  if (q.type === 'PGK') { const s = new Set(toArr(ex.sess.answers[qi] ?? [])); s.has(val) ? s.delete(val) : s.add(val); setAnswer(qi, [...s].sort()); }
  else setAnswer(qi, val);
  drawQuestion();
};
function setAnswer(qi, v) {
  if (v === '' || (Array.isArray(v) && !v.length)) delete ex.sess.answers[qi]; else ex.sess.answers[qi] = v;
  markDirty(); drawNav();
}
function markDirty() { $('examSaveState').innerText = 'Menyimpan…'; clearTimeout(ex.saveT); ex.saveT = setTimeout(flushSave, 1500); }
async function flushSave() {
  if (!ex || ex.sess.status === 'Selesai') return;
  clearTimeout(ex.saveT);
  const answeredCount = ex.sess.order.filter(isAnswered).length;
  try { await updateDoc(ex.ref, { answers: ex.sess.answers, doubt: ex.sess.doubt, answeredCount, lastSeen: Date.now() }); $('examSaveState').innerText = `Tersimpan ${new Date().toLocaleTimeString('id-ID')}`; }
  catch (err) { $('examSaveState').innerText = 'Gagal menyimpan — periksa koneksi internet'; }
}

// ---- Pelanggaran ----
const onVisibility = () => { if (document.hidden) violation('Berpindah tab/aplikasi'); };
const onBlur = () => violation('Jendela ujian kehilangan fokus');
const onFs = () => { if (!document.fullscreenElement) violation('Keluar dari layar penuh'); };
async function violation(reason) {
  if (!ex || ex.sess.status !== 'Mengerjakan' || Date.now() - ex.lastViol < 3000) return;
  ex.lastViol = Date.now(); ex.sess.violations = (ex.sess.violations || 0) + 1;
  const lock = ex.sess.violations >= (ex.sched.maxViolations || 3);
  if (lock) ex.sess.status = 'Terkunci';
  try { await updateDoc(ex.ref, { violations: ex.sess.violations, lastViolation: reason, ...(lock ? { status: 'Terkunci' } : {}) }); } catch (e) { /* abaikan */ }
  drawViolations();
  if (lock) { showLocked(); logActivity(`Ujian ${ex.sched.title} terkunci (${reason})`); }
  else alert(`⚠ PELANGGARAN ${ex.sess.violations}/${ex.sched.maxViolations || 3}: ${reason}. Ujian akan terkunci bila melewati batas.`);
}
function drawViolations() {
  const el = $('examViolations'); if (!ex) return;
  el.classList.toggle('hidden', !ex.sess.violations); el.innerText = `Pelanggaran ${ex.sess.violations}/${ex.sched.maxViolations || 3}`;
}
function overlay(html) { $('examOverlayBox').innerHTML = html; $('examOverlay').classList.remove('hidden'); }
function showLocked() { overlay('<i class="fa-solid fa-lock text-4xl text-rose-600"></i><h3 class="font-bold text-lg">Ujian Terkunci</h3><p class="text-xs text-slate-600">Terlalu banyak pelanggaran. Jawaban Anda aman. Panggil pengawas/guru untuk membuka kunci.</p>'); }

// ---- Selesai ----
async function finishExam(auto) {
  if (!ex || ex.sess.status === 'Selesai') return;
  if (!auto) {
    const blank = ex.qs.length - ex.sess.order.filter(isAnswered).length, dbt = Object.values(ex.sess.doubt).filter(Boolean).length;
    if (!confirm(`Kumpulkan jawaban sekarang?${blank ? `\n• ${blank} soal belum dijawab.` : ''}${dbt ? `\n• ${dbt} soal masih ditandai ragu-ragu.` : ''}`)) return;
  }
  clearInterval(ex.timer); clearTimeout(ex.saveT);
  const r = computeResult(ex.qs, ex.sess.answers, {});
  const fields = { answers: ex.sess.answers, doubt: ex.sess.doubt, answeredCount: ex.sess.order.filter(isAnswered).length, status: 'Selesai', finishedAt: Date.now(), ...resultFields(r) };
  try { await updateDoc(ex.ref, fields); ex.sess.status = 'Selesai'; logActivity(`Menyelesaikan ujian: ${ex.sched.title}`); showResult(fields); }
  catch (err) { alert('Gagal mengirim jawaban: ' + err.message + '\nPeriksa koneksi lalu tekan "Selesai" lagi.'); ex.timer = setInterval(tick, 1000); }
}
function showResult(d) {
  const show = ex.sched.showResult;
  overlay(`<i class="fa-solid fa-circle-check text-4xl text-emerald-600"></i><h3 class="font-bold text-lg">Ujian Selesai</h3>
    ${show ? `<p class="text-3xl font-extrabold text-blue-900">${Number(d.pct || 0).toFixed(1)}</p><p class="text-xs text-slate-500">${d.needsGrading ? 'Nilai sementara — soal uraian menunggu koreksi guru.' : (d.pct >= ex.sched.kkm ? 'Tuntas' : 'Belum tuntas')}</p>` : '<p class="text-xs text-slate-600">Jawaban Anda telah tersimpan. Nilai akan diumumkan oleh guru.</p>'}
    <button onclick="leaveExam()" class="btn btn-blue w-full py-2">Keluar</button>`);
}
function leaveExam() {
  if (ex) clearInterval(ex.timer);
  stopListen('mySession');
  window.removeEventListener('beforeunload', warnLeave); document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('blur', onBlur); document.removeEventListener('fullscreenchange', onFs);
  ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.removeEventListener(t, blockEvt));
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  ex = null; $('studentTokenInput').value = ''; $('viewExam').classList.add('hidden'); $('examOverlay').classList.add('hidden'); $('viewStudent').classList.remove('hidden');
}
window.leaveExam = leaveExam;
