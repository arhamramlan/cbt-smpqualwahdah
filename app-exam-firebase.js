// app-exam-firebase.js
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
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

window.initTeacherFirebaseDashboard = function(user) {
  currentTeacherUser = user;
  listenToTeacherPackages();
  listenToSchedules();
};

// LISTEN PAKET SOAL REAL-TIME
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

// SIMPAN PAKET SOAL KE FIRESTORE
window.handleSavePackage = async function(e) {
  e.preventDefault();
  const pkgData = {
    title: document.getElementById('pkgNameInput').value.trim(),
    subject: document.getElementById('pkgSubjectSelect').value,
    targetClass: document.getElementById('pkgClassSelect').value,
    status: 'Draft',
    questions: [],
    createdBy: currentTeacherUser.uid,
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
    document.getElementById('packageDetailBox').classList.remove('hidden');
    document.getElementById('activePkgTitle').innerText = `${pkg.title} [Status: ${pkg.status}]`;
    document.getElementById('activePkgInfo').innerText = `Mapel: ${pkg.subject} | Target: ${pkg.targetClass}`;
    renderPackageQuestionsList(pkg.questions || []);
  }
};

function renderPackageQuestionsList(questions) {
  const list = document.getElementById('packageQuestionsList');
  if (!questions.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal dalam paket ini.</p>`;
    return;
  }

  list.innerHTML = questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2">
      <div class="flex justify-between">
        <strong class="font-bold text-slate-800">#${i + 1} [${q.type}] Bobot: ${q.score}</strong>
      </div>
      <p dir="auto" class="font-medium text-slate-800">${q.text}</p>
      <div class="text-[11px] text-slate-600"><strong>Kunci:</strong> <code class="font-bold text-blue-900">${Array.isArray(q.key) ? q.key.join(', ') : q.key}</code></div>
    </div>
  `).join('');
}

// MONITORING UJIAN REAL-TIME FIRESTORE
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
      <td class="p-2 text-center">
        <button onclick="listenToLiveMonitoring('${s.id}')" class="bg-blue-800 text-white px-2 py-0.5 rounded text-[10px]">Pantau Real-Time</button>
      </td>
    </tr>
  `).join('');
}

// SINKRONISASI REAL-TIME PESERTA UJIAN (MONITORING)
window.listenToLiveMonitoring = function(scheduleId) {
  const q = query(collection(db, "exam_sessions"), where("scheduleId", "==", scheduleId));
  
  onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map(d => d.data());
    const tbody = document.getElementById('monitoringTableBody');
    if (!tbody) return;

    tbody.innerHTML = sessions.map(s => `
      <tr class="border-b text-xs">
        <td class="p-2 font-bold">${s.studentName}</td>
        <td class="p-2">${s.studentClass}</td>
        <td class="p-2"><span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">${s.status}</span></td>
        <td class="p-2">${s.answeredCount} / ${s.totalQuestions}</td>
        <td class="p-2 font-bold text-rose-600">${s.violations || 0}x</td>
        <td class="p-2 text-center space-x-1">
          <button onclick="resetStudentSession('${s.studentId}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Reset Session</button>
        </td>
      </tr>
    `).join('');
  });
};
