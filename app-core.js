// ==========================================
// APP-CORE.JS: MIGRATION, AUTH, ADMIN HUB & LOGS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  runDataMigration();
  initDefaultData();
  checkSession();
  applySettingsToHeader();
  renderClassTable();
  renderSubjectTable();
  renderUserTable();
  populateClassOptions();
});

function runDataMigration() {
  let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  if (classes.length > 0 && typeof classes[0] === 'string') {
    classes = classes.map(c => ({ code: String(c), level: '7', homeroom: '-' }));
    localStorage.setItem('cbt_classes', JSON.stringify(classes));
  }

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  let updatedUsers = users.map(u => {
    if (u.active === undefined) u.active = true;
    if (!u.id) u.id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    return u;
  });
  localStorage.setItem('cbt_users', JSON.stringify(updatedUsers));
}

function initDefaultData() {
  if (!localStorage.getItem('cbt_users')) {
    const defaultUsers = [
      { id: '1', username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin', active: true },
      { id: '2', username: 'guru1', password: 'guru123', name: 'Ustadz Fulan, S.Pd.', role: 'guru', active: true, teacherAssignments: [{ subject: 'PAI', classes: ['VII-A', 'VII-B'] }] },
      { id: '3', username: 'siswa1', password: '123', name: 'Ahmad Abdullah', role: 'siswa', nisn: '00123456', class: 'VII-A', active: true }
    ];
    localStorage.setItem('cbt_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('cbt_classes')) {
    localStorage.setItem('cbt_classes', JSON.stringify([
      { code: 'VII-A', level: '7', homeroom: 'Ustadz Ali' },
      { code: 'VII-B', level: '7', homeroom: 'Ustadz Umar' },
      { code: 'VIII-A', level: '8', homeroom: 'Ustadz Utsman' }
    ]));
  }

  if (!localStorage.getItem('cbt_subjects')) {
    localStorage.setItem('cbt_subjects', JSON.stringify([
      { code: 'PAI', name: 'Pendidikan Agama Islam' },
      { code: 'MTK', name: 'Matematika' }
    ]));
  }

  if (!localStorage.getItem('cbt_packages')) {
    localStorage.setItem('cbt_packages', JSON.stringify([
      {
        id: 'PKG_PAI_7_1',
        title: 'PAI Kelas 7 PTS Ganjil',
        subject: 'PAI',
        targetClass: 'VII-A',
        status: 'Siap',
        questions: [
          { type: 'PG', text: 'Ibu kota Indonesia adalah...', options: ['Bandung', 'Jakarta', 'Surabaya', 'Medan'], key: 'Jakarta', score: 2 },
          { type: 'ISIAN', text: 'Rukun Islam yang pertama adalah...', key: 'syahadat | dua kalimat syahadat', score: 2 }
        ]
      }
    ]));
  }

  if (!localStorage.getItem('cbt_settings')) {
    localStorage.setItem('cbt_settings', JSON.stringify({
      schoolName: "SMP Qur'an Al Wahdah",
      npsn: "10801234",
      academicYear: "2026/2027",
      semester: "Ganjil"
    }));
  }

  if (!localStorage.getItem('cbt_logs')) localStorage.setItem('cbt_logs', JSON.stringify([]));
}

function logActivity(eventText) {
  let logs = JSON.parse(localStorage.getItem('cbt_logs') || '[]');
  const session = JSON.parse(localStorage.getItem('cbt_session') || '{}');
  logs.unshift({
    time: new Date().toLocaleString('id-ID'),
    user: session.name || 'System',
    event: eventText
  });
  localStorage.setItem('cbt_logs', JSON.stringify(logs.slice(0, 100)));
}

function applySettingsToHeader() {
  const settings = JSON.parse(localStorage.getItem('cbt_settings') || '{}');
  const hName = document.getElementById('headerSchoolName');
  const hSub = document.getElementById('headerSubTitle');
  if (hName) hName.innerText = settings.schoolName || "SMP Qur'an Al Wahdah";
  if (hSub) hSub.innerText = `CBT System - Tahun Ajaran ${settings.academicYear || ''} (${settings.semester || ''})`;
}

function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const user = users.find(x => x.username === u && x.password === p);

  if (!user) return alert('Username atau password salah!');
  if (user.active === false) return alert('Akun Anda dinonaktifkan. Hubungi Admin.');

  user.lastLogin = new Date().toLocaleString('id-ID');
  localStorage.setItem('cbt_users', JSON.stringify(users));
  localStorage.setItem('cbt_session', JSON.stringify(user));

  logActivity(`User ${user.name} (${user.role}) berhasil login.`);
  checkSession();
}

function handleLogout() {
  logActivity(`User logout.`);
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
    renderLogsTable();
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
    'adminTabLogs': 'btnAdminLogs',
    'adminTabSettings': 'btnAdminSettings'
  };

  if (map[tabId]) document.getElementById(map[tabId]).classList.add('active-tab');

  if (tabId === 'adminTabAssign') populateAssignTab();
  if (tabId === 'adminTabCards') populateCardsTab();
  if (tabId === 'adminTabLogs') renderLogsTable();
}

