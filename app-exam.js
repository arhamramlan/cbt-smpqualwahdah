// ==========================================
// APP-EXAM.JS: MODUL LENGKAP CBT GURU & SISWA
// ==========================================

let tempImportedQuestions = [];
let activeStudentQuestions = [];
let currentQIndex = 0;
let studentAnswers = {};
let activeExamSchedule = null;

window.initTeacherDashboard = function() {
  populateDropdowns();
  renderSummaryTab();
  loadBankQuestions();
  renderScheduleTable();
  renderMonitoringData();
  startAutoRefreshMonitoring();
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
  if (tabId === 'tabBank') loadBankQuestions();
  if (tabId === 'tabSchedule') renderScheduleTable();
  if (tabId === 'tabMonitoring') renderMonitoringData();
  if (tabId === 'tabGrading') loadGradingExams();
  if (tabId === 'tabReports') loadReportExams();
}

function populateDropdowns() {
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  ['bankSubjectSelect', 'schedSubject', 'schedBank'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = subjects.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  });

  const bClass = document.getElementById('bankClassSelect');
  if (bClass) bClass.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');

  const classBox = document.getElementById('schedClassesCheckbox');
  if (classBox) {
    classBox.innerHTML = classes.map(c => `
      <label class="inline-flex items-center text-xs bg-slate-100 px-2 py-1 rounded border">
        <input type="checkbox" name="schedClasses" value="${c}" class="mr-1.5"> ${c}
      </label>
    `).join('');
  }
}

// 1. RINGKASAN & STATISTIK
function renderSummaryTab() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const activeCount = schedules.filter(s => s.active).length;
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const pendingGradingCount = results.filter(r => r.essayScore === undefined).length;
  const liveData = JSON.parse(localStorage.getItem('cbt_live_monitoring') || '{}');
  const onlineStudentsCount = Object.values(liveData).filter(v => v.status === 'IN_PROGRESS').length;

  document.getElementById('statActiveExams').innerText = activeCount;
  document.getElementById('statTotalQuestions').innerText = '120';
  document.getElementById('statPendingGrading').innerText = pendingGradingCount;
  document.getElementById('statOnlineStudents').innerText = onlineStudentsCount;

  // Render Ujian Hari Ini
  const examContainer = document.getElementById('summaryExamsList');
  if (examContainer) {
    if (!schedules.length) {
      examContainer.innerHTML = `<p class="text-xs text-slate-400 p-3 bg-slate-50 rounded">Belum ada ujian yang dijadwalkan hari ini.</p>`;
    } else {
      examContainer.innerHTML = schedules.map(s => `
        <div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border text-xs">
          <div>
            <strong class="text-slate-800">${s.title}</strong>
            <p class="text-[10px] text-slate-500">${s.subject} | Token: <code class="text-blue-600 font-bold">${s.token}</code></p>
          </div>
          <button onclick="switchTeacherTab('tabMonitoring')" class="bg-blue-800 text-white px-3 py-1 rounded font-bold">Pantau</button>
        </div>
      `).join('');
    }
  }

  // Pending Grading
  const pendingContainer = document.getElementById('summaryGradingPendingList');
  if (pendingContainer) {
    const uncorrected = results.filter(r => r.essayScore === undefined);
    if (!uncorrected.length) {
      pendingContainer.innerHTML = `<p class="text-xs text-slate-400">Tidak ada lembar uraian tertunda. Seluruh jawaban siswa telah dikoreksi.</p>`;
    } else {
      pendingContainer.innerHTML = uncorrected.map(r => `
        <div onclick="switchTeacherTab('tabGrading')" class="p-2 bg-amber-50 rounded border border-amber-200 cursor-pointer hover:bg-amber-100 text-xs">
          <strong>${r.studentName}</strong> - ${r.examTitle}
        </div>
      `).join('');
    }
  }
}

