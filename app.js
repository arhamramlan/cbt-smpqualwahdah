/* ==========================================================================
   CONFIG & INITIALIZATION DATABASE
   ========================================================================== */

// OPSIONAL: Masukkan konfigurasi Firebase Anda jika ingin terkoneksi Cloud Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "123456789",
  appId: "YOUR_APP_ID"
};

let db = null;
let useFirebase = false;

// Cek apakah Firebase telah dikonfigurasi secara manual
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    useFirebase = true;
    console.log("Database: Cloud Firestore Active");
  } catch (e) {
    console.warn("Firebase config error, falling back to LocalStorage", e);
  }
}

/* ==========================================================================
   GLOBAL APP STATE
   ========================================================================== */
let currentUser = null; // { username, role }
let examSettings = {
  title: "Ujian Akhir Semester (CBT Demo)",
  duration: 30 // Menit
};

let questions = [
  {
    id: 1,
    text: "Apa nama ibu kota negara Indonesia saat ini?",
    options: { A: "Surabaya", B: "Jakarta", C: "Bandung", D: "Medan", E: "Semarang" },
    correct: "B"
  },
  {
    id: 2,
    text: "Pancasila terdiri dari berapa sila?",
    options: { A: "3", B: "4", C: "5", D: "6", E: "7" },
    correct: "C"
  }
];

let studentAnswers = {}; // { questionId: { answer: 'A', doubtful: false } }
let currentQuestionIndex = 0;
let timerInterval = null;
let examTimeSeconds = 0;

// Anti-Cheating Tracking State
let cheatingViolations = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = false;

/* ==========================================================================
   PERSISTENCE LAYER (LOCALSTORAGE / FIREBASE WRAPPER)
   ========================================================================== */
function loadData() {
  const savedConfig = localStorage.getItem("cbt_exam_config");
  if (savedConfig) examSettings = JSON.parse(savedConfig);

  const savedQuestions = localStorage.getItem("cbt_questions");
  if (savedQuestions) questions = JSON.parse(savedQuestions);
}

function saveData() {
  localStorage.setItem("cbt_exam_config", JSON.stringify(examSettings));
  localStorage.setItem("cbt_questions", JSON.stringify(questions));
}

async function saveResultToDB(resultData) {
  // Always save locally first
  let localResults = JSON.parse(localStorage.getItem("cbt_results") || "[]");
  localResults.push(resultData);
  localStorage.setItem("cbt_results", JSON.stringify(localResults));

  // If Firebase active, sync to cloud
  if (useFirebase && db) {
    try {
      await db.collection("exam_results").add(resultData);
    } catch (err) {
      console.error("Gagal simpan ke Firebase:", err);
    }
  }
}

async function getResultsFromDB() {
  if (useFirebase && db) {
    try {
      const snapshot = await db.collection("exam_results").get();
      let cloudData = [];
      snapshot.forEach(doc => cloudData.push(doc.data()));
      return cloudData;
    } catch (err) {
      console.warn("Fallback to local results");
    }
  }
  return JSON.parse(localStorage.getItem("cbt_results") || "[]");
}

/* ==========================================================================
   NAVIGATION & LOGIN LOGIC
   ========================================================================== */
window.onload = function() {
  loadData();
  setupAntiCheatingEvents();
};

