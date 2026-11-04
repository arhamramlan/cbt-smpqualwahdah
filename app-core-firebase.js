// app-core-firebase.js — autentikasi, admin (pengguna, kelas, mapel, penugasan, kartu, log, pengaturan, backup)
import {
  db, auth, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';

// ------------------------------------------------------------------
// UTILITAS BERSAMA (dipakai juga oleh app-exam-firebase.js lewat window.CBT)
// ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const pad = (n) => String(n).padStart(2, '0');
function fmtDateTime(ts) {
  const d = new Date(ts || Date.now());
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}
function randomString(len, chars) {
  const a = new Uint32Array(len); crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}
const genPassword = () => randomString(7, 'abcdefghjkmnpqrstuvwxyz23456789');
// jalankan tugas paralel per kelompok (jauh lebih cepat daripada await berurutan)
async function runChunks(items, fn, size = 20) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}
// satu listener per kunci: listener lama otomatis dilepas, tidak menumpuk
const unsubs = {};
function listen(key, ref, cb) {
  unsubs[key]?.();
  unsubs[key] = onSnapshot(ref, cb, (e) => console.error('Listener', key, e.message));
}
function stopListen(key) { unsubs[key]?.(); delete unsubs[key]; }
function stopAll() { Object.keys(unsubs).forEach(stopListen); }

let session = null;
let settingsCache = {};
let busyLogout = false;

async function logActivity(text) {
  if (!session) return;
  try {
    await addDoc(collection(db, 'logs'), {
      formattedTime: fmtDateTime(), timestamp: Date.now(),
      user: session.name || session.username || 'Sistem', role: session.role || 'system', event: text
    });
  } catch (e) { console.error('Gagal mencatat log:', e); }
}

window.CBT = { $, esc, fmtDateTime, randomString, runChunks, listen, stopListen, stopAll, log: logActivity,
  getSession: () => session, getSettings: () => settingsCache };

// ------------------------------------------------------------------
// AUTENTIKASI
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();
  initSettingsListener();
  $('btnLogoutHeader')?.addEventListener('click', (e) => { e.preventDefault(); window.handleLogout(); });

  // Login otomatis dari QR kartu ujian, lalu parameter dibuang dari URL agar tidak tersimpan di riwayat
  const p = new URLSearchParams(location.search);
  if (p.get('u') && p.get('p')) {
    $('loginUsername').value = p.get('u');
    $('loginPassword').value = p.get('p');
    history.replaceState(null, '', location.pathname);
    window.handleLogin();
  }
});

function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      let data = {};
      try { const d = await getDoc(doc(db, 'users', user.uid)); if (d.exists()) data = d.data(); } catch (e) { /* abaikan */ }
      if (data.active === false) { await signOut(auth); return; }
      setSession({ uid: user.uid, name: 'Admin Utama', role: 'admin', username: 'admin', ...data });
    } else if (!session) {
      try { session = JSON.parse(sessionStorage.getItem('cbt_session')); } catch (e) { session = null; }
    }
    renderUserInterface();
  });
}

function setSession(data) {
  const { password, ...safe } = data;           // jangan simpan password di browser
  session = { ...safe, name: safe.name || safe.username, role: safe.role || 'siswa' };
  sessionStorage.setItem('cbt_session', JSON.stringify(session));
}

let adminStarted = false;
function renderUserInterface() {
  ['viewLogin', 'viewAdmin', 'viewTeacher', 'viewStudent', 'navUserArea'].forEach((id) => $(id)?.classList.add('hidden'));
  if (!session) return $('viewLogin')?.classList.remove('hidden');

  $('navUserArea')?.classList.remove('hidden');
  $('navUserInfo').innerText = `${session.name} (${session.role.toUpperCase()})`;

  if (session.role === 'admin') {
    $('viewAdmin').classList.remove('hidden');
    if (!adminStarted) { adminStarted = true; listenToMasterData(); }
  } else if (session.role === 'guru') {
    $('viewTeacher').classList.remove('hidden');
    window.initTeacherFirebaseDashboard?.(session);
  } else {
    $('viewStudent').classList.remove('hidden');
    window.initStudentView?.(session);
  }
  if (session.mustChangePassword) window.openProfileModal(true);
}