// 2. BANK SOAL & IMPOR
function loadBankQuestions() {
  const sub = document.getElementById('bankSubjectSelect').value;
  const cls = document.getElementById('bankClassSelect').value;
  const key = `cbt_bank_${sub}_${cls}`;
  const questions = JSON.parse(localStorage.getItem(key) || '[]');

  document.getElementById('countPG').innerText = questions.filter(q => q.type === 'pg').length;
  document.getElementById('countMajemuk').innerText = questions.filter(q => q.type === 'majemuk').length;
  document.getElementById('countBS').innerText = questions.filter(q => q.type === 'bs').length;
  document.getElementById('countIsian').innerText = questions.filter(q => q.type === 'isian').length;
  document.getElementById('countUraian').innerText = questions.filter(q => q.type === 'uraian').length;

  const list = document.getElementById('bankQuestionsList');
  if (!questions.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 bg-slate-50 p-4 rounded text-center">Belum ada soal dalam paket ini. Gunakan Impor File atau Tambah Soal Manual.</p>`;
    return;
  }

  list.innerHTML = questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
      <div class="flex justify-between font-bold text-slate-700">
        <span>#${i + 1} [${q.type.toUpperCase()}]</span>
        <div class="space-x-1">
          <button onclick="editBankQuestion(${i})" class="text-amber-600 hover:underline">Edit</button>
          <button onclick="deleteBankQuestion(${i})" class="text-rose-600 hover:underline">Hapus</button>
        </div>
      </div>
      <p class="text-slate-800">${q.text}</p>
      <div class="text-[11px] text-slate-500">Kunci: <strong class="text-emerald-700">${Array.isArray(q.keys) ? q.keys.join(', ') : q.keys}</strong></div>
    </div>
  `).join('');
}

function downloadWordQuestionTemplate() {
  const text = `FORMAT IMPOR 5 JENIS SOAL (WORD)
1. Apa nama ibu kota Indonesia?
A. Jakarta
B. Bandung
Kunci: A
Tipe: pg

2. Pilih bilangan genap!
A. 2
B. 3
C. 4
Kunci: A,C
Tipe: majemuk`;
  const blob = new Blob([text], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Template_Soal_CBT.doc";
  a.click();
}

function downloadExcelQuestionTemplate() {
  const data = [{ Nomor: 1, Tipe: "pg", Pertanyaan: "5 + 5 =", A: "10", B: "12", C: "", D: "", Kunci: "A" }];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Soal");
  XLSX.writeFile(wb, "Template_Soal_Excel.xlsx");
}

function handleUploadQuestionFile() {
  const input = document.getElementById('qFileInputGuru');
  if (!input.files.length) return alert('Pilih file terlebih dahulu!');

  const file = input.files[0];
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(res => processRawImport(res.value));
    };
    reader.readAsArrayBuffer(file);
  } else if (name.endsWith('.xlsx')) {
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      processExcelImport(rows);
    };
    reader.readAsArrayBuffer(file);
  }
}

function processRawImport(text) {
  const blocks = text.split(/\n(?=\d+[\.\)])/).filter(b => b.trim());
  tempImportedQuestions = [];

  blocks.forEach((b, idx) => {
    const lines = b.split('\n').map(l => l.trim()).filter(l => l);
    let q = { id: idx + 1, text: lines[0].replace(/^\d+[\.\)]\s*/, ''), options: [], keys: [], type: 'pg' };

    lines.forEach(l => {
      if (l.match(/^([A-E])[\.\)]/i)) {
        const m = l.match(/^([A-E])[\.\)]\s*(.*)/i);
        q.options.push({ key: m[1].toUpperCase(), text: m[2] });
      } else if (l.startsWith('Kunci:')) {
        q.keys = l.replace('Kunci:', '').trim().split(',').map(k => k.trim());
      } else if (l.startsWith('Tipe:')) {
        q.type = l.replace('Tipe:', '').trim().toLowerCase();
      }
    });

    tempImportedQuestions.push(q);
  });

  showImportPreview();
}

function processExcelImport(rows) {
  tempImportedQuestions = rows.map((r, i) => ({
    id: i + 1,
    text: r.Pertanyaan,
    options: [{ key: 'A', text: r.A }, { key: 'B', text: r.B }, { key: 'C', text: r.C }, { key: 'D', text: r.D }].filter(o => o.text),
    keys: String(r.Kunci).split(',').map(k => k.trim()),
    type: r.Tipe || 'pg'
  }));
  showImportPreview();
}

function showImportPreview() {
  document.getElementById('importPreviewArea').classList.remove('hidden');
  document.getElementById('importReportSummary').innerText = `Berhasil membaca ${tempImportedQuestions.length} butir soal dari file. Periksa sebelum disimpan.`;
  document.getElementById('importPreviewList').innerHTML = tempImportedQuestions.map((q, i) => `
    <div class="border-b pb-1"><strong>#${i + 1} [${q.type}]</strong> ${q.text} (Kunci: ${q.keys.join(',')})</div>
  `).join('');
}

function cancelImportPreview() {
  document.getElementById('importPreviewArea').classList.add('hidden');
  tempImportedQuestions = [];
}

function commitImportQuestions() {
  const sub = document.getElementById('bankSubjectSelect').value;
  const cls = document.getElementById('bankClassSelect').value;
  const key = `cbt_bank_${sub}_${cls}`;
  let existing = JSON.parse(localStorage.getItem(key) || '[]');

  existing = existing.concat(tempImportedQuestions);
  localStorage.setItem(key, JSON.stringify(existing));

  alert(`Berhasil menyimpan ${tempImportedQuestions.length} soal ke bank!`);
  cancelImportPreview();
  loadBankQuestions();
}

// MANUAL QUESTION ENTRY
function openManualQuestionModal() {
  document.getElementById('manualQIndex').value = '';
  document.getElementById('manualQText').value = '';
  document.getElementById('manualQKey').value = '';
  document.getElementById('modalManualQuestion').classList.remove('hidden');
}

function closeManualQuestionModal() { document.getElementById('modalManualQuestion').classList.add('hidden'); }

function toggleManualOptionsView() {
  const type = document.getElementById('manualQType').value;
  const area = document.getElementById('manualOptionsArea');
  if (['pg', 'majemuk', 'bs'].includes(type)) {
    area.classList.remove('hidden');
  } else {
    area.classList.add('hidden');
  }
}

function handleSaveManualQuestion(e) {
  e.preventDefault();
  const sub = document.getElementById('bankSubjectSelect').value;
  const cls = document.getElementById('bankClassSelect').value;
  const key = `cbt_bank_${sub}_${cls}`;
  let questions = JSON.parse(localStorage.getItem(key) || '[]');

  const index = document.getElementById('manualQIndex').value;
  const newQ = {
    id: index !== '' ? questions[index].id : Date.now(),
    type: document.getElementById('manualQType').value,
    text: document.getElementById('manualQText').value,
    options: [
      { key: 'A', text: document.getElementById('manualOptA').value },
      { key: 'B', text: document.getElementById('manualOptB').value },
      { key: 'C', text: document.getElementById('manualOptC').value },
      { key: 'D', text: document.getElementById('manualOptD').value }
    ].filter(o => o.text),
    keys: document.getElementById('manualQKey').value.split(',').map(k => k.trim())
  };

  if (index !== '') {
    questions[index] = newQ;
  } else {
    questions.push(newQ);
  }

  localStorage.setItem(key, JSON.stringify(questions));
  alert('Soal manual disimpan!');
  closeManualQuestionModal();
  loadBankQuestions();
}

function editBankQuestion(i) {
  const sub = document.getElementById('bankSubjectSelect').value;
  const cls = document.getElementById('bankClassSelect').value;
  const key = `cbt_bank_${sub}_${cls}`;
  const questions = JSON.parse(localStorage.getItem(key) || '[]');
  const q = questions[i];

  document.getElementById('manualQIndex').value = i;
  document.getElementById('manualQType').value = q.type;
  document.getElementById('manualQText').value = q.text;
  document.getElementById('manualQKey').value = Array.isArray(q.keys) ? q.keys.join(',') : q.keys;

  openManualQuestionModal();
}

function deleteBankQuestion(i) {
  if (confirm('Hapus soal ini?')) {
    const sub = document.getElementById('bankSubjectSelect').value;
    const cls = document.getElementById('bankClassSelect').value;
    const key = `cbt_bank_${sub}_${cls}`;
    let questions = JSON.parse(localStorage.getItem(key) || '[]');
    questions.splice(i, 1);
    localStorage.setItem(key, JSON.stringify(questions));
    loadBankQuestions();
  }
}

// 3. JADWAL UJIAN LENGKAP
function calculateEndTimeSummary() {
  const startTime = document.getElementById('schedStartTime').value;
  const duration = parseInt(document.getElementById('schedDuration').value || 0);

  if (startTime && duration) {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);
    document.getElementById('schedEndTimeSummary').innerText = end.toLocaleString('id-ID');
  }
}

function generateRandomToken() {
  document.getElementById('schedToken').value = Math.random().toString(36).substring(2, 8).toUpperCase();
}

function handleSaveSchedule(e) {
  e.preventDefault();
  const startTime = document.getElementById('schedStartTime').value;
  if (new Date(startTime) < new Date()) return alert('Waktu mulai tidak boleh di masa lalu!');

  const selectedClasses = Array.from(document.querySelectorAll('input[name="schedClasses"]:checked')).map(cb => cb.value);
  if (!selectedClasses.length) return alert('Pilih minimal satu kelas!');

  const id = document.getElementById('schedIdInput').value || 'SCHED_' + Date.now();
  const schedule = {
    id: id,
    title: document.getElementById('schedTitle').value,
    subject: document.getElementById('schedSubject').value,
    bankCode: document.getElementById('schedBank').value,
    classes: selectedClasses,
    startTime: startTime,
    duration: parseInt(document.getElementById('schedDuration').value),
    questionCount: parseInt(document.getElementById('schedQuestionCount').value),
    kkm: parseInt(document.getElementById('schedKKM').value),
    maxViolations: parseInt(document.getElementById('schedMaxViolations').value),
    lateLimit: parseInt(document.getElementById('schedLateLimit').value),
    token: document.getElementById('schedToken').value.toUpperCase(),
    randomQ: document.getElementById('schedRandomQ').checked,
    randomOpt: document.getElementById('schedRandomOpt').checked,
    resultDisplay: document.getElementById('schedResultDisplay').value,
    active: true
  };

  let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const index = schedules.findIndex(s => s.id === id);

  if (index > -1) schedules[index] = schedule;
  else schedules.push(schedule);

  localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
  alert('Jadwal ujian disimpan!');
  e.target.reset();
  renderScheduleTable();
}

function renderScheduleTable() {
  const tbody = document.getElementById('schedTableBody');
  if (!tbody) return;

  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  tbody.innerHTML = schedules.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2">
        <strong class="text-slate-800">${s.title}</strong>
        <p class="text-[10px] text-slate-500">${s.subject} | Token: <code class="text-blue-600 font-bold">${s.token}</code></p>
      </td>
      <td class="p-2">
        <div>${s.startTime.replace('T', ' ')}</div>
        <div class="text-slate-500">${s.duration} Mnt (${s.questionCount} Soal)</div>
      </td>
      <td class="p-2">
        <span class="px-2 py-0.5 text-[10px] rounded font-bold ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${s.active ? 'Berlangsung' : 'Selesai'}</span>
      </td>
      <td class="p-2 text-center space-x-1">
        <button onclick="switchTeacherTab('tabMonitoring')" class="bg-blue-800 text-white px-2 py-0.5 rounded text-[10px]">Pantau</button>
        <button onclick="deleteSchedule('${s.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');

  populateMonitoringFilters();
}

function deleteSchedule(id) {
  if (confirm('Hapus jadwal ini?')) {
    let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
    schedules = schedules.filter(s => s.id !== id);
    localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
    renderScheduleTable();
  }
}

// 4. MONITORING REAL-TIME
function populateMonitoringFilters() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  const examFilter = document.getElementById('monitorExamFilter');
  const classFilter = document.getElementById('monitorClassFilter');

  if (examFilter) examFilter.innerHTML = `<option value="">-- Pilih Ujian --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
  if (classFilter) classFilter.innerHTML = `<option value="">-- Semua Kelas --</option>` + classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderMonitoringData() {
  const tbody = document.getElementById('monitoringTableBody');
  if (!tbody) return;

  const selectedSchedId = document.getElementById('monitorExamFilter').value;
  const selectedClass = document.getElementById('monitorClassFilter').value;

  if (!selectedSchedId) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Pilih Ujian Aktif di atas untuk memantau peserta real-time.</td></tr>`;
    return;
  }

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa');
  const liveData = JSON.parse(localStorage.getItem('cbt_live_monitoring') || '{}');

  const filtered = users.filter(u => !selectedClass || u.class === selectedClass);
  tbody.innerHTML = filtered.map(u => {
    const state = liveData[`${selectedSchedId}_${u.username}`] || { status: 'NOT_LOGGED_IN', progress: 0, total: 40, violations: 0, startTime: '-', endTime: '-' };
    return `
      <tr class="border-b text-xs">
        <td class="p-2"><strong>${u.name}</strong><br><span class="text-[10px] text-slate-500">${u.class}</span></td>
        <td class="p-2 font-bold">${state.status}</td>
        <td class="p-2">${state.progress} / ${state.total}</td>
        <td class="p-2 ${state.violations >= 2 ? 'text-rose-600 font-bold' : ''}">${state.violations}x</td>
        <td class="p-2 text-[10px]">${state.startTime}</td>
        <td class="p-2 text-center space-x-1">
          <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'reset')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Reset</button>
          <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'unlock')" class="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">Buka</button>
        </td>
      </tr>
    `;
  }).join('');
}

function controlStudentAction(schedId, username, action) {
  if (confirm(`Konfirmasi aksi ${action} untuk siswa ${username}?`)) {
    let liveData = JSON.parse(localStorage.getItem('cbt_live_monitoring') || '{}');
    const key = `${schedId}_${username}`;
    if (!liveData[key]) liveData[key] = { status: 'NOT_LOGGED_IN', progress: 0, total: 40, violations: 0 };

    if (action === 'reset') liveData[key].status = 'NOT_LOGGED_IN';
    if (action === 'unlock') { liveData[key].status = 'IN_PROGRESS'; liveData[key].violations = 0; }

    localStorage.setItem('cbt_live_monitoring', JSON.stringify(liveData));
    renderMonitoringData();
  }
}

function startAutoRefreshMonitoring() {
  setInterval(() => {
    const badge = document.getElementById('autoRefreshBadge');
    if (badge) badge.innerText = `Diperbarui baru saja`;
    renderMonitoringData();
  }, 10000);
}

// 5. KOREKSI URAIAN
function loadGradingExams() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const select = document.getElementById('gradingExamFilter');
  if (select) select.innerHTML = `<option value="">-- Pilih Ujian --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
}

