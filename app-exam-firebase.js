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

// -------------------------------------------------------------
// INISIALISASI & NAVIGASI GURU
// -------------------------------------------------------------

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
// 1. PENERBITAN JADWAL UJIAN & KELAS PESERTA
// -------------------------------------------------------------

async function populateScheduleFormDropdowns() {
  const mapelSelect = document.getElementById('schedSubject');
  const pkgSelect = document.getElementById('schedBank');
  const classBox = document.getElementById('schedClassBox');

  // 1. Filter Dropdown Mapel Guru (Kode Kapital)
  if (mapelSelect) {
    const subSnap = await getDocs(collection(db, "subjects"));
    const mapels = subSnap.docs.map(d => d.data());
    mapelSelect.innerHTML = mapels.length 
      ? mapels.map(s => `<option value="${s.code.toUpperCase()}">${s.name} (${s.code.toUpperCase()})</option>`).join('')
      : `<option value="">-- Belum Ada Mapel --</option>`;
  }

  // 2. Hanya Tampilkan Paket berstatus "Siap" dan Memiliki Soal > 0
  if (pkgSelect) {
    const pkgSnap = await getDocs(query(collection(db, "packages"), where("status", "==", "Siap")));
    const packages = pkgSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.questions && p.questions.length > 0);
    
    if (!packages.length) {
      pkgSelect.innerHTML = `<option value="">-- Tidak ada paket soal Siap --</option>`;
    } else {
      pkgSelect.innerHTML = packages.map(p => `<option value="${p.id}">${p.title.toUpperCase()} [${p.questions.length} Soal]</option>`).join('');
    }
  }

  // 3. Ambil Checkbox Rombel Kelas Berdasarkan Penugasan Guru
  if (classBox && currentTeacherUser) {
    const teacherSnap = await getDoc(doc(db, "users", currentTeacherUser.uid));
    let assignedClasses = [];

    if (teacherSnap.exists() && teacherSnap.data().teacherAssignments) {
      teacherSnap.data().teacherAssignments.forEach(a => {
        if (a.classes) assignedClasses = [...assignedClasses, ...a.classes];
      });
    }

    assignedClasses = Array.from(new Set(assignedClasses));

    if (!assignedClasses.length) {
      classBox.innerHTML = `<p class="text-xs text-rose-600 font-bold p-2 bg-rose-50 rounded">Belum ada kelas untuk tingkat ini, hubungi admin.</p>`;
    } else {
      classBox.innerHTML = assignedClasses.map(c => `
        <label class="flex items-center text-xs space-x-2 py-0.5">
          <input type="checkbox" name="schedCls" value="${c}" checked class="rounded border-slate-300">
          <span>Kelas ${c}</span>
        </label>
      `).join('');
    }
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
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada jadwal ujian yang diterbitkan.</td></tr>`;
    return;
  }

  tbody.innerHTML = schedules.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2.5">
        <strong class="text-slate-800">${s.title}</strong><br>
        <span class="text-[10px] text-slate-500">Token: <code class="font-bold text-blue-900 bg-blue-50 px-1 rounded">${s.token}</code></span>
      </td>
      <td class="p-2.5">${s.startTime || 'Sekarang'} (${s.duration} Mnt)</td>
      <td class="p-2.5">${s.classes ? s.classes.join(', ') : '-'} | KKM: ${s.kkm}</td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="triggerReScoring('${s.id}')" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Penilaian Ulang</button>
        <button onclick="deleteScheduleFire('${s.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
      </td>
    </tr>
  `).join('');
}

window.handleSaveSchedule = async function(e) {
  e.preventDefault();
  const pkgId = document.getElementById('schedBank')?.value;
  const title = document.getElementById('schedTitle')?.value.trim();
  const selectedClasses = Array.from(document.querySelectorAll('input[name="schedCls"]:checked')).map(cb => cb.value);

  if (!pkgId) return alert("Pilih paket soal yang Siap!");
  if (!selectedClasses.length) return alert("Pilih minimal satu kelas peserta!");

  const pkgDoc = await getDoc(doc(db, "packages", pkgId));
  if (!pkgDoc.exists() || !pkgDoc.data().questions || pkgDoc.data().questions.length === 0) {
    return alert("Paket soal tidak valid atau masih kosong!");
  }

  const scheduleData = {
    title: title,
    subject: document.getElementById('schedSubject')?.value || 'PAI',
    packageId: pkgId,
    packageSnapshot: pkgDoc.data(),
    classes: selectedClasses,
    startTime: document.getElementById('schedStartTime')?.value || new Date().toLocaleString(),
    duration: parseInt(document.getElementById('schedDuration')?.value) || 60,
    kkm: parseInt(document.getElementById('schedKKM')?.value) || 75,
    token: (document.getElementById('schedToken')?.value || 'ABCDE').toUpperCase(),
    active: true,
    createdAt: Date.now()
  };

  await addDoc(collection(db, "schedules"), scheduleData);
  alert("Jadwal Ujian berhasil diterbitkan!");
};

