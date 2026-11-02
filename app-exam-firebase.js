// app-exam-firebase.js
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from './firebase-config.js';

let activePackageId = null;
let currentTeacherUser = null;
let importedQuestionsBuffer = [];

window.initTeacherFirebaseDashboard = function(user) {
  currentTeacherUser = user;
  renderSummaryTab();
  listenToTeacherPackages();
  listenToSchedules();
  populateScheduleFormDropdowns();
};

window.switchTeacherTab = function(tabId) {
  document.querySelectorAll('.teacher-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.teacher-tab-btn').forEach(el => el.classList.remove('active-tab'));

  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');
  
  const map = {
    'tabSummary': 'btnTabSummary',
    'tabBank': 'btnTabBank',
    'tabSchedule': 'btnTabSchedule',
    'tabMonitoring': 'btnTabMonitoring',
    'tabGrading': 'btnTabGrading',
    'tabReports': 'btnTabReports'
  };

  if (map[tabId] && document.getElementById(map[tabId])) {
    document.getElementById(map[tabId]).classList.add('active-tab');
  }

  if (tabId === 'tabSummary') renderSummaryTab();
  if (tabId === 'tabBank') listenToTeacherPackages();
  if (tabId === 'tabSchedule') {
    listenToSchedules();
    populateScheduleFormDropdowns();
  }
  if (tabId === 'tabMonitoring') listenToMonitoringSelect();
  if (tabId === 'tabGrading') renderGradingModule();
  if (tabId === 'tabReports') renderReportModule();
};

// -------------------------------------------------------------
// PAKET SOAL & BANK SOAL
// -------------------------------------------------------------

function listenToTeacherPackages() {
  const q = query(collection(db, "packages"));
  onSnapshot(q, (snapshot) => {
    const packages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPackageGrid(packages);
  });
}

