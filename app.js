/* ==========================================================================
   CONFIG & GLOBAL DATA STRUCTURES
   ========================================================================== */
let currentUser = null; 

// Master Data Terpusat (Admin)
let masterClasses = ["Kelas 7A", "Kelas 7B", "Kelas 8A", "Kelas 8B", "Kelas 9A", "Kelas 9B"];
let masterSubjects = ["Matematika", "PAI / Al-Qur'an Hadits", "Bahasa Indonesia", "Bahasa Inggris", "IPA", "IPS"];

let subjectsData = [
  {
    id: "mapel_1",
    title: "Matematika",
    targetClass: "Kelas 7A",
    teacherUsername: "guru1",
    teacherName: "Ustadz Ahmad, S.Pd.",
    duration: 30,
    schedule: {
      status: "active",
      startDate: "2026-01-01",
      startTime: "07:00",
      endDate: "2026-12-31",
      endTime: "23:59"
    },
    questions: [
      { id: 101, text: "Berapakah hasil dari 12 x 12?", options: { A: "124", B: "144", C: "164", D: "184", E: "200" }, correct: "B" }
    ]
  },
  {
    id: "mapel_2",
    title: "PAI / Al-Qur'an Hadits",
    targetClass: "Kelas 7A",
    teacherUsername: "guru2",
    teacherName: "Ustadz Mahmud, Lc.",
    duration: 45,
    schedule: {
      status: "active",
      startDate: "2026-01-01",
      startTime: "07:00",
      endDate: "2026-12-31",
      endTime: "23:59"
    },
    questions: [
      { id: 201, text: "Surah pertama yang diturunkan adalah...", options: { A: "Al-Fatihah", B: "Al-Ikhlas", C: "Al-'Alaq 1-5", D: "Al-Baqarah", E: "An-Nas" }, correct: "C" }
    ]
  }
];

let defaultUsers = [
  { id: 1, name: "Administrator Utama", username: "admin", password: "adminpassword", role: "admin" },
  { id: 2, name: "Ustadz Ahmad, S.Pd.", username: "guru1", password: "gurupassword", role: "guru", assignedInfo: "Matematika" },
  { id: 3, name: "Ustadz Mahmud, Lc.", username: "guru2", password: "gurupassword", role: "guru", assignedInfo: "PAI" },
  { id: 4, name: "Muhammad Ali", username: "siswa1", password: "siswapassword", role: "siswa", studentClass: "Kelas 7A" }
];

let usersList = [];

let selectedAdminSubjectId = "";
let selectedTeacherSubjectId = "";
let selectedStudentSubjectId = "";
let currentScheduleEditingRole = "";

let currentActiveExamQuestions = [];
let currentExamDuration = 30;
let currentExamTitle = "";
let currentExamTeacher = "";
let currentExamClass = "";

let studentAnswers = {}; 
let currentQuestionIndex = 0;
let timerInterval = null;
let examTimeSeconds = 0;
let cheatingViolations = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = false;

/* ==========================================================================
   INITIALIZATION & PERSISTENCE
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupAntiCheatingEvents();
});

function loadData() {
  const savedMasterClasses = localStorage.getItem("cbt_master_classes");
  if (savedMasterClasses) {
    try { masterClasses = JSON.parse(savedMasterClasses); } catch(e) {}
  } else {
    localStorage.setItem("cbt_master_classes", JSON.stringify(masterClasses));
  }

  const savedMasterSubjects = localStorage.getItem("cbt_master_subjects");
  if (savedMasterSubjects) {
    try { masterSubjects = JSON.parse(savedMasterSubjects); } catch(e) {}
  } else {
    localStorage.setItem("cbt_master_subjects", JSON.stringify(masterSubjects));
  }

  const savedSubjects = localStorage.getItem("cbt_subjects_data");
  if (savedSubjects) {
    try { subjectsData = JSON.parse(savedSubjects); } catch(e) { saveData(); }
  } else {
    saveData();
  }

  loadUsersData();
}

function saveData() {
  localStorage.setItem("cbt_subjects_data", JSON.stringify(subjectsData));
}

function saveMasterData() {
  localStorage.setItem("cbt_master_classes", JSON.stringify(masterClasses));
  localStorage.setItem("cbt_master_subjects", JSON.stringify(masterSubjects));
}

function loadUsersData() {
  const savedUsers = localStorage.getItem("cbt_users");
  if (savedUsers) {
    try {
      usersList = JSON.parse(savedUsers);
      const hasAdmin = usersList.some(u => u.role === 'admin');
      if (!hasAdmin) { usersList = [...defaultUsers]; saveUsersData(); }
    } catch (e) {
      usersList = [...defaultUsers]; saveUsersData();
    }
  } else {
    usersList = [...defaultUsers];
    saveUsersData();
  }
}

function saveUsersData() {
  localStorage.setItem("cbt_users", JSON.stringify(usersList));
}

async function saveResultToDB(resultData) {
  let localResults = JSON.parse(localStorage.getItem("cbt_results") || "[]");
  localResults.push(resultData);
  localStorage.setItem("cbt_results", JSON.stringify(localResults));
}

async function getResultsFromDB() {
  return JSON.parse(localStorage.getItem("cbt_results") || "[]");
}

function saveResultsToDB(resultsArray) {
  localStorage.setItem("cbt_results", JSON.stringify(resultsArray));
}

/* ==========================================================================
   AUTHENTICATION & NAVIGATION
   ========================================================================== */
