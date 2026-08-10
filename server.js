const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { CanvasFactory } = require('pdf-parse/worker');
const { PDFParse } = require('pdf-parse');

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
const RESOURCES_FILE = path.join(DATA_DIR, 'resources.json');
const ADMIN_USERS_FILE = path.join(DATA_DIR, 'admin-users.json');
const STUDY_CENTRES_FILE = path.join(DATA_DIR, 'study-centres.json');
const RESOURCES_DIR = path.join(STORAGE_DIR, 'resources');
const GMAIL_CLIENT_ID = String(process.env.GMAIL_CLIENT_ID || '').trim();
const GMAIL_CLIENT_SECRET = String(process.env.GMAIL_CLIENT_SECRET || '').trim();
const GMAIL_REFRESH_TOKEN = String(process.env.GMAIL_REFRESH_TOKEN || '').trim();
const GMAIL_SENDER_EMAIL = String(process.env.GMAIL_SENDER_EMAIL || '').trim();
const GMAIL_FROM_NAME = String(process.env.GMAIL_FROM_NAME || 'UCC Dissertation Portal').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
const ASSIGNMENT_EXPIRY_DAYS = Math.min(60, Math.max(1, Number(process.env.ASSIGNMENT_EXPIRY_DAYS || 14) || 14));
const DEVELOPER_ADMIN_USER = String(process.env.DEVELOPER_ADMIN_USER || 'developer').trim();
const DEVELOPER_ADMIN_PASSWORD = String(process.env.DEVELOPER_ADMIN_PASSWORD || 'change-this-password');
const STUDENT_FEEDBACK_EXPIRY_DAYS = Math.min(90, Math.max(1, Number(process.env.STUDENT_FEEDBACK_EXPIRY_DAYS || 30) || 30));
const ADMIN_INVITATION_EXPIRY_HOURS = Math.min(168, Math.max(1, Number(process.env.ADMIN_INVITATION_EXPIRY_HOURS || 24) || 24));
const PROJECT_HIGH_ROW_WARNING = Math.max(1, Number(process.env.PROJECT_HIGH_ROW_WARNING || 100) || 100);

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

const RESOURCE_PORTALS = new Set(['project-work','field-experience','dissertation','assessor']);

const DEFAULT_STUDY_CENTRES = [
  'Bompeh','GHANASS','Lashibi','Sokode','Riverview Kasoa','Odorgonno','KTI','Tamale','Zenith',
  'STU Sunyani','Fafraha','Lutheran Madina','Fiaseman','UCC','Enchi','Bolga','Wa','Chemu'
];
const ADMIN_SECTIONS = new Set(['project-work','field-experience','dissertation','assessor']);
const ADMIN_ROLES = new Set(['viewer','officer','administrator']);
const ROLE_RANK = { viewer:1, officer:2, administrator:3 };

const BUILTIN_RESOURCES = [
  {
    id: 'builtin-project-score-sheet',
    title: 'Project Work Score Sheet Sample',
    description: 'Use this sample score sheet for undergraduate project work. The submission validator checks only the five required headings.',
    portals: ['project-work','field-experience'],
    originalName: 'SCORE SHEET_PROJECT WORK sample.xlsx',
    builtIn: true,
    sourcePath: path.join(__dirname, 'public', 'resources', 'project-work', 'score-sheet-project-work-sample.xlsx')
  },
  {
    id: 'builtin-project-supervisor-report',
    title: 'Supervisor Report Sample',
    description: 'Supervisor report template for study centre, groups supervised, performance, challenges and recommendations.',
    portals: ['project-work'],
    originalName: 'Supervisor Report sample.docx',
    builtIn: true,
    sourcePath: path.join(__dirname, 'public', 'resources', 'project-work', 'supervisor-report-sample.docx')
  },
  {
    id: 'builtin-project-claim-form',
    title: 'Claim Form for Undergraduate Supervision',
    description: 'Claim form template to complete and upload with the undergraduate project work submission.',
    portals: ['project-work'],
    originalName: 'Claim Form sample.docx',
    builtIn: true,
    sourcePath: path.join(__dirname, 'public', 'resources', 'project-work', 'claim-form-sample.docx')
  }
];

const REQUIRED_HEADERS = ['S/N', 'NAME', 'REGISTRATION NO.', 'GROUP NO.', 'TOTAL SCORE'];
const MAX_HEADER_SCAN_ROWS = 40;

for (const dir of [STORAGE_DIR, DATA_DIR, FILES_DIR, RESOURCES_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');
if (!fs.existsSync(ASSIGNMENTS_FILE)) fs.writeFileSync(ASSIGNMENTS_FILE, '[]', 'utf8');
if (!fs.existsSync(RESOURCES_FILE)) fs.writeFileSync(RESOURCES_FILE, '[]', 'utf8');
if (!fs.existsSync(ADMIN_USERS_FILE)) fs.writeFileSync(ADMIN_USERS_FILE, '[]', 'utf8');
if (!fs.existsSync(STUDY_CENTRES_FILE)) fs.writeFileSync(STUDY_CENTRES_FILE, JSON.stringify(DEFAULT_STUDY_CENTRES, null, 2), 'utf8');

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

async function readAdminUsers() {
  try {
    const raw = await fsp.readFile(ADMIN_USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
let adminUserWriteQueue = Promise.resolve();
function mutateAdminUsers(mutator) {
  adminUserWriteQueue = adminUserWriteQueue.catch(() => {}).then(async () => {
    const records = await readAdminUsers();
    const result = await mutator(records);
    const temp = ADMIN_USERS_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, ADMIN_USERS_FILE);
    return result;
  });
  return adminUserWriteQueue;
}
function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = crypto.scryptSync(String(password), String(salt || ''), 64);
    const expected = Buffer.from(String(expectedHash || ''), 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function normalizeAdminSections(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(v => String(v || '').trim()).filter(v => ADMIN_SECTIONS.has(v)))];
}
function normalizeAdminDepartments(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(source.map(v => String(v || '').trim()).filter(v => departmentFromSlug(v)))];
}
function publicAdminUser(user) {
  const passwordSet=Boolean(user.passwordHash && user.passwordSalt);
  const invitationExpiresAt=user.invitationExpiresAt || null;
  const invitationExpired=Boolean(invitationExpiresAt && new Date(invitationExpiresAt).getTime() <= Date.now());
  return {
    id:user.id, name:user.name || user.username, username:user.username, email:user.email || '',
    role:user.role || 'viewer', departments:user.departments || [], sections:user.sections || [],
    active:user.active !== false, createdAt:user.createdAt || null,
    passwordSet, passwordSetAt:user.passwordSetAt || null,
    invitationSentAt:user.invitationSentAt || null, invitationExpiresAt,
    invitationExpired, invitationEmailStatus:user.invitationEmailStatus || null,
    invitationLastError:user.invitationLastError || null
  };
}
function hashOneTimeToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}
function newAdminInvitation() {
  const token=crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash:hashOneTimeToken(token),
    expiresAt:new Date(Date.now()+ADMIN_INVITATION_EXPIRY_HOURS*60*60*1000).toISOString()
  };
}
function requestBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const forwarded=String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol=forwarded || req.protocol || 'https';
  return `${protocol}://${req.get('host')}`.replace(/\/$/, '');
}
function adminLoginLinks(departments, baseUrl) {
  return (departments || []).map(slug=>({slug,name:departmentFromSlug(slug)?.name || slug,url:`${baseUrl}/admin/${encodeURIComponent(slug)}`}));
}
async function sendAdminPasswordSetupEmail({to,name,username,role,departments,sections,setupUrl,expiresAt,baseUrl,isReset=false}) {
  const deptNames=(departments || []).map(slug=>departmentFromSlug(slug)?.name || slug);
  const sectionNames=(sections || []).map(section=>section==='project-work'?'Undergraduate Project Work':section==='field-experience'?'Field Experience Scores':section==='dissertation'?'Dissertation Submission':'Assessment/Vetting Reports');
  const expiryText=new Date(expiresAt).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'})+' UTC';
  const portalRows=adminLoginLinks(departments,baseUrl).map(x=>`<li><a href="${htmlEscape(x.url)}">${htmlEscape(x.name)} Administration Portal</a></li>`).join('');
  const subject=isReset?'UCC Submission Portal password reset':'Your UCC Submission Portal administrator account';
  const action=isReset?'reset your administrator password':'set your administrator password';
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#182431;line-height:1.55"><div style="max-width:680px;margin:auto;padding:24px"><h2 style="color:#082b4c">${isReset?'Password Reset':'Administrator Account Invitation'}</h2><p>Dear ${htmlEscape(name)},</p><p>${isReset?'A secure password-reset link has been issued for your':'An individual administrator account has been created for you on the'} UCC Academic Submission Portal.</p><div style="margin:18px 0;padding:16px;background:#f5f7fa;border-left:4px solid #d4a72c"><strong>Temporary account credential</strong><br>Username: <strong>${htmlEscape(username)}</strong><br>Password: <strong>Set by you using the one-time link below</strong></div><p><a href="${htmlEscape(setupUrl)}" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:bold">${isReset?'Set New Password':'Set Your Password'}</a></p><p>This one-time link expires on <strong>${htmlEscape(expiryText)}</strong>. After the password is set, the link cannot be used again.</p><p><strong>Role:</strong> ${htmlEscape(role)}<br><strong>Department access:</strong> ${htmlEscape(deptNames.join(', '))}<br><strong>Section access:</strong> ${htmlEscape(sectionNames.join(', '))}</p><p>After setting your password, sign in to the department administration portal using the username above and the password you create:</p><ul>${portalRows}</ul><p>If you did not expect this account, do not use the link and contact the portal administrator.</p><p>Regards,<br>College of Distance Education<br>University of Cape Coast</p></div></body></html>`;
  return sendGmailHtmlEmail({to,subject,html});
}
async function departmentAuth(req, res, next) {
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

    // Existing department environment account remains the department master administrator.
    if (safeEqual(user, dept.user) && safeEqual(pass, dept.password)) {
      req.adminDepartment = slug;
      req.adminDepartmentName = dept.name;
      req.adminIdentity = {
        id:`department-master:${slug}`, name:`${dept.name} Administrator`, username:user,
        role:'administrator', sections:['project-work','field-experience','dissertation','assessor'], departments:[slug], master:true
      };
      return next();
    }

    const accounts = await readAdminUsers();
    const account = accounts.find(a => a.active !== false && String(a.username || '').toLowerCase() === user.toLowerCase());
    const allowedDepartment = account && (account.departments || []).includes(slug);
    if (!account || !allowedDepartment || !verifyPassword(pass, account.passwordSalt, account.passwordHash)) {
      res.set('WWW-Authenticate', `Basic realm="${dept.name} Administration"`);
      return res.status(401).send('Invalid department administrator credentials.');
    }
    req.adminDepartment = slug;
    req.adminDepartmentName = dept.name;
    req.adminIdentity = {...publicAdminUser(account), master:false};
    return next();
  } catch (e) {
    console.error('Department authentication failed:', e);
    return res.status(401).send('Invalid department administrator credentials.');
  }
}
function portalSectionForRecord(record) {
  const type = record?.portalType || 'project-work';
  return ADMIN_SECTIONS.has(type) ? type : 'project-work';
}
function adminCan(req, section, minimumRole='viewer') {
  const identity=req.adminIdentity || {};
  return (identity.sections || []).includes(section) && (ROLE_RANK[identity.role] || 0) >= (ROLE_RANK[minimumRole] || 1);
}
function requireAdminAccess(section, minimumRole='viewer') {
  return (req,res,next) => adminCan(req, section, minimumRole)
    ? next()
    : res.status(403).json({error:`Your administrator account does not have ${minimumRole} access to this section.`});
}
function requireRecordAccess(req, res, record, minimumRole='viewer') {
  const section=portalSectionForRecord(record);
  if (!adminCan(req, section, minimumRole)) {
    res.status(403).json({error:`Your administrator account does not have ${minimumRole} access to this submission section.`});
    return false;
  }
  return true;
}

function developerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Developer Resource Administration"');
    return res.status(401).send('Developer authentication required.');
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (!safeEqual(user, DEVELOPER_ADMIN_USER) || !safeEqual(pass, DEVELOPER_ADMIN_PASSWORD)) {
      res.set('WWW-Authenticate', 'Basic realm="Developer Resource Administration"');
      return res.status(401).send('Invalid developer credentials.');
    }
    next();
  } catch {
    return res.status(401).send('Invalid developer credentials.');
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
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const temp = DB_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, DB_FILE);
  });
  return writeQueue;
}
function mutateDb(mutator) {
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const records = await readDb();
    const result = await mutator(records);
    const temp = DB_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, DB_FILE);
    return result;
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


