// teacher-exams.js — ringkasan, jadwal (termasuk remedial/susulan), monitoring + pengumuman, koreksi, laporan & cetak PDF
import { db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where } from './firebase-config.js';
import { LETTERS, TOKEN_CHARS, LIMITS, TYPE_LABEL } from './constants.js';
import { scoreItem, computeResult, resultFields, sessResult, buildOrder, isFilled } from './scoring.js';
import { me, subjects, classes, packages, schedules, assignedSubjects, myPackages, schedOf, on } from './teacher-state.js';
import { $, esc, empty, arCls, fmtDT, fmtStart, download, slug } from './util.js';

const { listen, stopListen, runChunks, randomString, log: logActivity } = window.CBT;
let rosterCache = null, monSched = '', gradeData = { sched: null, sessions: [] }, repData = { sched: null, rows: [], items: [], all: [] };

on('me', () => fillScheduleForm());
on('subjects', () => fillScheduleForm());
on('packages', () => { fillScheduleForm(); renderSummary(); });
on('schedules', () => { renderScheduleTable(); fillExamSelects(); renderSummary(); startSummaryListeners(); });

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
    <div><strong>${esc(s.title)}</strong><span class="block text-[10px] text-slate-500">${esc((s.classes || []).join(', '))} • ${esc(fmtStart(s))} • ${s.duration} mnt</span></div>
    <button onclick="openMonitoring('${s.id}')" class="btn btn-sm btn-blue">Pantau</button></div>`).join('') : '<p class="text-xs text-slate-400">Tidak ada ujian hari ini.</p>';
  const by = {}; pend.forEach((s) => (by[s.schedId] = (by[s.schedId] || 0) + 1));
  $('summaryGradingPendingList').innerHTML = Object.keys(by).length ? Object.entries(by).map(([id, n]) => `<div class="flex justify-between items-center border rounded-lg p-2.5 text-xs">
    <span><strong>${esc(schedules.find((x) => x.id === id)?.title || id)}</strong><span class="block text-[10px] text-slate-500">${n} siswa menunggu koreksi</span></span>
    <button onclick="openGrading('${id}')" class="btn btn-sm btn-amber">Koreksi</button></div>`).join('') : '<p class="text-xs text-slate-400">Tidak ada yang perlu dikoreksi.</p>';
}
window.openMonitoring = (id) => { window.switchTeacherTab('tabMonitoring'); $('monitorExamSelect').value = id; window.renderMonitoringData(); };
window.openGrading = (id) => { window.switchTeacherTab('tabGrading'); $('gradingExamSelect').value = id; window.renderGradingModule(); };


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
window.generateRandomToken = () => { $('schedToken').value = randomString(5, TOKEN_CHARS); };

const schedState = (s) => {
  if (s.active === false) return ['Nonaktif', 'bg-slate-200 text-slate-700'];
  const now = Date.now(), st = s.startAt || 0, end = st + ((s.duration || 0) + (s.lateTolerance || 0)) * 60000;
  return !st || (now >= st && now <= end) ? ['Berlangsung', 'bg-emerald-100 text-emerald-800'] : now < st ? ['Akan Datang', 'bg-blue-100 text-blue-800'] : ['Selesai', 'bg-slate-100 text-slate-600'];
};
function renderScheduleTable() {
  const tb = $('schedTableBody'); if (!tb) return;
  tb.innerHTML = schedules.length ? schedules.map((s) => { const [lbl, cls] = schedState(s); return `<tr class="border-b text-xs">
    <td class="p-2.5"><strong class="text-slate-800">${esc(s.title)}</strong> <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${cls}">${lbl}</span>${s.kind ? ` <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-800">${s.kind === 'remedial' ? 'Remedial' : 'Susulan'} • ${(s.targetUids || []).length} siswa</span>` : ''}<br>
      <span class="text-[10px] text-slate-500">Token: <code class="font-bold text-blue-900 bg-blue-50 px-1 rounded">${esc(s.token)}</code> • ${s.packageSnapshot?.questions?.length || 0} soal</span></td>
    <td class="p-2.5">${esc(fmtStart(s))} (${s.duration} Mnt)</td>
    <td class="p-2.5">${esc((s.classes || []).join(', '))} | KKM: ${s.kkm}</td>
    <td class="p-2.5 text-center space-x-1"><button onclick="toggleScheduleActive('${s.id}')" class="btn btn-sm btn-gray">${s.active === false ? 'Aktifkan' : 'Nonaktifkan'}</button>
      <button onclick="openFollowUpModal('susulan','${s.id}')" class="btn btn-sm btn-blue">Susulan</button>
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
  if (!(await tokenFree(token))) return alert('Token sudah dipakai jadwal aktif lain. Gunakan token berbeda.');
  try {
    await addDoc(collection(db, 'schedules'), {
      title, subject: $('schedSubject').value, packageId: pkgId,
      packageSnapshot: snapshotOf(pkg),
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
  if (pkg?.questions?.length) { s.packageSnapshot = snapshotOf(pkg); await updateDoc(doc(db, 'schedules', id), { packageSnapshot: s.packageSnapshot }); }
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
const snapshotOf = (pkg) => ({ title: pkg.title, subject: pkg.subject, questions: pkg.questions, passages: pkg.passages || [] });
const tokenFree = async (t) => !(await getDocs(query(collection(db, 'schedules'), where('token', '==', t)))).docs.some((d) => d.data().active !== false);
const sessionsListener = (key, schedId, cb) => listen(key, query(collection(db, 'sessions'), where('schedId', '==', schedId)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));


// ------------------------------------------------------------------
// 4. MONITORING
// ------------------------------------------------------------------
async function getRoster() {
  if (rosterCache && Date.now() - rosterCache.t < LIMITS.rosterTtlMs) return rosterCache.list;
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'siswa')));
  rosterCache = { t: Date.now(), list: snap.docs.map((d) => ({ uid: d.id, name: d.data().name, username: d.data().username, nisn: d.data().nisn || '', class: d.data().class })) };
  return rosterCache.list;
}
window.renderMonitoringData = async function () {
  monSched = $('monitorExamSelect').value; const s = schedOf(monSched); updateAnnounceLast();
  if (!s) { stopListen('monSessions'); $('monitoringTableBody').innerHTML = empty(6, 'Pilih ujian untuk memantau.'); return; }
  const roster = (await getRoster()).filter((u) => (s.targetUids ? s.targetUids.includes(u.uid) : (s.classes || []).includes(u.class))).sort((a, b) => (a.class + a.name).localeCompare(b.class + b.name));
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
      return `<div class="bg-white border rounded-lg p-2.5 text-xs space-y-1">${q.passageId ? `<p class="text-[10px] text-emerald-700">📖 ${esc((s.packageSnapshot.passages || []).find((p) => p.id === q.passageId)?.title || 'Bacaan')}</p>` : ''}
        <p dir="auto" class="font-semibold whitespace-pre-wrap">#${i + 1} [${q.type}] ${esc(q.text)}</p>
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
// PENGUMUMAN PENGAWAS (real-time ke semua peserta ujian)
// ------------------------------------------------------------------
function updateAnnounceLast() {
  const el = $('announceLast'); if (!el) return;
  const a = schedOf($('monitorExamSelect')?.value)?.announcement;
  el.innerText = a ? `Terakhir dikirim: "${a.text}" (${fmtDT(a.ts)})` : '';
}
on('schedules', updateAnnounceLast);
window.sendAnnouncement = async function () {
  const s = schedOf($('monitorExamSelect').value); if (!s) return alert('Pilih ujian terlebih dahulu.');
  const text = $('announceText').value.trim(); if (!text) return alert('Tulis isi pengumuman.');
  await updateDoc(doc(db, 'schedules', s.id), { announcement: { text, ts: Date.now(), by: me.name || 'Pengawas' } });
  $('announceText').value = ''; logActivity(`Pengumuman ke peserta ${s.title}: ${text}`);
};
window.clearAnnouncement = async function () {
  const s = schedOf($('monitorExamSelect').value); if (s) await updateDoc(doc(db, 'schedules', s.id), { announcement: null });
};

