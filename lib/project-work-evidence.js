'use strict';
const path=require('path'),fs=require('fs/promises'),{fork}=require('child_process');
const normalizeIndex=value=>String(value||'').toUpperCase().replace(/[\s\u200B-\u200D\uFEFF]/g,'');
const normalizeName=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'');
const INDEX_PATTERN=/\b[A-Z][A-Z0-9]{1,10}\s*\/\s*[A-Z]{1,4}\s*\/?\s*\d{1,3}\s*\/\s*\d{2,4}\s*\/\s*\d{3,8}\b/gi;
const groupNumber=value=>{const match=String(value||'').trim().match(/(\d+)\s*$/);return match?String(Number(match[1])):String(value||'').trim().toUpperCase();};
const keyFor=row=>`${normalizeIndex(row.registrationNo).split('/')[0]}|${groupNumber(row.groupNo)}`;
const knownName=(line,names)=>{const compact=normalizeName(line);return [...names.entries()].filter(([key])=>key.length>=6&&compact.includes(key)).map(([key,name])=>({key,name}));};
function pairedNames(line,names){const cells=line.replace(INDEX_PATTERN,' ').split(/[|\t]/).map(cell=>cell.replace(/^\s*(?:name(?: of (?:the )?student)?|student name)\s*[:\-]\s*/i,''));return [...new Map(cells.map(cell=>normalizeName(cell)).filter(key=>names.has(key)).map(key=>[key,{key,name:names.get(key)}])).values()];}
function documentMembers(segments,names){
  const members=[];
  for(const segment of segments){const lines=String(segment.text||'').split(/[\r\n]+/).map(text=>text.trim()).filter(Boolean);for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
    const line=lines[lineIndex],indexes=[...line.matchAll(INDEX_PATTERN)];if(!indexes.length)continue;
    for(const index of indexes){
      let candidates=[],association='unpaired';const sameNames=pairedNames(line,names);
      if(indexes.length===1&&sameNames.length===1){candidates=sameNames;association='same-row';}
      else if(indexes.length===1&&!sameNames.length){const neighbours=[lines[lineIndex-1],lines[lineIndex+1]].filter(Boolean).filter(text=>![...text.matchAll(INDEX_PATTERN)].length).flatMap(text=>pairedNames(text,names));const unique=[...new Map(neighbours.map(name=>[name.key,name])).values()];if(unique.length===1){candidates=unique;association='adjacent-line';}}
      members.push({registrationNo:normalizeIndex(index[0]),writtenIndex:index[0].replace(/\s+/g,' ').trim(),names:candidates.map(candidate=>candidate.name),nameKeys:candidates.map(candidate=>candidate.key),association,page:segment.page||null,excerpt:lines.slice(Math.max(0,lineIndex-1),lineIndex+2).join('\n').slice(0,650)});
    }
  }}
  return members;
}
function compareStudent(row,document){
  const index=normalizeIndex(row.registrationNo),name=normalizeName(row.name),indexMembers=document.members.filter(member=>member.registrationNo===index),named=indexMembers.filter(member=>member.nameKeys.includes(name)),conflicting=indexMembers.filter(member=>member.nameKeys.length&&!member.nameKeys.includes(name));
  const nameFound=document.nameKeys.includes(name),variant=document.members.filter(member=>member.registrationNo.replace(/\//g,'')===index.replace(/\//g,'')&&member.registrationNo!==index);
  let status='not-found',evidence=[];
  if(named.length){status=conflicting.length?'ambiguous':'name-index';evidence=[...named,...conflicting];}
  else if(conflicting.length){status='different-name';evidence=conflicting;}
  else if(indexMembers.length){status=nameFound?'unpaired':'index-only';evidence=indexMembers;}
  else if(variant.length){status='index-format';evidence=variant;}
  else if(nameFound){status='name-only';evidence=document.nameEvidence[name]||[];}
  return {status,association:named[0]?.association||'',evidence:evidence.slice(0,3).map(({writtenIndex,registrationNo,names,page,excerpt})=>({writtenIndex,registrationNo,names,page,excerpt}))};
}
function analyseDocuments(record,sources,rowsFor,groupValidation,relatedRecords=[]){
  const scoreSources=[...new Map([record,...relatedRecords,...sources.map(source=>source.record)].map(source=>[source.id,source])).values()],names=new Map();for(const source of scoreSources)for(const row of rowsFor(source)){const name=String(row.name||'');if(normalizeName(name).length>=6)names.set(normalizeName(name),name);}
  const documents=sources.map(source=>{
    const parsed=source.parsed||{},segments=parsed.segments||[],nameEvidence={};for(const segment of segments)for(const line of String(segment.text||'').split(/[\r\n]+/)){for(const candidate of knownName(line.replace(INDEX_PATTERN,' '),names)){if(!nameEvidence[candidate.key])nameEvidence[candidate.key]=[];if(nameEvidence[candidate.key].length<2)nameEvidence[candidate.key].push({page:segment.page||null,excerpt:line.trim().slice(0,650),names:[candidate.name]});}}
    return {id:source.id,submissionId:source.record.id,reference:source.record.reference,name:source.file.originalName||'Project work',url:source.url,sha256:parsed.sha256||'',status:!parsed.ok?'unavailable':!parsed.readable?'no-readable-text':parsed.partial?'partial':'readable',note:!parsed.ok?parsed.error:!parsed.readable?'No searchable text was found. This may be a scan or image-only document. Open it for manual review.':parsed.partial?'Checked the first 30 PDF pages or 300,000 text characters. Unchecked content still needs manual review.':'',totalPages:parsed.totalPages||null,members:documentMembers(segments,names),nameKeys:Object.keys(nameEvidence),nameEvidence};
  });
  const own=documents.filter(document=>document.submissionId===record.id),rows=rowsFor(record).map(row=>({...row,matches:own.map(document=>({documentId:document.id,documentName:document.name,documentUrl:document.url,...compareStudent(row,document)})).filter(match=>match.status!=='not-found')}));
  const groups=new Map();for(const row of rows.filter(row=>row.included!==false)){const key=keyFor(row);if(!groups.has(key))groups.set(key,{caseKey:key,programme:key.split('|')[0],groupNumber:groupNumber(row.groupNo),rows:[]});groups.get(key).rows.push(row);}
  const groupResults=[...groups.values()].map(group=>{
    const candidates=own.map(document=>{const comparisons=group.rows.map(row=>({row,...compareStudent(row,document)})),matched=comparisons.filter(item=>item.status==='name-index'),expectedIndexes=new Set(group.rows.map(row=>normalizeIndex(row.registrationNo))),unexpected=document.members.filter(member=>!expectedIndexes.has(member.registrationNo));return {documentId:document.id,name:document.name,url:document.url,matchedCount:matched.length,studentCount:group.rows.length,allMembersTogether:matched.length===group.rows.length&&document.status==='readable'&&!unexpected.length,unexpectedIndexes:[...new Set(unexpected.map(member=>member.registrationNo))]};}).filter(candidate=>candidate.matchedCount);
    const full=candidates.filter(candidate=>candidate.allMembersTogether),review=[...(groupValidation.centreReviewCases||[]),...(groupValidation.transferExceptions||[])].find(review=>review.caseKey===group.caseKey);
    return {...group,rows:group.rows.map(({matches,...row})=>row),candidates,fullySupported:full.length===1,suggestedReportingCentre:review?.guideReportingCentreCode||review?.suggestedReportingCentreCode||review?.reportingCentreCode||'',conclusion:full.length===1?'All listed student names and index numbers occur together in one attached work. This supports one working group. Confirm its reporting centre from departmental records.':full.length>1?'The same complete member list occurs in more than one attachment. Check for repeated copies before counting claim units.':'The readable document evidence does not establish one complete matching group. Review the listed passages and originals.'};
  });
  // A document that covers multiple score groups cannot prove separate payable works.
  for(const group of groupResults)if(group.fullySupported){const documentId=group.candidates.find(candidate=>candidate.allMembersTogether).documentId;if(groupResults.filter(other=>other.candidates.some(candidate=>candidate.documentId===documentId&&candidate.allMembersTogether)).length>1){group.fullySupported=false;group.conclusion='One attachment supports more than one score-sheet group. Confirm whether separate project works exist before counting claim units.';}}
  const conflicts=[];const byIndex=new Map();for(const source of scoreSources)for(const row of rowsFor(source).filter(row=>row.included!==false)){const key=normalizeIndex(row.registrationNo);if(!byIndex.has(key))byIndex.set(key,[]);byIndex.get(key).push({record:source,row});}
  for(const [registrationNo,occurrences]of byIndex){if(!occurrences.some(item=>item.record.id===record.id)||occurrences.length<2)continue;const differentNames=new Set(occurrences.map(item=>normalizeName(item.row.name))).size>1,differentScores=new Set(occurrences.map(item=>String(item.row.totalScore||''))).size>1;
    conflicts.push({registrationNo,kind:differentNames?'different-names':differentScores?'different-scores':'exact-repeat',occurrences:occurrences.map(item=>({submissionId:item.record.id,reference:item.record.reference,name:item.row.name,group:groupNumber(item.row.groupNo),score:item.row.totalScore,matches:documents.filter(document=>document.submissionId===item.record.id).map(document=>({documentId:document.id,documentName:document.name,documentUrl:document.url,...compareStudent(item.row,document)})).filter(match=>match.status!=='not-found')})),conclusion:differentNames?'This index is assigned to different names. Document evidence can guide a correction, but confirm the official student record before changing an index or releasing payment.':differentScores?'The same student/index has different scores. Confirm the marked work and authorised score before changing results.':'The score rows repeat exactly. Academic deduplication does not establish whether a separate claim is payable.'});
  }
  const repeatedDocuments=[];const hashes=new Map();for(const document of documents){if(!document.sha256)continue;if(!hashes.has(document.sha256))hashes.set(document.sha256,[]);hashes.get(document.sha256).push(document);}for(const duplicate of hashes.values())if(duplicate.length>1&&duplicate.some(document=>document.submissionId===record.id))repeatedDocuments.push(duplicate.map(document=>({id:document.id,reference:document.reference,name:document.name,url:document.url})));
  return {reference:record.reference,submissionId:record.id,checkedAt:new Date().toISOString(),readOnly:true,summary:{scoreRows:rows.length,claimQuantity:groupValidation.claimedGroupCount,attachedWorks:own.length,scoreGroups:groupResults.length,fullySupportedGroups:groupResults.filter(group=>group.fullySupported).length,documentsNeedingReview:documents.filter(document=>document.status!=='readable').length,conflictingIndexes:conflicts.filter(conflict=>conflict.kind!=='exact-repeat').length},documents:documents.map(({nameKeys,nameEvidence,...document})=>document),rows,groups:groupResults,conflicts,repeatedDocuments,notice:'This is supporting evidence, not an approval. No names, index numbers, scores, centre decisions or payment holds have been changed.'};
}
function createDocumentReader(options={}){
  let queue=Promise.resolve();const cache=new Map();
  return async(file,filesDir)=>{
    const target=path.join(filesDir,path.basename(file.storedName||'')),extension=path.extname(file.originalName||file.storedName||'').toLowerCase();let stat;try{stat=await fs.stat(target);}catch{return {ok:false,error:'The stored document could not be found. Open the source record for manual review.'};}
    if(stat.size>20*1024*1024)return {ok:false,error:'This document exceeds the 20 MB text-check limit. Open it for manual review.'};const key=`${target}:${stat.size}:${stat.mtimeMs}`;if(cache.has(key))return cache.get(key);
    const task=queue.catch(()=>{}).then(()=>new Promise(resolve=>{
      const worker=fork(path.join(__dirname,'project-evidence-worker.js'),[],{execArgv:[options.fullProject?'--max-old-space-size=256':'--max-old-space-size=128'],stdio:['ignore','ignore','ignore','ipc']}),timer=setTimeout(()=>{worker.kill('SIGKILL');finish({ok:false,error:'Text extraction timed out. Open this document for manual review.'});},options.fullProject?60000:25000);let finished=false;
      function finish(value){if(finished)return;finished=true;clearTimeout(timer);resolve(value);}
      worker.once('message',finish);worker.once('error',()=>finish({ok:false,error:'The document reader could not start. Try again or review the original.'}));worker.once('exit',()=>finish({ok:false,error:'This document could not be read safely. Review the original.'}));worker.send({path:target,extension,maxPages:options.fullProject?200:30,textLimit:options.fullProject?1000000:300000});
    }));queue=task;cache.set(key,task);task.then(value=>{if(!value.ok)cache.delete(key);});while(cache.size>30)cache.delete(cache.keys().next().value);return task;
  };
}
module.exports={analyseDocuments,documentMembers,compareStudent,normalizeIndex,normalizeName,createDocumentReader};
