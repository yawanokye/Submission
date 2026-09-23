'use strict';

const assert=require('assert/strict');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const XLSX=require('xlsx');

const root=path.resolve(__dirname,'..');
const port=20200+Math.floor(Math.random()*300);
const base=`http://127.0.0.1:${port}`;
const developerUser='developer';
const developerPassword='test-developer-secret';
const authorization=`Basic ${Buffer.from(`${developerUser}:${developerPassword}`).toString('base64')}`;
const jsonHeaders={'content-type':'application/json'};
const developerHeaders={authorization,...jsonHeaders};

async function request(url,options={}){return fetch(`${base}${url}`,options)}
async function json(url,options={}){
  const response=await request(url,options);
  const data=await response.json().catch(()=>({}));
  assert.equal(response.status,options.expectedStatus||200,`${url}: ${data.error||response.status}`);
  return data;
}

async function main(){
  const storage=await fsp.mkdtemp(path.join(os.tmpdir(),'codeacademicservices-v45-'));
  const child=spawn(process.execPath,['server.js'],{
    cwd:root,
    env:{...process.env,PORT:String(port),STORAGE_DIR:storage,DEVELOPER_ADMIN_USER:developerUser,DEVELOPER_ADMIN_PASSWORD:developerPassword,GMAIL_CLIENT_ID:'',GMAIL_CLIENT_SECRET:'',GMAIL_REFRESH_TOKEN:'',GMAIL_SENDER_EMAIL:'',SUPPORT_STATUS_TOKEN_SECRET:'v45-chatbot-test-secret'},
    stdio:['ignore','pipe','pipe']
  });
  let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  try{
    const deadline=Date.now()+15000;
    while(!output.includes('listening on')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    assert.match(output,/listening on/,output);

    const bootstrap=await json('/api/support/chatbot/bootstrap');
    assert.equal(bootstrap.mode,'rule-based');
    assert.equal(bootstrap.aiUsed,false);
    assert.ok(bootstrap.quickQuestions.length>=5,'Default approved quick questions should load');
    assert.ok(bootstrap.categories.some(item=>item.id==='deferment'));

    const known=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:'How do I resume after deferment?',categoryKey:'resumption-deferment',language:'en'})});
    assert.equal(known.aiUsed,false);
    assert.ok(known.matches.length>=1);
    assert.equal(known.matches[0].categoryKey,'resumption-deferment');
    assert.match(known.matches[0].answer,/deferment/i);

    let library=await json('/api/developer/chatbot-responses',{headers:{authorization}});
    const unansweredBefore=library.analytics.unansweredCount;
    const privateUnknown='Where is the quantum zebra desk? Contact learner@example.edu or 0241234567';
    const unknown=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:privateUnknown,language:'en'})});
    assert.deepEqual(unknown.matches,[]);
    library=await json('/api/developer/chatbot-responses',{headers:{authorization}});
    assert.equal(library.analytics.unansweredCount,unansweredBefore+1);
    assert.match(library.analytics.unanswered[0].question,/\[email removed\]/);
    assert.match(library.analytics.unanswered[0].question,/\[phone removed\]/);
    assert.doesNotMatch(library.analytics.unanswered[0].question,/learner@example\.edu|0241234567/);

    const beforeSensitiveQuestions=library.analytics.questions;
    const sensitive=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:'I need to report a confidential complaint',categoryKey:'sensitive',language:'en'})});
    assert.equal(sensitive.sensitive,true);
    library=await json('/api/developer/chatbot-responses',{headers:{authorization}});
    assert.equal(library.analytics.questions,beforeSensitiveQuestions,'Sensitive questions must not be stored');
    const detectedSensitive=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:'I need to report sexual harassment confidentially',language:'en'})});
    assert.equal(detectedSensitive.sensitive,true);
    library=await json('/api/developer/chatbot-responses',{headers:{authorization}});
    assert.equal(library.analytics.questions,beforeSensitiveQuestions,'Detected sensitive questions must not be stored');

    const title='Quantum zebra desk request';
    const created=await json('/api/developer/chatbot-responses',{method:'POST',headers:developerHeaders,expectedStatus:201,body:JSON.stringify({title,alternativeQuestions:['Where is the quantum zebra desk?'],keywords:['quantum zebra'],categoryKey:'general',matterType:'service-request',answer:'Submit this specialist question to Student Support Services for verified routing and follow-up.',responsibleUnit:'Student Support Services',actionLabel:'Submit this request',actionUrl:'/student-support.html?type=service-request&category=general',language:'en',status:'draft',quickQuestion:true,sortOrder:5})});
    assert.equal(created.response.status,'draft');
    const draftQuery=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:title,language:'en'})});
    assert.ok(!draftQuery.matches.some(item=>item.id===created.response.id),'Draft responses must stay private');

    const published=await json(`/api/developer/chatbot-responses/${encodeURIComponent(created.response.id)}/status`,{method:'PATCH',headers:developerHeaders,body:JSON.stringify({status:'published'})});
    assert.equal(published.response.status,'published');
    const publishedQuery=await json('/api/support/chatbot/query',{method:'POST',headers:jsonHeaders,body:JSON.stringify({question:title,language:'en'})});
    assert.equal(publishedQuery.matches[0].id,created.response.id);

    await json('/api/support/chatbot/feedback',{method:'POST',headers:jsonHeaders,body:JSON.stringify({responseId:created.response.id,helpful:true})});
    library=await json('/api/developer/chatbot-responses',{headers:{authorization}});
    const stored=library.responses.find(item=>item.id===created.response.id);
    assert.equal(stored.helpfulCount,1);
    assert.ok(stored.version>=2);
    assert.ok(stored.history.length>=1,'Published changes should retain version history');

    const exportResponse=await request('/api/developer/chatbot-responses.xlsx',{headers:{authorization}});
    assert.equal(exportResponse.status,200);
    const workbook=XLSX.read(await exportResponse.arrayBuffer(),{type:'array'});
    assert.deepEqual(workbook.SheetNames,['Response Library','Unanswered Questions']);
    const responseRows=XLSX.utils.sheet_to_json(workbook.Sheets['Response Library'],{defval:''});
    assert.ok(responseRows.some(row=>row.TITLE===title&&row.STATUS==='published'));

    const studentHtml=await fsp.readFile(path.join(root,'public','student-support.html'),'utf8');
    const developerHtml=await fsp.readFile(path.join(root,'developer','index.html'),'utf8');
    assert.match(studentHtml,/id="supportChatbot"/);
    assert.match(studentHtml,/Guided help without AI/);
    assert.match(developerHtml,/data-dev-panel="chatbot"/);
    assert.match(developerHtml,/Chatbot Response Library/);
    console.log('v45 rule-based chatbot and response library verified');
  }finally{
    child.kill('SIGTERM');
    await fsp.rm(storage,{recursive:true,force:true});
  }
}

main().catch(error=>{console.error(error);process.exitCode=1});
