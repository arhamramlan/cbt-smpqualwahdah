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
        currentUserSession = { uid: user.uid, ...userDoc.data() };
        localStorage.setItem('cbt_session', JSON.stringify(currentUserSession));
        renderUserInterface();
      } else {
        handleLogout();
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
    document.getElementById(id).classList.add('hidden');
  });

  if (!currentUserSession) {
    document.getElementById('viewLogin').classList.remove('hidden');
    return;
  }

  document.getElementById('navUserArea').classList.remove('hidden');
  document.getElementById('navUserInfo').innerText = `${currentUserSession.name} (${currentUserSession.role.toUpperCase()})`;

  if (currentUserSession.role === 'admin') {
    document.getElementById('viewAdmin').classList.remove('hidden');
    listenToMasterData();
  } else if (currentUserSession.role === 'guru') {
    document.getElementById('viewTeacher').classList.remove('hidden');
    if (window.initTeacherFirebaseDashboard) window.initTeacherFirebaseDashboard(currentUserSession);
  } else if (currentUserSession.role === 'siswa') {
    document.getElementById('viewStudent').classList.remove('hidden');
  }
}

// LOG IN VIA FIREBASE AUTH / FIRESTORE
window.handleLogin = async function(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  try {
    // Format email internal jika login menggunakan NISN/Username
    const email = u.includes('@') ? u : `${u}@cbt.alwahdah.sch.id`;
    await signInWithEmailAndPassword(auth, email, p);
    logActivity(`User ${u} berhasil login.`);
  } catch (err) {
    alert("Login Gagal: " + err.message);
  }
};

window.handleLogout = async function() {
  await signOut(auth);
  location.reload();
};

// LISTENERS REAL-TIME MASTER DATA (ADMIN)
function listenToMasterData() {
  // Real-time Kelas
  onSnapshot(collection(db, "classes"), (snapshot) => {
    const classes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClassTable(classes);
    populateClassOptions(classes);
  });

  // Real-time Mapel
  onSnapshot(collection(db, "subjects"), (snapshot) => {
    const subjects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSubjectTable(subjects);
  });

  // Real-time Users
  onSnapshot(collection(db, "users"), (snapshot) => {
    const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUserTable(users);
  });

  // Real-time Logs
  onSnapshot(collection(db, "logs"), (snapshot) => {
    const logs = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
    renderLogsTable(logs);
  });
}

// MANAJEMEN KELAS & MAPEL FIRESTORE
window.handleSaveClass = async function(e) {
  e.preventDefault();
  const code = document.getElementById('classNameInput').value.trim().toUpperCase();
  const level = document.getElementById('classLevelInput').value;
  const homeroom = document.getElementById('classHomeroomInput').value.trim() || '-';

  await setDoc(doc(db, "classes", code), { code, level, homeroom });
  alert("Kelas berhasil disimpan di Firebase!");
  document.getElementById('classNameInput').value = '';
  document.getElementById('classHomeroomInput').value = '';
};

window.deleteClass = async function(classCode) {
  if (confirm(`Hapus kelas ${classCode} dari Firestore?`)) {
    await deleteDoc(doc(db, "classes", classCode));
  }
};

window.handleSaveSubject = async function(e) {
  e.preventDefault();
  const code = document.getElementById('subjectCodeInput').value.trim().toUpperCase();
  const name = document.getElementById('subjectNameInput').value.trim();

  await setDoc(doc(db, "subjects", code), { code, name });
  alert("Mata Pelajaran disimpan di Firebase!");
  document.getElementById('subjectCodeInput').value = '';
  document.getElementById('subjectNameInput').value = '';
};

window.deleteSubject = async function(subjectCode) {
  if (confirm(`Hapus mapel ${subjectCode}?`)) {
    await deleteDoc(doc(db, "subjects", subjectCode));
  }
};

// MANAJEMEN PENUGASAN GURU
window.addTeacherAssignment = async function() {
  const teacherId = document.getElementById('assignTeacherSelect').value;
  const subjectCode = document.getElementById('assignSubjectSelect').value;
  const selectedClasses = Array.from(document.querySelectorAll('input[name="assignCls"]:checked')).map(cb => cb.value);

  if (!selectedClasses.length) return alert('Pilih minimal satu kelas!');

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
    alert("Penugasan Guru berhasil diperbarui di Firestore!");
  }
};

// LOGS & SETTINGS
async function logActivity(eventText) {
  if (!currentUserSession) return;
  await addDoc(collection(db, "logs"), {
    time: new Date().toLocaleString('id-ID'),
    timestamp: Date.now(),
    user: currentUserSession.name || 'System',
    event: eventText
  });
}

function initSettingsListener() {
  onSnapshot(doc(db, "settings", "academic"), (docSnap) => {
    if (docSnap.exists()) {
      const s = docSnap.data();
      document.getElementById('headerSchoolName').innerText = s.schoolName || "SMP Qur'an Al Wahdah";
      document.getElementById('headerSubTitle').innerText = `CBT System - Tahun Ajaran ${s.academicYear || ''} (${s.semester || ''})`;
    }
  });
}

// RENDER TABLE HELPERS
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

function renderUserTable(users) {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr class="border-b">
      <td class="p-2.5">
        <strong class="text-slate-800">${u.name}</strong>
        <p class="text-[10px] text-slate-500">Username: ${u.username}</p>
      </td>
      <td class="p-2.5"><span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${u.role}</span></td>
      <td class="p-2.5"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">Aktif</span></td>
      <td class="p-2.5 text-center">
        <button onclick="deleteUserDoc('${u.id}')" class="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px]">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('adminLogsTableBody');
  if (!tbody) return;
  tbody.innerHTML = logs.map(l => `
    <tr class="border-b">
      <td class="p-2 font-mono text-[10px] text-slate-500">${l.time}</td>
      <td class="p-2 font-bold">${l.user}</td>
      <td class="p-2">${l.event}</td>
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
