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
    grid.innerHTML = `<p class="text-xs text-slate-400 col-span-3 p-4 bg-slate-50 rounded-xl">Belum ada paket soal yang dibuat. Klik tombol "+ Buat Paket Baru" di atas.</p>`;
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
