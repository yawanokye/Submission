const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const app = express();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32Update(crc, buffer) {
  let c = crc >>> 0;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  return c >>> 0;
}
function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
  const dosDate = (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { dosTime, dosDate };
}
async function writeResponseChunk(res, chunk) {
  if (!res.write(chunk)) await new Promise(resolve => res.once('drain', resolve));
}
async function streamZipArchive(res, files) {
  let offset = 0;
  const central = [];
  const { dosTime, dosDate } = dosDateTime();
  async function write(chunk) { await writeResponseChunk(res, chunk); offset += chunk.length; }

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const localOffset = offset;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0008, 6); // data descriptor follows file data
    local.writeUInt16LE(0, 8);      // stored, no compression
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(0, 18);
    local.writeUInt32LE(0, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    await write(local); await write(nameBuf);

    let crc = 0xFFFFFFFF;
    let size = 0;
    for await (const chunk of fs.createReadStream(file.path)) {
      crc = crc32Update(crc, chunk);
      size += chunk.length;
      await write(chunk);
    }
    crc = (crc ^ 0xFFFFFFFF) >>> 0;
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(size >>> 0, 8);
    descriptor.writeUInt32LE(size >>> 0, 12);
    await write(descriptor);
    central.push({ nameBuf, crc, size, localOffset, dosTime, dosDate });
  }

  const centralOffset = offset;
  for (const entry of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x0008, 8);
    h.writeUInt16LE(0, 10);
    h.writeUInt16LE(entry.dosTime, 12);
    h.writeUInt16LE(entry.dosDate, 14);
    h.writeUInt32LE(entry.crc, 16);
    h.writeUInt32LE(entry.size >>> 0, 20);
    h.writeUInt32LE(entry.size >>> 0, 24);
    h.writeUInt16LE(entry.nameBuf.length, 28);
    h.writeUInt16LE(0, 30);
    h.writeUInt16LE(0, 32);
    h.writeUInt16LE(0, 34);
    h.writeUInt16LE(0, 36);
    h.writeUInt32LE(0, 38);
    h.writeUInt32LE(entry.localOffset >>> 0, 42);
    await write(h); await write(entry.nameBuf);
  }
  const centralSize = offset - centralOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralSize >>> 0, 12);
  end.writeUInt32LE(centralOffset >>> 0, 16);
  end.writeUInt16LE(0, 20);
  await write(end);
  res.end();
}
const PORT = Number(process.env.PORT || 10000);
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'storage'));
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const FILES_DIR = path.join(STORAGE_DIR, 'files');
const DB_FILE = path.join(DATA_DIR, 'submissions.json');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'dissertation-assignments.json');
const GMAIL_CLIENT_ID = String(process.env.GMAIL_CLIENT_ID || '').trim();
const GMAIL_CLIENT_SECRET = String(process.env.GMAIL_CLIENT_SECRET || '').trim();
const GMAIL_REFRESH_TOKEN = String(process.env.GMAIL_REFRESH_TOKEN || '').trim();
const GMAIL_SENDER_EMAIL = String(process.env.GMAIL_SENDER_EMAIL || '').trim();
const GMAIL_FROM_NAME = String(process.env.GMAIL_FROM_NAME || 'UCC Dissertation Portal').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
const ASSIGNMENT_EXPIRY_DAYS = Math.min(60, Math.max(1, Number(process.env.ASSIGNMENT_EXPIRY_DAYS || 14) || 14));

const DEPARTMENTS = {
  'education': {
    name: 'Department of Education Programmes',
    user: process.env.EDUCATION_ADMIN_USER || 'education-admin',
    password: process.env.EDUCATION_ADMIN_PASSWORD || 'change-this-password'
  },
  'business': {
    name: 'Department of Business Programmes',
    user: process.env.BUSINESS_ADMIN_USER || 'business-admin',
    password: process.env.BUSINESS_ADMIN_PASSWORD || 'change-this-password'
  },
  'arts-social-sciences': {
    name: 'Department of Arts and Social Sciences',
    user: process.env.ARTS_SOCIAL_ADMIN_USER || 'arts-admin',
    password: process.env.ARTS_SOCIAL_ADMIN_PASSWORD || 'change-this-password'
  },
  'science-mathematics': {
    name: 'Department of Science and Mathematics Programmes',
    user: process.env.SCIENCE_MATH_ADMIN_USER || 'science-admin',
    password: process.env.SCIENCE_MATH_ADMIN_PASSWORD || 'change-this-password'
  }
};

const REQUIRED_HEADERS = ['S/N', 'NAME', 'REGISTRATION NO.', 'GROUP NO.', 'TOTAL SCORE'];
const MAX_HEADER_SCAN_ROWS = 40;

