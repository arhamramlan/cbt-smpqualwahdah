// CONFIGURATION SUPABASE
const SUPABASE_URL = "HTTPS://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// STATE MANAGEMENT
let currentUser = null;
let currentExam = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let examTimer = null;
let secondsRemaining = 0;
let violationCounter = 0;

// APP INITIALIZATION
document.addEventListener("DOMContentLoaded", async () => {
    setupAntiCheating();
    checkSession();
});

// ROUTING / VIEW MANAGER
function showView(viewId) {
    const views = ["viewLogin", "viewDashboard", "viewStudentHome", "viewExamEngine"];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
    document.getElementById(viewId).classList.remove("hidden");
}

// AUTHENTICATION LOGIC
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        alert("Gagal Login: " + error.message);
        return;
    }

    checkSession();
}

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        
        // Fetch Profile Role
        const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .single();

        currentUser.role = profile?.role || 'siswa';
        currentUser.full_name = profile?.full_name || currentUser.email;

        document.getElementById("userInfo").classList.remove("hidden");
        document.getElementById("userInfo").classList.add("flex");
        document.getElementById("userBadge").innerText = `${currentUser.full_name} (${currentUser.role.toUpperCase()})`;

        if (currentUser.role === "admin" || currentUser.role === "guru") {
            loadDashboardData();
            showView("viewDashboard");
        } else {
            loadStudentExams();
            showView("viewStudentHome");
        }
    } else {
        document.getElementById("userInfo").classList.add("hidden");
        showView("viewLogin");
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
    currentUser = null;
    showView("viewLogin");
}

// STUDENT EXAM LOGIC
async function loadStudentExams() {
    const { data: exams } = await supabase.from("exams").select("*").eq("is_active", true);
    const container = document.getElementById("studentExamList");
    container.innerHTML = "";

    if (!exams || exams.length === 0) {
        container.innerHTML = `<p class="text-slate-500">Tidak ada ujian aktif saat ini.</p>`;
        return;
    }

    exams.forEach(exam => {
        container.innerHTML += `
            <div class="border p-4 rounded-lg flex justify-between items-center bg-slate-50">
                <div>
                    <h3 class="font-bold text-lg">${exam.title}</h3>
                    <p class="text-sm text-slate-500">Durasi: ${exam.duration_minutes} Menit</p>
                </div>
                <button onclick="startExam('${exam.id}')" class="bg-indigo-600 text-white px-4 py-2 rounded font-semibold hover:bg-indigo-700">
                    Mulai Ujian
                </button>
            </div>
        `;
    });
}

async function startExam(examId) {
    const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).single();
    if (!exam) return;

    currentExam = exam;
    currentQuestionIndex = 0;
    userAnswers = {};
    violationCounter = 0;
    secondsRemaining = exam.duration_minutes * 60;

    // Enter Fullscreen
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }

    document.getElementById("examTitle").innerText = exam.title;
    showView("viewExamEngine");
    renderQuestion();
    renderGrid();
    startTimer();
}

function renderQuestion() {
    const q = currentExam.questions[currentQuestionIndex];
    document.getElementById("currentQuestionNum").innerText = currentQuestionIndex + 1;
    document.getElementById("questionText").innerText = q.question;

    const optionsContainer = document.getElementById("optionsContainer");
    optionsContainer.innerHTML = "";

    q.options.forEach((opt, idx) => {
        const isSelected = userAnswers[currentQuestionIndex] === idx;
        optionsContainer.innerHTML += `
            <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-slate-50 ${isSelected ? 'border-indigo-600 bg-indigo-50' : ''}">
                <input type="radio" name="option" name="opt" onclick="selectAnswer(${idx})" ${isSelected ? 'checked' : ''} class="mr-3">
                <span>${opt}</span>
            </label>
        `;
    });

    renderGrid();
}

function selectAnswer(optionIndex) {
    userAnswers[currentQuestionIndex] = optionIndex;
    renderQuestion();
}

