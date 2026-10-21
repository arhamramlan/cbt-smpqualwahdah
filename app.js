/* ==========================================================================
   CONFIG & INITIALIZATION DATABASE
   ========================================================================== */
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

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    useFirebase = true;
  } catch (e) {
    console.warn("Firebase fallback to LocalStorage", e);
  }
}

/* ==========================================================================
   GLOBAL STATE & DATA STRUCTURES
   ========================================================================== */
let currentUser = null; 

let subjectsData = [
  {
    id: "mapel_1",
    title: "Matematika",
    duration: 30,
    questions: [
      {
        id: 101,
        text: "Berapakah hasil dari 12 x 12?",
        options: { A: "124", B: "144", C: "164", D: "184", E: "200" },
        correct: "B"
      }
    ]
  },
  {
    id: "mapel_2",
    title: "PAI / Al-Qur'an Hadits",
    duration: 45,
    questions: [
      {
        id: 201,
        text: "Surah pertama yang diturunkan kepada Nabi Muhammad SAW adalah...",
        options: { A: "Al-Fatihah", B: "Al-Ikhlas", C: "Al-'Alaq 1-5", D: "Al-Baqarah", E: "An-Nas" },
        correct: "C"
      }
    ]
  }
];

let defaultUsers = [
  { id: 1, name: "Administrator", username: "admin", password: "adminpassword", role: "admin" },
  { id: 2, name: "Siswa 1", username: "siswa1", password: "siswapassword", role: "siswa" }
];
let usersList = [];

let selectedAdminSubjectId = "";
let selectedStudentSubjectId = "";

let currentActiveExamQuestions = [];
let currentExamDuration = 30;
let currentExamTitle = "";

let studentAnswers = {}; 
let currentQuestionIndex = 0;
let timerInterval = null;
let examTimeSeconds = 0;

let cheatingViolations = 0;
const MAX_VIOLATIONS = 3;
let isExamActive = false;

/* ==========================================================================
   PERSISTENCE LAYER
   ========================================================================== */
function loadData() {
  const savedSubjects = localStorage.getItem("cbt_subjects_data");
  if (savedSubjects) {
    subjectsData = JSON.parse(savedSubjects);
  } else {
    saveData();
  }

  if (subjectsData.length > 0) {
    selectedAdminSubjectId = subjectsData[0].id;
    selectedStudentSubjectId = subjectsData[0].id;
  }

  loadUsersData();
}

function saveData() {
  localStorage.setItem("cbt_subjects_data", JSON.stringify(subjectsData));
}

