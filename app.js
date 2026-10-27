/**
 * CBT System - SMP Qur'an Al Wahdah Engine
 * Frontend Single-Page Application JS (Fixed Demo Login)
 */

// =========================================================================
// 1. SUPABASE CLIENT & MOCK DEMO STATE CONFIGURATION
// =========================================================================
let SUPABASE_URL = localStorage.getItem('cbt_sb_url') || "https://wwizvphxjieoorngoszd.supabase.co";
let SUPABASE_KEY = localStorage.getItem('cbt_sb_key') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3aXp2cGh4amllb29ybmdvc3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTI0NjYsImV4cCI6MjEwODUyODQ2Nn0.6xNA_7dU9z0tyvLvqwCpsieuegzu9a5le2aQ1CeSaTg";
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
        console.warn("Gagal menginisialisasi Supabase:", e);
    }
}

// Mock Data State
const DEMO_STATE = {
    users: [
        { id: 'u1', name: 'Ahmad Faisal', role: 'murid', class_name: '7A', email: 'murid@alwahdah.sch.id' },
        { id: 'u2', name: 'Ustadz Abdullah, S.Pd.', role: 'guru', class_name: '7A', email: 'guru@alwahdah.sch.id' },
        { id: 'u3', name: 'Admin Utama', role: 'admin', class_name: '-', email: 'admin@alwahdah.sch.id' }
    ],
    subjects: [
        { id: 's1', name: 'Pendidikan Agama Islam (PAI)', class_name: '7A', teacher_id: 'u2' },
        { id: 's2', name: 'Bahasa Arab', class_name: '7A', teacher_id: 'u2' }
    ],
    schedules: [
        { id: 'sch1', subject_id: 's1', subject_name: 'Pendidikan Agama Islam (PAI)', class_name: '7A', start_time: '2026-01-01T07:00', end_time: '2026-12-31T18:00', duration_minutes: 60, is_active: true }
    ],
    questions: [
        { id: 'q1', subject_id: 's1', question_text: 'Rukun Islam yang pertama adalah...', option_a: 'Mendirikan Shalat', option_b: 'Mengucapkan Dua Kalimat Syahadat', option_c: 'Menunaikan Zakat', option_d: 'Berpuasa Ramadhan', correct_option: 'B' },
        { id: 'q2', subject_id: 's1', question_text: 'Surah al-Fatihah terdiri dari berapa ayat?', option_a: '5 Ayat', option_b: '6 Ayat', option_c: '7 Ayat', option_d: '8 Ayat', correct_option: 'C' },
        { id: 'q3', subject_id: 's1', question_text: 'Kitab suci Al-Qur\'an diturunkan kepada Nabi...', option_a: 'Musa A.S.', option_b: 'Isa A.S.', option_c: 'Ibrahim A.S.', option_d: 'Muhammad S.A.W.', correct_option: 'D' }
    ],
    results: []
};

// Application Global State
let currentUser = null;
let currentExam = {
    schedule: null,
    questions: [],
    userAnswers: {},
    doubtful: {},
    currentIndex: 0,
    timerInterval: null,
    remainingSeconds: 0,
    violationsCount: 0
};

// =========================================================================
// 2. INITIALIZATION & ROUTING
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) lucide.createIcons();
    checkDatabaseConnectionStatus();
    checkSession();
    setupAntiCheatingGlobal();
});

function checkDatabaseConnectionStatus() {
    const banner = document.getElementById('db-status-banner');
    const statusText = document.getElementById('db-status-text');
    
    if (supabase) {
        banner.className = "mb-4 p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-xs flex justify-between items-center shadow-sm";
        statusText.innerHTML = `<strong>Koneksi Supabase Aktif:</strong> Terhubung ke ${SUPABASE_URL}`;
    } else {
        banner.className = "mb-4 p-3 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg text-xs flex justify-between items-center shadow-sm";
        statusText.innerHTML = `<strong>Mode Standalone/Demo Active:</strong> Menggunakan penyimpanan memori lokal sementara. Klik untuk konfigurasi Supabase.`;
    }
}