// ------------------------------------------------------------------
// REMEDIAL OTOMATIS & JADWAL SUSULAN PER SISWA
// ------------------------------------------------------------------
const toLocalInput = (ms) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
window.openFollowUpModal = async function (kind, schedId) {
  const s = schedOf(schedId); if (!s) return alert('Pilih ujian terlebih dahulu.');
  const roster = (await getRoster()).filter((u) => (s.targetUids ? s.targetUids.includes(u.uid) : (s.classes || []).includes(u.class))).sort((a, b) => (a.class + a.name).localeCompare(b.class + b.name));
  const snap = await getDocs(query(collection(db, 'sessions'), where('schedId', '==', s.id)));
  const by = Object.fromEntries(snap.docs.map((d) => [d.data().uid, d.data()]));
  const info = (u) => { const x = by[u.uid]; if (!x) return ['Belum mengerjakan', false]; if (x.status !== 'Selesai') return [x.status, false]; const pct = sessResult(s, x).pct; return [`Nilai ${pct.toFixed(1)}`, pct < s.kkm]; };
  const pre = (u) => { const [, low] = info(u); const x = by[u.uid]; return kind === 'remedial' ? low : !x || x.status !== 'Selesai'; };
  $('fuKind').value = kind; $('fuBase').value = s.id;
  $('fuHeading').innerText = kind === 'remedial' ? 'Buat Ujian Remedial (siswa di bawah KKM)' : 'Buat Jadwal Susulan (sakit/izin)';
  $('fuTitle').value = `${kind === 'remedial' ? 'Remedial' : 'Susulan'} - ${s.title.replace(/^(Remedial|Susulan) - /, '')}`;
  $('fuStart').value = toLocalInput(Date.now() + 3600000); $('fuDuration').value = s.duration;
  $('fuToken').value = randomString(5, TOKEN_CHARS);
  $('fuList').innerHTML = roster.length ? roster.map((u) => { const [lbl] = info(u); return `<label class="flex items-center gap-2 text-xs py-0.5"><input type="checkbox" name="fuStu" value="${u.uid}" ${pre(u) ? 'checked' : ''}>
    <span class="flex-1">${esc(u.name || u.username)} <span class="text-slate-400">(${esc(u.class)})</span></span><span class="text-[10px] text-slate-500">${esc(lbl)}</span></label>`; }).join('') : '<p class="text-xs text-slate-400">Tidak ada siswa.</p>';
  $('modalFollowUp').classList.remove('hidden');
};
window.closeFollowUpModal = () => $('modalFollowUp').classList.add('hidden');
window.fuToggleAll = (on_) => document.querySelectorAll('input[name="fuStu"]').forEach((c) => (c.checked = on_));
window.handleCreateFollowUp = async function (e) {
  e.preventDefault();
  const base = schedOf($('fuBase').value), kind = $('fuKind').value; if (!base) return;
  const uids = [...document.querySelectorAll('input[name="fuStu"]:checked')].map((c) => c.value);
  if (!uids.length) return alert('Pilih minimal satu siswa!');
  const token = $('fuToken').value.trim().toUpperCase(), startAt = new Date($('fuStart').value).getTime();
  if (!/^[A-Z0-9]{3,8}$/.test(token)) return alert('Token 3–8 karakter huruf/angka.');
  if (!startAt) return alert('Isi waktu mulai!');
  if (!(await tokenFree(token))) return alert('Token sudah dipakai jadwal aktif lain.');
  const roster = await getRoster(), cls = [...new Set(roster.filter((u) => uids.includes(u.uid)).map((u) => u.class).filter(Boolean))];
  const pkg = packages.find((p) => p.id === base.packageId), snap = pkg?.questions?.length ? snapshotOf(pkg) : base.packageSnapshot;
  try {
    await addDoc(collection(db, 'schedules'), {
      title: $('fuTitle').value.trim(), subject: base.subject, packageId: base.packageId, packageSnapshot: snap, classes: cls, targetUids: uids, kind, parentId: base.id,
      startTime: $('fuStart').value, startAt, duration: parseInt($('fuDuration').value) || base.duration, kkm: base.kkm, maxViolations: base.maxViolations, lateTolerance: base.lateTolerance || 0,
      randomizeQuestions: base.randomizeQuestions, randomizeOptions: base.randomizeOptions, showResult: base.showResult,
      token, active: true, createdBy: me.uid, createdByName: me.name || '', createdAt: Date.now() });
    logActivity(`Menerbitkan ${kind} untuk ${uids.length} siswa: ${$('fuTitle').value} (token ${token})`);
    window.closeFollowUpModal(); alert(`${kind === 'remedial' ? 'Ujian remedial' : 'Jadwal susulan'} diterbitkan untuk ${uids.length} siswa.\n\nToken: ${token}`);
  } catch (err) { alert('Gagal menerbitkan jadwal: ' + err.message); }
};

