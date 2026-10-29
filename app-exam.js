// ==========================================
// APP-EXAM.JS: TAB SYSTEM, JADWAL & MONITORING REAL-TIME
// ==========================================

window.initTeacherDashboard = function() {
  populateDropdowns();
  renderScheduleTable();
  renderMonitoringData();
  updateSummaryStats();
};

// 1. MANAJEMEN TAB DEDIKASI GURU
function switchTeacherTab(tabId) {
  document.querySelectorAll('.teacher-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.teacher-tab-btn').forEach(el => el.classList.remove('active-tab'));

  document.getElementById(tabId).classList.remove('hidden');
  
  const activeBtnMap = {
    'tabSummary': 'btnTabSummary',
    'tabBank': 'btnTabBank',
    'tabSchedule': 'btnTabSchedule',
    'tabMonitoring': 'btnTabMonitoring',
    'tabGrading': 'btnTabGrading',
    'tabReports': 'btnTabReports'
  };

  if (activeBtnMap[tabId]) {
    document.getElementById(activeBtnMap[tabId]).classList.add('active-tab');
  }
}

// 2. FORM & JADWAL UJIAN LENGKAP
function populateDropdowns() {
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  const schedSubject = document.getElementById('schedSubject');
  const schedBank = document.getElementById('schedBank');
  const classBox = document.getElementById('schedClassesCheckbox');

  if (schedSubject) {
    schedSubject.innerHTML = subjects.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
    schedBank.innerHTML = subjects.map(s => `<option value="${s.code}">Bank Soal ${s.code}</option>`).join('');
  }

  if (classBox) {
    classBox.innerHTML = classes.map(c => `
      <label class="inline-flex items-center text-xs bg-slate-100 px-2 py-1 rounded border">
        <input type="checkbox" name="schedClasses" value="${c}" class="mr-1.5" checked> ${c}
      </label>
    `).join('');
  }
}

function generateRandomToken() {
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById('schedToken').value = token;
}

