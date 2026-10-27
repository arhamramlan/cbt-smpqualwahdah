// CONFIGURATION SUPABASE
const SUPABASE_URL = "https://YOUR-SUPABASE-URL.supabase.co";
const SUPABASE_KEY = "YOUR-SUPABASE-ANON-KEY";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// STATE UJIAN & USER
let currentRole = 'murid';
let currentUser = null;
let questions = [];
let currentQIndex = 0;
let userAnswers = {}; // { id_soal: "A", id_soal_2: ["A", "C"] }
let flaggedQuestions = {};
let violationCount = 0;
let examTimer = null;
let totalTimeSeconds = 60 * 60; // 60 menit default
let startTime = null;

// INIT & EVENT SECURITY LISTENERS
document.addEventListener("DOMContentLoaded", () => {
  renderOptionsInput();
  setupSecurityEvents();
});

function setupSecurityEvents() {
  // Disable Right Click, Copy, Paste, Cut
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('copy', e => e.preventDefault());
  document.addEventListener('paste', e => e.preventDefault());
  document.addEventListener('cut', e => e.preventDefault());

  // Disable Shortkey (F12, Ctrl+Shift+I, Alt+Tab, etc.)
  document.addEventListener('keydown', e => {
    if (currentUser && currentRole === 'murid') {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        registerViolation("Penggunaan tombol pengembang terdeteksi!");
      }
    }
  });

  // Detect Tab Switching / Focus Loss
  document.addEventListener("visibilitychange", () => {
    if (currentUser && currentRole === 'murid' && document.hidden) {
      registerViolation("Anda terdeteksi berpindah tab / aplikasi!");
    }
  });

  window.addEventListener("blur", () => {
    if (currentUser && currentRole === 'murid') {
      registerViolation("Fokus browser hilang / membuka aplikasi lain!");
    }
  });
}

// REGISTER PELANGGARAN
function registerViolation(reason) {
  violationCount++;
  document.getElementById("violation-count").innerText = violationCount;
  document.getElementById("warning-text").innerText = reason;
  document.getElementById("warning-modal").classList.remove("hidden");

  if (violationCount >= 3) {
    alert("Batas maksimal pelanggaran (3x) tercapai. Ujian otomatis dikirim!");
    submitExam(true);
  }
}

function closeWarningModal() {
  document.getElementById("warning-modal").classList.add("hidden");
  requestFullScreen();
}

function requestFullScreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

// ROLE SWITCH & AUTHENTICATION
function switchRole(role) {
  currentRole = role;
  document.querySelectorAll('.role-selector button').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('label-user').innerText = role === 'murid' ? 'NISN / ID Siswa' : 'Username';
}

async function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-password').value;

  if (currentRole === 'murid') {
    const { data, error } = await supabase.from('siswa').select('*').eq('nisn', u).eq('password', p).single();
    if (error || !data) return alert('NISN atau Password Salah!');
    currentUser = data;
    startExamSession();
  } else {
    const { data, error } = await supabase.from('admin').select('*').eq('username', u).eq('password', p).single();
    if (error || !data) return alert('Username/Password Admin/Guru Salah!');
    currentUser = data;
    showDashboard(data.role);
  }
}

// LOGIKA UJIAN MURID
async function startExamSession() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-murid').classList.remove('hidden');
  document.getElementById('student-info').innerText = `${currentUser.nama} (${currentUser.kelas})`;

  // Load Soal Sesuai Kelas Siswa
  const { data } = await supabase.from('soal').select('*').eq('kelas', currentUser.kelas);
  questions = data || [];

  if (questions.length === 0) {
    alert("Belum ada soal untuk kelas Anda!");
    return logout();
  }

  // Restore LocalStorage Autosave
  const saved = localStorage.getItem(`exam_ans_${currentUser.nisn}`);
  if (saved) userAnswers = JSON.parse(saved);

  startTime = new Date().toISOString();
  requestFullScreen();
  startTimer();
  renderNavigationGrid();
  loadQuestion(0);
}

function startTimer() {
  examTimer = setInterval(() => {
    totalTimeSeconds--;
    const m = Math.floor(totalTimeSeconds / 60);
    const s = totalTimeSeconds % 60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;

    if (totalTimeSeconds <= 0) {
      clearInterval(examTimer);
      alert('Waktu Ujian Habis!');
      submitExam(false);
    }
  }, 1000);
}

