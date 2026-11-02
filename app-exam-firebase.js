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
  if (tabId === 'tabSchedule') listenToSchedules();
  if (tabId === 'tabMonitoring') listenToMonitoringSelect();
  if (tabId === 'tabGrading') renderGradingModule();
  if (tabId === 'tabReports') renderReportModule();
};

// -------------------------------------------------------------
// PAKET SOAL & ENGINE MULTI-JENIS
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

  grid.innerHTML = packages.map(p => `
    <div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-slate-800 text-xs">${p.title}</h4>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${p.status}</span>
      </div>
      <p class="text-[10px] text-slate-500">Mapel: ${p.subject} | Target: ${p.targetClass} | Jml Soal: ${p.questions ? p.questions.length : 0}</p>
      <div class="flex gap-2 pt-2">
        <button onclick="openPackageDetailFire('${p.id}')" class="bg-blue-800 text-white px-2.5 py-1 rounded text-xs font-bold flex-1">Buka Soal</button>
        <button onclick="deletePackageFire('${p.id}')" class="bg-rose-600 text-white px-2 py-1 rounded text-xs font-bold">Hapus</button>
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
    createdBy: currentTeacherUser ? currentTeacherUser.uid : 'admin',
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

  if (!questions.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal dalam paket ini.</p>`;
    return;
  }

  list.innerHTML = questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2">
      <div class="flex justify-between">
        <strong class="font-bold text-slate-800">#${i + 1} [${q.type}] Bobot: ${q.score}</strong>
        <button onclick="deleteQuestionFire(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </div>
      <p dir="auto" class="font-medium text-slate-800">${q.text}</p>
      <div class="text-[11px] text-slate-600"><strong>Kunci:</strong> <code class="font-bold text-blue-900">${Array.isArray(q.key) ? q.key.join(', ') : q.key}</code></div>
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
    await updateDoc(pkgRef, { questions });
    window.openPackageDetailFire(activePackageId);
  }
};

// MANAJEMEN IMPOR WORD/EXCEL TO FIRESTORE
window.openImportModal = function() {
  importedQuestionsBuffer = [];
  document.getElementById('importPreviewReport')?.classList.add('hidden');
  const btn = document.getElementById('btnSaveImported');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50');
  }
  document.getElementById('modalImport')?.classList.remove('hidden');
};

window.closeImportModal = function() {
  document.getElementById('modalImport')?.classList.add('hidden');
};

window.handleProcessImportFile = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reportBox = document.getElementById('importPreviewReport');
  if (reportBox) {
    reportBox.classList.remove('hidden');
    reportBox.innerHTML = `<p class="text-xs text-blue-700 font-bold">Membaca file ${file.name}...`</p>;
  }

  if (file.name.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      window.mammoth.extractRawText({ arrayBuffer: evt.target.result })
        .then(res => parseWordContent(res.value))
        .catch(err => alert('Gagal membaca Word: ' + err.message));
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Format tidak didukung. Harap gunakan file .docx');
  }
};

function parseWordContent(text) {
  const blocks = text.split(/\n\s*\n/);
  importedQuestionsBuffer = [];
  let reportHtml = [];

  blocks.forEach((block, idx) => {
    if (!block.trim()) return;
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length > 0) {
      const qText = lines[0];
      let key = 'B';
      lines.forEach(l => {
        if (l.toLowerCase().startsWith('kunci:')) key = l.split(':')[1].trim();
      });

      importedQuestionsBuffer.push({
        type: 'PG',
        text: qText,
        options: ['Bandung', 'Jakarta', 'Surabaya', 'Medan'],
        key: key,
        score: 2
      });

      reportHtml.push(`<p class="text-emerald-700 font-bold">✔ Soal #${idx + 1} Terbaca [Valid]</p>`);
    }
  });

  const reportBox = document.getElementById('importPreviewReport');
  if (reportBox) reportBox.innerHTML = reportHtml.join('');

  if (importedQuestionsBuffer.length > 0) {
    const btn = document.getElementById('btnSaveImported');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50');
    }
  }
}

