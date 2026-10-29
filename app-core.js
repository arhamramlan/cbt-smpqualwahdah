// ==========================================
// APP-CORE.JS: MANAJEMEN PENGGUNA, AUTH & MASTER DATA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDefaultData();
  checkSession();
  renderSubjectTable();
});

// 1. Inisialisasi Data Default jika LocalStorage Kosong
function initDefaultData() {
  if (!localStorage.getItem('cbt_users')) {
    const defaultUsers = [
      { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
      { username: 'guru', password: 'guru123', name: 'Ustadz Fulan, S.Pd.', role: 'guru' },
      { username: 'siswa', password: 'siswa123', name: 'Ahmad Abdullah', role: 'siswa' }
    ];
    localStorage.setItem('cbt_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('cbt_subjects')) {
    const defaultSubjects = [
      { code: 'PAI', name: 'Pendidikan Agama Islam' },
      { code: 'MTK', name: 'Matematika' }
    ];
    localStorage.setItem('cbt_subjects', JSON.stringify(defaultSubjects));
  }
}

// 2. Autentikasi dan Manajemen Sesi
function handleLogin(e) {
  e.preventDefault();
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value.trim();

  const users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  const user = users.find(x => x.username === u && x.password === p);

  if (!user) {
    alert('Username atau password salah!');
    return;
  }

  localStorage.setItem('cbt_session', JSON.stringify(user));
  checkSession();
}

function handleLogout() {
  localStorage.removeItem('cbt_session');
  location.reload();
}

function checkSession() {
  const session = JSON.parse(localStorage.getItem('cbt_session') || 'null');
  
  // Sembunyikan semua tampilan terlebih dahulu
  document.getElementById('viewLogin').classList.add('hidden');
  document.getElementById('viewAdmin').classList.add('hidden');
  document.getElementById('viewTeacher').classList.add('hidden');
  document.getElementById('viewStudent').classList.add('hidden');
  document.getElementById('navUserArea').classList.add('hidden');

  if (!session) {
    document.getElementById('viewLogin').classList.remove('hidden');
    return;
  }

  // Tampilkan Navigasi Sesi User
  document.getElementById('navUserArea').classList.remove('hidden');
  document.getElementById('navUserInfo').innerText = `${session.name} (${session.role.toUpperCase()})`;

  // Alihkan sesuai Role
  if (session.role === 'admin') {
    document.getElementById('viewAdmin').classList.remove('hidden');
  } else if (session.role === 'guru') {
    document.getElementById('viewTeacher').classList.remove('hidden');
  } else if (session.role === 'siswa') {
    document.getElementById('viewStudent').classList.remove('hidden');
  }
}

// 3. Admin: Tambah Pengguna Baru (Single)
function handleAddUser(e) {
  e.preventDefault();
  const username = document.getElementById('addUserUsername').value.trim();
  const password = document.getElementById('addUserPassword').value.trim();
  const name = document.getElementById('addUserName').value.trim();
  const role = document.getElementById('addUserRole').value;

  let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
  if (users.some(x => x.username === username)) {
    alert('Username sudah terdaftar!');
    return;
  }

  users.push({ username, password, name, role });
  localStorage.setItem('cbt_users', JSON.stringify(users));
  alert('Pengguna berhasil ditambahkan!');
  e.target.reset();
}

// 4. Admin: Impor Pengguna Massal dari Excel
function downloadUserExcelTemplate() {
  const templateData = [
    { "Username": "siswa01", "Password": "123", "Nama Lengkap": "Siswa Contoh 1", "Role": "siswa" },
    { "Username": "guru01", "Password": "123", "Nama Lengkap": "Guru Contoh 1", "Role": "guru" }
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pengguna");
  XLSX.writeFile(wb, "Template_User_CBT.xlsx");
}

function handleUploadUserExcel() {
  const fileInput = document.getElementById('excelUserFileInput');
  if (!fileInput.files.length) {
    alert('Pilih file Excel terlebih dahulu!');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let users = JSON.parse(localStorage.getItem('cbt_users') || '[]');
    let count = 0;

    rows.forEach(row => {
      if (row.Username && row.Password) {
        if (!users.some(x => x.username === String(row.Username))) {
          users.push({
            username: String(row.Username).trim(),
            password: String(row.Password).trim(),
            name: row['Nama Lengkap'] || row.Username,
            role: (row.Role || 'siswa').toLowerCase().trim()
          });
          count++;
        }
      }
    });

    localStorage.setItem('cbt_users', JSON.stringify(users));
    alert(`Berhasil mengimpor ${count} pengguna baru!`);
    fileInput.value = '';
  };

  reader.readAsArrayBuffer(file);
}

// 5. Admin: Kelola Mata Pelajaran (Tambah, Render, Edit, Hapus)
function handleAddSubject(e) {
  e.preventDefault();
  const code = document.getElementById('addSubjectCode').value.trim().toUpperCase();
  const name = document.getElementById('addSubjectName').value.trim();

  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  if (subjects.some(x => x.code === code)) {
    alert('Kode mapel sudah ada!');
    return;
  }

  subjects.push({ code, name });
  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  renderSubjectTable();
  e.target.reset();
}

function renderSubjectTable() {
  const tbody = document.getElementById('adminSubjectTableBody');
  if (!tbody) return;

  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  tbody.innerHTML = '';

  if (subjects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="p-3 text-center text-slate-400">Belum ada mata pelajaran.</td></tr>`;
    return;
  }

  subjects.forEach((subject, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50';
    tr.innerHTML = `
      <td class="p-2 font-semibold">${subject.code}</td>
      <td class="p-2">${subject.name}</td>
      <td class="p-2 text-center space-x-1">
        <button onclick="editSubject(${index})" class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-xs transition">
          <i class="fa-solid fa-pen-to-square"></i> Edit
        </button>
        <button onclick="deleteSubject(${index})" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded text-xs transition">
          <i class="fa-solid fa-trash"></i> Hapus
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editSubject(index) {
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const subject = subjects[index];

  const newCode = prompt("Masukkan Kode Mapel Baru:", subject.code);
  if (newCode === null) return;

  const newName = prompt("Masukkan Nama Mapel Baru:", subject.name);
  if (newName === null) return;

  if (!newCode.trim() || !newName.trim()) {
    alert("Kode dan Nama Mapel tidak boleh kosong!");
    return;
  }

  subjects[index] = {
    code: newCode.trim().toUpperCase(),
    name: newName.trim()
  };

  localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
  renderSubjectTable();
  alert("Mata pelajaran berhasil diperbarui!");
}

function deleteSubject(index) {
  let subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const subjectName = subjects[index].name;

  if (confirm(`Apakah Anda yakin ingin menghapus mapel "${subjectName}"?`)) {
    subjects.splice(index, 1);
    localStorage.setItem('cbt_subjects', JSON.stringify(subjects));
    renderSubjectTable();
    alert("Mata pelajaran berhasil dihapus!");
  }
}