function showView(viewId) {
    const views = ['view-login', 'view-murid-dashboard', 'view-murid-cbt', 'view-guru-dashboard', 'view-admin-dashboard'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add('hidden');
    });
    
    const targetEl = document.getElementById(viewId);
    if (targetEl) targetEl.classList.remove('hidden');

    const userInfoBar = document.getElementById('user-info-bar');
    if (currentUser && viewId !== 'view-login') {
        userInfoBar.classList.remove('hidden');
        userInfoBar.classList.add('flex');
        document.getElementById('user-display-name').textContent = currentUser.name;
        document.getElementById('user-display-role').textContent = `${currentUser.role} (${currentUser.class_name || '-'})`;
    } else {
        userInfoBar.classList.add('hidden');
        userInfoBar.classList.remove('flex');
    }
}

// =========================================================================
// 3. AUTHENTICATION SYSTEM (FIXED FOR DEMO & SUPABASE)
// =========================================================================
function fillDemoAcc(role, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const emailInput = document.getElementById('login-email');
    const roleInput = document.getElementById('login-role');
    const passInput = document.getElementById('login-password');

    if (role === 'murid') {
        emailInput.value = 'murid@alwahdah.sch.id';
        passInput.value = '123456';
        roleInput.value = 'murid';
    } else if (role === 'guru') {
        emailInput.value = 'guru@alwahdah.sch.id';
        passInput.value = '123456';
        roleInput.value = 'guru';
    } else if (role === 'admin') {
        emailInput.value = 'admin@alwahdah.sch.id';
        passInput.value = '123456';
        roleInput.value = 'admin';
    }

    // Langsung jalankan login otomatis
    executeLoginProcess(emailInput.value, roleInput.value);
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const role = document.getElementById('login-role').value;
    
    await executeLoginProcess(email, role);
}

async function executeLoginProcess(email, role) {
    if (supabase) {
        try {
            const { data, error } = await supabase.from('profiles').select('*').eq('role', role).limit(1);
            if (data && data.length > 0) {
                currentUser = data[0];
            } else {
                currentUser = { id: 'sb_u1', name: email ? email.split('@')[0] : 'User', role: role, class_name: '7A' };
            }
        } catch (err) {
            currentUser = { id: 'sb_u1', name: email ? email.split('@')[0] : 'User', role: role, class_name: '7A' };
        }
    } else {
        // MODE DEMO
        const found = DEMO_STATE.users.find(u => u.role === role);
        if (found) {
            currentUser = { ...found, email: email || found.email };
        } else {
            currentUser = { id: 'demo_' + Date.now(), name: email ? email.split('@')[0] : 'Siswa Demo', role: role, class_name: '7A', email: email };
        }
    }

    localStorage.setItem('cbt_session_user', JSON.stringify(currentUser));
    navigateDashboardByRole();
}

function checkSession() {
    const session = localStorage.getItem('cbt_session_user');
    if (session) {
        try {
            currentUser = JSON.parse(session);
            navigateDashboardByRole();
        } catch(e) {
            showView('view-login');
        }
    } else {
        showView('view-login');
    }
}

function handleLogout() {
    if (confirm('Apakah Anda yakin ingin keluar dari aplikasi?')) {
        currentUser = null;
        localStorage.removeItem('cbt_session_user');
        showView('view-login');
    }
}

function navigateDashboardByRole() {
    if (!currentUser) return showView('view-login');
    if (currentUser.role === 'murid') {
        initMuridDashboard();
        showView('view-murid-dashboard');
    } else if (currentUser.role === 'guru') {
        initGuruDashboard();
        showView('view-guru-dashboard');
    } else if (currentUser.role === 'admin') {
        initAdminDashboard();
        showView('view-admin-dashboard');
    }
}

