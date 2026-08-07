const cfg = window.PORTAL_CONFIG;

const form = document.getElementById('submissionForm');
const submitBtn = document.getElementById('submitBtn');
const declaration = document.getElementById('declaration');
const scoresFile = document.getElementById('scoresFile');
const studyCentre = document.getElementById('studyCentre');
const validationPanel = document.getElementById('validationPanel');
const validationTitle = document.getElementById('validationTitle');
const validationSummary = document.getElementById('validationSummary');
const validationErrors = document.getElementById('validationErrors');
const previewWrap = document.getElementById('previewWrap');
const previewTable = document.getElementById('previewTable');
const formMessage = document.getElementById('formMessage');

let scoresAreValid = false;
let validatedRows = [];

const normalize = value => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[_\-.]/g, ' ')
  .replace(/\s+/g, ' ');

const aliases = {
  'name of students': ['name of students', 'student name', 'student names', 'name', 'names of students'],
  'registration number': ['registration number', 'registration no', 'reg number', 'reg no', 'student id', 'index number'],
  'scores': ['scores', 'score', 'mark', 'marks', 'total score'],
  'study center': ['study center', 'study centre', 'centre', 'center', 'studycentre', 'studycenter']
};

function canonicalHeader(header) {
  const n = normalize(header);
  for (const [canonical, variants] of Object.entries(aliases)) {
    if (variants.some(v => normalize(v) === n)) return canonical;
  }
  return n;
}

function setFileName(inputId, outputId, multiple = false) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  input.addEventListener('change', () => {
    if (!input.files.length) output.textContent = 'No file selected';
    else if (multiple && input.files.length > 1) output.textContent = `${input.files.length} files selected`;
    else output.textContent = input.files[0].name;
    updateSubmitState();
  });
}

setFileName('claimForm', 'claimName');
setFileName('reportFile', 'reportName');
setFileName('completedWork', 'workName', true);
setFileName('scoresFile', 'scoresName');

function fileSizeOk(input, maxMb) {
  return [...input.files].every(f => f.size <= maxMb * 1024 * 1024);
}

function validateNonScoreFiles() {
  const checks = [
    [document.getElementById('claimForm'), cfg.MAX_CLAIM_MB, 'Claim form'],
    [document.getElementById('reportFile'), cfg.MAX_REPORT_MB, 'Report'],
    [document.getElementById('completedWork'), cfg.MAX_WORK_MB, 'Completed work']
  ];

  for (const [input, limit, label] of checks) {
    if (input.files.length && !fileSizeOk(input, limit)) {
      showFormMessage(`${label} exceeds the ${limit} MB file-size limit.`, 'error');
      return false;
    }
  }
  return true;
}

function updateSubmitState() {
  const requiredReady = [...form.querySelectorAll('[required]')].every(el => {
    if (el.type === 'file') return el.files && el.files.length > 0;
    if (el.type === 'checkbox') return el.checked;
    return String(el.value).trim() !== '';
  });
  submitBtn.disabled = !(requiredReady && scoresAreValid && form.checkValidity());
}

form.addEventListener('input', updateSubmitState);
form.addEventListener('change', updateSubmitState);
studyCentre.addEventListener('change', () => {
  if (scoresFile.files.length) validateScoresFile(scoresFile.files[0]);
});

scoresFile.addEventListener('change', async () => {
  scoresAreValid = false;
  validatedRows = [];
  updateSubmitState();
  if (!scoresFile.files.length) {
    validationPanel.classList.add('hidden');
    return;
  }
  await validateScoresFile(scoresFile.files[0]);
});