function showView(viewId) {
  const views = ['viewLogin', 'viewAdmin', 'viewStudentInstruction', 'viewExamInterface', 'viewStudentResult'];
  views.forEach(v => {
    document.getElementById(v).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');
}

function handleLogin(e) {
  e.preventDefault();
  const role = document.getElementById('loginRole').value;
  const user = document.getElementById('loginUsername').value;
  const pass = document.getElementById('loginPassword').value;

  if (role === 'admin' && user === 'admin' && pass === 'adminpassword') {
    currentUser = { username: user, role: 'admin' };
    setupAdminDashboard();
    showView('viewAdmin');
  } else if (role === 'siswa' && user === 'siswa1' && pass === 'siswapassword') {
    currentUser = { username: user, role: 'siswa' };
    setupStudentInstruction();
    showView('viewStudentInstruction');
  } else {
    alert("Username atau Password salah!");
    return;
  }

  // Update Header
  document.getElementById('userInfoHeader').classList.remove('hidden');
  document.getElementById('userBadge').innerText = `${currentUser.username.toUpperCase()} (${currentUser.role})`;
}

function logout() {
  if (isExamActive) {
    if (!confirm("Ujian sedang berlangsung. Yakin ingin keluar?")) return;
  }
  stopExam();
  currentUser = null;
  document.getElementById('userInfoHeader').classList.add('hidden');
  showView('viewLogin');
}

/* ==========================================================================
   ADMIN / GURU DASHBOARD
   ========================================================================== */
function setupAdminDashboard() {
  document.getElementById('cfgExamTitle').value = examSettings.title;
  document.getElementById('cfgExamDuration').value = examSettings.duration;
  renderQuestionListAdmin();
  renderResultsTableAdmin();
}

function saveExamSettings() {
  examSettings.title = document.getElementById('cfgExamTitle').value;
  examSettings.duration = parseInt(document.getElementById('cfgExamDuration').value) || 30;
  saveData();
  alert("Pengaturan Ujian Berhasil Disimpan!");
}

function switchAdminTab(type) {
  if (type === 'manual') {
    document.getElementById('formQuestionManual').classList.remove('hidden');
    document.getElementById('formQuestionUpload').classList.add('hidden');
    document.getElementById('tabManualBtn').className = "py-2 px-4 border-b-2 border-blue-600 text-blue-600 font-bold";
    document.getElementById('tabUploadBtn').className = "py-2 px-4 text-slate-500 hover:text-blue-600";
  } else {
    document.getElementById('formQuestionManual').classList.add('hidden');
    document.getElementById('formQuestionUpload').classList.remove('hidden');
    document.getElementById('tabUploadBtn').className = "py-2 px-4 border-b-2 border-blue-600 text-blue-600 font-bold";
    document.getElementById('tabManualBtn').className = "py-2 px-4 text-slate-500 hover:text-blue-600";
  }
}

function handleAddQuestionManual(e) {
  e.preventDefault();
  const newQ = {
    id: Date.now(),
    text: document.getElementById('qText').value,
    options: {
      A: document.getElementById('qOptA').value,
      B: document.getElementById('qOptB').value,
      C: document.getElementById('qOptC').value,
      D: document.getElementById('qOptD').value,
      E: document.getElementById('qOptE').value,
    },
    correct: document.getElementById('qCorrect').value
  };

  questions.push(newQ);
  saveData();
  renderQuestionListAdmin();
  document.getElementById('formQuestionManual').reset();
}

function handleFileUpload() {
  const fileInput = document.getElementById('fileUploadInput');
  const file = fileInput.files[0];

  if (!file) {
    alert("Silakan pilih file JSON terlebih dahulu.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedQuestions = JSON.parse(e.target.result);
      if (Array.isArray(importedQuestions)) {
        questions = questions.concat(importedQuestions);
        saveData();
        renderQuestionListAdmin();
        alert(`Berhasil mengimpor ${importedQuestions.length} soal!`);
        fileInput.value = '';
      } else {
        alert("Format JSON tidak valid (harus berupa Array of Objects).");
      }
    } catch (err) {
      alert("Gagal membaca file JSON. Pastikan format valid!");
    }
  };
  reader.readAsText(file);
}

function downloadJSONTemplate() {
  const template = [
    {
      "id": 1,
      "text": "Berapakah hasil dari 10 + 15?",
      "options": { "A": "20", "B": "22", "C": "25", "D": "30", "E": "35" },
      "correct": "C"
    }
  ];
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", "template_soal_cbt.json");
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
}

function renderQuestionListAdmin() {
  const container = document.getElementById('questionsListContainer');
  document.getElementById('countQuestions').innerText = questions.length;
  container.innerHTML = '';

  questions.forEach((q, index) => {
    container.innerHTML += `
      <div class="p-3 border rounded-lg bg-slate-50 flex justify-between items-start text-sm">
        <div>
          <p class="font-semibold text-slate-800">${index + 1}. ${q.text}</p>
          <p class="text-xs text-slate-500 mt-1">Kunci Jawaban: <strong class="text-green-600">${q.correct}</strong></p>
        </div>
        <button onclick="deleteQuestion(${index})" class="text-red-500 hover:text-red-700 text-xs px-2 py-1">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  });
}

function deleteQuestion(index) {
  if (confirm("Hapus soal ini?")) {
    questions.splice(index, 1);
    saveData();
    renderQuestionListAdmin();
  }
}

function clearAllQuestions() {
  if (confirm("Hapus seluruh bank soal?")) {
    questions = [];
    saveData();
    renderQuestionListAdmin();
  }
}

async function renderResultsTableAdmin() {
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-slate-400">Memuat data...</td></tr>';
  
  const results = await getResultsFromDB();
  tbody.innerHTML = '';

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-slate-400">Belum ada data nilai.</td></tr>';
    return;
  }

  results.forEach(r => {
    const violationBadge = r.violations > 0 
      ? `<span class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded font-bold">${r.violations}x Pelanggaran</span>`
      : `<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Bersih</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-semibold">${r.student}</td>
        <td class="p-3 text-slate-500">${r.timestamp}</td>
        <td class="p-3">${r.correct} / ${r.wrong}</td>
        <td class="p-3 font-bold text-blue-600">${r.score}</td>
        <td class="p-3">${violationBadge}</td>
      </tr>
    `;
  });
}

async function exportToCSV() {
  const results = await getResultsFromDB();
  if (results.length === 0) {
    alert("Tidak ada data rekap nilai untuk di-export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Siswa,Waktu,Benar,Salah,Skor,Pelanggaran\n";
  results.forEach(r => {
    csvContent += `"${r.student}","${r.timestamp}",${r.correct},${r.wrong},${r.score},${r.violations}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `rekap_nilai_cbt_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* ==========================================================================
   SISWA - EXAM LOGIC & INTERFACE
   ========================================================================== */
function setupStudentInstruction() {
  document.getElementById('instructionExamTitle').innerText = examSettings.title;
  document.getElementById('instructionDuration').innerText = examSettings.duration;
  document.getElementById('instructionQuestionCount').innerText = questions.length;
}

function startExam() {
  if (questions.length === 0) {
    alert("Belum ada soal yang tersedia. Silakan hubungi Guru/Admin.");
    return;
  }

  // Request Fullscreen
  requestFullScreen();

  // Reset State
  studentAnswers = {};
  currentQuestionIndex = 0;
  cheatingViolations = 0;
  isExamActive = true;
  examTimeSeconds = examSettings.duration * 60;

  document.getElementById('examStudentName').innerText = currentUser.username;
  
  showView('viewExamInterface');
  renderCurrentQuestion();
  renderNumberGrid();
  startTimer();
}

function requestFullScreen() {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) docEl.requestFullscreen();
  else if (docEl.mozRequestFullScreen) docEl.mozRequestFullScreen();
  else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
  else if (docEl.msRequestFullscreen) docEl.msRequestFullscreen();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    examTimeSeconds--;

    const hours = String(Math.floor(examTimeSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((examTimeSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(examTimeSeconds % 60).padStart(2, '0');

    document.getElementById('examTimer').innerText = `${hours}:${minutes}:${seconds}`;

    if (examTimeSeconds <= 0) {
      clearInterval(timerInterval);
      alert("Waktu Habis! Jawaban akan dikirim secara otomatis.");
      submitExam();
    }
  }, 1000);
}

function renderCurrentQuestion() {
  const q = questions[currentQuestionIndex];
  document.getElementById('currentQuestionNum').innerText = currentQuestionIndex + 1;
  document.getElementById('examQuestionText').innerText = q.text;

  const activeAns = studentAnswers[q.id] || { answer: null, doubtful: false };
  document.getElementById('btnDoubtful').checked = activeAns.doubtful;

  const optionsContainer = document.getElementById('examOptionsContainer');
  optionsContainer.innerHTML = '';

  Object.keys(q.options).forEach(optKey => {
    const isSelected = activeAns.answer === optKey;
    const activeClass = isSelected ? 'border-blue-600 bg-blue-50 font-bold' : 'border-slate-200 hover:bg-slate-50';

    optionsContainer.innerHTML += `
      <div onclick="selectAnswer('${optKey}')" class="p-3 border rounded-lg cursor-pointer transition flex items-center space-x-3 ${activeClass}">
        <div class="w-7 h-7 rounded-full border flex items-center justify-center text-sm ${isSelected ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}">
          ${optKey}
        </div>
        <div class="text-slate-800 text-sm">${q.options[optKey]}</div>
      </div>
    `;
  });

  // Toggle prev/next
  document.getElementById('btnPrev').disabled = currentQuestionIndex === 0;
}

function selectAnswer(optKey) {
  const q = questions[currentQuestionIndex];
  if (!studentAnswers[q.id]) {
    studentAnswers[q.id] = { answer: optKey, doubtful: false };
  } else {
    studentAnswers[q.id].answer = optKey;
  }
  renderCurrentQuestion();
  renderNumberGrid();
}

function toggleDoubtful() {
  const q = questions[currentQuestionIndex];
  const isChecked = document.getElementById('btnDoubtful').checked;
  
  if (!studentAnswers[q.id]) {
    studentAnswers[q.id] = { answer: null, doubtful: isChecked };
  } else {
    studentAnswers[q.id].doubtful = isChecked;
  }
  renderNumberGrid();
}

function navigateQuestion(direction) {
  currentQuestionIndex += direction;
  if (currentQuestionIndex < 0) currentQuestionIndex = 0;
  if (currentQuestionIndex >= questions.length) currentQuestionIndex = questions.length - 1;
  renderCurrentQuestion();
}

function jumpToQuestion(index) {
  currentQuestionIndex = index;
  renderCurrentQuestion();
}

function renderNumberGrid() {
  const grid = document.getElementById('numberGrid');
  grid.innerHTML = '';

  questions.forEach((q, idx) => {
    const ans = studentAnswers[q.id];
    let btnClass = "bg-slate-100 border-slate-300 text-slate-700"; // default

    if (ans && ans.answer) {
      btnClass = ans.doubtful ? "bg-amber-400 text-white border-amber-500" : "bg-blue-600 text-white border-blue-600";
    } else if (ans && ans.doubtful) {
      btnClass = "bg-amber-400 text-white border-amber-500";
    }

    if (idx === currentQuestionIndex) {
      btnClass += " ring-2 ring-offset-1 ring-slate-800 font-extrabold";
    }

    grid.innerHTML += `
      <button onclick="jumpToQuestion(${idx})" class="h-9 w-full border rounded text-xs flex items-center justify-center font-semibold transition ${btnClass}">
        ${idx + 1}
      </button>
    `;
  });
}

function confirmSubmitExam() {
  if (confirm("Apakah Anda yakin ingin menyelesaikan dan mengirimkan jawaban Anda?")) {
    submitExam();
  }
}

async function submitExam() {
  stopExam();

  // Hitung Nilai
  let correctCount = 0;
  questions.forEach(q => {
    const userAns = studentAnswers[q.id]?.answer;
    if (userAns === q.correct) correctCount++;
  });

  const wrongCount = questions.length - correctCount;
  const finalScore = Math.round((correctCount / questions.length) * 100);

  const resultPayload = {
    student: currentUser.username,
    score: finalScore,
    correct: correctCount,
    wrong: wrongCount,
    violations: cheatingViolations,
    timestamp: new Date().toLocaleString("id-ID")
  };

  await saveResultToDB(resultPayload);

  // Display Hasil
  document.getElementById('resScore').innerText = finalScore;
  document.getElementById('resCorrectWrong').innerText = `${correctCount} / ${wrongCount}`;
  showView('viewStudentResult');
}

function stopExam() {
  isExamActive = false;
  clearInterval(timerInterval);
  if (document.exitFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

/* ==========================================================================
   FITUR ANTI-KECURANGAN (ANTI-CHEATING SYSTEM)
   ========================================================================== */
function setupAntiCheatingEvents() {
  // 1. Block Context Menu (Klik Kanan)
  document.addEventListener('contextmenu', e => {
    if (isExamActive) e.preventDefault();
  });

  // 2. Block Keyboard Shortcuts (Copy, Paste, DevTools)
  document.addEventListener('keydown', e => {
    if (!isExamActive) return;

    // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+C, Ctrl+V
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
      (e.ctrlKey && (e.key === 'u' || e.key === 'c' || e.key === 'v'))
    ) {
      e.preventDefault();
      handleViolation("Aksi tombol keyboard yang dilarang terdeteksi!");
    }
  });

  // 3. Tab Switching / Window Blur Detection
  window.addEventListener('blur', () => {
    if (isExamActive) {
      handleViolation("Anda terdeteksi meninggalkan tab/jendela ujian!");
    }
  });

  // 4. Fullscreen Exit Detection
  document.addEventListener('fullscreenchange', () => {
    if (isExamActive && !document.fullscreenElement) {
      handleViolation("Anda terdeteksi keluar dari mode Layar Penuh (Fullscreen)!");
    }
  });
}

function handleViolation(reason) {
  if (!isExamActive) return;

  cheatingViolations++;
  if (cheatingViolations >= MAX_VIOLATIONS) {
    alert(`DITINGKATKAN: ${reason}\n\nAnda telah melanggar batas maksimal (${MAX_VIOLATIONS}x). Jawaban Anda akan langsung DITERIMA PAKSA!`);
    submitExam();
  } else {
    alert(`PERINGATAN KECURANGAN (${cheatingViolations}/${MAX_VIOLATIONS}):\n${reason}\n\nJika melampaui ${MAX_VIOLATIONS}x peringatan, ujian akan di-submit otomatis.`);
    requestFullScreen();
  }
}