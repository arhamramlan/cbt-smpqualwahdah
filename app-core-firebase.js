// app-core-firebase.js
import { 
  db, 
  auth, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from './firebase-config.js';

let currentUserSession = null;

document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();
  initSettingsListener();
});

function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          currentUserSession = { 
            uid: user.uid, 
            name: data.name || data.username || 'Admin Utama',
            role: data.role || 'admin',
            ...data 
          };
        } else {
          currentUserSession = { uid: user.uid, name: 'Admin Utama', role: 'admin', username: 'admin' };
        }
      } catch (e) {
        currentUserSession = { uid: user.uid, name: 'Admin Utama', role: 'admin', username: 'admin' };
      }
      localStorage.setItem('cbt_session', JSON.stringify(currentUserSession));
      renderUserInterface();
    } else {
      currentUserSession = null;
      localStorage.removeItem('cbt_session');
      renderUserInterface();
    }
  });
}

function renderUserInterface() {
  ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudent', 'navUserArea'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  if (!currentUserSession) {
    document.getElementById('viewLogin')?.classList.remove('hidden');
    return;
  }

  document.getElementById('navUserArea')?.classList.remove('hidden');
  const navInfo = document.getElementById('navUserInfo');
  if (navInfo) navInfo.innerText = `${currentUserSession.name} (${currentUserSession.role.toUpperCase()})`;

  if (currentUserSession.role === 'admin') {
    document.getElementById('viewAdmin')?.classList.remove('hidden');
    listenToMasterData();
  } else if (currentUserSession.role === 'guru') {
    document.getElementById('viewTeacher')?.classList.remove('hidden');
    if (window.initTeacherFirebaseDashboard) window.initTeacherFirebaseDashboard(currentUserSession);
  } else if (currentUserSession.role === 'siswa') {
    document.getElementById('viewStudent')?.classList.remove('hidden');
  }
}

// -------------------------------------------------------------
// NAVIGASI TAB ADMIN & AUTH
// -------------------------------------------------------------

window.switchAdminTab = function(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.admin-tab-btn').forEach(el => el.classList.remove('active-tab'));

  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');
  
  const btnMap = {
    'adminTabUsers': 'btnAdminUsers',
    'adminTabClasses': 'btnAdminClasses',
    'adminTabSubjects': 'btnAdminSubjects',
    'adminTabAssign': 'btnAdminAssign',
    'adminTabCards': 'btnAdminCards',
    'adminTabLogs': 'btnAdminLogs',
    'adminTabSettings': 'btnAdminSettings'
  };

  if (btnMap[tabId] && document.getElementById(btnMap[tabId])) {
    document.getElementById(btnMap[tabId]).classList.add('active-tab');
  }

  if (tabId === 'adminTabAssign') window.populateAssignTab();
  if (tabId === 'adminTabCards') window.renderExamCards();
  if (tabId === 'adminTabLogs') listenToLogs();
  if (tabId === 'adminTabSettings') loadSettingsForm();
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  try {
    const email = u.includes('@') ? u : `${u}@cbt.alwahdah.sch.id`;
    await signInWithEmailAndPassword(auth, email, p);
    logActivity(`User ${u} berhasil login.`);
  } catch (err) {
    alert("Login Gagal: " + err.message);
  }
};

window.handleLogout = async function() {
  await logActivity(`User logout.`);
  await signOut(auth);
  location.reload();
};

// -------------------------------------------------------------
// MANAJEMEN PENGGUNA (USERS)
// -------------------------------------------------------------

window.handleSaveUser = async function(e) {
  e.preventDefault();
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const role = document.getElementById('userRole').value;
  const nisn = document.getElementById('userNisn')?.value.trim() || '';
  const userClass = document.getElementById('userClass')?.value || '';
  const password = document.getElementById('userPassword')?.value.trim() || '123456';

  if (!name || !username) return alert("Nama dan Username wajib diisi!");

  try {
    const newDocRef = doc(collection(db, "users"));
    await setDoc(newDocRef, {
      name,
      username,
      role,
      nisn,
      class: userClass,
      password,
      active: true,
      createdAt: Date.now()
    });
    alert("Pengguna berhasil ditambahkan!");
    window.resetUserForm();
    logActivity(`Menambahkan pengguna baru: ${name} (${role})`);
  } catch (err) {
    alert("Gagal menyimpan pengguna: " + err.message);
  }
};

