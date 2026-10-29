// ==========================================
// APP-CORE.JS: MANAJEMEN AKUN, MASTER DATA & REKAP
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  checkSession();
  renderSubjectTable();
  renderClassBadges();
  renderUserTable();
  renderAdminResultsTable();
});

// 1. Inisialisasi Data Master Default
function initDefaultData() {
  if (!localStorage.getItem('cbt_users')) {
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      { username: 'guru', password: 'guru123', name: 'Ustadz Fulan, S.Pd.', role: 'guru' },
      { username: 'siswa', password: 'siswa123', name: 'Ahmad Abdullah', role: 'siswa' }
    ];
    localStorage.setItem('cbt_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('cbt_subjects')) {
    const defaultSubjects = [
      { code: 'PAI', name: 'Pendidikan Agama Islam' },
      { code: 'MTK', name: 'Matematika' }
    ];
    localStorage.setItem('cbt_subjects', JSON.stringify(defaultSubjects));
  }

  if (!localStorage.getItem('cbt_classes')) {
    localStorage.setItem('cbt_classes', JSON.stringify(['VII-A', 'VII-B', 'VIII-A']));
  }

  if (!localStorage.getItem('cbt_academic')) {
    localStorage.setItem('cbt_academic', JSON.stringify({ year: '2026/2027', semester: 'Ganjil' }));
  }
}

// 2. Autentikasi & Sesi
function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const user = users.find(x => x.username === u && x.password === p);

  if (!user) {
    alert('Username atau password salah!');
    return;
  }

  localStorage.setItem('cbt_session', JSON.stringify(user));
  checkSession();
}

function handleLogout() {
  localStorage.removeItem('cbt_session');
  location.reload();
}

function checkSession() {
  const session = JSON.parse(localStorage.getItem('cbt_session') || 'null');
  
  ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudent', 'navUserArea'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  if (!session) {
    document.getElementById('viewLogin').classList.remove('hidden');
    return;
  }

  document.getElementById('navUserArea').classList.remove('hidden');
  document.getElementById('navUserInfo').innerText = `${session.name} (${session.role.toUpperCase()})`;

  if (session.role === 'admin') {
    document.getElementById('viewAdmin').classList.remove('hidden');
  } else if (session.role === 'guru') {
    document.getElementById('viewTeacher').classList.remove('hidden');
    if (window.initTeacherView) window.initTeacherView();
  } else if (session.role === 'siswa') {
    document.getElementById('viewStudent').classList.remove('hidden');
  }
}

// 3. Admin: Kelola Akun & Reset Password
function handleAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('addUserUsername').value.trim();
  const password = document.getElementById('addUserPassword').value.trim();
  const name = document.getElementById('addUserName').value.trim();
  const role = document.getElementById('addUserRole').value;

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  if (users.some(x => x.username === username)) {
    alert('Username sudah ada!');
    return;
  }

  users.push({ username, password, name, role });
  localStorage.setItem('cbt_users', JSON.stringify(users));
  renderUserTable();
  e.target.reset();
}