function showView(viewId) {
  const views = ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudentInstruction', 'viewExamInterface', 'viewStudentResult'];
  
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.add('hidden');
  });

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.remove('hidden');
}

function handleLogin(e) {
  if (e) e.preventDefault();
  
  const inputRole = document.getElementById('loginRole').value.trim().toLowerCase();
  const inputUser = document.getElementById('loginUsername').value.trim().toLowerCase();
  const inputPass = document.getElementById('loginPassword').value.trim();

  loadUsersData();

  const foundUser = usersList.find(u => 
    u.username.toLowerCase() === inputUser && 
    u.password === inputPass && 
    u.role.toLowerCase() === inputRole
  );

  if (foundUser) {
    currentUser = { ...foundUser };
    
    const userHeader = document.getElementById('userInfoHeader');
    const userBadge = document.getElementById('userBadge');
    if (userHeader) userHeader.classList.remove('hidden');
    if (userBadge) userBadge.innerText = `${foundUser.name} (${foundUser.role.toUpperCase()})`;

    if (foundUser.role.toLowerCase() === 'admin') {
      setupAdminDashboard();
      showView('viewAdmin');
    } else if (foundUser.role.toLowerCase() === 'guru') {
      setupTeacherDashboard();
      showView('viewTeacher');
    } else {
      setupStudentInstruction();
      showView('viewStudentInstruction');
    }
  } else {
    alert("Kredensial atau Peran tidak cocok! Periksa kembali Username dan Password Anda.");
  }
}

function logout() {
  if (isExamActive && !confirm("Ujian sedang berlangsung. Yakin ingin keluar?")) return;
  stopExam();
  currentUser = null;
  const userHeader = document.getElementById('userInfoHeader');
  if (userHeader) userHeader.classList.add('hidden');
  showView('viewLogin');
}

/* ==========================================================================
   1. DASHBOARD ADMIN LOGIC (MASTER DATA KELAS & MAPEL)
   ========================================================================== */
function setupAdminDashboard() {
  if (currentUser) {
    const adminUserEl = document.getElementById('adminNewUsername');
    const adminPassEl = document.getElementById('adminNewPassword');
    if (adminUserEl) adminUserEl.value = currentUser.username;
    if (adminPassEl) adminPassEl.value = currentUser.password;
  }

  renderMasterDataAdmin();
  populateDropdownsFromMaster();
  renderAdminSubjectDropdown();
  renderUsersTableAdmin();
  renderResultsTableAdmin('admin');
}

function renderMasterDataAdmin() {
  const classContainer = document.getElementById('masterClassBadgeContainer');
  const subjectContainer = document.getElementById('masterSubjectBadgeContainer');

  if (classContainer) {
    classContainer.innerHTML = '';
    masterClasses.forEach((cls, idx) => {
      classContainer.innerHTML += `
        <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-2">
          <span>${cls}</span>
          <button onclick="deleteMasterClass(${idx})" class="text-indigo-400 hover:text-red-600"><i class="fa-solid fa-xmark"></i></button>
        </span>
      `;
    });
  }

  if (subjectContainer) {
    subjectContainer.innerHTML = '';
    masterSubjects.forEach((sub, idx) => {
      subjectContainer.innerHTML += `
        <span class="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-2">
          <span>${sub}</span>
          <button onclick="deleteMasterSubject(${idx})" class="text-blue-400 hover:text-red-600"><i class="fa-solid fa-xmark"></i></button>
        </span>
      `;
    });
  }
}

function handleAddMasterClass(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('adminNewClassInput');
  const val = input ? input.value.trim() : '';

  if (val && !masterClasses.includes(val)) {
    masterClasses.push(val);
    saveMasterData();
    renderMasterDataAdmin();
    populateDropdownsFromMaster();
    if (input) input.value = '';
  }
}

function deleteMasterClass(idx) {
  if (confirm(`Hapus "${masterClasses[idx]}" dari master kelas?`)) {
    masterClasses.splice(idx, 1);
    saveMasterData();
    renderMasterDataAdmin();
    populateDropdownsFromMaster();
  }
}

function handleAddMasterSubject(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('adminNewSubjectInput');
  const val = input ? input.value.trim() : '';

  if (val && !masterSubjects.includes(val)) {
    masterSubjects.push(val);
    saveMasterData();
    renderMasterDataAdmin();
    populateDropdownsFromMaster();
    if (input) input.value = '';
  }
}

function deleteMasterSubject(idx) {
  if (confirm(`Hapus "${masterSubjects[idx]}" dari master mapel?`)) {
    masterSubjects.splice(idx, 1);
    saveMasterData();
    renderMasterDataAdmin();
    populateDropdownsFromMaster();
  }
}