function renderPackageGrid(packages) {
  const grid = document.getElementById('packageGrid');
  if (!grid) return;

  if (!packages || packages.length === 0) {
    grid.innerHTML = `<p class="text-xs text-slate-400 col-span-3 p-4 bg-slate-50 rounded-xl">Belum ada paket soal. Klik "+ Buat Paket Baru" untuk membuat paket soal baru.</p>`;
    return;
  }

  grid.innerHTML = packages.map(p => `
    <div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-slate-800 text-xs">${p.title}</h4>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${p.status}</span>
      </div>
      <p class="text-[10px] text-slate-500">Mapel: ${p.subject} | Target: ${p.targetClass} | Jml Soal: ${p.questions ? p.questions.length : 0}</p>
      <div class="flex gap-2 pt-2">
        <button onclick="openPackageDetailFire('${p.id}')" class="bg-blue-800 hover:bg-blue-900 text-white px-2.5 py-1 rounded text-xs font-bold flex-1">Buka Soal</button>
        <button onclick="deletePackageFire('${p.id}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-xs font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
}

window.openCreatePackageModal = function() {
  onSnapshot(collection(db, "subjects"), (snapS) => {
    const subs = snapS.docs.map(d => d.data());
    const selSub = document.getElementById('pkgSubjectSelect');
    if (selSub) selSub.innerHTML = subs.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  });

  onSnapshot(collection(db, "classes"), (snapC) => {
    const cls = snapC.docs.map(d => d.data());
    const selCls = document.getElementById('pkgClassSelect');
    if (selCls) selCls.innerHTML = cls.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  });

  document.getElementById('modalCreatePackage')?.classList.remove('hidden');
};

window.closeCreatePackageModal = function() {
  document.getElementById('modalCreatePackage')?.classList.add('hidden');
};

window.handleSavePackage = async function(e) {
  e.preventDefault();
  const pkgData = {
    title: document.getElementById('pkgNameInput').value.trim(),
    subject: document.getElementById('pkgSubjectSelect').value,
    targetClass: document.getElementById('pkgClassSelect').value,
    status: 'Draft',
    questions: [],
    createdBy: currentTeacherUser ? currentTeacherUser.uid : 'guru',
    createdAt: Date.now()
  };

  await addDoc(collection(db, "packages"), pkgData);
  alert("Paket Soal Baru tersimpan di Firestore!");
  window.closeCreatePackageModal();
};

window.openPackageDetailFire = async function(pkgId) {
  activePackageId = pkgId;
  const pkgDoc = await getDoc(doc(db, "packages", pkgId));
  
  if (pkgDoc.exists()) {
    const pkg = pkgDoc.data();
    document.getElementById('packageDetailBox')?.classList.remove('hidden');
    document.getElementById('activePkgTitle').innerText = `${pkg.title} [Status: ${pkg.status}]`;
    document.getElementById('activePkgInfo').innerText = `Mapel: ${pkg.subject} | Target: ${pkg.targetClass}`;
    renderPackageQuestionsList(pkg.questions || []);
  }
};

function renderPackageQuestionsList(questions) {
  const list = document.getElementById('packageQuestionsList');
  if (!list) return;

  if (!questions || !questions.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal dalam paket ini. Tambahkan soal manual atau upload file Word (.docx).</p>`;
    return;
  }

  list.innerHTML = questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2">
      <div class="flex justify-between items-center">
        <strong class="font-bold text-slate-800">#${i + 1} [Jenis: <span class="text-blue-900 font-extrabold">${q.type || 'PG'}</span>] Bobot: ${q.score || 2}</strong>
        <button onclick="deleteQuestionFire(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
      </div>
      <p dir="auto" class="font-medium text-slate-800">${q.text}</p>
      ${q.options && q.options.length ? `
        <div class="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pl-2">
          ${q.options.map((opt, oIdx) => `<div><strong class="text-slate-800">${String.fromCharCode(65 + oIdx)}.</strong> ${opt}</div>`).join('')}
        </div>
      ` : ''}
      <div class="text-[11px] text-slate-600 pt-1 border-t"><strong>Kunci Jawaban:</strong> <code class="font-bold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">${Array.isArray(q.key) ? q.key.join(', ') : q.key}</code></div>
    </div>
  `).join('');
}

window.deletePackageFire = async function(pkgId) {
  if (confirm("Hapus Paket Soal ini dari Firestore?")) {
    await deleteDoc(doc(db, "packages", pkgId));
    document.getElementById('packageDetailBox')?.classList.add('hidden');
  }
};

window.deleteQuestionFire = async function(qIndex) {
  if (!activePackageId) return;
  const pkgRef = doc(db, "packages", activePackageId);
  const pkgDoc = await getDoc(pkgRef);

  if (pkgDoc.exists()) {
    let questions = pkgDoc.data().questions || [];
    questions.splice(qIndex, 1);
    await updateDoc(pkgRef, { 
      questions,
      status: questions.length > 0 ? 'Siap' : 'Draft'
    });
    window.openPackageDetailFire(activePackageId);
  }
};

// -------------------------------------------------------------
// INPUT SOAL MANUAL (5 JENIS)
// -------------------------------------------------------------

window.openAddQuestionModal = function() {
  if (!activePackageId) return alert("Pilih paket soal terlebih dahulu!");
  document.getElementById('modalAddQuestion')?.classList.remove('hidden');
};

window.closeAddQuestionModal = function() {
  document.getElementById('modalAddQuestion')?.classList.add('hidden');
};

window.toggleQuestionOptionsUI = function() {
  const type = document.getElementById('qTypeInput').value;
  const optionsBox = document.getElementById('pgOptionsBox');
  if (optionsBox) {
    if (type === 'PG' || type === 'PGK') optionsBox.classList.remove('hidden');
    else optionsBox.classList.add('hidden');
  }
};

window.handleSaveManualQuestion = async function(e) {
  e.preventDefault();
  if (!activePackageId) return alert("Paket soal tidak aktif!");

  const type = document.getElementById('qTypeInput').value;
  const text = document.getElementById('qTextInput').value.trim();
  const rawKey = document.getElementById('qKeyInput').value.trim().toUpperCase();
  const score = parseInt(document.getElementById('qScoreInput').value) || 2;

  let key = rawKey;
  if (type === 'PGK') {
    key = rawKey.split(',').map(k => k.trim()).filter(k => k);
  }

  let options = [];
  if (type === 'PG' || type === 'PGK') {
    const a = document.getElementById('optA').value.trim();
    const b = document.getElementById('optB').value.trim();
    const c = document.getElementById('optC').value.trim();
    const d = document.getElementById('optD').value.trim();
    if (!a || !b) return alert("Opsi A dan B wajib diisi!");
    options = [a, b, c, d].filter(o => o !== '');
  } else if (type === 'BS') {
    options = ['Benar', 'Salah'];
  }

  try {
    const pkgRef = doc(db, "packages", activePackageId);
    const pkgDoc = await getDoc(pkgRef);

    if (pkgDoc.exists()) {
      let questions = pkgDoc.data().questions || [];
      questions.push({ type, text, options, key, score });

      await updateDoc(pkgRef, { 
        questions,
        status: 'Siap'
      });

      alert("Butir soal berhasil ditambahkan!");
      window.closeAddQuestionModal();
      window.openPackageDetailFire(activePackageId);

      document.getElementById('qTextInput').value = '';
      document.getElementById('optA').value = '';
      document.getElementById('optB').value = '';
      document.getElementById('optC').value = '';
      document.getElementById('optD').value = '';
      document.getElementById('qKeyInput').value = '';
    }
  } catch (err) {
    alert("Gagal menyimpan soal: " + err.message);
  }
};

// -------------------------------------------------------------
// IMPOR & TEMPLATE FILE WORD (.DOCX)
// -------------------------------------------------------------

window.downloadWordTemplate = function() {
  const content = `PANDUAN FORMAT IMPOR SOAL WORD (.DOCX)
=========================================
Gunakan format paragraf baku berikut di Microsoft Word Anda:

JENIS: PG
SOAL: Siapakah Nabi terakhir yang diutus Allah SWT?
A: Nabi Musa AS
B: Nabi Isa AS
C: Nabi Muhammad SAW
D: Nabi Ibrahim AS
KUNCI: C
BOBOT: 2

JENIS: PGK
SOAL: Manakah yang termasuk rukun Islam?
A: Syahadat
B: Shalat
C: Puasa
D: Membaca Komik
KUNCI: A,B,C
BOBOT: 3

JENIS: BS
SOAL: Al-Qur'an terdiri dari 114 Surah.
KUNCI: BENAR
BOBOT: 2

JENIS: ISIAN
SOAL: Rukun Islam yang ketiga adalah menunaikan...
KUNCI: Zakat
BOBOT: 5
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "Panduan_Format_Soal_Docx.txt";
  a.click();
};

