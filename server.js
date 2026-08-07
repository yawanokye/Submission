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
const MAX_HEADER_SCAN_ROWS = 40;

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
    res.set('WWW-Authenticate', 'Basic realm="UCC Submission Admin"');
    return res.status(401).send('Administrator authentication required.');
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (!safeEqual(user, ADMIN_USER) || !safeEqual(pass, ADMIN_PASSWORD)) {
      res.set('WWW-Authenticate', 'Basic realm="UCC Submission Admin"');
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
    const populated = [name, registrationNo, groupNo, totalScore].filter(Boolean).length;
    // This is extraction only, not validation. It lets examiners add or remove student rows.
    // Prefilled empty S/N rows and ordinary footer text are ignored.
    if (populated === 0) continue;
    if (!numericSn(sn) && populated < 2) continue;
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
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024, files: 35 } });
function filesFor(req, key) { return (req.files && req.files[key]) || []; }
async function removeUploaded(req) { await Promise.all(Object.values(req.files || {}).flat().map(f => fsp.unlink(f.path).catch(() => {}))); }
function fileRecord(f) { return f ? { storedName: path.basename(f.path), originalName: f.originalname, mimeType: f.mimetype, size: f.size } : null; }
function text(req, key) { return String(req.body[key] || '').trim(); }
function requireText(req, fields) { return fields.find(k => !text(req, k)); }

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
    const missing = requireText(req, ['fullName','phone','email','groupCount','studyCentre']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error: `Missing required field: ${missing}` }); }
    if (!filesFor(req,'claimForm').length || !filesFor(req,'reportFile').length || !filesFor(req,'completedWork').length || !filesFor(req,'scoresFile').length) {
      await removeUploaded(req); return res.status(400).json({ error: 'Claim form, report, score sheet and completed project work are required.' });
    }
    let scoreResult;
    try { scoreResult = parseScoreWorkbook(filesFor(req,'scoresFile')[0].path); }
    catch (e) { await removeUploaded(req); return res.status(400).json({ error: e.message }); }
    const record = {
      id: crypto.randomUUID(), portalType: 'project-work', reference: makeReference('PWORK'), submittedAt: new Date().toISOString(),
      fullName: text(req,'fullName'), phone: text(req,'phone'), email: text(req,'email'), groupCount: text(req,'groupCount'), studyCentre: text(req,'studyCentre'),
      scoreSheet: { worksheet: scoreResult.sheetName, headerRow: scoreResult.headerRow, rowCount: scoreResult.rows.length, rows: scoreResult.rows },
      files: {
        claimForm: fileRecord(filesFor(req,'claimForm')[0]), reportFile: fileRecord(filesFor(req,'reportFile')[0]),
        scoresFile: fileRecord(filesFor(req,'scoresFile')[0]), completedWork: filesFor(req,'completedWork').map(fileRecord)
      }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt, scoreRowsIncluded:scoreResult.rows.length });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The project work submission could not be saved.' }); }
});

