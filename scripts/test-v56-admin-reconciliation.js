'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const XLSX=require('xlsx');

const root=path.resolve(__dirname,'..'),port=23200+Math.floor(Math.random()*300),base=`http://127.0.0.1:${port}`;
const username='reconciliation.admin@example.edu',password='Strong-Reconciliation-Test-Password!';
const headers={authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`};
const file=name=>({storedName:name,originalName:name,mimeType:'application/octet-stream',size:1});
const row=(n,name,registrationNo,groupNo,score)=>({originalSn:String(n),name,registrationNo,groupNo,totalScore:String(score)});
async function request(url,options={}){return fetch(`${base}${url}`,options)}
async function json(url,options={}){const response=await request(url,options),data=await response.json().catch(()=>({}));assert.equal(response.status,options.expectedStatus||200,`${url}: ${data.error||response.status}`);return data;}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'ucc-v56-reconciliation-')),dataDir=path.join(storage,'data');await fsp.mkdir(dataDir,{recursive:true});
  const rows=[
    row(1,'Student 1','BCH/ER/04/23/0006','6',74),row(2,'Student 2','BCH/ER/04/23/0001','6',74),row(3,'Student 3','BCH/ER/04/22/0018','6',74),
    row(4,'Student 4','BCM/ER/04/22/0005','Group3',76),row(5,'Student 5','BCM/ER/04/22/0010','Group3',76),row(6,'Student 6','BCM/ER/04/22/0017','Group3',76),
    row(7,'Student 7','BCM/ER/04/22/0015','Group 2',75),row(8,'Student 8','BCM/ER/04/23/0010','Group 2',75),row(9,'Student 9','BCM/ER/04/22/0009','Group 2',75),
    row(10,'Student 10','BCH/ER/04/22/0001','Procurement 4',71),row(11,'Student 11','BCH/ER/04/22/0004','Procurement 4',71),row(12,'Student 12','BCH/ER/04/22/0006','Procurement 4',71),
    row(13,'Transferred Student','BCM/BA/01/24/0003','HRM G1',74),row(14,'Student 14','BCM/ER/04/24/0003','HRM G1',74),row(15,'Student 15','BCM/ER/04/22/0006','HRM G1',74),
    row(16,'Student 16','BCH/ER/04/24/0007','8',75),row(17,'Student 17','BCH/ER/04/22/0007','8',75),row(18,'Student 18','BCH/ER/04/22/0011','8',75),
    row(19,'Student 19','BCH/ER/04/24/0011','7',74),row(20,'Student 20','BCH/ER/04/22/0016','7',74),row(21,'Student 21','BCH/ER/04/23/0003','7',74),
    row(22,'Student 22','BCH/ER/04/22/0020','Group 5',70),row(23,'Wrong Entry','BCH/ER04/22/0022','Group 5',70),row(24,'Student 24','BCH/ER/04/22/0024','Group 5',70)
  ];
  const record={id:'sample',portalType:'project-work',department:'education',departmentName:'Department of Education Programmes',reference:'PWORK-V56-SAMPLE',submittedAt:'2026-10-02T06:00:00.000Z',fullName:'Dr Sample Supervisor',email:'sample@example.edu',phone:'0240000000',groupCount:'8',claimedGroupCount:8,studyCentres:['WESLEY COLLEGE OF EDUCATION, KUMASI'],studentStream:'distance',projectStream:'distance',classificationVersion:0,projectCentreDecisions:[],projectCentreDecisionHistory:[],reviewStatus:'pending',reviewHistory:[],scoreSheet:{rows},scoreReviewExcludedRows:[],files:{claimForm:file('claim.pdf'),reportFile:file('report.docx'),scoresFile:file('scores.xlsx'),completedWork:Array.from({length:8},(_,i)=>file(`work-${i+1}.docx`))}};
  const salt=crypto.randomBytes(16).toString('hex'),account={id:'reconciliation-admin',name:'Reconciliation Administrator',email:username,username,role:'administrator',departments:['education'],sections:['project-work'],units:[],active:true,passwordSalt:salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex')};
  await Promise.all([fsp.writeFile(path.join(dataDir,'submissions.json'),JSON.stringify([record],null,2)),fsp.writeFile(path.join(dataDir,'admin-users.json'),JSON.stringify([account],null,2)),fsp.writeFile(path.join(dataDir,'support-tickets.json'),'[]')]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',DEVELOPER_ADMIN_PASSWORD:'test-developer-secret',SUPPORT_STATUS_TOKEN_SECRET:'independent-v56-test-secret'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  try{
    const deadline=Date.now()+15000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/listening on/,output);
    let detail=await json('/api/admin/education/submissions/sample',{headers});assert.equal(detail.groupValidation.scoreSheetGroupCount,10);assert.equal(detail.groupValidation.centreReviewCases.length,2);
    const transfer=detail.groupValidation.centreReviewCases.find(item=>item.caseKey==='BCM|1');assert.equal(transfer.recommendedAction,'merge-predominant');assert.equal(transfer.suggestedReportingCentreCode,'ER/04');
    const wrongEntry=detail.groupValidation.centreReviewCases.find(item=>item.caseKey==='BCH|5');assert.equal(wrongEntry.recommendedAction,'apply-suggested-correction');assert.equal(wrongEntry.registrationCorrections[0].newRegistrationNo,'BCH/ER/04/22/0022');
    let decision=await json('/api/admin/education/project-work/sample/centre-decision',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({caseKey:transfer.caseKey,action:'merge-predominant',reportingCentreCode:'ER/04',reason:'Transferred student confirmed by the department.'})});assert.equal(decision.reconciliationStatus,'in-progress');assert.equal(decision.validForFurtherProcessing,false);
    detail=await json('/api/admin/education/submissions/sample',{headers});assert.equal(detail.groupValidation.centreReviewCases.length,1,'the first decision must persist while another case remains');
    decision=await json('/api/admin/education/project-work/sample/centre-decision',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({caseKey:'BCH|5',action:'apply-suggested-correction',reason:'Missing slash in the registration number confirmed as a data-entry error.'})});assert.equal(decision.reconciliationStatus,'resolved');assert.equal(decision.validForFurtherProcessing,true);assert.equal(decision.groupValidation.scoreSheetGroupCount,8);
    detail=await json('/api/admin/education/submissions/sample',{headers});assert.equal(detail.groupValidation.valid,true);assert.equal(detail.projectReconciliation.status,'resolved');assert.equal(detail.reviewScoreRows.find(item=>item.sourceIndex===22).registrationNo,'BCH/ER/04/22/0022');assert.ok(detail.claimAudit.some(event=>String(event.note||'').includes('Missing slash')));
    await json('/api/admin/education/project-work/sample/review',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({status:'approved',note:'Reconciliation checked and accepted.'})});
    detail=await json('/api/admin/education/submissions/sample',{headers});assert.equal(detail.maximumPayableQuantity,8);assert.equal(detail.paymentUnits.length,8);
    const response=await request('/api/admin/education/export/project-scores.xlsx',{headers});assert.equal(response.status,200);const workbook=XLSX.read(await response.arrayBuffer(),{type:'array'}),matrix=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1}),header=matrix[0],groupIndex=header.indexOf('GROUP NO.'),groups=new Set(matrix.slice(1).map(values=>String(values[groupIndex])));assert.deepEqual([...groups].sort((a,b)=>Number(a)-Number(b)),['1','2','3','4','5','6','7','8']);
    console.log('v56 administrator reconciliation and group-number output verified.');
  }finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