window.resetUserForm = function() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  if (document.getElementById('userNisn')) document.getElementById('userNisn').value = '';
};

window.toggleRoleFields = function() {
  const role = document.getElementById('userRole').value;
  const fieldSiswa = document.getElementById('fieldSiswa');
  if (fieldSiswa) {
    if (role === 'siswa') fieldSiswa.classList.remove('hidden');
    else fieldSiswa.classList.add('hidden');
  }
};

window.generateAutoPassword = function() {
  document.getElementById('userPassword').value = Math.random().toString(36).substring(2, 8);
};

window.toggleUserActive = async function(userId, currentStatus, username) {
  if (username === 'admin') {
    return alert("Akun Admin Utama tidak bisa dinonaktifkan!");
  }

  try {
    const newStatus = !currentStatus;
    await updateDoc(doc(db, "users", userId), { active: newStatus });
    alert(`Status akun ${username} diubah menjadi: ${newStatus ? 'Aktif' : 'Nonaktif'}`);
    logActivity(`Mengubah status pengguna ${username} menjadi ${newStatus ? 'Aktif' : 'Nonaktif'}`);
  } catch (err) {
    alert("Gagal mengubah status: " + err.message);
  }
};

window.deleteUserDoc = async function(userId, username) {
  if (username === 'admin') {
    return alert("Akun Admin Utama tidak bisa dihapus!");
  }

  if (confirm(`Apakah Anda yakin ingin menghapus akun ${username} secara permanen?`)) {
    try {
      await deleteDoc(doc(db, "users", userId));
      alert(`Akun ${username} berhasil dihapus.`);
      logActivity(`Menghapus akun pengguna: ${username}`);
    } catch (err) {
      alert("Gagal menghapus pengguna: " + err.message);
    }
  }
};

window.togglePasswordVisibility = function(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.type = el.type === "password" ? "text" : "password";
  }
};

// -------------------------------------------------------------
// IMPOR & TEMPLATE EXCEL PENGGUNA
// -------------------------------------------------------------

window.downloadUserTemplate = function() {
  if (typeof XLSX === 'undefined') {
    return alert("Pustaka SheetJS (XLSX) belum dimuat.");
  }

  const templateData = [
    {
      "Nama Lengkap": "Ahmad Abdullah",
      "Username": "ahmad01",
      "Role": "siswa",
      "NISN": "0012345678",
      "Kelas": "VII",
      "Password": "123"
    },
    {
      "Nama Lengkap": "Arham Ramlan",
      "Username": "arham",
      "Role": "guru",
      "NISN": "",
      "Kelas": "",
      "Password": "guru123"
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template Pengguna");

  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 12 },
    { wch: 15 },
    { wch: 10 },
    { wch: 15 }
  ];

  XLSX.writeFile(workbook, "Template_Import_Pengguna_CBT.xlsx");
};

