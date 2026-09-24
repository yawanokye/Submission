'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const root=path.resolve(__dirname,'..');
const port=20100+Math.floor(Math.random()*300);
const base=`http://127.0.0.1:${port}`;
const username='batch.admin@example.edu',password='Strong-Batch-Test-Password!';
const headers={authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`};
async function request(url,options={}){return fetch(`${base}${url}`,options)}
async function json(url,options={}){const response=await request(url,options),data=await response.json().catch(()=>({}));assert.equal(response.status,options.expectedStatus||200,`${url}: ${data.error||response.status}`);return data}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'ucc-code-eservices-v47-')),dataDir=path.join(storage,'data');await fsp.mkdir(dataDir,{recursive:true});await fsp.mkdir(path.join(storage,'files'),{recursive:true});
  const record={id:'project-batch-fixture',reference:'PWORK-BATCH-001',portalType:'project-work',department:'education',departmentName:'Department of Education Programmes',submittedAt:'2026-09-24T08:00:00.000Z',reviewedAt:'2026-09-24T09:00:00.000Z',reviewedBy:'Fixture reviewer',reviewStatus:'approved',fullName:'Dr Batch Supervisor',email:'batch.supervisor@example.edu',phone:'0240000000',studyCentre:'Cape Coast',studyCentres:['Cape Coast'],studentStream:'distance',projectStream:'distance',classificationVersion:0,groupCount:'1',scoreSheet:{rows:[{originalSn:'1',name:'Batch Student',registrationNo:'BEP/CC/01/001',groupNo:'1',totalScore:'82'}]},scoreReviewExcludedRows:[],files:{completedWork:[{originalName:'work.pdf',storedName:'missing.pdf'}]}};
  const salt=crypto.randomBytes(16).toString('hex'),account={id:'batch-admin',name:'Batch Administrator',email:username,username,role:'administrator',departments:['education'],sections:['project-work','field-experience'],units:[],active:true,passwordSalt:salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex')};
  await Promise.all([fsp.writeFile(path.join(dataDir,'submissions.json'),JSON.stringify([record],null,2)),fsp.writeFile(path.join(dataDir,'admin-users.json'),JSON.stringify([account],null,2)),fsp.writeFile(path.join(dataDir,'study-centres.json'),JSON.stringify({version:3,departments:{education:['Cape Coast','Non-Residential']}},null,2))]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',DEVELOPER_ADMIN_PASSWORD:'test-developer-secret',SUPPORT_STATUS_TOKEN_SECRET:'different-support-secret'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  try{
    const deadline=Date.now()+15000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/listening on/,output);
    const centres=await json('/api/study-centres?department=education');assert.deepEqual(centres,['Cape Coast'],'Non-Residential must not appear in the study-centre directory');
    let list=await json('/api/admin/education/score-batches',{headers});assert.equal(list.unbatched['project-work:distance'],1);
    const created=await json('/api/admin/education/score-batches',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({portalType:'project-work',stream:'distance'}),expectedStatus:201});assert.equal(created.recordCount,1);
    const zip=await request(`/api/admin/education/score-batches/${created.id}/download`,{headers});assert.equal(zip.status,200);assert.equal(zip.headers.get('content-type'),'application/zip');assert.ok((await zip.arrayBuffer()).byteLength>200);
    await json('/api/admin/education/submissions/project-batch-fixture/classification',{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({studentStream:'non-residential',studyCentres:[],reason:'Originally submitted under the wrong student category.'})});
    list=await json('/api/admin/education/score-batches',{headers});assert.equal(list.batches[0].correctionCount,1);assert.equal(list.unbatched['project-work:non-residential'],1);
    const correction=await request(`/api/admin/education/score-batches/${created.id}/corrections`,{headers});assert.equal(correction.status,200);assert.ok((await correction.arrayBuffer()).byteLength>200);
    console.log('v47 processing batches and category correction verified');
  }finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
