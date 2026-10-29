// ==========================================
// APP-CORE.JS: AUTH, DATA MASTER & PROFIL
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  checkSession();
  renderAdminUsers();
  renderAdminSubjects();
});

function initDefaultData() {
  if (!localStorage.getItem('cbt_users')) {
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      { username: 'guru', password: 'guru123', name: 'Ustadz Fulan, S.Pd.', role: 'guru' },
      { username: 'siswa01', password: '123', name: 'Ahmad Abdullah', role: 'siswa', nisn: '00123456', class: 'VII-A' },
      { username: 'siswa02', password: '123', name: 'Muhammad Zaid', role: 'siswa', nisn: '00123457', class: 'VII-A' },
      { username: 'siswa03', password: '123', name: 'Bilal bin Rabah', role: 'siswa', nisn: '00123458', class: 'VII-B' }
    ];
    localStorage.setItem('cbt_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('cbt_subjects')) {
    localStorage.setItem('cbt_subjects', JSON.stringify([
      { code: 'PAI', name: 'Pendidikan Agama Islam' },
      { code: 'MTK', name: 'Matematika' }
    ]));
  }

  if (!localStorage.getItem('cbt_classes')) {
    localStorage.setItem('cbt_classes', JSON.stringify(['VII-A', 'VII-B', 'VIII-A']));
  }

  if (!localStorage.getItem('cbt_schedules')) {
    localStorage.setItem('cbt_schedules', JSON.stringify([]));
  }

  if (!localStorage.getItem('cbt_live_monitoring')) {
    localStorage.setItem('cbt_live_monitoring', JSON.stringify({}));
  }

  if (!localStorage.getItem('cbt_results')) {
    localStorage.setItem('cbt_results', JSON.stringify([]));
  }
}

function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const user = users.find(x => x.username === u && x.password === p);

  if (!user) return alert('Username atau password salah!');

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
    if (window.initTeacherDashboard) window.initTeacherDashboard();
  } else if (session.role === 'siswa') {
    document.getElementById('viewStudent').classList.remove('hidden');
  }
}

// PROFILE & PROMPT HELPERS
function openProfileModal() { document.getElementById('modalProfile').classList.remove('hidden'); }
function closeProfileModal() { document.getElementById('modalProfile').classList.add('hidden'); }

function handleSaveProfile(e) {
  e.preventDefault();
  const newPass = document.getElementById('profileNewPass').value.trim();
  let session = JSON.parse(localStorage.getItem('cbt_session') || '{}');
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');

  const uIndex = users.findIndex(u => u.username === session.username);
  if (uIndex > -1) {
    users[uIndex].password = newPass;
    session.password = newPass;
    localStorage.setItem('cbt_users', JSON.stringify(users));
    localStorage.setItem('cbt_session', JSON.stringify(session));
    alert('Password berhasil diperbarui!');
    closeProfileModal();
  }
}

// ADMIN FUNCTIONS
function handleAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('addUserUsername').value.trim();
  const password = document.getElementById('addUserPassword').value.trim();
  const name = document.getElementById('addUserName').value.trim();
  const role = document.getElementById('addUserRole').value;

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  if (users.some(u => u.username === username)) return alert('Username sudah ada!');

  users.push({ username, password, name, role });
  localStorage.setItem('cbt_users', JSON.stringify(users));
  renderAdminUsers();
  e.target.reset();
}

function renderAdminUsers() {
  const tbody = document.getElementById('adminUserTableBody');
  if (!tbody) return;
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  tbody.innerHTML = users.map((u, i) => `
    <tr class="border-b">
      <td class="p-2 font-semibold">${u.name} (${u.username})</td>
      <td class="p-2 uppercase font-bold text-[10px]">${u.role}</td>
      <td class="p-2 text-center">
        <button onclick="resetUserPassword(${i})" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Reset Pass</button>
      </td>
    </tr>
  `).join('');
}

function resetUserPassword(i) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const p = prompt(`Reset password untuk ${users[i].name}:`, '123456');
  if (p) {
    users[i].password = p.trim();
    localStorage.setItem('cbt_users', JSON.stringify(users));
    alert('Password berhasil direset!');
  }
}

function handleAddSubject(e) {
  e.preventDefault();
  const code = document.getElementById('addSubjectCode').value.trim().toUpperCase();
  const name = document.getElementById('addSubjectName').value.trim();
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');

  subjects.push({ code, name });
  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  renderAdminSubjects();
  e.target.reset();
}

function renderAdminSubjects() {
  const tbody = document.getElementById('adminSubjectTableBody');
  if (!tbody) return;
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  tbody.innerHTML = subjects.map((s, i) => `
    <tr class="border-b">
      <td class="p-2 font-bold">${s.code}</td>
      <td class="p-2">${s.name}</td>
      <td class="p-2 text-center">
        <button onclick="deleteAdminSubject(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function deleteAdminSubject(i) {
  if (confirm('Hapus mapel ini?')) {
    let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
    subjects.splice(i, 1);
    localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
    renderAdminSubjects();
  }
}
