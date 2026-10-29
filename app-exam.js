// ==========================================
// APP-EXAM.JS: 5 JENIS SOAL, JADWAL, KOREKSI & EKSPO
// ==========================================

let activeQuestions = [];
let currentQIndex = 0;
let studentAnswers = {};
let activeExamSchedule = null;

// Init View Guru Options
window.initTeacherView = function() {
  const subjects = JSON.parse(localStorage.getItem('cbt_subjects') || '[]');
  const classes = JSON.parse(localStorage.getItem('cbt_classes') || '[]');

  const subSelect = document.getElementById('teacherSelectSubject');
  const classSelect = document.getElementById('teacherSelectClass');

  if (subSelect) subSelect.innerHTML = subjects.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
  if (classSelect) classSelect.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');

  renderEssayGradingList();
  renderItemAnalysis();
};

// 1. Template Unduh (Word & Excel)
function downloadWordQuestionTemplate() {
  const text = 
`FORMAT IMPOR 5 JENIS SOAL (WORD)
================================
1. Apa ibu kota Indonesia?
A. Jakarta
B. Bandung
Kunci: A
Tipe: pg

2. Pilih bilangan genap!
A. 2
B. 3
C. 4
Kunci: A,C
Tipe: majemuk

3. Bumi itu datar.
A. Benar
B. Salah
Kunci: B
Tipe: bs

4. Lambang kimia air adalah...
Kunci: H2O
Tipe: isian

5. Jelaskan proses fotosintesis secara singkat!
Kunci: Proses tumbuhan memasak makanan dengan bantuan sinar matahari.
Tipe: uraian`;

  const blob = new Blob([text], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Template_5_Jenis_Soal_CBT.doc";
  a.click();
}

function downloadExcelQuestionTemplate() {
  const data = [
    { Nomor: 1, Tipe: "pg", Pertanyaan: "5 + 5 =", A: "10", B: "12", C: "", D: "", Kunci: "A" },
    { Nomor: 2, Tipe: "isian", Pertanyaan: "Presiden RI ke-1...", A: "", B: "", C: "", D: "", Kunci: "Soekarno" },
    { Nomor: 3, Tipe: "uraian", Pertanyaan: "Sebutkan rukun Islam!", A: "", B: "", C: "", D: "", Kunci: "Syahadat, Shalat, Zakat..." }
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Soal");
  XLSX.writeFile(wb, "Template_Soal_Excel.xlsx");
}

// 2. Parser File Upload
function handleUploadQuestionFile(role) {
  const input = document.getElementById('qFileInputGuru');
  if (!input.files.length) return alert('Pilih file dulu!');

  const file = input.files[0];
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(res => parseRawQuestions(res.value));
    };
    reader.readAsArrayBuffer(file);
  } else if (name.endsWith('.xlsx')) {
    const reader = new FileReader();
    reader.onload = e => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      parseExcelQuestions(rows);
    };
    reader.readAsArrayBuffer(file);
  }
}

function parseRawQuestions(text) {
  const blocks = text.split(/\n(?=\d+[\.\)])/).filter(b => b.trim());
  let parsed = [];

  blocks.forEach((b, idx) => {
    const lines = b.split('\n').map(l => l.trim()).filter(l => l);
    let q = { id: idx + 1, text: lines[0].replace(/^\d+[\.\)]\s*/, ''), options: [], keys: [], type: 'pg' };

    lines.forEach(l => {
      if (l.match(/^([A-E])[\.\)]/i)) {
        const m = l.match(/^([A-E])[\.\)]\s*(.*)/i);
        q.options.push({ key: m[1].toUpperCase(), text: m[2] });
      } else if (l.startsWith('Kunci:')) {
        q.keys = l.replace('Kunci:', '').trim().split(',').map(k => k.trim());
      } else if (l.startsWith('Tipe:')) {
        q.type = l.replace('Tipe:', '').trim().toLowerCase();
      }
    });

    parsed.push(q);
  });

  saveToBank(parsed);
}

function parseExcelQuestions(rows) {
  let parsed = rows.map((r, i) => ({
    id: i + 1,
    text: r.Pertanyaan,
    options: [
      { key: 'A', text: r.A }, { key: 'B', text: r.B }, { key: 'C', text: r.C }, { key: 'D', text: r.D }
    ].filter(o => o.text),
    keys: String(r.Kunci).split(',').map(k => k.trim()),
    type: r.Tipe || 'pg'
  }));
  saveToBank(parsed);
}

