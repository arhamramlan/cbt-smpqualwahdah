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
    renderAdminSummary();
  } else if (currentUserSession.role === 'guru') {
    document.getElementById('viewTeacher')?.classList.remove('hidden');
    if (window.initTeacherFirebaseDashboard) window.initTeacherFirebaseDashboard(currentUserSession);
  } else if (currentUserSession.role === 'siswa') {
    document.getElementById('viewStudent')?.classList.remove('hidden');
  }
}

// -------------------------------------------------------------
// HELPER FORMAT TANGGAL & LOG AKTIVITAS (DEDUPLIKASI LOG)
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

window.handleLogout = async function() {
  if (isLogoutProcessing) return;
  if (!confirm("Apakah Anda yakin ingin keluar dari sistem CBT?")) return;

  isLogoutProcessing = true;
  try {
    await logActivity(`Pengguna keluar dari sistem.`);
    localStorage.removeItem('cbt_session');
    currentUserSession = null;
    await signOut(auth);
  } catch (err) {
    console.warn("Logout error:", err.message);
  } finally {
    isLogoutProcessing = false;
    location.reload();
  }
};

// -------------------------------------------------------------
// MANAJEMEN PENGGUNA (TAMBAH, EDIT, RESET PASSWORD, HAPUS)
// -------------------------------------------------------------

function generateSecureRandomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 7; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

window.handleSaveUser = async function(e) {
  e.preventDefault();
  const editId = document.getElementById('editUserId')?.value;
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim().toLowerCase();
  const role = document.getElementById('userRole').value;
  const nisn = document.getElementById('userNisn')?.value.trim() || '';
  const userClass = document.getElementById('userClass')?.value || '';

  if (!name || !username) return alert("Nama Lengkap dan Username wajib diisi!");
  if (role === 'siswa' && !nisn) return alert("NISN wajib diisi untuk siswa!");

  try {
    // Validasi Duplikat Username
    const qUser = query(collection(db, "users"), where("username", "==", username));
    const snapUser = await getDocs(qUser);
    if (!editId && !snapUser.empty) {
      return alert(`Username "${username}" sudah digunakan oleh akun lain!`);
    }

    if (editId) {
      // Edit Pengguna
      await updateDoc(doc(db, "users", editId), {
        name,
        role,
        nisn,
        class: userClass,
        updatedAt: Date.now()
      });
      alert(`Data pengguna ${name} berhasil diperbarui!`);
      logActivity(`Memperbarui profil pengguna: ${username}`);
    } else {
      // Tambah Pengguna Baru + Buat Password Acak
      const tempPassword = generateSecureRandomPassword();
      const newDocRef = doc(collection(db, "users"));
      
      await setDoc(newDocRef, {
        name,
        username,
        role,
        nisn,
        class: userClass,
        active: true,
        mustChangePassword: true,
        createdAt: Date.now()
      });

      alert(`Pengguna Baru Berhasil Ditambahkan!\n\nNama: ${name}\nUsername: ${username}\nPassword Sementara: ${tempPassword}\n\n*Catat kata sandi ini karena tidak akan ditampilkan lagi demi keamanan.*`);
      logActivity(`Menambahkan pengguna baru: ${username} (${role})`);
    }

    window.resetUserForm();
  } catch (err) {
    alert("Gagal menyimpan pengguna: " + err.message);
  }
};