function loadQuestion(index) {
  currentQIndex = index;
  const q = questions[index];
  document.getElementById('question-number').innerText = `Soal No. ${index + 1}`;
  document.getElementById('question-text').innerText = q.pertanyaan;
  document.getElementById('question-type').innerText = q.tipe_soal === 'pg' ? 'Pilihan Ganda' : q.tipe_soal === 'multi' ? 'Pilihan Lebih Dari Satu' : 'Benar / Salah';

  const container = document.getElementById('options-container');
  container.innerHTML = '';

  const ans = userAnswers[q.id_soal];

  if (q.tipe_soal === 'pg') {
    ['A', 'B', 'C', 'D'].forEach(opt => {
      if (q[`opsi_${opt.toLowerCase()}`]) {
        container.innerHTML += `
          <label><input type="radio" name="opt" value="${opt}" ${ans === opt ? 'checked' : ''} onchange="saveAnswer('${opt}')"> ${opt}. ${q[`opsi_${opt.toLowerCase()}`]}</label>
        `;
      }
    });
  } else if (q.tipe_soal === 'bs') {
    ['BENAR', 'SALAH'].forEach(opt => {
      container.innerHTML += `
        <label><input type="radio" name="opt" value="${opt}" ${ans === opt ? 'checked' : ''} onchange="saveAnswer('${opt}')"> ${opt}</label>
      `;
    });
  } else if (q.tipe_soal === 'multi') {
    const arrAns = Array.isArray(ans) ? ans : [];
    ['A', 'B', 'C', 'D'].forEach(opt => {
      if (q[`opsi_${opt.toLowerCase()}`]) {
        container.innerHTML += `
          <label><input type="checkbox" name="opt_multi" value="${opt}" ${arrAns.includes(opt) ? 'checked' : ''} onchange="saveMultiAnswer()"> ${opt}. ${q[`opsi_${opt.toLowerCase()}`]}</label>
        `;
      }
    });
  }

  document.getElementById('flag-checkbox').checked = !!flaggedQuestions[q.id_soal];
  renderNavigationGrid();
}

function saveAnswer(val) {
  const qId = questions[currentQIndex].id_soal;
  userAnswers[qId] = val;
  localStorage.setItem(`exam_ans_${currentUser.nisn}`, JSON.stringify(userAnswers));
  renderNavigationGrid();
}

function saveMultiAnswer() {
  const qId = questions[currentQIndex].id_soal;
  const selected = Array.from(document.querySelectorAll('input[name="opt_multi"]:checked')).map(cb => cb.value);
  userAnswers[qId] = selected;
  localStorage.setItem(`exam_ans_${currentUser.nisn}`, JSON.stringify(userAnswers));
  renderNavigationGrid();
}

function toggleFlag() {
  const qId = questions[currentQIndex].id_soal;
  flaggedQuestions[qId] = document.getElementById('flag-checkbox').checked;
  renderNavigationGrid();
}

function prevQuestion() { if (currentQIndex > 0) loadQuestion(currentQIndex - 1); }
function nextQuestion() { if (currentQIndex < questions.length - 1) loadQuestion(currentQIndex + 1); }

function renderNavigationGrid() {
  const grid = document.getElementById('number-grid');
  grid.innerHTML = '';
  questions.forEach((q, idx) => {
    let cls = 'num-btn';
    if (idx === currentQIndex) cls += ' active';
    if (userAnswers[q.id_soal] && userAnswers[q.id_soal].length > 0) cls += ' answered';
    if (flaggedQuestions[q.id_soal]) cls += ' flagged';
    grid.innerHTML += `<button class="${cls}" onclick="loadQuestion(${idx})">${idx + 1}</button>`;
  });
}

function confirmSubmit() {
  if (confirm("Apakah Anda yakin ingin menyelesaikan dan mengumpulkan ujian?")) {
    submitExam(false);
  }
}

async function submitExam(forcedByViolation) {
  clearInterval(examTimer);
  let correctCount = 0;

  // Logika KOREKSI AUTOMATIS
  questions.forEach(q => {
    const userAns = userAnswers[q.id_soal];
    if (q.tipe_soal === 'multi') {
      const formattedUser = Array.isArray(userAns) ? userAns.sort().join(',') : '';
      const formattedKey = q.kunci_jawaban.split(',').sort().join(',');
      if (formattedUser === formattedKey) correctCount++;
    } else {
      if (userAns === q.kunci_jawaban) correctCount++;
    }
  });

  const finalScore = (correctCount / questions.length) * 100;

  // Simpan ke Supabase
  await supabase.from('hasil').insert([{
    nisn: currentUser.nisn,
    nama: currentUser.nama,
    kelas: currentUser.kelas,
    mata_pelajaran: questions[0].mata_pelajaran,
    nilai: finalScore.toFixed(2),
    waktu_mulai: startTime,
    waktu_selesai: new Date().toISOString(),
    jumlah_pelanggaran: violationCount
  }]);

  // Cleanup & Redirect
  localStorage.removeItem(`exam_ans_${currentUser.nisn}`);
  alert(`Ujian Selesai!\nNilai Anda: ${finalScore.toFixed(2)}\nJumlah Pelanggaran: ${violationCount}`);
  location.reload();
}