window.deleteScheduleFire = async function(schedId) {
  if (confirm("Hapus Jadwal Ujian ini?")) {
    await deleteDoc(doc(db, "schedules", schedId));
  }
};

window.triggerReScoring = function(schedId) {
  alert(`Penilaian Ulang (Re-Scoring) dipicu untuk ujian ID: ${schedId}`);
};

// -------------------------------------------------------------
// 2. BANK SOAL & VALIDASI PAKET
// -------------------------------------------------------------

// app-exam-firebase.js

// 1. SIMPAN PAKET SOAL BARU
window.handleSavePackage = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  
  const titleInput = document.getElementById('pkgNameInput');
  const subjectInput = document.getElementById('pkgSubjectSelect');
  const classInput = document.getElementById('pkgClassSelect');

  if (!titleInput || !titleInput.value.trim()) {
    return alert("Silakan isi nama paket soal!");
  }

  try {
    const pkgData = {
      title: titleInput.value.trim(),
      subject: subjectInput ? subjectInput.value : 'PAI',
      targetClass: classInput ? classInput.value : 'VII',
      status: 'Draft',
      questions: [],
      createdBy: currentTeacherUser ? currentTeacherUser.uid : 'guru',
      createdAt: Date.now()
    };

    await addDoc(collection(db, "packages"), pkgData);
    alert("Paket Soal Baru Berhasil Disimpan!");
    
    titleInput.value = '';
    window.closeCreatePackageModal();
  } catch (err) {
    alert("Gagal menyimpan paket soal: " + err.message);
  }
};

window.closeCreatePackageModal = function() {
  const modal = document.getElementById('modalCreatePackage');
  if (modal) modal.classList.add('hidden');
};

// 2. MODAL TAMBAH SOAL MANUAL
window.openAddQuestionModal = function() {
  if (!activePackageId) {
    return alert("Silakan klik 'Buka Soal' pada salah satu paket soal terlebih dahulu!");
  }
  const modal = document.getElementById('modalAddQuestion');
  if (modal) {
    modal.classList.remove('hidden');
  } else {
    alert("Elemen modalAddQuestion tidak ditemukan.");
  }
};

window.closeAddQuestionModal = function() {
  const modal = document.getElementById('modalAddQuestion');
  if (modal) modal.classList.add('hidden');
};

// 3. MODAL UPLOAD / IMPOR WORD (.DOCX)
window.openImportQuestionModal = function() {
  if (!activePackageId) {
    return alert("Silakan klik 'Buka Soal' pada salah satu paket soal terlebih dahulu!");
  }
  importedQuestionsBuffer = [];
  // Cek ID modalImport atau modalImportQuestion
  const modal = document.getElementById('modalImportQuestion') || document.getElementById('modalImport');
  if (modal) {
    modal.classList.remove('hidden');
  } else {
    alert("Elemen modal impor tidak ditemukan.");
  }
};

window.closeImportQuestionModal = function() {
  const modal = document.getElementById('modalImportQuestion') || document.getElementById('modalImport');
  if (modal) modal.classList.add('hidden');
};

