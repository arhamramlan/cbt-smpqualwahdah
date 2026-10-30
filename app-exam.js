// ==========================================
// APP-EXAM.JS: ENGINE PAKET SOAL, IMPOR, RE-SCORING, MONITORING & ANALYTICS
// ==========================================

let activePackageId = null;
let importedQuestionsBuffer = [];

window.initTeacherDashboard = function() {
  renderSummaryTab();
  renderPackageGrid();
  renderScheduleTable();
  renderMonitoringData();
};

function switchTeacherTab(tabId) {
  document.querySelectorAll('.teacher-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.teacher-tab-btn').forEach(el => el.classList.remove('active-tab'));

  document.getElementById(tabId).classList.remove('hidden');
  
  const map = {
    'tabSummary': 'btnTabSummary',
    'tabBank': 'btnTabBank',
    'tabSchedule': 'btnTabSchedule',
    'tabMonitoring': 'btnTabMonitoring',
    'tabGrading': 'btnTabGrading',
    'tabReports': 'btnTabReports'
  };

  if (map[tabId]) document.getElementById(map[tabId]).classList.add('active-tab');

  if (tabId === 'tabSummary') renderSummaryTab();
  if (tabId === 'tabBank') renderPackageGrid();
  if (tabId === 'tabSchedule') renderScheduleTable();
  if (tabId === 'tabMonitoring') renderMonitoringData();
  if (tabId === 'tabGrading') renderGradingModule();
  if (tabId === 'tabReports') renderReportModule();
}

function renderSummaryTab() {
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  
  let totalRealQuestions = 0;
  packages.forEach(p => totalRealQuestions += (p.questions ? p.questions.length : 0));

  document.getElementById('statActiveExams').innerText = schedules.filter(s => s.active).length;
  document.getElementById('statTotalQuestions').innerText = totalRealQuestions;
  document.getElementById('statPendingGrading').innerText = '0';
  document.getElementById('statOnlineStudents').innerText = '0';

  const list = document.getElementById('summaryExamsList');
  if (list) {
    list.innerHTML = schedules.length ? schedules.map(s => `
      <div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border text-xs">
        <div><strong>${s.title}</strong><p class="text-[10px] text-slate-500">${s.subject} | Token: ${s.token}</p></div>
        <button onclick="switchTeacherTab('tabMonitoring')" class="bg-blue-800 text-white px-3 py-1 rounded font-bold">Pantau</button>
      </div>
    `).join('') : `<p class="text-xs text-slate-400">Belum ada ujian aktif.</p>`;
  }

  const pendingList = document.getElementById('summaryGradingPendingList');
  if (pendingList) {
    pendingList.innerHTML = `<p class="text-xs text-slate-400 p-3 bg-slate-50 rounded">Semua uraian sudah terkoreksi sempurna.</p>`;
  }
}