window.resetPasswordUser = async function(userId, username) {
  if (confirm(`Reset password untuk pengguna ${username}? Kata sandi acak baru akan dibuat.`)) {
    const newTempPassword = generateSecureRandomPassword();
    try {
      await updateDoc(doc(db, "users", userId), { 
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
    document.getElementById('editUserId').value = userId;
    document.getElementById('userName').value = u.name || '';
    document.getElementById('userUsername').value = u.username || '';
    document.getElementById('userUsername').disabled = true; // Username tidak boleh diubah
    document.getElementById('userRole').value = u.role || 'siswa';
    if (document.getElementById('userNisn')) document.getElementById('userNisn').value = u.nisn || '';
    if (document.getElementById('userClass')) document.getElementById('userClass').value = u.class || '';
    window.toggleRoleFields();
  }
};

window.resetUserForm = function() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userUsername').disabled = false;
  if (document.getElementById('userNisn')) document.getElementById('userNisn').value = '';
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

// -------------------------------------------------------------
// MASTER KELAS, MAPEL & HITUNG PENGGUNA REAL-TIME
// -------------------------------------------------------------

function listenToMasterData() {
  onSnapshot(collection(db, "users"), (userSnap) => {
    const users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUserTable(users);
    
    // Hitung Jumlah Siswa per Kelas secara Real-Time
    onSnapshot(collection(db, "classes"), (classSnap) => {
      const classes = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderClassTable(classes, users);
      populateClassOptions(classes);
    });
  });

  onSnapshot(collection(db, "subjects"), (snapshot) => {
    const subjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSubjectTable(subjects);
  });
}

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

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  tbody.innerHTML = users.length ? users.map(u => {
    const isAdmin = u.username === 'admin';
    return `
      <tr class="border-b text-xs">
        <td class="p-2.5">
          <strong class="text-slate-800 block">${u.name || u.username}</strong>
          <span class="text-[10px] text-slate-500">Username: <code class="font-bold text-blue-900">${u.username}</code> ${u.nisn ? `| NISN: ${u.nisn}` : ''}</span>
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
  const filterSelect = document.getElementById('filterUserClass');
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">Semua Kelas</option>` + classes.map(c => `<option value="${c.code}">${c.code}</option>`).join('');
  }
}

// -------------------------------------------------------------
// CETAK KARTU UJIAN FORMAT TATA LETAK A4 (6-8 KARTU/HALAMAN)
// -------------------------------------------------------------

window.renderExamCards = async function() {
  const grid = document.getElementById('examCardsGrid');
  if (!grid) return;

  const selectedClass = document.getElementById('cardClassFilter')?.value || '';
  const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "siswa")));
  const students = usersSnap.docs.map(d => d.data()).filter(s => !selectedClass || s.class === selectedClass);

  const settingsDoc = await getDoc(doc(doc(db, "settings", "academic")));
  const s = settingsDoc.exists() ? settingsDoc.data() : {};

  if (!students.length) {
    grid.innerHTML = `<p class="text-xs text-slate-400 p-4">Tidak ada kartu peserta siswa untuk kelas ini.</p>`;
    return;
  }

  grid.innerHTML = `
    <div class="col-span-full mb-3 flex justify-between items-center bg-slate-100 p-2.5 rounded-lg">
      <span class="text-xs text-slate-600 font-bold">Total Kartu: ${students.length} Peserta</span>
      <button onclick="window.print()" class="bg-blue-800 text-white text-xs px-3 py-1 rounded font-bold">
        <i class="fa-solid fa-print mr-1"></i> Cetak Kartu A4
      </button>
    </div>
    <div class="grid grid-cols-2 gap-4 col-span-full">
      ${students.map(st => `
        <div class="border-2 border-slate-800 p-3 rounded-xl bg-white space-y-2 text-xs relative">
          <div class="text-center border-b pb-1">
            <strong class="uppercase text-[11px] block font-bold text-blue-950">${s.schoolName || 'SMP QUR\'AN AL WAHDAH'}</strong>
            <span class="text-[9px] text-slate-500 uppercase font-bold">KARTU PESERTA UJIAN CBT T.A ${s.academicYear || '2026/2027'} (${s.semester || 'GANJIL'})</span>
          </div>
          <div class="space-y-1 text-[11px]">
            <div><strong>Nama:</strong> ${st.name || st.username}</div>
            <div><strong>NISN / Kelas:</strong> ${st.nisn || '-'} / ${st.class || '-'}</div>
            <div><strong>Username:</strong> <code class="font-bold text-blue-900">${st.username}</code></div>
            <div><strong>Password:</strong> <em class="text-slate-500 text-[10px]">*Gunakan password sementara saat dibuat/direset</em></div>
          </div>
          <div class="border-t pt-1 text-[9px] text-slate-400 text-center font-bold uppercase">
            Harap Jaga Kerahasiaan Kartu Ujian Ini
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

// -------------------------------------------------------------
// PENGATURAN SISTEM & HEADER REAL-TIME
// -------------------------------------------------------------

function initSettingsListener() {
  onSnapshot(doc(db, "settings", "academic"), (docSnap) => {
    if (docSnap.exists()) {
      const s = docSnap.data();
      if (document.getElementById('headerSchoolName')) document.getElementById('headerSchoolName').innerText = s.schoolName || "SMP Qur'an Al Wahdah";
      if (document.getElementById('headerSubTitle')) document.getElementById('headerSubTitle').innerText = `Sistem CBT - Tahun Ajaran ${s.academicYear || '2026/2027'} (${s.semester || 'Ganjil'})`;
    }
  });
}

window.handleSaveSettings = async function(e) {
  e.preventDefault();
  const settingsData = {
    schoolName: document.getElementById('settingSchoolName').value.trim(),
    npsn: document.getElementById('settingNPSN').value.trim(),
    academicYear: document.getElementById('settingYear').value.trim(),
    semester: document.getElementById('settingSemester').value,
    principalName: document.getElementById('settingPrincipal')?.value.trim() || '',
    updatedAt: Date.now()
  };

  try {
    await setDoc(doc(db, "settings", "academic"), settingsData);
    alert("Pengaturan Sekolah berhasil disimpan dan diperbarui di seluruh sistem!");
    logActivity(`Memperbarui Pengaturan Sekolah & Akademik`);
  } catch (err) {
    alert("Gagal menyimpan pengaturan: " + err.message);
  }
};
