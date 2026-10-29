// ==========================================
// APP-CORE.JS: MANAJEMEN STATE, SESI & MASTER DATA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  checkSession();
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