// =========================================================================
// 4. MURID & CBT ENGINE (ANTI-KECURANGAN)
// =========================================================================
function initMuridDashboard() {
    document.getElementById('student-welcome-name').textContent = currentUser.name;
    document.getElementById('student-welcome-class').textContent = currentUser.class_name || '7A';

    const container = document.getElementById('student-schedules-list');
    container.innerHTML = '';

    const schedules = DEMO_STATE.schedules;
    if (schedules.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-xs text-gray-500">Belum ada jadwal ujian aktif untuk kelas Anda.</div>`;
        return;
    }

    schedules.forEach(sch => {
        const item = document.createElement('div');
        item.className = 'p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-gray-50';
        item.innerHTML = `
            <div>
                <h4 class="font-bold text-gray-800 text-sm">${sch.subject_name}</h4>
                <div class="text-xs text-gray-500 flex items-center gap-3 mt-1">
                    <span>Durasi: <strong>${sch.duration_minutes} Menit</strong></span>
                    <span>Kelas: <strong>${sch.class_name}</strong></span>
                </div>
            </div>
            <button onclick="startExam('${sch.id}')" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg text-xs shadow flex items-center gap-1 transition">
                <i data-lucide="play-circle" class="w-4 h-4"></i> Kerjakan Ujian
            </button>
        `;
        container.appendChild(item);
    });
    if (window.lucide) lucide.createIcons();
}

function startExam(scheduleId) {
    const sch = DEMO_STATE.schedules.find(s => s.id === scheduleId) || DEMO_STATE.schedules[0];
    const questions = DEMO_STATE.questions.filter(q => q.subject_id === sch.subject_id);

    if (questions.length === 0) {
        alert('Belum ada soal pada mata pelajaran ini!');
        return;
    }

    currentExam = {
        schedule: sch,
        questions: questions,
        userAnswers: {},
        doubtful: {},
        currentIndex: 0,
        timerInterval: null,
        remainingSeconds: sch.duration_minutes * 60,
        violationsCount: 0
    };

    document.getElementById('cbt-title').textContent = sch.subject_name;
    document.getElementById('cbt-student-info').textContent = `${currentUser.name} (${currentUser.class_name})`;

    document.body.classList.add('exam-mode');

    startTimer();
    renderCBTQuestion();
    renderCBTGrid();
    showView('view-murid-cbt');
}

function startTimer() {
    clearInterval(currentExam.timerInterval);
    currentExam.timerInterval = setInterval(() => {
        currentExam.remainingSeconds--;
        const hours = Math.floor(currentExam.remainingSeconds / 3600);
        const minutes = Math.floor((currentExam.remainingSeconds % 3600) / 60);
        const seconds = currentExam.remainingSeconds % 60;

        document.getElementById('cbt-timer').textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (currentExam.remainingSeconds <= 0) {
            clearInterval(currentExam.timerInterval);
            alert('Waktu ujian telah habis! Jawaban Anda akan terkirim secara otomatis.');
            submitExam();
        }
    }, 1000);
}

function renderCBTQuestion() {
    const q = currentExam.questions[currentExam.currentIndex];
    document.getElementById('cbt-q-num').textContent = currentExam.currentIndex + 1;
    document.getElementById('cbt-q-text').textContent = q.question_text;

    document.getElementById('cbt-doubtful-check').checked = !!currentExam.doubtful[currentExam.currentIndex];

    const optionsContainer = document.getElementById('cbt-options');
    optionsContainer.innerHTML = '';

    const opts = [
        { key: 'A', text: q.option_a },
        { key: 'B', text: q.option_b },
        { key: 'C', text: q.option_c },
        { key: 'D', text: q.option_d }
    ];

    opts.forEach(opt => {
        const selected = currentExam.userAnswers[currentExam.currentIndex] === opt.key;
        const optBtn = document.createElement('div');
        optBtn.onclick = () => selectAnswer(opt.key);
        optBtn.className = `p-3.5 rounded-lg border flex items-center gap-3 cursor-pointer transition ${
            selected ? 'bg-brand-50 border-brand-600 text-brand-900 font-semibold shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
        }`;
        optBtn.innerHTML = `
            <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                selected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
            }">${opt.key}</div>
            <div class="text-sm">${opt.text}</div>
        `;
        optionsContainer.appendChild(optBtn);
    });

    document.getElementById('btn-prev-q').disabled = currentExam.currentIndex === 0;
}