window.handleLogin = async function (e) {
  e?.preventDefault?.();
  const u = $('loginUsername')?.value.trim();
  const p = $('loginPassword')?.value.trim();
  if (!u || !p) return alert('Silakan isi Username / NISN dan Kata Sandi!');
  const btn = e?.target?.querySelector?.('button[type=submit]');
  if (btn) btn.disabled = true;

  try {
    // 1) Akun di Firestore (siswa & guru) — satu query saja
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('username', '==', u.toLowerCase())));
      const d = snap.docs[0];
      if (d && d.data().password && d.data().password === p) {
        if (d.data().active === false) return alert('Login Gagal: Akun Anda sedang dinonaktifkan oleh Admin!');
        setSession({ uid: d.id, ...d.data() });
        logActivity(`User ${u} (${session.role}) berhasil login.`);
        return renderUserInterface();
      }
    } catch (err) { console.warn('Login Firestore:', err.message); }

    // 2) Firebase Authentication (akun admin)
    try {
      const email = u.includes('@') ? u : `${u.toLowerCase()}@cbt.alwahdah.sch.id`;
      await signInWithEmailAndPassword(auth, email, p);   // onAuthStateChanged yang menyusun sesi
      logActivity(`User ${u} berhasil login via Firebase Auth.`);
    } catch (err) {
      alert('Login Gagal: Username atau Kata Sandi salah!');
    }
  } finally { if (btn) btn.disabled = false; }
};

window.handleLogout = async function () {
  if (busyLogout || !confirm('Apakah Anda yakin ingin keluar dari sistem CBT?')) return;
  busyLogout = true;
  try {
    await logActivity('Pengguna keluar dari sistem.');
    stopAll();
    sessionStorage.removeItem('cbt_session');
    session = null;
    if (auth.currentUser) await signOut(auth);
  } catch (err) { console.warn('Logout:', err.message); }
  location.reload();
};

// Ganti password sendiri
window.openProfileModal = (force) => {
  $('profileNotice')?.classList.toggle('hidden', !force);
  $('modalProfile')?.classList.remove('hidden');
};
window.closeProfileModal = () => $('modalProfile')?.classList.add('hidden');
window.handleSaveProfile = async function (e) {
  e.preventDefault();
  const np = $('profileNewPass').value.trim();
  if (np.length < 6) return alert('Password minimal 6 karakter!');
  if (auth.currentUser) return alert('Akun ini memakai Firebase Authentication. Ubah password-nya lewat Firebase Console.');
  try {
    await updateDoc(doc(db, 'users', session.uid), { password: np, mustChangePassword: false, updatedAt: Date.now() });
    session.mustChangePassword = false; setSession(session);
    $('profileNewPass').value = '';
    window.closeProfileModal();
    alert('Password berhasil diubah.');
    logActivity('Mengganti password sendiri.');
  } catch (err) { alert('Gagal mengubah password: ' + err.message); }
};

// ------------------------------------------------------------------
// NAVIGASI TAB ADMIN
// ------------------------------------------------------------------
const ADMIN_TABS = { adminTabUsers: 'btnAdminUsers', adminTabClasses: 'btnAdminClasses', adminTabSubjects: 'btnAdminSubjects',
  adminTabAssign: 'btnAdminAssign', adminTabCards: 'btnAdminCards', adminTabLogs: 'btnAdminLogs', adminTabSettings: 'btnAdminSettings' };
window.switchAdminTab = function (tabId) {
  document.querySelectorAll('.admin-tab-content').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.admin-tab-btn').forEach((el) => el.classList.remove('active-tab'));
  $(tabId)?.classList.remove('hidden');
  $(ADMIN_TABS[tabId])?.classList.add('active-tab');
  if (tabId === 'adminTabAssign') window.populateAssignTab();
  if (tabId === 'adminTabCards') window.renderExamCards();
  if (tabId === 'adminTabLogs') window.loadLogs();
  if (tabId === 'adminTabSettings') loadSettingsForm();
};

// ------------------------------------------------------------------
// DATA MASTER (satu listener per koleksi, tanpa listener bersarang)
// ------------------------------------------------------------------
let users = [], classes = [], subjects = [];

function listenToMasterData() {
  listen('users', collection(db, 'users'), (s) => {
    users = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    window.filterUserTableUI(); renderClassTable(); window.renderTeacherAssignmentUI();
    if (!$('adminTabCards')?.classList.contains('hidden')) window.renderExamCards();
  });
  listen('classes', collection(db, 'classes'), (s) => {
    classes = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code));
    renderClassTable(); populateClassOptions();
  });
  listen('subjects', collection(db, 'subjects'), (s) => {
    subjects = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code));
    renderSubjectTable();
  });
}

function populateClassOptions() {
  const opts = classes.map((c) => `<option value="${esc(c.code)}">${esc(c.code)}</option>`).join('');
  const all = `<option value="">Semua Kelas</option>`;
  if ($('userClass')) $('userClass').innerHTML = opts;
  if ($('filterUserClass')) $('filterUserClass').innerHTML = all + opts;
  if ($('cardClassFilter')) $('cardClassFilter').innerHTML = all + opts;
}