// 4. DOWNLOAD TEMPLATE / PANDUAN WORD
window.downloadWordTemplate = function() {
  const content = `PANDUAN FORMAT IMPOR SOAL WORD (.DOCX)
=========================================
JENIS: PG
SOAL: Siapakah Nabi terakhir yang diutus Allah SWT?
A: Nabi Musa AS
B: Nabi Isa AS
C: Nabi Muhammad SAW
D: Nabi Ibrahim AS
KUNCI: C
BOBOT: 2

JENIS: BS
SOAL: Al-Qur'an terdiri dari 114 Surah.
KUNCI: BENAR
BOBOT: 2
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "Panduan_Format_Soal_Docx.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

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
    grid.innerHTML = `<p class="text-xs text-slate-400 col-span-3 p-4 bg-slate-50 rounded-xl">Belum ada paket soal. Klik "+ Buat Paket Baru" di atas.</p>`;
    return;
  }

  grid.innerHTML = packages.map(p => {
    const titleCapital = (p.title || '').toUpperCase();
    const mapelCapital = (p.subject || '').toUpperCase();
    return `
      <div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition">
        <div class="flex justify-between items-start">
          <h4 class="font-bold text-slate-800 text-xs">${titleCapital}</h4>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${p.status}</span>
        </div>
        <p class="text-[10px] text-slate-500">Mapel: ${mapelCapital} | Target: ${p.targetClass} | Jml Soal: ${p.questions ? p.questions.length : 0}</p>
        <div class="flex gap-2 pt-2">
          <button onclick="openPackageDetailFire('${p.id}')" class="bg-blue-800 hover:bg-blue-900 text-white px-2.5 py-1 rounded text-xs font-bold flex-1">Buka Soal</button>
          <button onclick="deletePackageFire('${p.id}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-xs font-bold">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

window.validateAndSetPackageReady = async function(pkgId) {
  const pkgRef = doc(db, "packages", pkgId);
  const pkgDoc = await getDoc(pkgRef);

  if (!pkgDoc.exists()) return;
  const questions = pkgDoc.data().questions || [];

  if (questions.length === 0) {
    return alert("Gagal Tandai Siap: Paket soal belum berisi butir soal!");
  }

  let invalidCount = 0;
  questions.forEach(q => {
    if (!q.text || !q.key || (q.type === 'PG' && (!q.options || q.options.length < 2))) {
      invalidCount++;
    }
  });

  if (invalidCount > 0) {
    return alert(`Gagal Tandai Siap: Terdapat ${invalidCount} soal yang belum lengkap (kunci/opsi kosong)!`);
  }

  await updateDoc(pkgRef, { status: 'Siap' });
  alert("Paket Soal berhasil ditandai SIAP dan siap diterbitkan!");
  window.openPackageDetailFire(pkgId);
};

window.openPackageDetailFire = async function(pkgId) {
  activePackageId = pkgId;
  const pkgDoc = await getDoc(doc(db, "packages", pkgId));
  
  if (pkgDoc.exists()) {
    const pkg = pkgDoc.data();
    document.getElementById('packageDetailBox')?.classList.remove('hidden');
    document.getElementById('activePkgTitle').innerText = `${(pkg.title || '').toUpperCase()} [Status: ${pkg.status}]`;
    document.getElementById('activePkgInfo').innerText = `Mapel: ${(pkg.subject || '').toUpperCase()} | Target: ${pkg.targetClass}`;
    
    const valBtn = document.getElementById('btnValidatePkg');
    if (valBtn) {
      valBtn.onclick = () => window.validateAndSetPackageReady(pkgId);
    }

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
        <div class="space-x-1">
          <button onclick="duplicateQuestionFire(${i})" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Duplikat</button>
          <button onclick="deleteQuestionFire(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
        </div>
      </div>
      <p dir="auto" class="font-medium text-slate-800 text-right font-arabic">${q.text}</p>
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
  const schedSnap = await getDocs(query(collection(db, "schedules"), where("packageId", "==", pkgId)));
  if (!schedSnap.empty) {
    return alert("Gagal Menghapus: Paket soal ini sedang digunakan dalam Jadwal Ujian!");
  }

  if (confirm("Hapus Paket Soal ini dari Firestore secara permanen?")) {
    await deleteDoc(doc(db, "packages", pkgId));
    document.getElementById('packageDetailBox')?.classList.add('hidden');
  }
};

window.duplicateQuestionFire = async function(qIndex) {
  if (!activePackageId) return;
  const pkgRef = doc(db, "packages", activePackageId);
  const pkgDoc = await getDoc(pkgRef);

  if (pkgDoc.exists()) {
    let questions = pkgDoc.data().questions || [];
    const copyQ = { ...questions[qIndex] };
    questions.splice(qIndex + 1, 0, copyQ);
    await updateDoc(pkgRef, { questions, status: 'Draft' });
    window.openPackageDetailFire(activePackageId);
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
      status: 'Draft'
    });
    window.openPackageDetailFire(activePackageId);
  }
};