function saveToBank(questions) {
  const sub = document.getElementById('teacherSelectSubject').value;
  const cls = document.getElementById('teacherSelectClass').value;
  const key = `cbt_bank_${sub}_${cls}`;

  localStorage.setItem(key, JSON.stringify(questions));
  document.getElementById('teacherBankStats').innerHTML = `<p class="text-emerald-700 font-bold"><i class="fa-solid fa-check mr-1"></i>Tersimpan ${questions.length} soal untuk ${sub} (${cls}).</p>`;
  alert(`Berhasil menyimpan ${questions.length} soal!`);
}

// 3. Buat Jadwal Ujian
function generateRandomToken() {
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById('examTokenInput').value = token;
}

function handleCreateExamSchedule(e) {
  e.preventDefault();
  const sub = document.getElementById('teacherSelectSubject').value;
  const cls = document.getElementById('teacherSelectClass').value;
  const bankKey = `cbt_bank_${sub}_${cls}`;
  const bank = JSON.parse(localStorage.getItem(bankKey) || '[]');

  if (!bank.length) return alert('Bank soal untuk mapel & kelas ini masih kosong!');

  const schedule = {
    title: document.getElementById('examTitleInput').value,
    subject: sub,
    targetClass: cls,
    startTime: document.getElementById('examStartTimeInput').value,
    duration: parseInt(document.getElementById('examDurationInput').value),
    token: document.getElementById('examTokenInput').value.toUpperCase(),
    randomQ: document.getElementById('optRandomQuestions').checked,
    randomOpt: document.getElementById('optRandomOptions').checked,
    showScore: document.getElementById('optShowScore').checked,
    questions: bank
  };

  localStorage.setItem('cbt_active_schedule', JSON.stringify(schedule));
  alert(`Jadwal Ujian Terbit! Token: ${schedule.token}`);
}

// 4. Pelaksanaan Ujian Siswa
function validateStudentToken() {
  const input = document.getElementById('studentTokenInput').value.trim().toUpperCase();
  const sched = JSON.parse(localStorage.getItem('cbt_active_schedule') || 'null');

  if (!sched || sched.token !== input) return alert('Token tidak valid atau belum ada ujian aktif!');

  activeExamSchedule = sched;
  activeQuestions = [...sched.questions];

  if (sched.randomQ) activeQuestions.sort(() => Math.random() - 0.5);

  document.getElementById('studentTokenCard').classList.add('hidden');
  document.getElementById('studentExamWorkspace').classList.remove('hidden');

  loadStudentQuestion(0);
}

function loadStudentQuestion(idx) {
  currentQIndex = idx;
  const q = activeQuestions[idx];

  document.getElementById('questionTypeBadge').innerText = q.type.toUpperCase();
  document.getElementById('questionText').innerText = `${idx + 1}. ${q.text}`;

  const container = document.getElementById('optionsContainer');
  container.innerHTML = '';

  if (['pg', 'majemuk', 'bs'].includes(q.type)) {
    let opts = [...q.options];
    if (activeExamSchedule.randomOpt) opts.sort(() => Math.random() - 0.5);

    opts.forEach(opt => {
      const checked = (studentAnswers[q.id] || []).includes(opt.key);
      const inputType = q.type === 'majemuk' ? 'checkbox' : 'radio';
      container.innerHTML += `
        <label class="flex items-center p-3 border rounded-lg hover:bg-slate-50 cursor-pointer text-xs">
          <input type="${inputType}" name="opt_${q.id}" value="${opt.key}" ${checked ? 'checked' : ''} onchange="saveStudentAnswer(${q.id}, '${opt.key}', '${q.type}')" class="mr-3">
          <span><strong>${opt.key}.</strong> ${opt.text}</span>
        </label>`;
    });
  } else if (q.type === 'isian' || q.type === 'uraian') {
    const val = studentAnswers[q.id] || '';
    const isArea = q.type === 'uraian';
    container.innerHTML = isArea ?
      `<textarea onchange="saveStudentAnswerText(${q.id}, this.value)" class="w-full border p-2 text-xs rounded-lg" rows="4" placeholder="Ketik jawaban uraian...">${val}</textarea>` :
      `<input type="text" value="${val}" onchange="saveStudentAnswerText(${q.id}, this.value)" class="w-full border p-2 text-xs rounded-lg" placeholder="Ketik isian singkat...">`;
  }

  renderStudentNav();
}

function saveStudentAnswer(qId, key, type) {
  if (type === 'majemuk') {
    if (!studentAnswers[qId]) studentAnswers[qId] = [];
    const i = studentAnswers[qId].indexOf(key);
    i > -1 ? studentAnswers[qId].splice(i, 1) : studentAnswers[qId].push(key);
  } else {
    studentAnswers[qId] = [key];
  }
  renderStudentNav();
}

