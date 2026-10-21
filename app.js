/* ==========================================================================
   CONFIG & GLOBAL DATA STRUCTURES
   ========================================================================== */
let currentUser = null; 

let subjectsData = [
  {
    id: "mapel_1",
    title: "Matematika",
    targetClass: "Kelas 7A",
    teacherUsername: "guru1",
    teacherName: "Ustadz Ahmad, S.Pd.",
    duration: 30,
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

/* ==========================================================================
   AUTHENTICATION & NAVIGATION (SWITCHING DASHBOARD)
   ========================================================================== */
function showView(viewId) {
  const views = ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudentInstruction', 'viewExamInterface', 'viewStudentResult'];
  
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) {
      el.classList.add('hidden');
    }
  });

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.remove('hidden');
  } else {
    console.error(`Elemen halaman '${viewId}' tidak ditemukan!`);
  }
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
    
    // Header Info User
    const userHeader = document.getElementById('userInfoHeader');
    const userBadge = document.getElementById('userBadge');
    if (userHeader) userHeader.classList.remove('hidden');
    if (userBadge) userBadge.innerText = `${foundUser.name} (${foundUser.role.toUpperCase()})`;

    // Navigasi Tampilan
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
   1. DASHBOARD ADMIN LOGIC
   ========================================================================== */
function setupAdminDashboard() {
  renderAdminSubjectDropdown();
  renderUsersTableAdmin();
  renderResultsTableAdmin('admin');
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

function handleAdminAddSubject() {
  const titleInput = document.getElementById('adminNewSubjectTitle');
  const classInput = document.getElementById('adminNewSubjectClass');
  const durationInput = document.getElementById('adminNewSubjectDuration');

  const title = titleInput ? titleInput.value.trim() : '';
  const targetClass = classInput ? classInput.value.trim() || "Kelas 7A" : "Kelas 7A";
  const duration = durationInput ? parseInt(durationInput.value) || 30 : 30;

  if (!title) return alert("Nama Mapel Wajib diisi!");

  const newSub = {
    id: "mapel_" + Date.now(),
    title, targetClass, duration,
    teacherUsername: "admin", teacherName: "Admin",
    questions: []
  };

  subjectsData.push(newSub);
  saveData();
  renderAdminSubjectDropdown();

  if (titleInput) titleInput.value = '';
  if (classInput) classInput.value = '';
  alert("Mapel berhasil ditambahkan!");
}

/* ==========================================================================
   2. DASHBOARD GURU LOGIC
   ========================================================================== */
function setupTeacherDashboard() {
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
    const container = document.getElementById('teacherQuestionsContainer');
    if (container) container.innerHTML = '<p class="text-xs text-slate-400">Tidak ada data.</p>';
  } else {
    mySubjects.forEach(sub => {
      select.innerHTML += `<option value="${sub.id}">${sub.title} - ${sub.targetClass}</option>`;
    });
    selectedTeacherSubjectId = mySubjects[0].id;
    renderQuestionListAdmin('teacher');
  }
}

function handleTeacherAddSubject() {
  const title = document.getElementById('teacherNewSubjectTitle').value.trim();
  const targetClass = document.getElementById('teacherNewSubjectClass').value.trim() || "Kelas 7A";
  const duration = parseInt(document.getElementById('teacherNewSubjectDuration').value) || 30;

  if (!title) return alert("Nama Mapel wajib diisi!");

  const newSub = {
    id: "mapel_" + Date.now(),
    title, targetClass, duration,
    teacherUsername: currentUser.username,
    teacherName: currentUser.name,
    questions: []
  };

  subjectsData.push(newSub);
  selectedTeacherSubjectId = newSub.id;
  saveData();
  renderTeacherSubjectDropdown();

  document.getElementById('teacherNewSubjectTitle').value = '';
  document.getElementById('teacherNewSubjectClass').value = '';
  alert(`Mapel "${title}" (${targetClass}) berhasil ditambahkan!`);
}

function handleTeacherSubjectChange() {
  const select = document.getElementById('teacherSubjectSelect');
  if (select) {
    selectedTeacherSubjectId = select.value;
    renderQuestionListAdmin('teacher');
  }
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

function renderQuestionListAdmin(role) {
  const containerId = role === 'admin' ? 'questionsListContainer' : 'teacherQuestionsContainer';
  const subjectId = role === 'admin' ? selectedAdminSubjectId : selectedTeacherSubjectId;
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const activeSub = subjectsData.find(s => s.id === subjectId);
  if (!activeSub || activeSub.questions.length === 0) { 
    container.innerHTML = '<p class="text-xs text-slate-400">Belum ada soal dalam mapel ini.</p>'; 
    return; 
  }

  container.innerHTML = '';
  activeSub.questions.forEach((q, idx) => {
    container.innerHTML += `
      <div class="p-3 border rounded-lg bg-slate-50 flex justify-between items-start text-sm">
        <div>
          <p class="font-semibold text-slate-800">${idx + 1}. ${q.text}</p>
          <p class="text-xs text-slate-500 mt-1">Kunci: <strong class="text-green-600">${q.correct}</strong></p>
        </div>
      </div>
    `;
  });
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

    if (elClass) elClass.innerText = currentUser.studentClass || "Kelas 7A";
    if (elTeacher) elTeacher.innerText = activeSub.teacherName || "-";
    if (elDuration) elDuration.innerText = activeSub.duration;
    if (elCount) elCount.innerText = activeSub.questions.length;
  }
}

function startExam() {
  const activeSub = subjectsData.find(s => s.id === selectedStudentSubjectId);
  if (!activeSub || activeSub.questions.length === 0) return alert("Soal belum tersedia!");

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

/* User Account Management (Admin) */
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
  if (role === 'guru') newUser.assignedInfo = document.getElementById('newTeacherAssigned').value.trim();
  if (role === 'siswa') newUser.studentClass = document.getElementById('newStudentClass').value.trim();

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
        <td class="p-2.5 font-mono text-xs">${u.password}</td>
        <td class="p-2.5"><span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-bold">${u.role.toUpperCase()}</span></td>
        <td class="p-2.5 text-center"><button onclick="deleteUser(${u.id})" class="text-red-500 text-xs">Hapus</button></td>
      </tr>
    `;
  });
}

function deleteUser(id) {
  usersList = usersList.filter(u => u.id !== id);
  saveUsersData();
  renderUsersTableAdmin();
}

async function renderResultsTableAdmin(role) {
  const tbodyId = role === 'admin' ? 'adminResultsTableBody' : 'teacherResultsTableBody';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  const results = await getResultsFromDB();
  let filtered = results;
  if (role === 'teacher') filtered = results.filter(r => r.teacherUsername === currentUser.username);

  tbody.innerHTML = '';
  filtered.forEach(r => {
    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 font-semibold">${r.student}</td>
        <td class="p-2.5">${r.studentClass}</td>
        <td class="p-2.5 font-bold text-blue-600">${r.subject}</td>
        <td class="p-2.5">${r.timestamp}</td>
        <td class="p-2.5">${r.correct}/${r.wrong}</td>
        <td class="p-2.5 font-bold">${r.score}</td>
        <td class="p-2.5 text-xs font-bold text-red-600">${r.violations}x Melanggar</td>
      </tr>
    `;
  });
}
