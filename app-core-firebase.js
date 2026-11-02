// =============================================================
// FITUR TEMPLATE & IMPOR PENGGUNA VIA EXCEL (.XLSX)
// =============================================================

// 1. Fungsi Unduh Template Excel
window.downloadUserTemplate = function() {
  if (typeof XLSX === 'undefined') {
    return alert("Pustaka SheetJS (XLSX) belum dimuat. Pastikan terhubung ke internet.");
  }

  // Data contoh template baku
  const templateData = [
    {
      "Nama Lengkap": "Ahmad Abdullah",
      "Username": "ahmad01",
      "Role": "siswa",
      "NISN": "0012345678",
      "Kelas": "VII"
    },
    {
      "Nama Lengkap": "Siti Aminah",
      "Username": "siti01",
      "Role": "siswa",
      "NISN": "0087654321",
      "Kelas": "VII"
    },
    {
      "Nama Lengkap": "Ustadz Muhammad, S.Pd.",
      "Username": "guru_mtk",
      "Role": "guru",
      "NISN": "",
      "Kelas": ""
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Template Pengguna");

  // Atur lebar kolom
  worksheet['!cols'] = [
    { wch: 30 }, // Nama Lengkap
    { wch: 18 }, // Username
    { wch: 12 }, // Role
    { wch: 15 }, // NISN
    { wch: 10 }  // Kelas
  ];

  XLSX.writeFile(workbook, "Template_Import_Pengguna_CBT.xlsx");
};

// 2. Fungsi Impor Excel ke Firestore
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
      
      // Konversi sheet ke JSON
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

        if (name && username) {
          const newDocRef = doc(collection(db, "users"));
          await setDoc(newDocRef, {
            name: name,
            username: username,
            role: role,
            nisn: nisn,
            class: userClass,
            active: true,
            createdAt: Date.now()
          });
          successCount++;
        } else {
          failCount++;
        }
      }

      alert(`Proses Impor Selesai!\n✔ ${successCount} Pengguna Berhasil Ditambahkan ke Firestore.\n${failCount > 0 ? `✖ ${failCount} Baris Gagal (Nama/Username kosong).` : ''}`);
      
      // Reset input file
      e.target.value = '';
    } catch (err) {
      alert("Gagal memproses file Excel: " + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
};

// Helper Filter Tabel Pengguna
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

    if (matchesSearch && matchesRole && matchesClass) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
};