async function readResources() {
  try {
    const raw = await fsp.readFile(RESOURCES_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
let resourceWriteQueue = Promise.resolve();
function mutateResources(mutator) {
  resourceWriteQueue = resourceWriteQueue.catch(() => {}).then(async () => {
    const records = await readResources();
    const result = await mutator(records);
    const temp = RESOURCES_FILE + '.tmp';
    await fsp.writeFile(temp, JSON.stringify(records, null, 2), 'utf8');
    await fsp.rename(temp, RESOURCES_FILE);
    return result;
  });
  return resourceWriteQueue;
}
function normalizeResourcePortals(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map(v => String(v || '').trim()).filter(v => RESOURCE_PORTALS.has(v)))];
}
async function readStudyCentres() {
  try {
    const raw = await fsp.readFile(STUDY_CENTRES_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    const centres = Array.isArray(parsed) ? parsed.map(cleanHumanText).filter(Boolean) : [];
    return centres.length ? [...new Set(centres)] : DEFAULT_STUDY_CENTRES.slice();
  } catch { return DEFAULT_STUDY_CENTRES.slice(); }
}
let studyCentreWriteQueue = Promise.resolve();
function writeStudyCentres(centres) {
  studyCentreWriteQueue = studyCentreWriteQueue.catch(() => {}).then(async () => {
    const cleaned=[...new Set((centres || []).map(cleanHumanText).filter(Boolean))];
    const temp=STUDY_CENTRES_FILE+'.tmp';
    await fsp.writeFile(temp, JSON.stringify(cleaned, null, 2), 'utf8');
    await fsp.rename(temp, STUDY_CENTRES_FILE);
    return cleaned;
  });
  return studyCentreWriteQueue;
}
function parseStudyCentreCsv(filePath) {
  const wb=XLSX.readFile(filePath,{raw:false});
  if(!wb.SheetNames.length) throw new Error('The CSV contains no worksheet.');
  const matrix=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
  const values=[];
  for(const row of matrix){
    const first=cleanHumanText(row?.[0]);
    if(!first) continue;
    const normalized=first.toLowerCase().replace(/[^a-z]/g,'');
    if(['studycentre','studycenter','centre','center','name'].includes(normalized)) continue;
    values.push(first);
  }
  const unique=[...new Set(values)];
  if(!unique.length) throw new Error('No study centres were found in the first column of the CSV file.');
  return unique;
}

function publicResource(resource) {
  return {
    id: resource.id,
    title: resource.title,
    description: resource.description || '',
    portals: resource.portals || [],
    originalName: resource.originalName || 'Download resource',
    size: Number(resource.size || 0),
    uploadedAt: resource.uploadedAt || null,
    builtIn: Boolean(resource.builtIn),
    downloadUrl: `/api/resources/${encodeURIComponent(resource.id)}/download`
  };
}

function assignmentTokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function newAssignmentToken() { return crypto.randomBytes(32).toString('hex'); }
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

const PERSON_TITLES = new Set(['mr','mrs','ms','miss','dr','prof','professor','rev','reverend','ing','esq','esquire']);
function cleanHumanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}
function buildDisplayName(title, firstName, lastName) {
  return [cleanHumanText(title), cleanHumanText(firstName), cleanHumanText(lastName)].filter(Boolean).join(' ');
}
function personNameTokens(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(Boolean).filter(t => !PERSON_TITLES.has(t)).sort();
}
function samePersonName(a, b) {
  const aa = personNameTokens(a), bb = personNameTokens(b);
  if (aa.length < 2 || bb.length < 2) return false;
  const small = aa.length <= bb.length ? aa : bb;
  const large = aa.length <= bb.length ? bb : aa;
  return small.every(v => large.includes(v));
}
function personKey(name, email='') {
  const tokens=personNameTokens(name);
  return tokens.length>=2 ? `name:${tokens.join('|')}` : `email:${String(email||'').trim().toLowerCase()}`;
}
function normalizeDissertationTitle(value) {
  return String(value || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function compactDissertationTitle(value) {
  return normalizeDissertationTitle(value).replace(/\s+/g, '');
}
async function extractDissertationText(file) {
  const ext = path.extname(file.originalname || file.path).toLowerCase();
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file.path });
    return String(result.value || '');
  }
  if (ext === '.doc') {
    const extractor = new WordExtractor();
    const result = await extractor.extract(file.path);
    return String(result.getBody ? result.getBody() : '');
  }
  if (ext === '.pdf') {
    const buffer = await fsp.readFile(file.path);
    const parser = new PDFParse({ data: buffer, CanvasFactory });
    try {
      const result = await parser.getText({ first: 4 });
      return String(result.text || '');
    } finally {
      if (typeof parser.destroy === 'function') { try { await parser.destroy(); } catch {} }
    }
  }
  throw new Error('Dissertation title validation supports PDF, DOC and DOCX files only.');
}
async function validateDissertationTitleAgainstFile(enteredTitle, file) {
  const expected = normalizeDissertationTitle(enteredTitle);
  const expectedCompact = compactDissertationTitle(enteredTitle);
  if (expected.length < 8) throw new Error('Enter the full dissertation title as it appears on the title page.');
  let extracted;
  try {
    extracted = await extractDissertationText(file);
  } catch (e) {
    throw new Error(`The dissertation text could not be read for title validation. ${e.message || e}`);
  }
  const firstText = String(extracted || '').slice(0, 120000);
  if (normalizeDissertationTitle(firstText).length < 20) {
    throw new Error('The uploaded dissertation does not contain enough readable text for automatic title validation. Upload a searchable PDF, DOC or DOCX file.');
  }
  const normalDoc = normalizeDissertationTitle(firstText);
  const compactDoc = compactDissertationTitle(firstText);
  const matched = normalDoc.includes(expected) || (expectedCompact.length >= 12 && compactDoc.includes(expectedCompact));
  if (!matched) {
    throw new Error('The entered dissertation title does not match the title found in the uploaded work. Copy the title exactly as it appears on the dissertation title page and submit again.');
  }
  return { matched: true, method: 'document-text', checkedAt: new Date().toISOString() };
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
function publicAssignment(a, dissertationRecordsForDepartment=[], assessorSubmissionRecords=[]) {
  const linked=(a.dissertationIds||[]).map(id=>dissertationRecordsForDepartment.find(r=>r.id===id)).filter(Boolean);
  const fallbackDeadlines=assignmentDeadlineDates(new Date(a.sentAt||a.createdAt||Date.now()));
  const completion=assignmentWorkCompletion(a,assessorSubmissionRecords);
  let status;
  if(a.revokedAt)status='revoked';
  else if(completion.total>0&&completion.submittedCount>=completion.total)status='completed';
  else if(completion.submittedCount>0)status='in-progress';
  else if(a.emailStatus==='failed')status='email-failed';
  else if(a.expiresAt&&new Date(a.expiresAt).getTime()<=Date.now())status='download-expired';
  else if(a.downloadedAt)status='downloaded';
  else if(a.sentAt)status='sent';
  else status=a.emailStatus||'pending';
  const earlyBirdCount=[...completion.submitted.values()].filter(x=>earlyBirdForSubmission(a,x.record?.submittedAt)).length;
  return {
    id:a.id, reference:a.reference, department:a.department, departmentName:a.departmentName,
    assessorTitle:a.assessorTitle || '', assessorFirstName:a.assessorFirstName || '', assessorLastName:a.assessorLastName || '',
    assessorName:a.assessorName, assessorEmail:a.assessorEmail, dissertationCount:(a.dissertationIds || []).length,
    assignmentType:a.assignmentType || 'assessment',
    dissertationIds:(a.dissertationIds||[]).slice(),
    studentNames:linked.map(r=>r.studentName||r.name||r.reference).filter(Boolean),
    studentIndexNumbers:linked.map(r=>r.indexNumber||'').filter(Boolean),
    createdAt:a.createdAt, sentAt:a.sentAt || null, expiresAt:a.expiresAt, earlyBirdDueAt:a.earlyBirdDueAt||fallbackDeadlines.earlyBirdDueAt, assessmentDueAt:a.assessmentDueAt||fallbackDeadlines.assessmentDueAt, downloadedAt:a.downloadedAt || null,
    downloadCount:Number(a.downloadCount || 0), revokedAt:a.revokedAt || null, emailStatus:a.emailStatus || 'pending',
    submittedCount:completion.submittedCount, pendingCount:completion.pendingCount, earlyBirdCount,
    status, resendCount:Number(a.resendCount || 0), lastEmailError:a.lastEmailError || ''
  };
}
function activeAssessorMap(assignments, includePending=false) {
  const map = new Map();
  for (const a of assignments || []) {
    if (a.revokedAt || (!a.sentAt && !(includePending && a.emailStatus === 'pending'))) continue;
    const email = String(a.assessorEmail || '').trim().toLowerCase();
    const name = a.assessorName || a.assessorEmail || '';
    const key = personKey(name,email);
    if (!key) continue;
    for (const id of a.dissertationIds || []) {
      if (!map.has(id)) map.set(id, new Map());
      if (!map.get(id).has(key)) map.get(id).set(key, {email,name});
    }
  }
  return map;
}
function reservedAssessorMap(assignments) {
  const map = new Map();
  for (const a of assignments || []) {
    if (a.revokedAt) continue;
    const email = String(a.assessorEmail || '').trim().toLowerCase();
    const name = a.assessorName || a.assessorEmail || '';
    const key = personKey(name,email);
    if (!key) continue;
    for (const id of a.dissertationIds || []) {
      if (!map.has(id)) map.set(id, new Map());
      if (!map.get(id).has(key)) map.get(id).set(key, {email,name,assignmentId:a.id});
    }
  }
  return map;
}
function dissertationAssignmentInfo(dissertationId, assignments) {
  const m = reservedAssessorMap(assignments).get(dissertationId) || new Map();
  return { count:m.size, assessors:[...m.values()] };
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
async function sendGmailHtmlEmail({to, subject, html}) {
  if (!gmailConfigured()) throw new Error('Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL.');
  if (!isEmail(to)) throw new Error('The recipient email address is invalid.');
  if (!isEmail(GMAIL_SENDER_EMAIL)) throw new Error('GMAIL_SENDER_EMAIL is not a valid email address.');
  const fromName = encodeMailHeader(GMAIL_FROM_NAME || 'UCC Dissertation Portal');
  const fromHeader = fromName ? `${fromName} <${cleanMailHeader(GMAIL_SENDER_EMAIL)}>` : cleanMailHeader(GMAIL_SENDER_EMAIL);
  const rawMessage = [
    `From: ${fromHeader}`,
    `To: ${cleanMailHeader(to)}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '', html
  ].join('\r\n');
  const accessToken = await getGmailAccessToken();
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method:'POST', headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body:JSON.stringify({ raw:base64Url(rawMessage) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error_description || data?.error || `Gmail API returned HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return data;
}
function assignmentDeadlineDates(baseDate=new Date()) {
  const start=new Date(baseDate);
  return {
    earlyBirdDueAt:new Date(start.getTime()+28*24*60*60*1000).toISOString(),
    assessmentDueAt:new Date(start.getTime()+56*24*60*60*1000).toISOString()
  };
}
async function sendGmailEmail({ to, assessorName, departmentName, dissertationCount, expiresAt, secureUrl, earlyBirdDueAt, assessmentDueAt, message, assignmentType='assessment' }) {
  const isVetting=assignmentType==='vetting';
  const taskLabel=isVetting?'vetting':'assessment';
  const taskTitle=isVetting?'Vetting':'Assessment';
  const expiresText = new Date(expiresAt).toLocaleString('en-GB', { dateStyle:'long', timeStyle:'short', timeZone:'UTC' }) + ' UTC';
  const earlyText = new Date(earlyBirdDueAt).toLocaleDateString('en-GB', { dateStyle:'long', timeZone:'UTC' });
  const dueText = new Date(assessmentDueAt).toLocaleDateString('en-GB', { dateStyle:'long', timeZone:'UTC' });
  const optionalMessage = message ? `<div style="margin:18px 0;padding:14px 16px;background:#f5f7fa;border-left:4px solid #d4a72c"><strong>Message from the department</strong><br>${htmlEscape(message).replace(/\n/g,'<br>')}</div>` : '';
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#182431;line-height:1.55"><div style="max-width:680px;margin:auto;padding:24px"><h2 style="color:#082b4c">Dissertations Assigned for ${taskTitle}</h2><p>Dear ${htmlEscape(assessorName)},</p><p>${htmlEscape(departmentName)} has assigned <strong>${dissertationCount}</strong> dissertation${dissertationCount===1?'':'s'} to you for ${taskLabel}.</p>${optionalMessage}<p><a href="${htmlEscape(secureUrl)}" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:bold">Access Your ${taskTitle} Assignment</a></p><p>This <strong>single secure assignment link</strong> contains all assigned works. Use it to download the dissertations and to submit each ${taskLabel} report separately as you complete it. Please do not forward the link.</p><div style="margin:20px 0;padding:16px;background:#fff7dc;border:1px solid #ead58c;border-radius:8px"><strong>${taskTitle} timeline</strong><ul style="margin-bottom:0"><li>Dissertation downloads are available through <strong>${htmlEscape(expiresText)}</strong>. The same assignment workspace remains available for report submission through the 8-week due date.</li><li>Please submit each ${taskLabel} report and claim form within <strong>8 weeks</strong> of the original assignment, by <strong>${htmlEscape(dueText)}</strong>.</li><li>Each individual work submitted within <strong>4 weeks</strong>, by <strong>${htmlEscape(earlyText)}</strong>, qualifies for the <strong>Early Bird</strong> completion category.</li></ul></div><p>Your assigned student names, index numbers, programmes and student-email links are bound to the secure assignment. You do not need to re-enter student information.</p><p style="font-size:13px;color:#526575">Assignment link: ${htmlEscape(secureUrl)}<br>You can return to this same link to submit remaining reports until the 8-week due date unless the department revokes the assignment.</p><p>Regards,<br>College of Distance Education<br>University of Cape Coast</p></div></body></html>`;
  return sendGmailHtmlEmail({to,subject:`Dissertations for ${taskTitle} - ${departmentName}`,html});
}
async function sendStudentFeedbackEmail({to, studentName, departmentName, assessorName, secureUrl, expiresAt, reportType='assessment'}) {
  const isVetting=reportType==='vetting';
  const label=isVetting?'Vetting':'Assessment';
  const expiryText=new Date(expiresAt).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'})+' UTC';
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#182431;line-height:1.55"><div style="max-width:680px;margin:auto;padding:24px"><h2 style="color:#082b4c">Dissertation ${label} Feedback</h2><p>Dear ${htmlEscape(studentName)},</p><p>${htmlEscape(departmentName)} has made your dissertation ${label.toLowerCase()} feedback available. The package contains the ${label.toLowerCase()} report${assessorName?` from <strong>${htmlEscape(assessorName)}</strong>`:''} and, where supplied by the assessor, the reviewed dissertation.</p><p><a href="${htmlEscape(secureUrl)}" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:bold">Access ${label} Feedback</a></p><p>This secure link expires on <strong>${htmlEscape(expiryText)}</strong>. Please do not forward the link.</p><p>Regards,<br>College of Distance Education<br>University of Cape Coast</p></div></body></html>`;
  return sendGmailHtmlEmail({to,subject:`Dissertation ${label} Feedback - ${departmentName}`,html});
}
async function assignmentByToken(token) {
  const hash = assignmentTokenHash(token);
  const assignments = await readAssignments();
  return assignments.find(a => a.tokenHash === hash) || null;
}
function validateLiveAssignment(a) {
  if (!a) return { ok:false, status:404, message:'This secure dissertation link is invalid.' };
  if (a.revokedAt) return { ok:false, status:410, message:'This secure dissertation link has been revoked.' };
  if (new Date(a.expiresAt).getTime() <= Date.now()) return { ok:false, status:410, message:'This secure dissertation download link has expired. Please contact the department for a new download link.' };
  return { ok:true };
}
async function noteAssignmentDownload(assignmentId){
  return mutateAssignments(list=>{const item=list.find(x=>x.id===assignmentId);if(item){item.downloadedAt=item.downloadedAt||new Date().toISOString();item.lastDownloadedAt=new Date().toISOString();item.downloadCount=Number(item.downloadCount||0)+1;}return true;});
}
function validateLiveAssignmentForSubmission(a) {
  if (!a) return { ok:false, status:404, message:'This secure assignment link is invalid.' };
  if (a.revokedAt) return { ok:false, status:410, message:'This secure assignment link has been revoked.' };
  const fallback=assignmentDeadlineDates(new Date(a.sentAt||a.createdAt||Date.now()));
  const dueAt=a.assessmentDueAt||fallback.assessmentDueAt;
  if (new Date(dueAt).getTime() <= Date.now()) return { ok:false, status:410, message:'The 8-week report submission period for this assignment has ended. Please contact the department administrator.' };
  return { ok:true };
}

function assignmentSubmittedWorkMap(assignmentId, records) {
  const map=new Map();
  for(const record of assessorRecords(records||[])){
    if(String(record.assignmentId||'')!==String(assignmentId||'')) continue;
    for(let i=0;i<(record.works||[]).length;i++){
      const work=record.works[i];
      const dissertationId=work?.studentSubmissionId || record.assignmentWorkId || '';
      if(!dissertationId || map.has(String(dissertationId))) continue;
      map.set(String(dissertationId), {record,work,workIndex:i});
    }
  }
  return map;
}
function assignmentWorkCompletion(assignment, records) {
  const submitted=assignmentSubmittedWorkMap(assignment?.id,records);
  const ids=(assignment?.dissertationIds||[]).map(String);
  const submittedCount=ids.filter(id=>submitted.has(id)).length;
  const total=ids.length;
  return {submitted,total,pendingCount:Math.max(0,total-submittedCount),submittedCount};
}
function earlyBirdForSubmission(assignment, submittedAt) {
  const base=new Date(assignment?.sentAt||assignment?.createdAt||Date.now());
  const due=assignment?.earlyBirdDueAt||assignmentDeadlineDates(base).earlyBirdDueAt;
  return Boolean(submittedAt && new Date(submittedAt).getTime()<=new Date(due).getTime());
}
const assignmentWorkQueues=new Map();
function withAssignmentWorkLock(key, task){
  const k=String(key||'');
  const previous=assignmentWorkQueues.get(k)||Promise.resolve();
  const current=previous.catch(()=>{}).then(task);
  const tracked=current.finally(()=>{if(assignmentWorkQueues.get(k)===tracked)assignmentWorkQueues.delete(k);});
  assignmentWorkQueues.set(k,tracked);
  return tracked;
}

function normalizeIndexNumber(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,'');}
function feedbackState(feedback){
  if(!feedback) return 'not-forwarded';
  if(feedback.revokedAt) return 'revoked';
  if(feedback.expiresAt && new Date(feedback.expiresAt).getTime()<=Date.now()) return 'expired';
  if(feedback.downloadedAt) return 'downloaded';
  if(feedback.emailStatus==='failed') return 'email-failed';
  if(feedback.sentAt) return 'sent';
  return feedback.emailStatus || 'pending';
}
async function feedbackByToken(token){
  const hash=assignmentTokenHash(token);
  const records=await readDb();
  for(const record of assessorRecords(records)){
    for(let i=0;i<(record.works||[]).length;i++){
      const work=record.works[i];
      if(work?.feedback?.tokenHash===hash) return {record,work,workIndex:i};
    }
  }
  return null;
}
function validateLiveFeedback(found){
  if(!found?.work?.feedback) return {ok:false,status:404,message:'This assessment feedback link is invalid.'};
  const f=found.work.feedback;
  if(f.revokedAt) return {ok:false,status:410,message:'This assessment feedback link has been revoked.'};
  if(f.expiresAt && new Date(f.expiresAt).getTime()<=Date.now()) return {ok:false,status:410,message:'This assessment feedback link has expired. Please contact the department.'};
  return {ok:true};
}
async function mutateAssessmentWork(recordId, workIndex, mutator){
  let result=null;
  const all=await readDb();
  const record=all.find(r=>r.id===recordId && r.portalType==='assessor');
  const work=record?.works?.[workIndex];
  if(!record||!work) return null;
  result=await mutator(work,record);
  await writeDb(all);
  return result;
}
function latestStudentDissertation(records, department, indexNumber){
  const key=normalizeIndexNumber(indexNumber);
  return dissertationRecords(recordsForDepartment(records,department))
    .filter(r=>normalizeIndexNumber(r.indexNumber)===key && isEmail(r.email))
    .sort((a,b)=>String(b.submittedAt||'').localeCompare(String(a.submittedAt||'')))[0] || null;
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
    // Ignore empty template rows, including rows that contain only a pre-filled S/N.
    // Header validation remains header-only.
    const hasStudentData = Boolean(name || registrationNo || groupNo || totalScore);
    if (!hasStudentData) continue;
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
const resourceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RESOURCES_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBaseName(file.originalname)}`)
});
const RESOURCE_EXTENSIONS = new Set(['.pdf','.doc','.docx','.xls','.xlsx','.csv','.ppt','.pptx','.txt','.zip','.png','.jpg','.jpeg']);
const resourceUpload = multer({
  storage: resourceStorage,
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, RESOURCE_EXTENSIONS.has(ext));
  }
});
function filesFor(req, key) { return (req.files && req.files[key]) || []; }
async function removeUploaded(req) { await Promise.all(Object.values(req.files || {}).flat().map(f => fsp.unlink(f.path).catch(() => {}))); }
function fileRecord(f) { return f ? { storedName: path.basename(f.path), originalName: f.originalname, mimeType: f.mimetype, size: f.size } : null; }
function text(req, key) { return String(req.body[key] || '').trim(); }
function requireText(req, fields) { return fields.find(k => !text(req, k)); }
function submitterName(req, prefix='') {
  const title = text(req, `${prefix}Title`);
  const firstName = text(req, `${prefix}FirstName`);
  const lastName = text(req, `${prefix}LastName`);
  return { title, firstName, lastName, fullName: buildDisplayName(title, firstName, lastName) };
}
function validateDepartment(req) {
  const slug = text(req, 'department');
  return departmentFromSlug(slug) ? slug : null;
}

async function saveRecord(record) {
  return mutateDb(records => { records.push(record); return record; });
}

// 1. UNDERGRADUATE PROJECT WORK
app.post('/api/project-work', upload.fields([
  { name: 'claimForm', maxCount: 1 }, { name: 'reportFile', maxCount: 1 },
  { name: 'completedWork', maxCount: 25 }, { name: 'scoresFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const missing = requireText(req, ['title','firstName','lastName','phone','email','groupCount','studyCentre']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error: `Missing required field: ${missing}` }); }
    const allowedCentres=await readStudyCentres();
    if(!allowedCentres.includes(text(req,'studyCentre'))){await removeUploaded(req);return res.status(400).json({error:'Please select a valid study centre from the current list.'});}
    if (!filesFor(req,'claimForm').length || !filesFor(req,'reportFile').length || !filesFor(req,'completedWork').length || !filesFor(req,'scoresFile').length) {
      await removeUploaded(req); return res.status(400).json({ error: 'Claim form, report, score sheet and completed project work are required.' });
    }
    let scoreResult;
    try { scoreResult = parseScoreWorkbook(filesFor(req,'scoresFile')[0].path); }
    catch (e) { await removeUploaded(req); return res.status(400).json({ error: e.message }); }
    const record = {
      id: crypto.randomUUID(), portalType: 'project-work', department, departmentName: DEPARTMENTS[department].name,
      reference: makeReference('PWORK'), submittedAt: new Date().toISOString(),
      title:text(req,'title'), firstName:text(req,'firstName'), lastName:text(req,'lastName'),
      fullName:buildDisplayName(text(req,'title'),text(req,'firstName'),text(req,'lastName')),
      phone: text(req,'phone'), email: text(req,'email'), groupCount: text(req,'groupCount'), studyCentre: text(req,'studyCentre'),
      scoreSheet: { worksheet: scoreResult.sheetName, headerRow: scoreResult.headerRow, rowCount: scoreResult.rows.length, rows: scoreResult.rows },
      reviewStatus:'pending', reviewNote:'', reviewedAt:null, reviewedBy:'', reviewHistory:[],
      files: {
        claimForm: fileRecord(filesFor(req,'claimForm')[0]), reportFile: fileRecord(filesFor(req,'reportFile')[0]),
        scoresFile: fileRecord(filesFor(req,'scoresFile')[0]), completedWork: filesFor(req,'completedWork').map(fileRecord)
      }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName, scoreRowsIncluded:scoreResult.rows.length, reviewStatus:'pending', reviewStatusLabel:'Pending Verification' });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The project work submission could not be saved.' }); }
});

// 1B. FIELD EXPERIENCE SCORES
app.post('/api/field-experience', upload.fields([
  { name: 'scoresFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const missing = requireText(req, ['title','firstName','lastName','phone','email','groupCount','studyCentre']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error: `Missing required field: ${missing}` }); }
    const allowedCentres=await readStudyCentres();
    if(!allowedCentres.includes(text(req,'studyCentre'))){await removeUploaded(req);return res.status(400).json({error:'Please select a valid study centre from the current list.'});}
    if (!filesFor(req,'scoresFile').length) {
      await removeUploaded(req); return res.status(400).json({ error: 'The Field Experience score sheet is required.' });
    }
    let scoreResult;
    try { scoreResult = parseScoreWorkbook(filesFor(req,'scoresFile')[0].path); }
    catch (e) { await removeUploaded(req); return res.status(400).json({ error: e.message }); }
    const record = {
      id: crypto.randomUUID(), portalType: 'field-experience', department, departmentName: DEPARTMENTS[department].name,
      reference: makeReference('FIELD'), submittedAt: new Date().toISOString(),
      title:text(req,'title'), firstName:text(req,'firstName'), lastName:text(req,'lastName'),
      fullName:buildDisplayName(text(req,'title'),text(req,'firstName'),text(req,'lastName')),
      phone: text(req,'phone'), email: text(req,'email'), groupCount: text(req,'groupCount'), studyCentre: text(req,'studyCentre'),
      scoreSheet: { worksheet: scoreResult.sheetName, headerRow: scoreResult.headerRow, rowCount: scoreResult.rows.length, rows: scoreResult.rows },
      reviewStatus:'pending', reviewNote:'', reviewedAt:null, reviewedBy:'', reviewHistory:[],
      files: { scoresFile: fileRecord(filesFor(req,'scoresFile')[0]) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName, scoreRowsIncluded:scoreResult.rows.length, reviewStatus:'pending', reviewStatusLabel:'Pending Verification' });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The Field Experience score submission could not be saved.' }); }
});

// 2. STUDENT DISSERTATION
app.post('/api/dissertation', upload.fields([
  { name:'dissertationFile', maxCount:1 },
  { name:'revisedDissertationFile', maxCount:1 },
  { name:'reviewerResponses', maxCount:10 }
]), async (req, res) => {
  try {
    const department = validateDepartment(req);
    if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
    const submissionType=text(req,'submissionType');
    if(!['fresh','revised'].includes(submissionType)) { await removeUploaded(req); return res.status(400).json({error:'Select Fresh Submission or Revised Submission.'}); }
    const missing = requireText(req, [
      'studentTitle','studentFirstName','studentLastName','indexNumber','phone','email',
      'supervisorTitle','supervisorFirstName','supervisorLastName','programme','dissertationTopic'
    ]);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error:`Missing required field: ${missing}` }); }

    const freshFile=filesFor(req,'dissertationFile')[0] || null;
    const revisedFile=filesFor(req,'revisedDissertationFile')[0] || null;
    const reviewerResponses=filesFor(req,'reviewerResponses');
    const dissertationFile=submissionType==='revised' ? revisedFile : freshFile;
    if (!dissertationFile) {
      await removeUploaded(req);
      return res.status(400).json({ error:submissionType==='revised'?'The revised dissertation file is required.':'The dissertation file is required.' });
    }
    if(submissionType==='revised' && !reviewerResponses.length){
      await removeUploaded(req); return res.status(400).json({error:"At least one reviewers' response file is required for a revised submission."});
    }
    const ext=path.extname(dissertationFile.originalname||'').toLowerCase();
    if(!['.pdf','.doc','.docx'].includes(ext)) { await removeUploaded(req); return res.status(400).json({error:'Upload the dissertation as a PDF, DOC or DOCX file.'}); }

    let titleValidation;
    try { titleValidation=await validateDissertationTitleAgainstFile(text(req,'dissertationTopic'), dissertationFile); }
    catch(e) { await removeUploaded(req); return res.status(400).json({error:e.message||String(e)}); }

    const studentName=buildDisplayName(text(req,'studentTitle'),text(req,'studentFirstName'),text(req,'studentLastName'));
    const supervisorName=buildDisplayName(text(req,'supervisorTitle'),text(req,'supervisorFirstName'),text(req,'supervisorLastName'));
    const record = {
      id: crypto.randomUUID(), portalType:'dissertation', submissionType, department, departmentName: DEPARTMENTS[department].name,
      reference:makeReference(submissionType==='revised'?'DREV':'DISS'), submittedAt:new Date().toISOString(),
      studentTitle:text(req,'studentTitle'), studentFirstName:text(req,'studentFirstName'), studentLastName:text(req,'studentLastName'), studentName,
      indexNumber:text(req,'indexNumber'), phone:text(req,'phone'), email:text(req,'email'),
      supervisorTitle:text(req,'supervisorTitle'), supervisorFirstName:text(req,'supervisorFirstName'), supervisorLastName:text(req,'supervisorLastName'), supervisorName,
      programme:text(req,'programme'), dissertationTopic:text(req,'dissertationTopic'), titleValidation,
      files:{ dissertationFile:fileRecord(dissertationFile), reviewerResponses:reviewerResponses.map(fileRecord) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, departmentName:record.departmentName, titleValidated:true, submissionType });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The dissertation submission could not be saved.' }); }
});

// 3. ASSESSOR / VETTING SUBMISSION
// Each declared report gets its own student fields and its own file inputs.
const assessorUploadFields = [];
for (let i = 0; i < 25; i++) {
  assessorUploadFields.push(
    { name:`reportFile_${i}`, maxCount:1 },
    { name:`claimForm_${i}`, maxCount:1 },
    { name:`dissertationFile_${i}`, maxCount:1 }
  );
}

// Assignment-linked report submission context. Student email remains server-side and is never editable by the assessor.
app.get('/api/assessor/assignment-context/:token', async(req,res)=>{
  const assignment=await assignmentByToken(req.params.token);
  const live=validateLiveAssignmentForSubmission(assignment);
  res.setHeader('Cache-Control','no-store');
  if(!live.ok) return res.status(live.status).json({error:live.message});
  const allRecords=await readDb();
  const records=dissertationRecords(recordsForDepartment(allRecords,assignment.department));
  const linked=(assignment.dissertationIds||[]).map(id=>records.find(r=>r.id===id)).filter(Boolean);
  if(linked.length!==(assignment.dissertationIds||[]).length) return res.status(409).json({error:'One or more dissertations in this assignment are no longer available. Contact the department administrator.'});
  const completion=assignmentWorkCompletion(assignment,allRecords);
  res.json({
    ok:true,
    assignmentReference:assignment.reference,
    assignmentType:assignment.assignmentType||'assessment',
    department:assignment.department,
    departmentName:assignment.departmentName,
    assessorTitle:assignment.assessorTitle||'',
    assessorFirstName:assignment.assessorFirstName||'',
    assessorLastName:assignment.assessorLastName||'',
    assessorName:assignment.assessorName||'',
    assessorEmail:assignment.assessorEmail||'',
    assessorPhone:assignment.assessorPhone||'',
    workCount:linked.length,
    submittedCount:completion.submittedCount,
    pendingCount:completion.pendingCount,
    downloadExpiresAt:assignment.expiresAt,
    earlyBirdDueAt:assignment.earlyBirdDueAt||assignmentDeadlineDates(new Date(assignment.sentAt||assignment.createdAt||Date.now())).earlyBirdDueAt,
    assessmentDueAt:assignment.assessmentDueAt||assignmentDeadlineDates(new Date(assignment.sentAt||assignment.createdAt||Date.now())).assessmentDueAt,
    works:linked.map((r,i)=>{
      const found=completion.submitted.get(String(r.id));
      return {
        workNo:i+1,
        studentSubmissionId:r.id,
        studentFirstName:r.studentFirstName||'',
        studentLastName:r.studentLastName||'',
        studentName:r.studentName||'',
        indexNumber:r.indexNumber||'',
        programme:r.programme||'',
        dissertationTitle:r.dissertationTopic||'',
        studentSubmissionType:r.submissionType||'fresh',
        reviewerResponseCount:Array.isArray(r.files?.reviewerResponses)?r.files.reviewerResponses.length:0,
        submitted:Boolean(found),
        reportReference:found?.record?.reference||'',
        submittedAt:found?.record?.submittedAt||null,
        earlyBirdQualified:found?earlyBirdForSubmission(assignment,found.record.submittedAt):false
      };
    })
  });
});

const assignmentWorkUpload=upload.fields([
  {name:'reportFile',maxCount:1},
  {name:'claimForm',maxCount:1},
  {name:'dissertationFile',maxCount:1}
]);

// Submit one assigned work at a time. The same assignment link can be reused for the remaining works.
app.post('/api/assessor/assignment/:token/works/:dissertationId', assignmentWorkUpload, async(req,res)=>{
  const lockKey=`${req.params.token}:${req.params.dissertationId}`;
  return withAssignmentWorkLock(lockKey, async()=>{
    try{
      const assignment=await assignmentByToken(req.params.token);
      const live=validateLiveAssignmentForSubmission(assignment);
      if(!live.ok){await removeUploaded(req);return res.status(live.status).json({error:live.message});}
      const dissertationId=String(req.params.dissertationId||'');
      if(!(assignment.dissertationIds||[]).map(String).includes(dissertationId)){await removeUploaded(req);return res.status(403).json({error:'This dissertation is not part of the secure assignment.'});}
      const allRecords=await readDb();
      const student=allRecords.find(r=>r.id===dissertationId&&r.portalType==='dissertation'&&r.department===assignment.department);
      if(!student){await removeUploaded(req);return res.status(404).json({error:'The assigned dissertation is no longer available.'});}
      const existing=assignmentSubmittedWorkMap(assignment.id,allRecords).get(dissertationId);
      if(existing){await removeUploaded(req);return res.status(409).json({error:`This work has already been submitted under reference ${existing.record.reference}. If a replacement is required, contact the department administrator.`});}
      const phone=text(req,'phone');
      if(!phone){await removeUploaded(req);return res.status(400).json({error:'Enter the assessor telephone number before submitting this work.'});}
      const report=filesFor(req,'reportFile')[0];
      const claim=filesFor(req,'claimForm')[0];
      const reviewed=filesFor(req,'dissertationFile')[0]||null;
      const reportType=assignment.assignmentType||'assessment';
      if(!report||!claim){await removeUploaded(req);return res.status(400).json({error:`One ${reportType==='vetting'?'vetting':'assessment'} report and one claim form are required for this work.`});}
      const submittedAt=new Date().toISOString();
      const workNo=Math.max(1,(assignment.dissertationIds||[]).map(String).indexOf(dissertationId)+1);
      const work={
        workNo,
        studentFirstName:student.studentFirstName||'',studentLastName:student.studentLastName||'',studentName:student.studentName||'',
        indexNumber:student.indexNumber||'',programme:student.programme||'',studentEmail:student.email||'',studentSubmissionId:student.id,studentSubmissionType:student.submissionType||'fresh',
        files:{reportFile:fileRecord(report),claimForm:fileRecord(claim),dissertationFile:reviewed?fileRecord(reviewed):null}
      };
      const earlyBirdQualified=earlyBirdForSubmission(assignment,submittedAt);
      const record={
        id:crypto.randomUUID(),portalType:'assessor',reportType,department:assignment.department,departmentName:assignment.departmentName,
        reference:makeReference(reportType==='vetting'?'VET':'ASSESS'),submittedAt,
        assignmentId:assignment.id,assignmentReference:assignment.reference,assignmentWorkId:student.id,assignmentWorkNo:workNo,assignmentTotalWorks:(assignment.dissertationIds||[]).length,
        earlyBirdQualified,earlyBirdDueAt:assignment.earlyBirdDueAt||null,assessmentDueAt:assignment.assessmentDueAt||null,
        assessorTitle:assignment.assessorTitle||'',assessorFirstName:assignment.assessorFirstName||'',assessorLastName:assignment.assessorLastName||'',assessorName:assignment.assessorName||'',
        phone,email:assignment.assessorEmail||'',workCount:1,works:[work],studentName:work.studentName,indexNumber:work.indexNumber,programme:work.programme,
        files:{reportFile:[work.files.reportFile],claimForm:[work.files.claimForm],dissertationFile:work.files.dissertationFile?[work.files.dissertationFile]:[]}
      };
      await saveRecord(record);
      if(!assignment.assessorPhone){await mutateAssignments(list=>{const a=list.find(x=>x.id===assignment.id);if(a&&!a.assessorPhone)a.assessorPhone=phone;return true;});}
      const after=await readDb();
      const completion=assignmentWorkCompletion(assignment,after);
      return res.status(201).json({ok:true,reference:record.reference,submittedAt,workNo,studentName:work.studentName,earlyBirdQualified,submittedCount:completion.submittedCount,totalWorks:completion.total,pendingCount:completion.pendingCount,allComplete:completion.submittedCount===completion.total});
    }catch(e){console.error('Assignment work submission failed:',e);await removeUploaded(req).catch(()=>{});if(!res.headersSent)res.status(500).json({error:'This report could not be saved.'});}
  });
});

app.post('/api/assessor', upload.fields(assessorUploadFields), async (req, res) => {
  try {
    const assignmentToken=text(req,'assignmentToken');
    if(assignmentToken){await removeUploaded(req);return res.status(409).json({error:'This secure assignment now uses one report submission per assigned work. Reopen the secure assignment link from your email and submit each work from that workspace.'});}
    let assignment=null;
    let linkedDissertations=[];
    let department=null;
    let reportType=text(req,'reportType');

    if(assignmentToken){
      assignment=await assignmentByToken(assignmentToken);
      const live=validateLiveAssignmentForSubmission(assignment);
      if(!live.ok){await removeUploaded(req);return res.status(live.status).json({error:live.message});}
      department=assignment.department;
      reportType=assignment.assignmentType||'assessment';
      const allRecords=await readDb();
      linkedDissertations=(assignment.dissertationIds||[]).map(id=>allRecords.find(r=>r.id===id&&r.portalType==='dissertation'&&r.department===department)).filter(Boolean);
      if(linkedDissertations.length!==(assignment.dissertationIds||[]).length){await removeUploaded(req);return res.status(409).json({error:'One or more dissertations in this assignment are no longer available. Contact the department administrator.'});}
      const existing=assessorRecords(allRecords).find(r=>r.assignmentId===assignment.id);
      if(existing){await removeUploaded(req);return res.status(409).json({error:`Reports for assignment ${assignment.reference} have already been submitted under reference ${existing.reference}. Contact the department if a replacement submission is required.`});}
    }else{
      department=validateDepartment(req);
      if (!department) { await removeUploaded(req); return res.status(400).json({ error: 'Please select a valid department.' }); }
      if(!['assessment','vetting'].includes(reportType)){await removeUploaded(req);return res.status(400).json({error:'Select Assessment Report or Vetting Report.'});}
    }

    if(!['assessment','vetting'].includes(reportType)){await removeUploaded(req);return res.status(400).json({error:'Invalid report submission type.'});}

    let assessorTitle=text(req,'assessorTitle'), assessorFirstName=text(req,'assessorFirstName'), assessorLastName=text(req,'assessorLastName'), assessorEmail=text(req,'email');
    if(assignment){
      assessorTitle=assignment.assessorTitle||'';
      assessorFirstName=assignment.assessorFirstName||'';
      assessorLastName=assignment.assessorLastName||'';
      assessorEmail=assignment.assessorEmail||'';
    }
    const phone=text(req,'phone');
    if(!assessorTitle||!assessorFirstName||!assessorLastName||!assessorEmail||!phone){await removeUploaded(req);return res.status(400).json({error:'Assessor title, first name, surname, telephone number and email are required.'});}

    const workCount=assignment ? linkedDissertations.length : Number.parseInt(text(req,'workCount'),10);
    if (!Number.isInteger(workCount) || workCount < 1 || workCount > 25) {
      await removeUploaded(req); return res.status(400).json({ error:'Number of reports must be between 1 and 25.' });
    }

    const works=[];
    for(let i=0;i<workCount;i++){
      let studentFirstName,studentLastName,indexNumber,programme,studentEmail='',studentSubmissionId=null,studentSubmissionType='';
      if(assignment){
        const student=linkedDissertations[i];
        studentFirstName=student.studentFirstName||'';
        studentLastName=student.studentLastName||'';
        indexNumber=student.indexNumber||'';
        programme=student.programme||'';
        studentEmail=student.email||'';
        studentSubmissionId=student.id;
        studentSubmissionType=student.submissionType||'fresh';
      }else{
        studentFirstName=text(req,`studentFirstName_${i}`);
        studentLastName=text(req,`studentLastName_${i}`);
        indexNumber=text(req,`indexNumber_${i}`);
        programme=text(req,`programme_${i}`);
      }
      if(!studentFirstName||!studentLastName||!indexNumber||!programme){await removeUploaded(req);return res.status(400).json({error:`Complete all required student details for Work ${i+1}.`});}
      const report=filesFor(req,`reportFile_${i}`)[0];
      const claim=filesFor(req,`claimForm_${i}`)[0];
      const dissertation=filesFor(req,`dissertationFile_${i}`)[0]||null;
      if(!report||!claim){await removeUploaded(req);return res.status(400).json({error:`Work ${i+1} requires one ${reportType==='vetting'?'vetting':'assessment'} report and one claim form.`});}
      works.push({
        workNo:i+1,
        studentFirstName,studentLastName,
        studentName:buildDisplayName('',studentFirstName,studentLastName),
        indexNumber,programme,
        studentEmail,studentSubmissionId,studentSubmissionType,
        files:{reportFile:fileRecord(report),claimForm:fileRecord(claim),dissertationFile:dissertation?fileRecord(dissertation):null}
      });
    }

    const record={
      id:crypto.randomUUID(), portalType:'assessor', reportType, department, departmentName:DEPARTMENTS[department].name,
      reference:makeReference(reportType==='vetting'?'VET':'ASSESS'), submittedAt:new Date().toISOString(),
      assignmentId:assignment?.id||null, assignmentReference:assignment?.reference||'',
      assessorTitle, assessorFirstName, assessorLastName,
      assessorName:buildDisplayName(assessorTitle,assessorFirstName,assessorLastName),
      phone, email:assessorEmail, workCount,
      works,
      studentName:works.map(w=>w.studentName).join('; '),
      indexNumber:works.map(w=>w.indexNumber).join('; '),
      programme:[...new Set(works.map(w=>w.programme))].join('; '),
      files:{
        reportFile:works.map(w=>w.files.reportFile),
        claimForm:works.map(w=>w.files.claimForm),
        dissertationFile:works.map(w=>w.files.dissertationFile).filter(Boolean)
      }
    };
    await saveRecord(record);
    res.status(201).json({ok:true,reference:record.reference,submittedAt:record.submittedAt,departmentName:record.departmentName,reportType,workCount,assignmentLinked:Boolean(assignment),reportFiles:works.length,claimForms:works.length,dissertationFiles:works.filter(w=>w.files.dissertationFile).length});
  } catch(e){console.error(e);await removeUploaded(req).catch(()=>{});res.status(500).json({error:'The report submission could not be saved.'});}
});

function recordsForDepartment(records, department) { return records.filter(r => r.department === department); }
function projectRecords(records) { return records.filter(r => r.portalType === 'project-work' || !r.portalType); }
function fieldExperienceRecords(records) { return records.filter(r => r.portalType === 'field-experience'); }
function dissertationRecords(records) { return records.filter(r => r.portalType === 'dissertation'); }
function assessorRecords(records) { return records.filter(r => r.portalType === 'assessor'); }

const PROJECT_REVIEW_STATUSES = new Set(['pending','approved','rejected','returned']);
function projectReviewStatus(record) {
  const raw=String(record?.reviewStatus||record?.projectReview?.status||'').trim().toLowerCase();
  return PROJECT_REVIEW_STATUSES.has(raw)?raw:'pending';
}
function projectReviewLabel(status) {
  return {pending:'Pending Verification',approved:'Approved',rejected:'Rejected',returned:'Returned for Correction'}[status]||'Pending Verification';
}
function supervisorIdentityKey(record) {
  const email=String(record?.email||'').trim().toLowerCase();
  if(isEmail(email)) return `email:${email}`;
  const tokens=personNameTokens(record?.fullName||record?.name||'');
  return tokens.length?`name:${tokens.join('|')}`:'';
}
function projectAccessWarning(record) {
  const access=record?.projectSubmissionAccess||record?.submissionAccess||record?.secureSubmission||null;
  if(!access) return null;
  if(access.revokedAt||String(access.status||'').toLowerCase()==='revoked') return {code:'revoked-link',message:'Submission was made from a secure link that is now marked revoked.'};
  if(access.expiresAt && new Date(access.expiresAt).getTime()<=Date.now()) return {code:'expired-link',message:'Submission is associated with an expired secure submission link.'};
  return null;
}
function projectSubmissionWarnings(record, records) {
  if(!record) return [];
  const warnings=[];
  const projects=projectRecords(records||[]);
  const others=projects.filter(r=>r.id!==record.id);
  const supervisorEmail=String(record.email||'').trim().toLowerCase();
  const supervisorName=record.fullName||record.name||'';
  const sameSupervisor=others.filter(r=>{
    const otherEmail=String(r.email||'').trim().toLowerCase();
    const emailMatch=isEmail(supervisorEmail)&&isEmail(otherEmail)&&supervisorEmail===otherEmail;
    return emailMatch||samePersonName(supervisorName,r.fullName||r.name||'');
  });
  if(sameSupervisor.length) warnings.push({code:'repeat-supervisor',message:`Same supervisor/examiner has ${sameSupervisor.length} other project-work submission${sameSupervisor.length===1?'':'s'} in this department.`});
  const centreKey=String(record.studyCentre||'').trim().toLowerCase();
  const sameCombo=sameSupervisor.filter(r=>String(r.studyCentre||'').trim().toLowerCase()===centreKey);
  if(centreKey&&sameCombo.length) warnings.push({code:'repeat-supervisor-centre',message:`Same supervisor/examiner and study-centre combination appears in ${sameCombo.length} other submission${sameCombo.length===1?'':'s'}.`});
  const approvedOthers=others.filter(r=>projectReviewStatus(r)==='approved');
  const approvedRegMap=new Map();
  for(const other of approvedOthers){
    for(const row of validScoreRows(other)){
      const key=normalizeIndexNumber(row.registrationNo);
      if(!key) continue;
      if(!approvedRegMap.has(key)) approvedRegMap.set(key,[]);
      approvedRegMap.get(key).push(other.reference||other.id);
    }
  }
  const duplicateRegs=[];
  for(const row of validScoreRows(record)){
    const key=normalizeIndexNumber(row.registrationNo);
    if(key&&approvedRegMap.has(key)) duplicateRegs.push({registrationNo:row.registrationNo,references:approvedRegMap.get(key)});
  }
  if(duplicateRegs.length){
    const unique=[...new Map(duplicateRegs.map(x=>[normalizeIndexNumber(x.registrationNo),x])).values()];
    const sample=unique.slice(0,5).map(x=>x.registrationNo).join(', ');
    warnings.push({code:'duplicate-approved-registration',message:`${unique.length} registration number${unique.length===1?'':'s'} already appear in other approved score sheet${unique.length===1?'':'s'}${sample?`: ${sample}${unique.length>5?'…':''}`:''}.`});
  }
  const rowCount=validScoreRows(record).length;
  if(rowCount>PROJECT_HIGH_ROW_WARNING) warnings.push({code:'high-row-count',message:`This submission contains ${rowCount} score rows, above the current review-warning threshold of ${PROJECT_HIGH_ROW_WARNING}.`});
  const accessWarning=projectAccessWarning(record);
  if(accessWarning) warnings.push(accessWarning);
  return warnings;
}
function fieldExperienceSubmissionWarnings(record, records) {
  if(!record) return [];
  const warnings=[];
  const fields=fieldExperienceRecords(records||[]);
  const others=fields.filter(r=>r.id!==record.id);
  const supervisorEmail=String(record.email||'').trim().toLowerCase();
  const supervisorName=record.fullName||record.name||'';
  const sameSupervisor=others.filter(r=>{
    const otherEmail=String(r.email||'').trim().toLowerCase();
    const emailMatch=isEmail(supervisorEmail)&&isEmail(otherEmail)&&supervisorEmail===otherEmail;
    return emailMatch||samePersonName(supervisorName,r.fullName||r.name||'');
  });
  if(sameSupervisor.length) warnings.push({code:'repeat-supervisor',message:`Same supervisor/examiner has ${sameSupervisor.length} other Field Experience score submission${sameSupervisor.length===1?'':'s'} in this department.`});
  const centreKey=String(record.studyCentre||'').trim().toLowerCase();
  const sameCombo=sameSupervisor.filter(r=>String(r.studyCentre||'').trim().toLowerCase()===centreKey);
  if(centreKey&&sameCombo.length) warnings.push({code:'repeat-supervisor-centre',message:`Same supervisor/examiner and study-centre combination appears in ${sameCombo.length} other Field Experience submission${sameCombo.length===1?'':'s'}.`});
  const approvedOthers=others.filter(r=>projectReviewStatus(r)==='approved');
  const approvedRegMap=new Map();
  for(const other of approvedOthers){
    for(const row of validScoreRows(other)){
      const key=normalizeIndexNumber(row.registrationNo);
      if(!key) continue;
      if(!approvedRegMap.has(key)) approvedRegMap.set(key,[]);
      approvedRegMap.get(key).push(other.reference||other.id);
    }
  }
  const duplicateRegs=[];
  for(const row of validScoreRows(record)){
    const key=normalizeIndexNumber(row.registrationNo);
    if(key&&approvedRegMap.has(key)) duplicateRegs.push({registrationNo:row.registrationNo,references:approvedRegMap.get(key)});
  }
  if(duplicateRegs.length){
    const unique=[...new Map(duplicateRegs.map(x=>[normalizeIndexNumber(x.registrationNo),x])).values()];
    const sample=unique.slice(0,5).map(x=>x.registrationNo).join(', ');
    warnings.push({code:'duplicate-approved-registration',message:`${unique.length} registration number${unique.length===1?'':'s'} already appear in other approved Field Experience score sheet${unique.length===1?'':'s'}${sample?`: ${sample}${unique.length>5?'…':''}`:''}.`});
  }
  const rowCount=validScoreRows(record).length;
  if(rowCount>PROJECT_HIGH_ROW_WARNING) warnings.push({code:'high-row-count',message:`This submission contains ${rowCount} score rows, above the current review-warning threshold of ${PROJECT_HIGH_ROW_WARNING}.`});
  const accessWarning=projectAccessWarning(record);
  if(accessWarning) warnings.push(accessWarning);
  return warnings;
}

function validScoreRows(record) {
  return (record?.scoreSheet?.rows || []).filter(row => {
    const name=cellText(row?.name), registrationNo=cellText(row?.registrationNo), groupNo=cellText(row?.groupNo), totalScore=cellText(row?.totalScore);
    return Boolean(name || registrationNo || groupNo || totalScore);
  });
}
function allScoreRows(records) {
  const out=[]; let sn=1;
  projectRecords(records).filter(record=>projectReviewStatus(record)==='approved').slice().sort((a,b)=>String(a.submittedAt).localeCompare(String(b.submittedAt))).forEach(record => {
    for (const row of validScoreRows(record)) out.push({'S/N':sn++,'NAME':row.name||'','REGISTRATION NO.':row.registrationNo||'','GROUP NO.':row.groupNo||'','TOTAL SCORE':row.totalScore||''});
  });
  return out;
}
function scoreSheetAoA(records) { const rows=allScoreRows(records); return [REQUIRED_HEADERS, ...rows.map(r=>REQUIRED_HEADERS.map(h=>r[h]))]; }
function individualScoreSheetAoA(record) { const rows=validScoreRows(record); return [REQUIRED_HEADERS, ...rows.map((row,i)=>[i+1,row.name||'',row.registrationNo||'',row.groupNo||'',row.totalScore||''])]; }
function allFieldExperienceScoreRows(records) {
  const out=[]; let sn=1;
  fieldExperienceRecords(records).filter(record=>projectReviewStatus(record)==='approved').slice().sort((a,b)=>String(a.submittedAt).localeCompare(String(b.submittedAt))).forEach(record => {
    for (const row of validScoreRows(record)) out.push({'S/N':sn++,'NAME':row.name||'','REGISTRATION NO.':row.registrationNo||'','GROUP NO.':row.groupNo||'','TOTAL SCORE':row.totalScore||''});
  });
  return out;
}
function fieldExperienceScoreSheetAoA(records) { const rows=allFieldExperienceScoreRows(records); return [REQUIRED_HEADERS, ...rows.map(r=>REQUIRED_HEADERS.map(h=>r[h]))]; }
function projectRegisterAoA(records) {
  const h=['S/N','REFERENCE','SUBMITTED AT','EXAMINER / SUPERVISOR','PHONE','EMAIL','STUDY CENTRE','NO. OF GROUPS / CANDIDATES','SCORE ROWS EXTRACTED','REVIEW STATUS','REVIEWED AT','REVIEWED BY','REVIEW NOTE'];
  const body=projectRecords(records).map((r,i)=>[i+1,r.reference,r.submittedAt,r.fullName,r.phone,r.email,r.studyCentre,r.groupCount,validScoreRows(r).length,projectReviewLabel(projectReviewStatus(r)),r.reviewedAt||'',r.reviewedBy||'',r.reviewNote||'']); return [h,...body];
}
function fieldExperienceRegisterAoA(records) {
  const h=['S/N','REFERENCE','SUBMITTED AT','EXAMINER / SUPERVISOR','PHONE','EMAIL','STUDY CENTRE','NO. OF GROUPS / CANDIDATES','SCORE ROWS EXTRACTED','REVIEW STATUS','REVIEWED AT','REVIEWED BY','REVIEW NOTE'];
  const body=fieldExperienceRecords(records).map((r,i)=>[i+1,r.reference,r.submittedAt,r.fullName,r.phone,r.email,r.studyCentre,r.groupCount,validScoreRows(r).length,projectReviewLabel(projectReviewStatus(r)),r.reviewedAt||'',r.reviewedBy||'',r.reviewNote||'']); return [h,...body];
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
  if(kind==='single-score') addSheet(wb,'Clean Scores',individualScoreSheetAoA(records[0]),[10,34,24,16,16]);
  if(kind==='project-register') addSheet(wb,'Project Work Register',projectRegisterAoA(records),[8,22,24,32,18,30,22,24,20,24,24,28,38]);
  if(kind==='project-master') {
    addSheet(wb,'Master Project Scores',scoreSheetAoA(records),[10,34,24,16,16]);
    addSheet(wb,'Project Work Register',projectRegisterAoA(records),[8,22,24,32,18,30,22,24,20,24,24,28,38]);
  }
  if(kind==='field-scores') addSheet(wb,'Consolidated Field Experience',fieldExperienceScoreSheetAoA(records),[10,34,24,16,16]);
  if(kind==='field-register') addSheet(wb,'Field Experience Register',fieldExperienceRegisterAoA(records),[8,22,24,32,18,30,22,24,20,24,24,28,38]);
  if(kind==='field-master') {
    addSheet(wb,'Master Field Experience Scores',fieldExperienceScoreSheetAoA(records),[10,34,24,16,16]);
    addSheet(wb,'Field Experience Register',fieldExperienceRegisterAoA(records),[8,22,24,32,18,30,22,24,20,24,24,28,38]);
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

function feedbackAdminInfoForWork(work, records, department){
  const exact=work?.studentSubmissionId ? records.find(r=>r.id===work.studentSubmissionId && r.portalType==='dissertation' && r.department===department) : null;
  const student=exact || latestStudentDissertation(records,department,work?.indexNumber);
  const email=student?.email || work?.studentEmail || work?.feedback?.recipientEmail || '';
  const state=!email?'unavailable':feedbackState(work?.feedback);
  return {state,email,studentSubmissionId:student?.id||work?.studentSubmissionId||null,studentSubmissionType:student?.submissionType||work?.studentSubmissionType||'',sentAt:work?.feedback?.sentAt||null,downloadedAt:work?.feedback?.downloadedAt||null,downloadCount:Number(work?.feedback?.downloadCount||0),lastEmailError:work?.feedback?.lastEmailError||''};
}
function adminRecordsMap(records, assignments=[]) {
  const activeMap=reservedAssessorMap(assignments);
  return records.slice().reverse().map(r=>{
    const assignees=activeMap.get(r.id)||new Map();
    return {
      id:r.id, reference:r.reference, submittedAt:r.submittedAt, portalType:r.portalType||'project-work',
      name:r.fullName||r.studentName||r.assessorName||'', secondaryName:r.portalType==='assessor'?r.studentName:(r.portalType==='dissertation'?r.supervisorName:''),
      title:r.title||r.studentTitle||r.assessorTitle||'', firstName:r.firstName||r.studentFirstName||r.assessorFirstName||'', lastName:r.lastName||r.studentLastName||r.assessorLastName||'',
      email:r.email||'', phone:r.phone||'', programme:r.programme||'', studyCentre:r.studyCentre||'', scoreRows:validScoreRows(r).length,
      projectReviewStatus:projectReviewStatus(r), projectReviewLabel:projectReviewLabel(projectReviewStatus(r)), projectReviewNote:r.reviewNote||'', projectReviewedAt:r.reviewedAt||null, projectReviewedBy:r.reviewedBy||'',
      projectWarnings:(r.portalType==='project-work'||!r.portalType)?projectSubmissionWarnings(r,records):[],
      fieldReviewStatus:projectReviewStatus(r), fieldReviewLabel:projectReviewLabel(projectReviewStatus(r)), fieldReviewNote:r.reviewNote||'', fieldReviewedAt:r.reviewedAt||null, fieldReviewedBy:r.reviewedBy||'',
      fieldWarnings:r.portalType==='field-experience'?fieldExperienceSubmissionWarnings(r,records):[],
      studentName:r.studentName||'', indexNumber:r.indexNumber||'', dissertationTopic:r.dissertationTopic||'', supervisorName:r.supervisorName||'', submissionType:r.submissionType||'fresh',
      titleValidated:Boolean(r.titleValidation?.matched),
      assessorName:r.assessorName||'', workCount:r.workCount||1, reportType:r.reportType||'assessment', assignmentId:r.assignmentId||null, assignmentReference:r.assignmentReference||'',
      assignmentWorkNo:r.assignmentWorkNo||null, assignmentTotalWorks:r.assignmentTotalWorks||null, earlyBirdQualified:Boolean(r.earlyBirdQualified),
      assignmentCount:assignees.size, assignmentLimit:3, assignedAssessors:[...assignees.values()],
      reportFileCount:Array.isArray(r.files?.reportFile)?r.files.reportFile.length:(r.files?.reportFile?1:0),
      claimFormCount:Array.isArray(r.files?.claimForm)?r.files.claimForm.length:(r.files?.claimForm?1:0),
      dissertationFileCount:Array.isArray(r.files?.dissertationFile)?r.files.dissertationFile.length:(r.files?.dissertationFile?1:0),
      dissertationFileName:Array.isArray(r.files?.dissertationFile)?(r.files.dissertationFile[0]?.originalName||''):(r.files?.dissertationFile?.originalName||''),
      feedbackStates:r.portalType==='assessor'?(r.works||[]).map(w=>feedbackAdminInfoForWork(w,records,r.department)):[]
    };
  });
}

function collectStoredFiles(record) {
  const out=[];
  const visit=v=>{
    if(!v) return;
    if(Array.isArray(v)){v.forEach(visit);return;}
    if(typeof v==='object'){
      if(v.storedName) out.push(path.join(FILES_DIR,path.basename(v.storedName)));
      else Object.values(v).forEach(visit);
    }
  };
  visit(record?.files);
  return [...new Set(out)];
}
async function deleteDepartmentSubmissions(department, ids) {
  const unique=[...new Set((ids||[]).map(String))];
  if(!unique.length) return {deleted:0, records:[]};
  const all=await readDb();
  const targets=all.filter(r=>r.department===department && unique.includes(r.id));
  if(!targets.length) return {deleted:0, records:[]};
  const targetIds=new Set(targets.map(r=>r.id));
  await writeDb(all.filter(r=>!targetIds.has(r.id)));
  await Promise.all(targets.flatMap(collectStoredFiles).map(fp=>fsp.unlink(fp).catch(()=>{})));
  const dissertationIds=new Set(targets.filter(r=>r.portalType==='dissertation').map(r=>r.id));
  if(dissertationIds.size){
    await mutateAssignments(list=>{
      const now=new Date().toISOString();
      for(const a of list){
        if(a.department!==department) continue;
        const before=(a.dissertationIds||[]).length;
        a.dissertationIds=(a.dissertationIds||[]).filter(id=>!dissertationIds.has(id));
        if(before!==a.dissertationIds.length && !a.dissertationIds.length){
          a.revokedAt=a.revokedAt||now;
          a.emailStatus='revoked';
          a.revokedReason='All dissertation submissions in this assignment were deleted by the department administrator.';
        }
      }
    });
  }
  return {deleted:targets.length,records:targets};
}

// SECURE DISSERTATION ASSIGNMENT WORKSPACE
// One token opens all assigned works. Download access can expire before the 8-week report-submission window.
app.get('/secure/dissertations/:token', async (req, res) => {
  const a=await assignmentByToken(req.params.token);
  const live=validateLiveAssignmentForSubmission(a);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(!live.ok)return res.status(live.status).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assignment Workspace</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431"><main style="max-width:760px;margin:70px auto;background:#fff;padding:32px;border-radius:14px"><h2 style="color:#082b4c">Assignment Workspace</h2><p>${htmlEscape(live.message)}</p></main></body></html>`);
  const allRecords=await readDb();
  const dissertations=dissertationRecords(recordsForDepartment(allRecords,a.department));
  const selected=(a.dissertationIds||[]).map(id=>dissertations.find(r=>r.id===id)).filter(Boolean);
  if(selected.length!==(a.dissertationIds||[]).length)return res.status(409).send('One or more dissertations in this assignment are no longer available. Contact the department administrator.');
  const completion=assignmentWorkCompletion(a,allRecords);
  const deadlineBase=new Date(a.sentAt||a.createdAt||Date.now());
  const deadlines={earlyBirdDueAt:a.earlyBirdDueAt||assignmentDeadlineDates(deadlineBase).earlyBirdDueAt,assessmentDueAt:a.assessmentDueAt||assignmentDeadlineDates(deadlineBase).assessmentDueAt};
  const early=new Date(deadlines.earlyBirdDueAt).toLocaleDateString('en-GB',{dateStyle:'long',timeZone:'UTC'});
  const due=new Date(deadlines.assessmentDueAt).toLocaleDateString('en-GB',{dateStyle:'long',timeZone:'UTC'});
  const downloadActive=!a.expiresAt||new Date(a.expiresAt).getTime()>Date.now();
  const expiry=a.expiresAt?new Date(a.expiresAt).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'})+' UTC':'Not specified';
  const assignmentType=a.assignmentType||'assessment';
  const taskTitle=assignmentType==='vetting'?'Vetting':'Assessment';
  const taskLabel=assignmentType==='vetting'?'vetting':'assessment';
  const cards=selected.map((r,i)=>{
    const found=completion.submitted.get(String(r.id));
    const submitted=Boolean(found);
    const submittedAt=found?.record?.submittedAt||'';
    const earlyBird=submitted?earlyBirdForSubmission(a,submittedAt):false;
    const reviewerCount=Array.isArray(r.files?.reviewerResponses)?r.files.reviewerResponses.length:0;
    const revised=(r.submissionType||'fresh')==='revised';
    const downloadButtons=downloadActive?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0"><a href="/secure/dissertations/${encodeURIComponent(req.params.token)}/works/${encodeURIComponent(r.id)}/dissertation" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:9px 12px;border-radius:7px;font-weight:700">Download ${revised?'Revised ':''}Dissertation</a>${revised&&reviewerCount?`<a href="/secure/dissertations/${encodeURIComponent(req.params.token)}/works/${encodeURIComponent(r.id)}/package" style="display:inline-block;background:#5b6670;color:#fff;text-decoration:none;padding:9px 12px;border-radius:7px;font-weight:700">Download Work Package (${reviewerCount} response${reviewerCount===1?'':'s'})</a>`:''}</div>`:`<div style="margin:12px 0;padding:10px 12px;background:#fff4dd;border:1px solid #ecd7a3;border-radius:7px;color:#795600"><strong>Download period ended.</strong> Report submission remains available until the 8-week due date.</div>`;
    const statusBlock=submitted?`<div style="margin-top:14px;padding:14px;background:#eaf7ef;border:1px solid #b9dfc9;border-radius:8px;color:#12683d"><strong>✓ Submitted</strong><br>Reference: ${htmlEscape(found.record.reference)}<br>Submitted: ${htmlEscape(new Date(submittedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}))} UTC${earlyBird?'<br><strong>Early Bird ✓</strong>':''}</div>`:`<form class="work-submit-form" data-work-id="${htmlEscape(r.id)}" style="margin-top:16px;padding-top:14px;border-top:1px solid #dde5eb"><div class="upload-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px"><label style="display:grid;gap:5px;font-weight:700;font-size:13px">${taskTitle} Report *<input name="reportFile" type="file" accept=".pdf,.doc,.docx" required style="padding:9px;border:1px solid #c9d3db;border-radius:7px"></label><label style="display:grid;gap:5px;font-weight:700;font-size:13px">Claim Form *<input name="claimForm" type="file" accept=".pdf,.doc,.docx" required style="padding:9px;border:1px solid #c9d3db;border-radius:7px"></label><label style="display:grid;gap:5px;font-weight:700;font-size:13px">Reviewed Dissertation <span style="font-weight:400;color:#657584">Optional</span><input name="dissertationFile" type="file" accept=".pdf,.doc,.docx" style="padding:9px;border:1px solid #c9d3db;border-radius:7px"></label></div><button type="submit" style="margin-top:12px;background:#137a45;color:#fff;border:0;border-radius:7px;padding:10px 15px;font-weight:800;cursor:pointer">Submit Work ${i+1}</button><div class="work-message" aria-live="polite" style="margin-top:9px;font-size:13px"></div></form>`;
    return `<section style="background:#fff;border:1px solid #d8e1e8;border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 2px 8px rgba(8,43,76,.04)"><div style="display:flex;justify-content:space-between;gap:15px;align-items:flex-start"><div><span style="font-size:12px;font-weight:800;color:#a57900;text-transform:uppercase">Work ${i+1} · ${revised?'Revised':'Fresh'} submission</span><h3 style="margin:5px 0;color:#082b4c">${htmlEscape(r.studentName||'Student')}</h3><div style="color:#526575;font-size:14px">${htmlEscape(r.indexNumber||'')} · ${htmlEscape(r.programme||'')}</div></div><span style="border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;${submitted?'background:#e8f6ee;color:#12683d':'background:#fff4dd;color:#8a5b00'}">${submitted?'Submitted':'Pending'}</span></div><p style="margin:12px 0 4px;color:#34495a"><strong>Title:</strong> ${htmlEscape(r.dissertationTopic||'')}</p>${revised?`<p style="margin:5px 0;color:#526575;font-size:13px">Reviewer response files linked: <strong>${reviewerCount}</strong></p>`:''}${downloadButtons}${statusBlock}</section>`;
  }).join('');
  const phoneValue=htmlEscape(a.assessorPhone||'');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${taskTitle} Assignment</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431;margin:0"><main style="max-width:900px;margin:38px auto;padding:0 16px 50px"><section style="background:#fff;padding:28px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.07)"><div style="font-size:12px;text-transform:uppercase;color:#d4a72c;font-weight:bold">University of Cape Coast</div><h1 style="color:#082b4c;font-size:28px;margin-bottom:6px">Your ${taskTitle} Assignment</h1><p style="margin-top:0;color:#526575">${htmlEscape(a.departmentName)} · ${htmlEscape(a.reference)}</p><p>Dear <strong>${htmlEscape(a.assessorName)}</strong>, you have <strong>${selected.length}</strong> assigned dissertation${selected.length===1?'':'s'}.</p><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#eef5f9;padding:14px;border-radius:10px;margin:18px 0"><strong style="font-size:20px;color:#082b4c">${completion.submittedCount} of ${completion.total} submitted</strong><span style="color:#526575">${completion.pendingCount} pending</span></div><div style="margin:18px 0;padding:14px 16px;background:#fff7dc;border:1px solid #ead58c;border-radius:8px"><strong>${taskTitle} timeline</strong><p style="margin:7px 0">Early Bird per work: submit by <strong>${htmlEscape(early)}</strong>.</p><p style="margin:7px 0">Final ${taskLabel} deadline: <strong>${htmlEscape(due)}</strong>.</p><p style="margin:7px 0">Dissertation download access: <strong>${htmlEscape(expiry)}</strong>.</p></div>${downloadActive?`<a href="/secure/dissertations/${encodeURIComponent(req.params.token)}/download" style="display:inline-block;background:#082b4c;color:#fff;text-decoration:none;padding:12px 17px;border-radius:8px;font-weight:bold">Download All ${selected.length} Work${selected.length===1?'':'s'} as ZIP</a>`:''}<div style="margin-top:20px;max-width:420px"><label style="display:grid;gap:6px;font-weight:800">Assessor Telephone Number *<input id="assessorPhone" value="${phoneValue}" placeholder="Enter once for report submissions" style="font:inherit;padding:10px 11px;border:1px solid #bcc9d3;border-radius:8px"></label><small style="color:#657584">Student details are securely linked and cannot be edited.</small></div></section><div>${cards}</div></main><script>const assignmentToken=${JSON.stringify(req.params.token).replace(/</g,'\u003c')};document.querySelectorAll('.work-submit-form').forEach(form=>{form.addEventListener('submit',async e=>{e.preventDefault();const msg=form.querySelector('.work-message'),btn=form.querySelector('button[type="submit"]'),phone=document.getElementById('assessorPhone').value.trim();if(!phone){msg.style.color='#a12f2f';msg.textContent='Enter the assessor telephone number above.';document.getElementById('assessorPhone').focus();return;}if(!form.reportValidity())return;const fd=new FormData(form);fd.append('phone',phone);btn.disabled=true;msg.style.color='#526575';msg.textContent='Uploading and saving this report…';try{const r=await fetch('/api/assessor/assignment/'+encodeURIComponent(assignmentToken)+'/works/'+encodeURIComponent(form.dataset.workId),{method:'POST',body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'The report could not be submitted.');msg.style.color='#12683d';msg.textContent='Submitted successfully. Updating progress…';setTimeout(()=>location.reload(),600);}catch(err){msg.style.color='#a12f2f';msg.textContent=err.message||'The report could not be submitted.';btn.disabled=false;}});});</script></body></html>`);
});