// 2. STUDENT DISSERTATION
app.post('/api/dissertation', upload.fields([{ name:'dissertationFile', maxCount:1 }]), async (req, res) => {
  try {
    const missing = requireText(req, ['studentName','indexNumber','phone','email','supervisorName','programme','dissertationTopic']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error:`Missing required field: ${missing}` }); }
    if (!filesFor(req,'dissertationFile').length) { await removeUploaded(req); return res.status(400).json({ error:'The dissertation file is required.' }); }
    const record = {
      id: crypto.randomUUID(), portalType:'dissertation', reference:makeReference('DISS'), submittedAt:new Date().toISOString(),
      studentName:text(req,'studentName'), indexNumber:text(req,'indexNumber'), phone:text(req,'phone'), email:text(req,'email'),
      supervisorName:text(req,'supervisorName'), programme:text(req,'programme'), dissertationTopic:text(req,'dissertationTopic'),
      files:{ dissertationFile:fileRecord(filesFor(req,'dissertationFile')[0]) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The dissertation submission could not be saved.' }); }
});

// 3. ASSESSOR SUBMISSION
app.post('/api/assessor', upload.fields([
  { name:'reportFile', maxCount:1 }, { name:'dissertationFile', maxCount:1 }, { name:'claimForm', maxCount:1 }
]), async (req, res) => {
  try {
    const missing = requireText(req, ['assessorName','phone','email','studentName','indexNumber','programme']);
    if (missing) { await removeUploaded(req); return res.status(400).json({ error:`Missing required field: ${missing}` }); }
    if (!filesFor(req,'reportFile').length || !filesFor(req,'claimForm').length) {
      await removeUploaded(req); return res.status(400).json({ error:'Assessment report and claim form are required. The dissertation upload is optional.' });
    }
    const record = {
      id:crypto.randomUUID(), portalType:'assessor', reference:makeReference('ASSESS'), submittedAt:new Date().toISOString(),
      assessorName:text(req,'assessorName'), phone:text(req,'phone'), email:text(req,'email'), studentName:text(req,'studentName'),
      indexNumber:text(req,'indexNumber'), programme:text(req,'programme'),
      files:{ reportFile:fileRecord(filesFor(req,'reportFile')[0]), claimForm:fileRecord(filesFor(req,'claimForm')[0]), dissertationFile:fileRecord(filesFor(req,'dissertationFile')[0]) }
    };
    await saveRecord(record);
    res.status(201).json({ ok:true, reference:record.reference, submittedAt:record.submittedAt });
  } catch (e) { console.error(e); await removeUploaded(req).catch(()=>{}); res.status(500).json({ error:'The assessor submission could not be saved.' }); }
});

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
  const h=['REFERENCE','SUBMITTED AT','EXAMINER / SUPERVISOR','PHONE','EMAIL','STUDY CENTRE','NO. OF GROUPS / CANDIDATES','SCORE ROWS EXTRACTED'];
  const body=projectRecords(records).map(r=>[r.reference,r.submittedAt,r.fullName,r.phone,r.email,r.studyCentre,r.groupCount,r.scoreSheet?.rowCount??0]); return [h,...body];
}
function dissertationRegisterAoA(records) {
  const h=['REFERENCE','SUBMITTED AT','STUDENT NAME','INDEX NUMBER','PHONE','EMAIL','SUPERVISOR NAME','PROGRAMME','DISSERTATION TOPIC','FILE'];
  const body=dissertationRecords(records).map(r=>[r.reference,r.submittedAt,r.studentName,r.indexNumber,r.phone,r.email,r.supervisorName,r.programme,r.dissertationTopic,r.files?.dissertationFile?.originalName||'']); return [h,...body];
}
function assessorRegisterAoA(records) {
  const h=['REFERENCE','SUBMITTED AT','ASSESSOR NAME','PHONE','EMAIL','STUDENT NAME','INDEX NUMBER','PROGRAMME','REPORT','DISSERTATION (OPTIONAL)','CLAIM FORM'];
  const body=assessorRecords(records).map(r=>[r.reference,r.submittedAt,r.assessorName,r.phone,r.email,r.studentName,r.indexNumber,r.programme,r.files?.reportFile?.originalName||'',r.files?.dissertationFile?.originalName||'',r.files?.claimForm?.originalName||'']); return [h,...body];
}
function addSheet(wb,name,aoa,widths) { const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=widths.map(w=>({wch:w})); if(ws['!ref']) ws['!autofilter']={ref:ws['!ref']}; XLSX.utils.book_append_sheet(wb,ws,name); }
function workbookBuffer(kind,records) {
  const wb=XLSX.utils.book_new();
  if(kind==='scores'||kind==='master') addSheet(wb,'Consolidated Project Scores',scoreSheetAoA(records),[10,34,24,16,16]);
  if(kind==='project'||kind==='master') addSheet(wb,'Project Work Register',projectRegisterAoA(records),[22,24,32,18,30,22,24,20]);
  if(kind==='dissertation'||kind==='master') addSheet(wb,'Dissertation Register',dissertationRegisterAoA(records),[22,24,30,22,18,30,30,30,55,35]);
  if(kind==='assessor'||kind==='master') addSheet(wb,'Assessor Register',assessorRegisterAoA(records),[22,24,30,18,30,30,22,30,35,35,35]);
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
function sendWorkbook(res,kind,records,filename){ const buffer=workbookBuffer(kind,records); res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition',`attachment; filename="${filename}"`); res.send(buffer); }

app.get('/admin',adminAuth,(_req,res)=>res.sendFile(path.join(__dirname,'admin','index.html')));
app.get('/admin/admin.css',adminAuth,(_req,res)=>res.sendFile(path.join(__dirname,'admin','admin.css')));
app.get('/admin/admin.js',adminAuth,(_req,res)=>res.sendFile(path.join(__dirname,'admin','admin.js')));

app.get('/api/admin/submissions',adminAuth,async(_req,res)=>{ const records=await readDb(); res.json(records.slice().reverse().map(r=>({
  id:r.id, reference:r.reference, submittedAt:r.submittedAt, portalType:r.portalType||'project-work',
  name:r.fullName||r.studentName||r.assessorName||'', secondaryName:r.portalType==='assessor'?r.studentName:(r.portalType==='dissertation'?r.supervisorName:''),
  email:r.email||'', phone:r.phone||'', programme:r.programme||'', studyCentre:r.studyCentre||'', scoreRows:r.scoreSheet?.rowCount??0
}))); });
app.get('/api/admin/submissions/:id',adminAuth,async(req,res)=>{ const records=await readDb(); const r=records.find(x=>x.id===req.params.id); if(!r)return res.status(404).json({error:'Submission not found.'}); res.json(r); });
app.get('/api/admin/submissions/:id/files/:kind/:index?',adminAuth,async(req,res)=>{
  const records=await readDb(); const r=records.find(x=>x.id===req.params.id); if(!r)return res.status(404).send('Submission not found.');
  const allowed=['claimForm','reportFile','scoresFile','completedWork','dissertationFile']; if(!allowed.includes(req.params.kind))return res.status(400).send('Invalid file type.');
  let item=r.files?.[req.params.kind]; if(Array.isArray(item))item=item[Number(req.params.index||0)]; if(!item)return res.status(404).send('File not found.');
  const fp=path.join(FILES_DIR,path.basename(item.storedName)); if(!fs.existsSync(fp))return res.status(404).send('Stored file is unavailable.'); res.download(fp,item.originalName);
});
app.get('/api/admin/submissions/:id/scores.xlsx',adminAuth,async(req,res)=>{ const records=await readDb(); const r=records.find(x=>x.id===req.params.id); if(!r||!(r.portalType==='project-work'||!r.portalType))return res.status(404).send('Project work submission not found.'); sendWorkbook(res,'scores',[r],`${r.reference}-scores.xlsx`); });
app.get('/api/admin/export/scores.xlsx',adminAuth,async(_req,res)=>sendWorkbook(res,'scores',await readDb(),'consolidated-project-scores.xlsx'));
app.get('/api/admin/export/project.xlsx',adminAuth,async(_req,res)=>sendWorkbook(res,'project',await readDb(),'project-work-register.xlsx'));
app.get('/api/admin/export/dissertation.xlsx',adminAuth,async(_req,res)=>sendWorkbook(res,'dissertation',await readDb(),'dissertation-register.xlsx'));
app.get('/api/admin/export/assessor.xlsx',adminAuth,async(_req,res)=>sendWorkbook(res,'assessor',await readDb(),'assessor-register.xlsx'));
app.get('/api/admin/export/master.xlsx',adminAuth,async(_req,res)=>sendWorkbook(res,'master',await readDb(),'ucc-submission-master-workbook.xlsx'));
app.get('/api/admin/summary',adminAuth,async(_req,res)=>{ const records=await readDb(); res.json({ total:records.length, project:projectRecords(records).length, dissertation:dissertationRecords(records).length, assessor:assessorRecords(records).length, scoreRows:allScoreRows(records).length }); });

app.get('/health',(_req,res)=>res.json({ok:true}));
app.get('/vendor/xlsx.full.min.js', (_req,res)=>res.sendFile(path.join(__dirname,'node_modules','xlsx','dist','xlsx.full.min.js')));
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.use((err,req,res,_next)=>{ console.error(err); if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'A file exceeds the 100 MB server limit.':err.message}); res.status(500).json({error:'Unexpected server error.'}); });
app.listen(PORT,'0.0.0.0',()=>{ console.log(`UCC submission portals listening on ${PORT}`); if(ADMIN_PASSWORD==='change-this-password')console.warn('WARNING: Set ADMIN_PASSWORD before production deployment.'); });
