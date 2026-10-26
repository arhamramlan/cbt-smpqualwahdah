/* ==========================================================================
   CONFIG & INITIALIZATION (SUPABASE INTEGRATION + LOCALSTORAGE FALLBACK)
   ========================================================================== */
const SUPABASE_URL = "https://wwizvphxjieoorngoszd.supabase.co";
const SUPABASE_KEY = "sb_publishable_i6fQkGiYivOH65lWNqMbvw_tlW08UE_";

let supabaseClient = null;

// Inisialisasi Supabase secara aman
try {
  if (typeof window.supabase !== 'undefined' && SUPABASE_URL.includes("supabase.co") && !SUPABASE_KEY.startsWith("sb_publishable_")) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
} catch (e) {
  console.warn("Inisialisasi Supabase gagal, menggunakan mode LocalStorage fallback.", e);
}

let currentUser = null; 
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
    questions: [
      { id: 101, type: "pg", text: "Berapakah hasil dari 12 x 12?", image: "", options: { A: "124", B: "144", C: "164", D: "184", E: "200" }, correct: "B" },
      { id: 102, type: "majemuk", text: "Manakah di bawah ini yang merupakan bilangan genap?", image: "", options: { A: "2", B: "3", C: "4", D: "5", E: "6" }, correct: ["A", "C", "E"] },
      { id: 103, type: "bs", text: "Apakah 15 merupakan bilangan prima?", image: "", options: { A: "Benar", B: "Salah" }, correct: "B" }
    ]
  }
];

let defaultUsers = [
  { id: 1, name: "Administrator Utama", username: "admin", password: "adminpassword", role: "admin" },
  { id: 2, name: "Ustadz Ahmad, S.Pd.", username: "guru1", password: "gurupassword", role: "guru", assignedInfo: "Matematika" },
  { id: 3, name: "Muhammad Ali", username: "siswa1", password: "siswapassword", role: "siswa", studentClass: "Kelas 7A" }
];

let usersList = [...defaultUsers];

let selectedTeacherSubjectId = "";
let currentActiveExamQuestions = [];
let currentExamDuration = 30;
let currentExamTitle = "";
let currentExamTeacher = "";
let currentExamClass = "";

let studentAnswers = {}; 
let doubtfulAnswers = {};
let currentQuestionIndex = 0;
let timerInterval = null;
let examTimeSeconds = 0;
let cheatingViolations = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = false;

window.addEventListener('DOMContentLoaded', () => {
  loadLocalData();
  setupAntiCheatingEvents();
});

function loadLocalData() {
  const savedUsers = localStorage.getItem("cbt_users");
  if (savedUsers) {
    try { usersList = JSON.parse(savedUsers); } catch(e) {}
  } else {
    localStorage.setItem("cbt_users", JSON.stringify(usersList));
  }

  const savedSubjects = localStorage.getItem("cbt_subjects_data");
  if (savedSubjects) {
    try { subjectsData = JSON.parse(savedSubjects); } catch(e) {}
  } else {
    localStorage.setItem("cbt_subjects_data", JSON.stringify(subjectsData));
  }
}

function saveData() {
  localStorage.setItem("cbt_subjects_data", JSON.stringify(subjectsData));
  localStorage.setItem("cbt_users", JSON.stringify(usersList));
}

function notify(title, text, icon = 'info') {
  if (typeof Swal !== 'undefined') {
    Swal.fire({ title, text, icon, confirmColor: '#1d4ed8' });
  } else {
    alert(`${title}: ${text}`);
  }
}

/* ==========================================================================
   AUTHENTICATION
   ========================================================================== */
async function handleLogin(e) {
  if (e) e.preventDefault();
  
  const role = document.getElementById('loginRole').value;
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value.trim();

  let foundUser = null;

  // 1. Coba Authentikasi via Supabase Cloud jika terhubung
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .eq('role', role)
        .maybeSingle();

      if (!error && data) {
        foundUser = data;
      }
    } catch (err) {
      console.warn("Supabase login error, switching to LocalStorage fallback.", err);
    }
  }

  // 2. Fallback ke LocalStorage jika Supabase gagal/offline
  if (!foundUser) {
    foundUser = usersList.find(u => 
      u.username.toLowerCase() === username && 
      u.password === password && 
      u.role.toLowerCase() === role
    );
  }

  if (!foundUser) {
    return notify("Gagal Masuk", "Username, Password, atau Peran tidak cocok!", "error");
  }

  currentUser = foundUser;
  document.getElementById('userInfoHeader').classList.remove('hidden');
  document.getElementById('userBadge').innerText = `${foundUser.name} (${foundUser.role.toUpperCase()})`;

  if (role === 'admin') {
    setupAdminDashboard();
    showView('viewAdmin');
  } else if (role === 'guru') {
    setupTeacherDashboard();
    showView('viewTeacher');
  } else {
    setupStudentInstruction();
    showView('viewStudentInstruction');
  }
}

