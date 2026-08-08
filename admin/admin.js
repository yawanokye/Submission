const department = location.pathname.split('/').filter(Boolean)[1] || '';
const apiBase = `/api/admin/${encodeURIComponent(department)}`;
let submissions=[];
let dissertationAssignments=[];
const selectedProject=new Set();
const selectedDissertations=new Set();
const selectedAssessors=new Set();
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
  const info=await infoRes.json(); submissions=await subRes.json(); dissertationAssignments=await assignRes.json(); const s=await sumRes.json();
  pruneSet(selectedProject,new Set(byType('project-work').map(x=>x.id)));
  pruneSet(selectedDissertations,new Set(byType('dissertation').map(x=>x.id)));
  pruneSet(selectedAssessors,new Set(byType('assessor').map(x=>x.id)));
  document.getElementById('departmentName').textContent=info.departmentName;
  document.title=`${info.departmentName} · Submission Administration`;
  for(const k of ['total','project','dissertation','assessor','scoreRows'])document.getElementById(k).textContent=s[k]??0;
  document.getElementById('projectScoresLink').href=`${apiBase}/export/project-scores.xlsx`;
  document.getElementById('projectMasterLink').href=`${apiBase}/export/project-master.xlsx`;
  document.getElementById('projectRegisterLink').href=`${apiBase}/export/project-register.xlsx`;
  document.getElementById('dissertationRegisterLink').href=`${apiBase}/export/dissertation-register.xlsx`;
  render();
}

function render(){renderProject();renderDissertations();renderAssignments();renderAssessors();updateSelectionButtons();}

