// app-student-firebase.js — mesin ujian siswa: token, soal (termasuk bacaan & menjodohkan), timer, simpan otomatis, pelanggaran, pengumuman
import { db, collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from './firebase-config.js';
import { LETTERS, EXAM_HINT, LIMITS } from './constants.js';
import { toArr, computeResult, resultFields, buildOrder, buildOptOrder, isFilled } from './scoring.js';
import { $, esc, clock, arCls, fmtStart } from './util.js';

const { listen, stopListen, log: logActivity, getSession } = window.CBT;
const coarse = matchMedia('(pointer:coarse)').matches;       // HP/tablet: blur & fullscreen tidak dihitung pelanggaran
let ex = null;                                                // { sched, ref, sess, qs, passages, cur, timer, saveT, lastViol, fsOk, lastAnnounce }

window.initStudentView = (u) => { const w = $('studentWelcome'); if (w) w.innerText = `${u.name} • Kelas ${u.class || '-'}`; };

window.validateStudentToken = async function () {
  const u = getSession(), token = $('studentTokenInput').value.trim().toUpperCase();
  if (!token) return alert('Masukkan token ujian!');
  if (!$('studentAgree').checked) return alert('Centang kotak "Saya sudah membaca tata tertib ujian" terlebih dahulu.');
  const btn = $('btnStartExam'); btn.disabled = true;
  try {
    const snap = await getDocs(query(collection(db, 'schedules'), where('token', '==', token)));
    const s = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((x) => x.active !== false && (x.targetUids ? x.targetUids.includes(u.uid) : (x.classes || []).includes(u.class)));
    if (!s) return alert('Token tidak valid, ujian tidak aktif, atau bukan untuk Anda.');
    const now = Date.now(), ref = doc(db, 'sessions', `${s.id}_${u.uid}`), got = await getDoc(ref);
    if (got.exists() && got.data().status === 'Selesai') return alert('Anda sudah menyelesaikan ujian ini. Hubungi guru/pengawas bila perlu mengulang.');
    if (!got.exists()) {
      if (s.startAt && now < s.startAt) return alert(`Ujian belum dimulai. Mulai: ${fmtStart(s)}`);
      if (s.startAt && s.lateTolerance > 0 && now > s.startAt + s.lateTolerance * 60000 && !(s.allowLate || []).includes(u.uid)) return alert('Waktu masuk ujian telah lewat (melebihi toleransi keterlambatan). Mintalah pengawas/guru untuk mengizinkan Anda masuk, lalu coba lagi.');
    }
    const qs = s.packageSnapshot?.questions || [];
    if (!qs.length) return alert('Soal ujian ini belum tersedia. Hubungi guru.');
    let sess = got.data();
    if (!sess) {
      sess = { schedId: s.id, uid: u.uid, username: u.username, name: u.name, class: u.class || '', nisn: u.nisn || '', status: 'Mengerjakan', answers: {}, doubt: {}, answeredCount: 0,
        violations: 0, startedAt: now, extraMs: 0, order: buildOrder(qs, s.randomizeQuestions), optOrder: buildOptOrder(qs, s.randomizeOptions), needsGrading: false };
      await setDoc(ref, sess);
      logActivity(`Memulai ujian: ${s.title}`);
    }
    startExam(s, ref, sess);
  } catch (err) { alert('Gagal memulai ujian: ' + err.message); }
  finally { btn.disabled = false; }
};

function startExam(sched, ref, sess) {
  ex = { sched, ref, sess: { answers: {}, doubt: {}, optOrder: {}, ...sess }, cur: 0, lastViol: 0, fsOk: false, lastAnnounce: 0, qs: sched.packageSnapshot?.questions || [],
    passages: Object.fromEntries((sched.packageSnapshot?.passages || []).map((p) => [p.id, p])) };
  $('viewStudent').classList.add('hidden'); $('viewExam').classList.remove('hidden'); $('examOverlay').classList.add('hidden'); $('examAnnounce').classList.add('hidden');
  $('examTitle').innerText = sched.title; $('examStudentInfo').innerText = `${sess.name} • Kelas ${sess.class}`;
  $('btnPrevQ').onclick = () => goTo(ex.cur - 1); $('btnNextQ').onclick = () => goTo(ex.cur + 1);
  $('btnDoubt').onclick = () => { const q = ex.sess.order[ex.cur]; ex.sess.doubt[q] = !ex.sess.doubt[q]; markDirty(); drawNav(); drawQuestion(); };
  $('btnFinishExam').onclick = () => finishExam(false);
  $('btnToggleNav').onclick = () => $('examNavBox').classList.toggle('hidden');
  $('btnCloseAnnounce').onclick = () => $('examAnnounce').classList.add('hidden');
  if (!coarse) document.documentElement.requestFullscreen?.().then(() => (ex.fsOk = true)).catch(() => {});
  window.addEventListener('beforeunload', warnLeave);
  document.addEventListener('visibilitychange', onVisibility); window.addEventListener('blur', onBlur); document.addEventListener('fullscreenchange', onFs);
  ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.addEventListener(t, blockEvt));

  listen('mySession', ref, (snap) => {
    if (!ex) return;
    if (!snap.exists()) { ex.finishing = true; alert('Sesi ujian Anda direset oleh guru.'); return leaveExam(); }
    if (snap.metadata.hasPendingWrites) return;
    const d = snap.data(); ex.sess.extraMs = d.extraMs || 0; ex.sess.violations = d.violations || 0;
    if (d.status === 'Selesai' && ex.sess.status !== 'Selesai') { ex.sess.status = 'Selesai'; clearInterval(ex.timer); return showResult(d); }
    if (d.status !== ex.sess.status) { ex.sess.status = d.status; d.status === 'Terkunci' ? showLocked() : $('examOverlay').classList.add('hidden'); }
    drawViolations();
  });
  listen('mySched', doc(db, 'schedules', sched.id), (snap) => {                    // pengumuman pengawas real-time
    const a = snap.data()?.announcement;
    if (!ex || !a || a.ts <= ex.lastAnnounce) return;
    ex.lastAnnounce = a.ts; $('examAnnounceText').innerText = `${a.by || 'Pengawas'}: ${a.text}`; $('examAnnounce').classList.remove('hidden'); navigator.vibrate?.(200);
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
const isAnswered = (qi) => isFilled(ex.sess.answers[qi]);
function goTo(i) { if (i < 0 || i >= ex.qs.length) return; flushSave(); ex.cur = i; drawQuestion(); drawNav(); $('examScroll').scrollTo(0, 0); $('examNavBox').classList.add('hidden'); }
window.examGo = (p) => goTo(p);
function drawNav() {
  $('examNav').innerHTML = ex.sess.order.map((qi, pos) => `<button class="nav-q ${isAnswered(qi) ? 'answered' : ''} ${ex.sess.doubt[qi] ? 'doubt' : ''} ${pos === ex.cur ? 'current' : ''}" onclick="examGo(${pos})">${pos + 1}</button>`).join('');
  $('examProgress').innerText = `${ex.sess.order.filter(isAnswered).length}/${ex.qs.length} terjawab`;
}

function drawQuestion() {
  const qi = ex.sess.order[ex.cur], q = ex.qs[qi], a = ex.sess.answers[qi], total = ex.qs.length, p = q.passageId ? ex.passages[q.passageId] : null;
  $('examQNo').innerText = `Soal ${ex.cur + 1} dari ${total}`;
  $('examQMeta').innerText = `${EXAM_HINT[q.type]} • Bobot ${q.score}`;
  $('btnDoubt').classList.toggle('btn-gray', !ex.sess.doubt[qi]); $('btnDoubt').classList.toggle('btn-amber', !!ex.sess.doubt[qi]);
  $('btnPrevQ').disabled = ex.cur === 0; $('btnNextQ').disabled = ex.cur === total - 1;
  $('examPassage').classList.toggle('hidden', !p);
  $('examPassage').innerHTML = p ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 max-h-72 overflow-y-auto"><div class="text-[11px] font-bold text-amber-800">📖 ${esc(p.title)}</div>
    <p dir="auto" class="exam-text whitespace-pre-wrap leading-relaxed ${arCls(p.text)}">${esc(p.text)}</p>${p.image ? `<img src="${p.image}" class="max-h-56 rounded border" alt="">` : ''}</div>` : '';
  let body = `<p dir="auto" class="exam-text font-medium whitespace-pre-wrap leading-relaxed ${arCls(q.text)}">${esc(q.text)}</p>${q.image ? `<img src="${q.image}" class="max-h-64 max-w-full rounded border" alt="">` : ''}`;
  if (q.type === 'PG' || q.type === 'PGK') {
    const ord = ex.sess.optOrder?.[qi] || q.options.map((_, k) => k), sel = toArr(a ?? []);
    body += ord.map((orig, pos) => `<div class="opt-row ${sel.includes(LETTERS[orig]) ? 'picked' : ''}" onclick="examPick('${LETTERS[orig]}')"><span class="font-bold w-6 shrink-0">${LETTERS[pos]}.</span><span dir="auto" class="exam-text flex-1 ${arCls(q.options[orig])}">${esc(q.options[orig])}</span></div>`).join('');
  } else if (q.type === 'BS') {
    body += ['BENAR', 'SALAH'].map((v) => `<div class="opt-row ${a === v ? 'picked' : ''}" onclick="examPick('${v}')"><span class="exam-text flex-1 font-bold">${v === 'BENAR' ? 'Benar' : 'Salah'}</span></div>`).join('');
  } else if (q.type === 'JODOH') {
    const ord = ex.sess.optOrder?.[qi] || q.pairs.map((_, k) => k), cur = Array.isArray(a) ? a : [];
    body += q.pairs.map((pr, i) => `<div class="border rounded-xl p-2.5 flex flex-col sm:flex-row gap-2 sm:items-center bg-white"><span dir="auto" class="exam-text flex-1 ${arCls(pr.left)}"><b>${i + 1}.</b> ${esc(pr.left)}</span>
      <select class="inp sm:w-1/2 exam-text py-2" onchange="examMatch(${i},this.value)"><option value="">— pilih pasangan —</option>${ord.map((k) => `<option value="${k}" ${String(cur[i]) === String(k) ? 'selected' : ''}>${esc(q.pairs[k].right)}</option>`).join('')}</select></div>`).join('');
  } else if (q.type === 'ISIAN') body += `<input id="examText" dir="auto" class="inp exam-text py-2" placeholder="Ketik jawaban…" value="${esc(a || '')}" autocomplete="off">`;
  else body += `<textarea id="examText" dir="auto" rows="8" class="inp exam-text" placeholder="Tulis jawaban Anda…">${esc(a || '')}</textarea>`;
  $('examQBody').innerHTML = body;
  const t = $('examText'); if (t) t.oninput = () => setAnswer(qi, t.value);
}
window.examPick = function (val) {
  const qi = ex.sess.order[ex.cur], q = ex.qs[qi];
  if (q.type === 'PGK') { const s = new Set(toArr(ex.sess.answers[qi] ?? [])); s.has(val) ? s.delete(val) : s.add(val); setAnswer(qi, [...s].sort()); }
  else setAnswer(qi, val);
  drawQuestion();
};
window.examMatch = function (i, v) {
  const qi = ex.sess.order[ex.cur], n = ex.qs[qi].pairs.length, cur = Array.isArray(ex.sess.answers[qi]) ? ex.sess.answers[qi] : [];
  setAnswer(qi, Array.from({ length: n }, (_, k) => (k === i ? v : cur[k] ?? '')));      // tanpa redraw agar pilihan tidak tertutup
};
function setAnswer(qi, v) {
  if (!isFilled(v)) delete ex.sess.answers[qi]; else ex.sess.answers[qi] = v;
  markDirty(); drawNav();
}
function markDirty() { $('examSaveState').innerText = 'Menyimpan…'; clearTimeout(ex.saveT); ex.saveT = setTimeout(flushSave, LIMITS.saveDebounceMs); }
async function flushSave() {
  if (!ex || ex.sess.status === 'Selesai') return;
  clearTimeout(ex.saveT);
  try { await updateDoc(ex.ref, { answers: ex.sess.answers, doubt: ex.sess.doubt, answeredCount: ex.sess.order.filter(isAnswered).length, lastSeen: Date.now() }); $('examSaveState').innerText = `Tersimpan ${new Date().toLocaleTimeString('id-ID')}`; }
  catch (err) { $('examSaveState').innerText = '⚠ Gagal menyimpan — periksa koneksi internet'; }
}

// ---- Pelanggaran ----
const onVisibility = () => { if (document.hidden) violation('Berpindah tab/aplikasi'); };
const onBlur = () => { if (!coarse) violation('Jendela ujian kehilangan fokus'); };
const onFs = () => { if (!coarse && ex?.fsOk && !document.fullscreenElement) violation('Keluar dari layar penuh'); };
async function violation(reason) {
  if (!ex || ex.finishing || ex.sess.status !== 'Mengerjakan' || Date.now() - ex.lastViol < LIMITS.violationThrottleMs) return;
  ex.lastViol = Date.now(); ex.sess.violations = (ex.sess.violations || 0) + 1;
  const max = ex.sched.maxViolations || 3, lock = ex.sess.violations >= max;
  if (lock) ex.sess.status = 'Terkunci';
  if (ex.finishing) return;                                       // siswa baru menekan "Kumpulkan": jangan tulis status Terkunci
  try { await updateDoc(ex.ref, { violations: ex.sess.violations, lastViolation: reason, ...(lock ? { status: 'Terkunci' } : {}) }); } catch (e) { /* abaikan */ }
  drawViolations();
  if (lock) { showLocked(); logActivity(`Ujian ${ex.sched.title} terkunci (${reason})`); }
  else notice(`⚠ PELANGGARAN ${ex.sess.violations}/${max}: ${reason}. Ujian akan terkunci bila melewati batas.`);
}
function drawViolations() {
  if (!ex) return; const el = $('examViolations');
  el.classList.toggle('hidden', !ex.sess.violations); el.innerText = `Pelanggaran ${ex.sess.violations}/${ex.sched.maxViolations || 3}`;
}
function notice(msg) {
  $('examAnnounceText').innerText = msg; $('examAnnounce').classList.remove('hidden'); navigator.vibrate?.(200);
  clearTimeout(ex.noticeT); ex.noticeT = setTimeout(() => $('examAnnounce').classList.add('hidden'), 8000);
}
function askConfirm(title, html, yes) {                           // pengganti confirm() — tetap di dalam halaman
  return new Promise((resolve) => {
    overlay(`<h3 class="font-bold text-base text-slate-800">${title}</h3><div class="text-xs text-left text-slate-600 space-y-1">${html}</div>
      <div class="flex gap-2 pt-1"><button id="cfNo" class="btn btn-gray flex-1 py-2.5">Batal</button><button id="cfYes" class="btn btn-green flex-1 py-2.5">${yes}</button></div>`);
    const done = (v) => { $('examOverlay').classList.add('hidden'); resolve(v); };
    $('cfYes').onclick = () => done(true); $('cfNo').onclick = () => done(false);
  });
}
function overlay(html) { $('examOverlayBox').innerHTML = html; $('examOverlay').classList.remove('hidden'); }
function showLocked() { overlay('<i class="fa-solid fa-lock text-4xl text-rose-600"></i><h3 class="font-bold text-lg">Ujian Terkunci</h3><p class="text-xs text-slate-600">Terlalu banyak pelanggaran. Jawaban Anda aman. Panggil pengawas/guru untuk membuka kunci.</p>'); }

// ---- Selesai ----
async function finishExam(auto) {
  if (!ex || ex.finishing || ex.sess.status === 'Selesai') return;
  ex.finishing = true;                                            // selama proses kumpul, fokus/layar tidak dihitung pelanggaran
  if (!auto) {
    const blank = ex.qs.length - ex.sess.order.filter(isAnswered).length, dbt = Object.values(ex.sess.doubt).filter(Boolean).length;
    const ok = await askConfirm('Kumpulkan jawaban sekarang?', `<p>Setelah dikumpulkan, jawaban tidak bisa diubah.</p>${blank ? `<p class="text-rose-600 font-semibold">• ${blank} soal belum dijawab.</p>` : ''}${dbt ? `<p class="text-amber-600 font-semibold">• ${dbt} soal masih ditandai ragu-ragu.</p>` : ''}`, 'Ya, Kumpulkan');
    if (!ok) { ex.finishing = false; return; }
  }
  clearInterval(ex.timer); clearTimeout(ex.saveT);
  const fields = { answers: ex.sess.answers, doubt: ex.sess.doubt, answeredCount: ex.sess.order.filter(isAnswered).length, status: 'Selesai', finishedAt: Date.now(), ...resultFields(computeResult(ex.qs, ex.sess.answers, {})) };
  try { await updateDoc(ex.ref, fields); ex.sess.status = 'Selesai'; logActivity(`Menyelesaikan ujian: ${ex.sched.title}`); showResult(fields); }
  catch (err) {
    overlay(`<i class="fa-solid fa-wifi text-3xl text-rose-600"></i><h3 class="font-bold">Gagal mengirim jawaban</h3><p class="text-xs text-slate-600">${esc(err.message)}<br>Periksa koneksi internet lalu coba lagi. Jawaban Anda tidak hilang.</p>
      <button id="cfRetry" class="btn btn-blue w-full py-2">Coba Lagi</button>`);
    $('cfRetry').onclick = () => { $('examOverlay').classList.add('hidden'); ex.finishing = false; ex.timer = setInterval(tick, 1000); finishExam(true); };
  }
}
function showResult(d) {
  overlay(`<i class="fa-solid fa-circle-check text-4xl text-emerald-600"></i><h3 class="font-bold text-lg">Ujian Selesai</h3>
    ${ex.sched.showResult ? `<p class="text-3xl font-extrabold text-blue-900">${Number(d.pct || 0).toFixed(1)}<span class="text-sm font-bold text-slate-400"> / 100</span></p><p class="text-[11px] text-slate-500">Skor ${+((d.scoreAuto || 0) + (d.scoreManualPts || 0)).toFixed(1)} dari ${+(d.maxScore || 0).toFixed(1)}</p><p class="text-xs text-slate-500">${d.needsGrading ? 'Nilai sementara — soal uraian menunggu koreksi guru.' : (d.pct >= ex.sched.kkm ? 'Tuntas' : 'Belum tuntas')}</p>` : '<p class="text-xs text-slate-600">Jawaban Anda telah tersimpan. Nilai akan diumumkan oleh guru.</p>'}
    <button onclick="leaveExam()" class="btn btn-blue w-full py-2">Keluar</button>`);
}
function leaveExam() {
  if (ex) clearInterval(ex.timer);
  stopListen('mySession'); stopListen('mySched');
  window.removeEventListener('beforeunload', warnLeave); document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('blur', onBlur); document.removeEventListener('fullscreenchange', onFs);
  ['copy', 'cut', 'paste', 'contextmenu'].forEach((t) => document.removeEventListener(t, blockEvt));
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  ex = null; $('studentTokenInput').value = ''; $('studentAgree').checked = false;
  $('viewExam').classList.add('hidden'); $('examOverlay').classList.add('hidden'); $('viewStudent').classList.remove('hidden');
}
window.leaveExam = leaveExam;