window.handleImportUsersExcel = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    return alert("Pustaka SheetJS (XLSX) belum dimuat.");
  }

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonUsers = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonUsers || jsonUsers.length === 0) {
        return alert("File Excel kosong atau format tidak sesuai!");
      }

      let successCount = 0;
      let failCount = 0;

      for (const row of jsonUsers) {
        const name = row["Nama Lengkap"] ? String(row["Nama Lengkap"]).trim() : "";
        const username = row["Username"] ? String(row["Username"]).trim() : "";
        const role = row["Role"] ? String(row["Role"]).trim().toLowerCase() : "siswa";
        const nisn = row["NISN"] ? String(row["NISN"]).trim() : "";
        const userClass = row["Kelas"] ? String(row["Kelas"]).trim().toUpperCase() : "";
        const password = row["Password"] ? String(row["Password"]).trim() : "123456";

        if (name && username) {
          const newDocRef = doc(collection(db, "users"));
          await setDoc(newDocRef, {
            name,
            username,
            role,
            nisn,
            class: userClass,
            password,
            active: true,
            createdAt: Date.now()
          });
          successCount++;
        } else {
          failCount++;
        }
      }

      alert(`Impor Selesai!\n✔ ${successCount} Pengguna Ditambahkan.\n${failCount > 0 ? `✖ ${failCount} Baris Gagal.` : ''}`);
      e.target.value = '';
    } catch (err) {
      alert("Gagal memproses file Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
};

window.filterUserTableUI = function() {
  const search = (document.getElementById('searchUser')?.value || '').toLowerCase();
  const roleFilter = document.getElementById('filterRole')?.value || '';
  const classFilter = document.getElementById('filterUserClass')?.value || '';

  const rows = document.querySelectorAll('#userTableBody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    const matchesSearch = text.includes(search);
    const matchesRole = !roleFilter || text.includes(roleFilter);
    const matchesClass = !classFilter || text.includes(classFilter.toLowerCase());

    row.style.display = (matchesSearch && matchesRole && matchesClass) ? '' : 'none';
  });
};

// -------------------------------------------------------------
// MASTER KELAS & MAPEL FIRESTORE
// -------------------------------------------------------------

window.handleSaveClass = async function(e) {
  e.preventDefault();
  const code = document.getElementById('classNameInput').value.trim().toUpperCase();
  const level = document.getElementById('classLevelInput').value;
  const homeroom = document.getElementById('classHomeroomInput').value.trim() || '-';

  if (!code) return alert("Kode kelas wajib diisi!");

  try {
    await setDoc(doc(db, "classes", code), {
      code,
      level,
      homeroom,
      updatedAt: Date.now()
    });
    alert(`Kelas ${code} berhasil disimpan!`);
    document.getElementById('classNameInput').value = '';
    document.getElementById('classHomeroomInput').value = '';
    logActivity(`Menyimpan Master Kelas: ${code}`);
  } catch (err) {
    alert("Gagal menyimpan kelas: " + err.message);
  }
};

window.deleteClass = async function(code) {
  if (confirm(`Hapus kelas ${code}?`)) {
    await deleteDoc(doc(db, "classes", code));
    logActivity(`Menghapus Master Kelas: ${code}`);
  }
};

window.handleSaveSubject = async function(e) {
  e.preventDefault();
  const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
  const name = document.getElementById('subjectNameInput').value.trim();

  if (!code || !name) return alert("Kode dan nama mapel wajib diisi!");

  try {
    await setDoc(doc(db, "subjects", code), { code, name, updatedAt: Date.now() });
    alert(`Mapel ${name} berhasil disimpan!`);
    document.getElementById('subjectCodeInput').value = '';
    document.getElementById('subjectNameInput').value = '';
    logActivity(`Menyimpan Master Mapel: ${name}`);
  } catch (err) {
    alert("Gagal menyimpan mapel: " + err.message);
  }
};

window.deleteSubject = async function(code) {
  if (confirm(`Hapus mapel ${code}?`)) {
    await deleteDoc(doc(db, "subjects", code));
    logActivity(`Menghapus Master Mapel: ${code}`);
  }
};

// -------------------------------------------------------------
// MODUL PENUGASAN GURU
// -------------------------------------------------------------