app.get('/secure/dissertations/:token/works/:dissertationId/dissertation', async(req,res)=>{
  const a=await assignmentByToken(req.params.token);const live=validateLiveAssignment(a);
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(!live.ok)return res.status(live.status).send(live.message);
  const id=String(req.params.dissertationId||'');if(!(a.dissertationIds||[]).map(String).includes(id))return res.status(403).send('This dissertation is not part of the assignment.');
  const record=(await readDb()).find(r=>r.id===id&&r.portalType==='dissertation'&&r.department===a.department);const file=record?.files?.dissertationFile;
  if(!file)return res.status(404).send('The dissertation file is unavailable.');const fp=path.join(FILES_DIR,path.basename(file.storedName));if(!fs.existsSync(fp))return res.status(404).send('The dissertation file is unavailable.');
  res.download(fp,safeBaseName(file.originalName||`${record.indexNumber||'dissertation'}${path.extname(fp)}`),async err=>{if(err){console.error('Individual dissertation download failed:',err);return;}await noteAssignmentDownload(a.id).catch(e=>console.error('Could not record assignment download:',e));});
});

app.get('/secure/dissertations/:token/works/:dissertationId/package', async(req,res)=>{
  const a=await assignmentByToken(req.params.token);const live=validateLiveAssignment(a);
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(!live.ok)return res.status(live.status).send(live.message);
  const id=String(req.params.dissertationId||'');if(!(a.dissertationIds||[]).map(String).includes(id))return res.status(403).send('This dissertation is not part of the assignment.');
  const record=(await readDb()).find(r=>r.id===id&&r.portalType==='dissertation'&&r.department===a.department);if(!record)return res.status(404).send('The assigned work is unavailable.');
  const zipFiles=[];const main=record.files?.dissertationFile;if(main){const fp=path.join(FILES_DIR,path.basename(main.storedName));if(fs.existsSync(fp))zipFiles.push({path:fp,name:safeBaseName(`01 - ${record.indexNumber||'Student'} - Dissertation${path.extname(main.originalName||fp)||'.docx'}`),size:Number(main.size||fs.statSync(fp).size)});}
  (record.files?.reviewerResponses||[]).forEach((f,i)=>{const fp=path.join(FILES_DIR,path.basename(f.storedName));if(fs.existsSync(fp))zipFiles.push({path:fp,name:safeBaseName(`${String(i+2).padStart(2,'0')} - Reviewer Response - ${f.originalName||'response'}`),size:Number(f.size||fs.statSync(fp).size)});});
  if(!zipFiles.length)return res.status(404).send('The assigned work files are unavailable.');res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="${safeBaseName(`${record.indexNumber||record.reference}-work-package.zip`)}"`);try{await streamZipArchive(res,zipFiles);await noteAssignmentDownload(a.id);}catch(e){console.error('Work package ZIP failed:',e);if(!res.headersSent)res.status(500).send('Could not prepare the work package.');else res.end();}
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
    const prefix=String(i+1).padStart(3,'0');
    if(item){
      const fp=path.join(FILES_DIR,path.basename(item.storedName));
      if(fs.existsSync(fp)){
        const ext=path.extname(item.originalName || fp) || '.docx';
        zipFiles.push({path:fp,name:safeBaseName(`${prefix} - ${r.indexNumber || 'No Index'} - ${r.studentName || 'Student'} - Dissertation${ext}`),size:Number(item.size||fs.statSync(fp).size)});
      }
    }
    (r.files?.reviewerResponses||[]).forEach((f,j)=>{
      const fp=path.join(FILES_DIR,path.basename(f.storedName));
      if(!fs.existsSync(fp))return;
      const ext=path.extname(f.originalName||fp)||'.docx';
      zipFiles.push({path:fp,name:safeBaseName(`${prefix} - ${r.indexNumber || 'No Index'} - Reviewer Response ${j+1}${ext}`),size:Number(f.size||fs.statSync(fp).size)});
    });
  });
  if(!zipFiles.length) return res.status(404).send('The assigned dissertation files are currently unavailable.');
  const totalSize=zipFiles.reduce((sum,f)=>sum+f.size,0);
  if(totalSize > 3.5 * 1024 * 1024 * 1024) return res.status(413).send('This dissertation package is too large for one ZIP. Please contact the department administrator.');

  res.setHeader('Content-Type','application/zip');
  res.setHeader('Content-Disposition',`attachment; filename="${safeBaseName(`${a.reference}-dissertations.zip`)}"`);
  try {
    await streamZipArchive(res, zipFiles);
    await noteAssignmentDownload(a.id);
  } catch(e) {
    console.error('Secure dissertation ZIP download failed:', e);
    if(!res.headersSent) res.status(500).send('Could not prepare the dissertation ZIP file.'); else res.end();
  }
});

// SECURE STUDENT ASSESSMENT FEEDBACK LINKS
app.get('/secure/feedback/:token', async(req,res)=>{
  const found=await feedbackByToken(req.params.token);
  const live=validateLiveFeedback(found);
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(!live.ok) return res.status(live.status).send(`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431"><main style="max-width:680px;margin:70px auto;background:#fff;padding:32px;border-radius:14px"><h2>Assessment Feedback</h2><p>${htmlEscape(live.message)}</p></main></body></html>`);
  const {record,work}=found;const f=work.feedback;const expiry=new Date(f.expiresAt).toLocaleString('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'})+' UTC';
  const reportType=f.reportType||record.reportType||'assessment';const label=reportType==='vetting'?'Vetting':'Assessment';
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} Feedback</title></head><body style="font-family:Arial,sans-serif;background:#f4f7fa;color:#182431;margin:0"><main style="max-width:680px;margin:60px auto;background:#fff;padding:32px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.08)"><div style="font-size:12px;text-transform:uppercase;color:#d4a72c;font-weight:bold">University of Cape Coast</div><h1 style="color:#082b4c;font-size:26px">Dissertation ${label} Feedback</h1><p>Dear ${htmlEscape(work.studentName||f.studentName||'Student')},</p><p>Your ${label.toLowerCase()} feedback from ${htmlEscape(record.departmentName||'the department')} is ready.</p><p>The download contains the ${label.toLowerCase()} report${work.files?.dissertationFile?' and the reviewed dissertation supplied by the assessor':''}. The claim form is not included.</p><form method="get" action="/secure/feedback/${encodeURIComponent(req.params.token)}/download"><button type="submit" style="background:#082b4c;color:white;border:0;border-radius:8px;padding:13px 18px;font-weight:bold;cursor:pointer">Download ${label} Feedback</button></form><p style="margin-top:22px;color:#647382;font-size:13px">This secure link expires on <strong>${htmlEscape(expiry)}</strong>. Please keep it private.</p></main></body></html>`);
});
app.get('/secure/feedback/:token/download', async(req,res)=>{
  const found=await feedbackByToken(req.params.token);const live=validateLiveFeedback(found);
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(!live.ok)return res.status(live.status).send(live.message);
  const {record,work,workIndex}=found;const zipFiles=[];const reportType=work.feedback?.reportType||record.reportType||'assessment';const reportLabel=reportType==='vetting'?'Vetting Report':'Assessment Report';
  const report=work.files?.reportFile;if(report){const fp=path.join(FILES_DIR,path.basename(report.storedName));if(fs.existsSync(fp))zipFiles.push({path:fp,name:safeBaseName(`${reportLabel} - ${work.indexNumber||work.studentName}${path.extname(report.originalName||fp)}`),size:Number(report.size||fs.statSync(fp).size)});}
  const reviewed=work.files?.dissertationFile;if(reviewed){const fp=path.join(FILES_DIR,path.basename(reviewed.storedName));if(fs.existsSync(fp))zipFiles.push({path:fp,name:safeBaseName(`Reviewed Dissertation - ${work.indexNumber||work.studentName}${path.extname(reviewed.originalName||fp)}`),size:Number(reviewed.size||fs.statSync(fp).size)});}
  if(!zipFiles.length)return res.status(404).send('The assessment feedback files are unavailable.');
  res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="${safeBaseName(`${record.reference}-${work.indexNumber||'student'}-feedback.zip`)}"`);
  try{await streamZipArchive(res,zipFiles);await mutateAssessmentWork(record.id,workIndex,w=>{w.feedback.downloadedAt=w.feedback.downloadedAt||new Date().toISOString();w.feedback.lastDownloadedAt=new Date().toISOString();w.feedback.downloadCount=Number(w.feedback.downloadCount||0)+1;return true;});}
  catch(e){console.error('Student feedback ZIP failed:',e);if(!res.headersSent)res.status(500).send('Could not prepare the feedback ZIP.');else res.end();}
});