// ---------- Pengguna ----------
const tmpl = (rows, cols, msg) => rows.length ? rows.join('') : `<tr><td colspan="${cols}" class="p-4 text-center text-slate-400">${msg}</td></tr>`;

window.filterUserTableUI = function () {
  const q = ($('searchUser')?.value || '').toLowerCase().trim();
  const role = $('filterRole')?.value || '';
  const cls = $('filterUserClass')?.value || '';
  const list = users.filter((u) =>
    (!q || [u.name, u.username, u.nisn].some((v) => String(v || '').toLowerCase().includes(q))) &&
    (!role || u.role === role) && (!cls || u.class === cls));
  $('userTableBody').innerHTML = tmpl(list.map((u, i) => {
    const isAdmin = u.username === 'admin', on = u.active !== false, pid = `userPass_${i}`;
    return `<tr class="border-b text-xs">
      <td class="p-2.5"><strong class="text-slate-800 block">${esc(u.name || u.username)}</strong>
        <span class="text-[10px] text-slate-500">Username: <code class="font-bold text-blue-900">${esc(u.username)}</code>${u.nisn ? ` | NISN: ${esc(u.nisn)}` : ''}</span>
        <div class="flex items-center gap-1 mt-1"><span class="text-[10px] text-slate-400">Pass:</span>
          <input type="password" id="${pid}" value="${esc(u.password || '******')}" readonly class="bg-slate-100 border px-1 py-0.5 rounded text-[10px] w-20 font-mono outline-none">
          <button onclick="togglePasswordVisibility('${pid}')" class="text-slate-500 hover:text-blue-800 text-[11px] px-1"><i class="fa-solid fa-eye"></i></button></div></td>
      <td class="p-2.5"><span class="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">${esc(u.role)}</span>
        ${u.class ? `<span class="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] ml-1 font-semibold">${esc(u.class)}</span>` : ''}</td>
      <td class="p-2.5"><button onclick="toggleUserActive('${u.id}')" ${isAdmin ? 'disabled' : ''} class="px-2 py-0.5 rounded text-[10px] font-bold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${on ? '● Aktif' : '○ Nonaktif'}</button></td>
      <td class="p-2.5 text-center space-x-1">${isAdmin ? '<span class="text-[10px] text-slate-400 italic">Terproteksi</span>' : `
        <button onclick="editUserDoc('${u.id}')" class="btn btn-sm btn-amber">Edit</button>
        <button onclick="resetPasswordUser('${u.id}')" class="btn btn-sm btn-blue">Reset Pass</button>
        <button onclick="deleteUserDoc('${u.id}')" class="btn btn-sm btn-red">Hapus</button>`}</td></tr>`;
  }), 4, 'Tidak ada pengguna.');
};

window.generateAutoPassword = () => { const el = $('userPassword'); el.type = 'text'; el.value = genPassword(); };
window.togglePasswordVisibility = (id) => { const el = $(id); if (el) el.type = el.type === 'password' ? 'text' : 'password'; };
window.toggleRoleFields = () => $('fieldSiswa')?.classList.toggle('hidden', $('userRole').value !== 'siswa');

window.resetUserForm = function () {
  ['editUserId', 'userName', 'userUsername', 'userPassword', 'userNisn'].forEach((id) => { if ($(id)) $(id).value = ''; });
  $('userUsername').disabled = false; $('userPassword').type = 'password'; $('userRole').value = 'siswa';
  $('userFormTitle').innerHTML = '<i class="fa-solid fa-user-plus text-blue-600 mr-2"></i>Tambah Pengguna Baru';
  window.toggleRoleFields();
};

window.editUserDoc = function (id) {
  const u = users.find((x) => x.id === id); if (!u) return;
  $('editUserId').value = id; $('userName').value = u.name || '';
  $('userUsername').value = u.username || ''; $('userUsername').disabled = true;
  $('userRole').value = u.role || 'siswa'; $('userNisn').value = u.nisn || ''; $('userClass').value = u.class || '';
  $('userPassword').value = '';
  $('userFormTitle').innerHTML = '<i class="fa-solid fa-user-pen text-amber-600 mr-2"></i>Edit Pengguna';
  window.toggleRoleFields(); $('userName').focus();
};