function navigateQuestion(direction) {
    const newIdx = currentQuestionIndex + direction;
    if (newIdx >= 0 && newIdx < currentExam.questions.length) {
        currentQuestionIndex = newIdx;
        renderQuestion();
    }
}

function renderGrid() {
    const grid = document.getElementById("questionGrid");
    grid.innerHTML = "";

    currentExam.questions.forEach((_, idx) => {
        const isAnswered = userAnswers[idx] !== undefined;
        const isCurrent = idx === currentQuestionIndex;

        let statusClass = "bg-slate-200 text-slate-700";
        if (isAnswered) statusClass = "bg-emerald-600 text-white";
        if (isCurrent) statusClass += " ring-2 ring-indigo-600 font-bold";

        grid.innerHTML += `
            <button onclick="jumpToQuestion(${idx})" class="py-2 rounded text-sm ${statusClass}">
                ${idx + 1}
            </button>
        `;
    });
}

function jumpToQuestion(index) {
    currentQuestionIndex = index;
    renderQuestion();
}

// TIMER ENGINE
function startTimer() {
    clearInterval(examTimer);
    examTimer = setInterval(() => {
        secondsRemaining--;
        
        const hours = Math.floor(secondsRemaining / 3600);
        const minutes = Math.floor((secondsRemaining % 3600) / 60);
        const seconds = secondsRemaining % 60;

        document.getElementById("timerDisplay").innerText = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (secondsRemaining <= 0) {
            clearInterval(examTimer);
            alert("Waktu ujian telah habis!");
            submitExam();
        }
    }, 1000);
}

// SUBMIT & SCORE CALCULATION
async function confirmSubmitExam() {
    if (confirm("Apakah Anda yakin ingin menyelesaikan ujian ini?")) {
        submitExam();
    }
}

async function submitExam() {
    clearInterval(examTimer);

    // Hitung Nilai Autograding
    let correctCount = 0;
    currentExam.questions.forEach((q, idx) => {
        if (userAnswers[idx] === q.correct_answer) {
            correctCount++;
        }
    });

    const finalScore = (correctCount / currentExam.questions.length) * 100;

    // Simpan ke Supabase
    const { error } = await supabase.from("exam_results").insert({
        exam_id: currentExam.id,
        student_id: currentUser.id,
        answers: userAnswers,
        score: finalScore,
        violations_count: violationCounter
    });

    if (error) {
        alert("Gagal menyimapan hasil: " + error.message);
    } else {
        alert(`Ujian Selesai! Nilai Anda: ${finalScore.toFixed(2)}`);
    }

    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    checkSession();
}

// PROTEKSI ANTI-KECURANGAN (BLUR & TAB SWITCH DETECTOR)
function setupAntiCheating() {
    // Disable Right Click
    document.addEventListener("contextmenu", e => e.preventDefault());

    // Disable Key Shortcuts (F12, Ctrl+C, Ctrl+U)
    document.addEventListener("keydown", e => {
        if (e.key === "F12" || (e.ctrlKey && ['c', 'u', 'a'].includes(e.key.toLowerCase()))) {
            e.preventDefault();
        }
    });

    // Detect Tab Switch / Window Blur
    window.addEventListener("blur", () => {
        if (!document.getElementById("viewExamEngine").classList.contains("hidden")) {
            violationCounter++;
            document.getElementById("violationCount").innerText = violationCounter;

            if (violationCounter >= 3) {
                alert("Anda terdeteksi melakukan pelanggaran 3 kali. Ujian dikumpulkan otomatis!");
                submitExam();
            } else {
                alert(`Peringatan (${violationCounter}/3): Dilarang berpindah tab atau meninggalkan jendela ujian!`);
            }
        }
    });
}

