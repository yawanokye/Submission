const department = location.pathname.split('/').filter(Boolean)[1] || '';
const apiBase = `/api/admin/${encodeURIComponent(department)}`;
let submissions=[];
let dissertationAssignments=[];
let adminIdentity={role:'viewer',sections:['project-work','dissertation','assessor'],master:false,name:''};
const roleRank={viewer:1,officer:2,administrator:3};
const sectionMap={project:'project-work',dissertation:'dissertation',assessor:'assessor'};
const can=(section,role='viewer')=>(adminIdentity.sections||[]).includes(section)&&(roleRank[adminIdentity.role]||0)>=(roleRank[role]||1);
const selectedProject=new Set();
const selectedDissertations=new Set();
const selectedAssessors=new Set();
const selectedAssignments=new Set();
const dissertationSort=document.getElementById('dissertationSort');
const search=document.getElementById('search');
const dialog=document.getElementById('detailDialog');
const assignmentDialog=document.getElementById('assignmentDialog');
const assignmentForm=document.getElementById('assignmentForm');

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>{if(!v)return '';try{return new Date(v).toLocaleString()}catch{return v||''}};
const byType=t=>submissions.filter(s=>s.portalType===t);
const matchesSearch=s=>{const q=(search?.value||'').trim().toLowerCase();if(!q)return true;return [s.reference,s.name,s.secondaryName,s.email,s.phone,s.programme,s.studyCentre,s.studentName,s.indexNumber,s.dissertationTopic,s.supervisorName,s.assessorName].join(' ').toLowerCase().includes(q);};
const pruneSet=(set,valid)=>{for(const id of [...set])if(!valid.has(id))set.delete(id)};

async function load(){
  const [infoRes,subRes,sumRes,assignRes]=await Promise.all([fetch(`${apiBase}/info`),fetch(`${apiBase}/submissions`),fetch(`${apiBase}/summary`),fetch(`${apiBase}/dissertation-assignments`)]);
  if(!infoRes.ok||!subRes.ok||!sumRes.ok||!assignRes.ok)throw new Error('Could not load this department portal.');
  const info=await infoRes.json(); adminIdentity=info.admin||adminIdentity; submissions=await subRes.json(); dissertationAssignments=await assignRes.json(); const s=await sumRes.json();
  pruneSet(selectedProject,new Set(byType('project-work').map(x=>x.id)));
  pruneSet(selectedDissertations,new Set(byType('dissertation').map(x=>x.id)));
  pruneSet(selectedAssessors,new Set(byType('assessor').map(x=>x.id)));
  pruneSet(selectedAssignments,new Set(dissertationAssignments.map(x=>x.id)));
  document.getElementById('departmentName').textContent=info.departmentName;
  const ident=document.getElementById('adminIdentity');if(ident)ident.textContent=`${adminIdentity.name||adminIdentity.username||'Administrator'} · ${adminIdentity.role}`;
  applyPermissions();
  document.title=`${info.departmentName} · Submission Administration`;
  for(const k of ['total','project','dissertation','assessor','scoreRows'])document.getElementById(k).textContent=s[k]??0;
  document.getElementById('projectTabCount').textContent=s.project??0;
  document.getElementById('dissertationTabCount').textContent=s.dissertation??0;
  document.getElementById('assessorTabCount').textContent=s.assessor??0;
  document.getElementById('projectScoresLink').href=`${apiBase}/export/project-scores.xlsx`;
  document.getElementById('projectMasterLink').href=`${apiBase}/export/project-master.xlsx`;
  document.getElementById('projectRegisterLink').href=`${apiBase}/export/project-register.xlsx`;
  document.getElementById('dissertationRegisterLink').href=`${apiBase}/export/dissertation-register.xlsx`;
  render();
}