function loadUsersData() {
  const savedUsers = localStorage.getItem("cbt_users");
  if (savedUsers) {
    usersList = JSON.parse(savedUsers);
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
    } catch (err) {}
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
  views.forEach(v => document.getElementById(v).classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

function handleLogin(e) {
  e.preventDefault();
  const role = document.getElementById('loginRole').value;
  const user = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value;

  loadUsersData();
  const foundUser = usersList.find(u => u.username === user && u.password === pass && u.role === role);

  if (foundUser) {
    currentUser = { username: foundUser.username, name: foundUser.name, role: foundUser.role };
    
    if (foundUser.role === 'admin') {
      setupAdminDashboard();
      showView('viewAdmin');
    } else {
      setupStudentInstruction();
      showView('viewStudentInstruction');
    }

    document.getElementById('userInfoHeader').classList.remove('hidden');
    document.getElementById('userBadge').innerText = `${foundUser.name} (${foundUser.role.toUpperCase()})`;
  } else {
    alert("Username, Password, atau Peran yang dipilih tidak cocok!");
  }
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
   ADMIN DASHBOARD LOGIC
   ========================================================================== */
function setupAdminDashboard() {
  renderSubjectDropdowns();
  renderQuestionListAdmin();
  renderUsersTableAdmin();
  populateAdminProfileForm();
  renderResultsTableAdmin();
}

function handleAddSubject() {
  const title = document.getElementById('newSubjectTitle').value.trim();
  const duration = parseInt(document.getElementById('newSubjectDuration').value) || 30;

  if (!title) {
    alert("Nama Mata Pelajaran wajib diisi!");
    return;
  }

  const newSubject = {
    id: "mapel_" + Date.now(),
    title: title,
    duration: duration,
    questions: []
  };

  subjectsData.push(newSubject);
  selectedAdminSubjectId = newSubject.id;
  saveData();

  document.getElementById('newSubjectTitle').value = '';
  renderSubjectDropdowns();
  renderQuestionListAdmin();
  alert(`Mata pelajaran "${title}" berhasil ditambahkan!`);
}

function renderSubjectDropdowns() {
  const adminSelect = document.getElementById('adminSubjectSelect');
  const studentSelect = document.getElementById('studentSubjectSelect');

  if (adminSelect) {
    adminSelect.innerHTML = '';
    subjectsData.forEach(sub => {
      adminSelect.innerHTML += `<option value="${sub.id}" ${sub.id === selectedAdminSubjectId ? 'selected' : ''}>${sub.title} (${sub.duration} Menit)</option>`;
    });
  }

  if (studentSelect) {
    studentSelect.innerHTML = '';
    subjectsData.forEach(sub => {
      studentSelect.innerHTML += `<option value="${sub.id}" ${sub.id === selectedStudentSubjectId ? 'selected' : ''}>${sub.title} (${sub.duration} Menit)</option>`;
    });
  }
}

function handleAdminSubjectChange() {
  selectedAdminSubjectId = document.getElementById('adminSubjectSelect').value;
  renderQuestionListAdmin();
}

function getActiveAdminSubject() {
  return subjectsData.find(s => s.id === selectedAdminSubjectId);
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
  const activeSub = getActiveAdminSubject();
  
  if (!activeSub) {
    alert("Buat atau pilih Mata Pelajaran terlebih dahulu!");
    return;
  }

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

  activeSub.questions.push(newQ);
  saveData();
  renderQuestionListAdmin();
  document.getElementById('formQuestionManual').reset();
}

function handleFileUpload() {
  const activeSub = getActiveAdminSubject();
  if (!activeSub) {
    alert("Buat atau pilih Mata Pelajaran terlebih dahulu!");
    return;
  }

  const fileInput = document.getElementById('fileUploadInput');
  const file = fileInput.files[0];

  if (!file) {
    alert("Silakan pilih file (.json atau .docx) terlebih dahulu.");
    return;
  }

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedQuestions = JSON.parse(e.target.result);
        if (Array.isArray(importedQuestions)) {
          activeSub.questions = activeSub.questions.concat(importedQuestions);
          saveData();
          renderQuestionListAdmin();
          alert(`Berhasil mengimpor ${importedQuestions.length} soal ke mapel ${activeSub.title}!`);
          fileInput.value = '';
        } else {
          alert("Format JSON tidak valid.");
        }
      } catch (err) {
        alert("Gagal membaca file JSON!");
      }
    };
    reader.readAsText(file);
  } else if (fileName.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(function(result) {
          const parsedQuestions = parseWordTextToQuestions(result.value);
          if (parsedQuestions.length > 0) {
            activeSub.questions = activeSub.questions.concat(parsedQuestions);
            saveData();
            renderQuestionListAdmin();
            alert(`Berhasil mengimpor ${parsedQuestions.length} soal dari Word ke mapel ${activeSub.title}!`);
            fileInput.value = '';
          } else {
            alert("Tidak ada soal yang dibaca. Pastikan penulisan sesuai format!");
          }
        })
        .catch(() => alert("Gagal memproses file Word."));
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert("Format file harus .json atau .docx");
  }
}

function parseWordTextToQuestions(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const parsed = [];
  let currentQ = null;

  lines.forEach(line => {
    if (/^\d+[\.\)]/.test(line)) {
      if (currentQ && currentQ.text && currentQ.correct) parsed.push(currentQ);
      currentQ = {
        id: Date.now() + Math.random(),
        text: line.replace(/^\d+[\.\)]\s*/, ''),
        options: {},
        correct: 'A'
      };
    } else if (/^[A-E][\.\)]/i.test(line) && currentQ) {
      const key = line.charAt(0).toUpperCase();
      currentQ.options[key] = line.replace(/^[A-E][\.\)]\s*/i, '');
    } else if (/^(Kunci|Jawaban)\s*:\s*([A-E])/i.test(line) && currentQ) {
      const match = line.match(/^(Kunci|Jawaban)\s*:\s*([A-E])/i);
      if (match) currentQ.correct = match[2].toUpperCase();
    }
  });

  if (currentQ && currentQ.text && currentQ.correct) parsed.push(currentQ);
  return parsed;
}