// ADMIN DASHBOARD LOADER
async function loadDashboardData() {
    const { data: exams } = await supabase.from("exams").select("*");
    const { data: results } = await supabase.from("exam_results").select("*, profiles(full_name), exams(title)");

    const examList = document.getElementById("examListAdmin");
    examList.innerHTML = exams?.map(e => `
        <div class="p-2 border rounded flex justify-between text-sm">
            <span><b>${e.title}</b> (${e.duration_minutes}m)</span>
            <span class="${e.is_active ? 'text-emerald-600' : 'text-slate-400'}">${e.is_active ? 'Aktif' : 'Nonaktif'}</span>
        </div>
    `).join('') || '<p class="text-xs text-slate-400">Belum ada ujian.</p>';

    const resultList = document.getElementById("resultListAdmin");
    resultList.innerHTML = results?.map(r => `
        <div class="p-2 border rounded text-xs flex justify-between">
            <div>
                <b>${r.profiles?.full_name || 'Siswa'}</b> - ${r.exams?.title}<br>
                <span class="text-slate-400">Pelanggaran: ${r.violations_count}x</span>
            </div>
            <div class="text-right">
                <span class="font-bold text-sm text-indigo-600">${r.score}</span>
            </div>
        </div>
    `).join('') || '<p class="text-xs text-slate-400">Belum ada data nilai.</p>';
}