function renderProject(){
  const rows=byType('project-work').filter(matchesSearch),tbody=document.getElementById('projectRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.name)}<br><small>${esc(s.email)}</small></td><td>${esc(s.studyCentre)}</td><td>${esc(s.scoreRows)}</td><td>${esc(fmt(s.submittedAt))}</td><td class="select-cell"><input class="row-check project-check" type="checkbox" data-id="${esc(s.id)}" ${selectedProject.has(s.id)?'checked':''}></td><td><div class="files"><a class="btn small" href="${apiBase}/submissions/${s.id}/files/scoresFile">Original Scores</a><a class="btn small" href="${apiBase}/submissions/${s.id}/scores.xlsx">Clean Scores</a><button class="btn small" onclick="showDetail('${s.id}')">View Record</button><button class="btn small danger" onclick="deleteOneSubmission('${s.id}','project work')">Delete</button></div></td></tr>`).join('');
  document.getElementById('projectEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.project-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedProject.add(cb.dataset.id):selectedProject.delete(cb.dataset.id);updateSelectionButtons();}));
}

function assessorCounter(s){
  const count=Number(s.assignmentCount||0),limit=Number(s.assignmentLimit||3);
  const names=(s.assignedAssessors||[]).map(a=>a.name||a.email).filter(Boolean);
  const cls=count>=limit?'counter-full':count===0?'counter-empty':'counter-used';
  return `<span class="assignment-counter ${cls}" title="${esc(names.join(', ')||'No assessor assigned')}">${count} / ${limit}</span>${names.length?`<small class="assessor-list">${esc(names.join(', '))}</small>`:''}`;
}
function renderDissertations(){
  const rows=byType('dissertation').filter(matchesSearch),tbody=document.getElementById('dissertationRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.studentName||s.name)}</td><td><span class="ref">${esc(s.indexNumber)}</span></td><td class="title-cell">${esc(s.dissertationTopic)}${s.titleValidated?'<br><small class="validated-text">✓ Title validated</small>':''}</td><td>${esc(s.programme)}</td><td>${esc(s.supervisorName||s.secondaryName)}</td><td>${assessorCounter(s)}</td><td class="select-cell"><input class="row-check dissertation-check" type="checkbox" data-id="${esc(s.id)}" ${selectedDissertations.has(s.id)?'checked':''}></td><td><div class="files"><a class="btn small primary" href="${apiBase}/submissions/${s.id}/files/dissertationFile">Download</a><button class="btn small" onclick="showDetail('${s.id}')">View</button><button class="btn small danger" onclick="deleteOneSubmission('${s.id}','dissertation')">Delete</button></div></td></tr>`).join('');
  document.getElementById('dissertationEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.dissertation-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedDissertations.add(cb.dataset.id):selectedDissertations.delete(cb.dataset.id);updateSelectionButtons();}));
}

function assignmentStatusBadge(a){const labelMap={'sent':'Sent','downloaded':'Downloaded','expired':'Expired','revoked':'Revoked','email-failed':'Email failed','pending':'Pending'};const label=labelMap[a.status]||a.status||'Pending';return `<span class="status-badge status-${esc(a.status||'pending')}">${esc(label)}</span>`;}
function renderAssignments(){
  const tbody=document.getElementById('assignmentRows'),rows=dissertationAssignments;
  tbody.innerHTML=rows.map((a,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(a.reference)}</span></td><td>${esc(a.assessorName)}</td><td>${esc(a.assessorEmail)}</td><td>${esc(a.dissertationCount)}</td><td>${a.sentAt?esc(fmt(a.sentAt)):'<small>Not sent</small>'}</td><td>${esc(fmt(a.expiresAt))}</td><td>${assignmentStatusBadge(a)}</td><td>${a.downloadedAt?`${esc(fmt(a.downloadedAt))}<br><small>${esc(a.downloadCount)} download${Number(a.downloadCount)===1?'':'s'}</small>`:'<small>Not downloaded</small>'}</td><td><div class="files"><button class="btn small" type="button" onclick="resendAssignment('${esc(a.id)}')">Resend Link</button>${a.status!=='revoked'?`<button class="btn small danger" type="button" onclick="revokeAssignment('${esc(a.id)}')">Revoke</button>`:''}</div>${a.lastEmailError?`<small class="error-text">${esc(a.lastEmailError)}</small>`:''}</td></tr>`).join('');
  document.getElementById('assignmentEmpty').classList.toggle('hidden',rows.length>0);
}

function renderAssessors(){
  const rows=byType('assessor').filter(matchesSearch),tbody=document.getElementById('assessorRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.assessorName||s.name)}</td><td>${esc(s.workCount||1)}</td><td class="title-cell">${esc(s.studentName||s.secondaryName)}</td><td>${esc(s.indexNumber)}</td><td>${esc(s.programme)}</td><td>${esc(fmt(s.submittedAt))}</td><td class="select-cell"><input class="row-check assessor-check" type="checkbox" data-id="${esc(s.id)}" ${selectedAssessors.has(s.id)?'checked':''}></td><td><div class="files"><button class="btn small primary" onclick="showDetail('${s.id}')">View / Download Files</button><button class="btn small danger" onclick="deleteOneSubmission('${s.id}','assessment submission')">Delete</button></div></td></tr>`).join('');
  document.getElementById('assessorEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.assessor-check').forEach(cb=>cb.addEventListener('change',()=>{cb.checked?selectedAssessors.add(cb.dataset.id):selectedAssessors.delete(cb.dataset.id);updateSelectionButtons();}));
}

function updateSelectionButtons(){
  const p=selectedProject.size,d=selectedDissertations.size,a=selectedAssessors.size;
  document.getElementById('projectSelectedCount').textContent=`(${p})`;document.getElementById('deleteSelectedProject').disabled=p===0;
  document.getElementById('selectedCount').textContent=`(${d})`;document.getElementById('downloadSelectedDissertations').disabled=d===0;document.getElementById('deleteSelectedDissertations').disabled=d===0;
  const selectedRows=[...selectedDissertations].map(id=>submissions.find(s=>s.id===id)).filter(Boolean);const atLimit=selectedRows.some(s=>Number(s.assignmentCount||0)>=3);
  const emailBtn=document.getElementById('emailSelectedDissertations');emailBtn.disabled=d===0||atLimit;emailBtn.title=atLimit?'At least one selected dissertation already has 3 assessors.':'';
  document.getElementById('assessorSelectedCount').textContent=`(${a})`;document.getElementById('deleteSelectedAssessors').disabled=a===0;
}

document.getElementById('selectAllProject').onclick=()=>{byType('project-work').filter(matchesSearch).forEach(s=>selectedProject.add(s.id));renderProject();updateSelectionButtons();};
document.getElementById('clearProject').onclick=()=>{selectedProject.clear();renderProject();updateSelectionButtons();};
document.getElementById('selectAllDissertations').onclick=()=>{byType('dissertation').filter(matchesSearch).forEach(s=>selectedDissertations.add(s.id));renderDissertations();updateSelectionButtons();};
document.getElementById('clearDissertations').onclick=()=>{selectedDissertations.clear();renderDissertations();updateSelectionButtons();};
document.getElementById('selectAllAssessors').onclick=()=>{byType('assessor').filter(matchesSearch).forEach(s=>selectedAssessors.add(s.id));renderAssessors();updateSelectionButtons();};
document.getElementById('clearAssessors').onclick=()=>{selectedAssessors.clear();renderAssessors();updateSelectionButtons();};

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

document.getElementById('downloadSelectedDissertations').onclick=async()=>{if(!selectedDissertations.size)return;const btn=document.getElementById('downloadSelectedDissertations'),old=btn.innerHTML;btn.disabled=true;btn.textContent='Preparing ZIP…';try{const res=await fetch(`${apiBase}/dissertations/download-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selectedDissertations]})});if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Could not create ZIP file.');}const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${department}-selected-dissertations.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){alert(e.message||'Could not download selected dissertations.');}finally{btn.innerHTML=old;updateSelectionButtons();}};

document.getElementById('emailSelectedDissertations').onclick=()=>{if(!selectedDissertations.size)return;const rows=[...selectedDissertations].map(id=>submissions.find(s=>s.id===id)).filter(Boolean);if(rows.some(s=>Number(s.assignmentCount||0)>=3)){alert('At least one selected dissertation has already reached the maximum of 3 assessors.');return;}document.getElementById('assignmentSelectionCount').textContent=`${selectedDissertations.size} dissertation${selectedDissertations.size===1?'':'s'} selected`;const st=document.getElementById('assignmentFormStatus');st.classList.add('hidden');st.textContent='';assignmentDialog.showModal();};
function closeAssignmentDialog(){if(assignmentDialog.open)assignmentDialog.close();}
document.getElementById('closeAssignmentDialog').onclick=closeAssignmentDialog;document.getElementById('cancelAssignment').onclick=closeAssignmentDialog;assignmentDialog.addEventListener('click',e=>{if(e.target===assignmentDialog)closeAssignmentDialog();});
assignmentForm.addEventListener('submit',async e=>{e.preventDefault();if(!selectedDissertations.size)return;const btn=document.getElementById('sendAssignment'),status=document.getElementById('assignmentFormStatus'),old=btn.textContent;btn.disabled=true;btn.textContent='Creating secure link & sending…';status.classList.add('hidden');status.classList.remove('error','success');try{const payload={ids:[...selectedDissertations],assessorTitle:document.getElementById('assignmentAssessorTitle').value.trim(),assessorFirstName:document.getElementById('assignmentAssessorFirstName').value.trim(),assessorLastName:document.getElementById('assignmentAssessorLastName').value.trim(),assessorEmail:document.getElementById('assignmentAssessorEmail').value.trim(),expiryDays:Number(document.getElementById('assignmentExpiryDays').value||14),message:document.getElementById('assignmentMessage').value.trim()};const res=await fetch(`${apiBase}/dissertation-assignments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not email the dissertation assignment.');selectedDissertations.clear();assignmentForm.reset();document.getElementById('assignmentExpiryDays').value='14';closeAssignmentDialog();await load();alert(`Secure dissertation link sent to ${data.assignment.assessorEmail}.`);}catch(err){status.textContent=err.message||'Could not send the dissertation assignment.';status.classList.remove('hidden');status.classList.add('error');try{const r=await fetch(`${apiBase}/dissertation-assignments`);if(r.ok){dissertationAssignments=await r.json();renderAssignments();}}catch{}}finally{btn.disabled=false;btn.textContent=old;}});

window.revokeAssignment=async id=>{if(!confirm('Revoke this secure dissertation link? The assessor will no longer be able to use it.'))return;try{const res=await fetch(`${apiBase}/dissertation-assignments/${encodeURIComponent(id)}/revoke`,{method:'POST'});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not revoke the link.');await load();}catch(e){alert(e.message||'Could not revoke the link.');}};
window.resendAssignment=async id=>{const a=dissertationAssignments.find(x=>x.id===id);if(!a)return;const days=prompt('How many days should the new secure link remain valid?','14');if(days===null)return;const expiryDays=Math.min(60,Math.max(1,Number.parseInt(days,10)||14));if(!confirm(`Generate a new secure link and email it to ${a.assessorEmail}? The previous link will stop working.`))return;try{const res=await fetch(`${apiBase}/dissertation-assignments/${encodeURIComponent(id)}/resend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiryDays})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'Could not resend the secure link.');await load();alert(`A new secure link was sent to ${data.assignment.assessorEmail}.`);}catch(e){alert(e.message||'Could not resend the secure link.');try{await load()}catch{}}};

if(search)search.addEventListener('input',render);
function item(labelTxt,value){return value!==undefined&&value!==null&&String(value)!==''?`<div class="detail-item"><span>${esc(labelTxt)}</span><strong>${esc(value)}</strong></div>`:''}
function fileLink(s,kind,labelTxt,file,index=''){return file?`<a href="${apiBase}/submissions/${s.id}/files/${kind}${index!==''?`/${index}`:''}">${esc(labelTxt)} · ${esc(file.originalName||'Download')}</a>`:''}
function fileLinks(s,kind,labelTxt,value){const list=Array.isArray(value)?value:(value?[value]:[]);return list.map((f,i)=>fileLink(s,kind,`${labelTxt} ${list.length>1?i+1:''}`.trim(),f,Array.isArray(value)?i:'')).join('')}
window.showDetail=async id=>{const r=await fetch(`${apiBase}/submissions/${id}`),s=await r.json();if(!r.ok){alert(s.error||'Record unavailable.');return;}document.getElementById('detailReference').textContent=s.reference||'';let details='',files='';if((s.portalType||'project-work')==='project-work'){details=item('Supervisor / Examiner',s.fullName)+item('First Name',s.firstName)+item('Surname',s.lastName)+item('Phone',s.phone)+item('Email',s.email)+item('Study Centre',s.studyCentre)+item('Groups / Candidates',s.groupCount)+item('Score rows extracted',s.scoreSheet?.rowCount);files=fileLink(s,'claimForm','Claim form',s.files?.claimForm)+fileLink(s,'reportFile','Report',s.files?.reportFile)+fileLink(s,'scoresFile','Original score sheet',s.files?.scoresFile)+(s.files?.completedWork||[]).map((f,i)=>fileLink(s,'completedWork','Project work',f,i)).join('')+`<a href="${apiBase}/submissions/${s.id}/scores.xlsx"><strong>Download clean scores for this submission</strong></a>`;}else if(s.portalType==='dissertation'){details=item('Student Name',s.studentName)+item('Index Number',s.indexNumber)+item('Phone',s.phone)+item('Email',s.email)+item('Supervisor',s.supervisorName)+item('Programme',s.programme)+item('Dissertation Title',s.dissertationTopic)+item('Title Validation',s.titleValidation?.matched?'Matched uploaded work':'Legacy / not recorded');files=fileLink(s,'dissertationFile','Dissertation',s.files?.dissertationFile);}else{details=item('Assessor',s.assessorName)+item('First Name',s.assessorFirstName)+item('Surname',s.assessorLastName)+item('Phone',s.phone)+item('Email',s.email)+item('Number of Works',s.workCount||1)+item('Student Name(s)',s.studentName)+item('Index Number(s)',s.indexNumber)+item('Programme',s.programme);files=fileLinks(s,'reportFile','Assessment report',s.files?.reportFile)+fileLinks(s,'claimForm','Claim form',s.files?.claimForm)+fileLinks(s,'dissertationFile','Dissertation',s.files?.dissertationFile);}document.getElementById('detailBody').innerHTML=`<div class="detail"><div class="detail-grid">${item('Department',s.departmentName)}${item('Submitted',fmt(s.submittedAt))}${details}</div><h3>Submitted files</h3><div class="file-list">${files||'<span>No file available.</span>'}</div><div class="dialog-actions"><button class="btn danger" type="button" onclick="deleteOneSubmission('${esc(s.id)}','submission')">Delete Submission</button></div></div>`;dialog.showModal();};
document.getElementById('closeDialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
load().catch(e=>{console.error(e);document.body.insertAdjacentHTML('beforeend','<div class="fatal">Could not load department submissions. Check your administrator credentials and deployment settings.</div>');});