// PUBLIC RESOURCES + DEVELOPER RESOURCE ADMINISTRATION
app.get('/api/resources', async (req, res) => {
  const portal = String(req.query.portal || '').trim();
  if (portal && !RESOURCE_PORTALS.has(portal)) return res.status(400).json({ error:'Unknown submission portal.' });
  const uploaded = await readResources();
  const all = [...BUILTIN_RESOURCES, ...uploaded];
  const filtered = portal ? all.filter(r => (r.portals || []).includes(portal)) : all;
  res.json(filtered.map(publicResource));
});

app.get('/api/resources/:id/download', async (req, res) => {
  const id = String(req.params.id || '');
  const builtin = BUILTIN_RESOURCES.find(r => r.id === id);
  if (builtin) {
    if (!fs.existsSync(builtin.sourcePath)) return res.status(404).send('Resource file is unavailable.');
    return res.download(builtin.sourcePath, builtin.originalName);
  }
  const resource = (await readResources()).find(r => r.id === id);
  if (!resource) return res.status(404).send('Resource not found.');
  const filePath = path.join(RESOURCES_DIR, path.basename(resource.storedName || ''));
  if (!fs.existsSync(filePath)) return res.status(404).send('Resource file is unavailable.');
  return res.download(filePath, resource.originalName || 'resource');
});

