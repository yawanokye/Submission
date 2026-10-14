'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'..'),port=23550+Math.floor(Math.random()*300),base=`http://127.0.0.1:${port}`,password='Strong-V57-Workflow-Password!';
const file=name=>({storedName:name,originalName:name,mimeType:'application/octet-stream',size:4});
const basic=username=>({authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`});
async function request(url,options={}){return fetch(`${base}${url}`,options)}
async function json(url,options={}){const response=await request(url,options),data=await response.json().catch(()=>({}));assert.equal(response.status,options.expectedStatus||200,`${url}: ${data.error||response.status}`);return data;}
function account(id,unit,extra={}){const salt=crypto.randomBytes(16).toString('hex');return {id,name:extra.name||id,email:`${id}@example.edu`,username:`${id}@example.edu`,role:'administrator',departments:['education'],sections:['field-experience','payroll','auditor'],units:[unit],active:true,passwordSalt:salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex'),...extra};}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'ucc-v57-field-routing-')),dataDir=path.join(storage,'data'),filesDir=path.join(storage,'files');await fsp.mkdir(dataDir,{recursive:true});await fsp.mkdir(filesDir,{recursive:true});
  const stored=['claim.pdf','scores.xlsx','work-1.pdf','work-2.pdf'];for(const name of stored)await fsp.writeFile(path.join(filesDir,name),name);
  const rows=[
    {originalSn:'1',registrationNo:'BEP/AS/01/001',name:'Student One',scoreValues:['75']},
    {originalSn:'2',registrationNo:'BEP/AS/01/002',name:'Student Two',scoreValues:['76']},
    {originalSn:'3',registrationNo:'BEP/AS/01/003',name:'Student Three',scoreValues:['77']},
    {originalSn:'4',registrationNo:'BEP/AS/01/004',name:'Student Four',scoreValues:['78']},
    {originalSn:'5',registrationNo:'BEP/AS/02/005',name:'Transferred Student',scoreValues:['79']}
  ];
  const record={id:'field-v57',portalType:'field-experience',department:'education',departmentName:'Department of Education Programmes',reference:'FIELD-V57-001',submittedAt:'2026-10-14T05:00:00.000Z',assessmentType:'field-experience-5',assessmentLabel:'Field Experience V',fullName:'Dr Field Examiner',email:'field.examiner@example.edu',phone:'0240000000',staffId:'STAFF-57',groupCount:'5',claimedCandidateCount:5,studyCentres:['Centre AS/01','Centre AS/02'],studyCentre:'Centre AS/01 | Centre AS/02',studentStream:'distance',projectStream:'distance',classificationVersion:0,fieldCentreDecisions:[],fieldCentreDecisionHistory:[],reviewStatus:'approved',reviewedAt:'2026-10-14T06:00:00.000Z',reviewedBy:'Department Administrator',reviewHistory:[{status:'approved',reviewedAt:'2026-10-14T06:00:00.000Z',reviewedBy:'Department Administrator'}],scoreSheet:{scoreHeaders:['F. EXP V'],rows},fieldScoreReviewExcludedRows:[],claimantCertification:{status:'verified',declarationText:'I certify that this claim is accurate and authorize its submission for processing.',claimantName:'Dr Field Examiner',claimantEmail:'field.examiner@example.edu',staffId:'STAFF-57',verifiedAt:'2026-10-14T05:30:00.000Z',history:[]},files:{claimForm:file('claim.pdf'),scoresFile:file('scores.xlsx'),completedWork:[file('work-1.pdf'),file('work-2.pdf')]}};
  const accounts=[
    account('hod','hod',{name:'Prof. Education HoD',hodDepartments:['education']}),
    account('directorate','directorate-education-business'),account('provost','provost'),account('finance','college-finance'),account('payroll','payroll'),account('audit','auditor')
  ];
  await Promise.all([fsp.writeFile(path.join(dataDir,'submissions.json'),JSON.stringify([record],null,2)),fsp.writeFile(path.join(dataDir,'admin-users.json'),JSON.stringify(accounts,null,2)),fsp.writeFile(path.join(dataDir,'support-tickets.json'),'[]')]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',ARKESEL_API_KEY:'',DEVELOPER_ADMIN_PASSWORD:'test-developer-secret',SUPPORT_STATUS_TOKEN_SECRET:'independent-v57-test-secret'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  try{
    const deadline=Date.now()+15000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/listening on/,output);
    let detail=await json('/api/admin/education/submissions/field-v57',{headers:basic('hod@example.edu')});assert.equal(detail.fieldValidation.transferExceptions.length,1);assert.equal(detail.fieldValidation.transferExceptions[0].reportingCentreCode,'AS/01');assert.equal(detail.fieldValidation.actualAttachedWorkCount,2);assert.equal(detail.maximumPayableQuantity,2);
    let forwarded=await json('/api/admin/education/claims/field-v57/forward-for-payment',{method:'POST',headers:{...basic('hod@example.edu'),'content-type':'application/json'},body:JSON.stringify({note:'Department consolidation completed.'})});assert.equal(forwarded.paymentWorkflow.stage,'pending-hod');assert.equal(forwarded.actualAttachedQuantity,2);
    let hodRegister=await json('/api/staff/payment-claims',{headers:basic('hod@example.edu')});assert.equal(hodRegister.consolidated.length,1);assert.equal(hodRegister.consolidated[0].totalClaims,2);
    const signature=new FormData();signature.set('signature',new Blob([await fsp.readFile(path.join(root,'public','ucc-logo.png'))],{type:'image/png'}),'hod-signature.png');await json('/api/admin/education/hod-signature-profile',{method:'POST',headers:basic('hod@example.edu'),body:signature});detail=await json('/api/admin/education/submissions/field-v57',{headers:basic('hod@example.edu')});
    const approved=await json('/api/admin/education/claims/field-v57/payment-approval',{method:'POST',headers:{...basic('hod@example.edu'),'content-type':'application/json'},body:JSON.stringify({password,approvedUnitKeys:detail.paymentUnits.map(item=>item.key),adjustmentReason:''})});assert.equal(approved.paymentApproval.approvedQuantity,2);assert.equal(approved.paymentWorkflow.stage,'pending-directorate-education-business');
    const chain=[['directorate@example.edu','pending-provost'],['provost@example.edu','pending-college-finance'],['finance@example.edu','pending-payroll'],['payroll@example.edu','pending-audit'],['audit@example.edu','completed']];
    for(const [username,nextStage] of chain){const register=await json('/api/staff/payment-claims',{headers:basic(username)});assert.equal(register.claims.length,1,`${username} should see the waiting claim`);assert.equal(register.claims[0].canAct,true);const result=await json('/api/staff/payment-claims/field-v57/decision',{method:'POST',headers:{...basic(username),'content-type':'application/json'},body:JSON.stringify({decision:'approve',note:`Approved by ${username}.`})});assert.equal(result.claim.stage,nextStage);}
    const auditHistory=await json('/api/staff/payment-claims',{headers:basic('audit@example.edu')});assert.equal(auditHistory.claims.length,1,'Audit keeps the completed claim in its register');assert.equal(auditHistory.claims[0].stage,'completed');assert.equal(auditHistory.claims[0].canAct,false);
    console.log('v57 Field Experience transfer reconciliation and complete claim routing verified.');
  }finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
