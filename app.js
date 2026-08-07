const cfg = window.PORTAL_CONFIG;

const form = document.getElementById('submissionForm');
const submitBtn = document.getElementById('submitBtn');
const scoresFile = document.getElementById('scoresFile');
const validationPanel = document.getElementById('validationPanel');
const validationTitle = document.getElementById('validationTitle');
const validationSummary = document.getElementById('validationSummary');
const validationErrors = document.getElementById('validationErrors');
const previewWrap = document.getElementById('previewWrap');
const previewTable = document.getElementById('previewTable');
const formMessage = document.getElementById('formMessage');

let scoresAreValid = false;
let validatedRows = [];

const text = value => String(value ?? '').trim();

// Header matching is intentionally strict. We tolerate differences in case,
// spacing and the final full stop, but we do not accept different column names.
const normalizeHeader = value => text(value)
  .toUpperCase()
  .replace(/\u00A0/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\s*\/\s*/g, '/')
  .replace(/\.$/, '');

const normalizedRequiredHeaders = () => cfg.REQUIRED_COLUMNS.map(normalizeHeader);

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
    return text(el.value) !== '';
  });
  submitBtn.disabled = !(requiredReady && scoresAreValid && form.checkValidity());
}

form.addEventListener('input', updateSubmitState);
form.addEventListener('change', updateSubmitState);

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

function locateHeaderRow(matrix) {
  const required = normalizedRequiredHeaders();
  const limit = Math.min(matrix.length, cfg.HEADER_SEARCH_ROWS || 30);

  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const normalizedRow = (matrix[rowIndex] || []).map(normalizeHeader);
    if (required.every(header => normalizedRow.includes(header))) {
      return rowIndex;
    }
  }
  return -1;
}

function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    if (normalized) map[normalized] = index;
  });
  return map;
}

function isBlank(value) {
  return text(value) === '';
}

function isFooterRow(row) {
  const joined = row.map(text).join(' ').toUpperCase();
  return joined.includes('SIGNATURE OF SUPERVISOR') ||
    joined.startsWith('DATE ') ||
    joined.includes('CONTACT ');
}

async function validateScoresFile(file) {
  validationPanel.classList.remove('hidden', 'success', 'error');
  previewWrap.classList.add('hidden');
  validationErrors.innerHTML = '';
  validationTitle.textContent = 'Checking spreadsheet…';
  validationSummary.textContent = 'Locating the approved score table and checking every student record.';

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
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const errors = [];

    const headerRowIndex = locateHeaderRow(matrix);
    if (headerRowIndex === -1) {
      return setValidationFailure([
        'The approved score-table header could not be found in the first worksheet.',
        `Required columns: ${cfg.REQUIRED_COLUMNS.join(' | ')}.`
      ]);
    }

    const headerRow = matrix[headerRowIndex] || [];
    const columnMap = buildColumnMap(headerRow);
    const required = normalizedRequiredHeaders();
    const missing = required.filter(header => columnMap[header] === undefined);
    if (missing.length) {
      return setValidationFailure([
        `Missing compulsory column(s): ${missing.join(', ')}.`,
        `Required columns: ${cfg.REQUIRED_COLUMNS.join(' | ')}.`
      ]);
    }

    const idx = {
      sn: columnMap[normalizeHeader('S/N')],
      name: columnMap[normalizeHeader('NAME')],
      reg: columnMap[normalizeHeader('REGISTRATION NO.')],
      group: columnMap[normalizeHeader('GROUP NO.')],
      score: columnMap[normalizeHeader('TOTAL SCORE')]
    };

    const regSeen = new Map();
    const snSeen = new Map();
    const cleanRows = [];
    let started = false;

    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const excelRow = r + 1;

      if (started && isFooterRow(row)) break;

      const values = [row[idx.sn], row[idx.name], row[idx.reg], row[idx.group], row[idx.score]];
      const wholeRowBlank = values.every(isBlank);

      if (wholeRowBlank) {
        if (started) break;
        continue;
      }

      started = true;

      const snRaw = text(row[idx.sn]);
      const name = text(row[idx.name]);
      const reg = text(row[idx.reg]);
      const group = text(row[idx.group]);
      const scoreRaw = text(row[idx.score]);
      const sn = Number(snRaw);
      const score = Number(scoreRaw.replace('%', '').trim());

      if (!snRaw || !Number.isInteger(sn) || sn < 1) {
        errors.push(`Row ${excelRow}: S/N must be a positive whole number.`);
      } else {
        if (snSeen.has(sn)) errors.push(`Row ${excelRow}: S/N ${sn} is duplicated from row ${snSeen.get(sn)}.`);
        else snSeen.set(sn, excelRow);
        const expectedSn = cleanRows.length + 1;
        if (sn !== expectedSn) errors.push(`Row ${excelRow}: S/N should be ${expectedSn}, not ${sn}.`);
      }

      if (!name) errors.push(`Row ${excelRow}: NAME is blank.`);
      if (!reg) errors.push(`Row ${excelRow}: REGISTRATION NO. is blank.`);
      if (!group) errors.push(`Row ${excelRow}: GROUP NO. is blank.`);

      if (!scoreRaw || Number.isNaN(score)) {
        errors.push(`Row ${excelRow}: TOTAL SCORE must be numeric.`);
      } else if (score < cfg.SCORE_MIN || score > cfg.SCORE_MAX) {
        errors.push(`Row ${excelRow}: TOTAL SCORE ${score} is outside ${cfg.SCORE_MIN}-${cfg.SCORE_MAX}.`);
      }

      const regKey = reg.toUpperCase().replace(/\s+/g, '');
      if (regKey) {
        if (regSeen.has(regKey)) errors.push(`Row ${excelRow}: REGISTRATION NO. is duplicated from row ${regSeen.get(regKey)}.`);
        else regSeen.set(regKey, excelRow);
      }

      cleanRows.push({
        'S/N': Number.isNaN(sn) ? snRaw : sn,
        'NAME': name,
        'REGISTRATION NO.': reg,
        'GROUP NO.': group,
        'TOTAL SCORE': Number.isNaN(score) ? scoreRaw : score
      });
    }

    if (!cleanRows.length) {
      return setValidationFailure([`The score table was found on row ${headerRowIndex + 1}, but it contains no student records.`]);
    }

    if (cleanRows.length > cfg.MAX_SCORE_ROWS) {
      errors.push(`The spreadsheet has ${cleanRows.length} student rows. Maximum allowed is ${cfg.MAX_SCORE_ROWS}.`);
    }

    if (errors.length) return setValidationFailure(errors.slice(0, 30), errors.length);

    scoresAreValid = true;
    validatedRows = cleanRows;
    validationPanel.classList.add('success');
    validationTitle.textContent = 'Spreadsheet validated successfully';
    validationSummary.textContent = `${cleanRows.length} student record${cleanRows.length === 1 ? '' : 's'} passed all checks. Header detected on Excel row ${headerRowIndex + 1}.`;
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