window.handleSaveUser = async function (e) {
  e.preventDefault();
  const editId = $('editUserId').value;
  const name = $('userName').value.trim();
  const username = $('userUsername').value.trim().toLowerCase();
  const role = $('userRole').value;
  const nisn = $('userNisn').value.trim();
  const cls = role === 'siswa' ? $('userClass').value : '';
  const pass = $('userPassword').value.trim();

  if (!name || !username) return alert('Nama Lengkap dan Username wajib diisi!');
  if (!/^[a-z0-9._-]+$/.test(username)) return alert('Username hanya boleh huruf kecil, angka, titik, strip, dan garis bawah (tanpa spasi).');
  if (role === 'siswa' && !nisn) return alert('NISN wajib diisi untuk siswa!');
  if (pass && pass.length < 4) return alert('Password minimal 4 karakter!');

  try {
    if (editId) {
      await updateDoc(doc(db, 'users', editId), { name, role, nisn, class: cls, updatedAt: Date.now(), ...(pass ? { password: pass, mustChangePassword: true } : {}) });
      alert(`Data ${name} berhasil diperbarui!${pass ? ' (Password diubah)' : ''}`);
      logActivity(`Memperbarui profil pengguna: ${username}`);
    } else {
      if (users.some((u) => u.username === username)) return alert(`Username "${username}" sudah digunakan!`);
      const password = pass || genPassword();
      await setDoc(doc(collection(db, 'users')), { name, username, role, nisn, class: cls, password, active: true, mustChangePassword: true, createdAt: Date.now() });
      alert(`Pengguna berhasil ditambahkan!\n\nNama: ${name}\nUsername: ${username}\nPassword: ${password}`);
      logActivity(`Menambahkan pengguna baru: ${username} (${role})`);
    }
    window.resetUserForm();
  } catch (err) { alert('Gagal menyimpan pengguna: ' + err.message); }
};

window.resetPasswordUser = async function (id) {
  const u = users.find((x) => x.id === id); if (!u) return;
  if (!confirm(`Reset password untuk ${u.username}? Kata sandi acak baru akan dibuat.`)) return;
  const password = genPassword();
  try {
    await updateDoc(doc(db, 'users', id), { password, mustChangePassword: true, updatedAt: Date.now() });
    alert(`Password berhasil di-reset!\n\nUsername: ${u.username}\nPassword Baru: ${password}`);
    logActivity(`Mereset kata sandi pengguna: ${u.username}`);
  } catch (err) { alert('Gagal mereset password: ' + err.message); }
};

window.toggleUserActive = async function (id) {
  const u = users.find((x) => x.id === id); if (!u) return;
  if (u.username === 'admin') return alert('Akun Admin Utama tidak bisa dinonaktifkan!');
  const next = u.active === false;
  if (!confirm(`Ubah status akun ${u.username} menjadi ${next ? 'Aktif' : 'Nonaktif'}?`)) return;
  try { await updateDoc(doc(db, 'users', id), { active: next }); logActivity(`Mengubah status akun ${u.username} menjadi ${next ? 'Aktif' : 'Nonaktif'}`); }
  catch (err) { alert('Gagal mengubah status: ' + err.message); }
};

window.deleteUserDoc = async function (id) {
  const u = users.find((x) => x.id === id); if (!u) return;
  if (u.username === 'admin') return alert('Akun Admin Utama tidak bisa dihapus!');
  if (!confirm(`Hapus akun ${u.username} secara permanen?`)) return;
  try { await deleteDoc(doc(db, 'users', id)); logActivity(`Menghapus akun pengguna: ${u.username}`); }
  catch (err) { alert('Gagal menghapus pengguna: ' + err.message); }
};

// ---------- Excel helper ----------
function readExcelRows(file, onRows) {
  if (typeof XLSX === 'undefined') return alert('Pustaka SheetJS (XLSX) belum dimuat. Mohon muat ulang halaman.');
  const r = new FileReader();
  r.onload = async (evt) => {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) return alert('File Excel kosong atau format kolom tidak sesuai!');
      await onRows(rows);
    } catch (err) { alert('Gagal memproses file Excel: ' + err.message); }
  };
  r.readAsArrayBuffer(file);
}
function downloadSheet(rows, sheet, filename, cols) {
  if (typeof XLSX === 'undefined') return alert('Pustaka SheetJS (XLSX) belum dimuat. Mohon muat ulang halaman.');
  const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = cols.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet); XLSX.writeFile(wb, filename);
}

window.downloadUserTemplate = () => downloadSheet([
  { 'Nama Lengkap': 'Ahmad Abdullah', Username: 'ahmad01', Role: 'siswa', NISN: '0012345678', Kelas: 'VII-A', Password: '' },
  { 'Nama Lengkap': 'Arham Ramlan', Username: 'arham', Role: 'guru', NISN: '', Kelas: '', Password: 'guru123' }
], 'Template Pengguna', 'Template_Import_Pengguna_CBT.xlsx', [30, 18, 12, 15, 10, 15]);