// DASHBOARD GURU & ADMIN
function showDashboard(role) {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('hidden');
  if (role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(e => e.classList.remove('hidden'));
  }
  loadResultsTab();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

  document.getElementById(`tab-btn-${tabName}`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  if (tabName === 'results') loadResultsTab();
  if (tabName === 'questions') loadQuestionsTab();
  if (tabName === 'users') loadUsersTab();
}

async function loadResultsTab() {
  const { data } = await supabase.from('hasil').select('*').order('timestamp', { ascending: false });
  const tbody = document.getElementById('table-results-body');
  tbody.innerHTML = '';
  let totalScore = 0;

  (data || []).forEach(r => {
    totalScore += parseFloat(r.nilai);
    tbody.innerHTML += `
      <tr>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
        <td>${r.nisn}</td><td>${r.nama}</td><td>${r.kelas}</td>
        <td>${r.mata_pelajaran}</td><td><b>${r.nilai}</b></td>
        <td><span class="${r.jumlah_pelanggaran > 0 ? 'badge danger' : ''}">${r.jumlah_pelanggaran}x</span></td>
      </tr>
    `;
  });

  document.getElementById('stat-total').innerText = data ? data.length : 0;
  document.getElementById('stat-avg').innerText = data && data.length ? (totalScore / data.length).toFixed(2) : 0;
}

// MANAGEMENT SOAL & DYNAMIC FORM
function renderOptionsInput() {
  const type = document.getElementById('soal-tipe').value;
  const container = document.getElementById('dynamic-options');
  if (type === 'bs') {
    container.innerHTML = '<p>Pilihan otomatis: BENAR / SALAH</p>';
  } else {
    container.innerHTML = `
      <input type="text" id="opt-a" placeholder="Opsi A" required>
      <input type="text" id="opt-b" placeholder="Opsi B" required>
      <input type="text" id="opt-c" placeholder="Opsi C">
      <input type="text" id="opt-d" placeholder="Opsi D">
    `;
  }
}

async function saveQuestion(e) {
  e.preventDefault();
  const tipe = document.getElementById('soal-tipe').value;
  const payload = {
    mata_pelajaran: document.getElementById('soal-mapel').value,
    kelas: document.getElementById('soal-kelas').value,
    tipe_soal: tipe,
    pertanyaan: document.getElementById('soal-pertanyaan').value,
    opsi_a: tipe === 'bs' ? 'BENAR' : document.getElementById('opt-a')?.value,
    opsi_b: tipe === 'bs' ? 'SALAH' : document.getElementById('opt-b')?.value,
    opsi_c: tipe === 'bs' ? '' : document.getElementById('opt-c')?.value,
    opsi_d: tipe === 'bs' ? '' : document.getElementById('opt-d')?.value,
    kunci_jawaban: document.getElementById('soal-kunci').value.toUpperCase()
  };

  await supabase.from('soal').insert([payload]);
  alert('Soal Berhasil Disimpan!');
  loadQuestionsTab();
}

async function loadQuestionsTab() {
  const { data } = await supabase.from('soal').select('*');
  const tbody = document.getElementById('table-soal-body');
  tbody.innerHTML = '';
  (data || []).forEach(q => {
    tbody.innerHTML += `
      <tr>
        <td>${q.mata_pelajaran} (${q.kelas})</td>
        <td>${q.tipe_soal}</td><td>${q.pertanyaan}</td><td>${q.kunci_jawaban}</td>
        <td><button class="btn-danger" onclick="deleteQuestion(${q.id_soal})">Hapus</button></td>
      </tr>
    `;
  });
}

async function deleteQuestion(id) {
  if (confirm("Hapus soal ini?")) {
    await supabase.from('soal').delete().eq('id_soal', id);
    loadQuestionsTab();
  }
}

// MANAGEMENT USER & EXCEL UPLOAD
async function loadUsersTab() {
  const { data } = await supabase.from('siswa').select('*');
  const tbody = document.getElementById('table-users-body');
  tbody.innerHTML = '';
  (data || []).forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td>${s.nisn}</td><td>${s.nama}</td><td>${s.kelas}</td><td>${s.password}</td>
        <td><button class="btn-danger" onclick="deleteUser('${s.nisn}')">Hapus</button></td>
      </tr>
    `;
  });
}

async function saveUser(e) {
  e.preventDefault();
  await supabase.from('siswa').insert([{
    nisn: document.getElementById('user-nisn').value,
    nama: document.getElementById('user-nama').value,
    kelas: document.getElementById('user-kelas').value,
    password: document.getElementById('user-pass').value
  }]);
  alert('Siswa berhasil ditambahkan!');
  loadUsersTab();
}

async function deleteUser(nisn) {
  if (confirm("Hapus akun siswa ini?")) {
    await supabase.from('siswa').delete().eq('nisn', nisn);
    loadUsersTab();
  }
}

function uploadExcelUsers(e) {
  const reader = new FileReader();
  reader.onload = async function(evt) {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet); // Format Excel Header: NISN, Nama, Kelas, Password

    const formatted = json.map(x => ({
      nisn: String(x.NISN),
      nama: x.Nama,
      kelas: x.Kelas,
      password: String(x.Password)
    }));

    await supabase.from('siswa').upsert(formatted);
    alert('Import Akun Excel Berhasil!');
    loadUsersTab();
  };
  reader.readAsArrayBuffer(e.target.files[0]);
}

function logout() { location.reload(); }