/* Mengisi seluruh dropdown berdasarkan Master Data Admin */
function populateDropdownsFromMaster() {
  const teacherSubjectSelect = document.getElementById('teacherNewSubjectTitleSelect');
  const teacherClassSelect = document.getElementById('teacherNewSubjectClassSelect');
  const editTeacherSubjectSelect = document.getElementById('editTeacherSubjectTitleSelect');
  const editTeacherClassSelect = document.getElementById('editTeacherSubjectClassSelect');
  const newStudentClassSelect = document.getElementById('newStudentClassSelect');
  const newTeacherAssignedSelect = document.getElementById('newTeacherAssignedSelect');

  if (teacherSubjectSelect) {
    teacherSubjectSelect.innerHTML = masterSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
  }
  if (editTeacherSubjectSelect) {
    editTeacherSubjectSelect.innerHTML = masterSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
  }
  if (newTeacherAssignedSelect) {
    newTeacherAssignedSelect.innerHTML = masterSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  if (teacherClassSelect) {
    teacherClassSelect.innerHTML = masterClasses.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (editTeacherClassSelect) {
    editTeacherClassSelect.innerHTML = masterClasses.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (newStudentClassSelect) {
    newStudentClassSelect.innerHTML = masterClasses.map(c => `<option value="${c}">${c}</option>`).join('');
  }
}

function handleUpdateAdminCredentials(e) {
  if (e) e.preventDefault();
  const newUsername = document.getElementById('adminNewUsername').value.trim();
  const newPassword = document.getElementById('adminNewPassword').value.trim();

  if (!newUsername || !newPassword) return alert("Username dan Password Admin tidak boleh kosong!");

  const adminAcc = usersList.find(u => u.id === currentUser.id || u.role === 'admin');
  if (adminAcc) {
    adminAcc.username = newUsername;
    adminAcc.password = newPassword;
    currentUser.username = newUsername;
    currentUser.password = newPassword;

    saveUsersData();
    renderUsersTableAdmin();
    alert("Profil Admin berhasil diperbarui!");
  }
}

function renderAdminSubjectDropdown() {
  const select = document.getElementById('adminSubjectSelect');
  if (!select) return;
  select.innerHTML = '';

  subjectsData.forEach(sub => {
    select.innerHTML += `<option value="${sub.id}">${sub.title} - ${sub.targetClass} (Guru: ${sub.teacherName || 'Admin'})</option>`;
  });

  if (subjectsData.length > 0) {
    selectedAdminSubjectId = subjectsData[0].id;
    renderQuestionListAdmin('admin');
  }
}

/* ==========================================================================
   2. DASHBOARD GURU LOGIC (MEMILIH DARI MASTER DATA)
   ========================================================================== */
function setupTeacherDashboard() {
  populateDropdownsFromMaster();
  renderTeacherSubjectDropdown();
  renderResultsTableAdmin('teacher');
}

function renderTeacherSubjectDropdown() {
  const select = document.getElementById('teacherSubjectSelect');
  if (!select) return;
  select.innerHTML = '';

  const mySubjects = subjectsData.filter(s => s.teacherUsername === currentUser.username);

  if (mySubjects.length === 0) {
    select.innerHTML = '<option value="">Anda belum mengampu mata pelajaran</option>';
    selectedTeacherSubjectId = "";
    const container = document.getElementById('teacherQuestionsContainer');
    if (container) container.innerHTML = '<p class="text-xs text-slate-400">Tidak ada data soal.</p>';
  } else {
    mySubjects.forEach(sub => {
      select.innerHTML += `<option value="${sub.id}">${sub.title} - ${sub.targetClass}</option>`;
    });
    selectedTeacherSubjectId = mySubjects[0].id;
    renderQuestionListAdmin('teacher');
  }
}

function handleTeacherAddSubject() {
  const title = document.getElementById('teacherNewSubjectTitleSelect').value;
  const targetClass = document.getElementById('teacherNewSubjectClassSelect').value;
  const duration = parseInt(document.getElementById('teacherNewSubjectDuration').value) || 30;

  if (!title || !targetClass) return alert("Pilih Mapel dan Target Kelas dari dropdown!");

  const newSub = {
    id: "mapel_" + Date.now(),
    title, targetClass, duration,
    teacherUsername: currentUser.username,
    teacherName: currentUser.name,
    schedule: {
      status: "active",
      startDate: new Date().toISOString().split('T')[0],
      startTime: "07:00",
      endDate: new Date().toISOString().split('T')[0],
      endTime: "23:59"
    },
    questions: []
  };

  subjectsData.push(newSub);
  selectedTeacherSubjectId = newSub.id;
  saveData();
  renderTeacherSubjectDropdown();
  alert(`Mapel "${title}" (${targetClass}) berhasil ditambahkan!`);
}

function handleTeacherSubjectChange() {
  const select = document.getElementById('teacherSubjectSelect');
  if (select) {
    selectedTeacherSubjectId = select.value;
    renderQuestionListAdmin('teacher');
  }
}

/* Modal Edit & Hapus Soal Individu */
function renderQuestionListAdmin(role) {
  const containerId = role === 'admin' ? 'questionsListContainer' : 'teacherQuestionsContainer';
  const subjectId = role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const activeSub = subjectsData.find(s => s.id === subjectId);
  if (!activeSub || activeSub.questions.length === 0) { 
    container.innerHTML = '<p class="text-xs text-slate-400 p-2">Belum ada soal dalam mapel ini.</p>'; 
    return; 
  }

  container.innerHTML = '';
  activeSub.questions.forEach((q, idx) => {
    container.innerHTML += `
      <div class="p-3 border rounded-lg bg-slate-50 flex justify-between items-start text-sm">
        <div class="pr-3">
          <p class="font-semibold text-slate-800">${idx + 1}. ${q.text}</p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 mt-2">
            <p>A: ${q.options.A}</p><p>B: ${q.options.B}</p>
            <p>C: ${q.options.C}</p><p>D: ${q.options.D}</p>
            <p class="col-span-2">E: ${q.options.E}</p>
          </div>
          <p class="text-xs text-slate-500 mt-1">Kunci: <strong class="text-green-600">${q.correct}</strong></p>
        </div>
        <div class="flex flex-col space-y-1">
          <button onclick="openEditQuestionModal('${activeSub.id}', ${q.id})" class="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded">Edit</button>
          <button onclick="handleDeleteQuestion('${activeSub.id}', ${q.id})" class="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded">Hapus</button>
        </div>
      </div>
    `;
  });
}

function openEditQuestionModal(subjectId, questionId) {
  const activeSub = subjectsData.find(s => s.id === subjectId);
  if (!activeSub) return;
  const q = activeSub.questions.find(item => item.id === questionId);
  if (!q) return;

  document.getElementById('editQId').value = q.id;
  document.getElementById('editQText').value = q.text;
  document.getElementById('editQOptA').value = q.options.A || "";
  document.getElementById('editQOptB').value = q.options.B || "";
  document.getElementById('editQOptC').value = q.options.C || "";
  document.getElementById('editQOptD').value = q.options.D || "";
  document.getElementById('editQOptE').value = q.options.E || "";
  document.getElementById('editQCorrect').value = q.correct || "A";

  document.getElementById('modalEditQuestion').classList.remove('hidden');
}

function closeEditQuestionModal() {
  document.getElementById('modalEditQuestion').classList.add('hidden');
}

function handleSaveEditedQuestion(e) {
  if (e) e.preventDefault();
  const qId = parseFloat(document.getElementById('editQId').value);
  const subjectId = currentUser.role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const activeSub = subjectsData.find(s => s.id === subjectId);

  if (!activeSub) return;
  const q = activeSub.questions.find(item => item.id === qId);
  if (!q) return;

  q.text = document.getElementById('editQText').value.trim();
  q.options.A = document.getElementById('editQOptA').value.trim();
  q.options.B = document.getElementById('editQOptB').value.trim();
  q.options.C = document.getElementById('editQOptC').value.trim();
  q.options.D = document.getElementById('editQOptD').value.trim();
  q.options.E = document.getElementById('editQOptE').value.trim();
  q.correct = document.getElementById('editQCorrect').value;

  saveData();
  renderQuestionListAdmin(currentUser.role);
  closeEditQuestionModal();
  alert("Pertanyaan dan opsi jawaban berhasil diperbarui!");
}

function handleDeleteQuestion(subjectId, questionId) {
  const activeSub = subjectsData.find(s => s.id === subjectId);
  if (!activeSub) return;

  if (confirm("Hapus soal ini secara permanen dari bank soal?")) {
    activeSub.questions = activeSub.questions.filter(q => q.id !== questionId);
    saveData();
    renderQuestionListAdmin(currentUser.role);
  }
}

/* Edit & Hapus Hasil Rekap Nilai Submitted */
async function renderResultsTableAdmin(role) {
  const tbodyId = role === 'admin' ? 'adminResultsTableBody' : 'teacherResultsTableBody';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  const results = await getResultsFromDB();

  tbody.innerHTML = '';
  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-xs text-slate-400">Belum ada data rekap nilai.</td></tr>`;
    return;
  }

  results.forEach((r, originalIndex) => {
    if (role === 'teacher' && r.teacherUsername !== currentUser.username) return;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 font-semibold">${r.student}</td>
        <td class="p-2.5">${r.studentClass}</td>
        <td class="p-2.5 font-bold text-blue-600">${r.subject}</td>
        <td class="p-2.5 font-medium text-slate-600">${r.teacherName || '-'}</td>
        <td class="p-2.5">${r.timestamp}</td>
        <td class="p-2.5">${r.correct}/${r.wrong}</td>
        <td class="p-2.5 font-bold text-emerald-600">${r.score}</td>
        <td class="p-2.5 text-xs font-bold text-red-600">${r.violations}x Melanggar</td>
        <td class="p-2.5 text-center">
          <div class="flex justify-center space-x-1">
            <button onclick="openEditResultModal(${originalIndex})" class="bg-amber-500 hover:bg-amber-600 text-white text-xs px-2 py-1 rounded">Edit Nilai</button>
            <button onclick="handleDeleteResult(${originalIndex})" class="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded">Hapus</button>
          </div>
        </td>
      </tr>
    `;
  });
}

async function openEditResultModal(index) {
  const results = await getResultsFromDB();
  const targetResult = results[index];
  if (!targetResult) return;

  document.getElementById('editResultIndex').value = index;
  document.getElementById('editResultStudent').value = `${targetResult.student} (${targetResult.subject})`;
  document.getElementById('editResultCorrect').value = targetResult.correct;
  document.getElementById('editResultWrong').value = targetResult.wrong;
  document.getElementById('editResultScore').value = targetResult.score;
  document.getElementById('editResultViolations').value = targetResult.violations;

  document.getElementById('modalEditResult').classList.remove('hidden');
}

function closeEditResultModal() {
  document.getElementById('modalEditResult').classList.add('hidden');
}

async function handleSaveEditedResult(e) {
  if (e) e.preventDefault();
  const idx = parseInt(document.getElementById('editResultIndex').value);
  const results = await getResultsFromDB();

  if (results[idx]) {
    results[idx].correct = parseInt(document.getElementById('editResultCorrect').value) || 0;
    results[idx].wrong = parseInt(document.getElementById('editResultWrong').value) || 0;
    results[idx].score = parseInt(document.getElementById('editResultScore').value) || 0;
    results[idx].violations = parseInt(document.getElementById('editResultViolations').value) || 0;

    saveResultsToDB(results);
    renderResultsTableAdmin(currentUser.role);
    closeEditResultModal();
    alert("Koreksi nilai siswa berhasil disimpan!");
  }
}

async function handleDeleteResult(index) {
  const results = await getResultsFromDB();
  if (!results[index]) return;

  if (confirm(`Hapus hasil ujian milik "${results[index].student}"? Siswa dapat diizinkan mengambil ujian ulang setelahnya.`)) {
    results.splice(index, 1);
    saveResultsToDB(results);
    renderResultsTableAdmin(currentUser.role);
  }
}

/* Modal Jadwal Ujian */
function openScheduleModal(role) {
  currentScheduleEditingRole = role;
  const subjectId = role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const activeSub = subjectsData.find(s => s.id === subjectId);

  if (!activeSub) return alert("Pilih mata pelajaran terlebih dahulu!");

  const sched = activeSub.schedule || {
    status: "active",
    startDate: new Date().toISOString().split('T')[0],
    startTime: "07:00",
    endDate: new Date().toISOString().split('T')[0],
    endTime: "23:59"
  };

  document.getElementById('schedStatus').value = sched.status;
  document.getElementById('schedStartDate').value = sched.startDate;
  document.getElementById('schedStartTime').value = sched.startTime;
  document.getElementById('schedEndDate').value = sched.endDate;
  document.getElementById('schedEndTime').value = sched.endTime;

  document.getElementById('modalScheduleExam').classList.remove('hidden');
}

function closeScheduleModal() {
  document.getElementById('modalScheduleExam').classList.add('hidden');
}

function handleSaveSchedule(e) {
  if (e) e.preventDefault();
  const subjectId = currentScheduleEditingRole === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const activeSub = subjectsData.find(s => s.id === subjectId);

  if (!activeSub) return;

  activeSub.schedule = {
    status: document.getElementById('schedStatus').value,
    startDate: document.getElementById('schedStartDate').value,
    startTime: document.getElementById('schedStartTime').value,
    endDate: document.getElementById('schedEndDate').value,
    endTime: document.getElementById('schedEndTime').value
  };

  saveData();
  closeScheduleModal();
  alert("Jadwal pelaksanaan ujian berhasil diperbarui!");
}

/* Modal & Logika EDIT Mapel Guru */
function openEditTeacherSubjectModal() {
  if (!selectedTeacherSubjectId) return alert("Tidak ada mata pelajaran yang dipilih!");
  const activeSub = subjectsData.find(s => s.id === selectedTeacherSubjectId);
  if (!activeSub) return;

  populateDropdownsFromMaster();
  document.getElementById('editTeacherSubjectTitleSelect').value = activeSub.title;
  document.getElementById('editTeacherSubjectClassSelect').value = activeSub.targetClass;
  document.getElementById('editTeacherSubjectDuration').value = activeSub.duration;

  document.getElementById('modalEditTeacherSubject').classList.remove('hidden');
}

function closeEditTeacherSubjectModal() {
  document.getElementById('modalEditTeacherSubject').classList.add('hidden');
}

function handleSaveEditedTeacherSubject(e) {
  if (e) e.preventDefault();
  const activeSub = subjectsData.find(s => s.id === selectedTeacherSubjectId);
  if (!activeSub) return;

  const newTitle = document.getElementById('editTeacherSubjectTitleSelect').value;
  const newClass = document.getElementById('editTeacherSubjectClassSelect').value;
  const newDuration = parseInt(document.getElementById('editTeacherSubjectDuration').value) || 30;

  activeSub.title = newTitle;
  activeSub.targetClass = newClass;
  activeSub.duration = newDuration;

  saveData();
  renderTeacherSubjectDropdown();
  closeEditTeacherSubjectModal();
  alert("Informasi mata pelajaran berhasil diperbarui!");
}

function handleDeleteTeacherSubject() {
  if (!selectedTeacherSubjectId) return alert("Pilih mata pelajaran yang ingin dihapus!");
  const activeSub = subjectsData.find(s => s.id === selectedTeacherSubjectId);
  if (!activeSub) return;

  if (confirm(`Apakah Anda yakin ingin menghapus mata pelajaran "${activeSub.title}" (${activeSub.targetClass}) beserta seluruh bank soal di dalamnya?`)) {
    subjectsData = subjectsData.filter(s => s.id !== selectedTeacherSubjectId);
    saveData();
    renderTeacherSubjectDropdown();
    alert("Mata pelajaran berhasil dihapus!");
  }
}

/* Import File Word/PDF untuk Guru */
async function handleUploadQuestionFile(role) {
  const fileInput = document.getElementById('qFileInputGuru');
  const subjectId = role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;

  const activeSub = subjectsData.find(s => s.id === subjectId);
  if (!activeSub) return alert("Pilih mata pelajaran aktif terlebih dahulu!");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return alert("Pilih file Word (.docx) atau PDF (.pdf) yang akan diunggah!");
  }

  const file = fileInput.files[0];
  const fileName = file.name.toLowerCase();

  try {
    let extractedText = "";

    if (fileName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.pdf')) {
      extractedText = await readPdfText(file);
    } else {
      return alert("Format file tidak didukung! Harus berupa file .docx atau .pdf");
    }

    const parsedQuestions = parseRawTextToQuestions(extractedText);

    if (parsedQuestions.length === 0) {
      return alert("Gagal membaca soal! Pastikan format teks dalam file sesuai petunjuk.");
    }

    activeSub.questions.push(...parsedQuestions);
    saveData();
    renderQuestionListAdmin(role);

    fileInput.value = '';
    alert(`Berhasil mengimpor ${parsedQuestions.length} soal dari file "${file.name}"!`);

  } catch (error) {
    console.error("Error reading file:", error);
    alert("Terjadi kesalahan saat membaca isi file.");
  }
}

async function readPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText;
}

function parseRawTextToQuestions(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const questions = [];
  let currentQuestion = null;

  lines.forEach(line => {
    const qMatch = line.match(/^(\d+)[\.\)]\s*(.+)/);
    if (qMatch) {
      if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);
      currentQuestion = {
        id: Date.now() + Math.random(),
        text: qMatch[2],
        options: { A: "", B: "", C: "", D: "", E: "" },
        correct: "A"
      };
      return;
    }

    if (!currentQuestion) return;

    const optMatch = line.match(/^([A-E])[\.\)]\s*(.+)/i);
    if (optMatch) {
      const key = optMatch[1].toUpperCase();
      currentQuestion.options[key] = optMatch[2];
      return;
    }

    const keyMatch = line.match(/^Kunci\s*(?:Jawaban)?\s*[:=]\s*([A-E])/i);
    if (keyMatch) {
      currentQuestion.correct = keyMatch[1].toUpperCase();
      return;
    }

    if (!currentQuestion.options.A) {
      currentQuestion.text += " " + line;
    }
  });

  if (currentQuestion && currentQuestion.text) questions.push(currentQuestion);
  return questions;
}

function handleAddQuestionManual(e) {
  if (e) e.preventDefault();
  const subjectId = currentUser.role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const activeSub = subjectsData.find(s => s.id === subjectId);

  if (!activeSub) return alert("Pilih mata pelajaran terlebih dahulu!");

  const qText = document.getElementById('qText').value.trim();
  const qOptA = document.getElementById('qOptA').value.trim();
  const qOptB = document.getElementById('qOptB').value.trim();
  const qOptC = document.getElementById('qOptC').value.trim();
  const qOptD = document.getElementById('qOptD').value.trim();
  const qOptE = document.getElementById('qOptE').value.trim();
  const qCorrect = document.getElementById('qCorrect').value;

  const newQ = {
    id: Date.now(),
    text: qText,
    options: { A: qOptA, B: qOptB, C: qOptC, D: qOptD, E: qOptE },
    correct: qCorrect
  };

  activeSub.questions.push(newQ);
  saveData();
  renderQuestionListAdmin(currentUser.role);
  document.getElementById('formQuestionManualGuru').reset();
  alert("Soal berhasil ditambahkan!");
}

/* ==========================================================================
   3. DASHBOARD SISWA & UJIAN
   ========================================================================== */
function setupStudentInstruction() {
  const select = document.getElementById('studentSubjectSelect');
  if (!select) return;
  select.innerHTML = '';

  const studentClass = currentUser.studentClass || "Kelas 7A";
  const myClassSubjects = subjectsData.filter(s => s.targetClass === studentClass || s.targetClass === "Semua Kelas");

  if (myClassSubjects.length === 0) {
    select.innerHTML = '<option value="">Tidak ada ujian untuk kelas Anda</option>';
  } else {
    myClassSubjects.forEach(sub => {
      select.innerHTML += `<option value="${sub.id}">${sub.title} (Guru: ${sub.teacherName})</option>`;
    });
    selectedStudentSubjectId = myClassSubjects[0].id;
    handleStudentSubjectChange();
  }
}

function checkScheduleValidity(sched) {
  if (!sched || sched.status === 'inactive') return { isOpen: false, reason: "Ujian Dinonaktifkan oleh Guru/Admin" };

  const now = new Date();
  const start = new Date(`${sched.startDate}T${sched.startTime}`);
  const end = new Date(`${sched.endDate}T${sched.endTime}`);

  if (now < start) {
    return { isOpen: false, reason: `Ujian Belum Dimulai (Jadwal: ${sched.startDate} Jam ${sched.startTime})` };
  } else if (now > end) {
    return { isOpen: false, reason: `Ujian Sudah Berakhir (Selesai: ${sched.endDate} Jam ${sched.endTime})` };
  }

  return { isOpen: true, reason: `Ujian Sedang Berlangsung (s.d. ${sched.endDate} ${sched.endTime})` };
}

function handleStudentSubjectChange() {
  const select = document.getElementById('studentSubjectSelect');
  if (!select) return;
  selectedStudentSubjectId = select.value;
  const activeSub = subjectsData.find(s => s.id === selectedStudentSubjectId);

  if (activeSub) {
    const elClass = document.getElementById('infoStudentClass');
    const elTeacher = document.getElementById('infoTeacherName');
    const elDuration = document.getElementById('instructionDuration');
    const elCount = document.getElementById('instructionQuestionCount');
    const elSchedStatus = document.getElementById('infoExamScheduleStatus');
    const btnStart = document.getElementById('btnStartExam');

    if (elClass) elClass.innerText = currentUser.studentClass || "Kelas 7A";
    if (elTeacher) elTeacher.innerText = activeSub.teacherName || "-";
    if (elDuration) elDuration.innerText = activeSub.duration;
    if (elCount) elCount.innerText = activeSub.questions.length;

    const schedCheck = checkScheduleValidity(activeSub.schedule);
    if (elSchedStatus) {
      elSchedStatus.innerText = schedCheck.reason;
      elSchedStatus.className = schedCheck.isOpen ? "font-bold text-emerald-600" : "font-bold text-red-600";
    }

    if (btnStart) {
      if (schedCheck.isOpen) {
        btnStart.disabled = false;
        btnStart.classList.remove('bg-slate-400', 'cursor-not-allowed');
        btnStart.classList.add('bg-blue-600', 'hover:bg-blue-700');
      } else {
        btnStart.disabled = true;
        btnStart.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        btnStart.classList.add('bg-slate-400', 'cursor-not-allowed');
      }
    }
  }
}

function startExam() {
  const activeSub = subjectsData.find(s => s.id === selectedStudentSubjectId);
  if (!activeSub || activeSub.questions.length === 0) return alert("Soal belum tersedia!");

  const schedCheck = checkScheduleValidity(activeSub.schedule);
  if (!schedCheck.isOpen) return alert(`Tidak dapat memulai ujian: ${schedCheck.reason}`);

  currentActiveExamQuestions = activeSub.questions;
  currentExamDuration = activeSub.duration;
  currentExamTitle = activeSub.title;
  currentExamTeacher = activeSub.teacherName;
  currentExamClass = currentUser.studentClass || activeSub.targetClass;

  requestFullScreen();
  studentAnswers = {};
  currentQuestionIndex = 0;
  cheatingViolations = 0;
  isExamActive = true;
  examTimeSeconds = currentExamDuration * 60;

  document.getElementById('examStudentName').innerText = currentUser.name;
  document.getElementById('examStudentClassBadge').innerText = currentExamClass;
  document.getElementById('examSubjectName').innerText = currentExamTitle;
  document.getElementById('examTeacherName').innerText = currentExamTeacher;
  
  showView('viewExamInterface');
  renderCurrentQuestion();
  renderNumberGrid();
  startTimer();
}

function requestFullScreen() {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) docEl.requestFullscreen();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    examTimeSeconds--;
    const mins = String(Math.floor(examTimeSeconds / 60)).padStart(2, '0');
    const secs = String(examTimeSeconds % 60).padStart(2, '0');
    const timerEl = document.getElementById('examTimer');
    if (timerEl) timerEl.innerText = `${mins}:${secs}`;
    if (examTimeSeconds <= 0) submitExam();
  }, 1000);
}

function renderCurrentQuestion() {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  document.getElementById('currentQuestionNum').innerText = currentQuestionIndex + 1;
  document.getElementById('examQuestionText').innerText = q.text;

  const activeAns = studentAnswers[q.id] || { answer: null, doubtful: false };
  const container = document.getElementById('examOptionsContainer');
  container.innerHTML = '';

  Object.keys(q.options).forEach(optKey => {
    const isSelected = activeAns.answer === optKey;
    container.innerHTML += `
      <div onclick="selectAnswer('${optKey}')" class="p-3 border rounded-lg cursor-pointer ${isSelected ? 'border-blue-600 bg-blue-50 font-bold' : 'border-slate-200'}">
        <strong>${optKey}.</strong> ${q.options[optKey]}
      </div>
    `;
  });
}

function selectAnswer(optKey) {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  studentAnswers[q.id] = { answer: optKey, doubtful: false };
  renderCurrentQuestion();
  renderNumberGrid();
}

function renderNumberGrid() {
  const grid = document.getElementById('numberGrid');
  if (!grid) return;
  grid.innerHTML = '';
  currentActiveExamQuestions.forEach((q, idx) => {
    const ans = studentAnswers[q.id];
    let btnClass = ans && ans.answer ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700";
    grid.innerHTML += `<button onclick="jumpToQuestion(${idx})" class="h-8 border rounded text-xs ${btnClass}">${idx + 1}</button>`;
  });
}

function jumpToQuestion(idx) { currentQuestionIndex = idx; renderCurrentQuestion(); }
function navigateQuestion(dir) { 
  currentQuestionIndex += dir; 
  if (currentQuestionIndex < 0) currentQuestionIndex = 0;
  if (currentQuestionIndex >= currentActiveExamQuestions.length) currentQuestionIndex = currentActiveExamQuestions.length - 1;
  renderCurrentQuestion(); 
}

function confirmSubmitExam() { if (confirm("Kirim jawaban sekarang?")) submitExam(); }

async function submitExam() {
  stopExam();
  let correctCount = 0;
  currentActiveExamQuestions.forEach(q => { if (studentAnswers[q.id]?.answer === q.correct) correctCount++; });

  const finalScore = Math.round((correctCount / currentActiveExamQuestions.length) * 100);
  const resultPayload = {
    student: currentUser.name, studentClass: currentExamClass,
    subject: currentExamTitle, teacherUsername: (subjectsData.find(s => s.title === currentExamTitle) || {}).teacherUsername || "-",
    teacherName: currentExamTeacher, score: finalScore, correct: correctCount,
    wrong: currentActiveExamQuestions.length - correctCount, violations: cheatingViolations, timestamp: new Date().toLocaleString("id-ID")
  };

  await saveResultToDB(resultPayload);
  document.getElementById('resScore').innerText = finalScore;
  document.getElementById('resCorrectWrong').innerText = `${correctCount} / ${currentActiveExamQuestions.length - correctCount}`;
  showView('viewStudentResult');
}

function stopExam() {
  isExamActive = false;
  clearInterval(timerInterval);
  if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/* Anti-Cheating Listeners */
function setupAntiCheatingEvents() {
  document.addEventListener('contextmenu', e => { if (isExamActive) e.preventDefault(); });
  window.addEventListener('blur', () => { if (isExamActive) handleViolation("Terdeteksi Pindah Tab!"); });
}

function handleViolation(reason) {
  cheatingViolations++;
  if (cheatingViolations >= MAX_VIOLATIONS) { alert("Batas kecurangan terlampaui! Jawaban diterima paksa."); submitExam(); }
  else { alert(`PERINGATAN (${cheatingViolations}/${MAX_VIOLATIONS}): ${reason}`); requestFullScreen(); }
}

/* User Account Management (Admin + Sight Password) */
function toggleUserRoleFields() {
  const role = document.getElementById('newRole').value;
  const teacherField = document.getElementById('fieldTeacherAssigned');
  const studentField = document.getElementById('fieldStudentClass');
  if (teacherField) teacherField.classList.toggle('hidden', role !== 'guru');
  if (studentField) studentField.classList.toggle('hidden', role !== 'siswa');
}

function handleAddUser(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('newFullName').value.trim();
  const role = document.getElementById('newRole').value;
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;

  const newUser = { id: Date.now(), name, role, username, password };
  if (role === 'guru') newUser.assignedInfo = document.getElementById('newTeacherAssignedSelect').value;
  if (role === 'siswa') newUser.studentClass = document.getElementById('newStudentClassSelect').value;

  usersList.push(newUser);
  saveUsersData();
  renderUsersTableAdmin();
  document.getElementById('formAddUser').reset();
  alert("Akun berhasil dibuat!");
}

function renderUsersTableAdmin() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  usersList.forEach((u) => {
    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 font-semibold">${u.name}</td>
        <td class="p-2.5 font-mono text-xs">${u.username}</td>
        <td class="p-2.5 font-mono text-xs">
          <div class="flex items-center space-x-2">
            <input type="password" id="pass_field_${u.id}" value="${u.password}" readonly class="bg-transparent border-0 font-mono text-xs w-24">
            <button onclick="togglePasswordVisibility(${u.id})" class="text-slate-500 hover:text-slate-700">
              <i id="pass_icon_${u.id}" class="fa-solid fa-eye"></i>
            </button>
          </div>
        </td>
        <td class="p-2.5"><span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-bold">${u.role.toUpperCase()}</span></td>
        <td class="p-2.5 text-center"><button onclick="deleteUser(${u.id})" class="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
      </tr>
    `;
  });
}

function togglePasswordVisibility(userId) {
  const inputEl = document.getElementById(`pass_field_${userId}`);
  const iconEl = document.getElementById(`pass_icon_${userId}`);
  if (inputEl && iconEl) {
    if (inputEl.type === 'password') {
      inputEl.type = 'text';
      iconEl.className = 'fa-solid fa-eye-slash text-blue-600';
    } else {
      inputEl.type = 'password';
      iconEl.className = 'fa-solid fa-eye text-slate-500';
    }
  }
}

function deleteUser(id) {
  if (confirm("Hapus akun ini secara permanen?")) {
    usersList = usersList.filter(u => u.id !== id);
    saveUsersData();
    renderUsersTableAdmin();
  }
}