function selectAnswer(optionKey) {
    currentExam.userAnswers[currentExam.currentIndex] = optionKey;
    renderCBTQuestion();
    renderCBTGrid();
}

function toggleDoubtful() {
    const isChecked = document.getElementById('cbt-doubtful-check').checked;
    currentExam.doubtful[currentExam.currentIndex] = isChecked;
    renderCBTGrid();
}

function prevQuestion() {
    if (currentExam.currentIndex > 0) {
        currentExam.currentIndex--;
        renderCBTQuestion();
    }
}

function nextQuestion() {
    if (currentExam.currentIndex < currentExam.questions.length - 1) {
        currentExam.currentIndex++;
        renderCBTQuestion();
    }
}

function jumpToQuestion(idx) {
    currentExam.currentIndex = idx;
    renderCBTQuestion();
}

function renderCBTGrid() {
    const grid = document.getElementById('cbt-grid-nav');
    grid.innerHTML = '';

    currentExam.questions.forEach((q, idx) => {
        const isAnswered = currentExam.userAnswers[idx] !== undefined;
        const isDoubt = currentExam.doubtful[idx];
        const isCurrent = idx === currentExam.currentIndex;

        let bgClass = 'bg-white text-gray-700 border-gray-300';
        if (isDoubt) {
            bgClass = 'bg-amber-400 text-white border-amber-500 font-bold';
        } else if (isAnswered) {
            bgClass = 'bg-brand-600 text-white border-brand-700 font-bold';
        }

        const activeRing = isCurrent ? 'ring-2 ring-brand-800 ring-offset-1' : '';

        const btn = document.createElement('button');
        btn.onclick = () => jumpToQuestion(idx);
        btn.className = `h-9 w-full rounded border text-xs font-semibold flex items-center justify-center ${bgClass} ${activeRing}`;
        btn.textContent = idx + 1;
        grid.appendChild(btn);
    });
}

function setupAntiCheatingGlobal() {
    document.addEventListener('contextmenu', (e) => {
        if (document.body.classList.contains('exam-mode')) {
            e.preventDefault();
            alert('Fitur klik kanan dinonaktifkan selama ujian berlangsung!');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('exam-mode')) return;

        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && (e.key === 'u' || e.key === 'c' || e.key === 'v' || e.key === 'a'))
        ) {
            e.preventDefault();
            alert('Aksi tombol kombinasi disekat oleh sistem anti-kecurangan!');
        }
    });

    window.addEventListener('visibilitychange', handleCheatingDetection);
    window.addEventListener('blur', handleCheatingDetection);
}

function handleCheatingDetection() {
    if (!document.body.classList.contains('exam-mode')) return;

    if (document.hidden || !document.hasFocus()) {
        currentExam.violationsCount++;
        alert(`PERINGATAN PELANGGARAN (${currentExam.violationsCount}/3)!\n\nTerdeteksi meninggalkan layar ujian. Batas maksimal adalah 3x.`);

        if (currentExam.violationsCount >= 3) {
            alert('Anda telah melanggar aturan ujian sebanyak 3 kali! Sistem menghentikan ujian Anda.');
            submitExam();
        }
    }
}

function confirmSubmitExam() {
    const totalQ = currentExam.questions.length;
    const answeredQ = Object.keys(currentExam.userAnswers).length;

    if (answeredQ < totalQ) {
        if (!confirm(`Anda baru menjawab ${answeredQ} dari ${totalQ} soal. Yakin ingin menyelesaikan ujian?`)) {
            return;
        }
    } else {
        if (!confirm('Apakah Anda yakin ingin menyelesaikan ujian ini?')) {
            return;
        }
    }

    submitExam();
}