function renderUserTable() {
  const tbody = document.getElementById('adminUserTableBody');
  if (!tbody) return;
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  tbody.innerHTML = '';

  users.forEach((u, i) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2 font-semibold">${u.username} (${u.name})</td>
      <td class="p-2 uppercase text-[10px]"><span class="bg-slate-200 px-1.5 py-0.5 rounded">${u.role}</span></td>
      <td class="p-2 text-center">
        <button onclick="resetPassword(${i})" class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-0.5 rounded text-[10px]">Reset Pass</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function resetPassword(index) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const newPass = prompt(`Reset password untuk ${users[index].username}:`, "123456");
  if (newPass) {
    users[index].password = newPass.trim();
    localStorage.setItem('cbt_users', JSON.stringify(users));
    alert('Password berhasil di-reset!');
  }
}

function downloadUserExcelTemplate() {
  const data = [
    { "Username": "siswa01", "Password": "123", "Nama Lengkap": "Ahmad", "Role": "siswa" },
    { "Username": "guru01", "Password": "123", "Nama Lengkap": "Ustadz Ali", "Role": "guru" }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pengguna");
  XLSX.writeFile(wb, "Template_User_CBT.xlsx");
}

function handleUploadUserExcel() {
  const fileInput = document.getElementById('excelUserFileInput');
  if (!fileInput.files.length) return alert('Pilih file Excel!');

  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

    let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
    let count = 0;

    rows.forEach(r => {
      if (r.Username && r.Password && !users.some(u => u.username === String(r.Username))) {
        users.push({
          username: String(r.Username).trim(),
          password: String(r.Password).trim(),
          name: r['Nama Lengkap'] || r.Username,
          role: (r.Role || 'siswa').toLowerCase().trim()
        });
        count++;
      }
    });

    localStorage.setItem('cbt_users', JSON.stringify(users));
    renderUserTable();
    alert(`Berhasil mengimpor ${count} pengguna!`);
  };
  reader.readAsArrayBuffer(fileInput.files[0]);
}

// 4. Admin: Master Data (Kelas, Mapel, Akademik)
function saveAcademicSettings() {
  const year = document.getElementById('academicYearInput').value.trim();
  const semester = document.getElementById('semesterInput').value;
  if (!year) return alert('Masukkan Tahun Ajaran!');

  localStorage.setItem('cbt_academic', JSON.stringify({ year, semester }));
  alert('Pengaturan Tahun Ajaran & Semester berhasil disimpan!');
}

function handleAddClass(e) {
  e.preventDefault();
  const cName = document.getElementById('addClassName').value.trim().toUpperCase();
  let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  if (classes.includes(cName)) return alert('Kelas sudah ada!');

  classes.push(cName);
  localStorage.setItem('cbt_classes', JSON.stringify(classes));
  renderClassBadges();
  e.target.reset();
}

function renderClassBadges() {
  const container = document.getElementById('classListBadges');
  if (!container) return;
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  container.innerHTML = classes.map(c => `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-md font-semibold">${c}</span>`).join(' ');
}

function handleAddSubject(e) {
  e.preventDefault();
  const code = document.getElementById('addSubjectCode').value.trim().toUpperCase();
  const name = document.getElementById('addSubjectName').value.trim();
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');

  subjects.push({ code, name });
  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  renderSubjectTable();
  e.target.reset();
}

function renderSubjectTable() {
  const tbody = document.getElementById('adminSubjectTableBody');
  if (!tbody) return;
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  tbody.innerHTML = '';

  subjects.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2 font-semibold">${s.code}</td>
      <td class="p-2">${s.name}</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="editSubject(${i})" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Edit</button>
        <button onclick="deleteSubject(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editSubject(i) {
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const name = prompt("Edit Nama Mapel:", subjects[i].name);
  if (name) {
    subjects[i].name = name.trim();
    localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
    renderSubjectTable();
  }
}

function deleteSubject(i) {
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  if (confirm(`Hapus mapel ${subjects[i].name}?`)) {
    subjects.splice(i, 1);
    localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
    renderSubjectTable();
  }
}

function renderAdminResultsTable() {
  const tbody = document.getElementById('adminExamResultsTable');
  if (!tbody) return;
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  tbody.innerHTML = '';

  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-slate-400">Belum ada rekap hasil ujian.</td></tr>`;
    return;
  }

  results.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2 font-semibold">${r.studentName}</td>
      <td class="p-2">${r.examTitle}</td>
      <td class="p-2">${r.objScore || 0}</td>
      <td class="p-2">${r.essayScore !== undefined ? r.essayScore : '-'}</td>
      <td class="p-2 font-bold text-blue-900">${(r.objScore || 0) + (r.essayScore || 0)}</td>
      <td class="p-2"><span class="px-2 py-0.5 text-[10px] rounded ${r.essayScore !== undefined ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${r.essayScore !== undefined ? 'Selesai' : 'Perlu Koreksi'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}
