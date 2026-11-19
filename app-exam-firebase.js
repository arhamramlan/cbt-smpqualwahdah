// app-exam-firebase.js — pintu masuk modul ujian. Dimuat oleh index.html; memuat modul lain:
//   constants.js · scoring.js (murni, ada tesnya) · util.js · teacher-state.js
//   teacher-questions.js (paket, bacaan, bank, impor) · teacher-exams.js (jadwal, monitoring, koreksi, laporan)
//   app-student-firebase.js (mesin ujian siswa)
import { startTeacher } from './teacher-state.js';
import './teacher-questions.js';
import './teacher-exams.js';
import './app-student-firebase.js';

window.initTeacherFirebaseDashboard = (user) => startTeacher(user);