function submitExam() {
    clearInterval(currentExam.timerInterval);
    document.body.classList.remove('exam-mode');

    let correctCount = 0;
    currentExam.questions.forEach((q, idx) => {
        if (currentExam.userAnswers[idx] === q.correct_option) {
            correctCount++;
        }
    });

    const totalQuestions = currentExam.questions.length;
    const score = Math.round((correctCount / totalQuestions) * 100);

    const resultRecord = {
        id: 'res_' + Date.now(),
        student_id: currentUser.id,
        student_name: currentUser.name,
        subject_id: currentExam.schedule.subject_id,
        subject_name: currentExam.schedule.subject_name,
        score: score,
        total_questions: totalQuestions,
        correct_answers: correctCount,
        violations_count: currentExam.violationsCount,
        submitted_at: new Date().toLocaleString()
    };

    DEMO_STATE.results.push(resultRecord);

    alert(`Ujian Selesai!\n\nNilai Anda: ${score}\nBenar: ${correctCount}/${totalQuestions}\nPelanggaran Terdeteksi: ${currentExam.violationsCount}`);
    
    navigateDashboardByRole();
}

// =========================================================================
// 5. GURU DASHBOARD
// =========================================================================
function initGuruDashboard() {
    const subjectSelect = document.getElementById('guru-subject-select');
    subjectSelect.innerHTML = '';

    DEMO_STATE.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = `${sub.name} (Kelas ${sub.class_name})`;
        subjectSelect.appendChild(opt);
    });

    loadGuruQuestions();
    loadGuruResults();
}

function switchGuruTab(tab) {
    if (tab === 'soal') {
        document.getElementById('guru-tab-soal-content').classList.remove('hidden');
        document.getElementById('guru-tab-hasil-content').classList.add('hidden');
        document.getElementById('tab-guru-soal').className = 'px-4 py-2 border-b-2 border-brand-600 text-brand-700 font-semibold text-sm';
        document.getElementById('tab-guru-hasil').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-semibold text-sm';
    } else {
        document.getElementById('guru-tab-soal-content').classList.add('hidden');
        document.getElementById('guru-tab-hasil-content').classList.remove('hidden');
        document.getElementById('tab-guru-soal').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-semibold text-sm';
        document.getElementById('tab-guru-hasil').className = 'px-4 py-2 border-b-2 border-brand-600 text-brand-700 font-semibold text-sm';
    }
}

