// ==========================================
// APP-EXAM.JS: MODUL UJIAN, MONITORING & LAPORAN GURU
// ==========================================

window.initTeacherDashboard = function() {
  populateTeacherDropdowns();
  renderSummaryTab();
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
  if (tabId === 'tabBank') loadBankQuestions();
  if (tabId === 'tabSchedule') renderScheduleTable();
  if (tabId === 'tabMonitoring') renderMonitoringData();
}

function populateTeacherDropdowns() {
  const session = JSON.parse(localStorage.getItem('cbt_session') || '{}');
  const subSelect = document.getElementById('bankSubjectSelect');
  const classSelect = document.getElementById('bankClassSelect');

  if (!subSelect || !classSelect) return;

  const assignedSubs = session.assignedSubjects || [];
  const assignedClasses = session.assignedClasses || [];

  subSelect.innerHTML = assignedSubs.length ? assignedSubs.map(s => `<option value="${s}">${s}</option>`).join('') : `<option value="">-- Belum Ada Mapel Ditugaskan --</option>`;
  classSelect.innerHTML = assignedClasses.length ? assignedClasses.map(c => `<option value="${c}">${c}</option>`).join('') : `<option value="">-- Belum Ada Kelas Ditugaskan --</option>`;

  populateScheduleDropdowns(assignedSubs, assignedClasses);
  loadBankQuestions();
}

function populateScheduleDropdowns(assignedSubs, assignedClasses) {
  const schedSubject = document.getElementById('schedSubject');
  const schedBank = document.getElementById('schedBank');
  const classBox = document.getElementById('schedClassesCheckbox');

  if (schedSubject) schedSubject.innerHTML = assignedSubs.map(s => `<option value="${s}">${s}</option>`).join('');
  if (schedBank) schedBank.innerHTML = assignedSubs.map(s => `<option value="${s}">Bank Soal ${s}</option>`).join('');

  if (classBox) {
    classBox.innerHTML = assignedClasses.map(c => `
      <label class="inline-flex items-center text-xs bg-slate-100 px-2 py-1 rounded border">
        <input type="checkbox" name="schedClasses" value="${c}" class="mr-1.5"> ${c}
      </label>
    `).join('');
  }
}

function renderSummaryTab() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const activeCount = schedules.filter(s => s.active).length;

  document.getElementById('statActiveExams').innerText = activeCount;
  document.getElementById('statTotalQuestions').innerText = '120';
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
}

function loadBankQuestions() {
  const sub = document.getElementById('bankSubjectSelect').value;
  const cls = document.getElementById('bankClassSelect').value;
  const list = document.getElementById('bankQuestionsList');

  if (!sub || !cls) {
    list.innerHTML = `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Pilih mata pelajaran dan kelas di atas.</p>`;
    return;
  }

  const key = `cbt_bank_${sub}_${cls}`;
  const questions = JSON.parse(localStorage.getItem(key) || '[]');

  list.innerHTML = questions.length ? questions.map((q, i) => `
    <div class="bg-slate-50 p-3 rounded-lg border text-xs">#${i + 1} [${q.type}] ${q.text}</div>
  `).join('') : `<p class="text-xs text-slate-400 p-4 bg-slate-50 rounded">Belum ada soal untuk ${sub} (${cls}).</p>`;
}

function generateRandomToken() {
  document.getElementById('schedToken').value = Math.random().toString(36).substring(2, 8).toUpperCase();
}

function handleSaveSchedule(e) {
  e.preventDefault();
  const selectedClasses = Array.from(document.querySelectorAll('input[name="schedClasses"]:checked')).map(cb => cb.value);
  if (!selectedClasses.length) return alert('Pilih minimal satu kelas peserta!');

  const schedule = {
    id: 'SCHED_' + Date.now(),
    title: document.getElementById('schedTitle').value,
    subject: document.getElementById('schedSubject').value,
    bankCode: document.getElementById('schedBank').value,
    classes: selectedClasses,
    startTime: document.getElementById('schedStartTime').value,
    duration: parseInt(document.getElementById('schedDuration').value),
    token: document.getElementById('schedToken').value.toUpperCase(),
    active: true
  };

  let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  schedules.push(schedule);
  localStorage.setItem('cbt_schedules', JSON.stringify(schedules));

  alert('Jadwal ujian berhasil diterbitkan!');
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
      <td class="p-2"><span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">Aktif</span></td>
      <td class="p-2 text-center"><button onclick="switchTeacherTab('tabMonitoring')" class="bg-blue-800 text-white px-2 py-0.5 rounded">Pantau</button></td>
    </tr>
  `).join('');
}

function renderMonitoringData() {
  const tbody = document.getElementById('monitoringTableBody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa');
  tbody.innerHTML = users.map(u => `
    <tr class="border-b text-xs">
      <td class="p-2"><strong>${u.name}</strong> (${u.class})</td>
      <td class="p-2 font-bold text-slate-500">Belum Login</td>
      <td class="p-2">0 / 40</td>
      <td class="p-2">0x</td>
      <td class="p-2 text-center"><button class="bg-slate-400 text-white px-2 py-0.5 rounded">Reset</button></td>
    </tr>
  `).join('');
}

function validateStudentToken() {
  const input = document.getElementById('studentTokenInput').value.trim().toUpperCase();
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const sched = schedules.find(s => s.token === input);

  if (!sched) return alert('Token tidak valid!');

  alert('Token Terkonfirmasi! Memulai ujian...');
  document.getElementById('studentTokenCard').classList.add('hidden');
}

function exportResultsToExcel() {
  alert('Mengunduh rekapitulasi nilai Excel...');
}
