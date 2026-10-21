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
    targetClass: "Kelas 7A",
    teacherUsername: "guru1",
    teacherName: "Ustadz Ahmad, S.Pd.",
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
    targetClass: "Kelas 7A",
    teacherUsername: "guru2",
    teacherName: "Ustadz Mahmud, Lc.",
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
  { id: 1, name: "Administrator Utama", username: "admin", password: "adminpassword", role: "admin" },
  { id: 2, name: "Ustadz Ahmad, S.Pd.", username: "guru1", password: "gurupassword", role: "guru", assignedInfo: "Matematika - Kelas 7A" },
  { id: 3, name: "Ustadz Mahmud, Lc.", username: "guru2", password: "gurupassword", role: "guru", assignedInfo: "PAI - Kelas 7A" },
  { id: 4, name: "Muhammad Ali", username: "siswa1", password: "siswapassword", role: "siswa", studentClass: "Kelas 7A" }
];
let usersList = [];

let selectedAdminSubjectId = "";
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
    currentUser = { ...foundUser };
    
    if (foundUser.role === 'admin' || foundUser.role === 'guru') {
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
   DASHBOARD GURU & ADMIN (RBAC ACCESS CONTROL)
   ========================================================================== */
function setupAdminDashboard() {
  // Kontrol Akses Fitur Manajemen Akun (Hanya Admin)
  const accMgmtSection = document.getElementById('sectionAccountManagement');
  if (currentUser.role === 'admin') {
    accMgmtSection.classList.remove('hidden');
  } else {
    accMgmtSection.classList.add('hidden'); // Guru tidak bisa akses manajemen akun
  }

  renderSubjectDropdowns();
  renderQuestionListAdmin();
  renderUsersTableAdmin();
  populateAdminProfileForm();
  renderResultsTableAdmin();
}

function getAccessibleSubjectsForCurrentAdmin() {
  if (!currentUser) return [];
  if (currentUser.role === 'admin') {
    return subjectsData; // Admin bisa akses semua mapel
  } else if (currentUser.role === 'guru') {
    // Guru hanya bisa mengakses mapel yang terdaftar atas username-nya
    return subjectsData.filter(s => s.teacherUsername === currentUser.username);
  }
  return [];
}

function handleAddSubject() {
  const title = document.getElementById('newSubjectTitle').value.trim();
  const targetClass = document.getElementById('newSubjectClass').value.trim() || "Semua Kelas";
  const duration = parseInt(document.getElementById('newSubjectDuration').value) || 30;

  if (!title) {
    alert("Nama Mata Pelajaran wajib diisi!");
    return;
  }

  const newSubject = {
    id: "mapel_" + Date.now(),
    title: title,
    targetClass: targetClass,
    teacherUsername: currentUser.username,
    teacherName: currentUser.name,
    duration: duration,
    questions: []
  };

  subjectsData.push(newSubject);
  selectedAdminSubjectId = newSubject.id;
  saveData();

  document.getElementById('newSubjectTitle').value = '';
  document.getElementById('newSubjectClass').value = '';
  renderSubjectDropdowns();
  renderQuestionListAdmin();
  alert(`Mata pelajaran "${title}" (${targetClass}) berhasil ditambahkan!`);
}

function renderSubjectDropdowns() {
  const adminSelect = document.getElementById('adminSubjectSelect');
  const studentSelect = document.getElementById('studentSubjectSelect');

  // Filter mapel untuk Admin / Guru
  if (adminSelect) {
    adminSelect.innerHTML = '';
    const accessibleSubjects = getAccessibleSubjectsForCurrentAdmin();

    if (accessibleSubjects.length === 0) {
      adminSelect.innerHTML = '<option value="">Belum ada mapel diampu</option>';
      selectedAdminSubjectId = "";
    } else {
      if (!accessibleSubjects.some(s => s.id === selectedAdminSubjectId)) {
        selectedAdminSubjectId = accessibleSubjects[0].id;
      }
      accessibleSubjects.forEach(sub => {
        adminSelect.innerHTML += `<option value="${sub.id}" ${sub.id === selectedAdminSubjectId ? 'selected' : ''}>${sub.title} - ${sub.targetClass} (${sub.duration} Menit)</option>`;
      });
    }
  }

  // Filter mapel untuk Siswa (Sesuai Kelas Siswa)
  if (studentSelect && currentUser && currentUser.role === 'siswa') {
    studentSelect.innerHTML = '';
    const studentClass = currentUser.studentClass || "Semua Kelas";
    const availableForStudent = subjectsData.filter(s => s.targetClass === studentClass || s.targetClass === "Semua Kelas");

    if (availableForStudent.length === 0) {
      studentSelect.innerHTML = '<option value="">Tidak ada ujian aktif untuk kelas Anda</option>';
      selectedStudentSubjectId = "";
    } else {
      if (!availableForStudent.some(s => s.id === selectedStudentSubjectId)) {
        selectedStudentSubjectId = availableForStudent[0].id;
      }
      availableForStudent.forEach(sub => {
        studentSelect.innerHTML += `<option value="${sub.id}" ${sub.id === selectedStudentSubjectId ? 'selected' : ''}>${sub.title} - ${sub.targetClass} (Guru: ${sub.teacherName})</option>`;
      });
    }
  }
}

function handleAdminSubjectChange() {
  selectedAdminSubjectId = document.getElementById('adminSubjectSelect').value;
  renderQuestionListAdmin();
}

function getActiveAdminSubject() {
  return subjectsData.find(s => s.id === selectedAdminSubjectId);
}

function openEditSubjectModal() {
  const activeSub = getActiveAdminSubject();
  if (!activeSub) {
    alert("Tidak ada mata pelajaran yang dipilih!");
    return;
  }

  document.getElementById('editSubjectTitle').value = activeSub.title;
  document.getElementById('editSubjectClass').value = activeSub.targetClass;
  document.getElementById('editSubjectDuration').value = activeSub.duration;
  document.getElementById('modalEditSubject').classList.remove('hidden');
}

function closeEditSubjectModal() {
  document.getElementById('modalEditSubject').classList.add('hidden');
}

function handleSaveEditedSubject() {
  const activeSub = getActiveAdminSubject();
  if (!activeSub) return;

  const newTitle = document.getElementById('editSubjectTitle').value.trim();
  const newClass = document.getElementById('editSubjectClass').value.trim();
  const newDuration = parseInt(document.getElementById('editSubjectDuration').value) || 30;

  if (!newTitle) {
    alert("Nama Mata Pelajaran tidak boleh kosong!");
    return;
  }

  activeSub.title = newTitle;
  activeSub.targetClass = newClass;
  activeSub.duration = newDuration;

  saveData();
  renderSubjectDropdowns();
  closeEditSubjectModal();

  alert(`Mata pelajaran berhasil diperbarui!`);
}

function handleDeleteSubject() {
  const activeSub = getActiveAdminSubject();
  if (!activeSub) return;

  if (confirm(`Apakah Anda yakin ingin menghapus mata pelajaran "${activeSub.title}" beserta seluruh soal di dalamnya?`)) {
    subjectsData = subjectsData.filter(s => s.id !== activeSub.id);
    selectedAdminSubjectId = "";
    saveData();
    renderSubjectDropdowns();
    renderQuestionListAdmin();
    alert("Mata pelajaran berhasil dihapus!");
  }
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
    container.innerHTML = '<p class="text-xs text-slate-400">Belum ada mata pelajaran dipilih atau diampu.</p>';
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
   MANAJEMEN AKUN (GURU, SISWA, ADMIN)
   ========================================================================== */
function toggleUserRoleFields() {
  const role = document.getElementById('newRole').value;
  const teacherField = document.getElementById('fieldTeacherAssigned');
  const studentField = document.getElementById('fieldStudentClass');

  if (role === 'guru') {
    teacherField.classList.remove('hidden');
    studentField.classList.add('hidden');
  } else if (role === 'siswa') {
    teacherField.classList.add('hidden');
    studentField.classList.remove('hidden');
  } else {
    teacherField.classList.add('hidden');
    studentField.classList.add
