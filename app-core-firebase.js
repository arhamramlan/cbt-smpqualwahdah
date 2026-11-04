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
let isLogoutProcessing = false;

// -------------------------------------------------------------
// INISIALISASI & OBSERVER AUTHENTICATION
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();
  initSettingsListener();
  setupGlobalEvents();
});

function setupGlobalEvents() {
  const logoutBtn = document.getElementById('btnLogoutHeader');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.handleLogout();
    });
  }
}

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
      const savedSession = localStorage.getItem('cbt_session');
      if (savedSession) {
        try {
          currentUserSession = JSON.parse(savedSession);
          renderUserInterface();
        } catch (e) {
          currentUserSession = null;
          localStorage.removeItem('cbt_session');
          renderUserInterface();
        }
      } else {
        currentUserSession = null;
        renderUserInterface();
      }
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
// HELPER FORMAT TANGGAL & LOG AKTIVITAS
// -------------------------------------------------------------

function formatIndonesiaDateTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}.${seconds}`;
}

async function logActivity(eventText) {
  if (!currentUserSession) return;
  try {
    await addDoc(collection(db, "logs"), {
      formattedTime: formatIndonesiaDateTime(Date.now()),
      timestamp: Date.now(),
      user: currentUserSession.name || currentUserSession.username || 'Sistem',
      role: currentUserSession.role || 'system',
      event: eventText
    });
  } catch (e) {
    console.error("Gagal mencatat log:", e);
  }
}

// -------------------------------------------------------------
// FUNGSI LOGIN & LOGOUT
// -------------------------------------------------------------

window.handleLogin = async function(e) {
  if (e && e.preventDefault) e.preventDefault();
  
  const u = document.getElementById('loginUsername')?.value.trim();
  const p = document.getElementById('loginPassword')?.value.trim();

  if (!u || !p) {
    return alert("Silakan isi Username / NISN dan Kata Sandi!");
  }

  const email = u.includes('@') ? u : `${u.toLowerCase()}@cbt.alwahdah.sch.id`;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, p);
    const user = userCredential.user;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.active === false) {
        await signOut(auth);
        return alert("Login Gagal: Akun Anda sedang dinonaktifkan oleh Admin!");
      }

      currentUserSession = {
        uid: user.uid,
        name: data.name || data.username,
        role: data.role || 'siswa',
        ...data
      };
    } else {
      currentUserSession = {
        uid: user.uid,
        name: u,
        username: u,
        role: u.toLowerCase() === 'admin' ? 'admin' : 'guru'
      };
    }

    localStorage.setItem('cbt_session', JSON.stringify(currentUserSession));
    logActivity(`User ${u} (${currentUserSession.role}) berhasil login via Firebase Auth.`);
    renderUserInterface();

  } catch (authErr) {
    console.warn("Firebase Auth tidak cocok, memeriksa verifikasi Firestore Direct...", authErr.message);

    try {
      const q = query(collection(db, "users"), where("username", "==", u.toLowerCase()));
      const snap = await getDocs(q);

      if (snap.empty) {
        return alert("Login Gagal: Username atau Kata Sandi salah!");
      }

      let userData = null;
      let userId = null;

      snap.forEach(d => {
        userData = d.data();
        userId = d.id;
      });

      if (userData.active === false) {
        return alert("Login Gagal: Akun Anda sedang dinonaktifkan oleh Admin!");
      }

      if (userData.password && userData.password !== p) {
        return alert("Login Gagal: Username atau Kata Sandi salah!");
      }

      currentUserSession = {
        uid: userId,
        name: userData.name || userData.username,
        role: userData.role || 'siswa',
        ...userData
      };

      localStorage.setItem('cbt_session', JSON.stringify(currentUserSession));
      logActivity(`User ${u} (${userData.role}) berhasil login.`);
      renderUserInterface();

    } catch (dbErr) {
      alert("Gagal melakukan verifikasi login: " + dbErr.message);
    }
  }
};

window.handleLogout = async function() {
  if (isLogoutProcessing) return;
  if (!confirm("Apakah Anda yakin ingin keluar dari sistem CBT?")) return;

  isLogoutProcessing = true;
  try {
    await logActivity(`Pengguna keluar dari sistem.`);
    localStorage.removeItem('cbt_session');
    currentUserSession = null;
    if (auth) await signOut(auth);
  } catch (err) {
    console.warn("Logout error:", err.message);
  } finally {
    isLogoutProcessing = false;
    location.reload();
  }
};

// -------------------------------------------------------------
// NAVIGASI TAB ADMIN
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

// -------------------------------------------------------------
// MANAJEMEN PENGGUNA (TAMBAH, EDIT, RESET PASSWORD, TEMPLATE EXCEL)
// -------------------------------------------------------------

function generateSecureRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 7; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// FIX 1: FUNGSI UNDUH TEMPLATE EXCEL PENGGUNA
window.downloadUserTemplate = function() {
  if (typeof XLSX === 'undefined') {
    return alert("Pustaka SheetJS (XLSX) belum dimuat. Mohon muat ulang halaman.");
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

window.handleSaveUser = async function(e) {
  e.preventDefault();
  const editId = document.getElementById('editUserId')?.value;
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim().toLowerCase();
  const role = document.getElementById('userRole').value;
  const nisn = document.getElementById('userNisn')?.value.trim() || '';
  const userClass = document.getElementById('userClass')?.value || '';
  const manualPass = document.getElementById('userPassword')?.value.trim();

  if (!name || !username) return alert("Nama Lengkap dan Username wajib diisi!");
  if (role === 'siswa' && !nisn) return alert("NISN wajib diisi untuk siswa!");

  try {
    if (editId) {
      const updatePayload = {
        name,
        role,
        nisn,
        class: userClass,
        updatedAt: Date.now()
      };

      if (manualPass) {
        updatePayload.password = manualPass;
      }

      await updateDoc(doc(db, "users", editId), updatePayload);
      alert(`Data pengguna ${name} berhasil diperbarui!${manualPass ? ' (Password diubah)' : ''}`);
      logActivity(`Memperbarui profil pengguna: ${username}`);
    } else {
      const qUser = query(collection(db, "users"), where("username", "==", username));
      const snapUser = await getDocs(qUser);

      if (!snapUser.empty) {
        return alert(`Username "${username}" sudah digunakan!`);
      }

      const finalPassword = manualPass || generateSecureRandomPassword();
      const newDocRef = doc(collection(db, "users"));
      
      await setDoc(newDocRef, {
        name,
        username,
        role,
        nisn,
        class: userClass,
        password: finalPassword,
        active: true,
        mustChangePassword: true,
        createdAt: Date.now()
      });

      alert(`Pengguna Berhasil Ditambahkan!\n\nNama: ${name}\nUsername: ${username}\nPassword: ${finalPassword}`);
      logActivity(`Menambahkan pengguna baru: ${username} (${role})`);
    }

    window.resetUserForm();
  } catch (err) {
    alert("Gagal menyimpan pengguna: " + err.message);
  }
};

// FUNGSI IMPOR PENGGUNA DARI FILE EXCEL (.XLSX)
window.handleImportUsersExcel = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    return alert("Pustaka SheetJS (XLSX) belum dimuat. Mohon muat ulang halaman.");
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
        return alert("File Excel kosong atau format kolom tidak sesuai!");
      }

      let successCount = 0;
      let failCount = 0;

      for (const row of jsonUsers) {
        const name = row["Nama Lengkap"] ? String(row["Nama Lengkap"]).trim() : "";
        const username = row["Username"] ? String(row["Username"]).trim().toLowerCase() : "";
        const role = row["Role"] ? String(row["Role"]).trim().toLowerCase() : "siswa";
        const nisn = row["NISN"] ? String(row["NISN"]).trim() : "";
        const userClass = row["Kelas"] ? String(row["Kelas"]).trim().toUpperCase() : "";
        const password = row["Password"] ? String(row["Password"]).trim() : "123456";

        if (name && username) {
          // Buat dokumen pengguna baru di koleksi 'users'
          const newDocRef = doc(collection(db, "users"));
          await setDoc(newDocRef, {
            name,
            username,
            role,
            nisn,
            class: userClass,
            password,
            active: true,
            mustChangePassword: true,
            createdAt: Date.now()
          });
          successCount++;
        } else {
          failCount++;
        }
      }

      alert(`Impor Selesai!\n✔ ${successCount} Pengguna Ditambahkan.\n${failCount > 0 ? `✖ ${failCount} Baris Gagal (Nama/Username Kosong).` : ''}`);
      logActivity(`Mengimpor ${successCount} pengguna baru dari file Excel.`);
      e.target.value = '';
    } catch (err) {
      alert("Gagal memproses file Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
};

window.resetPasswordUser = async function(userId, username) {
  if (confirm(`Reset password untuk pengguna ${username}? Kata sandi acak baru akan dibuat.`)) {
    const newTempPassword = generateSecureRandomPassword();
    try {
      await updateDoc(doc(db, "users", userId), { 
        password: newTempPassword,
        mustChangePassword: true,
        updatedAt: Date.now() 
      });

      alert(`Password Berhasil Di-reset!\n\nUsername: ${username}\nPassword Baru Sementara: ${newTempPassword}`);
      logActivity(`Mereset kata sandi pengguna: ${username}`);
    } catch (err) {
      alert("Gagal mereset password: " + err.message);
    }
  }
};

window.editUserDoc = async function(userId) {
  const docSnap = await getDoc(doc(db, "users", userId));
  if (docSnap.exists()) {
    const u = docSnap.data();
    if (document.getElementById('editUserId')) document.getElementById('editUserId').value = userId;
    if (document.getElementById('userName')) document.getElementById('userName').value = u.name || '';
    if (document.getElementById('userUsername')) {
      document.getElementById('userUsername').value = u.username || '';
      document.getElementById('userUsername').disabled = true;
    }
    if (document.getElementById('userRole')) document.getElementById('userRole').value = u.role || 'siswa';
    if (document.getElementById('userNisn')) document.getElementById('userNisn').value = u.nisn || '';
    if (document.getElementById('userClass')) document.getElementById('userClass').value = u.class || '';
    window.toggleRoleFields();
  }
};

window.resetUserForm = function() {
  if (document.getElementById('editUserId')) document.getElementById('editUserId').value = '';
  if (document.getElementById('userName')) document.getElementById('userName').value = '';
  if (document.getElementById('userUsername')) {
    document.getElementById('userUsername').value = '';
    document.getElementById('userUsername').disabled = false;
  }
  if (document.getElementById('userPassword')) document.getElementById('userPassword').value = '';
  if (document.getElementById('userNisn')) document.getElementById('userNisn').value = '';
};

window.toggleRoleFields = function() {
  const role = document.getElementById('userRole')?.value;
  const fieldSiswa = document.getElementById('fieldSiswa');
  if (fieldSiswa) {
    if (role === 'siswa') fieldSiswa.classList.remove('hidden');
    else fieldSiswa.classList.add('hidden');
  }
};

window.toggleUserActive = async function(userId, currentStatus, username) {
  if (username === 'admin') return alert("Akun Admin Utama tidak bisa dinonaktifkan!");

  if (confirm(`Ubah status akun ${username} menjadi ${!currentStatus ? 'Aktif' : 'Nonaktif'}?`)) {
    try {
      await updateDoc(doc(db, "users", userId), { active: !currentStatus });
      logActivity(`Mengubah status akun ${username} menjadi ${!currentStatus ? 'Aktif' : 'Nonaktif'}`);
    } catch (err) {
      alert("Gagal mengubah status: " + err.message);
    }
  }
};

window.deleteUserDoc = async function(userId, username) {
  if (username === 'admin') return alert("Akun Admin Utama tidak bisa dihapus!");

  if (confirm(`Apakah Anda YAKIN ingin menghapus akun ${username} secara permanen?`)) {
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
  if (el) el.type = el.type === "password" ? "text" : "password";
};

// -------------------------------------------------------------
// MASTER KELAS, MAPEL & HITUNG PENGGUNA REAL-TIME
// -------------------------------------------------------------

let cachedUsersList = []; // Menyimpan data pengguna real-time

function listenToMasterData() {
  onSnapshot(collection(db, "users"), (userSnap) => {
    cachedUsersList = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Panggil penyaringan saat data diperbarui dari Firestore
    window.filterUserTableUI();
    
    onSnapshot(collection(db, "classes"), (classSnap) => {
      const classes = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderClassTable(classes, cachedUsersList);
      populateClassOptions(classes);
    });
  });

  onSnapshot(collection(db, "subjects"), (snapshot) => {
    const subjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSubjectTable(subjects);
  });
}

window.filterUserTableUI = function() {
  const searchInput = (document.getElementById('searchUser')?.value || '').toLowerCase().trim();
  const roleFilter = (document.getElementById('filterRole')?.value || '').toLowerCase().trim();
  const classFilter = (document.getElementById('filterUserClass')?.value || '').trim();

  let filtered = cachedUsersList.filter(u => {
    // Match Search Name / Username / NISN
    const nameMatch = (u.name || '').toLowerCase().includes(searchInput);
    const usernameMatch = (u.username || '').toLowerCase().includes(searchInput);
    const nisnMatch = (u.nisn || '').toLowerCase().includes(searchInput);
    const matchesSearch = !searchInput || (nameMatch || usernameMatch || nisnMatch);

    // Match Role (Semua Peran / Admin / Guru / Siswa)
    const matchesRole = !roleFilter || (u.role || '').toLowerCase() === roleFilter;

    // Match Class (Semua Kelas / VII / VIII / IX / VII-A dst.)
    const matchesClass = !classFilter || (u.class || '') === classFilter;

    return matchesSearch && matchesRole && matchesClass;
  });

  renderUserTable(filtered);
};

function renderClassTable(classes, users) {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;

  tbody.innerHTML = classes.length ? classes.map(c => {
    const studentCount = users.filter(u => u.role === 'siswa' && u.class === c.code).length;
    return `
      <tr class="border-b text-xs">
        <td class="p-2.5 font-bold text-blue-900">${c.code}</td>
        <td class="p-2.5">Tingkat ${c.level}</td>
        <td class="p-2.5">${c.homeroom || '-'}</td>
        <td class="p-2.5 font-bold text-slate-700">${studentCount} Siswa</td>
        <td class="p-2.5 text-center space-x-1">
          <button onclick="deleteClass('${c.code}', ${studentCount})" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada kelas.</td></tr>`;
}

window.deleteClass = async function(code, studentCount) {
  if (studentCount > 0) {
    return alert(`Gagal Menghapus: Kelas ${code} masih memiliki ${studentCount} siswa terdaftar!`);
  }
  if (confirm(`Hapus kelas ${code}?`)) {
    await deleteDoc(doc(db, "classes", code));
    logActivity(`Menghapus Master Kelas: ${code}`);
  }
};

window.handleSaveClass = async function(e) {
  e.preventDefault();
  const code = document.getElementById('classNameInput').value.trim().toUpperCase();
  const level = document.getElementById('classLevelInput').value;
  const homeroom = document.getElementById('classHomeroomInput').value.trim() || '-';

  if (!code) return alert("Kode kelas wajib diisi!");

  try {
    await setDoc(doc(db, "classes", code), { code, level, homeroom, updatedAt: Date.now() });
    alert(`Kelas ${code} berhasil disimpan!`);
    document.getElementById('classNameInput').value = '';
    document.getElementById('classHomeroomInput').value = '';
    logActivity(`Menyimpan Master Kelas: ${code}`);
  } catch (err) {
    alert("Gagal menyimpan kelas: " + err.message);
  }
};

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

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  tbody.innerHTML = users.length ? users.map((u, i) => {
    const isAdmin = u.username === 'admin';
    const passInputId = `userPass_${i}`;
    const userPass = u.password || '******';

    return `
      <tr class="border-b text-xs">
        <td class="p-2.5">
          <strong class="text-slate-800 block">${u.name || u.username}</strong>
          <span class="text-[10px] text-slate-500">Username: <code class="font-bold text-blue-900">${u.username}</code> ${u.nisn ? `| NISN: ${u.nisn}` : ''}</span>
          <div class="flex items-center gap-1 mt-1">
            <span class="text-[10px] text-slate-400">Pass:</span>
            <input type="password" id="${passInputId}" value="${userPass}" readonly class="bg-slate-100 border px-1 py-0.5 rounded text-[10px] w-20 font-mono outline-none">
            <button onclick="togglePasswordVisibility('${passInputId}')" title="Lihat Password" class="text-slate-500 hover:text-blue-800 text-[11px] px-1">
              <i class="fa-solid fa-eye"></i>
            </button>
          </div>
        </td>
        <td class="p-2.5">
          <span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role}</span>
          ${u.class ? `<span class="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] ml-1 font-semibold">${u.class}</span>` : ''}
        </td>
        <td class="p-2.5">
          <button onclick="toggleUserActive('${u.id}', ${u.active !== false}, '${u.username}')" ${isAdmin ? 'disabled' : ''} class="px-2 py-0.5 rounded text-[10px] font-bold ${u.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${u.active !== false ? '● Aktif' : '○ Nonaktif'}
          </button>
        </td>
        <td class="p-2.5 text-center space-x-1">
          ${isAdmin ? `<span class="text-[10px] text-slate-400 italic">Terproteksi</span>` : `
            <button onclick="editUserDoc('${u.id}')" class="bg-amber-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Edit</button>
            <button onclick="resetPasswordUser('${u.id}', '${u.username}')" class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Reset Pass</button>
            <button onclick="deleteUserDoc('${u.id}', '${u.username}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
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
      s.innerHTML = (s.id === 'filterUserClass' || s.id === 'cardClassFilter' ? `<option value="">Semua Kelas</option>` : '') + 
        classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
    }
  });
}

// -------------------------------------------------------------
// PENUGASAN GURU
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
  const s = settingsDoc.exists() ? settingsDoc.data() : {};

  if (!students.length) {
    grid.innerHTML = `<p class="text-xs text-slate-400 p-4">Tidak ada kartu peserta siswa untuk kelas ini.</p>`;
    return;
  }

  grid.innerHTML = students.map(st => `
    <div class="border-2 border-slate-800 p-3 rounded-xl bg-white space-y-2 text-xs relative">
      <div class="text-center border-b pb-1">
        <strong class="uppercase text-[11px] block font-bold text-blue-950">${s.schoolName || 'SMP QUR\'AN AL WAHDAH'}</strong>
        <span class="text-[9px] text-slate-500 uppercase font-bold">KARTU PESERTA UJIAN CBT T.A ${s.academicYear || '2026/2027'} (${s.semester || 'GANJIL'})</span>
      </div>
      <div class="space-y-1 text-[11px]">
        <div><strong>Nama:</strong> ${st.name || st.username}</div>
        <div><strong>NISN / Kelas:</strong> ${st.nisn || '-'} / ${st.class || '-'}</div>
        <div><strong>Username:</strong> <code class="font-bold text-blue-900">${st.username}</code></div>
        <div><strong>Password:</strong> <code class="font-bold text-rose-700">${st.password || '******'}</code></div>
      </div>
      <div class="border-t pt-1 text-[9px] text-slate-400 text-center font-bold uppercase">
        Harap Jaga Kerahasiaan Kartu Ujian Ini
      </div>
    </div>
  `).join('');
};

// -------------------------------------------------------------
// LOG AKTIVITAS & PENGATURAN SYSTEM
// -------------------------------------------------------------

function listenToLogs() {
  onSnapshot(collection(db, "logs"), (snapshot) => {
    const logs = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
    const tbody = document.getElementById('adminLogsTableBody');
    if (!tbody) return;

    tbody.innerHTML = logs.length ? logs.map(l => `
      <tr class="border-b text-xs">
        <td class="p-2 font-mono text-[10px] text-slate-500">${l.formattedTime || formatIndonesiaDateTime(l.timestamp)}</td>
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
    semester: document.getElementById('settingSemester').value,
    updatedAt: Date.now()
  };

  try {
    await setDoc(doc(db, "settings", "academic"), settingsData);
    alert("Pengaturan sekolah berhasil disimpan!");
    logActivity(`Memperbarui pengaturan sekolah`);
  } catch (err) {
    alert("Gagal menyimpan pengaturan: " + err.message);
  }
};