// ------------------------------------------------------------------
// 6. LAPORAN & ANALISIS BUTIR SOAL + CETAK PDF
// ------------------------------------------------------------------
window.renderReportModule = function () {
  const s = schedOf($('reportExamSelect').value);
  if (!s) { stopListen('repSessions'); repData = { sched: null, rows: [], items: [], all: [] }; $('reportTableBody').innerHTML = empty(7, 'Pilih ujian untuk melihat laporan.'); $('reportSummaryBox').innerHTML = ''; $('itemAnalysisBox').innerHTML = ''; return; }
  const f = $('reportClassFilter'), keep = f.value;
  f.innerHTML = '<option value="">Semua Kelas</option>' + (s.classes || []).map((c) => `<option>${esc(c)}</option>`).join('');
  if ((s.classes || []).includes(keep)) f.value = keep;
  repData.sched = s;
  sessionsListener('repSessions', s.id, (sess) => { repData.all = sess.filter((x) => x.status === 'Selesai'); drawReport(s); });
};
window.redrawReport = () => repData.sched && drawReport(repData.sched);
const levelOf = (p) => (p >= 0.7 ? 'Mudah' : p >= 0.3 ? 'Sedang' : 'Sulit');
const discOf = (d) => (d >= 0.4 ? 'Sangat baik' : d >= 0.3 ? 'Baik' : d >= 0.2 ? 'Cukup' : 'Perlu revisi');