// MASTER KELAS & MAPEL & USER
function handleSaveClass(e) {
  e.preventDefault();
  const oldCode = document.getElementById('editClassOldCode').value;
  const code = document.getElementById('classNameInput').value.trim().toUpperCase();
  const level = document.getElementById('classLevelInput').value;
  const homeroom = document.getElementById('classHomeroomInput').value.trim() || '-';

  let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  if (!oldCode && classes.some(c => c.code === code)) return alert('Kode kelas sudah ada!');

  if (oldCode) {
    const idx = classes.findIndex(c => c.code === oldCode);
    if (idx > -1) classes[idx] = { code, level, homeroom };
  } else {
    classes.push({ code, level, homeroom });
  }

  localStorage.setItem('cbt_classes', JSON.stringify(classes));
  alert('Kelas disimpan!');
  document.getElementById('editClassOldCode').value = '';
  document.getElementById('classNameInput').value = '';
  document.getElementById('classHomeroomInput').value = '';
  renderClassTable();
  populateClassOptions();
}

function renderClassTable() {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');

  tbody.innerHTML = classes.map(c => {
    const studentCount = users.filter(u => u.role === 'siswa' && u.class === c.code).length;
    return `
      <tr class="border-b">
        <td class="p-2.5 font-bold">${c.code}</td>
        <td class="p-2.5">Tingkat ${c.level}</td>
        <td class="p-2.5">${c.homeroom || '-'}</td>
        <td class="p-2.5">${studentCount} Siswa</td>
        <td class="p-2.5 text-center space-x-1">
          <button onclick="editClass('${c.code}')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Edit</button>
          <button onclick="deleteClass('${c.code}', ${studentCount})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');
}

function editClass(code) {
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
  const c = classes.find(x => x.code === code);
  if (c) {
    document.getElementById('editClassOldCode').value = c.code;
    document.getElementById('classNameInput').value = c.code;
    document.getElementById('classLevelInput').value = c.level;
    document.getElementById('classHomeroomInput').value = c.homeroom || '';
  }
}

function deleteClass(code, studentCount) {
  if (studentCount > 0) return alert(`Tidak bisa menghapus kelas ${code} karena masih terikat ${studentCount} siswa!`);
  if (confirm(`Hapus kelas ${code}?`)) {
    let classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');
    classes = classes.filter(c => c.code !== code);
    localStorage.setItem('cbt_classes', JSON.stringify(classes));
    renderClassTable();
    populateClassOptions();
  }
}

function handleSaveSubject(e) {
  e.preventDefault();
  const oldCode = document.getElementById('editSubjectOldCode').value;
  const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
  const name = document.getElementById('subjectNameInput').value.trim();

  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  if (!oldCode && subjects.some(s => s.code === code)) return alert('Kode mapel sudah ada!');

  if (oldCode) {
    const idx = subjects.findIndex(s => s.code === oldCode);
    if (idx > -1) subjects[idx] = { code, name };
  } else {
    subjects.push({ code, name });
  }

  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  alert('Mapel disimpan!');
  document.getElementById('editSubjectOldCode').value = '';
  document.getElementById('subjectCodeInput').value = '';
  document.getElementById('subjectNameInput').value = '';
  renderSubjectTable();
}

function renderSubjectTable() {
  const tbody = document.getElementById('subjectTableBody');
  if (!tbody) return;
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');

  tbody.innerHTML = subjects.map(s => `
    <tr class="border-b">
      <td class="p-2.5 font-bold">${s.code}</td>
      <td class="p-2.5">${s.name}</td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="editSubject('${s.code}')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Edit</button>
        <button onclick="deleteSubject('${s.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function editSubject(code) {
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const s = subjects.find(x => x.code === code);
  if (s) {
    document.getElementById('editSubjectOldCode').value = s.code;
    document.getElementById('subjectCodeInput').value = s.code;
    document.getElementById('subjectNameInput').value = s.name;
  }
}

function deleteSubject(code) {
  if (confirm(`Hapus mapel ${code}?`)) {
    let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
    subjects = subjects.filter(s => s.code !== code);
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
  const selects = [document.getElementById('userClass'), document.getElementById('filterUserClass'), document.getElementById('cardClassFilter')];
  
  selects.forEach(s => {
    if (s) {
      const isFilter = s.id.includes('Filter');
      s.innerHTML = (isFilter ? `<option value="">-- Semua Kelas --</option>` : '') + 
        classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
    }
  });
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
  document.getElementById('userNisn').value = '';
  document.getElementById('userFormTitle').innerText = 'Tambah Pengguna Baru';
}

function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const search = (document.getElementById('searchUser')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('filterRole')?.value || '';
  const classFilter = document.getElementById('filterUserClass')?.value || '';

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search) || u.username.toLowerCase().includes(search) || (u.nisn && u.nisn.includes(search));
    const matchRole = !roleFilter || u.role === roleFilter;
    const matchClass = !classFilter || u.class === classFilter;
    return matchSearch && matchRole && matchClass;
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
        <button onclick="editUser('${u.id}')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px]">Edit</button>
        <button onclick="resetUserPassword('${u.id}')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">Reset Pass</button>
        <button onclick="toggleUserActive('${u.id}')" class="bg-slate-600 text-white px-2 py-0.5 rounded text-[10px]">Status</button>
        <button onclick="deleteUser('${u.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function editUser(id) {
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const u = users.find(x => x.id === id);
  if (u) {
    document.getElementById('editUserId').value = u.id;
    document.getElementById('userRole').value = u.role;
    toggleRoleFields();
    document.getElementById('userName').value = u.name;
    document.getElementById('userUsername').value = u.username;
    if (u.role === 'siswa') {
      document.getElementById('userNisn').value = u.nisn || '';
      document.getElementById('userClass').value = u.class || '';
    }
    document.getElementById('userFormTitle').innerText = 'Edit Pengguna';
  }
}

function resetUserPassword(id) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const u = users.find(x => x.id === id);
  if (u) {
    const newPass = prompt(`Reset password sementara untuk ${u.name}:`, '123456');
    if (newPass) {
      u.password = newPass.trim();
      localStorage.setItem('cbt_users', JSON.stringify(users));
      alert(`Password untuk ${u.username} di-reset menjadi: ${newPass}`);
      renderUserTable();
    }
  }
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
  if (teacherSelect) teacherSelect.innerHTML = users.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  const subSelect = document.getElementById('assignSubjectSelect');
  if (subSelect) subSelect.innerHTML = subjects.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');

  const classBox = document.getElementById('assignClassesBox');
  if (classBox) {
    classBox.innerHTML = classes.map(c => `
      <label class="flex items-center text-xs">
        <input type="checkbox" name="assignCls" value="${c.code}" class="mr-2"> Kelas ${c.code}
      </label>
    `).join('');
  }

  renderTeacherAssignmentUI();
}

function addTeacherAssignment() {
  const teacherId = document.getElementById('assignTeacherSelect').value;
  const subjectCode = document.getElementById('assignSubjectSelect').value;
  const selectedClasses = Array.from(document.querySelectorAll('input[name="assignCls"]:checked')).map(cb => cb.value);

  if (!selectedClasses.length) return alert('Pilih minimal satu kelas!');

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const idx = users.findIndex(u => u.id === teacherId);

  if (idx > -1) {
    if (!users[idx].teacherAssignments) users[idx].teacherAssignments = [];
    
    const existing = users[idx].teacherAssignments.find(a => a.subject === subjectCode);
    if (existing) {
      existing.classes = Array.from(new Set([...existing.classes, ...selectedClasses]));
    } else {
      users[idx].teacherAssignments.push({ subject: subjectCode, classes: selectedClasses });
    }

    localStorage.setItem('cbt_users', JSON.stringify(users));
    alert('Penugasan berhasil ditambahkan!');
    renderTeacherAssignmentUI();
  }
}

function renderTeacherAssignmentUI() {
  const tbody = document.getElementById('teacherAssignmentTableBody');
  if (!tbody) return;

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'guru');
  let rows = [];

  users.forEach(g => {
    if (g.teacherAssignments && g.teacherAssignments.length > 0) {
      g.teacherAssignments.forEach((a, aIdx) => {
        rows.push(`
          <tr class="border-b">
            <td class="p-2.5 font-bold">${g.name}</td>
            <td class="p-2.5 font-semibold text-blue-900">${a.subject}</td>
            <td class="p-2.5">${a.classes.join(', ')}</td>
            <td class="p-2.5 text-center">
              <button onclick="removeTeacherAssignment('${g.id}', ${aIdx})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
            </td>
          </tr>
        `);
      });
    }
  });

  tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada penugasan guru.</td></tr>`;
}

function removeTeacherAssignment(teacherId, assignIndex) {
  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const idx = users.findIndex(u => u.id === teacherId);
  if (idx > -1 && users[idx].teacherAssignments) {
    users[idx].teacherAssignments.splice(assignIndex, 1);
    localStorage.setItem('cbt_users', JSON.stringify(users));
    renderTeacherAssignmentUI();
  }
}

function populateCardsTab() {
  populateClassOptions();
  renderExamCards();
}

function renderExamCards() {
  const selectedClass = document.getElementById('cardClassFilter').value;
  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]').filter(u => u.role === 'siswa' && (!selectedClass || u.class === selectedClass));
  const settings = JSON.parse(localStorage.getItem('cbt_settings') || '{}');
  const grid = document.getElementById('examCardsGrid');

  if (!users.length) {
    grid.innerHTML = `<p class="text-xs text-slate-400 p-4">Tidak ada siswa untuk dicetak.</p>`;
    return;
  }

  grid.innerHTML = users.map(u => `
    <div class="border-2 border-slate-800 p-3 rounded-xl bg-white space-y-2 text-xs">
      <div class="text-center border-b pb-1">
        <strong class="uppercase text-[11px] block font-bold text-blue-950">${settings.schoolName || 'SMP Qur\'an Al Wahdah'}</strong>
        <span class="text-[9px] text-slate-500 uppercase font-bold">KARTU PESERTA UJIAN CBT ${settings.academicYear || ''}</span>
      </div>
      <div class="space-y-0.5">
        <div><strong>Nama:</strong> ${u.name}</div>
        <div><strong>NISN / Kelas:</strong> ${u.nisn || '-'} / ${u.class}</div>
        <div><strong>Username:</strong> <code class="font-bold text-blue-900">${u.username}</code></div>
        <div><strong>Password:</strong> <code class="font-bold text-rose-700">${u.password || '123456'}</code></div>
      </div>
    </div>
  `).join('');
}

function renderLogsTable() {
  const tbody = document.getElementById('adminLogsTableBody');
  if (!tbody) return;
  const logs = JSON.parse(localStorage.getItem('cbt_logs') || '[]');

  tbody.innerHTML = logs.map(l => `
    <tr class="border-b">
      <td class="p-2 font-mono text-[10px] text-slate-500">${l.time}</td>
      <td class="p-2 font-bold">${l.user}</td>
      <td class="p-2">${l.event}</td>
    </tr>
  `).join('') || `<tr><td colspan="3" class="p-3 text-center text-slate-400">Belum ada log aktivitas.</td></tr>`;
}

function handleSaveSettings(e) {
  e.preventDefault();
  const settings = {
    schoolName: document.getElementById('settingSchoolName').value.trim(),
    npsn: document.getElementById('settingNPSN').value.trim(),
    academicYear: document.getElementById('settingYear').value.trim(),
    semester: document.getElementById('settingSemester').value
  };

  localStorage.setItem('cbt_settings', JSON.stringify(settings));
  alert('Pengaturan sekolah disimpan!');
  applySettingsToHeader();
}

function backupSystemData() {
  const data = {
    users: JSON.parse(localStorage.getItem('cbt_users') || '[]'),
    classes: JSON.parse(localStorage.getItem('cbt_classes') || '[]'),
    subjects: JSON.parse(localStorage.getItem('cbt_subjects') || '[]'),
    packages: JSON.parse(localStorage.getItem('cbt_packages') || '[]'),
    settings: JSON.parse(localStorage.getItem('cbt_settings') || '{}'),
    schedules: JSON.parse(localStorage.getItem('cbt_schedules') || '[]')
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `CBT_Backup_${Date.now()}.json`;
  a.click();
}

function restoreSystemData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.users) localStorage.setItem('cbt_users', JSON.stringify(data.users));
      if (data.classes) localStorage.setItem('cbt_classes', JSON.stringify(data.classes));
      if (data.subjects) localStorage.setItem('cbt_subjects', JSON.stringify(data.subjects));
      if (data.packages) localStorage.setItem('cbt_packages', JSON.stringify(data.packages));
      if (data.settings) localStorage.setItem('cbt_settings', JSON.stringify(data.settings));
      alert('Database di-restore!');
      location.reload();
    } catch (err) {
      alert('File JSON tidak valid!');
    }
  };
  reader.readAsText(file);
}