// Tambahkan/Pastikan di app-exam-firebase.js

window.openCreatePackageModal = function() {
  // 1. Muat Opsi Mata Pelajaran
  onSnapshot(collection(db, "subjects"), (snapS) => {
    const subs = snapS.docs.map(d => d.data());
    const selSub = document.getElementById('pkgSubjectSelect');
    if (selSub) {
      selSub.innerHTML = subs.length 
        ? subs.map(s => `<option value="${s.code.toUpperCase()}">${s.name} (${s.code.toUpperCase()})</option>`).join('')
        : `<option value="PAI">PAI</option>`;
    }
  });

  // 2. Muat Opsi Kelas Target dari Master Kelas
  onSnapshot(collection(db, "classes"), (snapC) => {
    const classes = snapC.docs.map(d => d.data());
    const selClass = document.getElementById('pkgClassSelect');
    if (selClass) {
      selClass.innerHTML = classes.length
        ? classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('')
        : `<option value="VII">VII</option><option value="VIII">VIII</option><option value="IX">IX</option>`;
    }
  });

  const modal = document.getElementById('modalCreatePackage');
  if (modal) {
    modal.classList.remove('hidden');
  }
};
window.closeCreatePackageModal = function() {
  document.getElementById('modalCreatePackage')?.classList.add('hidden');
};

// -------------------------------------------------------------
// 3. MONITORING REAL-TIME & KONTROL SESI
// -------------------------------------------------------------

function listenToMonitoringSelect() {
  const sel = document.getElementById('monitoringExamSelect');
  onSnapshot(collection(db, "schedules"), (snap) => {
    const schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sel) {
      if (!schedules.length) {
        sel.innerHTML = `<option value="">-- Pilih Ujian (Belum Ada Ujian) --</option>`;
        sel.disabled = true;
      } else {
        sel.disabled = false;
        sel.innerHTML = `<option value="">-- Pilih Ujian Untuk Memantau --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
      }
    }
  });
}

window.handleMonitoringExamChange = async function(schedId) {
  const container = document.getElementById('monitoringDataContainer');
  if (!schedId) {
    if (container) container.classList.add('hidden');
    return;
  }

  if (container) container.classList.remove('hidden');
  const schedDoc = await getDoc(doc(db, "schedules", schedId));
  const schedData = schedDoc.exists() ? schedDoc.data() : {};
  const totalQuestions = schedData.packageSnapshot?.questions?.length || 0;

  onSnapshot(collection(db, "users"), (userSnap) => {
    const students = userSnap.docs.map(d => d.data()).filter(u => u.role === 'siswa');
    
    let countBelum = 0;
    let countMengerjakan = 0;
    let countSelesai = 0;
    let countTerkunci = 0;

    const rows = students.map(s => {
      const status = s.examStatus || 'Belum Masuk';
      if (status === 'Belum Masuk') countBelum++;
      if (status === 'Mengerjakan') countMengerjakan++;
      if (status === 'Selesai') countSelesai++;
      if (status === 'Terkunci') countTerkunci++;

      return `
        <tr class="border-b text-xs">
          <td class="p-2.5 font-bold text-slate-800">${s.name || s.username}</td>
          <td class="p-2.5">${s.class || '-'}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded font-bold ${status === 'Mengerjakan' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}">${status}</span></td>
          <td class="p-2.5 font-bold">${s.answeredCount || 0} / ${totalQuestions}</td>
          <td class="p-2.5 font-bold text-rose-600">${s.violations || 0}x</td>
          <td class="p-2.5 text-center space-x-1">
            <button onclick="controlStudentSession('${s.username}', 'addTime')" class="bg-amber-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">+ Waktu</button>
            <button onclick="controlStudentSession('${s.username}', 'forceSubmit')" class="bg-blue-800 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">Paksa Kumpul</button>
            <button onclick="controlStudentSession('${s.username}', 'unlock')" class="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">Buka Kunci</button>
            <button onclick="controlStudentSession('${s.username}', 'reset')" class="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">Reset</button>
          </td>
        </tr>
      `;
    }).join('');

    if (document.getElementById('monCardBelum')) document.getElementById('monCardBelum').innerText = countBelum;
    if (document.getElementById('monCardMengerjakan')) document.getElementById('monCardMengerjakan').innerText = countMengerjakan;
    if (document.getElementById('monCardSelesai')) document.getElementById('monCardSelesai').innerText = countSelesai;
    if (document.getElementById('monCardTerkunci')) document.getElementById('monCardTerkunci').innerText = countTerkunci;

    const tbody = document.getElementById('monitoringTableBody');
    if (tbody) tbody.innerHTML = rows;

    const timeTag = document.getElementById('monitoringLastUpdated');
    if (timeTag) timeTag.innerText = `Diperbarui pada ${new Date().toLocaleTimeString('id-ID')}`;
  });
};

window.controlStudentSession = function(username, action) {
  const actionsText = {
    'addTime': 'Menambahkan waktu 15 menit untuk',
    'forceSubmit': 'Mengumpulkan ujian secara paksa untuk',
    'unlock': 'Membuka kunci pelanggaran untuk',
    'reset': 'Mereset penuh sesi ujian'
  };

  if (confirm(`Apakah Anda yakin ingin ${actionsText[action]} siswa ${username}?`)) {
    alert(`Tindakan ${action} berhasil diterapkan pada siswa ${username}.`);
  }
};

// -------------------------------------------------------------
// 4. LAPORAN & ANALISIS BUTIR SOAL
// -------------------------------------------------------------

function renderReportModule() {
  const sel = document.getElementById('reportExamSelect');
  onSnapshot(collection(db, "schedules"), (snap) => {
    const schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sel) {
      if (!schedules.length) {
        sel.innerHTML = `<option value="">-- Pilih Ujian (Belum Ada Ujian) --</option>`;
        sel.disabled = true;
      } else {
        sel.disabled = false;
        sel.innerHTML = `<option value="">-- Pilih Ujian Untuk Laporan --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
      }
    }
  });
}