window.handleImportUsersExcel = function (e) {
  const file = e.target.files[0]; if (!file) return;
  readExcelRows(file, async (rows) => {
    const taken = new Set(users.map((u) => u.username));
    const toSave = [], errors = [];
    rows.forEach((r, i) => {
      const name = String(r['Nama Lengkap'] || '').trim();
      const username = String(r.Username || '').trim().toLowerCase();
      let role = String(r.Role || 'siswa').trim().toLowerCase();
      const nisn = String(r.NISN || '').trim();
      const cls = String(r.Kelas || '').trim().toUpperCase();
      if (!name || !username) return errors.push(`Baris ${i + 2}: nama/username kosong`);
      if (!/^[a-z0-9._-]+$/.test(username)) return errors.push(`Baris ${i + 2}: username "${username}" tidak valid`);
      if (taken.has(username)) return errors.push(`Baris ${i + 2}: username "${username}" sudah ada`);
      if (!['siswa', 'guru', 'admin'].includes(role)) role = 'siswa';
      if (role === 'siswa' && cls && !classes.some((c) => c.code === cls)) errors.push(`Baris ${i + 2}: kelas "${cls}" belum ada di Master Kelas (tetap disimpan)`);
      taken.add(username);
      toSave.push({ name, username, role, nisn, class: cls, password: String(r.Password || '').trim() || genPassword(), active: true, mustChangePassword: true, createdAt: Date.now() });
    });
    await runChunks(toSave, (u) => setDoc(doc(collection(db, 'users')), u));
    alert(`Impor selesai!\n✔ ${toSave.length} pengguna ditambahkan.${errors.length ? `\n✖ ${errors.length} catatan:\n${errors.slice(0, 8).join('\n')}${errors.length > 8 ? '\n…' : ''}` : ''}`);
    logActivity(`Mengimpor ${toSave.length} pengguna dari file Excel.`);
    e.target.value = '';
  });
};

// ---------- Kelas ----------
function renderClassTable() {
  const tb = $('classTableBody'); if (!tb) return;
  const count = {}; users.forEach((u) => { if (u.role === 'siswa') count[u.class] = (count[u.class] || 0) + 1; });
  tb.innerHTML = tmpl(classes.map((c) => `<tr class="border-b text-xs">
    <td class="p-2.5 font-bold text-blue-900">${esc(c.code)}</td><td class="p-2.5">Tingkat ${esc(c.level)}</td><td class="p-2.5">${esc(c.homeroom || '-')}</td>
    <td class="p-2.5 font-bold text-slate-700">${count[c.code] || 0} Siswa</td>
    <td class="p-2.5 text-center space-x-1"><button onclick="editClass('${esc(c.code)}')" class="btn btn-sm btn-amber">Edit</button>
      <button onclick="deleteClass('${esc(c.code)}')" class="btn btn-sm btn-red">Hapus</button></td></tr>`), 5, 'Belum ada kelas.');
}
window.editClass = (code) => {
  const c = classes.find((x) => x.code === code); if (!c) return;
  $('editClassOldCode').value = code; $('classNameInput').value = c.code; $('classNameInput').readOnly = true;
  $('classLevelInput').value = c.level; $('classHomeroomInput').value = c.homeroom === '-' ? '' : c.homeroom;
};
window.handleSaveClass = async function (e) {
  e.preventDefault();
  const code = $('classNameInput').value.trim().toUpperCase();
  if (!code) return alert('Kode kelas wajib diisi!');
  try {
    await setDoc(doc(db, 'classes', code), { code, level: $('classLevelInput').value, homeroom: $('classHomeroomInput').value.trim() || '-', updatedAt: Date.now() });
    logActivity(`Menyimpan Master Kelas: ${code}`);
    $('editClassOldCode').value = ''; $('classNameInput').value = ''; $('classNameInput').readOnly = false; $('classHomeroomInput').value = '';
    alert(`Kelas ${code} berhasil disimpan!`);
  } catch (err) { alert('Gagal menyimpan kelas: ' + err.message); }
};
window.deleteClass = async function (code) {
  const n = users.filter((u) => u.role === 'siswa' && u.class === code).length;
  if (n) return alert(`Gagal Menghapus: Kelas ${code} masih memiliki ${n} siswa terdaftar!`);
  if (confirm(`Hapus kelas ${code}?`)) { await deleteDoc(doc(db, 'classes', code)); logActivity(`Menghapus Master Kelas: ${code}`); }
};