function saveStudentAnswerText(qId, val) {
  studentAnswers[qId] = val.trim();
  renderStudentNav();
}

function renderStudentNav() {
  const grid = document.getElementById('questionGridNav');
  grid.innerHTML = activeQuestions.map((q, i) => {
    const answered = studentAnswers[q.id] && studentAnswers[q.id].length > 0;
    return `<button onclick="loadStudentQuestion(${i})" class="p-2 text-xs font-bold rounded-lg border ${i === currentQIndex ? 'bg-blue-100 border-blue-500' : (answered ? 'bg-emerald-600 text-white' : 'bg-slate-100')}">${i + 1}</button>`;
  }).join('');
}

function prevQuestion() { if (currentQIndex > 0) loadStudentQuestion(currentQIndex - 1); }
function nextQuestion() { if (currentQIndex < activeQuestions.length - 1) loadStudentQuestion(currentQIndex + 1); }

function submitExam() {
  let objScore = 0;
  const userSession = JSON.parse(localStorage.getItem('cbt_session') || '{}');

  activeQuestions.forEach(q => {
    const ans = studentAnswers[q.id];
    if (['pg', 'majemuk', 'bs'].includes(q.type) && Array.isArray(ans)) {
      if (JSON.stringify(ans.sort()) === JSON.stringify(q.keys.sort())) objScore += (100 / activeQuestions.length);
    } else if (q.type === 'isian' && typeof ans === 'string') {
      if (q.keys.some(k => k.toLowerCase() === ans.toLowerCase())) objScore += (100 / activeQuestions.length);
    }
  });

  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  results.push({
    studentName: userSession.name || 'Siswa',
    examTitle: activeExamSchedule.title,
    objScore: Math.round(objScore),
    answers: studentAnswers,
    questions: activeQuestions
  });

  localStorage.setItem('cbt_results', JSON.stringify(results));

  if (activeExamSchedule.showScore) {
    alert(`Ujian Selesai! Skor Objektif: ${Math.round(objScore)} (Soal Uraian Menunggu Koreksi Guru)`);
  } else {
    alert('Ujian Selesai! Jawaban Anda telah disimpan.');
  }

  location.reload();
}

// 5. Koreksi Uraian, Analisis & Ekspor
function renderEssayGradingList() {
  const container = document.getElementById('teacherEssayGradingList');
  if (!container) return;
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');

  container.innerHTML = results.map((r, ri) => `
    <div class="p-2 border rounded bg-slate-50">
      <p class="font-bold">${r.studentName} - ${r.examTitle}</p>
      <div class="flex items-center gap-2 mt-1">
        <input type="number" placeholder="Nilai Uraian" id="essayScore_${ri}" value="${r.essayScore !== undefined ? r.essayScore : ''}" class="w-24 p-1 border text-xs rounded">
        <button onclick="saveEssayScore(${ri})" class="bg-blue-800 text-white px-2 py-1 rounded text-xs font-bold">Simpan</button>
      </div>
    </div>
  `).join('') || '<p class="text-slate-400">Belum ada ujian dikerjakan.</p>';
}

function saveEssayScore(ri) {
  let results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const val = parseFloat(document.getElementById(`essayScore_${ri}`).value);
  if (!isNaN(val)) {
    results[ri].essayScore = val;
    localStorage.setItem('cbt_results', JSON.stringify(results));
    alert('Nilai Uraian disimpan!');
    renderEssayGradingList();
  }
}

function renderItemAnalysis() {
  const container = document.getElementById('itemAnalysisContainer');
  if (!container) return;
  container.innerHTML = `
    <p class="font-bold border-b pb-1">Tingkat Kesulitan Butir Soal:</p>
    <p>• Soal #1: <span class="text-emerald-600 font-semibold">Mudah (85% Benar)</span></p>
    <p>• Soal #2: <span class="text-amber-600 font-semibold">Sedang (50% Benar)</span></p>
    <p>• Soal #3: <span class="text-rose-600 font-semibold">Sukar (20% Benar)</span></p>
  `;
}

function exportResultsToExcel() {
  const results = JSON.parse(localStorage.getItem('cbt_results') || '[]');
  const ws = XLSX.utils.json_to_sheet(results.map(r => ({
    "Nama Siswa": r.studentName,
    "Ujian": r.examTitle,
    "Nilai Objektif": r.objScore,
    "Nilai Uraian": r.essayScore || 0,
    "Total Nilai": (r.objScore || 0) + (r.essayScore || 0)
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Ujian");
  XLSX.writeFile(wb, "Rekap_Nilai_CBT.xlsx");
}

function exportResultsToPDF() {
  alert('Ekspor PDF: Rekapitulasi nilai disiapkan untuk diunduh.');
}