function applyPermissions(){
  document.querySelectorAll('.admin-tab').forEach(b=>b.hidden=!can(sectionMap[b.dataset.tab]||'', 'viewer'));
  document.querySelectorAll('.admin-tab-panel').forEach(p=>{if(!can(sectionMap[p.dataset.tabPanel]||'','viewer'))p.hidden=true;});
  const hide=(id,condition)=>{const el=document.getElementById(id);if(el)el.hidden=condition;};
  hide('emailSelectedDissertations',!can('dissertation','officer'));hide('deleteSelectedDissertations',!can('dissertation','administrator'));hide('deleteSelectedAssignments',!can('dissertation','administrator'));
  hide('selectAllAssignments',!can('dissertation','administrator'));hide('clearAssignments',!can('dissertation','administrator'));
  hide('deleteSelectedProject',!can('project-work','administrator'));hide('selectAllProject',!can('project-work','administrator'));hide('clearProject',!can('project-work','administrator'));
  hide('deleteSelectedAssessors',!can('assessor','administrator'));hide('selectAllAssessors',!can('assessor','administrator'));hide('clearAssessors',!can('assessor','administrator'));
  [['project','project-work'],['dissertation','dissertation'],['assessor','assessor'],['scoreRows','project-work']].forEach(([id,section])=>{const el=document.getElementById(id);if(el?.closest('article'))el.closest('article').hidden=!can(section,'viewer');});
  const first=[...document.querySelectorAll('.admin-tab')].find(b=>!b.hidden);if(first&&!document.querySelector('.admin-tab.active:not([hidden])'))activateAdminTab(first.dataset.tab);
}
function render(){renderProject();renderDissertations();renderAssignments();renderAssessors();updateSelectionButtons();}

