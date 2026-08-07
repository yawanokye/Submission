const department = location.pathname.split('/').filter(Boolean)[1] || '';
const apiBase = `/api/admin/${encodeURIComponent(department)}`;
let submissions=[];
const search=document.getElementById('search');
const dialog=document.getElementById('detailDialog');
const selectedDissertations=new Set();

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>{try{return new Date(v).toLocaleString()}catch{return v||''}};
const byType=t=>submissions.filter(s=>s.portalType===t);
const matchesSearch=s=>{
  const q=(search?.value||'').trim().toLowerCase();
  if(!q)return true;
  return [s.reference,s.name,s.secondaryName,s.email,s.phone,s.programme,s.studyCentre,s.studentName,s.indexNumber,s.dissertationTopic,s.supervisorName,s.assessorName].join(' ').toLowerCase().includes(q);
};

async function load(){
  const [infoRes,subRes,sumRes]=await Promise.all([fetch(`${apiBase}/info`),fetch(`${apiBase}/submissions`),fetch(`${apiBase}/summary`)]);
  if(!infoRes.ok||!subRes.ok||!sumRes.ok)throw new Error('Could not load this department portal.');
  const info=await infoRes.json(); submissions=await subRes.json(); const s=await sumRes.json();
  document.getElementById('departmentName').textContent=info.departmentName;
  document.title=`${info.departmentName} · Submission Administration`;
  for(const k of ['total','project','dissertation','assessor','scoreRows'])document.getElementById(k).textContent=s[k]??0;
  document.getElementById('projectScoresLink').href=`${apiBase}/export/project-scores.xlsx`;
  document.getElementById('projectMasterLink').href=`${apiBase}/export/project-master.xlsx`;
  document.getElementById('projectRegisterLink').href=`${apiBase}/export/project-register.xlsx`;
  document.getElementById('dissertationRegisterLink').href=`${apiBase}/export/dissertation-register.xlsx`;
  render();
}

function render(){renderProject();renderDissertations();renderAssessors();updateSelectedCount();}

