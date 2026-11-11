'use strict';
// Workflow regression fixtures model a completed independent content audit.
// Real DOCX extraction, recommendations and evidence decisions are covered by the v73 integration suite.
const fs=require('fs/promises'),path=require('path'),crypto=require('crypto'),{inspectChapters}=require('../../lib/project-completion');
module.exports=async function verifiedFixtures(base,headers,storage,ids=[]){
 const target=path.join(storage,'data','submissions.json'),records=JSON.parse(await fs.readFile(target,'utf8'));
 async function json(url,options={}){const response=await fetch(base+url,{...options,headers:{...headers,...options.headers}}),data=await response.json();if(!response.ok)throw new Error(`${url}: ${data.error}`);return data;}
 const chapterCheck=inspectChapters(Array.from({length:5},(_,index)=>`CHAPTER ${index+1}\n${'Independent verified academic analysis '.repeat(30)}`).join('\n'));
 for(const record of records){if((record.portalType||'project-work')!=='project-work'||record.reviewStatus!=='approved')continue;const model=await json(`/api/admin/${record.department}/claims/${record.id}/work-verification`);record.projectContentAudit={sourceKey:model.sourceKey,contentKey:model.contentKey,checkedAt:'2026-11-01T00:00:00Z',fixture:true,files:await Promise.all((record.files?.completedWork||[]).map(async(file,index)=>({index,name:file.originalName,readable:true,chapterCheck,sha256:crypto.createHash('sha256').update(await fs.readFile(path.join(storage,'files',file.storedName))).digest('hex'),textHash:'',bodySample:[],supportedGroups:[`FIXTURE:${index+1}`],supportedIndexes:[],matchedStudents:1})))};}
 await fs.writeFile(target,JSON.stringify(records));
 for(const id of ids){const record=records.find(record=>record.id===id),url=`/api/admin/${record.department}/claims/${id}/work-verification`,model=await json(url);if(!model.quantity)throw new Error(`Fixture ${id} has no recommended work`);await json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedSourceKey:model.sourceKey,expectedRecommendationFingerprint:model.recommendation?.fingerprint,recommendationDecision:'approve',completedWork:true,correctClaimant:true,quantityChecked:true,priorPaymentsChecked:true,verifiedQuantity:model.quantity,note:'Independent document and work completion review supplied for workflow fixture.'})});}
};