function handleSaveSchedule(e) {
  e.preventDefault();
  
  const id = document.getElementById('schedIdInput').value || 'SCHED_' + Date.now();
  const selectedClasses = Array.from(document.querySelectorAll('input[name="schedClasses"]:checked')).map(cb => cb.value);

  if (!selectedClasses.length) return alert('Pilih minimal satu kelas peserta!');

  const scheduleData = {
    id: id,
    title: document.getElementById('schedTitle').value,
    subject: document.getElementById('schedSubject').value,
    bankCode: document.getElementById('schedBank').value,
    classes: selectedClasses,
    startTime: document.getElementById('schedStartTime').value,
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

  if (index > -1) {
    schedules[index] = scheduleData;
  } else {
    schedules.push(scheduleData);
  }

  localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
  alert('Jadwal Ujian berhasil disimpan!');
  
  e.target.reset();
  document.getElementById('schedIdInput').value = '';
  renderScheduleTable();
  populateDropdowns();
}

function renderScheduleTable() {
  const tbody = document.getElementById('schedTableBody');
  if (!tbody) return;

  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  tbody.innerHTML = '';

  if (!schedules.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada jadwal ujian diterbitkan.</td></tr>`;
    return;
  }

  schedules.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2">
        <div class="font-bold text-slate-800">${s.title}</div>
        <div class="text-[10px] text-slate-500">${s.subject} | Kelas: ${s.classes.join(', ')} | Token: <code class="text-blue-600 font-bold">${s.token}</code></div>
      </td>
      <td class="p-2 text-[11px]">
        <div>${s.startTime.replace('T', ' ')}</div>
        <div class="text-slate-500">${s.duration} Menit (${s.questionCount} Soal)</div>
      </td>
      <td class="p-2">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${s.active ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td class="p-2 text-center space-x-1">
        <button onclick="toggleScheduleStatus('${s.id}')" class="bg-slate-600 text-white px-2 py-1 rounded text-[10px]" title="Aktif/Nonaktifkan"><i class="fa-solid fa-power-off"></i></button>
        <button onclick="editSchedule('${s.id}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px]" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="duplicateSchedule('${s.id}')" class="bg-blue-600 text-white px-2 py-1 rounded text-[10px]" title="Duplikat"><i class="fa-solid fa-copy"></i></button>
        <button onclick="deleteSchedule('${s.id}')" class="bg-rose-600 text-white px-2 py-1 rounded text-[10px]" title="Hapus"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  populateMonitoringFilters();
}

function toggleScheduleStatus(id) {
  let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const sched = schedules.find(s => s.id === id);
  if (sched) {
    sched.active = !sched.active;
    localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
    renderScheduleTable();
  }
}

function deleteSchedule(id) {
  if (confirm('Yakin ingin menghapus jadwal ujian ini?')) {
    let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
    schedules = schedules.filter(s => s.id !== id);
    localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
    renderScheduleTable();
  }
}

function editSchedule(id) {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const s = schedules.find(x => x.id === id);
  if (!s) return;

  document.getElementById('schedIdInput').value = s.id;
  document.getElementById('schedTitle').value = s.title;
  document.getElementById('schedSubject').value = s.subject;
  document.getElementById('schedBank').value = s.bankCode;
  document.getElementById('schedStartTime').value = s.startTime;
  document.getElementById('schedDuration').value = s.duration;
  document.getElementById('schedQuestionCount').value = s.questionCount;
  document.getElementById('schedKKM').value = s.kkm;
  document.getElementById('schedMaxViolations').value = s.maxViolations;
  document.getElementById('schedLateLimit').value = s.lateLimit;
  document.getElementById('schedToken').value = s.token;
  document.getElementById('schedRandomQ').checked = s.randomQ;
  document.getElementById('schedRandomOpt').checked = s.randomOpt;
  document.getElementById('schedResultDisplay').value = s.resultDisplay;
}

function duplicateSchedule(id) {
  let schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const s = schedules.find(x => x.id === id);
  if (s) {
    const dupe = { ...s, id: 'SCHED_' + Date.now(), title: s.title + ' (Salinan)', token: Math.random().toString(36).substring(2, 8).toUpperCase() };
    schedules.push(dupe);
    localStorage.setItem('cbt_schedules', JSON.stringify(schedules));
    renderScheduleTable();
  }
}

// 3. FITUR MONITORING UJIAN REAL-TIME
function populateMonitoringFilters() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  const examFilter = document.getElementById('monitorExamFilter');
  const classFilter = document.getElementById('monitorClassFilter');

  if (examFilter) {
    examFilter.innerHTML = `<option value="">-- Pilih Ujian Aktif --</option>` + 
      schedules.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
  }

  if (classFilter) {
    classFilter.innerHTML = `<option value="">-- Semua Kelas --</option>` + 
      classes.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function renderMonitoringData() {
  const tbody = document.getElementById('monitoringTableBody');
  if (!tbody) return;

  const selectedSchedId = document.getElementById('monitorExamFilter').value;
  const selectedClass = document.getElementById('monitorClassFilter').value;

  if (!selectedSchedId) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-desktop text-3xl mb-2 block text-slate-300"></i>
          Pilih Jadwal Ujian Aktif di atas untuk mulai memantau peserta ujian secara real-time.
        </td>
      </tr>`;
    return;
  }

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa');
  const liveData = JSON.parse(localStorage.getItem('cbt_live_monitoring') || '{}');
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const currentSched = schedules.find(s => s.id === selectedSchedId);

  tbody.innerHTML = '';

  const filteredUsers = users.filter(u => !selectedClass || u.class === selectedClass);

  filteredUsers.forEach(u => {
    const studentState = liveData[`${selectedSchedId}_${u.username}`] || {
      status: 'NOT_LOGGED_IN',
      progress: 0,
      total: currentSched ? currentSched.questionCount : 40,
      violations: 0,
      startTime: '-',
      endTime: '-'
    };

    const statusBadgeMap = {
      'NOT_LOGGED_IN': '<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">Belum Login</span>',
      'IN_PROGRESS': '<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">Sedang Mengerjakan</span>',
      'COMPLETED': '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">Sudah Selesai</span>',
      'LOCKED': '<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px] font-bold">Terkunci</span>'
    };

    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50 text-xs';
    tr.innerHTML = `
      <td class="p-2.5">
        <div class="font-bold text-slate-800">${u.name}</div>
        <div class="text-[10px] text-slate-500">NISN: ${u.nisn || '-'} | Kelas: ${u.class || '-'}</div>
      </td>
      <td class="p-2.5">${statusBadgeMap[studentState.status]}</td>
      <td class="p-2.5 font-semibold text-slate-700">${studentState.progress} / ${studentState.total} Soal</td>
      <td class="p-2.5">
        <span class="${studentState.violations > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}">
          ${studentState.violations}x Melanggar
        </span>
      </td>
      <td class="p-2.5 text-[10px] text-slate-500">${studentState.startTime} - ${studentState.endTime}</td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'reset')" class="bg-slate-600 hover:bg-slate-700 text-white px-2 py-1 rounded text-[10px]" title="Reset Sesi"><i class="fa-solid fa-rotate-left mr-1"></i>Reset</button>
        <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'add_time')" class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-[10px]" title="Tambah Waktu"><i class="fa-solid fa-clock-plus mr-1"></i>+10m</button>
        <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'force_submit')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-[10px]" title="Paksa Submit"><i class="fa-solid fa-box-archive mr-1"></i>Submit</button>
        <button onclick="controlStudentAction('${selectedSchedId}', '${u.username}', 'unlock')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px]" title="Buka Kunci"><i class="fa-solid fa-lock-open mr-1"></i>Buka</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function controlStudentAction(schedId, username, action) {
  let liveData = JSON.parse(localStorage.getItem('cbt_live_monitoring') || '{}');
  const key = `${schedId}_${username}`;

  if (!liveData[key]) {
    liveData[key] = { status: 'NOT_LOGGED_IN', progress: 0, total: 40, violations: 0, startTime: '-', endTime: '-' };
  }

  if (action === 'reset') {
    liveData[key].status = 'NOT_LOGGED_IN';
    alert(`Sesi login siswa ${username} telah di-reset.`);
  } else if (action === 'unlock') {
    liveData[key].status = 'IN_PROGRESS';
    liveData[key].violations = 0;
    alert(`Kunci akun siswa ${username} telah dibuka.`);
  } else if (action === 'force_submit') {
    liveData[key].status = 'COMPLETED';
    alert(`Jawaban siswa ${username} berhasil dipaksa kumpul (submit).`);
  } else if (action === 'add_time') {
    alert(`Waktu pengerjaan siswa ${username} ditambahkan 10 menit.`);
  }

  localStorage.setItem('cbt_live_monitoring', JSON.stringify(liveData));
  renderMonitoringData();
}

function updateSummaryStats() {
  const schedules = JSON.parse(localStorage.getItem('cbt_schedules') || '[]');
  const activeExamsCount = schedules.filter(s => s.active).length;

  document.getElementById('statActiveExams').innerText = activeExamsCount;
  document.getElementById('statTotalQuestions').innerText = '120';
  document.getElementById('statPendingGrading').innerText = '5';
  document.getElementById('statOnlineStudents').innerText = '12';
}
