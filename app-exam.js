// ==========================================
// APP-EXAM.JS: PARSING SOAL, TEMPLATE & WORKSPACE UJIAN
// ==========================================

let currentExamQuestions = [];
let currentQuestionIndex = 0;
let studentAnswers = {};
let violationCount = 0;

// 1. Template Soal Word 3 Jenis Soal
function downloadWordQuestionTemplate() {
  const templateText = 
`FORMAT STANDAR IMPOR SOAL WORD (3 JENIS SOAL)
=================================================
PETUNJUK PENGISIAN:
1. Tulis nomor soal diikuti titik (contoh: 1. atau 2.).
2. Untuk Pilihan Ganda & Majemuk, tulis opsi A-E di baris baru.
3. Untuk Benar/Salah, opsi otomatis A (Benar) & B (Salah).
4. Tulis kunci jawaban di baris terakhir setiap nomor.
=================================================

--- 1. CONTOH SOAL PILIHAN GANDA (1 JAWABAN BENAR) ---
1. Apa nama ibu kota Negara Indonesia?
A. Bandung
B. Surabaya
C. Jakarta
D. Medan
E. Makassar
Kunci: C

--- 2. CONTOH SOAL PILIHAN MAJEMUK (JAWABAN > 1) ---
2. Pilih angka-angka di bawah ini yang merupakan bilangan genap!
A. 2
B. 3
C. 4
D. 5
E. 6
Kunci: A, C, E

--- 3. CONTOH SOAL BENAR / SALAH ---
3. Matahari terbit dari arah barat dan tenggelam di arah timur.
A. Benar
B. Salah
Kunci: B
`;

  const blob = new Blob([templateText], { type: "application/msword;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Template_Soal_3_Jenis_CBT.doc";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 2. Processing & Parsing Word (.docx) / PDF Upload
function handleUploadQuestionFile(role) {
  const fileInput = document.getElementById('qFileInputGuru');
  if (!fileInput || !fileInput.files.length) {
    alert('Silakan pilih file Word (.docx) atau PDF terlebih dahulu!');
    return;
  }

  const file = fileInput.files[0];
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.docx')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(result => parseRawQuestionText(result.value))
        .catch(err => alert('Gagal membaca file Word: ' + err.message));
    };
    reader.readAsArrayBuffer(file);
  } else if (fileName.endsWith('.pdf')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const typedarray = new Uint8Array(e.target.result);
      pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        let maxPages = pdf.numPages;
        let countPromises = [];
        for (let j = 1; j <= maxPages; j++) {
          countPromises.push(pdf.getPage(j).then(page => page.getTextContent()));
        }
        Promise.all(countPromises).then(texts => {
          let fullText = '';
          texts.forEach(text => {
            text.items.forEach(item => fullText += item.str + '\n');
          });
          parseRawQuestionText(fullText);
        });
      });
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Format file tidak didukung! Gunakan .docx atau .pdf.');
  }
}

// 3. Regex Engine Parser untuk 3 Jenis Soal
function parseRawQuestionText(text) {
  const blocks = text.split(/\n(?=\d+[\.\)])/).filter(b => b.trim().length > 0);
  let parsedQuestions = [];

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) return;

    let questionObj = {
      id: idx + 1,
      text: lines[0].replace(/^\d+[\.\)]\s*/, ''),
      options: [],
      keys: [],
      type: 'pg'
    };

    lines.forEach(line => {
      const optionMatch = line.match(/^([A-E])[\.\)]\s*(.*)/i);
      const keyMatch = line.match(/^Kunci:\s*(.*)/i);

      if (optionMatch) {
        questionObj.options.push({ key: optionMatch[1].toUpperCase(), text: optionMatch[2] });
      } else if (keyMatch) {
        const rawKeys = keyMatch[1].toUpperCase().split(',').map(k => k.trim());
        questionObj.keys = rawKeys;
      }
    });

    // Deteksi Tipe Soal
    if (questionObj.options.length === 2 && 
        questionObj.options[0].text.toLowerCase().includes('benar') && 
        questionObj.options[1].text.toLowerCase().includes('salah')) {
      questionObj.type = 'bs';
    } else if (questionObj.keys.length > 1) {
      questionObj.type = 'majemuk';
    } else {
      questionObj.type = 'pg';
    }

    if (questionObj.options.length > 0) {
      parsedQuestions.push(questionObj);
    }
  });

  if (parsedQuestions.length === 0) {
    alert('Gagal mengekstrak soal. Pastikan format sesuai template!');
    return;
  }

  localStorage.setItem('cbt_active_exam', JSON.stringify(parsedQuestions));
  updateTeacherStats(parsedQuestions.length);
  alert(`Berhasil mengimpor ${parsedQuestions.length} soal!`);
}

function updateTeacherStats(count) {
  const statsDiv = document.getElementById('teacherQuestionStats');
  if (statsDiv) {
    statsDiv.innerHTML = `<p class="text-emerald-700 font-bold"><i class="fa-solid fa-circle-check mr-1"></i>Paket Soal Siap (${count} Soal Terdeteksi)</p>`;
  }
}