function loadGradingQuestions() {
  const qSelect = document.getElementById('gradingQuestionFilter');
  if (qSelect) {
    qSelect.innerHTML = `<option value="1">Soal Uraian #1: Jelaskan Proses Fotosintesis</option>`;
    renderGradingList();
  }
}

function renderGradingList() {
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const list = document.getElementById('gradingStudentList');
  if (!results.length) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada jawaban siswa yang siap dikoreksi.</p>`;
    return;
  }

  list.innerHTML = results.map((r, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs space-y-2">
      <div class="flex justify-between font-bold"><span>${r.studentName}</span> <span>Skor Max: 30</span></div>
      <p class="text-slate-700 bg-white p-2 border rounded">"Jawaban siswa untuk soal uraian..."</p>
      <div class="flex items-center gap-2">
        <input type="number" placeholder="Nilai" id="essayVal_${i}" value="${r.essayScore || ''}" class="w-20 p-1 border rounded text-xs">
        <button onclick="saveSingleEssayScore(${i})" class="bg-blue-800 text-white px-3 py-1 rounded font-bold">Simpan & Berikutnya</button>
      </div>
    </div>
  `).join('');
}

function saveSingleEssayScore(i) {
  let results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const val = parseFloat(document.getElementById(`essayVal_${i}`).value);
  if (!isNaN(val)) {
    results[i].essayScore = val;
    localStorage.setItem('cbt_results', JSON.stringify(results));
    alert('Nilai uraian disimpan!');
    renderGradingList();
  }
}