// SWITCH TAB MANAGEMENT
function switchAdminTab(tabName) {
    const tabs = ['Accounts', 'Curriculum', 'Grades'];
    tabs.forEach(t => {
        const content = document.getElementById(`adminTab${t}`);
        const btn = document.getElementById(`tabBtn${t}`);
        if (content && btn) {
            content.classList.add('hidden');
            btn.className = "pb-2 font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-700";
        }
    });

    const activeContent = document.getElementById(`adminTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    const activeBtn = document.getElementById(`tabBtn${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
    if (activeContent && activeBtn) {
        activeContent.classList.remove('hidden');
        activeBtn.className = "pb-2 font-bold border-b-2 border-indigo-600 text-indigo-600";
    }

    if (tabName === 'accounts') loadUsersData();
    if (tabName === 'curriculum') loadCurriculumData();
    if (tabName === 'grades') loadGradesData();
}

// -------------------------------------------------------------
// 1. MANAJEMEN AKUN
// -------------------------------------------------------------
async function loadUsersData() {
    const { data: users } = await supabase.from('profiles').select('*, classes(name)');
    const { data: classes } = await supabase.from('classes').select('*');

    // Populate Select Class Option
    const classSelect = document.getElementById('userClassSelect');
    classSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>' + 
        classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = users?.map(u => `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-3 font-semibold">${u.full_name}</td>
            <td class="p-3 text-slate-500">${u.id}</td>
            <td class="p-3"><span class="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs font-bold">${u.role.toUpperCase()}</span></td>
            <td class="p-3">${u.classes?.name || '-'}</td>
            <td class="p-3 text-right">
                <button onclick="deleteUser('${u.id}')" class="text-rose-600 hover:text-rose-800 text-xs font-bold"><i class="fa-solid fa-trash"></i> Hapus</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="p-3 text-center text-slate-400">Belum ada pengguna.</td></tr>';
}

async function handleSaveUser(e) {
    e.preventDefault();
    const fullName = document.getElementById('userFullName').value;
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const classId = document.getElementById('userClassSelect').value || null;

    // SignUp User via Auth Admin API / Standard SignUp
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert("Gagal membuat akun: " + error.message);

    if (data.user) {
        await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName,
            role: role,
            class_id: classId
        });
        alert("Akun berhasil dibuat!");
        loadUsersData();
    }
}

async function deleteUser(id) {
    if (confirm("Hapus pengguna ini dari database?")) {
        await supabase.from('profiles').delete().eq('id', id);
        loadUsersData();
    }
}

// -------------------------------------------------------------
// 2. MANAJEMEN KELAS & MAPEL
// -------------------------------------------------------------
async function loadCurriculumData() {
    const { data: classes } = await supabase.from('classes').select('*');
    const { data: subjects } = await supabase.from('subjects').select('*, profiles(full_name)');
    const { data: teachers } = await supabase.from('profiles').select('*').eq('role', 'guru');

    // Populate Guru Option
    const teacherSelect = document.getElementById('subjectTeacherSelect');
    teacherSelect.innerHTML = '<option value="">-- Pengampu (Guru) --</option>' + 
        teachers.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');

    // Render Classes
    document.getElementById('classList').innerHTML = classes?.map(c => `
        <li class="p-2 bg-white border rounded flex justify-between items-center text-sm">
            <b>Kelas ${c.name}</b>
            <button onclick="deleteClass('${c.id}')" class="text-rose-600 text-xs"><i class="fa-solid fa-trash"></i></button>
        </li>
    `).join('') || '<p class="text-xs text-slate-400">Belum ada kelas.</p>';

    // Render Subjects
    document.getElementById('subjectList').innerHTML = subjects?.map(s => `
        <li class="p-2 bg-white border rounded flex justify-between items-center text-sm">
            <div>
                <b>[${s.code}] ${s.title}</b><br>
                <span class="text-xs text-slate-500">Guru: ${s.profiles?.full_name || 'Belum diatur'}</span>
            </div>
            <button onclick="deleteSubject('${s.id}')" class="text-rose-600 text-xs"><i class="fa-solid fa-trash"></i></button>
        </li>
    `).join('') || '<p class="text-xs text-slate-400">Belum ada mata pelajaran.</p>';
}

async function handleSaveClass(e) {
    e.preventDefault();
    const name = document.getElementById('classNameInput').value;
    await supabase.from('classes').insert({ name });
    document.getElementById('classNameInput').value = '';
    loadCurriculumData();
}

async function handleSaveSubject(e) {
    e.preventDefault();
    const code = document.getElementById('subjectCodeInput').value;
    const title = document.getElementById('subjectTitleInput').value;
    const teacher_id = document.getElementById('subjectTeacherSelect').value || null;

    await supabase.from('subjects').insert({ code, title, teacher_id });
    loadCurriculumData();
}

// -------------------------------------------------------------
// 3. MANAJEMEN NILAI & EKSPOR CSV
// -------------------------------------------------------------
async function loadGradesData() {
    const { data: results } = await supabase.from('exam_results').select('*, profiles(full_name, classes(name)), exams(title)');
    
    const tbody = document.getElementById('gradesTableBody');
    tbody.innerHTML = results?.map(r => `
        <tr class="border-b hover:bg-slate-50">
            <td class="p-3 font-semibold">${r.profiles?.full_name || 'Siswa'}</td>
            <td class="p-3">${r.profiles?.classes?.name || '-'}</td>
            <td class="p-3">${r.exams?.title || '-'}</td>
            <td class="p-3 font-bold text-indigo-600">${r.score}</td>
            <td class="p-3 text-amber-600 font-semibold">${r.violations_count}x</td>
            <td class="p-3 text-xs text-slate-500">${new Date(r.submitted_at).toLocaleString('id-ID')}</td>
            <td class="p-3 text-right">
                <button onclick="deleteGrade('${r.id}')" class="text-rose-600 hover:text-rose-800 text-xs font-bold"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="p-3 text-center text-slate-400">Belum ada data nilai.</td></tr>';
}

function exportGradesToCSV() {
    const table = document.getElementById('gradesTableBody');
    let csv = [];
    csv.push(["Siswa", "Kelas", "Ujian", "Skor", "Pelanggaran", "Tanggal"].join(","));

    for (let row of table.rows) {
        if (row.cells.length < 6) continue;
        let cols = [
            `"${row.cells[0].innerText}"`,
            `"${row.cells[1].innerText}"`,
            `"${row.cells[2].innerText}"`,
            row.cells[3].innerText,
            row.cells[4].innerText,
            `"${row.cells[5].innerText}"`
        ];
        csv.push(cols.join(","));
    }

    const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
    const downloadLink = document.createElement("a");
    downloadLink.download = `Rekap_Nilai_CBT_${new Date().toISOString().slice(0,10)}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.click();
}
