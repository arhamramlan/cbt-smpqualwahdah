/* ==========================================================================
   PERSISTENCE & ACCESSIBLE ACCOUNTS (DENGAN RECOVERY AUTOMATIS)
   ========================================================================== */

let currentUser = null; 

let defaultUsers = [
  { id: 1, name: "Administrator Utama", username: "admin", password: "adminpassword", role: "admin" },
  { id: 2, name: "Ustadz Ahmad, S.Pd.", username: "guru1", password: "gurupassword", role: "guru", assignedInfo: "Matematika" },
  { id: 3, name: "Ustadz Mahmud, Lc.", username: "guru2", password: "gurupassword", role: "guru", assignedInfo: "PAI" },
  { id: 4, name: "Muhammad Ali", username: "siswa1", password: "siswapassword", role: "siswa", studentClass: "Kelas 7A" }
];

let usersList = [];

function loadUsersData() {
  const savedUsers = localStorage.getItem("cbt_users");
  if (savedUsers) {
    try {
      usersList = JSON.parse(savedUsers);
      // Validasi: Jika data lama tidak memiliki akun admin / guru, perbarui dengan data default
      const hasAdmin = usersList.some(u => u.role === 'admin');
      const hasGuru = usersList.some(u => u.role === 'guru');
      if (!hasAdmin || !hasGuru) {
        usersList = [...defaultUsers];
        saveUsersData();
      }
    } catch (e) {
      usersList = [...defaultUsers];
      saveUsersData();
    }
  } else {
    usersList = [...defaultUsers];
    saveUsersData();
  }
}

function saveUsersData() {
  localStorage.setItem("cbt_users", JSON.stringify(usersList));
}

/* ==========================================================================
   LOGIKA LOGIN TERPERBAIKI (FULL ERROR HANDLING)
   ========================================================================== */

function handleLogin(e) {
  e.preventDefault();
  
  // Ambil input form dan bersihkan spasi / huruf kapital
  const inputRole = document.getElementById('loginRole').value.trim().toLowerCase();
  const inputUser = document.getElementById('loginUsername').value.trim().toLowerCase();
  const inputPass = document.getElementById('loginPassword').value.trim();

  // Pastikan data akun terbaru dimuat
  loadUsersData();

  // Cari user dengan pencocokan aman (case-insensitive)
  const foundUser = usersList.find(u => 
    u.username.toLowerCase() === inputUser && 
    u.password === inputPass && 
    u.role.toLowerCase() === inputRole
  );

  if (foundUser) {
    currentUser = { ...foundUser };
    
    // Tampilkan header status user
    const userHeader = document.getElementById('userInfoHeader');
    const userBadge = document.getElementById('userBadge');
    if (userHeader) userHeader.classList.remove('hidden');
    if (userBadge) userBadge.innerText = `${foundUser.name} (${foundUser.role.toUpperCase()})`;

    // Pengalihan halaman berdasarkan peran yang terverifikasi
    if (foundUser.role.toLowerCase() === 'admin') {
      setupAdminDashboard();
      showView('viewAdmin');
    } else if (foundUser.role.toLowerCase() === 'guru') {
      setupTeacherDashboard();
      showView('viewTeacher');
    } else if (foundUser.role.toLowerCase() === 'siswa') {
      setupStudentInstruction();
      showView('viewStudentInstruction');
    }
  } else {
    alert(`Login Gagal!\n\nDetail yang dimasukkan:\n• Peran Akses: ${inputRole.toUpperCase()}\n• Username: ${inputUser}\n\nPastikan Peran Akses, Username, dan Password yang Anda pilih/ketikkan sudah sesuai.`);
  }
}

// Inisialisasi awal saat halaman dimuat
window.addEventListener('DOMContentLoaded', () => {
  loadUsersData();
});
