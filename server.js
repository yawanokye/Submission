const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const FILES_DIR = path.join(STORAGE_DIR, 'files');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';

const REQUIRED_HEADERS = ['S/N', 'NAME', 'REGISTRATION NO.', 'GROUP NO.', 'TOTAL SCORE'];
const MAX_HEADER_SCAN_ROWS = 30;

for (const dir of [STORAGE_DIR, DATA_DIR, FILES_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Project Work Admin"');
    return res.status(401).send('Administrator authentication required.');
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (!safeEqual(user, ADMIN_USER) || !safeEqual(pass, ADMIN_PASSWORD)) {
      res.set('WWW-Authenticate', 'Basic realm="Project Work Admin"');
      return res.status(401).send('Invalid administrator credentials.');
    }
    next();
  } catch {
    return res.status(401).send('Invalid administrator credentials.');
  }
}

async function readDb() {
  try {
    const raw = await fsp.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let writeQueue = Promise.resolve();
function writeDb(records) {
  writeQueue = writeQueue.then(async () => {
    const temp = DB_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, DB_FILE);
  });
  return writeQueue;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\.$/, '');
}

const NORMALIZED_REQUIRED = REQUIRED_HEADERS.map(normalizeHeader);

function findHeader(matrix) {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const normalized = (matrix[r] || []).map(normalizeHeader);
    if (NORMALIZED_REQUIRED.every(h => normalized.includes(h))) {
      const map = {};
      normalized.forEach((h, i) => {
        if (h && map[h] === undefined) map[h] = i;
      });
      return { rowIndex: r, map };
    }
  }
  return null;
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parseScoreWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  if (!workbook.SheetNames.length) throw new Error('The workbook contains no worksheet.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const header = findHeader(matrix);
  if (!header) {
    throw new Error(`The required headings were not found: ${REQUIRED_HEADERS.join(' | ')}`);
  }

  const idx = Object.fromEntries(NORMALIZED_REQUIRED.map(h => [h, header.map[h]]));
  const rows = [];
  let encounteredAnyRowAfterHeader = false;

  for (let r = header.rowIndex + 1; r < matrix.length; r++) {
    const source = matrix[r] || [];
    const vals = NORMALIZED_REQUIRED.map(h => cellText(source[idx[h]]));
    const allBlank = vals.every(v => v === '');

    // A fully blank row marks the end of the score table once the rows area has begun.
    // Rows that contain only a pre-filled S/N are ignored, allowing examiners to use fewer students.
    if (allBlank) {
      if (encounteredAnyRowAfterHeader) break;
      continue;
    }
    encounteredAnyRowAfterHeader = true;

    const [sn, name, registrationNo, groupNo, totalScore] = vals;
    const hasStudentContent = [name, registrationNo, groupNo, totalScore].some(v => v !== '');
    if (!hasStudentContent) continue;

    rows.push({
      originalSn: sn,
      name,
      registrationNo,
      groupNo,
      totalScore
    });
  }

  return {
    sheetName: workbook.SheetNames[0],
    headerRow: header.rowIndex + 1,
    rows
  };
}