window.populateAssignTab = async function() {
  try {
    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "guru")));
    const teachers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const teacherSelect = document.getElementById('assignTeacherSelect');
    if (teacherSelect) {
      teacherSelect.innerHTML = teachers.length 
        ? teachers.map(g => `<option value="${g.id}">${g.name || g.username}</option>`).join('')
        : `<option value="">-- Belum Ada Guru --</option>`;
    }

    const subjectsSnap = await getDocs(collection(db, "subjects"));
    const subjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const subSelect = document.getElementById('assignSubjectSelect');
    if (subSelect) {
      subSelect.innerHTML = subjects.length 
        ? subjects.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')
        : `<option value="">-- Belum Ada Mapel --</option>`;
    }

    const classesSnap = await getDocs(collection(db, "classes"));
    const classes = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const classBox = document.getElementById('assignClassesBox');
    if (classBox) {
      classBox.innerHTML = classes.length 
        ? classes.map(c => `
          <label class="flex items-center text-xs space-x-2 py-0.5">
            <input type="checkbox" name="assignCls" value="${c.code}" class="rounded border-slate-300">
            <span>Kelas ${c.code}</span>
          </label>
        `).join('')
        : `<p class="text-xs text-slate-400">Belum ada kelas.</p>`;
    }

    window.renderTeacherAssignmentUI();
  } catch (err) {
    console.error("Gagal memuat form penugasan:", err);
  }
};

window.addTeacherAssignment = async function() {
  const teacherId = document.getElementById('assignTeacherSelect')?.value;
  const subjectCode = document.getElementById('assignSubjectSelect')?.value;
  const selectedClasses = Array.from(document.querySelectorAll('input[name="assignCls"]:checked')).map(cb => cb.value);

  if (!teacherId || !subjectCode || !selectedClasses.length) return alert('Lengkapi pilihan Guru, Mapel, dan Kelas!');

  try {
    const teacherRef = doc(db, "users", teacherId);
    const teacherSnap = await getDoc(teacherRef);

    if (teacherSnap.exists()) {
      let assignments = teacherSnap.data().teacherAssignments || [];
      const existingIndex = assignments.findIndex(a => a.subject === subjectCode);

      if (existingIndex > -1) {
        assignments[existingIndex].classes = Array.from(new Set([...assignments[existingIndex].classes, ...selectedClasses]));
      } else {
        assignments.push({ subject: subjectCode, classes: selectedClasses });
      }

      await updateDoc(teacherRef, { teacherAssignments: assignments });
      alert("Penugasan guru berhasil disimpan!");
      logActivity(`Memperbarui penugasan guru: ${teacherSnap.data().name}`);
      window.renderTeacherAssignmentUI();
    }
  } catch (err) {
    alert("Gagal menyimpan penugasan: " + err.message);
  }
};

window.renderTeacherAssignmentUI = async function() {
  const tbody = document.getElementById('teacherAssignmentTableBody');
  if (!tbody) return;

  try {
    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "guru")));
    const teachers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    let rows = [];

    teachers.forEach(g => {
      if (g.teacherAssignments && g.teacherAssignments.length > 0) {
        g.teacherAssignments.forEach((a, aIdx) => {
          rows.push(`
            <tr class="border-b text-xs">
              <td class="p-2.5 font-bold text-slate-800">${g.name || g.username}</td>
              <td class="p-2.5 font-semibold text-blue-900">${a.subject}</td>
              <td class="p-2.5">${a.classes ? a.classes.join(', ') : '-'}</td>
              <td class="p-2.5 text-center">
                <button onclick="removeTeacherAssignment('${g.id}', ${aIdx})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
              </td>
            </tr>
          `);
        });
      }
    });

    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada penugasan guru.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
};

window.removeTeacherAssignment = async function(teacherId, assignIndex) {
  if (confirm("Hapus penugasan ini?")) {
    const teacherRef = doc(db, "users", teacherId);
    const teacherSnap = await getDoc(teacherRef);
    if (teacherSnap.exists()) {
      let assignments = teacherSnap.data().teacherAssignments || [];
      assignments.splice(assignIndex, 1);
      await updateDoc(teacherRef, { teacherAssignments: assignments });
      window.renderTeacherAssignmentUI();
    }
  }
};

// -------------------------------------------------------------
// CETAK KARTU UJIAN
// -------------------------------------------------------------

