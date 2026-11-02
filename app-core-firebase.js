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

  // PANGGUL PENGISI FORM OTOMATIS SAAT TAB PENUGASAN DIKLIK
  if (tabId === 'adminTabAssign') {
    window.populateAssignTab();
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

// =============================================================
// MODUL PENUGASAN GURU FIRESTORE
// =============================================================

// Fungsi untuk memuat data Guru, Mapel, dan Kelas ke dalam form Penugasan
window.populateAssignTab = async function() {
  try {
    // 1. Ambil Data Guru dari Firestore
    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "guru")));
    const teachers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const teacherSelect = document.getElementById('assignTeacherSelect');
    if (teacherSelect) {
      if (teachers.length === 0) {
        teacherSelect.innerHTML = `<option value="">-- Belum Ada Pengguna Guru --</option>`;
      } else {
        teacherSelect.innerHTML = teachers.map(g => `<option value="${g.id}">${g.name || g.username}</option>`).join('');
      }
    }

    // 2. Ambil Data Mapel dari Firestore
    const subjectsSnap = await getDocs(collection(db, "subjects"));
    const subjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const subSelect = document.getElementById('assignSubjectSelect');
    if (subSelect) {
      if (subjects.length === 0) {
        subSelect.innerHTML = `<option value="">-- Belum Ada Master Mapel --</option>`;
      } else {
        subSelect.innerHTML = subjects.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('');
      }
    }

    // 3. Ambil Data Kelas dari Firestore
    const classesSnap = await getDocs(collection(db, "classes"));
    const classes = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const classBox = document.getElementById('assignClassesBox');
    if (classBox) {
      if (classes.length === 0) {
        classBox.innerHTML = `<p class="text-xs text-slate-400">Belum ada master kelas.</p>`;
      } else {
        classBox.innerHTML = classes.map(c => `
          <label class="flex items-center text-xs space-x-2 py-0.5">
            <input type="checkbox" name="assignCls" value="${c.code}" class="rounded border-slate-300">
            <span>Kelas ${c.code}</span>
          </label>
        `).join('');
      }
    }

    // Render ulang tabel ringkasan penugasan
    window.renderTeacherAssignmentUI();
  } catch (err) {
    console.error("Gagal memuat form penugasan:", err);
  }
};

// Simpan penugasan guru ke Firestore
window.addTeacherAssignment = async function() {
  const teacherId = document.getElementById('assignTeacherSelect')?.value;
  const subjectCode = document.getElementById('assignSubjectSelect')?.value;
  const selectedClasses = Array.from(document.querySelectorAll('input[name="assignCls"]:checked')).map(cb => cb.value);

  if (!teacherId) return alert('Pilih guru terlebih dahulu!');
  if (!subjectCode) return alert('Pilih mata pelajaran terlebih dahulu!');
  if (!selectedClasses.length) return alert('Pilih minimal satu kelas!');

  try {
    const teacherRef = doc(db, "users", teacherId);
    const teacherSnap = await getDoc(teacherRef);

    if (teacherSnap.exists()) {
      let assignments = teacherSnap.data().teacherAssignments || [];
      const existingIndex = assignments.findIndex(a => a.subject === subjectCode);

      if (existingIndex > -1) {
        // Gabungkan kelas tanpa duplikat
        assignments[existingIndex].classes = Array.from(new Set([...assignments[existingIndex].classes, ...selectedClasses]));
      } else {
        assignments.push({ subject: subjectCode, classes: selectedClasses });
      }

      await updateDoc(teacherRef, { teacherAssignments: assignments });
      alert("Penugasan guru berhasil disimpan ke Firestore!");
      window.renderTeacherAssignmentUI();
    }
  } catch (err) {
    alert("Gagal menyimpan penugasan: " + err.message);
  }
};

// Render tabel ringkasan penugasan guru
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
                <button onclick="removeTeacherAssignment('${g.id}', ${aIdx})" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded text-[10px] font-bold">Hapus</button>
              </td>
            </tr>
          `);
        });
      }
    });

    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="4" class="p-4 text-center text-slate-400">Belum ada penugasan guru yang tercatat.</td></tr>`;
  } catch (err) {
    console.error("Gagal render tabel penugasan:", err);
  }
};

// Hapus penugasan tertentu
window.removeTeacherAssignment = async function(teacherId, assignIndex) {
  if (confirm("Hapus penugasan ini?")) {
    try {
      const teacherRef = doc(db, "users", teacherId);
      const teacherSnap = await getDoc(teacherRef);
      if (teacherSnap.exists()) {
        let assignments = teacherSnap.data().teacherAssignments || [];
        assignments.splice(assignIndex, 1);
        await updateDoc(teacherRef, { teacherAssignments: assignments });
        window.renderTeacherAssignmentUI();
      }
    } catch (err) {
      alert("Gagal menghapus penugasan: " + err.message);
    }
  }
};