for (const dir of [STORAGE_DIR, DATA_DIR, FILES_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');
if (!fs.existsSync(ASSIGNMENTS_FILE)) fs.writeFileSync(ASSIGNMENTS_FILE, '[]', 'utf8');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function departmentFromSlug(slug) {
  return Object.prototype.hasOwnProperty.call(DEPARTMENTS, slug) ? DEPARTMENTS[slug] : null;
}

function departmentAuth(req, res, next) {
  const slug = String(req.params.department || '');
  const dept = departmentFromSlug(slug);
  if (!dept) return res.status(404).send('Department administrator portal not found.');

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', `Basic realm="${dept.name} Administration"`);
    return res.status(401).send('Department administrator authentication required.');
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (!safeEqual(user, dept.user) || !safeEqual(pass, dept.password)) {
      res.set('WWW-Authenticate', `Basic realm="${dept.name} Administration"`);
      return res.status(401).send('Invalid department administrator credentials.');
    }
    req.adminDepartment = slug;
    req.adminDepartmentName = dept.name;
    next();
  } catch {
    return res.status(401).send('Invalid department administrator credentials.');
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

async function readAssignments() {
  try {
    const raw = await fsp.readFile(ASSIGNMENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let assignmentWriteQueue = Promise.resolve();
function mutateAssignments(mutator) {
  assignmentWriteQueue = assignmentWriteQueue.catch(() => {}).then(async () => {
    const records = await readAssignments();
    const result = await mutator(records);
    const temp = ASSIGNMENTS_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, ASSIGNMENTS_FILE);
    return result;
  });
  return assignmentWriteQueue;
}

function assignmentTokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function newAssignmentToken() { return crypto.randomBytes(32).toString('hex'); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function baseUrlFor(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  return `${req.protocol}://${req.get('host')}`;
}
function assignmentState(a) {
  if (a.revokedAt) return 'revoked';
  if (a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now()) return 'expired';
  if (a.downloadedAt) return 'downloaded';
  if (a.emailStatus === 'failed') return 'email-failed';
  if (a.sentAt) return 'sent';
  return a.emailStatus || 'pending';
}
function publicAssignment(a) {
  return {
    id:a.id, reference:a.reference, department:a.department, departmentName:a.departmentName,
    assessorName:a.assessorName, assessorEmail:a.assessorEmail, dissertationCount:(a.dissertationIds || []).length,
    createdAt:a.createdAt, sentAt:a.sentAt || null, expiresAt:a.expiresAt, downloadedAt:a.downloadedAt || null,
    downloadCount:Number(a.downloadCount || 0), revokedAt:a.revokedAt || null, emailStatus:a.emailStatus || 'pending',
    status:assignmentState(a), resendCount:Number(a.resendCount || 0), lastEmailError:a.lastEmailError || ''
  };
}
function gmailConfigured() {
  return Boolean(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_SENDER_EMAIL);
}
function cleanMailHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}
function encodeMailHeader(value) {
  const text = cleanMailHeader(value);
  if (!text) return '';
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}
function base64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function getGmailAccessToken() {
  if (!gmailConfigured()) {
    throw new Error('Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL.');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({
      client_id:GMAIL_CLIENT_ID,
      client_secret:GMAIL_CLIENT_SECRET,
      refresh_token:GMAIL_REFRESH_TOKEN,
      grant_type:'refresh_token'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || `Google OAuth returned HTTP ${response.status}.`;
    throw new Error(`Could not obtain a Gmail access token: ${detail}`);
  }
  return data.access_token;
}
async function sendGmailEmail({ to, assessorName, departmentName, dissertationCount, expiresAt, secureUrl, message }) {
  if (!gmailConfigured()) {
    throw new Error('Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL.');
  }
  if (!isEmail(to)) throw new Error('The assessor email address is invalid.');
  if (!isEmail(GMAIL_SENDER_EMAIL)) throw new Error('GMAIL_SENDER_EMAIL is not a valid email address.');

  const expiresText = new Date(expiresAt).toLocaleString('en-GB', { dateStyle:'long', timeStyle:'short', timeZone:'UTC' }) + ' UTC';
  const optionalMessage = message ? `<div style="margin:18px 0;padding:14px 16px;background:#f5f7fa;border-left:4px solid #d4a72c"><strong>Message from the department</strong><br>${htmlEscape(message).replace(/\n/g,'<br>')}</div>` : '';
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#182431;line-height:1.55"><div style="max-width:640px;margin:auto;padding:24px"><h2 style="color:#082b4c">Dissertations Assigned for Assessment</h2><p>Dear ${htmlEscape(assessorName)},</p><p>${htmlEscape(departmentName)} has assigned <strong>${dissertationCount}</strong> dissertation${dissertationCount===1?'':'s'} to you for assessment.</p>${optionalMessage}<p><a href="${htmlEscape(secureUrl)}" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:bold">Access Assigned Dissertations</a></p><p>This secure link expires on <strong>${htmlEscape(expiresText)}</strong>. Please do not forward the link.</p><p>After completing the assessment, submit the assessment reports and claim forms through the Assessor Submission Portal.</p><p>Regards,<br>College of Distance Education<br>University of Cape Coast</p></div></body></html>`;

  const fromName = encodeMailHeader(GMAIL_FROM_NAME || 'UCC Dissertation Portal');
  const fromHeader = fromName ? `${fromName} <${cleanMailHeader(GMAIL_SENDER_EMAIL)}>` : cleanMailHeader(GMAIL_SENDER_EMAIL);
  const subject = encodeMailHeader(`Dissertations for Assessment - ${departmentName}`);
  const rawMessage = [
    `From: ${fromHeader}`,
    `To: ${cleanMailHeader(to)}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html
  ].join('\r\n');

  const accessToken = await getGmailAccessToken();
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:'POST',
    headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ raw:base64Url(rawMessage) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error_description || data?.error || `Gmail API returned HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return data;
}
async function assignmentByToken(token) {
  const hash = assignmentTokenHash(token);
  const assignments = await readAssignments();
  return assignments.find(a => a.tokenHash === hash) || null;
}
function validateLiveAssignment(a) {
  if (!a) return { ok:false, status:404, message:'This secure dissertation link is invalid.' };
  if (a.revokedAt) return { ok:false, status:410, message:'This secure dissertation link has been revoked.' };
  if (new Date(a.expiresAt).getTime() <= Date.now()) return { ok:false, status:410, message:'This secure dissertation link has expired. Please contact the department for a new link.' };
  return { ok:true };
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim().toUpperCase().replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/')
    .replace(/\.$/, '');
}
const NORMALIZED_REQUIRED = REQUIRED_HEADERS.map(normalizeHeader);

function findHeader(matrix) {
  const limit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const normalized = (matrix[r] || []).map(normalizeHeader);
    if (NORMALIZED_REQUIRED.every(h => normalized.includes(h))) {
      const map = {};
      normalized.forEach((h, i) => { if (h && map[h] === undefined) map[h] = i; });
      return { rowIndex: r, map };
    }
  }
  return null;
}

function cellText(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function numericSn(v) { return /^\d+(?:\.0+)?$/.test(String(v || '').trim()); }

function parseScoreWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  if (!workbook.SheetNames.length) throw new Error('The workbook contains no worksheet.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const header = findHeader(matrix);
  if (!header) throw new Error(`The five required headings were not found: ${REQUIRED_HEADERS.join(' | ')}`);

  const idx = Object.fromEntries(NORMALIZED_REQUIRED.map(h => [h, header.map[h]]));
  const rows = [];
  for (let r = header.rowIndex + 1; r < matrix.length; r++) {
    const source = matrix[r] || [];
    const vals = NORMALIZED_REQUIRED.map(h => cellText(source[idx[h]]));
    const [sn, name, registrationNo, groupNo, totalScore] = vals;

    // Acceptance validation is header-only. These conditions are used only to avoid
    // treating blank template lines or signature/footer content as student score rows.
    const looksLikeStudent = numericSn(sn) || (name && registrationNo && (groupNo || totalScore));
    if (!looksLikeStudent) continue;
    rows.push({ originalSn: sn, name, registrationNo, groupNo, totalScore });
  }
  return { sheetName: workbook.SheetNames[0], headerRow: header.rowIndex + 1, rows };
}

function makeReference(prefix) {
  const d = new Date();
  const date = [d.getUTCFullYear(), String(d.getUTCMonth()+1).padStart(2,'0'), String(d.getUTCDate()).padStart(2,'0')].join('');
  return `${prefix}-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function safeBaseName(name) { return path.basename(name || 'file').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140); }

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILES_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBaseName(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 80 } });
function filesFor(req, key) { return (req.files && req.files[key]) || []; }
async function removeUploaded(req) { await Promise.all(Object.values(req.files || {}).flat().map(f => fsp.unlink(f.path).catch(() => {}))); }
function fileRecord(f) { return f ? { storedName: path.basename(f.path), originalName: f.originalname, mimeType: f.mimetype, size: f.size } : null; }
function text(req, key) { return String(req.body[key] || '').trim(); }
function requireText(req, fields) { return fields.find(k => !text(req, k)); }
function validateDepartment(req) {
  const slug = text(req, 'department');
  return departmentFromSlug(slug) ? slug : null;
}

async function saveRecord(record) {
  const records = await readDb();
  records.push(record);
  await writeDb(records);
}

// 1. UNDERGRADUATE PROJECT WORK
app.post('/api/project-work', upload.fields([
  { name: 'claimForm', maxCount: 1 }, { name: 'reportFile', maxCount: 1 },
  { name: 'completedWork', maxCount: 25 }, { name: 'scoresFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const missing = requireText(req, ['fullName','phone','email','groupCount','studyCentre']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error: `Missing required field: ${missing}` }); }
    if (!filesFor(req,'claimForm').length || !filesFor(req,'reportFile').length || !filesFor(req,'completedWork').length || !filesFor(req,'scoresFile').length) {
      await removeUploaded(req); return res.status(400).json({ error: 'Claim form, report, score sheet and completed project work are required.' });
    }
    let scoreResult;
    try { scoreResult = parseScoreWorkbook(filesFor(req,'scoresFile')[0].path); }
    catch (e) { await removeUploaded(req); return res.status(400).json({ error: e.message }); }
    const record = {
      id: crypto.randomUUID(), portalType: 'project-work', department, departmentName: DEPARTMENTS[department].name,
      reference: makeReference('PWORK'), submittedAt: new Date().toISOString(),
      fullName: text(req,'fullName'), phone: text(req,'phone'), email: text(req,'email'), groupCount: text(req,'groupCount'), studyCentre: text(req,'studyCentre'),
      scoreSheet: { worksheet: scoreResult.sheetName, headerRow: scoreResult.headerRow, rowCount: scoreResult.rows.length, rows: scoreResult.rows },
      files: {
        claimForm: fileRecord(filesFor(req,'claimForm')[0]), reportFile: fileRecord(filesFor(req,'reportFile')[0]),
        scoresFile: fileRecord(filesFor(req,'scoresFile')[0]), completedWork: filesFor(req,'completedWork').map(fileRecord)
      }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName, scoreRowsIncluded:scoreResult.rows.length });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The project work submission could not be saved.' }); }
});

// 2. STUDENT DISSERTATION
app.post('/api/dissertation', upload.fields([{ name:'dissertationFile', maxCount:1 }]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const missing = requireText(req, ['studentName','indexNumber','phone','email','supervisorName','programme','dissertationTopic']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error:`Missing required field: ${missing}` }); }
    if (!filesFor(req,'dissertationFile').length) { await removeUploaded(req); return res.status(400).json({ error:'The dissertation file is required.' }); }
    const record = {
      id: crypto.randomUUID(), portalType:'dissertation', department, departmentName: DEPARTMENTS[department].name,
      reference:makeReference('DISS'), submittedAt:new Date().toISOString(),
      studentName:text(req,'studentName'), indexNumber:text(req,'indexNumber'), phone:text(req,'phone'), email:text(req,'email'),
      supervisorName:text(req,'supervisorName'), programme:text(req,'programme'), dissertationTopic:text(req,'dissertationTopic'),
      files:{ dissertationFile:fileRecord(filesFor(req,'dissertationFile')[0]) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The dissertation submission could not be saved.' }); }
});

// 3. ASSESSOR SUBMISSION
app.post('/api/assessor', upload.fields([
  { name:'reportFile', maxCount:25 }, { name:'dissertationFile', maxCount:25 }, { name:'claimForm', maxCount:25 }
]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const missing = requireText(req, ['assessorName','phone','email','studentName','indexNumber','programme','workCount']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error:`Missing required field: ${missing}` }); }

    const workCount = Number.parseInt(text(req,'workCount'), 10);
    if (!Number.isInteger(workCount) || workCount < 1 || workCount > 25) {
      await removeUploaded(req); return res.status(400).json({ error:'Number of works must be between 1 and 25.' });
    }
    const reports = filesFor(req,'reportFile');
    const claims = filesFor(req,'claimForm');
    const dissertations = filesFor(req,'dissertationFile');
    if (reports.length !== workCount || claims.length !== workCount) {
      await removeUploaded(req);
      return res.status(400).json({ error:`For ${workCount} work${workCount===1?'':'s'}, upload exactly ${workCount} assessment report${workCount===1?'':'s'} and ${workCount} claim form${workCount===1?'':'s'}.` });
    }
    if (dissertations.length > workCount) {
      await removeUploaded(req); return res.status(400).json({ error:`You may upload no more than ${workCount} optional dissertation file${workCount===1?'':'s'}.` });
    }
    const record = {
      id:crypto.randomUUID(), portalType:'assessor', department, departmentName: DEPARTMENTS[department].name,
      reference:makeReference('ASSESS'), submittedAt:new Date().toISOString(),
      assessorName:text(req,'assessorName'), phone:text(req,'phone'), email:text(req,'email'), workCount,
      studentName:text(req,'studentName'), indexNumber:text(req,'indexNumber'), programme:text(req,'programme'),
      files:{ reportFile:reports.map(fileRecord), claimForm:claims.map(fileRecord), dissertationFile:dissertations.map(fileRecord) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName, workCount, reportFiles:reports.length, claimForms:claims.length, dissertationFiles:dissertations.length });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The assessor submission could not be saved.' }); }
});

function recordsForDepartment(records, department) { return records.filter(r => r.department === department); }
function projectRecords(records) { return records.filter(r => r.portalType === 'project-work' || !r.portalType); }
function dissertationRecords(records) { return records.filter(r => r.portalType === 'dissertation'); }
function assessorRecords(records) { return records.filter(r => r.portalType === 'assessor'); }

function allScoreRows(records) {
  const out=[]; let sn=1;
  projectRecords(records).slice().sort((a,b)=>String(a.submittedAt).localeCompare(String(b.submittedAt))).forEach(record => {
    for (const row of (record.scoreSheet?.rows || [])) out.push({'S/N':sn++,'NAME':row.name||'','REGISTRATION NO.':row.registrationNo||'','GROUP NO.':row.groupNo||'','TOTAL SCORE':row.totalScore||''});
  });
  return out;
}
function scoreSheetAoA(records) { const rows=allScoreRows(records); return [REQUIRED_HEADERS, ...rows.map(r=>REQUIRED_HEADERS.map(h=>r[h]))]; }
function projectRegisterAoA(records) {
  const h=['S/N','REFERENCE','SUBMITTED AT','EXAMINER / SUPERVISOR','PHONE','EMAIL','STUDY CENTRE','NO. OF GROUPS / CANDIDATES','SCORE ROWS EXTRACTED'];
  const body=projectRecords(records).map((r,i)=>[i+1,r.reference,r.submittedAt,r.fullName,r.phone,r.email,r.studyCentre,r.groupCount,r.scoreSheet?.rowCount??0]); return [h,...body];
}
function dissertationRegisterAoA(records) {
  const h=['S/N','Name of Student','Index Number','Dissertation Title','Programme',"Supervisor's Name"];
  const body=dissertationRecords(records).map((r,i)=>[i+1,r.studentName,r.indexNumber,r.dissertationTopic,r.programme,r.supervisorName]); return [h,...body];
}
function addSheet(wb,name,aoa,widths) {
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=widths.map(w=>({wch:w}));
  if(ws['!ref']) ws['!autofilter']={ref:ws['!ref']};
  XLSX.utils.book_append_sheet(wb,ws,name);
}
function workbookBuffer(kind,records) {
  const wb=XLSX.utils.book_new();
  if(kind==='scores') addSheet(wb,'Consolidated Project Scores',scoreSheetAoA(records),[10,34,24,16,16]);
  if(kind==='project-register') addSheet(wb,'Project Work Register',projectRegisterAoA(records),[8,22,24,32,18,30,22,24,20]);
  if(kind==='project-master') {
    addSheet(wb,'Master Project Scores',scoreSheetAoA(records),[10,34,24,16,16]);
    addSheet(wb,'Project Work Register',projectRegisterAoA(records),[8,22,24,32,18,30,22,24,20]);
  }
  if(kind==='dissertation-register') addSheet(wb,'Dissertation Register',dissertationRegisterAoA(records),[8,34,24,58,32,34]);
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
function sendWorkbook(res,kind,records,filename){
  const buffer=workbookBuffer(kind,records);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
  res.send(buffer);
}

function adminRecordsMap(records) {
  return records.slice().reverse().map(r=>({
    id:r.id, reference:r.reference, submittedAt:r.submittedAt, portalType:r.portalType||'project-work',
    name:r.fullName||r.studentName||r.assessorName||'', secondaryName:r.portalType==='assessor'?r.studentName:(r.portalType==='dissertation'?r.supervisorName:''),
    email:r.email||'', phone:r.phone||'', programme:r.programme||'', studyCentre:r.studyCentre||'', scoreRows:r.scoreSheet?.rowCount??0,
    studentName:r.studentName||'', indexNumber:r.indexNumber||'', dissertationTopic:r.dissertationTopic||'', supervisorName:r.supervisorName||'',
    assessorName:r.assessorName||'', workCount:r.workCount||1,
    reportFileCount:Array.isArray(r.files?.reportFile)?r.files.reportFile.length:(r.files?.reportFile?1:0),
    claimFormCount:Array.isArray(r.files?.claimForm)?r.files.claimForm.length:(r.files?.claimForm?1:0),
    dissertationFileCount:Array.isArray(r.files?.dissertationFile)?r.files.dissertationFile.length:(r.files?.dissertationFile?1:0),
    dissertationFileName:Array.isArray(r.files?.dissertationFile)?(r.files.dissertationFile[0]?.originalName||''):(r.files?.dissertationFile?.originalName||'')
  }));
}


// SECURE DISSERTATION ASSIGNMENT LINKS
app.get('/secure/dissertations/:token', async (req, res) => {
  const a = await assignmentByToken(req.params.token);
  const live = validateLiveAssignment(a);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (!live.ok) return res.status(live.status).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dissertation Access</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431"><main style="max-width:680px;margin:70px auto;background:#fff;padding:32px;border-radius:14px"><h2 style="color:#082b4c">Dissertation Access</h2><p>${htmlEscape(live.message)}</p></main></body></html>`);
  const count=(a.dissertationIds||[]).length;
  const expiry=new Date(a.expiresAt).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'})+' UTC';
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assigned Dissertations</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431;margin:0"><main style="max-width:680px;margin:60px auto;background:#fff;padding:32px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.08)"><div style="font-size:12px;text-transform:uppercase;color:#d4a72c;font-weight:bold">University of Cape Coast</div><h1 style="color:#082b4c;font-size:26px">Assigned Dissertations</h1><p>Dear ${htmlEscape(a.assessorName)},</p><p>You have <strong>${count}</strong> dissertation${count===1?'':'s'} assigned by ${htmlEscape(a.departmentName)}.</p><p>This link expires on <strong>${htmlEscape(expiry)}</strong>.</p><form method="get" action="/secure/dissertations/${encodeURIComponent(req.params.token)}/download"><button type="submit" style="background:#082b4c;color:white;border:0;border-radius:8px;padding:13px 18px;font-weight:bold;cursor:pointer">Download ${count} Dissertation${count===1?'':'s'} as ZIP</button></form><p style="margin-top:24px;color:#647382;font-size:13px">Keep this link private. If it has expired, contact the department administrator for a new link.</p></main></body></html>`);
});

app.get('/secure/dissertations/:token/download', async (req, res) => {
  const a = await assignmentByToken(req.params.token);
  const live = validateLiveAssignment(a);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  if (!live.ok) return res.status(live.status).send(live.message);

  const records = dissertationRecords(recordsForDepartment(await readDb(), a.department));
  const selected = (a.dissertationIds || []).map(id => records.find(r => r.id === id)).filter(Boolean);
  const zipFiles=[];
  selected.forEach((r,i)=>{
    const item=r.files?.dissertationFile;
    if(!item) return;
    const fp=path.join(FILES_DIR,path.basename(item.storedName));
    if(!fs.existsSync(fp)) return;
    const ext=path.extname(item.originalName || fp) || '.docx';
    const prefix=String(i+1).padStart(3,'0');
    zipFiles.push({path:fp,name:safeBaseName(`${prefix} - ${r.indexNumber || 'No Index'} - ${r.studentName || 'Student'}${ext}`),size:Number(item.size||fs.statSync(fp).size)});
  });
  if(!zipFiles.length) return res.status(404).send('The assigned dissertation files are currently unavailable.');
  const totalSize=zipFiles.reduce((sum,f)=>sum+f.size,0);
  if(totalSize > 3.5 * 1024 * 1024 * 1024) return res.status(413).send('This dissertation package is too large for one ZIP. Please contact the department administrator.');

  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition',`attachment; filename="${safeBaseName(`${a.reference}-dissertations.zip`)}"`);
  try {
    await streamZipArchive(res, zipFiles);
    await mutateAssignments(list => {
      const item=list.find(x=>x.id===a.id);
      if(item){ item.downloadedAt=item.downloadedAt || new Date().toISOString(); item.lastDownloadedAt=new Date().toISOString(); item.downloadCount=Number(item.downloadCount||0)+1; }
    });
  } catch(e) {
    console.error('Secure dissertation ZIP download failed:', e);
    if(!res.headersSent) res.status(500).send('Could not prepare the dissertation ZIP file.'); else res.end();
  }
});

// DEPARTMENT ADMIN: dissertation assignment by secure emailed link
app.get('/api/admin/:department/dissertation-assignments', departmentAuth, async(req,res)=>{
  const list=(await readAssignments()).filter(a=>a.department===req.adminDepartment).slice().reverse().map(publicAssignment);
  res.json(list);
});

app.post('/api/admin/:department/dissertation-assignments', departmentAuth, async(req,res)=>{
  const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String))]:[];
  const assessorName=String(req.body?.assessorName||'').trim();
  const assessorEmail=String(req.body?.assessorEmail||'').trim();
  const message=String(req.body?.message||'').trim().slice(0,4000);
  const expiryDays=Math.min(60,Math.max(1,Number.parseInt(req.body?.expiryDays,10)||ASSIGNMENT_EXPIRY_DAYS));
  if(!gmailConfigured()) return res.status(503).json({error:'Email sending is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL in Render.'});
  if(!ids.length) return res.status(400).json({error:'Select at least one dissertation.'});
  if(ids.length>500) return res.status(400).json({error:'A maximum of 500 dissertations can be assigned at once.'});
  if(!assessorName) return res.status(400).json({error:"Enter the assessor's name."});
  if(!isEmail(assessorEmail)) return res.status(400).json({error:'Enter a valid assessor email address.'});

  const records=dissertationRecords(recordsForDepartment(await readDb(),req.adminDepartment));
  const selected=ids.map(id=>records.find(r=>r.id===id)).filter(Boolean);
  if(selected.length!==ids.length) return res.status(400).json({error:'One or more selected dissertations are unavailable in this department.'});
  const token=newAssignmentToken();
  const now=new Date();
  const expiresAt=new Date(now.getTime()+expiryDays*24*60*60*1000).toISOString();
  const assignment={
    id:crypto.randomUUID(), reference:makeReference('ASSIGN'), department:req.adminDepartment, departmentName:req.adminDepartmentName,
    assessorName, assessorEmail, dissertationIds:ids, createdAt:now.toISOString(), expiresAt, tokenHash:assignmentTokenHash(token),
    sentAt:null, downloadedAt:null, lastDownloadedAt:null, downloadCount:0, revokedAt:null, emailStatus:'pending', resendCount:0, message
  };
  await mutateAssignments(list=>list.push(assignment));
  const secureUrl=`${baseUrlFor(req)}/secure/dissertations/${token}`;
  try {
    const email=await sendGmailEmail({to:assessorEmail,assessorName,departmentName:req.adminDepartmentName,dissertationCount:ids.length,expiresAt,secureUrl,message});
    await mutateAssignments(list=>{const a=list.find(x=>x.id===assignment.id);if(a){a.sentAt=new Date().toISOString();a.emailStatus='sent';a.emailProvider='gmail';a.emailProviderMessageId=email.id||'';a.lastEmailError='';}});
    const final=(await readAssignments()).find(x=>x.id===assignment.id)||assignment;
    res.status(201).json({ok:true,assignment:publicAssignment(final)});
  } catch(e) {
    console.error('Gmail assignment email failed:',e);
    await mutateAssignments(list=>{const a=list.find(x=>x.id===assignment.id);if(a){a.emailStatus='failed';a.lastEmailError=String(e.message||e).slice(0,500);}});
    res.status(502).json({error:`The assignment was recorded, but the email could not be sent: ${e.message||e}`,assignmentId:assignment.id});
  }
});

app.post('/api/admin/:department/dissertation-assignments/:id/revoke', departmentAuth, async(req,res)=>{
  const item=await mutateAssignments(list=>{
    const a=list.find(x=>x.id===req.params.id&&x.department===req.adminDepartment);
    if(!a) return null;
    a.revokedAt=new Date().toISOString(); a.emailStatus='revoked'; return publicAssignment(a);
  });
  if(!item) return res.status(404).json({error:'Assignment not found.'});
  res.json({ok:true,assignment:item});
});

app.post('/api/admin/:department/dissertation-assignments/:id/resend', departmentAuth, async(req,res)=>{
  if(!gmailConfigured()) return res.status(503).json({error:'Email sending is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL in Render.'});
  const all=await readAssignments();
  const existing=all.find(x=>x.id===req.params.id&&x.department===req.adminDepartment);
  if(!existing) return res.status(404).json({error:'Assignment not found.'});
  const expiryDays=Math.min(60,Math.max(1,Number.parseInt(req.body?.expiryDays,10)||ASSIGNMENT_EXPIRY_DAYS));
  const token=newAssignmentToken();
  const expiresAt=new Date(Date.now()+expiryDays*24*60*60*1000).toISOString();
  await mutateAssignments(list=>{const a=list.find(x=>x.id===existing.id);if(a){a.tokenHash=assignmentTokenHash(token);a.expiresAt=expiresAt;a.revokedAt=null;a.emailStatus='pending';a.lastEmailError='';a.resendCount=Number(a.resendCount||0)+1;}});
  const secureUrl=`${baseUrlFor(req)}/secure/dissertations/${token}`;
  try {
    const email=await sendGmailEmail({to:existing.assessorEmail,assessorName:existing.assessorName,departmentName:existing.departmentName,dissertationCount:(existing.dissertationIds||[]).length,expiresAt,secureUrl,message:existing.message||''});
    const item=await mutateAssignments(list=>{const a=list.find(x=>x.id===existing.id);if(a){a.sentAt=new Date().toISOString();a.emailStatus='sent';a.emailProvider='gmail';a.emailProviderMessageId=email.id||'';a.lastEmailError='';return publicAssignment(a);}return null;});
    res.json({ok:true,assignment:item});
  } catch(e) {
    console.error('Gmail assignment email failed:',e);
    await mutateAssignments(list=>{const a=list.find(x=>x.id===existing.id);if(a){a.emailStatus='failed';a.lastEmailError=String(e.message||e).slice(0,500);}});
    res.status(502).json({error:`The secure link was regenerated, but the email could not be sent: ${e.message||e}`});
  }
});

// Public admin chooser. Department data remain protected behind department-specific credentials.
app.get('/admin',(_req,res)=>res.sendFile(path.join(__dirname,'admin','chooser.html')));
app.get('/admin/admin.css',(_req,res)=>res.sendFile(path.join(__dirname,'admin','admin.css')));
app.get('/admin/admin.js',(_req,res)=>res.sendFile(path.join(__dirname,'admin','admin.js')));
app.get('/admin/:department',departmentAuth,(req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));

app.get('/api/admin/:department/info', departmentAuth, async(req,res)=>{
  res.json({ department:req.adminDepartment, departmentName:req.adminDepartmentName });
});
app.get('/api/admin/:department/submissions', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  res.json(adminRecordsMap(records));
});
app.get('/api/admin/:department/submissions/:id', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).json({error:'Submission not found in this department.'});
  res.json(r);
});
app.get('/api/admin/:department/submissions/:id/files/:kind/:index?', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).send('Submission not found in this department.');
  const allowed=['claimForm','reportFile','scoresFile','completedWork','dissertationFile'];
  if(!allowed.includes(req.params.kind))return res.status(400).send('Invalid file type.');
  let item=r.files?.[req.params.kind];
  if(Array.isArray(item))item=item[Number(req.params.index||0)];
  if(!item)return res.status(404).send('File not found.');
  const fp=path.join(FILES_DIR,path.basename(item.storedName));
  if(!fs.existsSync(fp))return res.status(404).send('Stored file is unavailable.');
  res.download(fp,item.originalName);
});
app.get('/api/admin/:department/submissions/:id/scores.xlsx', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r||!(r.portalType==='project-work'||!r.portalType))return res.status(404).send('Project work submission not found.');
  sendWorkbook(res,'scores',[r],`${r.reference}-clean-scores.xlsx`);
});

