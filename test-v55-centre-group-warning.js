'use strict';

const assert=require('assert/strict');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const XLSX=require('xlsx');

const root=path.resolve(__dirname,'..'),port=22800+Math.floor(Math.random()*300),base=`http://127.0.0.1:${port}`;
function workbook(rows){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['S/N','NAME','REGISTRATION NO.','GROUP NO.','TOTAL SCORE'],...rows]),'Scores');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
function form({groupCount='10',workCount=10,rows}){const data=new FormData();for(const [key,value] of Object.entries({department:'education',title:'Dr',firstName:'Reconciliation',lastName:'Tester',phone:'0240000000',email:`reconciliation.${Date.now()}.${Math.random()}@example.edu`,groupCount,studentStream:'distance',claimantDeclaration:'yes'}))data.set(key,value);data.append('studyCentre','WESLEY COLLEGE OF EDUCATION, KUMASI');data.set('scoresFile',new Blob([workbook(rows)]),'scores.xlsx');data.set('claimForm',new Blob(['claim']),'claim.pdf');data.set('reportFile',new Blob(['report']),'report.docx');for(let index=0;index<workCount;index++)data.append('completedWork',new Blob([`work ${index+1}`]),`work-${index+1}.docx`);return data;}
async function post(data){const response=await fetch(`${base}/api/project-work`,{method:'POST',body:data}),body=await response.json().catch(()=>({}));return {response,body};}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'ucc-v55-centre-group-')),dataDir=path.join(storage,'data');await fsp.mkdir(dataDir,{recursive:true});await Promise.all([fsp.writeFile(path.join(dataDir,'submissions.json'),'[]'),fsp.writeFile(path.join(dataDir,'admin-users.json'),'[]'),fsp.writeFile(path.join(dataDir,'support-tickets.json'),'[]')]);
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),STORAGE_DIR:storage,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',DEVELOPER_ADMIN_PASSWORD:'test-developer-secret',SUPPORT_STATUS_TOKEN_SECRET:'independent-v55-test-secret'},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  try{
    const deadline=Date.now()+15000;while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));assert.match(output,/listening on/,output);
    const elevenGroups=Array.from({length:11},(_,index)=>[index+1,`Student ${index+1}`,`BEP/AS/01/${String(index+1).padStart(3,'0')}`,String(index+1),80]);
    let result=await post(form({groupCount:'10',workCount:10,rows:elevenGroups}));assert.equal(result.response.status,201,result.body.error);assert.ok(result.body.reconciliationWarningCount>=1,'the 10 claimed, 10 attached, 11 detected case must be accepted with a reconciliation warning');assert.match(result.body.reconciliationWarnings.join(' '),/Claimed groups \(10\).*11 distinct|11 distinct.*Claimed groups \(10\)/i);
    result=await post(form({groupCount:'10',workCount:9,rows:elevenGroups}));assert.equal(result.response.status,400);assert.match(result.body.error,/must equal the number of completed project works/i);
    const missingScore=elevenGroups.map(row=>[...row]);missingScore[4][4]='';result=await post(form({groupCount:'10',workCount:10,rows:missingScore}));assert.equal(result.response.status,400);assert.match(result.body.error,/must have a score|missing score/i);
    console.log('v55 centre/group reconciliation warning policy verified.');
  }finally{child.kill('SIGTERM');await fsp.rm(storage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