// ---------- Mapel ----------
function renderSubjectTable() {
  const tb = $('subjectTableBody'); if (!tb) return;
  tb.innerHTML = tmpl(subjects.map((s) => `<tr class="border-b text-xs"><td class="p-2.5 font-bold">${esc(s.code)}</td><td class="p-2.5">${esc(s.name)}</td>
    <td class="p-2.5 text-center space-x-1"><button onclick="editSubject('${esc(s.code)}')" class="btn btn-sm btn-amber">Edit</button>
      <button onclick="deleteSubject('${esc(s.code)}')" class="btn btn-sm btn-red">Hapus</button></td></tr>`), 3, 'Belum ada mapel.');
}
window.editSubject = (code) => {
  const s = subjects.find((x) => x.code === code); if (!s) return;
  $('subjectCodeInput').value = s.code; $('subjectCodeInput').readOnly = true; $('subjectNameInput').value = s.name;
};
window.handleSaveSubject = async function (e) {
  e.preventDefault();
  const code = $('subjectCodeInput').value.trim().toUpperCase(), name = $('subjectNameInput').value.trim();
  if (!code || !name) return alert('Kode dan nama mapel wajib diisi!');
  try {
    await setDoc(doc(db, 'subjects', code), { code, name, updatedAt: Date.now() });
    logActivity(`Menyimpan Master Mapel: ${name}`);
    $('subjectCodeInput').value = ''; $('subjectCodeInput').readOnly = false; $('subjectNameInput').value = '';
    alert(`Mapel ${name} berhasil disimpan!`);
  } catch (err) { alert('Gagal menyimpan mapel: ' + err.message); }
};
window.deleteSubject = async function (code) {
  if (confirm(`Hapus mapel ${code}?`)) { await deleteDoc(doc(db, 'subjects', code)); logActivity(`Menghapus Master Mapel: ${code}`); }
};
window.downloadSubjectTemplate = () => downloadSheet(
  [['PAI', 'Pendidikan Agama Islam'], ['MTK', 'Matematika'], ['BINDO', 'Bahasa Indonesia'], ['BING', 'Bahasa Inggris']]
    .map(([k, n]) => ({ 'Kode Mapel': k, 'Nama Mata Pelajaran': n })), 'Master Mapel', 'Template_Master_Mata_Pelajaran.xlsx', [15, 35]);
window.handleImportSubjectsExcel = function (e) {
  const file = e.target.files[0]; if (!file) return;
  readExcelRows(file, async (rows) => {
    const valid = rows.map((r) => ({ code: String(r['Kode Mapel'] || '').trim().toUpperCase(), name: String(r['Nama Mata Pelajaran'] || '').trim() })).filter((r) => r.code && r.name);
    await runChunks(valid, (s) => setDoc(doc(db, 'subjects', s.code), { ...s, updatedAt: Date.now() }));
    alert(`Impor Master Mapel selesai!\n✔ ${valid.length} mapel ditambahkan/diperbarui.${rows.length - valid.length ? `\n✖ ${rows.length - valid.length} baris gagal (kode/nama kosong).` : ''}`);
    logActivity(`Mengimpor ${valid.length} Master Mapel dari file Excel.`);
    e.target.value = '';
  });
};

// ---------- Penugasan guru ----------
window.populateAssignTab = function () {
  const teachers = users.filter((u) => u.role === 'guru');
  const keep = $('assignTeacherSelect').value;
  $('assignTeacherSelect').innerHTML = teachers.length ? teachers.map((g) => `<option value="${g.id}">${esc(g.name || g.username)}</option>`).join('') : '<option value="">-- Belum Ada Guru --</option>';
  if (keep) $('assignTeacherSelect').value = keep;
  $('assignSubjectSelect').innerHTML = subjects.length ? subjects.map((s) => `<option value="${esc(s.code)}">${esc(s.name)} (${esc(s.code)})</option>`).join('') : '<option value="">-- Belum Ada Mapel --</option>';
  $('assignClassesBox').innerHTML = classes.length ? classes.map((c) => `<label class="flex items-center text-xs space-x-2 py-0.5"><input type="checkbox" name="assignCls" value="${esc(c.code)}" class="rounded border-slate-300"><span>Kelas ${esc(c.code)}</span></label>`).join('') : '<p class="text-xs text-slate-400">Belum ada kelas.</p>';
  window.renderTeacherAssignmentUI();
};