// UNDERGRADUATE PROJECT WORK exports only
app.get('/api/admin/:department/export/project-scores.xlsx', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'scores',records,`${req.adminDepartment}-consolidated-project-scores.xlsx`);
});
app.get('/api/admin/:department/export/project-register.xlsx', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'project-register',records,`${req.adminDepartment}-project-work-register.xlsx`);
});
app.get('/api/admin/:department/export/project-master.xlsx', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'project-master',records,`${req.adminDepartment}-master-project-scores.xlsx`);
});

// DISSERTATION register and selected-document ZIP. No dissertation content is consolidated.
app.get('/api/admin/:department/export/dissertation-register.xlsx', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'dissertation-register',records,`${req.adminDepartment}-dissertation-register.xlsx`);
});
app.post('/api/admin/:department/dissertations/download-selected', departmentAuth, async(req,res)=>{
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (!ids.length) return res.status(400).json({ error:'Select at least one dissertation.' });
  if (ids.length > 500) return res.status(400).json({ error:'A maximum of 500 dissertations can be downloaded at once.' });

  const records=dissertationRecords(recordsForDepartment(await readDb(), req.adminDepartment));
  const selected = ids.map(id => records.find(r => r.id === id)).filter(Boolean);
  if (!selected.length) return res.status(404).json({ error:'No selected dissertations were found in this department.' });

  const zipFiles=[];
  selected.forEach((r,i)=>{
    const item=r.files?.dissertationFile;
    if(!item) return;
    const fp=path.join(FILES_DIR,path.basename(item.storedName));
    if(!fs.existsSync(fp)) return;
    const ext=path.extname(item.originalName || fp) || '.docx';
    const prefix=String(i+1).padStart(3,'0');
    zipFiles.push({path:fp,name:safeBaseName(`${prefix} - ${r.indexNumber || 'No Index'} - ${r.studentName || 'Student'}${ext}`),size:Number(item.size||fs.statSync(fp).size)});
  });
  if(!zipFiles.length) return res.status(404).json({ error:'Selected dissertation files are unavailable.' });
  const totalSize=zipFiles.reduce((a,f)=>a+f.size,0);
  if(totalSize > 3.5 * 1024 * 1024 * 1024) return res.status(400).json({ error:'The selected ZIP would exceed the supported 3.5 GB limit. Download the dissertations in smaller groups.' });

  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition',`attachment; filename="${req.adminDepartment}-selected-dissertations.zip"`);
  try { await streamZipArchive(res, zipFiles); }
  catch(e) { console.error('ZIP download failed:', e); if(!res.headersSent)res.status(500).json({error:'Could not create the ZIP file.'}); else res.end(); }
});

app.get('/api/admin/:department/summary',departmentAuth,async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  res.json({
    total:records.length,
    project:projectRecords(records).length,
    dissertation:dissertationRecords(records).length,
    assessor:assessorRecords(records).length,
    scoreRows:allScoreRows(records).length
  });
});

app.get('/health',(_req,res)=>res.json({ok:true,departments:Object.keys(DEPARTMENTS).length,emailConfigured:gmailConfigured(),emailProvider:'gmail'}));
app.get('/vendor/xlsx.full.min.js', (_req,res)=>res.sendFile(path.join(__dirname,'node_modules','xlsx','dist','xlsx.full.min.js')));
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.use((err,req,res,_next)=>{
  console.error(err);
  if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'A file exceeds the 100 MB server limit.':err.message});
  res.status(500).json({error:'Unexpected server error.'});
});
app.listen(PORT,'0.0.0.0',()=>{
  console.log(`UCC submission portals listening on ${PORT}`);
  for (const [slug, dept] of Object.entries(DEPARTMENTS)) {
    if (dept.password === 'change-this-password') console.warn(`WARNING: Set a secure admin password for ${slug}.`);
  }
});