function publishExam() {
  const exam = localStorage.getItem('cbt_active_exam');
  if (!exam) {
    alert('Belum ada soal yang diunggah!');
    return;
  }
  alert('Ujian berhasil diterbitkan dan siap dikerjakan oleh siswa.');
}

// 4. Workspace Ujian Siswa & Anti-Kecurangan
function startExamProcess() {
  const examData = localStorage.getItem('cbt_active_exam');
  if (!examData) {
    alert('Belum ada paket ujian yang aktif dari Guru.');
    return;
  }

  currentExamQuestions = JSON.parse(examData);
  currentQuestionIndex = 0;
  studentAnswers = {};
  violationCount = 0;

  document.getElementById('studentExamNotice').classList.add('hidden');
  document.getElementById('studentExamWorkspace').classList.remove('hidden');

  // Aktivasi Layar Penuh (Fullscreen)
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen();
  }

  setupAntiCheating();
  renderQuestionNav();
  loadQuestion(0);
}

function setupAntiCheating() {
  window.onblur = function() {
    violationCount++;
    alert(`PERINGATAN Anti-Kecurangan (${violationCount}/3): Anda terdeteksi berpindah tab/aplikasi!`);
    if (violationCount >= 3) {
      alert('Batas pelanggaran terlampaui. Ujian dihentikan secara otomatis.');
      submitExam();
    }
  };
}

function loadQuestion(index) {
  currentQuestionIndex = index;
  const q = currentExamQuestions[index];

  document.getElementById('questionTypeBadge').innerText = 
    q.type === 'pg' ? 'Pilihan Ganda' : (q.type === 'majemuk' ? 'Pilihan Majemuk' : 'Benar / Salah');

  document.getElementById('questionText').innerText = `${q.id}. ${q.text}`;
  
  const optionsContainer = document.getElementById('optionsContainer');
  optionsContainer.innerHTML = '';

  q.options.forEach(opt => {
    const isChecked = studentAnswers[q.id] && studentAnswers[q.id].includes(opt.key);
    const inputType = q.type === 'majemuk' ? 'checkbox' : 'radio';

    const div = document.createElement('div');
    div.className = 'flex items-center p-3 border rounded-lg hover:bg-slate-50 cursor-pointer text-xs';
    div.innerHTML = `
      <input type="${inputType}" name="opt_${q.id}" value="${opt.key}" ${isChecked ? 'checked' : ''} 
             onchange="saveAnswer(${q.id}, '${opt.key}', '${q.type}')" class="mr-3">
      <span><strong>${opt.key}.</strong> ${opt.text}</span>
    `;
    optionsContainer.appendChild(div);
  });

  renderQuestionNav();
}

function saveAnswer(qId, key, type) {
  if (type === 'majemuk') {
    if (!studentAnswers[qId]) studentAnswers[qId] = [];
    const idx = studentAnswers[qId].indexOf(key);
    if (idx > -1) {
      studentAnswers[qId].splice(idx, 1);
    } else {
      studentAnswers[qId].push(key);
    }
  } else {
    studentAnswers[qId] = [key];
  }
  renderQuestionNav();
}

function renderQuestionNav() {
  const grid = document.getElementById('questionGridNav');
  grid.innerHTML = '';

  currentExamQuestions.forEach((q, idx) => {
    const isAnswered = studentAnswers[q.id] && studentAnswers[q.id].length > 0;
    const isCurrent = idx === currentQuestionIndex;

    const btn = document.createElement('button');
    btn.innerText = idx + 1;
    btn.onclick = () => loadQuestion(idx);

    let btnClass = 'p-2 text-xs font-bold rounded-lg border ';
    if (isCurrent) {
      btnClass += 'ring-2 ring-blue-600 bg-blue-100 text-blue-900 border-blue-400';
    } else if (isAnswered) {
      btnClass += 'bg-emerald-600 text-white border-emerald-600';
    } else {
      btnClass += 'bg-slate-100 text-slate-700 hover:bg-slate-200';
    }

    btn.className = btnClass;
    grid.appendChild(btn);
  });
}

function prevQuestion() {
  if (currentQuestionIndex > 0) loadQuestion(currentQuestionIndex - 1);
}

function nextQuestion() {
  if (currentQuestionIndex < currentExamQuestions.length - 1) loadQuestion(currentQuestionIndex + 1);
}

function submitExam() {
  window.onblur = null;
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }

  let score = 0;
  currentExamQuestions.forEach(q => {
    const ans = studentAnswers[q.id] || [];
    const isCorrect = JSON.stringify(ans.sort()) === JSON.stringify(q.keys.sort());
    if (isCorrect) score += (100 / currentExamQuestions.length);
  });

  alert(`Ujian Selesai!\nSkor Akhir Anda: ${Math.round(score)}`);
  location.reload();
}
