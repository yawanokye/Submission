'use strict';
const key=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function submittedCentreGuide(selected,directory){
 const entries=(selected||[]).map(entered=>{const matches=directory.filter(centre=>key(centre.name)===key(entered)||key(centre.code)===key(entered)),codes=[...new Set(matches.map(centre=>centre.code))];return {entered,codes,name:matches.length===1?matches[0].name:'',status:codes.length===1?'matched':codes.length?'ambiguous':'unmapped'};});
 const codes=[...new Set(entries.filter(entry=>entry.status==='matched').flatMap(entry=>entry.codes))],unresolved=entries.some(entry=>entry.status!=='matched');return {entries,codes,unresolved,preferredCode:!unresolved&&codes.length===1?codes[0]:''};
}
function guideForGroup(guide,indexCentres){const relevant=guide.codes.filter(code=>indexCentres.includes(code));return {preferredCode:guide.preferredCode||(!guide.unresolved&&relevant.length===1?relevant[0]:''),options:[...new Set([...indexCentres,...guide.codes])].filter(code=>code!=='UNCLASSIFIED')};}
module.exports={submittedCentreGuide,guideForGroup};
