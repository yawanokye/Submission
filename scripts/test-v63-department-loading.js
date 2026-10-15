'use strict';
const assert=require('assert/strict'),crypto=require('crypto'),fsp=require('fs/promises'),os=require('os'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve(process.env.UCC_TEST_SERVER_ROOT||path.join(__dirname,'..')),port=25000+Math.floor(Math.random()*400),base=`http://127.0.0.1:${port}`,username='loading-test@example.edu',password='Strong-Department-Loading-63!';
const headers={authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`};
async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'ucc-v63-loading-')),data=path.join(storage,'data'),files=path.join(storage,'files');await fsp.mkdir(data,{recursive:true});await fsp.mkdir(files,{recursive:true});await fsp.writeFile(path.join(files,'damaged.docx'),'This old upload is not a valid Word file.');
  const make=(id,claimForm)=>({id,portalType:'project-work',department:'education',reference:`PWORK-${id}`,submittedAt:'2026-10-15T04:00:00.000Z',fullName:'Dr Legacy Claimant',email:'claimant@example.edu',groupCount:'1',reviewStatus:'pending',studentStream:'distance',studyCentres:['CR/01'],scoreSheet:{rows:[{originalSn:'1',name:'Student One',registrationNo:`BEP/CR/01/${id}`,groupNo:'1',totalScore:'77'}]},files:{claimForm}});
  const records=[make('bad-metadata',{storedName:123,originalName:'legacy.pdf'}),make('missing-file',{storedName:'missing.pdf',originalName:'missing.pdf'}),make('damaged-word',{storedName:'damaged.docx',originalName:'damaged.docx'}),make('no-claim',null)];
  const salt=crypto.randomBytes(16).toString('hex'),account={id:'loading-test',name:'Department Loading Tester',email:username,username,active:true,role:'administrator',departments:['education'],sections:['project-work','field-experience','dissertation','assessor','payroll','auditor'],passwordSalt:salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex')};
  await Promise.all([fsp.writeFile(path.join(data,'submissions.json'),JSON.stringify(records)),fsp.writeFile(path.join(data,'admin-users.json'),JSON.stringify([account])),fsp.writeFile(path.join(data,'support-tickets.json'),'[]')]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,SUPPORT_STATUS_TOKEN_SECRET:'independent-v63-loading-test-secret'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  try{
    const deadline=Date.now()+10000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));assert.match(output,/listening on/,output);
    const endpoints=['info','submissions','summary','dissertation-assignments','hod-signature-profile','score-batches','hod-forward-register'];
    for(const endpoint of endpoints){const response=await fetch(`${base}/api/admin/education/${endpoint}`,{headers,signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,`${endpoint} must load even with unreadable legacy claim forms`);const payload=await response.json();if(endpoint==='submissions')assert.equal(payload.length,4);}
    for(const id of ['bad-metadata','missing-file','damaged-word']){const response=await fetch(`${base}/api/admin/education/submissions/${id}`,{headers,signal:AbortSignal.timeout(5000)});assert.equal(response.status,200,`Opening ${id} must preserve access to the submission`);const detail=await response.json();assert.equal(detail.claimantName.fullName,'Dr Legacy Claimant');assert.notEqual(detail.claimantName.detectionStatus,'extracted');}
    const response=await fetch(`${base}/api/admin/education/submissions/bad-metadata/claim-preview`,{headers});assert.equal(response.status,404,'An invalid stored-file reference must return a readable file-unavailable response');
    console.log('v63 all seven department-loading endpoints and individual legacy-claim review remain available with malformed, missing and damaged claim files.');
  }catch(error){console.error(output);throw error;}finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
