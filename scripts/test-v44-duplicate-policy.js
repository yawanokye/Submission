'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const XLSX=require('xlsx');

const root=path.resolve(__dirname,'..');
const port=19800+Math.floor(Math.random()*300);
const base=`http://127.0.0.1:${port}`;
const username='duplicate.admin@example.edu';
const password='Strong-Duplicate-Test-Password!';
const authorization=`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const headers={authorization};

async function request(url,options={}){return fetch(`${base}${url}`,options)}
async function json(url,options={}){const response=await request(url,options),data=await response.json().catch(()=>({}));assert.equal(response.status,options.expectedStatus||200,`${url}: ${data.error||response.status}`);return data}

function scoreRow(originalSn,name,registrationNo,groupNo,totalScore){return {originalSn,name,registrationNo,groupNo,totalScore}}
function project(id,reference,reviewedAt,fullName,email,rows){return {id,reference,portalType:'project-work',department:'education',departmentName:'Department of Education Programmes',submittedAt:reviewedAt,reviewedAt,reviewedBy:'Fixture reviewer',reviewStatus:'approved',fullName,email,phone:'0240000000',studyCentre:'Cape Coast',studyCentres:['Cape Coast'],projectStream:'distance',groupCount:'2',scoreSheet:{rows},scoreReviewExcludedRows:[],files:{}}}
function field(id,reference,reviewedAt,fullName,email,rows){return {id,reference,portalType:'field-experience',department:'education',departmentName:'Department of Education Programmes',submittedAt:reviewedAt,reviewedAt,reviewedBy:'Fixture reviewer',reviewStatus:'approved',fullName,email,phone:'0240000000',studyCentre:'Cape Coast',studyCentres:['Cape Coast'],assessmentType:'micro-teaching',assessmentLabel:'Micro-Teaching',groupCount:String(rows.length),claimedCandidateCount:rows.length,scoreSheet:{scoreHeaders:['SCORE'],rows},fieldScoreReviewExcludedRows:[],files:{}}}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'codeacademicservices-v44-'));
  const dataDir=path.join(storage,'data');await fsp.mkdir(dataDir,{recursive:true});await fsp.mkdir(path.join(storage,'files'),{recursive:true});
  const first=project('sheet-a','PWORK-DUP-A','2026-09-20T09:00:00.000Z','Dr First Supervisor','first@example.edu',[
    scoreRow('1','Alice Mensah','BEP/CC/01/001','1','80'),
    scoreRow('2','Bob Owusu','BEP/CC/01/002','1','70')
  ]);
  const second=project('sheet-b','PWORK-DUP-B','2026-09-21T09:00:00.000Z','Dr Second Supervisor','second@example.edu',[
    scoreRow('1','  alice  mensah ','bep/cc/01/001','1','80.0'),
    scoreRow('2','Bobby Owusu','BEP/CC/01/002','1','75'),
    scoreRow('3','Carol Addo','BEP/CC/01/003','2','65')
  ]);
  const fieldFirst=field('field-a','FIELD-DUP-A','2026-09-20T10:00:00.000Z','Ms First Mentor','mentor1@example.edu',[
    {originalSn:'1',name:'David Antwi',registrationNo:'BED/CC/01/010',scoreValues:['88']},
    {originalSn:'2',name:'Esi Arthur',registrationNo:'BED/CC/01/011',scoreValues:['72']}
  ]);
  const fieldSecond=field('field-b','FIELD-DUP-B','2026-09-21T10:00:00.000Z','Ms Second Mentor','mentor2@example.edu',[
    {originalSn:'1',name:'david antwi',registrationNo:'bed/cc/01/010',scoreValues:['88.0']},
    {originalSn:'2',name:'Esi A. Arthur',registrationNo:'BED/CC/01/011',scoreValues:['76']},
    {originalSn:'3',name:'Frank Boateng',registrationNo:'BED/CC/01/012',scoreValues:['69']}
  ]);
  const salt=crypto.randomBytes(16).toString('hex');
  const account={id:'duplicate-admin',name:'Duplicate Administrator',email:username,username,role:'administrator',departments:['education'],sections:['project-work','field-experience'],units:[],active:true,passwordSalt:salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex')};
  await Promise.all([
    fsp.writeFile(path.join(dataDir,'submissions.json'),JSON.stringify([first,second,fieldFirst,fieldSecond],null,2)),
    fsp.writeFile(path.join(dataDir,'admin-users.json'),JSON.stringify([account],null,2)),
    fsp.writeFile(path.join(dataDir,'support-tickets.json'),'[]')
  ]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',DEVELOPER_ADMIN_PASSWORD:'test-developer-secret',SUPPORT_STATUS_TOKEN_SECRET:'different-support-secret'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  try{
    const deadline=Date.now()+15000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/listening on/,output);
    let detail=await json('/api/admin/education/submissions/sheet-b',{headers});
    const exact=detail.duplicateReconciliation.find(group=>group.normalizedRegistrationNo==='bep/cc/01/001');
    const conflict=detail.duplicateReconciliation.find(group=>group.normalizedRegistrationNo==='bep/cc/01/002');
    assert.equal(exact.classification,'exact');assert.equal(exact.countedOnce,true);
    assert.equal(conflict.classification,'conflict');

    let response=await request('/api/admin/education/export/project-scores.xlsx',{headers});assert.equal(response.status,200);
    let workbook=XLSX.read(await response.arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1});
    const registrations=rows.slice(1).map(row=>String(row[3]||'').toUpperCase());
    assert.equal(registrations.filter(value=>value==='BEP/CC/01/001').length,1,'Exact duplicate must be exported once');
    assert.equal(registrations.filter(value=>value==='BEP/CC/01/002').length,2,'Conflicting duplicate must remain visible until reconciled');

    const reconciliation=await json('/api/admin/education/project-work/sheet-b/reconcile-duplicates',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({edits:[],removedRows:[{submissionId:'sheet-b',sourceIndex:1}],removalReason:'Conflicting duplicate confirmed by department administrator',affectedSubmissionIds:['sheet-b']})});
    assert.equal(reconciliation.removedRows,1);
    detail=await json('/api/admin/education/submissions/sheet-b',{headers});
    assert.deepEqual(detail.scoreReviewExcludedRows,[1]);
    assert.equal(detail.duplicateRowRemovalHistory.length,1);
    assert.ok(detail.claimAudit.some(event=>event.action==='Row removed from approved records'));

    response=await request('/api/admin/education/export/project-scores.xlsx',{headers});assert.equal(response.status,200);
    workbook=XLSX.read(await response.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1});
    const finalRegistrations=rows.slice(1).map(row=>String(row[3]||'').toUpperCase());
    assert.equal(finalRegistrations.filter(value=>value==='BEP/CC/01/001').length,1);
    assert.equal(finalRegistrations.filter(value=>value==='BEP/CC/01/002').length,1);
    assert.equal(finalRegistrations.filter(value=>value==='BEP/CC/01/003').length,1);

    detail=await json('/api/admin/education/submissions/field-b',{headers});
    assert.equal(detail.duplicateReconciliation.find(group=>group.normalizedRegistrationNo==='bed/cc/01/010').classification,'exact');
    assert.equal(detail.duplicateReconciliation.find(group=>group.normalizedRegistrationNo==='bed/cc/01/011').classification,'conflict');
    response=await request('/api/admin/education/export/field-report/micro-teaching/scores.xlsx',{headers});assert.equal(response.status,200);
    workbook=XLSX.read(await response.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1});
    assert.equal(rows.slice(1).filter(row=>String(row[2]||'').toUpperCase()==='BED/CC/01/010').length,1,'Exact field duplicate must be exported once');
    const fieldReconciliation=await json('/api/admin/education/field-experience/field-b/reconcile-duplicates',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({edits:[],removedRows:[{submissionId:'field-b',sourceIndex:1}],removalReason:'Conflicting Field Experience row confirmed by administrator',affectedSubmissionIds:['field-b']})});
    assert.equal(fieldReconciliation.removedRows,1);
    detail=await json('/api/admin/education/submissions/field-b',{headers});
    assert.deepEqual(detail.fieldScoreReviewExcludedRows,[1]);
    assert.ok(detail.claimAudit.some(event=>event.action==='Row removed from approved records'));
    console.log('v44 duplicate policy verified');
  }finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}

main().catch(error=>{console.error(error);process.exitCode=1});