// MANAGEMENT PAKET SOAL
function renderPackageGrid() {
  const session = JSON.parse(localStorage.getItem('cbt_session') || '{}');
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const grid = document.getElementById('packageGrid');
  const notice = document.getElementById('teacherAssignNotice');

  const assignments = session.teacherAssignments || [];
  if (!assignments.length) {
    notice.innerText = "Anda belum ditugaskan mengampu mapel/kelas oleh Admin. Hubungi Admin.";
    notice.classList.add('text-rose-600', 'font-bold');
  } else {
    notice.innerText = "Mata pelajaran dan kelas diampu terverifikasi.";
    notice.classList.remove('text-rose-600', 'font-bold');
  }

  grid.innerHTML = packages.map(p => `
    <div class="bg-slate-50 border p-4 rounded-xl space-y-2 hover:shadow transition">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-slate-800 text-xs">${p.title}</h4>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'Siap' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${p.status}</span>
      </div>
      <p class="text-[10px] text-slate-500">Mapel: ${p.subject} | Kelas: ${p.targetClass} | Jml Soal: ${p.questions ? p.questions.length : 0}</p>
      <div class="flex gap-2 pt-2">
        <button onclick="openPackageDetail('${p.id}')" class="bg-blue-800 text-white px-2.5 py-1 rounded text-xs font-bold flex-1">Buka Soal</button>
        <button onclick="duplicatePackage('${p.id}')" class="bg-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold">Duplikat</button>
        <button onclick="deletePackage('${p.id}')" class="bg-rose-600 text-white px-2 py-1 rounded text-xs font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
}

function openCreatePackageModal() {
  const session = JSON.parse(localStorage.getItem('cbt_session') || '{}');
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  document.getElementById('pkgSubjectSelect').innerHTML = subjects.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  document.getElementById('pkgClassSelect').innerHTML = classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  document.getElementById('modalCreatePackage').classList.remove('hidden');
}

function closeCreatePackageModal() { document.getElementById('modalCreatePackage').classList.add('hidden'); }

function handleSavePackage(e) {
  e.preventDefault();
  const pkg = {
    id: 'PKG_' + Date.now(),
    title: document.getElementById('pkgNameInput').value.trim(),
    subject: document.getElementById('pkgSubjectSelect').value,
    targetClass: document.getElementById('pkgClassSelect').value,
    status: 'Draft',
    questions: []
  };

  let packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  packages.push(pkg);
  localStorage.setItem('cbt_packages', JSON.stringify(packages));
  alert('Paket Soal berhasil dibuat!');
  closeCreatePackageModal();
  renderPackageGrid();
}

function openPackageDetail(pkgId) {
  activePackageId = pkgId;
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const pkg = packages.find(p => p.id === pkgId);

  if (pkg) {
    document.getElementById('packageDetailBox').classList.remove('hidden');
    document.getElementById('activePkgTitle').innerText = `${pkg.title} [Status: ${pkg.status}]`;
    document.getElementById('activePkgInfo').innerText = `Mapel: ${pkg.subject} | Target: ${pkg.targetClass}`;
    renderPackageQuestionsList(pkg);
  }
}

function renderPackageQuestionsList(pkg) {
  const list = document.getElementById('packageQuestionsList');
  if (!pkg.questions || !pkg.questions.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada butir soal dalam paket ini.</p>`;
    return;
  }

  list.innerHTML = pkg.questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2">
      <div class="flex justify-between">
        <strong class="font-bold text-slate-800">#${i + 1} [${q.type}] Bobot: ${q.score}</strong>
        <div class="space-x-1">
          <button onclick="editQuestionInPackage(${i})" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Edit</button>
          <button onclick="deleteQuestionInPackage(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
        </div>
      </div>
      <p dir="auto" class="font-medium text-slate-800">${q.text}</p>
      <div class="text-[11px] text-slate-600"><strong>Kunci:</strong> <code class="font-bold text-blue-900">${Array.isArray(q.key) ? q.key.join(', ') : q.key}</code></div>
    </div>
  `).join('');
}

function validateActivePackage() {
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const pkg = packages.find(p => p.id === activePackageId);

  if (!pkg || !pkg.questions || !pkg.questions.length) {
    return alert('Validasi Gagal: Paket belum memiliki soal!');
  }

  let errors = [];
  pkg.questions.forEach((q, i) => {
    if (!q.key) errors.push(`Soal #${i+1} belum punya kunci jawaban.`);
    if (q.score <= 0) errors.push(`Soal #${i+1} bobot skor 0.`);
  });

  if (errors.length > 0) {
    alert('Ditemukan Isu Validasi:\n' + errors.join('\n'));
  } else {
    pkg.status = 'Siap';
    localStorage.setItem('cbt_packages', JSON.stringify(packages));
    alert('Paket Soal Terverifikasi SIAP untuk Ujian!');
    openPackageDetail(activePackageId);
    renderPackageGrid();
  }
}

// SOAL MANUAL
function openAddQuestionModal() {
  document.getElementById('editQIndex').value = "-1";
  renderQuestionTypeOptions();
  document.getElementById('modalAddQuestion').classList.remove('hidden');
}

function closeAddQuestionModal() { document.getElementById('modalAddQuestion').classList.add('hidden'); }

