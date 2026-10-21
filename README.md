# Aplikasi CBT Online Sekolah (GitHub Pages Ready)

Aplikasi Web Ujian Berbasis Komputer (CBT) ringan berbasis HTML5, Tailwind CSS, dan JavaScript modern dengan fitur anti-kecurangan dan integrasi Cloud Database.

## 🚀 Fitur Utama
- **Role Login**: Akses khusus Admin/Guru dan Siswa.
- **Admin Panel**: Buat soal manual, unggah soal via JSON, atur durasi ujian, rekap nilai & export Excel/CSV.
- **Fitur Anti-Kecurangan (Anti-Cheating)**:
  - Layar Penuh Wajib (Fullscreen Mandatory)
  - Deteksi Pindah Tab / Blur Window (VisibilityChange API)
  - Blokir Klik Kanan, Copy-Paste, & Shortkey DevTools/F12
- **Hybrid Storage**: Otomatis menyimpan di `localStorage` browser dan mendukung koneksi **Firebase Firestore** secara terpusat.

---

## 🛠️ Langkah-Langkah Deployment ke GitHub Pages

1. **Buat Repository Baru di GitHub**:
   - Masuk ke akun GitHub Anda -> Klik **New Repository**.
   - Beri nama repository (misal: `cbt-sekolah`).
   - Pilih opsi **Public** -> Klik **Create repository**.

2. **Upload File Kode**:
   - Upload file `index.html`, `app.js`, `style.css`, dan `README.md` ke dalam repository tersebut.

3. **Aktifkan GitHub Pages**:
   - Masuk ke tab **Settings** di repository GitHub Anda.
   - Pada menu sebelah kiri, klik **Pages**.
   - Di bagian **Build and deployment** -> **Branch**, pilih `main` (atau `master`) dan folder `/ (root)`.
   - Klik **Save**.

4. **Selesai**:
   - Tunggu 1–2 menit, link situs web CBT Anda akan muncul di bagian atas halaman (contoh: `https://username.github.io/cbt-sekolah/`).

---

## 🔐 Cara Konfigurasi Firebase Firestore (Opsional)
Jika ingin rekap nilai terkoneksi secara terpusat dari HP/Laptop siswa mana pun:
1. Buat proyek di [Firebase Console](https://console.firebase.google.com/).
2. Buat database **Cloud Firestore** dalam mode *Test Mode*.
3. Salin kredensial `firebaseConfig` dari proyek Firebase Anda dan tempelkan pada bagian atas file `app.js`.