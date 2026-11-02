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

// Inisialisasi Listener Auth & Real-Time Data
document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();
  initSettingsListener();
});

function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Ambil profil user dari koleksi Firestore 'users'
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        currentUserSession = { 
          uid: user.uid, 
          name: data.name || data.username || 'Admin', // Mencegah undefined
          role: data.role || 'admin',
          ...data 
        };
        localStorage.setItem('cbt_session', JSON.stringify(currentUserSession));
        renderUserInterface();
      } else {
        // Jika dokumen di Firestore belum ada, buatkan profil default
        currentUserSession = { uid: user.uid, name: 'Administrator', role: 'admin', username: 'admin' };
        renderUserInterface();
      }
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
  document.getElementById('navUserInfo').innerText = `${currentUserSession.name} (${currentUserSession.role.toUpperCase()})`;

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
// EKSPOR FUNGSI KE WINDOW AGAR EVENT ONCLICK HTML BERFUNGSI
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

  if (btnMap[tabId]) {
    document.getElementById(btnMap[tabId])?.classList.add('active-tab');
  }
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  try {
    const email = u.includes('@') ? u : `${u}@cbt.alwahdah.sch.id`;
    await signInWithEmailAndPassword(auth, email, p);
  } catch (err) {
    alert("Login Gagal: " + err.message);
  }
};

window.handleLogout = async function() {
  await signOut(auth);
  location.reload();
};

window.handleSaveUser = async function(e) {
  e.preventDefault();
  const name = document.getElementById('userName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const role = document.getElementById('userRole').value;

  try {
    const newDocRef = doc(collection(db, "users"));
    await setDoc(newDocRef, {
      name,
      username,
      role,
      active: true,
      createdAt: Date.now()
    });
    alert("Pengguna berhasil ditambahkan!");
    window.resetUserForm();
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

window.deleteUserDoc = async function(userId) {
  if (confirm("Apakah Anda yakin ingin menghapus pengguna ini dari Firestore?")) {
    await deleteDoc(doc(db, "users", userId));
  }
};

// LISTENERS REAL-TIME FIRESTORE
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

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = users.map(u => `
    <tr class="border-b">
      <td class="p-2.5">
        <strong class="text-slate-800">${u.name || u.username || 'Tanpa Nama'}</strong>
        <p class="text-[10px] text-slate-500">Username: ${u.username || '-'}</p>
      </td>
      <td class="p-2.5">
        <span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role || 'siswa'}</span>
      </td>
      <td class="p-2.5">
        <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">${u.active ? 'Aktif' : 'Nonaktif'}</span>
      </td>
      <td class="p-2.5 text-center">
        <button onclick="deleteUserDoc('${u.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function renderClassTable(classes) {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;
  tbody.innerHTML = classes.map(c => `
    <tr class="border-b">
      <td class="p-2.5 font-bold">${c.code}</td>
      <td class="p-2.5">Tingkat ${c.level}</td>
      <td class="p-2.5">${c.homeroom || '-'}</td>
      <td class="p-2.5 text-center">
        <button onclick="deleteClass('${c.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function renderSubjectTable(subjects) {
  const tbody = document.getElementById('subjectTableBody');
  if (!tbody) return;
  tbody.innerHTML = subjects.map(s => `
    <tr class="border-b">
      <td class="p-2.5 font-bold">${s.code}</td>
      <td class="p-2.5">${s.name}</td>
      <td class="p-2.5 text-center">
        <button onclick="deleteSubject('${s.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
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
      if (document.getElementById('headerSubTitle')) document.getElementById('headerSubTitle').innerText = `CBT System - Tahun Ajaran ${s.academicYear || ''} (${s.semester || ''})`;
    }
  });
}
