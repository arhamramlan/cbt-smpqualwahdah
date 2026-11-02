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
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          currentUserSession = { 
            uid: user.uid, 
            name: data.name || data.username || 'Admin',
            role: data.role || 'admin',
            ...data 
          };
        } else {
          currentUserSession = { uid: user.uid, name: 'Administrator', role: 'admin', username: 'admin' };
        }
      } catch (e) {
        currentUserSession = { uid: user.uid, name: 'Administrator', role: 'admin', username: 'admin' };
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
// GLOBAL WINDOW FUNCTIONS FOR HTML EVENTS
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
  if (confirm("Hapus pengguna ini dari Firestore?")) {
    await deleteDoc(doc(db, "users", userId));
  }
};

// MASTER KELAS FIRESTORE
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
  } catch (err) {
    alert("Gagal menyimpan kelas: " + err.message);
  }
};

window.editClass = async function(code) {
  try {
    const classDoc = await getDoc(doc(db, "classes", code));
    if (classDoc.exists()) {
      const data = classDoc.data();
      document.getElementById('classNameInput').value = data.code;
      document.getElementById('classLevelInput').value = data.level;
      document.getElementById('classHomeroomInput').value = data.homeroom || '';
    }
  } catch (err) {
    alert("Error: " + err.message);
  }
};

window.deleteClass = async function(code) {
  if (confirm(`Hapus kelas ${code}?`)) {
    await deleteDoc(doc(db, "classes", code));
  }
};

// MASTER MAPEL FIRESTORE
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
  } catch (err) {
    alert("Gagal menyimpan mapel: " + err.message);
  }
};

window.deleteSubject = async function(code) {
  if (confirm(`Hapus mapel ${code}?`)) {
    await deleteDoc(doc(db, "subjects", code));
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

function renderClassTable(classes) {
  const tbody = document.getElementById('classTableBody');
  if (!tbody) return;

  if (!classes || classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada master kelas di database.</td></tr>`;
    return;
  }

  tbody.innerHTML = classes.map(c => `
    <tr class="border-b">
      <td class="p-2.5 font-bold text-blue-900">${c.code}</td>
      <td class="p-2.5">Tingkat ${c.level}</td>
      <td class="p-2.5">${c.homeroom || '-'}</td>
      <td class="p-2.5">-</td>
      <td class="p-2.5 text-center space-x-1">
        <button onclick="editClass('${c.code}')" class="bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">Edit</button>
        <button onclick="deleteClass('${c.code}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
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

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr class="border-b">
      <td class="p-2.5">
        <strong class="text-slate-800">${u.name || u.username || 'Tanpa Nama'}</strong>
        <p class="text-[10px] text-slate-500">Username: ${u.username || '-'}</p>
      </td>
      <td class="p-2.5"><span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role || 'siswa'}</span></td>
      <td class="p-2.5"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">${u.active ? 'Aktif' : 'Nonaktif'}</span></td>
      <td class="p-2.5 text-center">
        <button onclick="deleteUserDoc('${u.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
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