app.get('/developer', developerAuth, (_req,res)=>res.sendFile(path.join(__dirname,'developer','index.html')));
app.get('/developer/developer.css', developerAuth, (_req,res)=>res.sendFile(path.join(__dirname,'developer','developer.css')));
app.get('/developer/developer.js', developerAuth, (_req,res)=>res.sendFile(path.join(__dirname,'developer','developer.js')));
app.get('/api/developer/resources', developerAuth, async (_req,res)=>{
  const uploaded = await readResources();
  res.json([...BUILTIN_RESOURCES.map(r => ({...publicResource(r), canDelete:false})), ...uploaded.map(r => ({...publicResource(r), canDelete:true}))]);
});
app.post('/api/developer/resources', developerAuth, resourceUpload.single('resourceFile'), async (req,res)=>{
  try {
    if (!req.file) return res.status(400).json({ error:'Select a supported resource file to upload.' });
    const title = cleanHumanText(req.body?.title);
    const description = String(req.body?.description || '').trim().slice(0, 1000);
    const portals = normalizeResourcePortals(req.body?.portals);
    if (!title) { await fsp.unlink(req.file.path).catch(()=>{}); return res.status(400).json({ error:'Resource title is required.' }); }
    if (!portals.length) { await fsp.unlink(req.file.path).catch(()=>{}); return res.status(400).json({ error:'Select at least one submission portal where the resource should appear.' }); }
    const record = {
      id: crypto.randomUUID(), title: title.slice(0,180), description, portals,
      originalName: req.file.originalname, storedName: path.basename(req.file.path), mimeType:req.file.mimetype,
      size:req.file.size, uploadedAt:new Date().toISOString(), builtIn:false
    };
    await mutateResources(records => { records.push(record); return record; });
    res.status(201).json({ ok:true, resource:publicResource(record) });
  } catch (e) {
    console.error('Developer resource upload failed:', e);
    if (req.file?.path) await fsp.unlink(req.file.path).catch(()=>{});
    res.status(500).json({ error:'The resource could not be uploaded.' });
  }
});
app.delete('/api/developer/resources/:id', developerAuth, async (req,res)=>{
  const id=String(req.params.id||'');
  if (BUILTIN_RESOURCES.some(r=>r.id===id)) return res.status(400).json({ error:'Built-in resources cannot be deleted from the developer portal.' });
  let removed=null;
  await mutateResources(records => {
    const index=records.findIndex(r=>r.id===id);
    if(index<0) return null;
    removed=records.splice(index,1)[0];
    return removed;
  });
  if(!removed) return res.status(404).json({ error:'Resource not found.' });
  if(removed.storedName) await fsp.unlink(path.join(RESOURCES_DIR,path.basename(removed.storedName))).catch(()=>{});
  res.json({ ok:true, deleted:id });
});