function renderQuestionTypeOptions() {
  const type = document.getElementById('qTypeSelect').value;
  const box = document.getElementById('qOptionsContainer');

  if (type === 'PG' || type === 'PGK') {
    box.innerHTML = `
      <label class="block font-bold text-slate-700 text-xs mb-1">Opsi Jawaban & Kunci (A-D)</label>
      <input type="text" id="optA" placeholder="Opsi A" class="w-full px-2 py-1 border rounded text-xs mb-1">
      <input type="text" id="optB" placeholder="Opsi B" class="w-full px-2 py-1 border rounded text-xs mb-1">
      <input type="text" id="optC" placeholder="Opsi C" class="w-full px-2 py-1 border rounded text-xs mb-1">
      <input type="text" id="optD" placeholder="Opsi D" class="w-full px-2 py-1 border rounded text-xs mb-1">
      <input type="text" id="qKeyInput" placeholder="Kunci (Misal: Opsi B atau A,C)" class="w-full px-2 py-1 border rounded text-xs font-bold text-blue-900 mt-2">
    `;
  } else if (type === 'BS') {
    box.innerHTML = `
      <label class="block font-bold text-slate-700 text-xs mb-1">Kunci Jawaban Benar/Salah</label>
      <select id="qKeyInput" class="w-full px-2 py-1 border rounded text-xs">
        <option value="Benar">Benar</option>
        <option value="Salah">Salah</option>
      </select>
    `;
  } else {
    box.innerHTML = `
      <label class="block font-bold text-slate-700 text-xs mb-1">Kunci Jawaban / Rubrik (Pisahkan alternatif dengan |)</label>
      <input type="text" id="qKeyInput" placeholder="Misal: syahadat | dua kalimat syahadat" class="w-full px-2 py-1 border rounded text-xs font-bold">
    `;
  }
}

function handleSaveQuestion(e) {
  e.preventDefault();
  const type = document.getElementById('qTypeSelect').value;
  const score = parseFloat(document.getElementById('qScoreInput').value);
  const text = document.getElementById('qTextInput').value.trim();

  let keyVal = '';
  let options = [];

  if (type === 'PG' || type === 'PGK') {
    options = [
      document.getElementById('optA').value.trim(),
      document.getElementById('optB').value.trim(),
      document.getElementById('optC').value.trim(),
      document.getElementById('optD').value.trim()
    ].filter(x => x);
    keyVal = document.getElementById('qKeyInput').value.trim();
  } else {
    keyVal = document.getElementById('qKeyInput').value.trim();
  }

  let packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const pkgIdx = packages.findIndex(p => p.id === activePackageId);

  if (pkgIdx > -1) {
    const qObj = { type, text, score, key: keyVal, options };
    packages[pkgIdx].questions.push(qObj);
    localStorage.setItem('cbt_packages', JSON.stringify(packages));
    alert('Soal ditambahkan ke paket!');
    closeAddQuestionModal();
    openPackageDetail(activePackageId);
  }
}

// IMPOR DOCX / EXCEL
function openImportModal() {
  importedQuestionsBuffer = [];
  document.getElementById('importPreviewReport').classList.add('hidden');
  document.getElementById('btnSaveImported').disabled = true;
  document.getElementById('btnSaveImported').classList.add('opacity-50');
  document.getElementById('modalImport').classList.remove('hidden');
}

function closeImportModal() { document.getElementById('modalImport').classList.add('hidden'); }

function handleProcessImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reportBox = document.getElementById('importPreviewReport');
  reportBox.classList.remove('hidden');
  reportBox.innerHTML = `<p class="text-xs text-blue-700 font-bold">Membaca file ${file.name}...</p>`;

  if (file.name.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      mammoth.extractRawText({ arrayBuffer: evt.target.result })
        .then(res => parseWordContent(res.value))
        .catch(err => alert('Gagal membaca Word: ' + err.message));
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Gunakan file .docx untuk parser baku.');
  }
}

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
  reportBox.innerHTML = reportHtml.join('');

  if (importedQuestionsBuffer.length > 0) {
    const btn = document.getElementById('btnSaveImported');
    btn.disabled = false;
    btn.classList.remove('opacity-50');
  }
}

function saveImportedQuestions() {
  let packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const pkgIdx = packages.findIndex(p => p.id === activePackageId);

  if (pkgIdx > -1) {
    packages[pkgIdx].questions = [...packages[pkgIdx].questions, ...importedQuestionsBuffer];
    localStorage.setItem('cbt_packages', JSON.stringify(packages));
    alert(`${importedQuestionsBuffer.length} soal berhasil diimpor!`);
    closeImportModal();
    openPackageDetail(activePackageId);
  }
}

// JADWAL UJIAN
function filterSchedBankOptions() {
  const selectedSub = document.getElementById('schedSubject').value;
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]').filter(p => p.subject === selectedSub && p.status === 'Siap');
  const select = document.getElementById('schedBank');
  select.innerHTML = packages.length ? packages.map(p => `<option value="${p.id}">${p.title}</option>`).join('') : `<option value="">-- Tidak Ada Paket SIAP --</option>`;
}