function logout() {
  if (isExamActive) {
    Swal.fire({
      title: 'Ujian Sedang Berlangsung!',
      text: 'Yakin ingin keluar dan menghentikan ujian?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Ya, Keluar',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) performLogout();
    });
  } else {
    performLogout();
  }
}

function performLogout() {
  stopExam();
  currentUser = null;
  document.getElementById('userInfoHeader').classList.add('hidden');
  showView('viewLogin');
}

function showView(viewId) {
  const views = ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudentInstruction', 'viewExamInterface', 'viewStudentResult'];
  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  if (target) target.classList.remove('hidden');
}

/* ==========================================================================
   DASHBOARD SISWA & LOGIKA UJIAN
   ========================================================================== */
async function setupStudentInstruction() {
  const select = document.getElementById('studentSubjectSelect');
  if (!select) return;
  select.innerHTML = '';

  const studentClass = currentUser.studentClass || currentUser.student_class || "Kelas 7A";
  let mySubjects = [];

  if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from('exams')
        .select('*')
        .or(`target_class.eq.${studentClass},target_class.eq.Semua Kelas`);
      if (data && data.length > 0) mySubjects = data;
    } catch(e) {}
  }

  if (mySubjects.length === 0) {
    mySubjects = subjectsData.filter(s => s.targetClass === studentClass || s.targetClass === "Semua Kelas");
  }

  if (mySubjects.length === 0) {
    select.innerHTML = '<option value="">Tidak ada ujian untuk kelas Anda</option>';
  } else {
    select.innerHTML = mySubjects.map(sub => `<option value="${sub.id}">${sub.title} (Guru: ${sub.teacherName || sub.teacher_name || '-'})</option>`).join('');
    handleStudentSubjectChange();
  }
}

async function handleStudentSubjectChange() {
  const subjectId = document.getElementById('studentSubjectSelect').value;
  if (!subjectId) return;

  let activeSub = subjectsData.find(s => s.id === subjectId);

  if (!activeSub && supabaseClient) {
    const { data } = await supabaseClient.from('exams').select('*').eq('id', subjectId).single();
    if (data) activeSub = data;
  }

  if (activeSub) {
    document.getElementById('infoStudentClass').innerText = currentUser.studentClass || currentUser.student_class || "Kelas 7A";
    document.getElementById('infoTeacherName').innerText = activeSub.teacherName || activeSub.teacher_name || "-";
    document.getElementById('instructionDuration').innerText = activeSub.duration || 30;
    document.getElementById('instructionQuestionCount').innerText = activeSub.questions ? activeSub.questions.length : 0;
  }
}

