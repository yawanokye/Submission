'use strict';
const crypto=require('crypto');
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function inspectChapters(text){
 const lines=String(text||'').replace(/\r/g,'').split('\n'),offsets=[];let offset=0;
 const numbers={one:1,two:2,three:3,four:4,five:5,i:1,ii:2,iii:3,iv:4,v:5,'1':1,'2':2,'3':3,'4':4,'5':5};
 for(const line of lines){const match=line.trim().match(/^chapter\s+(one|two|three|four|five|iii|ii|iv|i|v|[1-5])\b[\s:.,-]*(.*)$/i);if(match&&!/\.{2,}/.test(line)&&!/(?:^|\s)\d{1,3}\s*$/.test(match[2]))offsets.push({number:numbers[match[1].toLowerCase()],offset,end:offset+line.length,title:line.trim().slice(0,150)});offset+=line.length+1;}
 // Use the last ordered set, so a contents page alone cannot stand in for chapter bodies.
 const chapters=[];for(let number=5,before=Infinity;number>=1;number--){const heading=offsets.filter(item=>item.number===number&&item.offset<before).at(-1);if(heading){chapters.unshift(heading);before=heading.offset;}}
 const results=Array.from({length:5},(_,index)=>{const number=index+1,chapter=chapters.find(item=>item.number===number),next=chapter&&chapters.find(item=>item.offset>chapter.offset),body=chapter?String(text).slice(chapter.end,next?.offset):'',words=normalize(body).split(' ').filter(Boolean).length;return {number,heading:chapter?.title||'',words,present:Boolean(chapter),substantive:Boolean(chapter&&words>=50)};});
 const missing=results.filter(chapter=>!chapter.present).map(chapter=>chapter.number),thin=results.filter(chapter=>chapter.present&&!chapter.substantive).map(chapter=>chapter.number);
 return {chapters:results,missing,thin,complete:missing.length===0&&thin.length===0,notice:'Five chapter headings and their text are checked. Fewer than 50 detected words in a chapter is a review flag, not a UCC word-count rule. This check does not establish academic quality.'};
}
function fingerprints(text){const normalized=normalize(text),words=normalized.split(' ').filter(Boolean),body=words.slice(200),sample=new Set();if(body.length>=800)for(let index=0;index+12<=body.length;index++){const value=parseInt(hash(body.slice(index,index+12).join(' ')).slice(0,8),16);if(value%16===0)sample.add(value);}return {textHash:words.length>=100?hash(normalized):'',wordCount:words.length,bodySample:[...sample].slice(0,3000)};}
function sameContent(a,b){if(a.sha256&&a.sha256===b.sha256)return 'Identical file contents';if(a.textHash&&a.textHash===b.textHash)return 'Same text in repackaged or renamed files';if(a.bodySample?.length>=100&&b.bodySample?.length>=100&&Math.min(a.wordCount,b.wordCount)/Math.max(a.wordCount,b.wordCount)>=0.8){const other=new Set(b.bodySample),common=a.bodySample.filter(value=>other.has(value)).length;if(common/Math.max(a.bodySample.length,b.bodySample.length)>=0.92)return 'Substantially repeated project text';}return '';}
function recommend(files,otherWorks=[],{claimed=0,sourceKey='',scanComplete=true,match=sameContent}={}){
 const decisions=[],kept=[];for(const file of files){const reasons=[],repeats=[];if(!file.readable)reasons.push(file.error||'The document text could not be read. Upload a searchable complete project for verification.');else{if(!file.chapterCheck.complete)reasons.push(...(file.chapterCheck.missing.length?[`Missing substantive chapter headings: ${file.chapterCheck.missing.join(', ')}.`]:[]),...(file.chapterCheck.thin.length?[`Very little chapter content detected: ${file.chapterCheck.thin.join(', ')}.`]:[]));if(!file.supportedGroups?.length)reasons.push('No complete score-sheet group has been matched to student names and indexes in this work.');}
  if(file.studentConflicts?.length)reasons.push(`Conflicting student index or score: ${file.studentConflicts.join('; ')}. Confirm the official student record.`);
  for(const previous of kept){const reason=match(file,previous);if(reason){reasons.push(`Repeated attachment within this claim: ${previous.name}.`);repeats.push({name:previous.name,reason,withinClaim:true});break;}}
  for(const other of otherWorks){const reason=match(file,other);if(reason){reasons.push(`${other.paid?'Previously paid work':'Work also attached to another claim'}: ${other.reference}.`);repeats.push({reference:other.reference,recordId:other.recordId,name:other.name,paid:other.paid,reason});}}
  // A single score-sheet group cannot justify two separate file claims.
  const sharedGroup=kept.find(previous=>previous.supportedGroups?.some(group=>file.supportedGroups?.includes(group)));if(!reasons.length&&sharedGroup)reasons.push(`The same score-sheet group is already supported by ${sharedGroup.name}.`);
  const eligible=!reasons.length;if(eligible)kept.push(file);decisions.push({index:file.index,key:`attachment:${file.index}`,name:file.name,eligible,reasons,repeats,chapterCheck:file.chapterCheck,matchedStudents:file.matchedStudents||0,supportedGroups:file.supportedGroups||[]});
 }
 const recommendedQuantity=scanComplete?decisions.filter(file=>file.eligible).length:0,unitKeys=scanComplete?decisions.filter(file=>file.eligible).map(file=>file.key):[];
 const model={claimedQuantity:claimed,attachedQuantity:files.length,recommendedQuantity,unitKeys,files:decisions,scanComplete,requiresDecision:true,notice:scanComplete?'Only distinct, complete five-chapter works matching a full score-sheet group are recommended. The administrator must approve or reject this recommendation.':'Run the department content check. Unchecked related submissions can hide repeated work.'};model.fingerprint=hash(JSON.stringify({sourceKey,claimed,files:decisions,scanComplete}));return model;
}
module.exports={inspectChapters,fingerprints,sameContent,recommend,normalize};