function makeReference() {
  const d = new Date();
  const date = [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('');
  return `PWD-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function safeBaseName(name) {
  return path.basename(name || 'file').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILES_DIR),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBaseName(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 30 }
});

function filesFor(req, key) {
  return (req.files && req.files[key]) || [];
}

async function removeUploaded(req) {
  const all = Object.values(req.files || {}).flat();
  await Promise.all(all.map(f => fsp.unlink(f.path).catch(() => {})));
}

app.post('/api/submissions', upload.fields([
  { name: 'claimForm', maxCount: 1 },
  { name: 'reportFile', maxCount: 1 },
  { name: 'completedWork', maxCount: 25 },
  { name: 'scoresFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const requiredText = ['fullName', 'phone', 'email', 'groupCount', 'submissionType', 'studyCentre'];
    for (const key of requiredText) {
      if (!String(req.body[key] || '').trim()) {
        await removeUploaded(req);
        return res.status(400).json({ error: `Missing required field: ${key}` });
      }
    }

    if (!filesFor(req, 'claimForm').length || !filesFor(req, 'reportFile').length || !filesFor(req, 'completedWork').length || !filesFor(req, 'scoresFile').length) {
      await removeUploaded(req);
      return res.status(400).json({ error: 'All required upload categories must be supplied.' });
    }

    let scoreResult;
    try {
      scoreResult = parseScoreWorkbook(filesFor(req, 'scoresFile')[0].path);
    } catch (err) {
      await removeUploaded(req);
      return res.status(400).json({ error: err.message });
    }

    const reference = makeReference();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const fileRecord = f => ({
      storedName: path.basename(f.path),
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size
    });

    const record = {
      id,
      reference,
      submittedAt: now,
      fullName: String(req.body.fullName).trim(),
      phone: String(req.body.phone).trim(),
      email: String(req.body.email).trim(),
      groupCount: String(req.body.groupCount).trim(),
      submissionType: String(req.body.submissionType).trim(),
      studyCentre: String(req.body.studyCentre).trim(),
      scoreSheet: {
        worksheet: scoreResult.sheetName,
        headerRow: scoreResult.headerRow,
        rowCount: scoreResult.rows.length,
        rows: scoreResult.rows
      },
      files: {
        claimForm: fileRecord(filesFor(req, 'claimForm')[0]),
        reportFile: fileRecord(filesFor(req, 'reportFile')[0]),
        scoresFile: fileRecord(filesFor(req, 'scoresFile')[0]),
        completedWork: filesFor(req, 'completedWork').map(fileRecord)
      }
    };

    const records = await readDb();
    records.push(record);
    await writeDb(records);

    return res.status(201).json({
      ok: true,
      reference,
      submittedAt: now,
      scoreRowsIncluded: scoreResult.rows.length
    });
  } catch (err) {
    console.error(err);
    await removeUploaded(req).catch(() => {});
    return res.status(500).json({ error: 'The submission could not be saved.' });
  }
});

function allScoreRows(records) {
  const out = [];
  let sn = 1;
  records
    .slice()
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
    .forEach(record => {
      for (const row of (record.scoreSheet?.rows || [])) {
        out.push({
          'S/N': sn++,
          'NAME': row.name || '',
          'REGISTRATION NO.': row.registrationNo || '',
          'GROUP NO.': row.groupNo || '',
          'TOTAL SCORE': row.totalScore || ''
        });
      }
    });
  return out;
}

function scoreSheetAoA(records) {
  const rows = allScoreRows(records);
  return [REQUIRED_HEADERS, ...rows.map(r => REQUIRED_HEADERS.map(h => r[h]))];
}

function registerSheetAoA(records) {
  const headers = [
    'REFERENCE', 'SUBMITTED AT', 'EXAMINER / SUPERVISOR', 'PHONE', 'EMAIL',
    'STUDY CENTRE', 'SUBMISSION TYPE', 'NO. OF GROUPS / CANDIDATES', 'SCORE ROWS EXTRACTED'
  ];
  const body = records
    .slice()
    .sort((a,b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
    .map(r => [
      r.reference, r.submittedAt, r.fullName, r.phone, r.email, r.studyCentre,
      r.submissionType, r.groupCount, r.scoreSheet?.rowCount ?? 0
    ]);
  return [headers, ...body];
}

function addSheet(workbook, name, aoa, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  ws['!autofilter'] = { ref: ws['!ref'] || 'A1:A1' };
  XLSX.utils.book_append_sheet(workbook, ws, name);
}

function workbookBuffer(kind, records) {
  const wb = XLSX.utils.book_new();
  if (kind === 'scores' || kind === 'master') {
    addSheet(wb, 'Consolidated Scores', scoreSheetAoA(records), [10, 34, 24, 16, 16]);
  }
  if (kind === 'register' || kind === 'master') {
    addSheet(wb, 'Submission Register', registerSheetAoA(records), [22,24,32,18,30,22,20,24,22]);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function sendWorkbook(res, kind, records, filename) {
  const buffer = workbookBuffer(kind, records);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

app.get('/admin', adminAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
app.get('/admin/admin.css', adminAuth, (_req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.css')));
app.get('/admin/admin.js', adminAuth, (_req, res) => res.sendFile(path.join(__dirname, 'admin', 'admin.js')));

app.get('/api/admin/submissions', adminAuth, async (_req, res) => {
  const records = await readDb();
  const data = records.slice().reverse().map(r => ({
    id: r.id,
    reference: r.reference,
    submittedAt: r.submittedAt,
    fullName: r.fullName,
    phone: r.phone,
    email: r.email,
    groupCount: r.groupCount,
    submissionType: r.submissionType,
    studyCentre: r.studyCentre,
    scoreRows: r.scoreSheet?.rowCount ?? 0,
    files: {
      claimForm: r.files?.claimForm?.originalName || '',
      reportFile: r.files?.reportFile?.originalName || '',
      scoresFile: r.files?.scoresFile?.originalName || '',
      completedWork: (r.files?.completedWork || []).map(f => f.originalName)
    }
  }));
  res.json(data);
});

app.get('/api/admin/submissions/:id', adminAuth, async (req, res) => {
  const records = await readDb();
  const record = records.find(r => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: 'Submission not found.' });
  res.json(record);
});

app.get('/api/admin/submissions/:id/files/:kind/:index?', adminAuth, async (req, res) => {
  const records = await readDb();
  const record = records.find(r => r.id === req.params.id);
  if (!record) return res.status(404).send('Submission not found.');

  const allowed = ['claimForm', 'reportFile', 'scoresFile', 'completedWork'];
  if (!allowed.includes(req.params.kind)) return res.status(400).send('Invalid file type.');

  let item = record.files?.[req.params.kind];
  if (Array.isArray(item)) {
    const index = Number(req.params.index || 0);
    item = item[index];
  }
  if (!item) return res.status(404).send('File not found.');

  const filePath = path.join(FILES_DIR, path.basename(item.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).send('Stored file is unavailable.');
  return res.download(filePath, item.originalName);
});

app.get('/api/admin/submissions/:id/scores.xlsx', adminAuth, async (req, res) => {
  const records = await readDb();
  const record = records.find(r => r.id === req.params.id);
  if (!record) return res.status(404).send('Submission not found.');
  const clone = { ...record, scoreSheet: { ...record.scoreSheet, rows: record.scoreSheet?.rows || [] } };
  sendWorkbook(res, 'scores', [clone], `${record.reference}-scores.xlsx`);
});

app.get('/api/admin/export/scores.xlsx', adminAuth, async (_req, res) => {
  const records = await readDb();
  sendWorkbook(res, 'scores', records, 'consolidated-scores.xlsx');
});

app.get('/api/admin/export/register.xlsx', adminAuth, async (_req, res) => {
  const records = await readDb();
  sendWorkbook(res, 'register', records, 'submission-register.xlsx');
});

app.get('/api/admin/export/master.xlsx', adminAuth, async (_req, res) => {
  const records = await readDb();
  sendWorkbook(res, 'master', records, 'projectwork-dissertation-master.xlsx');
});

app.get('/api/admin/summary', adminAuth, async (_req, res) => {
  const records = await readDb();
  const centres = {};
  let scoreRows = 0;
  for (const r of records) {
    scoreRows += r.scoreSheet?.rowCount || 0;
    centres[r.studyCentre] = (centres[r.studyCentre] || 0) + 1;
  }
  res.json({ submissions: records.length, scoreRows, centres });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file exceeds the 50 MB server limit.' : err.message });
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Project Work portal listening on port ${PORT}`);
  console.log(`Storage directory: ${STORAGE_DIR}`);
  if (ADMIN_PASSWORD === 'change-this-password') {
    console.warn('WARNING: Set ADMIN_PASSWORD before production deployment.');
  }
});