function renderProject(){
  const rows=byType('project-work').filter(matchesSearch);
  const tbody=document.getElementById('projectRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.name)}<br><small>${esc(s.email)}</small></td><td>${esc(s.studyCentre)}</td><td>${esc(s.scoreRows)}</td><td>${esc(fmt(s.submittedAt))}</td><td><div class="files"><a class="btn small" href="${apiBase}/submissions/${s.id}/files/scoresFile">Original Scores</a><a class="btn small" href="${apiBase}/submissions/${s.id}/scores.xlsx">Clean Scores</a><button class="btn small" onclick="showDetail('${s.id}')">View Record</button></div></td></tr>`).join('');
  document.getElementById('projectEmpty').classList.toggle('hidden',rows.length>0);
}

function renderDissertations(){
  const rows=byType('dissertation').filter(matchesSearch);
  const tbody=document.getElementById('dissertationRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.studentName||s.name)}</td><td><span class="ref">${esc(s.indexNumber)}</span></td><td class="title-cell">${esc(s.dissertationTopic)}</td><td>${esc(s.programme)}</td><td>${esc(s.supervisorName||s.secondaryName)}</td><td class="select-cell"><input class="row-check" type="checkbox" data-id="${esc(s.id)}" aria-label="Select dissertation for ${esc(s.studentName||s.name)}" ${selectedDissertations.has(s.id)?'checked':''}></td><td><div class="files"><a class="btn small primary" href="${apiBase}/submissions/${s.id}/files/dissertationFile">Download</a><button class="btn small" onclick="showDetail('${s.id}')">View</button></div></td></tr>`).join('');
  document.getElementById('dissertationEmpty').classList.toggle('hidden',rows.length>0);
  tbody.querySelectorAll('.row-check').forEach(cb=>cb.addEventListener('change',()=>{if(cb.checked)selectedDissertations.add(cb.dataset.id);else selectedDissertations.delete(cb.dataset.id);updateSelectedCount();}));
}

function renderAssessors(){
  const rows=byType('assessor').filter(matchesSearch);
  const tbody=document.getElementById('assessorRows');
  tbody.innerHTML=rows.map((s,i)=>`<tr><td>${i+1}</td><td><span class="ref">${esc(s.reference)}</span></td><td>${esc(s.assessorName||s.name)}</td><td>${esc(s.workCount||1)}</td><td class="title-cell">${esc(s.studentName||s.secondaryName)}</td><td>${esc(s.indexNumber)}</td><td>${esc(s.programme)}</td><td>${esc(fmt(s.submittedAt))}</td><td><div class="files"><button class="btn small primary" onclick="showDetail('${s.id}')">View / Download Files</button></div></td></tr>`).join('');
  document.getElementById('assessorEmpty').classList.toggle('hidden',rows.length>0);
}

function updateSelectedCount(){
  const n=selectedDissertations.size;
  document.getElementById('selectedCount').textContent=`(${n})`;
  document.getElementById('downloadSelectedDissertations').disabled=n===0;
}

document.getElementById('selectAllDissertations').onclick=()=>{byType('dissertation').filter(matchesSearch).forEach(s=>selectedDissertations.add(s.id));renderDissertations();updateSelectedCount();};
document.getElementById('clearDissertations').onclick=()=>{selectedDissertations.clear();renderDissertations();updateSelectedCount();};
document.getElementById('downloadSelectedDissertations').onclick=async()=>{
  if(!selectedDissertations.size)return;
  const btn=document.getElementById('downloadSelectedDissertations');
  const old=btn.innerHTML; btn.disabled=true; btn.textContent='Preparing ZIP…';
  try{
    const res=await fetch(`${apiBase}/dissertations/download-selected`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selectedDissertations]})});
    if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||'Could not create ZIP file.');}
    const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`${department}-selected-dissertations.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){alert(e.message||'Could not download selected dissertations.');}
  finally{btn.innerHTML=old;updateSelectedCount();}
};

if(search)search.addEventListener('input',render);
function item(labelTxt,value){return value!==undefined&&value!==null&&String(value)!==''?`<div class="detail-item"><span>${esc(labelTxt)}</span><strong>${esc(value)}</strong></div>`:''}
function fileLink(s,kind,labelTxt,file,index=''){return file?`<a href="${apiBase}/submissions/${s.id}/files/${kind}${index!==''?`/${index}`:''}">${esc(labelTxt)} · ${esc(file.originalName||'Download')}</a>`:''}
function fileLinks(s,kind,labelTxt,value){const list=Array.isArray(value)?value:(value?[value]:[]);return list.map((f,i)=>fileLink(s,kind,`${labelTxt} ${list.length>1?i+1:''}`.trim(),f,Array.isArray(value)?i:'')).join('')}

window.showDetail=async id=>{
  const r=await fetch(`${apiBase}/submissions/${id}`); const s=await r.json(); if(!r.ok){alert(s.error||'Record unavailable.');return;}
  document.getElementById('detailReference').textContent=s.reference||''; let details='',files='';
  if((s.portalType||'project-work')==='project-work'){
    details=item('Supervisor / Examiner',s.fullName)+item('Phone',s.phone)+item('Email',s.email)+item('Study Centre',s.studyCentre)+item('Groups / Candidates',s.groupCount)+item('Score rows extracted',s.scoreSheet?.rowCount);
    files=fileLink(s,'claimForm','Claim form',s.files?.claimForm)+fileLink(s,'reportFile','Report',s.files?.reportFile)+fileLink(s,'scoresFile','Original score sheet',s.files?.scoresFile)+(s.files?.completedWork||[]).map((f,i)=>fileLink(s,'completedWork','Project work',f,i)).join('')+`<a href="${apiBase}/submissions/${s.id}/scores.xlsx"><strong>Download clean scores for this submission</strong></a>`;
  }else if(s.portalType==='dissertation'){
    details=item('Student Name',s.studentName)+item('Index Number',s.indexNumber)+item('Phone',s.phone)+item('Email',s.email)+item('Supervisor',s.supervisorName)+item('Programme',s.programme)+item('Dissertation Title',s.dissertationTopic);
    files=fileLink(s,'dissertationFile','Dissertation',s.files?.dissertationFile);
  }else{
    details=item('Assessor',s.assessorName)+item('Phone',s.phone)+item('Email',s.email)+item('Number of Works',s.workCount||1)+item('Student Name(s)',s.studentName)+item('Index Number(s)',s.indexNumber)+item('Programme',s.programme);
    files=fileLinks(s,'reportFile','Assessment report',s.files?.reportFile)+fileLinks(s,'claimForm','Claim form',s.files?.claimForm)+fileLinks(s,'dissertationFile','Dissertation',s.files?.dissertationFile);
  }
  document.getElementById('detailBody').innerHTML=`<div class="detail"><div class="detail-grid">${item('Department',s.departmentName)}${item('Submitted',fmt(s.submittedAt))}${details}</div><h3>Submitted files</h3><div class="file-list">${files||'<span>No file available.</span>'}</div></div>`; dialog.showModal();
};
document.getElementById('closeDialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
load().catch(e=>{console.error(e);document.body.insertAdjacentHTML('beforeend','<div class="fatal">Could not load department submissions. Check your administrator credentials and deployment settings.</div>');});