// 6. LAPORAN & ANALISIS
function loadReportExams() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const select = document.getElementById('reportExamFilter');
  if (select) {
    select.innerHTML = `<option value="">-- Pilih Ujian --</option>` + schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    generateReportData();
  }
}

function generateReportData() {
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const tbody = document.getElementById('reportStudentTableBody');

  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada data hasil ujian.</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(r => `
    <tr class="border-b text-xs">
      <td class="p-2 font-bold">${r.studentName}</td>
      <td class="p-2">VII-A</td>
      <td class="p-2">${r.objScore || 0}</td>
      <td class="p-2">${r.essayScore || 0}</td>
      <td class="p-2 font-bold text-blue-900">${(r.objScore || 0) + (r.essayScore || 0)}</td>
      <td class="p-2"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">TUNTAS</span></td>
    </tr>
  `).join('');

  document.getElementById('itemAnalysisList').innerHTML = `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs">
      <strong>Soal #1 (PG)</strong> - Tingkat Kesulitan: <span class="text-emerald-700 font-bold">Mudah (85%)</span>
      <div class="text-[11px] text-slate-500 mt-1">Sebaran Pilihan: A (85%), B (10%), C (5%), D (0%)</div>
    </div>
  `;
}

function exportResultsToExcel() {
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const ws = XLSX.utils.json_to_sheet(results.map(r => ({
    "Nama Siswa": r.studentName,
    "Nilai Objektif": r.objScore,
    "Nilai Uraian": r.essayScore || 0,
    "Total Nilai": (r.objScore || 0) + (r.essayScore || 0)
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hasil Ujian");
  XLSX.writeFile(wb, "Rekap_Nilai_CBT.xlsx");
}

function printOfficialReport() {
  window.print();
}

// SISWA EXAM EXECUTION
function validateStudentToken() {
  const input = document.getElementById('studentTokenInput').value.trim().toUpperCase();
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const sched = schedules.find(s => s.token === input);

  if (!sched) return alert('Token tidak ditemukan!');

  activeExamSchedule = sched;
  document.getElementById('studentTokenCard').classList.add('hidden');
  document.getElementById('studentExamWorkspace').classList.remove('hidden');
  loadStudentQuestions();
}

function loadStudentQuestions() {
  activeStudentQuestions = [
    { id: 1, text: "Apa nama ibu kota Indonesia?", options: [{key:'A',text:'Jakarta'},{key:'B',text:'Surabaya'}], keys:['A'], type:'pg' }
  ];
  renderStudentQuestion(0);
}

function renderStudentQuestion(i) {
  currentQIndex = i;
  const q = activeStudentQuestions[i];
  document.getElementById('questionText').innerText = `${i + 1}. ${q.text}`;
  document.getElementById('optionsContainer').innerHTML = q.options.map(o => `
    <label class="flex items-center p-3 border rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
      <input type="radio" name="opt" value="${o.key}" class="mr-2"> ${o.key}. ${o.text}
    </label>
  `).join('');
}

function submitExam() {
  alert('Ujian selesai dikerjakan!');
  location.reload();
}