// PUBLIC STUDY CENTRES + DEVELOPER ADMIN ACCOUNT / STUDY CENTRE MANAGEMENT
app.get('/api/study-centres', async(_req,res)=>res.json(await readStudyCentres()));
app.get('/api/developer/study-centres', developerAuth, async(_req,res)=>res.json(await readStudyCentres()));
app.post('/api/developer/study-centres', developerAuth, upload.single('studyCentresCsv'), async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Select a CSV file containing study centres.'});
    if(path.extname(req.file.originalname||'').toLowerCase()!=='.csv'){await fsp.unlink(req.file.path).catch(()=>{});return res.status(400).json({error:'Upload a CSV file. Put one study centre per row in the first column.'});}
    const centres=parseStudyCentreCsv(req.file.path);await fsp.unlink(req.file.path).catch(()=>{});
    const saved=await writeStudyCentres(centres);res.json({ok:true,count:saved.length,centres:saved});
  }catch(e){if(req.file?.path)await fsp.unlink(req.file.path).catch(()=>{});res.status(400).json({error:e.message||'Could not update study centres.'});}
});
app.post('/api/developer/study-centres/reset', developerAuth, async(_req,res)=>{const centres=await writeStudyCentres(DEFAULT_STUDY_CENTRES);res.json({ok:true,count:centres.length,centres});});