window.renderExamCards = async function() {
  const grid = document.getElementById('examCardsGrid');
  if (!grid) return;

  const selectedClass = document.getElementById('cardClassFilter')?.value || '';
  const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
  const students = usersSnap.docs.map(d => d.data()).filter(s => !selectedClass || s.class === selectedClass);

  const settingsDoc = await getDoc(doc(db, "settings", "academic"));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};

  if (!students.length) {
    grid.innerHTML = `<p class="text-xs text-slate-400 p-4">Tidak ada kartu peserta siswa untuk ditampilkan.</p>`;
    return;
  }

  grid.innerHTML = students.map(s => `
    <div class="border-2 border-slate-800 p-3 rounded-xl bg-white space-y-2 text-xs">
      <div class="text-center border-b pb-1">
        <strong class="uppercase text-[11px] block font-bold text-blue-950">${settings.schoolName || 'SMP Qur\'an Al Wahdah'}</strong>
        <span class="text-[9px] text-slate-500 uppercase font-bold">KARTU PESERTA UJIAN CBT ${settings.academicYear || '2026/2027'}</span>
      </div>
      <div class="space-y-0.5">
        <div><strong>Nama:</strong> ${s.name || s.username}</div>
        <div><strong>NISN / Kelas:</strong> ${s.nisn || '-'} / ${s.class || '-'}</div>
        <div><strong>Username:</strong> <code class="font-bold text-blue-900">${s.username}</code></div>
        <div><strong>Password:</strong> <code class="font-bold text-rose-700">${s.password || '123456'}</code></div>
      </div>
    </div>
  `).join('');
};

// -------------------------------------------------------------
// LOG AKTIVITAS & PENGATURAN SYSTEM
// -------------------------------------------------------------

async function logActivity(eventText) {
  if (!currentUserSession) return;
  try {
    await addDoc(collection(db, "logs"), {
      time: new Date().toLocaleString('id-ID'),
      timestamp: Date.now(),
      user: currentUserSession.name || 'System',
      event: eventText
    });
  } catch (e) { console.error(e); }
}

function listenToLogs() {
  onSnapshot(collection(db, "logs"), (snapshot) => {
    const logs = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
    const tbody = document.getElementById('adminLogsTableBody');
    if (!tbody) return;

    tbody.innerHTML = logs.length ? logs.map(l => `
      <tr class="border-b text-xs">
        <td class="p-2 font-mono text-[10px] text-slate-500">${l.time}</td>
        <td class="p-2 font-bold">${l.user}</td>
        <td class="p-2">${l.event}</td>
      </tr>
    `).join('') : `<tr><td colspan="3" class="p-4 text-center text-slate-400">Belum ada log aktivitas.</td></tr>`;
  });
}

async function loadSettingsForm() {
  const settingsDoc = await getDoc(doc(db, "settings", "academic"));
  if (settingsDoc.exists()) {
    const s = settingsDoc.data();
    if (document.getElementById('settingSchoolName')) document.getElementById('settingSchoolName').value = s.schoolName || '';
    if (document.getElementById('settingNPSN')) document.getElementById('settingNPSN').value = s.npsn || '';
    if (document.getElementById('settingYear')) document.getElementById('settingYear').value = s.academicYear || '2026/2027';
    if (document.getElementById('settingSemester')) document.getElementById('settingSemester').value = s.semester || 'Ganjil';
  }
}

window.handleSaveSettings = async function(e) {
  e.preventDefault();
  const settingsData = {
    schoolName: document.getElementById('settingSchoolName').value.trim(),
    npsn: document.getElementById('settingNPSN').value.trim(),
    academicYear: document.getElementById('settingYear').value.trim(),
    semester: document.getElementById('settingSemester').value
  };

  try {
    await setDoc(doc(db, "settings", "academic"), settingsData);
    alert("Pengaturan sekolah berhasil disimpan!");
    logActivity(`Memperbarui pengaturan sekolah`);
  } catch (err) {
    alert("Gagal menyimpan pengaturan: " + err.message);
  }
};

// -------------------------------------------------------------
// LISTENERS REAL-TIME MASTER DATA
// -------------------------------------------------------------