function drawReport(s) {
  const qs = s.packageSnapshot?.questions || [], cls = $('reportClassFilter').value;
  const rows = repData.all.filter((x) => !cls || x.class === cls).map((x) => { const r = sessResult(s, x); return { x, r, tuntas: r.pct >= s.kkm }; }).sort((a, b) => (a.x.class + a.x.name).localeCompare(b.x.class + b.x.name));
  const pcts = rows.map((o) => o.r.pct), n = rows.length;
  $('reportTableBody').innerHTML = n ? rows.map(({ x, r, tuntas }) => `<tr class="border-b text-xs"><td class="p-2.5 font-bold">${esc(x.name || x.username)}</td><td class="p-2.5">${esc(x.class || '-')}</td>
    <td class="p-2.5">${r.auto.toFixed(1)}</td><td class="p-2.5">${r.man.toFixed(1)}${r.pending ? ` <span class="text-amber-600">(+${r.pending} belum)</span>` : ''}</td>
    <td class="p-2.5 font-bold text-blue-900">${r.pct.toFixed(1)}</td><td class="p-2.5"><span class="px-2 py-0.5 rounded font-bold ${tuntas ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${tuntas ? 'TUNTAS' : 'REMEDIAL'}</span></td>
    <td class="p-2.5"><button onclick="printStudentSheet('${x.id}')" class="btn btn-sm btn-gray"><i class="fa-solid fa-file-pdf"></i> PDF</button></td></tr>`).join('') : empty(7, 'Belum ada siswa yang menyelesaikan ujian.');
  const avg = n ? pcts.reduce((a, b) => a + b, 0) / n : 0;
  const card = (l, v) => `<div class="bg-slate-50 border rounded-lg p-2"><span class="block text-[10px] text-slate-500 font-bold uppercase">${l}</span><strong class="text-lg text-blue-900">${v}</strong></div>`;
  $('reportSummaryBox').innerHTML = card('Peserta', n) + card('Rata-rata', avg.toFixed(1)) + card('Tertinggi', n ? Math.max(...pcts).toFixed(1) : '-') + card('Terendah', n ? Math.min(...pcts).toFixed(1) : '-') + card('Ketuntasan', n ? Math.round(rows.filter((o) => o.tuntas).length / n * 100) + '%' : '-');
  const tw = Math.round(qs.reduce((x, q) => x + (+q.score || 0), 0) * 100) / 100;
  $('reportSummaryBox').innerHTML += `<p class="col-span-full text-left text-[10px] text-slate-500">Nilai Akhir = (skor otomatis + skor manual) ÷ total bobot (${tw}) × 100 → skor penuh = 100.</p>`;
  const sorted = [...rows].sort((a, b) => b.r.pct - a.r.pct), k = Math.max(1, Math.round(n * 0.27)), top = sorted.slice(0, k), bot = sorted.slice(-k);
  const ratio = (list, i) => list.reduce((a, o) => a + scoreItem(qs[i], o.x.answers?.[i]) / (+qs[i].score || 1), 0) / (list.length || 1);
  const items = qs.map((q, i) => (q.type === 'URAIAN' ? null : { no: i + 1, type: q.type, text: q.text, chapter: q.chapter || '', p: n ? ratio(rows, i) : 0, d: n >= 5 ? ratio(top, i) - ratio(bot, i) : null })).filter(Boolean);
  repData.rows = rows; repData.items = items;
  $('itemAnalysisBox').innerHTML = n ? `<h4 class="font-bold text-xs text-slate-700 pt-3 border-t">Analisis Butir Soal (objektif)</h4><div class="overflow-x-auto"><table class="w-full text-xs text-left text-slate-600">
    <thead class="bg-slate-100 font-bold uppercase"><tr><th class="p-2">No</th><th class="p-2">Soal</th><th class="p-2">Bab</th><th class="p-2">% Benar</th><th class="p-2">Kesulitan</th><th class="p-2">Daya Pembeda</th></tr></thead><tbody>
    ${items.map((it) => `<tr class="border-b"><td class="p-2 font-bold">${it.no}</td><td class="p-2" dir="auto">${esc(it.text.slice(0, 70))}</td><td class="p-2">${esc(it.chapter || '-')}</td><td class="p-2">${Math.round(it.p * 100)}%</td><td class="p-2">${levelOf(it.p)}</td>
      <td class="p-2">${it.d == null ? '<span class="text-slate-400">min. 5 peserta</span>' : `${it.d.toFixed(2)} (${discOf(it.d)})`}</td></tr>`).join('')}</tbody></table></div>` : '';
}
const REPORT_HEAD = ['No', 'Nama', 'NISN', 'Kelas', 'Skor Otomatis', 'Skor Manual', 'Nilai Akhir', 'Keterangan'];
const reportMatrix = () => repData.rows.map(({ x, r, tuntas }, i) => [i + 1, x.name || x.username, x.nisn || '', x.class || '', +r.auto.toFixed(1), +r.man.toFixed(1), +r.pct.toFixed(1), tuntas ? 'TUNTAS' : 'REMEDIAL']);
const needReport = () => (!repData.sched || !repData.rows.length ? (alert('Pilih ujian yang sudah memiliki hasil terlebih dahulu.'), false) : true);
const needPdf = () => (window.jspdf ? true : (alert('Pustaka jsPDF belum dimuat. Muat ulang halaman.'), false));
const pdfHeader = (pdf, title, sub) => { const st = window.CBT.getSettings(); pdf.setFontSize(13); pdf.text(st.schoolName || "SMP Qur'an Al Wahdah", 14, 15); pdf.setFontSize(10); pdf.text(title, 14, 22); if (sub) pdf.text(sub, 14, 28); };

