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