async function startExam() {
  const subjectId = document.getElementById('studentSubjectSelect').value;
  let activeSub = subjectsData.find(s => s.id === subjectId);
  let questions = activeSub ? activeSub.questions : [];

  if (questions.length === 0 && supabaseClient) {
    const { data } = await supabaseClient.from('questions').select('*').eq('exam_id', subjectId);
    if (data) questions = data;
  }

  if (!questions || questions.length === 0) return notify("Perhatian", "Soal belum tersedia untuk ujian ini!", "warning");

  // Acak Urutan Soal (Shuffle)
  currentActiveExamQuestions = [...questions].sort(() => Math.random() - 0.5);
  currentExamDuration = activeSub ? activeSub.duration : 30;
  currentExamTitle = activeSub ? activeSub.title : "Ujian";
  currentExamTeacher = activeSub ? (activeSub.teacherName || activeSub.teacher_name) : "-";
  currentExamClass = currentUser.studentClass || currentUser.student_class || "Kelas 7A";

  requestFullScreen();
  studentAnswers = {};
  doubtfulAnswers = {};
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

function renderCurrentQuestion() {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  if (!q) return;
  const qType = q.type || 'pg';

  document.getElementById('currentQuestionNum').innerText = currentQuestionIndex + 1;
  document.getElementById('examQuestionText').innerText = q.text;

  const imgContainer = document.getElementById('examQuestionImageContainer');
  const imgEl = document.getElementById('examQuestionImage');
  if (q.image) {
    if (imgEl) imgEl.src = q.image;
    if (imgContainer) imgContainer.classList.remove('hidden');
  } else {
    if (imgContainer) imgContainer.classList.add('hidden');
  }

  const container = document.getElementById('examOptionsContainer');
  container.innerHTML = '';
  const activeAns = studentAnswers[q.id]?.answer;

  if (qType === 'majemuk') {
    const selectedArray = Array.isArray(activeAns) ? activeAns : [];
    Object.keys(q.options || {}).forEach(optKey => {
      if (!q.options[optKey]) return;
      const isChecked = selectedArray.includes(optKey);
      container.innerHTML += `
        <div onclick="toggleMultiAnswer('${optKey}')" class="p-3 border rounded-lg cursor-pointer flex items-center space-x-3 ${isChecked ? 'border-purple-600 bg-purple-50 font-bold' : 'border-slate-200'}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-purple-600 pointer-events-none">
          <span><strong>${optKey}.</strong> ${q.options[optKey]}</span>
        </div>`;
    });
  } else {
    Object.keys(q.options || {}).forEach(optKey => {
      if (!q.options[optKey]) return;
      const isSelected = activeAns === optKey;
      container.innerHTML += `
        <div onclick="selectSingleAnswer('${optKey}')" class="p-3 border rounded-lg cursor-pointer flex items-center space-x-3 ${isSelected ? 'border-blue-600 bg-blue-50 font-bold' : 'border-slate-200'}">
          <input type="radio" ${isSelected ? 'checked' : ''} class="w-4 h-4 text-blue-600 pointer-events-none">
          <span><strong>${optKey}.</strong> ${q.options[optKey]}</span>
        </div>`;
    });
  }
}

function selectSingleAnswer(optKey) {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  studentAnswers[q.id] = { answer: optKey };
  renderCurrentQuestion();
  renderNumberGrid();
}

function toggleMultiAnswer(optKey) {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  let currentAns = studentAnswers[q.id]?.answer || [];
  if (!Array.isArray(currentAns)) currentAns = [];

  if (currentAns.includes(optKey)) {
    currentAns = currentAns.filter(item => item !== optKey);
  } else {
    currentAns.push(optKey);
  }

  studentAnswers[q.id] = { answer: currentAns };
  renderCurrentQuestion();
  renderNumberGrid();
}

function toggleDoubtAnswer() {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  doubtfulAnswers[q.id] = !doubtfulAnswers[q.id];
  renderNumberGrid();
}

function renderNumberGrid() {
  const grid = document.getElementById('numberGrid');
  if (!grid) return;
  grid.innerHTML = '';

  currentActiveExamQuestions.forEach((q, idx) => {
    const ans = studentAnswers[q.id]?.answer;
    const isDoubt = doubtfulAnswers[q.id];
    let hasAnswered = Array.isArray(ans) ? ans.length > 0 : !!ans;

    let btnClass = "bg-slate-100 text-slate-700";
    if (isDoubt) {
      btnClass = "bg-amber-500 text-white font-bold";
    } else if (hasAnswered) {
      btnClass = "bg-blue-600 text-white";
    }

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

function confirmSubmitExam() {
  Swal.fire({
    title: 'Kirim Jawaban Sekarang?',
    text: "Pastikan seluruh soal telah diperiksa kembali.",
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya, Selesai',
    cancelButtonText: 'Cek Lagi'
  }).then((result) => {
    if (result.isConfirmed) submitExam();
  });
}

async function submitExam() {
  stopExam();
  let correctCount = 0;

  currentActiveExamQuestions.forEach(q => {
    const userAns = studentAnswers[q.id]?.answer;
    if (q.type === 'majemuk') {
      const correctArr = Array.isArray(q.correct) ? q.correct : [q.correct];
      const userArr = Array.isArray(userAns) ? userAns : [];
      if (correctArr.length === userArr.length && correctArr.every(v => userArr.includes(v))) correctCount++;
    } else {
      if (userAns === q.correct) correctCount++;
    }
  });

  const finalScore = Math.round((correctCount / currentActiveExamQuestions.length) * 100);

  // Simpan ke LocalStorage
  let results = JSON.parse(localStorage.getItem("cbt_results") || "[]");
  results.push({
    student: currentUser.name,
    studentClass: currentExamClass,
    subject: currentExamTitle,
    teacherName: currentExamTeacher,
    score: finalScore,
    correct: correctCount,
    wrong: currentActiveExamQuestions.length - correctCount,
    violations: cheatingViolations,
    timestamp: new Date().toLocaleString("id-ID")
  });
  localStorage.setItem("cbt_results", JSON.stringify(results));

  // Simpan ke Supabase jika terhubung
  if (supabaseClient) {
    try {
      await supabaseClient.from('exam_results').insert([{
        student_name: currentUser.name,
        student_class: currentExamClass,
        subject: currentExamTitle,
        teacher_name: currentExamTeacher,
        score: finalScore,
        correct_count: correctCount,
        wrong_count: currentActiveExamQuestions.length - correctCount,
        violations: cheatingViolations
      }]);
    } catch(e) {}
  }

  document.getElementById('resScore').innerText = finalScore;
  document.getElementById('resCorrectWrong').innerText = `${correctCount} / ${currentActiveExamQuestions.length - correctCount}`;
  showView('viewStudentResult');
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    examTimeSeconds--;
    const mins = String(Math.floor(examTimeSeconds / 60)).padStart(2, '0');
    const secs = String(examTimeSeconds % 60).padStart(2, '0');
    const el = document.getElementById('examTimer');
    if (el) el.innerText = `${mins}:${secs}`;
    if (examTimeSeconds <= 0) submitExam();
  }, 1000);
}

function stopExam() {
  isExamActive = false;
  clearInterval(timerInterval);
  if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function requestFullScreen() {
  const doc = document.documentElement;
  if (doc.requestFullscreen) doc.requestFullscreen();
}

function setupAntiCheatingEvents() {
  document.addEventListener('contextmenu', e => { if (isExamActive) e.preventDefault(); });
  window.addEventListener('blur', () => {
    if (isExamActive) {
      cheatingViolations++;
      if (cheatingViolations >= MAX_VIOLATIONS) {
        notify("Batas Terlampaui", "Kecurangan terdeteksi! Jawaban dikirim otomatis.", "error");
        submitExam();
      } else {
        notify("Peringatan Kecurangan", `Dilarang pindah tab! (${cheatingViolations}/${MAX_VIOLATIONS})`, "warning");
        requestFullScreen();
      }
    }
  });
}

/* ADMIN & GURU DASHBOARD SETUP */
function setupAdminDashboard() {
  renderUsersTableAdmin();
}

function setupTeacherDashboard() {
  const titleSelect = document.getElementById('teacherNewSubjectTitleSelect');
  const classSelect = document.getElementById('teacherNewSubjectClassSelect');
  if (titleSelect) titleSelect.innerHTML = masterSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
  if (classSelect) classSelect.innerHTML = masterClasses.map(c => `<option value="${c}">${c}</option>`).join('');
  renderTeacherSubjectDropdown();
}

function renderTeacherSubjectDropdown() {
  const select = document.getElementById('teacherSubjectSelect');
  if (!select) return;
  const mySubjects = subjectsData.filter(s => s.teacherUsername === currentUser.username);
  if (mySubjects.length === 0) {
    select.innerHTML = '<option value="">Belum mengampu mata pelajaran</option>';
  } else {
    select.innerHTML = mySubjects.map(s => `<option value="${s.id}">${s.title} - ${s.targetClass}</option>`).join('');
    selectedTeacherSubjectId = mySubjects[0].id;
  }
}

function renderUsersTableAdmin() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = usersList.map(u => `
    <tr class="hover:bg-slate-50">
      <td class="p-2.5 font-semibold">${u.name}</td>
      <td class="p-2.5 font-mono text-xs">${u.username}</td>
      <td class="p-2.5 font-mono text-xs">••••••••</td>
      <td class="p-2.5"><span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-bold">${u.role.toUpperCase()}</span></td>
      <td class="p-2.5 text-center"><button onclick="deleteUser(${u.id})" class="text-red-500 text-xs font-bold hover:underline">Hapus</button></td>
    </tr>
  `).join('');
}

function deleteUser(id) {
  usersList = usersList.filter(u => u.id !== id);
  saveData();
  renderUsersTableAdmin();
}