window.exportResultsToExcel = function () {
  if (!needReport()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([REPORT_HEAD, ...reportMatrix()]), 'Nilai');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repData.items.map((i) => ({ No: i.no, Jenis: TYPE_LABEL[i.type] || i.type, Bab: i.chapter, Soal: i.text, 'Persen Benar': Math.round(i.p * 100), Kesulitan: levelOf(i.p), 'Daya Pembeda': i.d == null ? '' : +i.d.toFixed(2) }))), 'Analisis Butir');
  XLSX.writeFile(wb, `Nilai_${slug(repData.sched.title)}.xlsx`);
};
window.exportResultsToPDF = function () {
  if (!needReport() || !needPdf()) return;
  const pdf = new window.jspdf.jsPDF(); pdfHeader(pdf, `Laporan Nilai: ${repData.sched.title} (KKM ${repData.sched.kkm})`);
  pdf.autoTable({ head: [REPORT_HEAD], body: reportMatrix(), startY: 27, styles: { fontSize: 8 }, headStyles: { fillColor: [30, 58, 138] } });
  pdf.save(`Nilai_${slug(repData.sched.title)}.pdf`);
};

// Lembar hasil per siswa (tanpa teks soal agar aman untuk huruf Arab; berisi status per butir & ringkasan per bab)
window.printStudentSheet = function (sid) {
  const s = repData.sched, x = repData.all.find((a) => a.id === sid); if (!s || !x || !needPdf()) return;
  const qs = s.packageSnapshot.questions, r = sessResult(s, x), pdf = new window.jspdf.jsPDF();
  pdfHeader(pdf, 'LEMBAR HASIL UJIAN', s.title);
  pdf.autoTable({ startY: 33, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } }, body: [
    ['Nama', x.name || x.username], ['NISN / Kelas', `${x.nisn || '-'} / ${x.class || '-'}`], ['Mulai - Selesai', `${fmtDT(x.startedAt)} - ${fmtDT(x.finishedAt)}`],
    ['Skor', `${(r.auto + r.man).toFixed(1)} dari ${r.max} (bobot total)`], ['Nilai Akhir (skala 100)', `${r.pct.toFixed(1)}  (KKM ${s.kkm})`], ['Keterangan', r.pct >= s.kkm ? 'TUNTAS' : 'BELUM TUNTAS (REMEDIAL)'], ['Pelanggaran', `${x.violations || 0}x`]] });
  const bab = {}, rows = qs.map((q, i) => {
    const m = x.scoreManual?.[i], max = +q.score || 0, filled = isFilled(x.answers?.[i]);
    const got = m != null ? +m : q.type === 'URAIAN' ? null : scoreItem(q, x.answers?.[i]);
    const status = !filled && m == null ? 'Tidak dijawab' : got == null ? 'Menunggu koreksi' : got >= max ? 'Benar' : got === 0 ? 'Salah' : 'Sebagian';
    const b = q.chapter || 'Umum'; bab[b] ||= [0, 0]; bab[b][0] += got || 0; bab[b][1] += max;
    return [i + 1, TYPE_LABEL[q.type] || q.type, q.chapter || '-', status, `${got == null ? '-' : +got.toFixed(1)} / ${max}`];
  });
  if (Object.keys(bab).length > 1 || !bab.Umum) pdf.autoTable({ head: [['Ringkasan per Bab', 'Skor', 'Persen']], body: Object.entries(bab).map(([b, [g, m]]) => [b, `${+g.toFixed(1)} / ${m}`, `${m ? Math.round(g / m * 100) : 0}%`]), startY: pdf.lastAutoTable.finalY + 6, styles: { fontSize: 9 }, headStyles: { fillColor: [5, 150, 105] } });
  pdf.autoTable({ head: [['No', 'Jenis', 'Bab', 'Status', 'Skor']], body: rows, startY: pdf.lastAutoTable.finalY + 6, styles: { fontSize: 8 }, headStyles: { fillColor: [30, 58, 138] } });
  pdf.save(`Hasil_${slug(x.name || x.username)}_${slug(s.title)}.pdf`);
};