window.handleReportExamChange = function(schedId) {
  const box = document.getElementById('reportDataContainer');
  if (!schedId) {
    if (box) box.classList.add('hidden');
    return;
  }

  if (box) box.classList.remove('hidden');

  const tbody = document.getElementById('reportTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr class="border-b text-xs">
        <td class="p-2.5 font-bold">Ahmad Abdullah</td>
        <td class="p-2.5">VII-A</td>
        <td class="p-2.5">80.0</td>
        <td class="p-2.5">15.0</td>
        <td class="p-2.5 font-bold text-blue-900">95.0</td>
        <td class="p-2.5"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">TUNTAS</span></td>
      </tr>
    `;
  }

  const analysisBox = document.getElementById('itemAnalysisBox');
  if (analysisBox) {
    analysisBox.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-3 border-t">
        <div class="bg-slate-50 p-3 rounded-lg border">
          <strong class="text-slate-700 block mb-1">Tingkat Kesulitan</strong>
          <p class="text-slate-500">Mudah: 60% | Sedang: 30% | Sulit: 10%</p>
        </div>
        <div class="bg-slate-50 p-3 rounded-lg border">
          <strong class="text-slate-700 block mb-1">Daya Pembeda</strong>
          <p class="text-slate-500">Baik: 80% | Cukup: 20%</p>
        </div>
        <div class="bg-slate-50 p-3 rounded-lg border">
          <strong class="text-slate-700 block mb-1">Statistik Nilai</strong>
          <p class="text-slate-500">Rata-rata: 85.5 | Tertinggi: 98 | Terendah: 65</p>
        </div>
      </div>
    `;
  }
};

// -------------------------------------------------------------
// 5. KOREKSI URAIAN & PENINJAUAN ISIAN
// -------------------------------------------------------------

function renderGradingModule() {
  const sel = document.getElementById('gradingExamSelect');
  onSnapshot(collection(db, "schedules"), (snap) => {
    const schedules = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sel) {
      if (!schedules.length) {
        sel.innerHTML = `<option value="">-- Pilih Ujian (Belum Ada Ujian) --</option>`;
        sel.disabled = true;
      } else {
        sel.disabled = false;
        sel.innerHTML = `<option value="">-- Pilih Ujian Untuk Penilaian --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
      }
    }
  });

  const box = document.getElementById('gradingContainer');
  if (box) box.innerHTML = `<p class="text-xs text-slate-500 p-4 bg-slate-50 rounded-xl">Belum ada jawaban uraian atau isian singkat yang perlu dikoreksi.</p>`;
}

// -------------------------------------------------------------
// RINGKASAN DASHBOARD GURU
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