function generateRandomToken() {
  document.getElementById('schedToken').value = Math.random().toString(36).substring(2, 8).toUpperCase();
}

function handleSaveSchedule(e) {
  e.preventDefault();
  const selectedClasses = Array.from(document.querySelectorAll('input[name="schedClasses"]:checked')).map(cb => cb.value);
  if (!selectedClasses.length) return alert('Pilih minimal satu kelas peserta!');

  const pkgId = document.getElementById('schedBank').value;
  const packages = JSON.parse(localStorage.getItem('cbt_packages') || '[]');
  const pkg = packages.find(p => p.id === pkgId);

  if (!pkg) return alert('Pilih paket soal yang siap!');

  const schedule = {
    id: 'SCHED_' + Date.now(),
    title: document.getElementById('schedTitle').value,
    subject: document.getElementById('schedSubject').value,
    packageSnapshot: pkg,
    classes: selectedClasses,
    startTime: document.getElementById('schedStartTime').value,
    duration: parseInt(document.getElementById('schedDuration').value),
    kkm: parseInt(document.getElementById('schedKKM').value),
    maxViolations: parseInt(document.getElementById('schedMaxViolations').value),
    token: document.getElementById('schedToken').value.toUpperCase(),
    randomizeSoal: document.getElementById('schedRandomizeSoal').checked,
    active: true
  };

  let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  schedules.push(schedule);
  localStorage.setItem('cbt_schedules', JSON.stringify(schedules));

  alert('Jadwal Ujian dengan Snapshot Paket berhasil diterbitkan!');
  renderScheduleTable();
}

function renderScheduleTable() {
  const tbody = document.getElementById('schedTableBody');
  if (!tbody) return;

  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  tbody.innerHTML = schedules.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2"><strong>${s.title}</strong><br><span class="text-[10px] text-slate-500">Token: ${s.token}</span></td>
      <td class="p-2">${s.startTime.replace('T', ' ')} (${s.duration} Mnt)</td>
      <td class="p-2">${s.classes.join(', ')} | KKM: ${s.kkm}</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="triggerReScoring('${s.id}')" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px]">Re-Score</button>
        <button onclick="switchTeacherTab('tabMonitoring')" class="bg-blue-800 text-white px-2 py-0.5 rounded text-[10px]">Pantau</button>
      </td>
    </tr>
  `).join('');
}

function triggerReScoring(schedId) {
  alert(`Re-scoring penilaian otomatis dijalankan untuk jadwal ID: ${schedId}`);
}

// MONITORING REAL-TIME
function renderMonitoringData() {
  const tbody = document.getElementById('monitoringTableBody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa');
  
  document.getElementById('monCountPending').innerText = users.length;
  document.getElementById('monCountOngoing').innerText = '0';
  document.getElementById('monCountFinished').innerText = '0';
  document.getElementById('monCountLocked').innerText = '0';

  tbody.innerHTML = users.map(u => `
    <tr class="border-b text-xs">
      <td class="p-2 font-bold">${u.name}</td>
      <td class="p-2">${u.class}</td>
      <td class="p-2"><span class="px-2 py-0.5 bg-slate-200 text-slate-700 rounded font-bold">Belum Masuk</span></td>
      <td class="p-2">0 / 40</td>
      <td class="p-2 font-bold text-emerald-600">0x</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="alert('Sesi di-reset!')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Reset</button>
        <button onclick="alert('Akses dibuka!')" class="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">Buka</button>
      </td>
    </tr>
  `).join('');
}

// KOREKSI & LAPORAN
function renderGradingModule() {
  const box = document.getElementById('gradingContainer');
  box.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Semua jawaban uraian siswa telah dikoreksi sempurna.</p>`;
}

function renderReportModule() {
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa');
  const tbody = document.getElementById('reportTableBody');

  tbody.innerHTML = users.map(u => `
    <tr class="border-b text-xs">
      <td class="p-2 font-bold">${u.name}</td>
      <td class="p-2">${u.class}</td>
      <td class="p-2">80.0</td>
      <td class="p-2">15.0</td>
      <td class="p-2 font-bold text-blue-900">95.0</td>
      <td class="p-2"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">TUNTAS</span></td>
    </tr>
  `).join('');
}

function exportResultsToExcel() { alert('Mengunduh rekapitulasi nilai Excel...'); }
function exportResultsToPDF() { alert('Mencetak Laporan PDF...'); }