// Rekap per kelas untuk wali kelas (satu halaman per kelas, termasuk yang belum mengerjakan)
window.printClassRecap = async function () {
  const s = repData.sched; if (!s) return alert('Pilih ujian terlebih dahulu.'); if (!needPdf()) return;
  const roster = await getRoster(), list = $('reportClassFilter').value ? [$('reportClassFilter').value] : s.classes || [];
  const done = Object.fromEntries(repData.all.map((x) => [x.uid, x])), pdf = new window.jspdf.jsPDF();
  list.forEach((c, idx) => {
    if (idx) pdf.addPage();
    const stu = roster.filter((u) => u.class === c && (!s.targetUids || s.targetUids.includes(u.uid))).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const got = []; const body = stu.map((u, i) => { const x = done[u.uid]; if (!x) return [i + 1, u.name || u.username, u.nisn || '', '-', 'Belum mengerjakan']; const p = sessResult(s, x).pct; got.push(p); return [i + 1, u.name || u.username, u.nisn || '', p.toFixed(1), p >= s.kkm ? 'Tuntas' : 'Remedial']; });
    pdfHeader(pdf, `Rekap Nilai Kelas ${c} — ${s.title}`, `Wali Kelas: ${classes.find((k) => k.code === c)?.homeroom || '-'}   |   KKM: ${s.kkm}`);
    pdf.autoTable({ head: [['No', 'Nama', 'NISN', 'Nilai', 'Keterangan']], body, startY: 33, styles: { fontSize: 9 }, headStyles: { fillColor: [30, 58, 138] } });
    const tun = got.filter((p) => p >= s.kkm).length, y = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(10);
    pdf.text(`Peserta: ${stu.length} | Sudah mengerjakan: ${got.length} | Rata-rata: ${got.length ? (got.reduce((a, b) => a + b, 0) / got.length).toFixed(1) : '-'} | Tuntas: ${tun} | Remedial: ${got.length - tun}`, 14, y);
  });
  pdf.save(`Rekap_Kelas_${slug(s.title)}.pdf`);
};
window.openRemedial = () => (repData.sched ? window.openFollowUpModal('remedial', repData.sched.id) : alert('Pilih ujian terlebih dahulu.'));