function initSettingsListener() {
  onSnapshot(doc(db, "settings", "academic"), (docSnap) => {
    if (docSnap.exists()) {
      const s = docSnap.data();
      if (document.getElementById('headerSchoolName')) document.getElementById('headerSchoolName').innerText = s.schoolName || "SMP Qur'an Al Wahdah";
      if (document.getElementById('headerSubTitle')) document.getElementById('headerSubTitle').innerText = `Sistem CBT - Tahun Ajaran ${s.academicYear || '2026/2027'} (${s.semester || 'Ganjil'})`;
    }
  });
}

// FIX 2: FUNGSI EKSPOR (BACKUP) DATABASE KE FILE .JSON
window.exportDatabaseJson = async function() {
  try {
    const collectionsToBackup = ["users", "classes", "subjects", "packages", "schedules", "settings"];
    const backupData = {
      backupTimestamp: Date.now(),
      backupDate: formatIndonesiaDateTime(Date.now()),
      data: {}
    };

    for (const colName of collectionsToBackup) {
      const snap = await getDocs(collection(db, colName));
      backupData.data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Backup_CBT_Database_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    logActivity("Melakukan Backup Database ke file JSON.");
    alert("Backup Database Berhasil Diunduh!");
  } catch (err) {
    alert("Gagal melakukan backup database: " + err.message);
  }
};

// FIX 3: FUNGSI IMPOR (RESTORE) DATABASE DARI FILE .JSON
window.importDatabaseJson = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("PERINGATAN: Memulihkan database akan menimpa/menambahkan data di Firestore. Apakah Anda yakin ingin melanjutkan?")) {
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const backupObj = JSON.parse(evt.target.result);
      if (!backupObj.data) {
        return alert("Format file backup JSON tidak valid!");
      }

      let countSuccess = 0;
      for (const colName in backupObj.data) {
        const items = backupObj.data[colName];
        if (Array.isArray(items)) {
          for (const item of items) {
            const docId = item.id;
            const dataToSave = { ...item };
            delete dataToSave.id;

            if (docId) {
              await setDoc(doc(db, colName, docId), dataToSave);
            } else {
              await addDoc(collection(db, colName), dataToSave);
            }
            countSuccess++;
          }
        }
      }

      alert(`Restore Database Selesai!\n✔ ${countSuccess} dokumen berhasil dipulihkan ke Firestore.`);
      logActivity(`Memulihkan Database dari file JSON (${countSuccess} dokumen).`);
      e.target.value = '';
      location.reload();

    } catch (err) {
      alert("Gagal memulihkan database: " + err.message);
    }
  };

  reader.readAsText(file);
};