function downloadJSONTemplate() {
  const template = [{
    "id": 1,
    "text": "Berapakah hasil dari 10 + 15?",
    "options": { "A": "20", "B": "22", "C": "25", "D": "30", "E": "35" },
    "correct": "C"
  }];
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
  const activeSub = getActiveAdminSubject();

  if (!activeSub) {
    container.innerHTML = '<p class="text-xs text-slate-400">Belum ada mata pelajaran dipilih.</p>';
    document.getElementById('countQuestions').innerText = '0';
    return;
  }

  document.getElementById('countQuestions').innerText = activeSub.questions.length;
  container.innerHTML = '';

  activeSub.questions.forEach((q, index) => {
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
  const activeSub = getActiveAdminSubject();
  if (activeSub && confirm("Hapus soal ini?")) {
    activeSub.questions.splice(index, 1);
    saveData();
    renderQuestionListAdmin();
  }
}

function clearAllQuestions() {
  const activeSub = getActiveAdminSubject();
  if (activeSub && confirm(`Hapus seluruh soal di mapel ${activeSub.title}?`)) {
    activeSub.questions = [];
    saveData();
    renderQuestionListAdmin();
  }
}

/* ==========================================================================
   MANAJEMEN AKUN & ADMIN PROFILE
   ========================================================================== */
function handleAddUser(e) {
  e.preventDefault();
  const name = document.getElementById('newFullName').value.trim();
  const role = document.getElementById('newRole').value;
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;

  if (usersList.some(u => u.username === username)) {
    alert("Username telah digunakan!");
    return;
  }

  usersList.push({ id: Date.now(), name, role, username, password });
  saveUsersData();
  renderUsersTableAdmin();
  document.getElementById('formAddUser').reset();
  alert(`Akun ${role.toUpperCase()} "${name}" berhasil ditambahkan!`);
}

function renderUsersTableAdmin() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  usersList.forEach((u) => {
    const roleBadge = u.role === 'admin' 
      ? `<span class="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-bold">Admin/Guru</span>`
      : `<span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded font-bold">Siswa</span>`;

    const deleteBtn = (u.username === 'admin')
      ? `<span class="text-xs text-slate-400 italic">Utama</span>`
      : `<button onclick="deleteUser(${u.id})" class="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1"><i class="fa-solid fa-trash mr-1"></i>Hapus</button>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 font-semibold text-slate-800">${u.name}</td>
        <td class="p-2.5 text-slate-600 font-mono text-xs">${u.username}</td>
        <td class="p-2.5">${roleBadge}</td>
        <td class="p-2.5 text-center">${deleteBtn}</td>
      </tr>
    `;
  });
}

function deleteUser(userId) {
  if (confirm("Apakah Anda yakin ingin menghapus akun ini?")) {
    usersList = usersList.filter(u => u.id !== userId);
    saveUsersData();
    renderUsersTableAdmin();
  }
}

function populateAdminProfileForm() {
  if (currentUser && currentUser.role === 'admin') {
    document.getElementById('adminNewUsername').value = currentUser.username;
    document.getElementById('adminNewPassword').value = '';
    document.getElementById('adminConfirmPassword').value = '';
  }
}

function handleUpdateAdminProfile(e) {
  e.preventDefault();
  const newUsername = document.getElementById('adminNewUsername').value.trim();
  const newPassword = document.getElementById('adminNewPassword').value;
  const confirmPassword = document.getElementById('adminConfirmPassword').value;

  if (newPassword !== confirmPassword) {
    alert("Konfirmasi password tidak cocok!");
    return;
  }

  loadUsersData();
  const isUsernameTaken = usersList.some(u => u.username === newUsername && u.username !== currentUser.username);
  if (isUsernameTaken) {
    alert("Username tersebut sudah digunakan oleh akun lain!");
    return;
  }

  const adminIndex = usersList.findIndex(u => u.username === currentUser.username && u.role === 'admin');
  if (adminIndex !== -1) {
    usersList[adminIndex].username = newUsername;
    usersList[adminIndex].password = newPassword;
    currentUser.username = newUsername;

    saveUsersData();
    document.getElementById('userBadge').innerText = `${currentUser.name} (${currentUser.role.toUpperCase()})`;
    renderUsersTableAdmin();

    alert("Kredensial Admin berhasil diperbarui!");
    document.getElementById('adminNewPassword').value = '';
    document.getElementById('adminConfirmPassword').value = '';
  }
}

async function renderResultsTableAdmin() {
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-slate-400">Memuat data...</td></tr>';
  
  const results = await getResultsFromDB();
  tbody.innerHTML = '';

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-slate-400">Belum ada data nilai.</td></tr>';
    return;
  }

  results.forEach(r => {
    const violationBadge = r.violations > 0 
      ? `<span class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded font-bold">${r.violations}x Pelanggaran</span>`
      : `<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Bersih</span>`;

    tbody.innerHTML += `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-semibold">${r.student}</td>
        <td class="p-3 text-blue-600 font-semibold">${r.subject || '-'}</td>
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

  let csvContent = "data:text/csv;charset=utf-8,Siswa,Mata Pelajaran,Waktu,Benar,Salah,Skor,Pelanggaran\n";
  results.forEach(r => {
    csvContent += `"${r.student}","${r.subject || '-'}"\,"${r.timestamp}",${r.correct},${r.wrong},${r.score},${r.violations}\n`;
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
   SISWA - EXAM LOGIC
   ========================================================================== */
function setupStudentInstruction() {
  renderSubjectDropdowns();
  handleStudentSubjectChange();
}

function handleStudentSubjectChange() {
  selectedStudentSubjectId = document.getElementById('studentSubjectSelect').value;
  const activeSub = subjectsData.find(s => s.id === selectedStudentSubjectId);

  if (activeSub) {
    document.getElementById('instructionDuration').innerText = activeSub.duration;
    document.getElementById('instructionQuestionCount').innerText = activeSub.questions.length;
  }
}

function startExam() {
  const activeSub = subjectsData.find(s => s.id === selectedStudentSubjectId);

  if (!activeSub || activeSub.questions.length === 0) {
    alert("Mata pelajaran ini belum memiliki soal. Silakan pilih mata pelajaran lain atau hubungi Guru/Admin.");
    return;
  }

  currentActiveExamQuestions = activeSub.questions;
  currentExamDuration = activeSub.duration;
  currentExamTitle = activeSub.title;

  requestFullScreen();

  studentAnswers = {};
  currentQuestionIndex = 0;
  cheatingViolations = 0;
  isExamActive = true;
  examTimeSeconds = currentExamDuration * 60;

  document.getElementById('examStudentName').innerText = currentUser.name;
  document.getElementById('examSubjectName').innerText = currentExamTitle;
  
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
  const q = currentActiveExamQuestions[currentQuestionIndex];
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

  document.getElementById('btnPrev').disabled = currentQuestionIndex === 0;
}

function selectAnswer(optKey) {
  const q = currentActiveExamQuestions[currentQuestionIndex];
  if (!studentAnswers[q.id]) {
    studentAnswers[q.id] = { answer: optKey, doubtful: false };
  } else {
    studentAnswers[q.id].answer = optKey;
  }
  renderCurrentQuestion();
  renderNumberGrid();
}

function toggleDoubtful() {
  const q = currentActiveExamQuestions[currentQuestionIndex];
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
  if (currentQuestionIndex >= currentActiveExamQuestions.length) currentQuestionIndex = currentActiveExamQuestions.length - 1;
  renderCurrentQuestion();
}

function jumpToQuestion(index) {
  currentQuestionIndex = index;
  renderCurrentQuestion();
}

function renderNumberGrid() {
  const grid = document.getElementById('numberGrid');
  grid.innerHTML = '';

  currentActiveExamQuestions.forEach((q, idx) => {
    const ans = studentAnswers[q.id];
    let btnClass = "bg-slate-100 border-slate-300 text-slate-700";

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

  let correctCount = 0;
  currentActiveExamQuestions.forEach(q => {
    const userAns = studentAnswers[q.id]?.answer;
    if (userAns === q.correct) correctCount++;
  });

  const wrongCount = currentActiveExamQuestions.length - correctCount;
  const finalScore = Math.round((correctCount / currentActiveExamQuestions.length) * 100);

  const resultPayload = {
    student: currentUser.name,
    subject: currentExamTitle,
    score: finalScore,
    correct: correctCount,
    wrong: wrongCount,
    violations: cheatingViolations,
    timestamp: new Date().toLocaleString("id-ID")
  };

  await saveResultToDB(resultPayload);

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
   FITUR ANTI-KECURANGAN
   ========================================================================== */
function setupAntiCheatingEvents() {
  document.addEventListener('contextmenu', e => {
    if (isExamActive) e.preventDefault();
  });

  document.addEventListener('keydown', e => {
    if (!isExamActive) return;

    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
      (e.ctrlKey && (e.key === 'u' || e.key === 'c' || e.key === 'v'))
    ) {
      e.preventDefault();
      handleViolation("Aksi tombol keyboard yang dilarang terdeteksi!");
    }
  });

  window.addEventListener('blur', () => {
    if (isExamActive) {
      handleViolation("Anda terdeteksi meninggalkan tab/jendela ujian!");
    }
  });

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
