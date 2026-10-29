// ==========================================
// APP-CORE.JS: MANAJEMEN ADMIN, KELAS, MAPEL & PENUGASAN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  checkSession();
  renderClassTable();
  renderSubjectTable();
  renderUserTable();
  populateClassOptions();
});

function initDefaultData() {
  if (!localStorage.getItem('cbt_users')) {
    const defaultUsers = [
      { id: '1', username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin', active: true },
      { id: '2', username: 'guru1', password: 'guru123', name: 'Ustadz Fulan, S.Pd.', role: 'guru', active: true, assignedSubjects: ['PAI'], assignedClasses: ['VII-A', 'VII-B'] },
      { id: '3', username: 'siswa1', password: '123', name: 'Ahmad Abdullah', role: 'siswa', nisn: '00123456', class: 'VII-A', active: true }
    ];
    localStorage.setItem('cbt_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('cbt_classes')) {
    localStorage.setItem('cbt_classes', JSON.stringify([
      { code: 'VII-A', level: '7' },
      { code: 'VII-B', level: '7' },
      { code: 'VIII-A', level: '8' }
    ]));
  }

  if (!localStorage.getItem('cbt_subjects')) {
    localStorage.setItem('cbt_subjects', JSON.stringify([
      { code: 'PAI', name: 'Pendidikan Agama Islam' },
      { code: 'MTK', name: 'Matematika' }
    ]));
  }

  if (!localStorage.getItem('cbt_settings')) {
    localStorage.setItem('cbt_settings', JSON.stringify({
      schoolName: "SMP Qur'an Al Wahdah",
      academicYear: "2026/2027",
      semester: "Ganjil"
    }));
  }
}

function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const user = users.find(x => x.username === u && x.password === p);

  if (!user) return alert('Username atau password salah!');
  if (!user.active) return alert('Akun Anda dinonaktifkan. Hubungi Admin.');

  user.lastLogin = new Date().toLocaleString('id-ID');
  localStorage.setItem('cbt_users', JSON.stringify(users));
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

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-tab-btn').forEach(el => el.classList.remove('active-tab'));

  document.getElementById(tabId).classList.remove('hidden');
  
  const map = {
    'adminTabUsers': 'btnAdminUsers',
    'adminTabClasses': 'btnAdminClasses',
    'adminTabSubjects': 'btnAdminSubjects',
    'adminTabAssign': 'btnAdminAssign',
    'adminTabCards': 'btnAdminCards',
    'adminTabSettings': 'btnAdminSettings'
  };

  if (map[tabId]) document.getElementById(map[tabId]).classList.add('active-tab');

  if (tabId === 'adminTabAssign') populateAssignTab();
  if (tabId === 'adminTabCards') populateCardsTab();
}

function handleSaveClass(e) {
  e.preventDefault();
  const code = document.getElementById('classNameInput').value.trim().toUpperCase();
  const level = document.getElementById('classLevelInput').value;
  let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  if (classes.some(c => c.code === code)) return alert('Kode kelas sudah ada!');

  classes.push({ code, level });
  localStorage.setItem('cbt_classes', JSON.stringify(classes));
  alert('Kelas berhasil disimpan!');
  document.getElementById('classNameInput').value = '';
  renderClassTable();
  populateClassOptions();
}

function renderClassTable() {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');

  tbody.innerHTML = classes.map((c, i) => {
    const studentCount = users.filter(u => u.role === 'siswa' && u.class === c.code).length;
    return `
      <tr class="border-b">
        <td class="p-2.5 font-bold">${c.code}</td>
        <td class="p-2.5">Tingkat ${c.level}</td>
        <td class="p-2.5">${studentCount} Siswa</td>
        <td class="p-2.5 text-center">
          <button onclick="deleteClass(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');
}

function deleteClass(i) {
  if (confirm('Hapus kelas ini?')) {
    let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
    classes.splice(i, 1);
    localStorage.setItem('cbt_classes', JSON.stringify(classes));
    renderClassTable();
    populateClassOptions();
  }
}

function handleSaveSubject(e) {
  e.preventDefault();
  const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
  const name = document.getElementById('subjectNameInput').value.trim();
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');

  if (subjects.some(s => s.code === code)) return alert('Kode mapel sudah ada!');

  subjects.push({ code, name });
  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  alert('Mapel berhasil disimpan!');
  document.getElementById('subjectCodeInput').value = '';
  document.getElementById('subjectNameInput').value = '';
  renderSubjectTable();
}

function renderSubjectTable() {
  const tbody = document.getElementById('subjectTableBody');
  if (!tbody) return;
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');

  tbody.innerHTML = subjects.map((s, i) => `
    <tr class="border-b">
      <td class="p-2.5 font-bold">${s.code}</td>
      <td class="p-2.5">${s.name}</td>
      <td class="p-2.5 text-center">
        <button onclick="deleteSubject(${i})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function deleteSubject(i) {
  if (confirm('Hapus mapel ini?')) {
    let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
    subjects.splice(i, 1);
    localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
    renderSubjectTable();
  }
}

function toggleRoleFields() {
  const role = document.getElementById('userRole').value;
  const fieldSiswa = document.getElementById('fieldSiswa');
  if (role === 'siswa') fieldSiswa.classList.remove('hidden');
  else fieldSiswa.classList.add('hidden');
}

function populateClassOptions() {
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  const select = document.getElementById('userClass');
  if (select) {
    select.innerHTML = classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  }
}

function generateAutoPassword() {
  document.getElementById('userPassword').value = Math.random().toString(36).substring(2, 8);
}

function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value || Date.now().toString();
  const role = document.getElementById('userRole').value;
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const pass = document.getElementById('userPassword').value.trim();

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');

  if (!document.getElementById('editUserId').value && users.some(u => u.username === username)) {
    return alert('Username sudah terdaftar!');
  }

  const index = users.findIndex(u => u.id === id);
  let userData = { id, username, name, role, active: true };

  if (pass) userData.password = pass;
  else if (index > -1) userData.password = users[index].password;

  if (role === 'siswa') {
    userData.nisn = document.getElementById('userNisn').value.trim();
    userData.class = document.getElementById('userClass').value;
  }

  if (index > -1) users[index] = { ...users[index], ...userData };
  else users.push(userData);

  localStorage.setItem('cbt_users', JSON.stringify(users));
  alert('Data pengguna disimpan!');
  resetUserForm();
  renderUserTable();
}

function resetUserForm() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userFormTitle').innerText = 'Tambah Pengguna Baru';
}

function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const search = (document.getElementById('searchUser')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('filterRole')?.value || '';

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search) || u.username.toLowerCase().includes(search);
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  tbody.innerHTML = filtered.map(u => `
    <tr class="border-b">
      <td class="p-2.5">
        <strong class="text-slate-800">${u.name}</strong>
        <p class="text-[10px] text-slate-500">Username: ${u.username} ${u.nisn ? '| NISN: ' + u.nisn : ''}</p>
      </td>
      <td class="p-2.5">
        <span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role}</span>
        ${u.class ? `<span class="bg-slate-100 px-1 py-0.5 rounded text-[10px] ml-1">${u.class}</span>` : ''}
      </td>
      <td class="p-2.5">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${u.active ? 'Aktif' : 'Nonaktif'}
        </span>
      </td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="toggleUserActive('${u.id}')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Status</button>
        <button onclick="deleteUser('${u.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function toggleUserActive(id) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const u = users.find(x => x.id === id);
  if (u) {
    if (u.username === 'admin') return alert('Akun admin utama tidak boleh dinonaktifkan!');
    u.active = !u.active;
    localStorage.setItem('cbt_users', JSON.stringify(users));
    renderUserTable();
  }
}

function deleteUser(id) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const u = users.find(x => x.id === id);
  if (u && u.username === 'admin') return alert('Akun admin utama tidak boleh dihapus!');

  if (confirm('Hapus pengguna ini secara permanen?')) {
    users = users.filter(x => x.id !== id);
    localStorage.setItem('cbt_users', JSON.stringify(users));
    renderUserTable();
  }
}

function populateAssignTab() {
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'guru');
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  const teacherSelect = document.getElementById('assignTeacherSelect');
  if (teacherSelect) {
    teacherSelect.innerHTML = users.map(g => `<option value="${g.id}">${g.name} (${g.username})</option>`).join('');
  }

  const subBox = document.getElementById('assignSubjectsBox');
  if (subBox) {
    subBox.innerHTML = subjects.map(s => `
      <label class="flex items-center text-xs">
        <input type="checkbox" name="assignSub" value="${s.code}" class="mr-2"> ${s.name} (${s.code})
      </label>
    `).join('');
  }

  const classBox = document.getElementById('assignClassesBox');
  if (classBox) {
    classBox.innerHTML = classes.map(c => `
      <label class="flex items-center text-xs">
        <input type="checkbox" name="assignCls" value="${c.code}" class="mr-2"> Kelas ${c.code}
      </label>
    `).join('');
  }

  loadTeacherAssignments();
}

function loadTeacherAssignments() {
  const teacherId = document.getElementById('assignTeacherSelect').value;
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const teacher = users.find(u => u.id === teacherId);

  document.querySelectorAll('input[name="assignSub"]').forEach(cb => {
    cb.checked = teacher && teacher.assignedSubjects ? teacher.assignedSubjects.includes(cb.value) : false;
  });

  document.querySelectorAll('input[name="assignCls"]').forEach(cb => {
    cb.checked = teacher && teacher.assignedClasses ? teacher.assignedClasses.includes(cb.value) : false;
  });
}

function saveTeacherAssignments() {
  const teacherId = document.getElementById('assignTeacherSelect').value;
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const index = users.findIndex(u => u.id === teacherId);

  if (index > -1) {
    const selectedSubs = Array.from(document.querySelectorAll('input[name="assignSub"]:checked')).map(cb => cb.value);
    const selectedClasses = Array.from(document.querySelectorAll('input[name="assignCls"]:checked')).map(cb => cb.value);

    users[index].assignedSubjects = selectedSubs;
    users[index].assignedClasses = selectedClasses;

    localStorage.setItem('cbt_users', JSON.stringify(users));
    alert('Penugasan guru berhasil disimpan!');
  }
}

function populateCardsTab() {
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  const select = document.getElementById('cardClassFilter');
  if (select) {
    select.innerHTML = classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
    renderExamCards();
  }
}

function renderExamCards() {
  const selectedClass = document.getElementById('cardClassFilter').value;
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa' && u.class === selectedClass);
  const settings = JSON.parse(localStorage.getItem('cbt_settings') || '{}');
  const grid = document.getElementById('examCardsGrid');

  if (!users.length) {
    grid.innerHTML = `<p class="text-xs text-slate-400">Tidak ada siswa di kelas ini.</p>`;
    return;
  }

  grid.innerHTML = users.map(u => `
    <div class="border-2 border-slate-800 p-3 rounded-lg bg-white space-y-2 text-xs">
      <div class="text-center border-b pb-1">
        <strong class="uppercase text-[11px] block font-bold">${settings.schoolName || 'SMP Qur\'an Al Wahdah'}</strong>
        <span class="text-[9px] text-slate-500 uppercase">KARTU PESERTA UJIAN CBT ${settings.academicYear || ''}</span>
      </div>
      <div class="space-y-0.5">
        <div><strong>Nama:</strong> ${u.name}</div>
        <div><strong>NISN / Kelas:</strong> ${u.nisn || '-'} / ${u.class}</div>
        <div><strong>Username:</strong> <code class="font-bold text-blue-900">${u.username}</code></div>
        <div><strong>Password:</strong> <code class="font-bold text-rose-700">${u.password}</code></div>
      </div>
    </div>
  `).join('');
}