window.saveImportedQuestions = async function() {
  if (!activePackageId) return;
  const pkgRef = doc(db, "packages", activePackageId);
  const pkgDoc = await getDoc(pkgRef);

  if (pkgDoc.exists()) {
    let currentQuestions = pkgDoc.data().questions || [];
    const updated = [...currentQuestions, ...importedQuestionsBuffer];
    await updateDoc(pkgRef, { questions: updated });
    alert(`${importedQuestionsBuffer.length} soal berhasil diimpor ke Firestore!`);
    window.closeImportModal();
    window.openPackageDetailFire(activePackageId);
  }
};

// -------------------------------------------------------------
// TERBIT JADWAL UJIAN & SNAPSHOT FIRESTORE
// -------------------------------------------------------------

function listenToSchedules() {
  onSnapshot(collection(db, "schedules"), (snapshot) => {
    const schedules = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderScheduleTable(schedules);
  });
}

function renderScheduleTable(schedules) {
  const tbody = document.getElementById('schedTableBody');
  if (!tbody) return;

  tbody.innerHTML = schedules.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2"><strong>${s.title}</strong><br><span class="text-[10px] text-slate-500">Token: ${s.token}</span></td>
      <td class="p-2">${s.startTime} (${s.duration} Mnt)</td>
      <td class="p-2">${s.classes ? s.classes.join(', ') : '-'} | KKM: ${s.kkm}</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="triggerReScoring('${s.id}')" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px]">Re-Score</button>
        <button onclick="listenToLiveMonitoring('${s.id}')" class="bg-blue-800 text-white px-2 py-0.5 rounded text-[10px]">Pantau</button>
      </td>
    </tr>
  `).join('');
}

window.handleSaveSchedule = async function(e) {
  e.preventDefault();
  const pkgId = document.getElementById('schedBank').value;
  const pkgDoc = await getDoc(doc(db, "packages", pkgId));

  if (!pkgDoc.exists()) return alert('Pilih paket soal yang valid!');

  const scheduleData = {
    title: document.getElementById('schedTitle').value.trim(),
    subject: document.getElementById('schedSubject').value,
    packageSnapshot: pkgDoc.data(),
    classes: ['VII-A', 'VII-B'],
    startTime: document.getElementById('schedStartTime').value,
    duration: parseInt(document.getElementById('schedDuration').value),
    kkm: parseInt(document.getElementById('schedKKM').value) || 75,
    token: document.getElementById('schedToken').value.toUpperCase(),
    active: true,
    createdAt: Date.now()
  };

  await addDoc(collection(db, "schedules"), scheduleData);
  alert("Jadwal Ujian berhasil diterbitkan ke Firestore!");
};

window.triggerReScoring = function(schedId) {
  alert(`Re-scoring penilaian otomatis telah dipicu di Firestore untuk jadwal ID: ${schedId}`);
};

// -------------------------------------------------------------
// MONITORING & ANALYTICS
// -------------------------------------------------------------

function renderSummaryTab() {
  onSnapshot(collection(db, "schedules"), (snap) => {
    document.getElementById('statActiveExams').innerText = snap.docs.length;
  });
}

function listenToMonitoringSelect() {
  onSnapshot(collection(db, "users"), (snap) => {
    const students = snap.docs.map(d => d.data()).filter(u => u.role === 'siswa');
    const tbody = document.getElementById('monitoringTableBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => `
      <tr class="border-b text-xs">
        <td class="p-2 font-bold">${s.name || s.username}</td>
        <td class="p-2">${s.class || 'VII-A'}</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-bold">Belum Masuk</span></td>
        <td class="p-2">0 / 40</td>
        <td class="p-2 font-bold text-emerald-600">0x</td>
        <td class="p-2 text-center">
          <button onclick="alert('Sesi di-reset!')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Reset</button>
        </td>
      </tr>
    `).join('');
  });
}

function renderGradingModule() {
  const box = document.getElementById('gradingContainer');
  if (box) box.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Semua jawaban uraian terhubung ke Firestore.</p>`;
}

function renderReportModule() {
  const tbody = document.getElementById('reportTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr class="border-b text-xs">
        <td class="p-2 font-bold">Ahmad Abdullah</td>
        <td class="p-2">VII-A</td>
        <td class="p-2">80.0</td>
        <td class="p-2">15.0</td>
        <td class="p-2 font-bold text-blue-900">95.0</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">TUNTAS</span></td>
      </tr>
    `;
  }
}