function listenToMasterData() {
  onSnapshot(collection(db, "classes"), (snapshot) => {
    const classes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClassTable(classes);
    populateClassOptions(classes);
  });

  onSnapshot(collection(db, "subjects"), (snapshot) => {
    const subjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSubjectTable(subjects);
  });

  onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUserTable(users);
  });
}

function renderClassTable(classes) {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;

  tbody.innerHTML = classes.length ? classes.map(c => `
    <tr class="border-b text-xs">
      <td class="p-2.5 font-bold text-blue-900">${c.code}</td>
      <td class="p-2.5">Tingkat ${c.level}</td>
      <td class="p-2.5">${c.homeroom || '-'}</td>
      <td class="p-2.5">-</td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="deleteClass('${c.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada kelas.</td></tr>`;
}

function renderSubjectTable(subjects) {
  const tbody = document.getElementById('subjectTableBody');
  if (!tbody) return;

  tbody.innerHTML = subjects.length ? subjects.map(s => `
    <tr class="border-b text-xs">
      <td class="p-2.5 font-bold">${s.code}</td>
      <td class="p-2.5">${s.name}</td>
      <td class="p-2.5 text-center">
        <button onclick="deleteSubject('${s.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="3" class="p-4 text-center text-slate-400">Belum ada mapel.</td></tr>`;
}

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  tbody.innerHTML = users.length ? users.map((u, i) => {
    const isAdminMain = u.username === 'admin';
    const passInputId = `userPass_${i}`;
    const userPass = u.password || '123456';

    return `
      <tr class="border-b text-xs">
        <td class="p-2.5">
          <strong class="text-slate-800 block">${u.name || u.username}</strong>
          <span class="text-[10px] text-slate-500">Username: <code class="font-bold text-blue-900">${u.username}</code></span>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-[10px] text-slate-400">Pass:</span>
            <input type="password" id="${passInputId}" value="${userPass}" readonly class="bg-slate-100 border px-1 py-0.5 rounded text-[10px] w-20 font-mono outline-none">
            <button onclick="togglePasswordVisibility('${passInputId}')" title="Lihat Password" class="text-slate-500 hover:text-blue-800 text-[11px] px-1">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </td>

        <td class="p-2.5">
          <span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role || 'siswa'}</span>
          ${u.class ? `<span class="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] ml-1 font-semibold">${u.class}</span>` : ''}
        </td>

        <td class="p-2.5">
          <button 
            onclick="toggleUserActive('${u.id}', ${u.active !== false}, '${u.username}')" 
            class="px-2 py-0.5 rounded text-[10px] font-bold transition ${u.active !== false ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-rose-100 text-rose-800 hover:bg-rose-200'}"
            ${isAdminMain ? 'disabled title="Admin utama selalu aktif"' : ''}>
            ${u.active !== false ? '● Aktif' : '○ Nonaktif'}
          </button>
        </td>

        <td class="p-2.5 text-center">
          ${isAdminMain ? `
            <span class="text-[10px] text-slate-400 font-bold italic">Terproteksi</span>
          ` : `
            <button onclick="deleteUserDoc('${u.id}', '${u.username}')" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded text-[10px] font-bold transition">
              Hapus
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada pengguna.</td></tr>`;
}

function populateClassOptions(classes) {
  const selects = [document.getElementById('userClass'), document.getElementById('filterUserClass'), document.getElementById('cardClassFilter')];
  selects.forEach(s => {
    if (s) {
      s.innerHTML = classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
    }
  });
}

function initSettingsListener() {
  onSnapshot(doc(db, "settings", "academic"), (docSnap) => {
    if (docSnap.exists()) {
      const s = docSnap.data();
      if (document.getElementById('headerSchoolName')) document.getElementById('headerSchoolName').innerText = s.schoolName || "SMP Qur'an Al Wahdah";
      if (document.getElementById('headerSubTitle')) document.getElementById('headerSubTitle').innerText = `CBT System - Tahun Ajaran ${s.academicYear || '2026/2027'} (${s.semester || 'Ganjil'})`;
    }
  });
}
