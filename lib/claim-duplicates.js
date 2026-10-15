'use strict';

// Compare payable work, independently of the claimant, filename, centre or group label.
// Edges stay local to each pair: a partial overlap must never merge unrelated claims.
function indexClaims(claims) {
  const byId=new Map(claims.map(claim=>[String(claim.id),claim])),buckets=new Map(),pairs=new Map();
  const compare=(a,b)=>a.rank-b.rank||String(a.submittedAt||'').localeCompare(String(b.submittedAt||''))||String(a.reference||'').localeCompare(String(b.reference||''))||String(a.id).localeCompare(String(b.id));
  for(const claim of claims){
    if(claim.excluded)continue;
    for(const [kind,values] of [['student',claim.students.keys()],['attachment',claim.attachments]]){
      for(const value of new Set(values)){
        const key=JSON.stringify([claim.scope,kind,value]);
        for(const other of buckets.get(key)||[]){
          if(claim.coveredPriorIds?.has(String(other.id))||other.coveredPriorIds?.has(String(claim.id)))continue;
          const ids=[String(claim.id),String(other.id)].sort(),pairKey=JSON.stringify(ids);
          if(!pairs.has(pairKey))pairs.set(pairKey,{a:byId.get(ids[0]),b:byId.get(ids[1]),students:new Set(),attachments:new Set()});
          pairs.get(pairKey)[kind==='student'?'students':'attachments'].add(value);
        }
        if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(claim);
      }
    }
  }
  const matches=new Map(claims.map(claim=>[String(claim.id),[]]));
  for(const pair of pairs.values()){
    const sameStudents=pair.students.size>0&&pair.students.size===pair.a.students.size&&pair.students.size===pair.b.students.size;
    const sameScores=sameStudents&&[...pair.students].every(key=>pair.a.students.get(key)===pair.b.students.get(key));
    const type=sameScores?'exact-student-results':sameStudents?'same-students-different-results':pair.students.size?'overlapping-students':'repeated-work-attachments';
    for(const [claim,other] of [[pair.a,pair.b],[pair.b,pair.a]])matches.get(String(claim.id)).push({id:other.id,reference:other.reference,matchType:type,studentCount:pair.students.size,attachmentCount:pair.attachments.size,alreadyPaid:other.paid,higherPriority:compare(other,claim)<0});
  }
  return new Map(claims.map(claim=>{
    const all=matches.get(String(claim.id)).sort((a,b)=>compare(byId.get(String(a.id)),byId.get(String(b.id)))),blocking=all.filter(item=>item.higherPriority),canonical=blocking[0],internal=claim.attachments.length!==new Set(claim.attachments).size;
    return [String(claim.id),{duplicate:Boolean(claim.excluded||canonical||internal||claim.unreadable),excluded:claim.excluded,internalDuplicate:internal,unreadableAttachments:claim.unreadable,matchType:claim.excluded?'excluded-repeat':internal?'repeated-attachment-within-claim':claim.unreadable?'attachment-unavailable':canonical?.matchType||'',canonicalId:canonical?.id||claim.resolution?.canonicalId||claim.id,canonicalReference:canonical?.reference||claim.resolution?.canonicalReference||claim.reference,matchingReferences:all.map(item=>item.reference),matches:all,studentOverlapCount:canonical?.studentCount||0,attachmentOverlapCount:canonical?.attachmentCount||0,alreadyPaid:claim.paid,financeReviewRequired:claim.paid&&Boolean(canonical||internal),attachmentScanComplete:claim.scanned}];
  }));
}
module.exports={indexClaims};