window.addTeacherAssignment = async function () {
  const tid = $('assignTeacherSelect').value, subject = $('assignSubjectSelect').value;
  const sel = [...document.querySelectorAll('input[name="assignCls"]:checked')].map((c) => c.value);
  if (!tid || !subject || !sel.length) return alert('Lengkapi pilihan Guru, Mapel, dan Kelas!');
  const t = users.find((u) => u.id === tid); if (!t) return;
  const list = (t.teacherAssignments || []).map((a) => ({ ...a }));
  const ex = list.find((a) => a.subject === subject);
  if (ex) ex.classes = [...new Set([...(ex.classes || []), ...sel])]; else list.push({ subject, classes: sel });
  try { await updateDoc(doc(db, 'users', tid), { teacherAssignments: list }); logActivity(`Memperbarui penugasan guru: ${t.name}`); alert('Penugasan guru berhasil disimpan!'); }
  catch (err) { alert('Gagal menyimpan penugasan: ' + err.message); }
};

window.renderTeacherAssignmentUI = function () {
  const tb = $('teacherAssignmentTableBody'); if (!tb) return;
  const rows = [];
  users.filter((u) => u.role === 'guru').forEach((g) => (g.teacherAssignments || []).forEach((a, i) => rows.push(`<tr class="border-b text-xs">
    <td class="p-2.5 font-bold text-slate-800">${esc(g.name || g.username)}</td><td class="p-2.5 font-semibold text-blue-900">${esc(a.subject)}</td>
    <td class="p-2.5">${esc((a.classes || []).join(', ') || '-')}</td>
    <td class="p-2.5 text-center"><button onclick="removeTeacherAssignment('${g.id}',${i})" class="btn btn-sm btn-red">Hapus</button></td></tr>`)));
  tb.innerHTML = tmpl(rows, 4, 'Belum ada penugasan guru.');
};

window.removeTeacherAssignment = async function (tid, idx) {
  const t = users.find((u) => u.id === tid); if (!t || !confirm('Hapus penugasan ini?')) return;
  const list = (t.teacherAssignments || []).filter((_, i) => i !== idx);
  await updateDoc(doc(db, 'users', tid), { teacherAssignments: list });
};

// ---------- Kartu ujian (QR dibuat lokal, password tidak dikirim ke layanan luar) ----------
window.renderExamCards = function () {
  const grid = $('examCardsGrid'); if (!grid) return;
  const cls = $('cardClassFilter')?.value || '';
  const list = users.filter((u) => u.role === 'siswa' && (!cls || u.class === cls)).sort((a, b) => (a.class + a.name).localeCompare(b.class + b.name));
  const s = settingsCache;
  if (!list.length) { grid.innerHTML = '<p class="text-xs text-slate-400 p-4">Tidak ada kartu peserta untuk kelas ini.</p>'; return; }
  grid.innerHTML = list.map((st, i) => `<div class="border-2 border-slate-800 p-3 rounded-xl bg-white space-y-2 text-xs break-inside-avoid">
    <div class="text-center border-b pb-1"><strong class="uppercase text-[11px] block text-blue-950">${esc(s.schoolName || "SMP QUR'AN AL WAHDAH")}</strong>
      <span class="text-[9px] text-slate-500 uppercase font-bold">KARTU PESERTA UJIAN CBT T.A ${esc(s.academicYear || '2026/2027')} (${esc(s.semester || 'GANJIL')})</span></div>
    <div class="flex justify-between items-center gap-2"><div class="space-y-1 text-[11px] flex-1">
      <div><strong>Nama:</strong> ${esc(st.name || st.username)}</div><div><strong>NISN / Kelas:</strong> ${esc(st.nisn || '-')} / ${esc(st.class || '-')}</div>
      <div><strong>Username:</strong> <code class="font-bold text-blue-900">${esc(st.username)}</code></div>
      <div><strong>Password:</strong> <code class="font-bold text-rose-700">${esc(st.password || '-')}</code></div></div>
      <div class="text-center"><div id="qr_${i}" class="w-20 h-20 flex items-center justify-center"></div><span class="text-[8px] text-slate-500 block font-bold mt-0.5">Scan Login</span></div></div>
    <div class="border-t pt-1 text-[9px] text-slate-400 text-center font-bold uppercase">Harap Jaga Kerahasiaan Kartu Ujian Ini</div></div>`).join('');
  if (typeof QRCode === 'undefined') return;
  const base = location.origin + location.pathname;
  list.forEach((st, i) => new QRCode($(`qr_${i}`), { text: `${base}?u=${encodeURIComponent(st.username)}&p=${encodeURIComponent(st.password || '')}`, width: 80, height: 80, correctLevel: QRCode.CorrectLevel.L }));
};