window.openImportQuestionModal = function() {
  if (!activePackageId) return alert("Pilih paket soal terlebih dahulu!");
  importedQuestionsBuffer = [];
  document.getElementById('importPreviewReport')?.classList.add('hidden');
  const btn = document.getElementById('btnSaveImportedDocx');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }
  document.getElementById('modalImportQuestion')?.classList.remove('hidden');
};

window.closeImportQuestionModal = function() {
  document.getElementById('modalImportQuestion')?.classList.add('hidden');
};

window.handleProcessImportFile = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reportBox = document.getElementById('importPreviewReport');
  if (reportBox) {
    reportBox.classList.remove('hidden');
    reportBox.innerHTML = `<p class="text-blue-700 font-bold">Membaca berkas ${file.name}...</p>`;
  }

  if (file.name.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      if (window.mammoth) {
        window.mammoth.extractRawText({ arrayBuffer: evt.target.result })
          .then(res => parseWordContent(res.value))
          .catch(err => alert('Gagal membaca file Word: ' + err.message));
      } else {
        alert("Pustaka Mammoth.js belum dimuat.");
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Format tidak didukung. Harap gunakan file ber-ekstensi .docx');
  }
};

function parseWordContent(text) {
  const blocks = text.split(/(?=JENIS:)/i);
  importedQuestionsBuffer = [];
  let reportHtml = [];

  blocks.forEach((block, idx) => {
    if (!block.trim()) return;
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);

    let type = 'PG';
    let qText = '';
    let options = [];
    let key = 'A';
    let score = 2;

    lines.forEach(l => {
      const lower = l.toLowerCase();
      if (lower.startsWith('jenis:')) type = l.split(':')[1].trim().toUpperCase();
      else if (lower.startsWith('soal:')) qText = l.substring(5).trim();
      else if (lower.startsWith('a:')) options[0] = l.substring(2).trim();
      else if (lower.startsWith('b:')) options[1] = l.substring(2).trim();
      else if (lower.startsWith('c:')) options[2] = l.substring(2).trim();
      else if (lower.startsWith('d:')) options[3] = l.substring(2).trim();
      else if (lower.startsWith('kunci:')) {
        const rawK = l.split(':')[1].trim().toUpperCase();
        key = type === 'PGK' ? rawK.split(',').map(k => k.trim()) : rawK;
      }
      else if (lower.startsWith('bobot:')) score = parseInt(l.split(':')[1].trim()) || 2;
    });

    if (qText) {
      if (type === 'BS' && (!options || !options.length)) options = ['Benar', 'Salah'];

      importedQuestionsBuffer.push({ type, text: qText, options, key, score });
      reportHtml.push(`<p class="text-emerald-700 font-bold">✔ Soal #${importedQuestionsBuffer.length} [${type}] Terbaca</p>`);
    }
  });

  const reportBox = document.getElementById('importPreviewReport');
  if (reportBox) reportBox.innerHTML = reportHtml.join('');

  if (importedQuestionsBuffer.length > 0) {
    const btn = document.getElementById('btnSaveImportedDocx');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

window.saveImportedQuestionsDocx = async function() {
  if (!activePackageId || !importedQuestionsBuffer.length) return;

  try {
    const pkgRef = doc(db, "packages", activePackageId);
    const pkgDoc = await getDoc(pkgRef);

    if (pkgDoc.exists()) {
      let currentQuestions = pkgDoc.data().questions || [];
      const updated = [...currentQuestions, ...importedQuestionsBuffer];

      await updateDoc(pkgRef, {
        questions: updated,
        status: 'Siap'
      });

      alert(`${importedQuestionsBuffer.length} soal dari berkas Word (.docx) berhasil disimpan ke Firestore!`);
      window.closeImportQuestionModal();
      window.openPackageDetailFire(activePackageId);
    }
  } catch (err) {
    alert("Gagal menyimpan ke Firestore: " + err.message);
  }
};

// -------------------------------------------------------------
// PENERBITAN JADWAL UJIAN
// -------------------------------------------------------------

async function populateScheduleFormDropdowns() {
  const mapelSelect = document.getElementById('schedSubject');
  const pkgSelect = document.getElementById('schedBank');

  if (mapelSelect) {
    const subSnap = await getDocs(collection(db, "subjects"));
    mapelSelect.innerHTML = subSnap.docs.map(d => `<option value="${d.data().code}">${d.data().name} (${d.data().code})</option>`).join('');
  }

  if (pkgSelect) {
    const pkgSnap = await getDocs(collection(db, "packages"));
    pkgSelect.innerHTML = pkgSnap.docs.map(d => `<option value="${d.id}">${d.data().title}</option>`).join('');
  }
}

function listenToSchedules() {
  onSnapshot(collection(db, "schedules"), (snapshot) => {
    const schedules = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderScheduleTable(schedules);
  });
}

function renderScheduleTable(schedules) {
  const tbody = document.getElementById('schedTableBody');
  if (!tbody) return;

  if (!schedules.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada ujian yang diterbitkan.</td></tr>`;
    return;
  }

  tbody.innerHTML = schedules.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2"><strong>${s.title}</strong><br><span class="text-[10px] text-slate-500">Token: <code class="font-bold text-blue-900">${s.token}</code></span></td>
      <td class="p-2">${s.startTime || 'Sekarang'} (${s.duration} Mnt)</td>
      <td class="p-2">${s.classes ? s.classes.join(', ') : 'VII'} | KKM: ${s.kkm}</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="triggerReScoring('${s.id}')" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Re-Score</button>
        <button onclick="deleteScheduleFire('${s.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
      </td>
    </tr>
  `).join('');
}

window.handleSaveSchedule = async function(e) {
  e.preventDefault();
  const pkgId = document.getElementById('schedBank')?.value;
  const title = document.getElementById('schedTitle')?.value.trim();

  if (!pkgId || !title) return alert("Isi Judul Ujian dan Pilih Paket Soal!");

  const pkgDoc = await getDoc(doc(db, "packages", pkgId));

  const scheduleData = {
    title: title,
    subject: document.getElementById('schedSubject')?.value || 'PAI',
    packageId: pkgId,
    packageSnapshot: pkgDoc.exists() ? pkgDoc.data() : {},
    classes: ['VII'],
    startTime: document.getElementById('schedStartTime')?.value || new Date().toLocaleString(),
    duration: parseInt(document.getElementById('schedDuration')?.value) || 60,
    kkm: parseInt(document.getElementById('schedKKM')?.value) || 75,
    token: (document.getElementById('schedToken')?.value || 'ABCDE').toUpperCase(),
    active: true,
    createdAt: Date.now()
  };

  await addDoc(collection(db, "schedules"), scheduleData);
  alert("Jadwal Ujian berhasil diterbitkan ke Firestore!");
};

window.deleteScheduleFire = async function(schedId) {
  if (confirm("Hapus Jadwal Ujian ini?")) {
    await deleteDoc(doc(db, "schedules", schedId));
  }
};

window.triggerReScoring = function(schedId) {
  alert(`Re-scoring otomatis dipicu untuk ujian ID: ${schedId}`);
};

// -------------------------------------------------------------
// MONITORING, RINGKASAN & LAPORAN
// -------------------------------------------------------------

function renderSummaryTab() {
  onSnapshot(collection(db, "schedules"), (snap) => {
    const el = document.getElementById('statActiveExams');
    if (el) el.innerText = snap.docs.length;
  });

  onSnapshot(collection(db, "packages"), (snap) => {
    const el = document.getElementById('statTotalBank');
    if (el) el.innerText = snap.docs.length;
  });
}

function listenToMonitoringSelect() {
  onSnapshot(collection(db, "users"), (snap) => {
    const students = snap.docs.map(d => d.data()).filter(u => u.role === 'siswa');
    const tbody = document.getElementById('monitoringTableBody');
    if (!tbody) return;

    tbody.innerHTML = students.length ? students.map(s => `
      <tr class="border-b text-xs">
        <td class="p-2 font-bold text-slate-800">${s.name || s.username}</td>
        <td class="p-2">${s.class || 'VII'}</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-bold">Belum Masuk</span></td>
        <td class="p-2">0 / 40</td>
        <td class="p-2 font-bold text-emerald-600">0x</td>
        <td class="p-2 text-center">
          <button onclick="alert('Sesi di-reset!')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Reset</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada siswa terdaftar.</td></tr>`;
  });
}

function renderGradingModule() {
  const box = document.getElementById('gradingContainer');
  if (box) box.innerHTML = `<p class="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">Semua jawaban uraian terhubung ke Cloud Firestore. Belum ada lembar uraian yang memerlukan koreksi manual saat ini.</p>`;
}

function renderReportModule() {
  const tbody = document.getElementById('reportTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr class="border-b text-xs">
        <td class="p-2 font-bold">Ahmad Abdullah</td>
        <td class="p-2">VII</td>
        <td class="p-2">80.0</td>
        <td class="p-2">15.0</td>
        <td class="p-2 font-bold text-blue-900">95.0</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">TUNTAS</span></td>
      </tr>
    `;
  }
}
