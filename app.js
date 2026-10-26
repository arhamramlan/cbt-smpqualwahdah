/* ==========================================================================
   CONFIG & INITIALIZATION (SUPABASE INTEGRATION)
   ========================================================================== */
// Ganti dengan URL dan ANON KEY dari Dashboard Supabase Anda// ✅ BENAR
const SUPABASE_URL = "https://wwizvphxjieoorngoszd.supabase.co"; // Ganti dengan URL Supabase Anda
const SUPABASE_KEY = "sb_publishable_i6fQkGiYivOH65lWNqMbvw_tlW08UE_";  // Ganti dengan ANON KEY Supabase Anda

let supabaseClient = null; // Gunakan nama variabel yang berbeda agar tidak bentrok

if (typeof window.supabase !== 'undefined' && SUPABASE_URL.includes("supabase.co")) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let currentUser = null; 
let currentActiveExamQuestions = [];
let currentExamDuration = 30;
let currentExamTitle = "";
let currentExamTeacher = "";
let currentExamClass = "";

let studentAnswers = {}; 
let doubtfulAnswers = {}; // Fitur baru: Penanda Ragu-ragu
let currentQuestionIndex = 0;
let timerInterval = null;
let examTimeSeconds = 0;
let cheatingViolations = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = false;

window.addEventListener('DOMContentLoaded', () => {
  setupAntiCheatingEvents();
});

/* Helper SweetAlert menggantikan alert & confirm bawaan */
function notify(title, text, icon = 'info') {
  Swal.fire({ title, text, icon, confirmColor: '#1d4ed8' });
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

  // Jika Supabase terhubung, cek ke database cloud
  if (supabaseClient) {
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
  }

  // Fallback ke LocalStorage jika Supabase tidak digunakan / offline
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
   DASHBOARD SISWA & LOGIKA UJIAN TERACAK (RANDOMIZE)
   ========================================================================== */
async function setupStudentInstruction() {
  const select = document.getElementById('studentSubjectSelect');
  if (!select) return;
  select.innerHTML = '';

  const studentClass = currentUser.student_class || "Kelas 7A";
  
  const { data: exams } = await supabase
    .from('exams')
    .select('*')
    .or(`target_class.eq.${studentClass},target_class.eq.Semua Kelas`);

  if (!exams || exams.length === 0) {
    select.innerHTML = '<option value="">Tidak ada ujian untuk kelas Anda</option>';
  } else {
    exams.forEach(sub => {
      select.innerHTML += `<option value="${sub.id}">${sub.title} (Guru: ${sub.teacher_name})</option>`;
    });
    handleStudentSubjectChange();
  }
}

async function handleStudentSubjectChange() {
  const subjectId = document.getElementById('studentSubjectSelect').value;
  if (!subjectId) return;

  const { data: exam } = await supabase.from('exams').select('*').eq('id', subjectId).single();
  const { data: qData } = await supabase.from('questions').select('id').eq('exam_id', subjectId);

  if (exam) {
    document.getElementById('infoStudentClass').innerText = currentUser.student_class || "Kelas 7A";
    document.getElementById('infoTeacherName').innerText = exam.teacher_name || "-";
    document.getElementById('instructionDuration').innerText = exam.duration;
    document.getElementById('instructionQuestionCount').innerText = qData ? qData.length : 0;
  }
}

async function startExam() {
  const subjectId = document.getElementById('studentSubjectSelect').value;
  const { data: exam } = await supabase.from('exams').select('*').eq('id', subjectId).single();
  let { data: questions } = await supabase.from('questions').select('*').eq('exam_id', subjectId);

  if (!questions || questions.length === 0) return notify("Perhatian", "Soal belum tersedia!", "warning");

  // AKSI PREMIUN: Acak Soal (Fisher-Yates Shuffle)
  questions = questions.sort(() => Math.random() - 0.5);

  currentActiveExamQuestions = questions;
  currentExamDuration = exam.duration;
  currentExamTitle = exam.title;
  currentExamTeacher = exam.teacher_name;
  currentExamClass = currentUser.student_class || exam.target_class;

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
  const qType = q.type || 'pg';

  document.getElementById('currentQuestionNum').innerText = currentQuestionIndex + 1;
  document.getElementById('examQuestionText').innerText = q.text;

  // Gambar Soal
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
    Object.keys(q.options).forEach(optKey => {
      if (!q.options[optKey]) return;
      const isChecked = selectedArray.includes(optKey);
      container.innerHTML += `
        <div onclick="toggleMultiAnswer('${optKey}')" class="p-3 border rounded-lg cursor-pointer flex items-center space-x-3 ${isChecked ? 'border-purple-600 bg-purple-50 font-bold' : 'border-slate-200'}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-purple-600 pointer-events-none">
          <span><strong>${optKey}.</strong> ${q.options[optKey]}</span>
        </div>`;
    });
  } else {
    Object.keys(q.options).forEach(optKey => {
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

// FITUR BARU: Tandai Ragu-Ragu
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
      btnClass = "bg-amber-500 text-white font-bold"; // Warna Kuning jika Ragu
    } else if (hasAnswered) {
      btnClass = "bg-blue-600 text-white"; // Warna Biru jika Terjawab
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

  // Simpan ke Supabase Cloud
  await supabase.from('exam_results').insert([{
    student_name: currentUser.name,
    student_class: currentExamClass,
    subject: currentExamTitle,
    teacher_name: currentExamTeacher,
    score: finalScore,
    correct_count: correctCount,
    wrong_count: currentActiveExamQuestions.length - correctCount,
    violations: cheatingViolations
  }]);

  document.getElementById('resScore').innerText = finalScore;
  document.getElementById('resCorrectWrong').innerText = `${correctCount} / ${currentActiveExamQuestions.length - correctCount}`;
  showView('viewStudentResult');
}

/* Timer & Proteksi Keamanan */
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    examTimeSeconds--;
    const mins = String(Math.floor(examTimeSeconds / 60)).padStart(2, '0');
    const secs = String(examTimeSeconds % 60).padStart(2, '0');
    document.getElementById('examTimer').innerText = `${mins}:${secs}`;
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