function loadGuruQuestions() {
    const subjectId = document.getElementById('guru-subject-select').value;
    const tbody = document.getElementById('guru-questions-tbody');
    tbody.innerHTML = '';

    const qList = DEMO_STATE.questions.filter(q => q.subject_id === subjectId);

    if (qList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Belum ada soal pada mata pelajaran ini.</td></tr>`;
        return;
    }

    qList.forEach((q, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 text-center font-bold text-gray-600">${idx + 1}</td>
            <td class="p-3 max-w-md font-medium text-gray-800">${q.question_text}</td>
            <td class="p-3 text-gray-600 text-[11px]">
                A: ${q.option_a} | B: ${q.option_b}<br>C: ${q.option_c} | D: ${q.option_d}
            </td>
            <td class="p-3 text-center font-bold text-brand-700">${q.correct_option}</td>
            <td class="p-3 text-center space-x-1">
                <button onclick="deleteQuestion('${q.id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteQuestion(id) {
    if (confirm('Hapus soal ini?')) {
        const idx = DEMO_STATE.questions.findIndex(q => q.id === id);
        if (idx !== -1) DEMO_STATE.questions.splice(idx, 1);
        loadGuruQuestions();
    }
}

function openModalAddQuestion() {
    document.getElementById('modal-add-question').classList.remove('hidden');
}

function closeModalAddQuestion() {
    document.getElementById('modal-add-question').classList.add('hidden');
}

function saveQuestionForm(e) {
    e.preventDefault();
    const subjectId = document.getElementById('guru-subject-select').value;
    const newQ = {
        id: 'q_' + Date.now(),
        subject_id: subjectId,
        question_text: document.getElementById('fq-text').value,
        option_a: document.getElementById('fq-a').value,
        option_b: document.getElementById('fq-b').value,
        option_c: document.getElementById('fq-c').value,
        option_d: document.getElementById('fq-d').value,
        correct_option: document.getElementById('fq-correct').value
    };

    DEMO_STATE.questions.push(newQ);
    closeModalAddQuestion();
    loadGuruQuestions();
    alert('Soal berhasil ditambahkan!');
}

function loadGuruResults() {
    const tbody = document.getElementById('guru-results-tbody');
    tbody.innerHTML = '';

    if (DEMO_STATE.results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-gray-500">Belum ada siswa yang menyelesaikan ujian.</td></tr>`;
        return;
    }

    DEMO_STATE.results.forEach(res => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-800">${res.student_name}</td>
            <td class="p-3 text-gray-600">${res.subject_name}</td>
            <td class="p-3 text-center font-bold text-brand-700 text-sm">${res.score}</td>
            <td class="p-3 text-center text-gray-600">${res.correct_answers} / ${res.total_questions}</td>
            <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded text-xs font-bold ${res.violations_count > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
                    ${res.violations_count} Pelanggaran
                </span>
            </td>
            <td class="p-3 text-right text-gray-500">${res.submitted_at}</td>
        `;
        tbody.appendChild(tr);
    });
}

// =========================================================================
// 6. ADMIN DASHBOARD
// =========================================================================
function initAdminDashboard() {
    loadAdminStats();
    loadAdminUsers();
    loadAdminSchedules();
}

function loadAdminStats() {
    const results = DEMO_STATE.results;
    const totalUsers = DEMO_STATE.users.length;
    let totalScore = 0;
    let totalViolations = 0;

    results.forEach(r => {
        totalScore += r.score;
        totalViolations += r.violations_count;
    });

    const avgScore = results.length > 0 ? (totalScore / results.length).toFixed(1) : '0.0';

    document.getElementById('admin-stat-avg-score').textContent = avgScore;
    document.getElementById('admin-stat-total-users').textContent = totalUsers;
    document.getElementById('admin-stat-total-violations').textContent = totalViolations;
}

function switchAdminTab(tab) {
    if (tab === 'users') {
        document.getElementById('admin-tab-users-content').classList.remove('hidden');
        document.getElementById('admin-tab-schedules-content').classList.add('hidden');
        document.getElementById('tab-admin-users').className = 'px-4 py-2 border-b-2 border-brand-600 text-brand-700 font-semibold text-sm';
        document.getElementById('tab-admin-schedules').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-semibold text-sm';
    } else {
        document.getElementById('admin-tab-users-content').classList.add('hidden');
        document.getElementById('admin-tab-schedules-content').classList.remove('hidden');
        document.getElementById('tab-admin-users').className = 'px-4 py-2 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-semibold text-sm';
        document.getElementById('tab-admin-schedules').className = 'px-4 py-2 border-b-2 border-brand-600 text-brand-700 font-semibold text-sm';
    }
}

function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    tbody.innerHTML = '';

    DEMO_STATE.users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-800">${u.name}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-xs uppercase font-bold bg-gray-100 text-gray-700">${u.role}</span></td>
            <td class="p-3 text-gray-600">${u.class_name || '-'}</td>
            <td class="p-3 text-center">
                <button onclick="deleteUser('${u.id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteUser(id) {
    if (confirm('Hapus pengguna ini?')) {
        const idx = DEMO_STATE.users.findIndex(u => u.id === id);
        if (idx !== -1) DEMO_STATE.users.splice(idx, 1);
        loadAdminUsers();
        loadAdminStats();
    }
}

function openModalAddUser() {
    document.getElementById('modal-add-user').classList.remove('hidden');
}

function closeModalAddUser() {
    document.getElementById('modal-add-user').classList.add('hidden');
}

function saveUserForm(e) {
    e.preventDefault();
    const newUser = {
        id: 'u_' + Date.now(),
        name: document.getElementById('fu-name').value,
        role: document.getElementById('fu-role').value,
        class_name: document.getElementById('fu-class').value || '-'
    };

    DEMO_STATE.users.push(newUser);
    closeModalAddUser();
    loadAdminUsers();
    loadAdminStats();
    alert('User berhasil ditambahkan!');
}

function loadAdminSchedules() {
    const tbody = document.getElementById('admin-schedules-tbody');
    tbody.innerHTML = '';

    DEMO_STATE.schedules.forEach(sch => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-800">${sch.subject_name}</td>
            <td class="p-3 text-gray-600">${sch.class_name}</td>
            <td class="p-3 text-gray-500 text-[11px]">${sch.start_time.replace('T', ' ')} s.d ${sch.end_time.replace('T', ' ')}</td>
            <td class="p-3 text-center font-bold text-gray-700">${sch.duration_minutes} Mins</td>
            <td class="p-3 text-center">
                <span class="px-2 py-0.5 rounded text-xs font-bold ${sch.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}">
                    ${sch.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td class="p-3 text-center">
                <button onclick="deleteSchedule('${sch.id}')" class="text-red-600 hover:text-red-800 font-semibold text-xs">Hapus</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteSchedule(id) {
    if (confirm('Hapus jadwal ini?')) {
        const idx = DEMO_STATE.schedules.findIndex(s => s.id === id);
        if (idx !== -1) DEMO_STATE.schedules.splice(idx, 1);
        loadAdminSchedules();
    }
}

function openModalAddSchedule() {
    const subSelect = document.getElementById('fs-subject');
    subSelect.innerHTML = '';
    DEMO_STATE.subjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = `${sub.name} (${sub.class_name})`;
        subSelect.appendChild(opt);
    });
    document.getElementById('modal-add-schedule').classList.remove('hidden');
}

function closeModalAddSchedule() {
    document.getElementById('modal-add-schedule').classList.add('hidden');
}

function saveScheduleForm(e) {
    e.preventDefault();
    const subId = document.getElementById('fs-subject').value;
    const subObj = DEMO_STATE.subjects.find(s => s.id === subId);

    const newSch = {
        id: 'sch_' + Date.now(),
        subject_id: subId,
        subject_name: subObj ? subObj.name : 'Mata Pelajaran',
        class_name: subObj ? subObj.class_name : '7A',
        start_time: document.getElementById('fs-start').value,
        end_time: document.getElementById('fs-end').value,
        duration_minutes: parseInt(document.getElementById('fs-duration').value) || 60,
        is_active: true
    };

    DEMO_STATE.schedules.push(newSch);
    closeModalAddSchedule();
    loadAdminSchedules();
    alert('Jadwal Ujian berhasil dibuat!');
}

// =========================================================================
// 7. SUPABASE CONFIG MODAL LOGIC
// =========================================================================
function openConfigModal() {
    document.getElementById('cfg-supabase-url').value = SUPABASE_URL;
    document.getElementById('cfg-supabase-key').value = SUPABASE_KEY;
    document.getElementById('modal-config').classList.remove('hidden');
}

function closeConfigModal() {
    document.getElementById('modal-config').classList.add('hidden');
}

function saveSupabaseConfig() {
    const url = document.getElementById('cfg-supabase-url').value.trim();
    const key = document.getElementById('cfg-supabase-key').value.trim();

    localStorage.setItem('cbt_sb_url', url);
    localStorage.setItem('cbt_sb_key', key);

    SUPABASE_URL = url;
    SUPABASE_KEY = key;

    if (url && key) {
        try {
            supabase = window.supabase.createClient(url, key);
        } catch (e) {
            console.error("Inisialisasi Supabase gagal:", e);
        }
    }

    closeConfigModal();
    checkDatabaseConnectionStatus();
    alert('Konfigurasi Supabase disimpan!');
}