app.get('/api/developer/admin-users', developerAuth, async(_req,res)=>res.json((await readAdminUsers()).map(publicAdminUser)));
app.post('/api/developer/admin-users', developerAuth, async(req,res)=>{
  const name=cleanHumanText(req.body?.name).slice(0,160),email=cleanHumanText(req.body?.email).toLowerCase().slice(0,254);
  const requestedUsername=cleanHumanText(req.body?.username).toLowerCase().slice(0,100);
  const username=requestedUsername || email;
  const role=String(req.body?.role||'viewer').trim();const departments=normalizeAdminDepartments(req.body?.departments);const sections=normalizeAdminSections(req.body?.sections);
  if(!name||!isEmail(email)||!username)return res.status(400).json({error:'Administrator name and a valid email address are required.'});
  if(!/^[a-z0-9._@-]+$/i.test(username))return res.status(400).json({error:'Username may contain letters, numbers, dots, underscores, @ and hyphens only.'});
  if(!ADMIN_ROLES.has(role))return res.status(400).json({error:'Select a valid role.'});
  if(!departments.length)return res.status(400).json({error:'Assign at least one department.'});
  if(!sections.length)return res.status(400).json({error:'Assign at least one portal section.'});
  let error='';let created=null;const invitation=newAdminInvitation();
  await mutateAdminUsers(list=>{
    if(list.some(a=>String(a.username||'').toLowerCase()===username)){error='That administrator username already exists.';return null;}
    if(list.some(a=>String(a.email||'').toLowerCase()===email)){error='That administrator email address already has an account.';return null;}
    created={id:crypto.randomUUID(),name,email,username,role,departments,sections,active:true,createdAt:new Date().toISOString(),invitationTokenHash:invitation.tokenHash,invitationExpiresAt:invitation.expiresAt,invitationEmailStatus:'pending'};
    list.push(created);return created;
  });
  if(error)return res.status(400).json({error});
  const baseUrl=requestBaseUrl(req),setupUrl=`${baseUrl}/admin-set-password.html?token=${encodeURIComponent(invitation.token)}`;
  let emailSent=false,warning='';
  try{
    await sendAdminPasswordSetupEmail({to:email,name,username,role,departments,sections,setupUrl,expiresAt:invitation.expiresAt,baseUrl});
    emailSent=true;
    await mutateAdminUsers(list=>{const a=list.find(x=>x.id===created.id);if(a){a.invitationEmailStatus='sent';a.invitationSentAt=new Date().toISOString();a.invitationLastError=null;}return null;});
  }catch(e){
    warning=`The administrator account was created, but the invitation email could not be sent: ${e.message}`;
    console.error('Administrator invitation email failed:',e);
    await mutateAdminUsers(list=>{const a=list.find(x=>x.id===created.id);if(a){a.invitationEmailStatus='failed';a.invitationLastError=String(e.message||e).slice(0,500);}return null;});
  }
  const current=(await readAdminUsers()).find(x=>x.id===created.id) || created;
  res.status(201).json({ok:true,emailSent,warning:warning||null,user:publicAdminUser(current)});
});
app.post('/api/developer/admin-users/:id/resend-invitation', developerAuth, async(req,res)=>{
  const invitation=newAdminInvitation();let account=null;
  await mutateAdminUsers(list=>{const a=list.find(x=>x.id===req.params.id);if(!a)return null;if(!isEmail(a.email))return null;a.invitationTokenHash=invitation.tokenHash;a.invitationExpiresAt=invitation.expiresAt;a.invitationEmailStatus='pending';a.invitationLastError=null;account={...a};return account;});
  if(!account)return res.status(404).json({error:'Administrator account not found or does not have a valid email address.'});
  const baseUrl=requestBaseUrl(req),setupUrl=`${baseUrl}/admin-set-password.html?token=${encodeURIComponent(invitation.token)}`;
  try{
    await sendAdminPasswordSetupEmail({to:account.email,name:account.name||account.username,username:account.username,role:account.role||'viewer',departments:account.departments||[],sections:account.sections||[],setupUrl,expiresAt:invitation.expiresAt,baseUrl,isReset:Boolean(account.passwordHash)});
    await mutateAdminUsers(list=>{const a=list.find(x=>x.id===req.params.id);if(a){a.invitationEmailStatus='sent';a.invitationSentAt=new Date().toISOString();a.invitationLastError=null;}return null;});
    const updated=(await readAdminUsers()).find(x=>x.id===req.params.id);
    return res.json({ok:true,emailSent:true,user:publicAdminUser(updated)});
  }catch(e){
    console.error('Administrator invitation resend failed:',e);
    await mutateAdminUsers(list=>{const a=list.find(x=>x.id===req.params.id);if(a){a.invitationEmailStatus='failed';a.invitationLastError=String(e.message||e).slice(0,500);}return null;});
    const updated=(await readAdminUsers()).find(x=>x.id===req.params.id);
    return res.status(502).json({error:`The password setup email could not be sent: ${e.message}`,user:publicAdminUser(updated)});
  }
});
app.patch('/api/developer/admin-users/:id', developerAuth, async(req,res)=>{
  const role=req.body?.role?String(req.body.role).trim():null;const departments=req.body?.departments!==undefined?normalizeAdminDepartments(req.body.departments):null;const sections=req.body?.sections!==undefined?normalizeAdminSections(req.body.sections):null;
  let item=null;await mutateAdminUsers(list=>{const a=list.find(x=>x.id===req.params.id);if(!a)return null;if(role&&ADMIN_ROLES.has(role))a.role=role;if(departments?.length)a.departments=departments;if(sections?.length)a.sections=sections;if(req.body?.active!==undefined)a.active=Boolean(req.body.active);item=publicAdminUser(a);return item;});
  if(!item)return res.status(404).json({error:'Administrator account not found.'});res.json({ok:true,user:item});
});
app.delete('/api/developer/admin-users/:id', developerAuth, async(req,res)=>{let removed=false;await mutateAdminUsers(list=>{const i=list.findIndex(x=>x.id===req.params.id);if(i>=0){list.splice(i,1);removed=true;}return removed;});if(!removed)return res.status(404).json({error:'Administrator account not found.'});res.json({ok:true});});

// PUBLIC ONE-TIME ADMIN PASSWORD SETUP / RESET
app.get('/api/admin-invitation/:token', async(req,res)=>{
  const token=String(req.params.token||'');
  if(!/^[a-f0-9]{64}$/i.test(token))return res.status(400).json({error:'This password setup link is invalid.'});
  const tokenHash=hashOneTimeToken(token);const list=await readAdminUsers();const a=list.find(x=>x.invitationTokenHash===tokenHash);
  if(!a)return res.status(404).json({error:'This password setup link is invalid or has already been used.'});
  if(a.active===false)return res.status(403).json({error:'This administrator account is disabled. Contact the portal administrator.'});
  if(!a.invitationExpiresAt||new Date(a.invitationExpiresAt).getTime()<=Date.now())return res.status(410).json({error:'This password setup link has expired. Ask the portal developer to send a new link.'});
  const baseUrl=requestBaseUrl(req);
  res.json({ok:true,name:a.name||a.username,username:a.username,email:a.email||'',role:a.role||'viewer',departments:(a.departments||[]).map(slug=>({slug,name:departmentFromSlug(slug)?.name||slug})),sections:a.sections||[],expiresAt:a.invitationExpiresAt,passwordAlreadySet:Boolean(a.passwordHash),loginUrls:adminLoginLinks(a.departments||[],baseUrl)});
});
app.post('/api/admin-invitation/:token/set-password', async(req,res)=>{
  const token=String(req.params.token||''),password=String(req.body?.password||''),confirmPassword=String(req.body?.confirmPassword||'');
  if(!/^[a-f0-9]{64}$/i.test(token))return res.status(400).json({error:'This password setup link is invalid.'});
  if(password.length<10)return res.status(400).json({error:'Choose a password containing at least 10 characters.'});
  if(password!==confirmPassword)return res.status(400).json({error:'The password confirmation does not match.'});
  const tokenHash=hashOneTimeToken(token);let updated=null,error='';
  await mutateAdminUsers(list=>{const a=list.find(x=>x.invitationTokenHash===tokenHash);if(!a){error='This password setup link is invalid or has already been used.';return null;}if(a.active===false){error='This administrator account is disabled.';return null;}if(!a.invitationExpiresAt||new Date(a.invitationExpiresAt).getTime()<=Date.now()){error='This password setup link has expired. Ask the portal developer to send a new link.';return null;}const pw=hashPassword(password);a.passwordSalt=pw.salt;a.passwordHash=pw.hash;a.passwordSetAt=new Date().toISOString();a.invitationAcceptedAt=a.passwordSetAt;delete a.invitationTokenHash;delete a.invitationExpiresAt;a.invitationEmailStatus='accepted';a.invitationLastError=null;updated={...a};return updated;});
  if(error)return res.status(error.includes('expired')?410:400).json({error});
  const baseUrl=requestBaseUrl(req);
  res.json({ok:true,message:'Your administrator password has been set successfully.',user:publicAdminUser(updated),loginUrls:adminLoginLinks(updated.departments||[],baseUrl)});
});

// DEPARTMENT ADMIN: dissertation assignment by secure emailed link
app.get('/api/admin/:department/dissertation-assignments', departmentAuth, async(req,res)=>{
  if(!adminCan(req,'dissertation','viewer'))return res.json([]);
  const departmentRecords=recordsForDepartment(await readDb(),req.adminDepartment);
  const records=dissertationRecords(departmentRecords);
  const reports=assessorRecords(departmentRecords);
  const list=(await readAssignments()).filter(a=>a.department===req.adminDepartment).slice().reverse().map(a=>publicAssignment(a,records,reports));
  res.json(list);
});

app.post('/api/admin/:department/dissertation-assignments/delete-selected', departmentAuth, requireAdminAccess('dissertation','administrator'), async(req,res)=>{
  const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String))]:[];
  if(!ids.length) return res.status(400).json({error:'Select at least one dissertation assignment to delete.'});
  if(ids.length>500) return res.status(400).json({error:'A maximum of 500 assignment records can be deleted at once.'});
  const idSet=new Set(ids);
  const deleted=await mutateAssignments(list=>{
    let count=0;
    for(let i=list.length-1;i>=0;i--){
      if(list[i].department===req.adminDepartment && idSet.has(String(list[i].id))){list.splice(i,1);count++;}
    }
    return count;
  });
  if(!deleted) return res.status(404).json({error:'No selected dissertation assignments were found in this department.'});
  res.json({ok:true,deleted});
});

app.post('/api/admin/:department/dissertation-assignments', departmentAuth, requireAdminAccess('dissertation','officer'), async(req,res)=>{
  const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String))]:[];
  const assessorTitle=String(req.body?.assessorTitle||'').trim();
  const assessorFirstName=String(req.body?.assessorFirstName||'').trim();
  const assessorLastName=String(req.body?.assessorLastName||'').trim();
  const assessorName=buildDisplayName(assessorTitle,assessorFirstName,assessorLastName);
  const assessorEmail=String(req.body?.assessorEmail||'').trim();
  const message=String(req.body?.message||'').trim().slice(0,4000);
  const assignmentType=String(req.body?.assignmentType||'assessment').trim().toLowerCase();
  const expiryDays=Math.min(60,Math.max(1,Number.parseInt(req.body?.expiryDays,10)||ASSIGNMENT_EXPIRY_DAYS));
  if(!['assessment','vetting'].includes(assignmentType)) return res.status(400).json({error:'Select Assessment or Vetting as the assignment type.'});
  if(!gmailConfigured()) return res.status(503).json({error:'Email sending is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL in Render.'});
  if(!ids.length) return res.status(400).json({error:'Select at least one dissertation.'});
  if(ids.length>500) return res.status(400).json({error:'A maximum of 500 dissertations can be assigned at once.'});
  if(!assessorTitle || !assessorFirstName || !assessorLastName) return res.status(400).json({error:"Enter the assessor's title, first name and surname."});
  if(!isEmail(assessorEmail)) return res.status(400).json({error:'Enter a valid assessor email address.'});

  const records=dissertationRecords(recordsForDepartment(await readDb(),req.adminDepartment));
  const selected=ids.map(id=>records.find(r=>r.id===id)).filter(Boolean);
  if(selected.length!==ids.length) return res.status(400).json({error:'One or more selected dissertations are unavailable in this department.'});
  const selectedTypes=new Set(selected.map(r=>r.submissionType||'fresh'));
  if(selectedTypes.size>1) return res.status(400).json({error:'Fresh and revised dissertation submissions must be assigned separately.'});
  if(selected.some(r=>(r.submissionType||'fresh')==='fresh') && assignmentType!=='assessment') return res.status(400).json({error:'Fresh dissertation submissions can only be assigned for Assessment. Use Vetting for revised submissions.'});

  const supervisorConflicts=selected.filter(r=>samePersonName(assessorName,r.supervisorName));
  if(supervisorConflicts.length){
    const labels=supervisorConflicts.slice(0,5).map(r=>`${r.indexNumber||r.studentName||r.reference}`).join(', ');
    return res.status(400).json({error:`This assessor is recorded as the supervisor for the following selected dissertation${supervisorConflicts.length===1?'':'s'}: ${labels}. A supervisor cannot be assigned as assessor for the same work.`});
  }

  const token=newAssignmentToken();
  const now=new Date();
  const expiresAt=new Date(now.getTime()+expiryDays*24*60*60*1000).toISOString();
  const deadlines=assignmentDeadlineDates(now);
  const assignment={
    id:crypto.randomUUID(), reference:makeReference(assignmentType==='vetting'?'VETASSIGN':'ASSIGN'), department:req.adminDepartment, departmentName:req.adminDepartmentName,
    assignmentType, assessorTitle, assessorFirstName, assessorLastName, assessorName, assessorEmail, dissertationIds:ids,
    createdAt:now.toISOString(), expiresAt, earlyBirdDueAt:deadlines.earlyBirdDueAt, assessmentDueAt:deadlines.assessmentDueAt, tokenHash:assignmentTokenHash(token),
    sentAt:null, downloadedAt:null, lastDownloadedAt:null, downloadCount:0, revokedAt:null, emailStatus:'pending', resendCount:0, message
  };
  let reservationError='';
  const reserved=await mutateAssignments(list=>{
    const activeMap=reservedAssessorMap(list.filter(a=>a.department===req.adminDepartment));
    const alreadyAssigned=[];
    const atLimit=[];
    for(const r of selected){
      const people=activeMap.get(r.id)||new Map();
      const duplicate=[...people.values()].some(p=>String(p.email||'').toLowerCase()===assessorEmail.toLowerCase() || samePersonName(p.name,assessorName));
      if(duplicate) alreadyAssigned.push(r);
      if(people.size>=3) atLimit.push(r);
    }
    if(alreadyAssigned.length){
      const labels=alreadyAssigned.slice(0,5).map(r=>r.indexNumber||r.studentName||r.reference).join(', ');
      reservationError=`This assessor has already been assigned the following dissertation${alreadyAssigned.length===1?'':'s'}: ${labels}. Use Resend Link on the existing assignment instead.`;
      return false;
    }
    if(atLimit.length){
      const labels=atLimit.slice(0,5).map(r=>r.indexNumber||r.studentName||r.reference).join(', ');
      reservationError=`The following dissertation${atLimit.length===1?' has':'s have'} already reached the maximum of 3 assessors: ${labels}.`;
      return false;
    }
    list.push(assignment);
    return true;
  });
  if(!reserved) return res.status(400).json({error:reservationError||'The dissertation assignment could not be created.'});
  const secureUrl=`${baseUrlFor(req)}/secure/dissertations/${token}`;
  try {
    const email=await sendGmailEmail({to:assessorEmail,assessorName,departmentName:req.adminDepartmentName,dissertationCount:ids.length,expiresAt,secureUrl,earlyBirdDueAt:assignment.earlyBirdDueAt,assessmentDueAt:assignment.assessmentDueAt,message,assignmentType});
    await mutateAssignments(list=>{const a=list.find(x=>x.id===assignment.id);if(a){a.sentAt=new Date().toISOString();a.emailStatus='sent';a.emailProvider='gmail';a.emailProviderMessageId=email.id||'';a.lastEmailError='';}});
    const final=(await readAssignments()).find(x=>x.id===assignment.id)||assignment;
    res.status(201).json({ok:true,assignment:publicAssignment(final)});
  } catch(e) {
    console.error('Gmail assignment email failed:',e);
    await mutateAssignments(list=>{const a=list.find(x=>x.id===assignment.id);if(a){a.emailStatus='failed';a.lastEmailError=String(e.message||e).slice(0,500);}});
    res.status(502).json({error:`The assignment was recorded, but the email could not be sent: ${e.message||e}`,assignmentId:assignment.id});
  }
});

app.post('/api/admin/:department/dissertation-assignments/:id/revoke', departmentAuth, requireAdminAccess('dissertation','officer'), async(req,res)=>{
  const item=await mutateAssignments(list=>{
    const a=list.find(x=>x.id===req.params.id&&x.department===req.adminDepartment);
    if(!a) return null;
    a.revokedAt=new Date().toISOString(); a.emailStatus='revoked'; return publicAssignment(a);
  });
  if(!item) return res.status(404).json({error:'Assignment not found.'});
  res.json({ok:true,assignment:item});
});