// ---------- Log (dibaca sekali, 200 terbaru; bukan listener realtime) ----------
window.loadLogs = async function () {
  const tb = $('adminLogsTableBody'); if (!tb) return;
  try {
    const snap = await getDocs(collection(db, 'logs'));
    const logs = snap.docs.map((d) => d.data()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
    tb.innerHTML = tmpl(logs.map((l) => `<tr class="border-b text-xs"><td class="p-2 font-mono text-[10px] text-slate-500">${esc(l.formattedTime || fmtDateTime(l.timestamp))}</td>
      <td class="p-2 font-bold">${esc(l.user)}</td><td class="p-2">${esc(l.event)}</td></tr>`), 3, 'Belum ada log aktivitas.');
  } catch (err) { tb.innerHTML = `<tr><td colspan="3" class="p-4 text-rose-600">Gagal memuat log: ${esc(err.message)}</td></tr>`; }
};
window.clearOldLogs = async function () {
  if (!confirm('Hapus semua log yang lebih lama dari 30 hari?')) return;
  const limit = Date.now() - 30 * 864e5;
  const snap = await getDocs(collection(db, 'logs'));
  const old = snap.docs.filter((d) => (d.data().timestamp || 0) < limit);
  await runChunks(old, (d) => deleteDoc(d.ref), 25);
  alert(`${old.length} log lama dihapus.`); window.loadLogs();
};

// ---------- Pengaturan ----------
function initSettingsListener() {
  listen('settings', doc(db, 'settings', 'academic'), (s) => {
    settingsCache = s.exists() ? s.data() : {};
    $('headerSchoolName').innerText = settingsCache.schoolName || "SMP Qur'an Al Wahdah";
    $('headerSubTitle').innerText = `Sistem CBT - Tahun Ajaran ${settingsCache.academicYear || '2026/2027'} (${settingsCache.semester || 'Ganjil'})`;
  });
}
function loadSettingsForm() {
  const s = settingsCache;
  $('settingSchoolName').value = s.schoolName || ''; $('settingNPSN').value = s.npsn || '';
  $('settingYear').value = s.academicYear || '2026/2027'; $('settingSemester').value = s.semester || 'Ganjil';
}
window.handleSaveSettings = async function (e) {
  e.preventDefault();
  try {
    await setDoc(doc(db, 'settings', 'academic'), { schoolName: $('settingSchoolName').value.trim(), npsn: $('settingNPSN').value.trim(),
      academicYear: $('settingYear').value.trim(), semester: $('settingSemester').value, updatedAt: Date.now() });
    alert('Pengaturan sekolah berhasil disimpan!'); logActivity('Memperbarui pengaturan sekolah');
  } catch (err) { alert('Gagal menyimpan pengaturan: ' + err.message); }
};

// ---------- Backup & Restore ----------
const BACKUP_COLLECTIONS = ['users', 'classes', 'subjects', 'packages', 'schedules', 'sessions', 'settings'];
window.backupSystemData = async function () {
  try {
    const parts = await Promise.all(BACKUP_COLLECTIONS.map((c) => getDocs(collection(db, c))));
    const data = {}; BACKUP_COLLECTIONS.forEach((c, i) => (data[c] = parts[i].docs.map((d) => ({ id: d.id, ...d.data() }))));
    const blob = new Blob([JSON.stringify({ backupTimestamp: Date.now(), backupDate: fmtDateTime(), data })], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `Backup_CBT_${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    logActivity('Melakukan Backup Database ke file JSON.'); alert('Backup database berhasil diunduh!');
  } catch (err) { alert('Gagal melakukan backup: ' + err.message); }
};
window.restoreSystemData = function (e) {
  const file = e.target.files[0]; if (!file) return;
  if (!confirm('PERINGATAN: Restore akan menimpa dokumen dengan ID yang sama di Firestore. Lanjutkan?')) { e.target.value = ''; return; }
  const r = new FileReader();
  r.onload = async (evt) => {
    try {
      const obj = JSON.parse(evt.target.result);
      if (!obj.data) return alert('Format file backup JSON tidak valid!');
      const jobs = [];
      for (const [col, items] of Object.entries(obj.data)) if (Array.isArray(items)) items.forEach((it) => { const { id, ...rest } = it; jobs.push([col, id, rest]); });
      await runChunks(jobs, ([col, id, rest]) => (id ? setDoc(doc(db, col, id), rest) : addDoc(collection(db, col), rest)), 25);
      logActivity(`Memulihkan Database dari file JSON (${jobs.length} dokumen).`);
      alert(`Restore selesai!\n✔ ${jobs.length} dokumen dipulihkan.`); location.reload();
    } catch (err) { alert('Gagal memulihkan database: ' + err.message); }
  };
  r.readAsText(file);
};
// nama lama tetap tersedia
window.exportDatabaseJson = window.backupSystemData;
window.importDatabaseJson = window.restoreSystemData;