async function validateScoresFile(file) {
  validationPanel.classList.remove('hidden', 'success', 'error');
  previewWrap.classList.add('hidden');
  validationErrors.innerHTML = '';
  validationTitle.textContent = 'Checking spreadsheet…';
  validationSummary.textContent = 'Reading the first worksheet and applying validation rules.';

  if (file.size > cfg.MAX_SCORE_MB * 1024 * 1024) {
    return setValidationFailure([`Scores file exceeds ${cfg.MAX_SCORE_MB} MB.`]);
  }

  if (typeof XLSX === 'undefined') {
    return setValidationFailure(['Spreadsheet validator could not load. Check your internet connection or host the SheetJS library locally.']);
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    if (!workbook.SheetNames.length) return setValidationFailure(['The workbook contains no worksheet.']);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const headerRow = rawMatrix[0] || [];
    const canonHeaders = headerRow.map(canonicalHeader);
    const errors = [];

    const requiredCanonical = cfg.REQUIRED_COLUMNS.map(canonicalHeader);
    const missing = requiredCanonical.filter(h => !canonHeaders.includes(h));
    if (missing.length) {
      errors.push(`Missing compulsory column(s): ${missing.join(', ')}.`);
      errors.push(`Expected headers: ${cfg.REQUIRED_COLUMNS.join(' | ')}.`);
      return setValidationFailure(errors);
    }

    if (!rows.length) return setValidationFailure(['The spreadsheet has headers but no student records.']);
    if (rows.length > cfg.MAX_SCORE_ROWS) errors.push(`The spreadsheet has ${rows.length} rows. Maximum allowed is ${cfg.MAX_SCORE_ROWS}.`);

    const indexByCanonical = {};
    headerRow.forEach(h => { indexByCanonical[canonicalHeader(h)] = h; });

    const regSeen = new Map();
    const cleanRows = [];
    rows.forEach((row, i) => {
      const excelRow = i + 2;
      const name = String(row[indexByCanonical['name of students']] ?? '').trim();
      const reg = String(row[indexByCanonical['registration number']] ?? '').trim();
      const scoreRaw = row[indexByCanonical['scores']];
      const centre = String(row[indexByCanonical['study center']] ?? '').trim();
      const score = Number(String(scoreRaw).replace('%','').trim());

      if (!name) errors.push(`Row ${excelRow}: student name is blank.`);
      if (!reg) errors.push(`Row ${excelRow}: registration number is blank.`);
      if (scoreRaw === '' || Number.isNaN(score)) errors.push(`Row ${excelRow}: score must be numeric.`);
      else if (score < cfg.SCORE_MIN || score > cfg.SCORE_MAX) errors.push(`Row ${excelRow}: score ${score} is outside ${cfg.SCORE_MIN}-${cfg.SCORE_MAX}.`);
      if (!centre) errors.push(`Row ${excelRow}: study center is blank.`);

      const regKey = normalize(reg);
      if (regKey) {
        if (regSeen.has(regKey)) errors.push(`Row ${excelRow}: duplicate registration number also appears on row ${regSeen.get(regKey)}.`);
        else regSeen.set(regKey, excelRow);
      }

      if (studyCentre.value && centre && normalize(centre) !== normalize(studyCentre.value)) {
        errors.push(`Row ${excelRow}: study center "${centre}" does not match selected centre "${studyCentre.value}".`);
      }

      cleanRows.push({
        'Name of students': name,
        'Registration Number': reg,
        'Scores': Number.isNaN(score) ? scoreRaw : score,
        'Study center': centre
      });
    });

    if (errors.length) return setValidationFailure(errors.slice(0, 30), errors.length);

    scoresAreValid = true;
    validatedRows = cleanRows;
    validationPanel.classList.add('success');
    validationTitle.textContent = 'Spreadsheet validated successfully';
    validationSummary.textContent = `${rows.length} student record${rows.length === 1 ? '' : 's'} passed all checks. The file is ready for submission.`;
    renderPreview(cleanRows.slice(0, 8));
    updateSubmitState();
  } catch (err) {
    console.error(err);
    setValidationFailure(['The spreadsheet could not be read. Please use a valid XLSX, XLS or CSV file.']);
  }
}

function setValidationFailure(errors, totalCount = errors.length) {
  scoresAreValid = false;
  validatedRows = [];
  validationPanel.classList.add('error');
  validationTitle.textContent = 'Spreadsheet validation failed';
  validationSummary.textContent = `${totalCount} issue${totalCount === 1 ? '' : 's'} found. Correct the spreadsheet and upload it again.`;
  validationErrors.innerHTML = errors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
  if (totalCount > errors.length) validationErrors.innerHTML += `<li>Plus ${totalCount - errors.length} additional issue(s).</li>`;
  updateSubmitState();
}

function renderPreview(rows) {
  previewWrap.classList.remove('hidden');
  const headers = cfg.REQUIRED_COLUMNS;
  previewTable.innerHTML = `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.getElementById('clearScores').addEventListener('click', () => {
  scoresFile.value = '';
  document.getElementById('scoresName').textContent = 'No file selected';
  validationPanel.classList.add('hidden');
  scoresAreValid = false;
  validatedRows = [];
  updateSubmitState();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  form.reset();
  ['claimName', 'reportName', 'workName', 'scoresName'].forEach(id => {
    document.getElementById(id).textContent = 'No file selected';
  });
  validationPanel.classList.add('hidden');
  formMessage.classList.add('hidden');
  scoresAreValid = false;
  validatedRows = [];
  updateSubmitState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  formMessage.classList.add('hidden');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!scoresAreValid) {
    showFormMessage('The scores spreadsheet must pass validation before submission.', 'error');
    return;
  }
  if (!validateNonScoreFiles()) return;

  if (!cfg.SUBMISSION_ENDPOINT) {
    showFormMessage('Validation passed. The website is ready, but no submission endpoint has been configured yet. Add your backend URL in config.js to enable live collection.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const payload = new FormData(form);
    payload.append('validatedScoresJson', JSON.stringify(validatedRows));
    payload.append('submittedAt', new Date().toISOString());

    const response = await fetch(cfg.SUBMISSION_ENDPOINT, {
      method: 'POST',
      body: payload
    });

    if (!response.ok) throw new Error(`Submission failed with HTTP ${response.status}`);

    showFormMessage('Submission completed successfully. Keep this page or any confirmation number returned by the server for your records.', 'success');
    form.reset();
    scoresAreValid = false;
    validatedRows = [];
    validationPanel.classList.add('hidden');
    ['claimName', 'reportName', 'workName', 'scoresName'].forEach(id => document.getElementById(id).textContent = 'No file selected');
  } catch (error) {
    console.error(error);
    showFormMessage('The files were validated, but the server could not complete the submission. Please try again or contact the administrator.', 'error');
  } finally {
    submitBtn.textContent = 'Submit records';
    updateSubmitState();
  }
});

function showFormMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;
  formMessage.classList.remove('hidden');
  formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

updateSubmitState();