app.post('/api/admin/:department/dissertation-assignments/:id/resend', departmentAuth, requireAdminAccess('dissertation','officer'), async(req,res)=>{
  if(!gmailConfigured()) return res.status(503).json({error:'Email sending is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL in Render.'});
  const all=await readAssignments();
  const existing=all.find(x=>x.id===req.params.id&&x.department===req.adminDepartment);
  if(!existing) return res.status(404).json({error:'Assignment not found.'});
  if(existing.revokedAt){
    const records=dissertationRecords(recordsForDepartment(await readDb(),req.adminDepartment));
    const selected=(existing.dissertationIds||[]).map(id=>records.find(r=>r.id===id)).filter(Boolean);
    const supervisorConflicts=selected.filter(r=>samePersonName(existing.assessorName,r.supervisorName));
    if(supervisorConflicts.length){
      const labels=supervisorConflicts.slice(0,5).map(r=>r.indexNumber||r.studentName||r.reference).join(', ');
      return res.status(400).json({error:`This revoked assignment cannot be reactivated because the assessor is recorded as supervisor for: ${labels}.`});
    }
    const otherAssignments=all.filter(a=>a.department===req.adminDepartment && a.id!==existing.id);
    const reservedMap=reservedAssessorMap(otherAssignments);
    const duplicates=[]; const atLimit=[];
    for(const r of selected){
      const people=reservedMap.get(r.id)||new Map();
      const duplicate=[...people.values()].some(p=>String(p.email||'').toLowerCase()===String(existing.assessorEmail||'').toLowerCase() || samePersonName(p.name,existing.assessorName));
      if(duplicate) duplicates.push(r);
      if(people.size>=3) atLimit.push(r);
    }
    if(duplicates.length){
      const labels=duplicates.slice(0,5).map(r=>r.indexNumber||r.studentName||r.reference).join(', ');
      return res.status(400).json({error:`This assessor is already assigned to the following dissertation${duplicates.length===1?'':'s'} in another active assignment: ${labels}.`});
    }
    if(atLimit.length){
      const labels=atLimit.slice(0,5).map(r=>r.indexNumber||r.studentName||r.reference).join(', ');
      return res.status(400).json({error:`The following dissertation${atLimit.length===1?' has':'s have'} already reached the maximum of 3 assessors: ${labels}.`});
    }
  }
  const expiryDays=Math.min(60,Math.max(1,Number.parseInt(req.body?.expiryDays,10)||ASSIGNMENT_EXPIRY_DAYS));
  const token=newAssignmentToken();
  const expiresAt=new Date(Date.now()+expiryDays*24*60*60*1000).toISOString();
  await mutateAssignments(list=>{const a=list.find(x=>x.id===existing.id);if(a){a.tokenHash=assignmentTokenHash(token);a.expiresAt=expiresAt;a.revokedAt=null;a.emailStatus='pending';a.lastEmailError='';a.resendCount=Number(a.resendCount||0)+1;}});
  const secureUrl=`${baseUrlFor(req)}/secure/dissertations/${token}`;
  try {
    const deadlineBase=new Date(existing.sentAt||existing.createdAt||Date.now());
    const deadlines={earlyBirdDueAt:existing.earlyBirdDueAt||assignmentDeadlineDates(deadlineBase).earlyBirdDueAt,assessmentDueAt:existing.assessmentDueAt||assignmentDeadlineDates(deadlineBase).assessmentDueAt};
    await mutateAssignments(list=>{const a=list.find(x=>x.id===existing.id);if(a){a.earlyBirdDueAt=deadlines.earlyBirdDueAt;a.assessmentDueAt=deadlines.assessmentDueAt;}});
    const email=await sendGmailEmail({to:existing.assessorEmail,assessorName:existing.assessorName,departmentName:existing.departmentName,dissertationCount:(existing.dissertationIds||[]).length,expiresAt,secureUrl,earlyBirdDueAt:deadlines.earlyBirdDueAt,assessmentDueAt:deadlines.assessmentDueAt,message:existing.message||'',assignmentType:existing.assignmentType||'assessment'});
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
  res.json({ department:req.adminDepartment, departmentName:req.adminDepartmentName, admin:{name:req.adminIdentity?.name||'',username:req.adminIdentity?.username||'',role:req.adminIdentity?.role||'viewer',sections:req.adminIdentity?.sections||[],master:Boolean(req.adminIdentity?.master)} });
});
app.get('/api/admin/:department/submissions', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const assignments=adminCan(req,'dissertation','viewer')?(await readAssignments()).filter(a=>a.department===req.adminDepartment):[];
  const mapped=adminRecordsMap(records,assignments).filter(r=>adminCan(req,portalSectionForRecord(r),'viewer'));
  res.json(mapped);
});
app.post('/api/admin/:department/project-work/:id/review', departmentAuth, requireAdminAccess('project-work','administrator'), async(req,res)=>{
  const status=String(req.body?.status||'').trim().toLowerCase();
  if(!PROJECT_REVIEW_STATUSES.has(status)) return res.status(400).json({error:'Choose Pending, Approved, Rejected or Returned for Correction.'});
  const note=String(req.body?.note||'').trim().slice(0,1500);
  const all=await readDb();
  const target=all.find(r=>r.id===req.params.id&&r.department===req.adminDepartment&&(r.portalType==='project-work'||!r.portalType));
  if(!target) return res.status(404).json({error:'Project work submission not found in this department.'});
  const now=new Date().toISOString();
  const reviewer=req.adminIdentity?.name||req.adminIdentity?.username||'Department administrator';
  target.reviewStatus=status; target.reviewNote=note; target.reviewedAt=now; target.reviewedBy=reviewer;
  target.reviewHistory=Array.isArray(target.reviewHistory)?target.reviewHistory:[];
  target.reviewHistory.push({status,note,reviewedAt:now,reviewedBy:reviewer});
  if(target.reviewHistory.length>50) target.reviewHistory=target.reviewHistory.slice(-50);
  await writeDb(all);
  const departmentRecords=recordsForDepartment(all,req.adminDepartment);
  res.json({ok:true,status,label:projectReviewLabel(status),reviewedAt:now,reviewedBy:reviewer,warnings:projectSubmissionWarnings(target,departmentRecords)});
});

app.post('/api/admin/:department/field-experience/:id/review', departmentAuth, requireAdminAccess('field-experience','administrator'), async(req,res)=>{
  const status=String(req.body?.status||'').trim().toLowerCase();
  if(!PROJECT_REVIEW_STATUSES.has(status)) return res.status(400).json({error:'Choose Pending, Approved, Rejected or Returned for Correction.'});
  const note=String(req.body?.note||'').trim().slice(0,1500);
  const all=await readDb();
  const target=all.find(r=>r.id===req.params.id&&r.department===req.adminDepartment&&r.portalType==='field-experience');
  if(!target) return res.status(404).json({error:'Field Experience score submission not found in this department.'});
  const now=new Date().toISOString();
  const reviewer=req.adminIdentity?.name||req.adminIdentity?.username||'Department administrator';
  target.reviewStatus=status; target.reviewNote=note; target.reviewedAt=now; target.reviewedBy=reviewer;
  target.reviewHistory=Array.isArray(target.reviewHistory)?target.reviewHistory:[];
  target.reviewHistory.push({status,note,reviewedAt:now,reviewedBy:reviewer});
  if(target.reviewHistory.length>50) target.reviewHistory=target.reviewHistory.slice(-50);
  await writeDb(all);
  const departmentRecords=recordsForDepartment(all,req.adminDepartment);
  res.json({ok:true,status,label:projectReviewLabel(status),reviewedAt:now,reviewedBy:reviewer,warnings:fieldExperienceSubmissionWarnings(target,departmentRecords)});
});

app.delete('/api/admin/:department/submissions/:id', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(),req.adminDepartment);const target=records.find(r=>r.id===req.params.id);
  if(!target)return res.status(404).json({error:'Submission not found in this department.'});
  if(!requireRecordAccess(req,res,target,'administrator'))return;
  const result=await deleteDepartmentSubmissions(req.adminDepartment,[req.params.id]);
  res.json({ok:true,deleted:result.deleted});
});
app.post('/api/admin/:department/submissions/delete-selected', departmentAuth, async(req,res)=>{
  const ids=Array.isArray(req.body?.ids)?[...new Set(req.body.ids.map(String))]:[];
  if(!ids.length) return res.status(400).json({error:'Select at least one submission to delete.'});
  if(ids.length>500) return res.status(400).json({error:'A maximum of 500 submissions can be deleted at once.'});
  const all=recordsForDepartment(await readDb(),req.adminDepartment);const targets=all.filter(r=>ids.includes(String(r.id)));
  if(!targets.length)return res.status(404).json({error:'No selected submissions were found in this department.'});
  if(targets.some(r=>!adminCan(req,portalSectionForRecord(r),'administrator')))return res.status(403).json({error:'Your administrator account does not have permission to delete one or more selected submissions.'});
  const result=await deleteDepartmentSubmissions(req.adminDepartment,targets.map(r=>r.id));
  res.json({ok:true,deleted:result.deleted});
});
app.get('/api/admin/:department/submissions/:id', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).json({error:'Submission not found in this department.'});
  if(!requireRecordAccess(req,res,r,'viewer'))return;
  res.json(r);
});
app.get('/api/admin/:department/submissions/:id/works/:workIndex/files/:kind', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).send('Submission not found in this department.');
  if(r.portalType!=='assessor')return res.status(400).send('Work-level files are available only for assessment submissions.');
  if(!adminCan(req,'assessor','viewer'))return res.status(403).send('You do not have access to assessment report files.');
  const workIndex=Number.parseInt(req.params.workIndex,10);
  const work=Array.isArray(r.works)?r.works[workIndex]:null;
  if(!work)return res.status(404).send('Assessment work not found.');
  const allowed=['reportFile','claimForm','dissertationFile'];
  if(!allowed.includes(req.params.kind))return res.status(400).send('Invalid file type.');
  const item=work.files?.[req.params.kind];
  if(!item)return res.status(404).send('File not found.');
  const fp=path.join(FILES_DIR,path.basename(item.storedName));
  if(!fs.existsSync(fp))return res.status(404).send('Stored file is unavailable.');
  res.download(fp,item.originalName);
});

app.post('/api/admin/:department/submissions/:id/works/:workIndex/forward-to-student', departmentAuth, requireAdminAccess('assessor','officer'), async(req,res)=>{
  if(!gmailConfigured())return res.status(503).json({error:'Email sending is not configured for Gmail API.'});
  const all=await readDb();const record=all.find(r=>r.id===req.params.id&&r.department===req.adminDepartment&&r.portalType==='assessor');
  if(!record)return res.status(404).json({error:'Assessment submission not found.'});
  const workIndex=Number.parseInt(req.params.workIndex,10),work=record.works?.[workIndex];if(!work)return res.status(404).json({error:'Assessment work not found.'});
  const exact=work.studentSubmissionId?all.find(r=>r.id===work.studentSubmissionId&&r.portalType==='dissertation'&&r.department===req.adminDepartment):null;
  const student=exact||latestStudentDissertation(all,req.adminDepartment,work.indexNumber);
  if(!student||!isEmail(student.email))return res.status(400).json({error:`No dissertation submission with a valid student email was found for index number ${work.indexNumber||''}.`});
  const reportType=record.reportType||'assessment';
  if((student.submissionType||'fresh')==='fresh'&&reportType!=='assessment')return res.status(400).json({error:'Fresh dissertation submissions can only receive an Assessment Report. Vetting reports are for revised submissions.'});
  if(!work.files?.reportFile)return res.status(400).json({error:`This work has no ${reportType==='vetting'?'vetting':'assessment'} report to forward.`});
  const token=newAssignmentToken(),now=new Date(),expiresAt=new Date(now.getTime()+STUDENT_FEEDBACK_EXPIRY_DAYS*24*60*60*1000).toISOString();
  work.feedback={...(work.feedback||{}),tokenHash:assignmentTokenHash(token),recipientEmail:student.email,studentSubmissionId:student.id,studentSubmissionType:student.submissionType||'fresh',reportType,createdAt:work.feedback?.createdAt||now.toISOString(),expiresAt,sentAt:null,downloadedAt:null,lastDownloadedAt:null,downloadCount:0,revokedAt:null,emailStatus:'pending',lastEmailError:''};
  await writeDb(all);
  const secureUrl=`${baseUrlFor(req)}/secure/feedback/${token}`;
  try{
    const email=await sendStudentFeedbackEmail({to:student.email,studentName:student.studentName||work.studentName,departmentName:req.adminDepartmentName,assessorName:record.assessorName,secureUrl,expiresAt,reportType});
    await mutateAssessmentWork(record.id,workIndex,w=>{w.feedback.sentAt=new Date().toISOString();w.feedback.emailStatus='sent';w.feedback.emailProvider='gmail';w.feedback.emailProviderMessageId=email.id||'';w.feedback.lastEmailError='';return true;});
    res.json({ok:true,email:student.email,status:'sent'});
  }catch(e){console.error('Student feedback email failed:',e);await mutateAssessmentWork(record.id,workIndex,w=>{w.feedback.emailStatus='failed';w.feedback.lastEmailError=String(e.message||e).slice(0,500);return true;});res.status(502).json({error:`The feedback link was prepared, but the email could not be sent: ${e.message||e}`});}
});
app.post('/api/admin/:department/submissions/:id/works/:workIndex/revoke-feedback', departmentAuth, requireAdminAccess('assessor','officer'), async(req,res)=>{
  const workIndex=Number.parseInt(req.params.workIndex,10);const result=await mutateAssessmentWork(req.params.id,workIndex,(w,r)=>{if(r.department!==req.adminDepartment||!w.feedback)return null;w.feedback.revokedAt=new Date().toISOString();w.feedback.emailStatus='revoked';return true;});
  if(!result)return res.status(404).json({error:'Feedback link not found.'});res.json({ok:true});
});

app.get('/api/admin/:department/submissions/:id/files/:kind/:index?', departmentAuth, async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  const r=records.find(x=>x.id===req.params.id);
  if(!r)return res.status(404).send('Submission not found in this department.');
  if(!adminCan(req,portalSectionForRecord(r),'viewer'))return res.status(403).send('You do not have access to this submission section.');
  const allowed=['claimForm','reportFile','scoresFile','completedWork','dissertationFile','reviewerResponses'];
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
  if(!r||!['project-work','field-experience'].includes(r.portalType||'project-work'))return res.status(404).send('Score submission not found.');
  if(!adminCan(req,portalSectionForRecord(r),'viewer'))return res.status(403).send('You do not have access to this score submission.');
  sendWorkbook(res,'single-score',[r],`${r.reference}-clean-scores.xlsx`);
});

// UNDERGRADUATE PROJECT WORK exports only
app.get('/api/admin/:department/export/project-scores.xlsx', departmentAuth, requireAdminAccess('project-work','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'scores',records,`${req.adminDepartment}-consolidated-project-scores.xlsx`);
});
app.get('/api/admin/:department/export/project-register.xlsx', departmentAuth, requireAdminAccess('project-work','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'project-register',records,`${req.adminDepartment}-project-work-register.xlsx`);
});
app.get('/api/admin/:department/export/project-master.xlsx', departmentAuth, requireAdminAccess('project-work','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'project-master',records,`${req.adminDepartment}-master-project-scores.xlsx`);
});

// FIELD EXPERIENCE score exports. Only Approved Field Experience submissions are consolidated.
app.get('/api/admin/:department/export/field-experience-scores.xlsx', departmentAuth, requireAdminAccess('field-experience','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'field-scores',records,`${req.adminDepartment}-consolidated-field-experience-scores.xlsx`);
});
app.get('/api/admin/:department/export/field-experience-register.xlsx', departmentAuth, requireAdminAccess('field-experience','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'field-register',records,`${req.adminDepartment}-field-experience-register.xlsx`);
});
app.get('/api/admin/:department/export/field-experience-master.xlsx', departmentAuth, requireAdminAccess('field-experience','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'field-master',records,`${req.adminDepartment}-master-field-experience-scores.xlsx`);
});

// DISSERTATION register and selected-document ZIP. No dissertation content is consolidated.
app.get('/api/admin/:department/export/dissertation-register.xlsx', departmentAuth, requireAdminAccess('dissertation','viewer'), async(req,res)=>{
  const records=recordsForDepartment(await readDb(), req.adminDepartment);
  sendWorkbook(res,'dissertation-register',records,`${req.adminDepartment}-dissertation-register.xlsx`);
});
app.post('/api/admin/:department/dissertations/download-selected', departmentAuth, requireAdminAccess('dissertation','viewer'), async(req,res)=>{
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
  const records=recordsForDepartment(await readDb(), req.adminDepartment).filter(r=>adminCan(req,portalSectionForRecord(r),'viewer'));
  res.json({
    total:records.length,
    project:adminCan(req,'project-work','viewer')?projectRecords(records).length:0,
    fieldExperience:adminCan(req,'field-experience','viewer')?fieldExperienceRecords(records).length:0,
    dissertation:adminCan(req,'dissertation','viewer')?dissertationRecords(records).length:0,
    assessor:adminCan(req,'assessor','viewer')?assessorRecords(records).length:0,
    scoreRows:adminCan(req,'project-work','viewer')?allScoreRows(records).length:0,
    fieldScoreRows:adminCan(req,'field-experience','viewer')?allFieldExperienceScoreRows(records).length:0
  });
});

app.get('/health',async(_req,res)=>{const admins=await readAdminUsers();res.json({ok:true,departments:Object.keys(DEPARTMENTS).length,emailConfigured:gmailConfigured(),emailProvider:'gmail',resources:(await readResources()).length+BUILTIN_RESOURCES.length,adminUsers:admins.length,pendingAdminInvitations:admins.filter(a=>!a.passwordHash&&a.invitationTokenHash).length,studyCentres:(await readStudyCentres()).length,developerPortalConfigured:DEVELOPER_ADMIN_PASSWORD!=='change-this-password'});});
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
  if (DEVELOPER_ADMIN_PASSWORD === 'change-this-password') console.warn('WARNING: Set DEVELOPER_ADMIN_PASSWORD before using the developer resource portal.');
});
