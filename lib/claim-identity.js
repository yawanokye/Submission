'use strict';

const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const titlePattern=/^(?:(?:prof(?:essor)?|dr|mr|mrs|ms|miss|rev(?:erend)?|ing|esq)\.?\s+)+/i;
function splitClaimantName(value){
  const name=clean(value),title=name.match(titlePattern)?.[0]?.trim()||'',parts=name.slice(title.length).trim().split(/\s+/).filter(Boolean);
  return {title,firstName:parts[0]||'',middleName:parts.slice(1,-1).join(' '),lastName:parts.length>1?parts.at(-1):'',fullName:name};
}
function validName(value){
  const name=clean(value).replace(/^[.\u2026_\s]+|[.\u2026_\s]+$/g,'');
  if(name.length<4||name.length>180||/[\d:@<>/=]/.test(name)||!/^[\p{L}\p{M}\s.'’,-]+$/u.test(name))return '';
  if(/\b(address|signature|claimant|bank|account|department|programme|date|approved|checked|payment|surname|first name|middle name|name of|number|telephone|contact)\b/i.test(name))return '';
  return splitClaimantName(name).lastName?name:'';
}
function extractClaimantName(text){
  // Only labelled payee fields in the claimant section qualify. Approval names
  // and bank account names must never replace the claimant's identity.
  const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()),candidates=[];
  for(let index=0;index<lines.length;index++){
    const line=lines[index];if(/approved\s+for\s+payment|head\s+of\s+(?:department|\w+\s+programmes)|checked\s+by/i.test(line))break;
    const match=line.match(/^(?:(?:\d+[.)]|[a-z][.)])\s*)?(?:name\s+of\s+(?:(?:the|a)\s+)?(?:claimant|supervisor(?:\s*\/\s*examiner)?|examiner|marker|assessor|mentor)|(?:claimant(?:'s|’s)?|supervisor(?:\s*\/\s*examiner)?|examiner|marker|assessor|mentor)(?:'s|’s)?\s+(?:full\s+)?name)\s*(?:[:：]|\.{2,}|\u2026+|\t)\s*(.*)$/i);
    if(!match)continue;
    let raw=match[1].split(/\t|\s{3,}|\b(?:Address|Signature|Bank Details|Contact|Date)\s*:/i)[0];
    if(!raw.replace(/[.\u2026_\s]/g,'')){
      const next=lines.slice(index+1,index+4).find(value=>value.trim());
      raw=next||'';
    }
    const name=validName(raw);if(name)candidates.push(name);
  }
  const unique=[...new Map(candidates.map(name=>[clean(name).toLowerCase(),name])).values()];
  return unique.length===1?{status:'extracted',name:unique[0],...splitClaimantName(unique[0])}:{status:unique.length?'ambiguous':'not-detected',name:''};
}
function claimName(record){
  return record?.claimantNameCorrection?.fullName||(record?.claimFormIdentity?.status==='extracted'&&record.claimFormIdentity.applyName!==false?record.claimFormIdentity.name:'')||record?.fullName||record?.assessorName||'';
}
function claimNameView(record){
  const detected=record?.claimFormIdentity||{},correction=record?.claimantNameCorrection,submittedName=record?.fullName||record?.assessorName||'',fullName=claimName(record);
  return {...splitClaimantName(fullName),...(correction?{title:correction.title,firstName:correction.firstName,middleName:correction.middleName,lastName:correction.lastName}:{}),submittedName,detectedName:detected.name||'',detectionStatus:detected.status||'not-detected',source:correction?'administrator-correction':fullName===detected.name?'claim-form':'submission',confirmedBy:correction?.by||'',confirmedAt:correction?.at||null,history:Array.isArray(record?.claimantNameHistory)?record.claimantNameHistory:[]};
}
module.exports={extractClaimantName,splitClaimantName,claimName,claimNameView};