function renderProject(){
  const rows=byType('project-work').filter(matchesSearch),tbody=document.getElementById('projectRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.name)}<br><small>${esc(s.email)}</small></td><td>${esc(s.studyCentre)}</td><td>${esc(s.scoreRows)}</td><td>${esc(fmt(s.submittedAt))}</td><td class="select-cell"><input class="row-check project-check" type="checkbox" data-id="${esc(s.id)}" ${selectedProject.has(s.id)?'checked':''}></td><td><div class="files"><a class="btn small" href="${apiBase}/submissions/${s.id}/files/scoresFile">Original Scores</a><a class="btn small" href="${apiBase}/submissions/${s.id}/scores.xlsx">Clean Scores</a><button class="btn small" onclick="showDetail('${s.id}')">View Record</button>${can('project-work','administrator')?`<button class="btn small danger" onclick="deleteOneSubmission('${s.id}','project work')">Delete</button>`:''}</div></td></tr>`).join('');
  document.getElementById('projectEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.project-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedProject.add(cb.dataset.id):selectedProject.delete(cb.dataset.id);updateSelectionButtons();}));
}

function assessorStateClass(count){
  count=Number(count||0);
  return count===0?'red':count===1?'amber':'green';
}
function assessorCounter(s){
  const count=Number(s.assignmentCount||0),limit=Number(s.assignmentLimit||3);
  const names=(s.assignedAssessors||[]).map(a=>a.name||a.email).filter(Boolean);
  const state=assessorStateClass(count);
  return `<span class="assignment-counter counter-${state}" title="${esc(names.join(', ')||'No assessor assigned')}">${count} / ${limit}</span>${names.length?`<small class="assessor-list">${esc(names.join(', '))}</small>`:''}`;
}
function dissertationSortRows(rows){
  const mode=dissertationSort?.value||'newest';
  const copy=rows.slice();
  if(mode==='assessors-asc') copy.sort((a,b)=>Number(a.assignmentCount||0)-Number(b.assignmentCount||0)||new Date(b.submittedAt||0)-new Date(a.submittedAt||0));
  else if(mode==='assessors-desc') copy.sort((a,b)=>Number(b.assignmentCount||0)-Number(a.assignmentCount||0)||new Date(b.submittedAt||0)-new Date(a.submittedAt||0));
  return copy;
}
function renderDissertations(){
  const rows=dissertationSortRows(byType('dissertation').filter(matchesSearch)),tbody=document.getElementById('dissertationRows');
  tbody.innerHTML=rows.map((s,i)=>{const state=assessorStateClass(s.assignmentCount);const type=`<span class="submission-type ${s.submissionType==='revised'?'revised':'fresh'}">${s.submissionType==='revised'?'Revised':'Fresh'}</span>`;return `<tr class="dissertation-state-${state}"><td>${i+1}</td><td>${esc(s.studentName||s.name)}</td><td><span class="ref">${esc(s.indexNumber)}</span></td><td class="title-cell">${type} ${esc(s.dissertationTopic)}${s.titleValidated?'<br><small class="validated-text">✓ Title validated</small>':''}</td><td>${esc(s.programme)}</td><td>${esc(s.supervisorName||s.secondaryName)}</td><td>${assessorCounter(s)}</td><td class="select-cell"><input class="row-check dissertation-check" type="checkbox" data-id="${esc(s.id)}" ${selectedDissertations.has(s.id)?'checked':''}></td><td><div class="files"><a class="btn small primary" href="${apiBase}/submissions/${s.id}/files/dissertationFile">Download</a><button class="btn small" onclick="showDetail('${s.id}')">View</button>${can('dissertation','administrator')?`<button class="btn small danger" onclick="deleteOneSubmission('${s.id}','dissertation')">Delete</button>`:''}</div></td></tr>`}).join('');
  document.getElementById('dissertationEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.dissertation-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedDissertations.add(cb.dataset.id):selectedDissertations.delete(cb.dataset.id);updateSelectionButtons();}));
}

function assignmentStatusBadge(a){const labelMap={'sent':'Sent','downloaded':'Downloaded','expired':'Expired','revoked':'Revoked','email-failed':'Email failed','pending':'Pending'};const label=labelMap[a.status]||a.status||'Pending';return `<span class="status-badge status-${esc(a.status||'pending')}">${esc(label)}</span>`;}
function renderAssignments(){
  const tbody=document.getElementById('assignmentRows'),rows=dissertationAssignments;
  tbody.innerHTML=rows.map((a,i)=>{const studentNames=(a.studentNames||[]).join(', ')||'—';return `<tr><td>${i+1}</td><td><span class="ref">${esc(a.reference)}</span></td><td class="title-cell">${esc(studentNames)}</td><td>${esc(a.assessorName)}</td><td>${esc(a.assessorEmail)}</td><td>${esc(a.dissertationCount)}</td><td>${a.sentAt?esc(fmt(a.sentAt)):'<small>Not sent</small>'}</td><td>${esc(fmt(a.earlyBirdDueAt))}</td><td>${esc(fmt(a.assessmentDueAt))}</td><td>${esc(fmt(a.expiresAt))}</td><td>${assignmentStatusBadge(a)}</td><td>${a.downloadedAt?`${esc(fmt(a.downloadedAt))}<br><small>${esc(a.downloadCount)} download${Number(a.downloadCount)===1?'':'s'}</small>`:'<small>Not downloaded</small>'}</td><td class="select-cell">${can('dissertation','administrator')?`<input class="row-check assignment-check" type="checkbox" data-id="${esc(a.id)}" ${selectedAssignments.has(a.id)?'checked':''} aria-label="Select assignment for deletion">`:''}</td><td><div class="files">${can('dissertation','officer')?`<button class="btn small" type="button" onclick="resendAssignment('${esc(a.id)}')">Resend Link</button>${a.status!=='revoked'?`<button class="btn small danger" type="button" onclick="revokeAssignment('${esc(a.id)}')">Revoke</button>`:''}`:''}</div>${a.lastEmailError?`<small class="error-text">${esc(a.lastEmailError)}</small>`:''}</td></tr>`}).join('');
  document.getElementById('assignmentEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.assignment-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedAssignments.add(cb.dataset.id):selectedAssignments.delete(cb.dataset.id);updateSelectionButtons();}));
}

function feedbackSummary(s){const states=s.feedbackStates||[];if(!states.length)return '<small>No work records</small>';return `<div class="feedback-summary">${states.map((f,i)=>`<span class="feedback-chip feedback-${esc(f.state)}" title="Work ${i+1}${f.email?` · ${esc(f.email)}`:''}">W${i+1}</span>`).join('')}</div>`;}
function renderAssessors(){
  const rows=byType('assessor').filter(matchesSearch),tbody=document.getElementById('assessorRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.assessorName||s.name)}</td><td>${esc(s.workCount||1)}</td><td class="title-cell">${esc(s.studentName||s.secondaryName)}</td><td>${esc(s.indexNumber)}</td><td>${esc(s.programme)}</td><td>${feedbackSummary(s)}</td><td>${esc(fmt(s.submittedAt))}</td><td class="select-cell"><input class="row-check assessor-check" type="checkbox" data-id="${esc(s.id)}" ${selectedAssessors.has(s.id)?'checked':''}></td><td><div class="files"><button class="btn small primary" onclick="showDetail('${s.id}')">View / Forward / Download</button>${can('assessor','administrator')?`<button class="btn small danger" onclick="deleteOneSubmission('${s.id}','assessment submission')">Delete</button>`:''}</div></td></tr>`).join('');
  document.getElementById('assessorEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.assessor-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedAssessors.add(cb.dataset.id):selectedAssessors.delete(cb.dataset.id);updateSelectionButtons();}));
}
function updateSelectionButtons(){
  const p=selectedProject.size,d=selectedDissertations.size,a=selectedAssessors.size;
  document.getElementById('projectSelectedCount').textContent=`(${p})`;document.getElementById('deleteSelectedProject').disabled=p===0||!can('project-work','administrator');
  document.getElementById('selectedCount').textContent=`(${d})`;document.getElementById('downloadSelectedDissertations').disabled=d===0;document.getElementById('deleteSelectedDissertations').disabled=d===0||!can('dissertation','administrator');
  const selectedRows=[...selectedDissertations].map(id=>submissions.find(s=>s.id===id)).filter(Boolean);const atLimit=selectedRows.some(s=>Number(s.assignmentCount||0)>=3);
  const emailBtn=document.getElementById('emailSelectedDissertations');emailBtn.disabled=d===0||atLimit||!can('dissertation','officer');emailBtn.title=atLimit?'At least one selected dissertation already has 3 assessors.':'';
  document.getElementById('assessorSelectedCount').textContent=`(${a})`;document.getElementById('deleteSelectedAssessors').disabled=a===0||!can('assessor','administrator');
  const da=selectedAssignments.size;document.getElementById('assignmentSelectedCount').textContent=`(${da})`;document.getElementById('deleteSelectedAssignments').disabled=da===0||!can('dissertation','administrator');
}

document.getElementById('selectAllProject').onclick=()=>{byType('project-work').filter(matchesSearch).forEach(s=>selectedProject.add(s.id));renderProject();updateSelectionButtons();};
document.getElementById('clearProject').onclick=()=>{selectedProject.clear();renderProject();updateSelectionButtons();};
document.getElementById('selectAllDissertations').onclick=()=>{byType('dissertation').filter(matchesSearch).forEach(s=>selectedDissertations.add(s.id));renderDissertations();updateSelectionButtons();};
document.getElementById('clearDissertations').onclick=()=>{selectedDissertations.clear();renderDissertations();updateSelectionButtons();};
document.getElementById('selectAllAssessors').onclick=()=>{byType('assessor').filter(matchesSearch).forEach(s=>selectedAssessors.add(s.id));renderAssessors();updateSelectionButtons();};
document.getElementById('clearAssessors').onclick=()=>{selectedAssessors.clear();renderAssessors();updateSelectionButtons();};
document.getElementById('selectAllAssignments').onclick=()=>{dissertationAssignments.forEach(a=>selectedAssignments.add(a.id));renderAssignments();updateSelectionButtons();};
document.getElementById('clearAssignments').onclick=()=>{selectedAssignments.clear();renderAssignments();updateSelectionButtons();};

async function deleteSelected(set,label){
  const ids=[...set];if(!ids.length)return;
  const warning=label==='dissertation'?' Any secure assignment containing a deleted dissertation will be updated, and an empty assignment will be revoked.':'';
  if(!confirm(`Permanently delete ${ids.length} selected ${label} submission${ids.length===1?'':'s'} and their stored files?${warning}\n\nThis cannot be undone.`))return;
  try{const res=await fetch(`${apiBase}/submissions/delete-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not delete the selected submissions.');set.clear();await load();alert(`${data.deleted} submission${data.deleted===1?'':'s'} deleted.`);}catch(e){alert(e.message||'Could not delete the selected submissions.');}
}
window.deleteOneSubmission=async(id,label='submission')=>{if(!confirm(`Permanently delete this ${label} and its stored files? This cannot be undone.`))return;try{const res=await fetch(`${apiBase}/submissions/${encodeURIComponent(id)}`,{method:'DELETE'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not delete the submission.');selectedProject.delete(id);selectedDissertations.delete(id);selectedAssessors.delete(id);if(dialog.open)dialog.close();await load();}catch(e){alert(e.message||'Could not delete the submission.');}};
document.getElementById('deleteSelectedProject').onclick=()=>deleteSelected(selectedProject,'project work');
document.getElementById('deleteSelectedDissertations').onclick=()=>deleteSelected(selectedDissertations,'dissertation');
document.getElementById('deleteSelectedAssessors').onclick=()=>deleteSelected(selectedAssessors,'assessment');

document.getElementById('deleteSelectedAssignments').onclick=async()=>{
  const ids=[...selectedAssignments];if(!ids.length)return;
  if(!confirm(`Permanently delete ${ids.length} dissertation assignment record${ids.length===1?'':'s'}? Any secure link for a deleted assignment will immediately stop working. This does not delete the dissertation submissions.`))return;
  try{
    const res=await fetch(`${apiBase}/dissertation-assignments/delete-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not delete the selected assignment records.');
    selectedAssignments.clear();await load();alert(`${data.deleted} assignment record${data.deleted===1?'':'s'} deleted.`);
  }catch(e){alert(e.message||'Could not delete the selected assignment records.');}
};

document.getElementById('downloadSelectedDissertations').onclick=async()=>{if(!selectedDissertations.size)return;const btn=document.getElementById('downloadSelectedDissertations'),old=btn.innerHTML;btn.disabled=true;btn.textContent='Preparing ZIP…';try{const res=await fetch(`${apiBase}/dissertations/download-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selectedDissertations]})});if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Could not create ZIP file.');}const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${department}-selected-dissertations.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message||'Could not download selected dissertations.');}finally{btn.innerHTML=old;updateSelectionButtons();}};

document.getElementById('emailSelectedDissertations').onclick=()=>{if(!selectedDissertations.size)return;const rows=[...selectedDissertations].map(id=>submissions.find(s=>s.id===id)).filter(Boolean);if(rows.some(s=>Number(s.assignmentCount||0)>=3)){alert('At least one selected dissertation has already reached the maximum of 3 assessors.');return;}document.getElementById('assignmentSelectionCount').textContent=`${selectedDissertations.size} dissertation${selectedDissertations.size===1?'':'s'} selected`;const st=document.getElementById('assignmentFormStatus');st.classList.add('hidden');st.textContent='';assignmentDialog.showModal();};
function closeAssignmentDialog(){if(assignmentDialog.open)assignmentDialog.close();}
document.getElementById('closeAssignmentDialog').onclick=closeAssignmentDialog;document.getElementById('cancelAssignment').onclick=closeAssignmentDialog;assignmentDialog.addEventListener('click',e=>{if(e.target===assignmentDialog)closeAssignmentDialog();});
assignmentForm.addEventListener('submit',async e=>{e.preventDefault();if(!selectedDissertations.size)return;const btn=document.getElementById('sendAssignment'),status=document.getElementById('assignmentFormStatus'),old=btn.textContent;btn.disabled=true;btn.textContent='Creating secure link & sending…';status.classList.add('hidden');status.classList.remove('error','success');try{const payload={ids:[...selectedDissertations],assessorTitle:document.getElementById('assignmentAssessorTitle').value.trim(),assessorFirstName:document.getElementById('assignmentAssessorFirstName').value.trim(),assessorLastName:document.getElementById('assignmentAssessorLastName').value.trim(),assessorEmail:document.getElementById('assignmentAssessorEmail').value.trim(),expiryDays:Number(document.getElementById('assignmentExpiryDays').value||14),message:document.getElementById('assignmentMessage').value.trim()};const res=await fetch(`${apiBase}/dissertation-assignments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not email the dissertation assignment.');selectedDissertations.clear();assignmentForm.reset();document.getElementById('assignmentExpiryDays').value='14';closeAssignmentDialog();await load();alert(`Secure dissertation link sent to ${data.assignment.assessorEmail}.`);}catch(err){status.textContent=err.message||'Could not send the dissertation assignment.';status.classList.remove('hidden');status.classList.add('error');try{const r=await fetch(`${apiBase}/dissertation-assignments`);if(r.ok){dissertationAssignments=await r.json();renderAssignments();}}catch{}}finally{btn.disabled=false;btn.textContent=old;}});

window.revokeAssignment=async id=>{if(!confirm('Revoke this secure dissertation link? The assessor will no longer be able to use it.'))return;try{const res=await fetch(`${apiBase}/dissertation-assignments/${encodeURIComponent(id)}/revoke`,{method:'POST'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not revoke the link.');await load();}catch(e){alert(e.message||'Could not revoke the link.');}};
window.resendAssignment=async id=>{const a=dissertationAssignments.find(x=>x.id===id);if(!a)return;const days=prompt('How many days should the new secure link remain valid?','14');if(days===null)return;const expiryDays=Math.min(60,Math.max(1,Number.parseInt(days,10)||14));if(!confirm(`Generate a new secure link and email it to ${a.assessorEmail}? The previous link will stop working.`))return;try{const res=await fetch(`${apiBase}/dissertation-assignments/${encodeURIComponent(id)}/resend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiryDays})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not resend the secure link.');await load();alert(`A new secure link was sent to ${data.assignment.assessorEmail}.`);}catch(e){alert(e.message||'Could not resend the secure link.');try{await load()}catch{}}};

if(dissertationSort)dissertationSort.addEventListener('change',renderDissertations);

const tabButtons=[...document.querySelectorAll('.admin-tab')];
const tabPanels=[...document.querySelectorAll('.admin-tab-panel')];
function activateAdminTab(tab){
  const valid=['project','dissertation','assessor'].filter(t=>can(sectionMap[t],'viewer'));if(!valid.includes(tab))tab=valid[0]||'project';
  tabButtons.forEach(b=>{const active=b.dataset.tab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');});
  tabPanels.forEach(p=>p.classList.toggle('hidden',p.dataset.tabPanel!==tab));
  if(location.hash!==`#${tab}`)history.replaceState(null,'',`${location.pathname}${location.search}#${tab}`);
}
tabButtons.forEach(b=>b.addEventListener('click',()=>activateAdminTab(b.dataset.tab)));
activateAdminTab((location.hash||'').replace('#','')||'project');

if(search)search.addEventListener('input',render);
function item(labelTxt,value){return value!==undefined&&value!==null&&String(value)!==''?`<div class="detail-item"><span>${esc(labelTxt)}</span><strong>${esc(value)}</strong></div>`:''}
function fileLink(s,kind,labelTxt,file,index=''){return file?`<a href="${apiBase}/submissions/${s.id}/files/${kind}${index!==''?`/${index}`:''}">${esc(labelTxt)} · ${esc(file.originalName||'Download')}</a>`:''}
function fileLinks(s,kind,labelTxt,value){const list=Array.isArray(value)?value:(value?[value]:[]);return list.map((f,i)=>fileLink(s,kind,`${labelTxt} ${list.length>1?i+1:''}`.trim(),f,Array.isArray(value)?i:'')).join('')}
function workFileLink(s,workIndex,kind,labelTxt,file){return file?`<a href="${apiBase}/submissions/${s.id}/works/${workIndex}/files/${kind}">${esc(labelTxt)} · ${esc(file.originalName||'Download')}</a>`:''}
function feedbackLabel(state){return {'not-forwarded':'Not forwarded','sent':'Forwarded, awaiting download','downloaded':'Downloaded by student','pending':'Sending','email-failed':'Email failed','expired':'Link expired','revoked':'Revoked','unavailable':'No matching student email'}[state]||state;}
function assessmentWorksHtml(s,summary){
  if(!Array.isArray(s.works)||!s.works.length)return '';
  const infos=summary?.feedbackStates||[];
  return `<div class="feedback-legend"><span class="feedback-chip feedback-not-forwarded">Red</span> not forwarded <span class="feedback-chip feedback-sent">Amber</span> forwarded / awaiting download <span class="feedback-chip feedback-downloaded">Green</span> downloaded</div><div class="assessment-admin-list">${s.works.map((w,i)=>{const info=infos[i]||{state:w.feedback?.downloadedAt?'downloaded':w.feedback?.sentAt?'sent':w.feedback?.emailStatus==='failed'?'email-failed':'not-forwarded',email:w.feedback?.recipientEmail||''};const state=info.state||'not-forwarded';const canForward=can('assessor','officer')&&state!=='unavailable';return `<section class="assessment-admin-work"><div class="assessment-admin-head"><div><span>Work ${esc(w.workNo||i+1)}</span><h4>${esc(w.studentName||`${w.studentFirstName||''} ${w.studentLastName||''}`.trim())}</h4></div><strong>${esc(w.indexNumber||'')}</strong></div><div class="detail-grid">${item('Student First Name',w.studentFirstName)}${item('Student Surname',w.studentLastName)}${item('Index Number',w.indexNumber)}${item('Programme',w.programme)}${item('Student Email',info.email||'No matching dissertation email')}</div><div class="feedback-control feedback-box-${esc(state)}"><span class="feedback-status"><i></i>${esc(feedbackLabel(state))}</span>${w.feedback?.sentAt?`<small>Sent: ${esc(fmt(w.feedback.sentAt))}</small>`:''}${w.feedback?.downloadedAt?`<small>Downloaded: ${esc(fmt(w.feedback.downloadedAt))}</small>`:''}${w.feedback?.lastEmailError?`<small class="error-text">${esc(w.feedback.lastEmailError)}</small>`:''}<div class="files">${canForward?`<button class="btn small email" type="button" onclick="forwardFeedback('${esc(s.id)}',${i},'${esc(info.email)}','${esc(state)}')">${state==='not-forwarded'||state==='email-failed'||state==='expired'||state==='revoked'?'Forward to Student':'Resend Feedback Link'}</button>`:''}${can('assessor','officer')&&w.feedback&&!['not-forwarded','unavailable','revoked'].includes(state)?`<button class="btn small danger" type="button" onclick="revokeFeedback('${esc(s.id)}',${i})">Revoke Link</button>`:''}</div></div><div class="file-list work-file-list">${workFileLink(s,i,'reportFile','Assessment report',w.files?.reportFile)}${workFileLink(s,i,'claimForm','Claim form',w.files?.claimForm)}${workFileLink(s,i,'dissertationFile','Reviewed dissertation',w.files?.dissertationFile)||'<span class="optional-missing">No reviewed dissertation uploaded</span>'}</div></section>`;}).join('')}</div>`;
}
window.forwardFeedback=async(id,workIndex,email,state)=>{if(!email)return alert('No matching student email was found from the dissertation submission.');if(!confirm(`${state==='not-forwarded'?'Forward':'Send a new secure feedback link for'} this assessment report${state==='not-forwarded'?'':' again'} to ${email}?`))return;try{const r=await fetch(`${apiBase}/submissions/${encodeURIComponent(id)}/works/${workIndex}/forward-to-student`,{method:'POST'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not forward the feedback.');alert(`Assessment feedback link sent to ${d.email}.`);if(dialog.open)dialog.close();await load();}catch(e){alert(e.message||'Could not forward the feedback.');}};
window.revokeFeedback=async(id,workIndex)=>{if(!confirm('Revoke this student feedback link?'))return;try{const r=await fetch(`${apiBase}/submissions/${encodeURIComponent(id)}/works/${workIndex}/revoke-feedback`,{method:'POST'}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not revoke the feedback link.');if(dialog.open)dialog.close();await load();}catch(e){alert(e.message||'Could not revoke the feedback link.');}};
window.showDetail=async id=>{
  const r=await fetch(`${apiBase}/submissions/${id}`),s=await r.json();
  if(!r.ok){alert(s.error||'Record unavailable.');return;}
  document.getElementById('detailReference').textContent=s.reference||'';
  let details='',files='',workGroups='';
  if((s.portalType||'project-work')==='project-work'){
    const summary=submissions.find(x=>x.id===s.id);details=item('Supervisor / Examiner',s.fullName)+item('First Name',s.firstName)+item('Surname',s.lastName)+item('Phone',s.phone)+item('Email',s.email)+item('Study Centre',s.studyCentre)+item('Groups / Candidates',s.groupCount)+item('Score rows extracted',summary?.scoreRows??s.scoreSheet?.rowCount);
    files=fileLink(s,'claimForm','Claim form',s.files?.claimForm)+fileLink(s,'reportFile','Report',s.files?.reportFile)+fileLink(s,'scoresFile','Original score sheet',s.files?.scoresFile)+(s.files?.completedWork||[]).map((f,i)=>fileLink(s,'completedWork','Project work',f,i)).join('')+`<a href="${apiBase}/submissions/${s.id}/scores.xlsx"><strong>Download clean scores for this submission</strong></a>`;
  }else if(s.portalType==='dissertation'){
    details=item('Submission Type',s.submissionType==='revised'?'Revised Submission':'Fresh Submission')+item('Student Name',s.studentName)+item('Index Number',s.indexNumber)+item('Phone',s.phone)+item('Email',s.email)+item('Supervisor',s.supervisorName)+item('Programme',s.programme)+item('Dissertation Title',s.dissertationTopic)+item('Title Validation',s.titleValidation?.matched?'Matched uploaded work':'Legacy / not recorded');
    files=fileLink(s,'dissertationFile',s.submissionType==='revised'?'Revised Dissertation':'Dissertation',s.files?.dissertationFile)+fileLinks(s,'reviewerResponses',"Reviewers' response",s.files?.reviewerResponses);
  }else{
    details=item('Assessor',s.assessorName)+item('First Name',s.assessorFirstName)+item('Surname',s.assessorLastName)+item('Phone',s.phone)+item('Email',s.email)+item('Number of Reports / Works',s.workCount||1);
    if(Array.isArray(s.works)&&s.works.length){const summary=submissions.find(x=>x.id===s.id);workGroups=assessmentWorksHtml(s,summary);}else{
      details+=item('Student Name(s)',s.studentName)+item('Index Number(s)',s.indexNumber)+item('Programme',s.programme);
      files=fileLinks(s,'reportFile','Assessment report',s.files?.reportFile)+fileLinks(s,'claimForm','Claim form',s.files?.claimForm)+fileLinks(s,'dissertationFile','Dissertation',s.files?.dissertationFile);
    }
  }
  document.getElementById('detailBody').innerHTML=`<div class="detail"><div class="detail-grid">${item('Department',s.departmentName)}${item('Submitted',fmt(s.submittedAt))}${details}</div>${workGroups||`<h3>Submitted files</h3><div class="file-list">${files||'<span>No file available.</span>'}</div>`}<div class="dialog-actions">${can(s.portalType||'project-work','administrator')?`<button class="btn danger" type="button" onclick="deleteOneSubmission('${esc(s.id)}','submission')">Delete Submission</button>`:''}</div></div>`;
  dialog.showModal();
};
document.getElementById('closeDialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
load().catch(e=>{console.error(e);document.body.insertAdjacentHTML('beforeend','<div class="fatal">Could not load department submissions. Check your administrator credentials and deployment settings.</div>');});
