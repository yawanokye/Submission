const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const portalLabels={'project-work':'Undergraduate Project Work','field-experience':'Field Experience Scores','dissertation':'Dissertation','assessor':'Assessment/Vetting Reports'};
const deptLabels={'education':'Education','business':'Business','arts-social-sciences':'Arts & Social Sciences','science-mathematics':'Science & Mathematics'};
const roleLabels={viewer:'Viewer',officer:'Officer',administrator:'Administrator'};
const fmt=d=>d?new Date(d).toLocaleString():'Built-in';
function size(n){n=Number(n||0);if(!n)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;return `${(n/1048576).toFixed(1)} MB`;}
async function getJson(url,opt){const r=await fetch(url,opt),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed.');return d;}
async function loadResources(){const data=await getJson('/api/developer/resources');document.getElementById('resourceCount').textContent=data.length;document.getElementById('resourceRows').innerHTML=data.map((r,i)=>`<tr><td>${i+1}</td><td><span class="resource-title">${esc(r.title)}${r.builtIn?'<span class="builtin">BUILT-IN</span>':''}</span>${r.description?`<span class="resource-desc">${esc(r.description)}</span>`:''}</td><td>${esc(r.originalName)}${r.size?`<br><small>${esc(size(r.size))}</small>`:''}</td><td>${(r.portals||[]).map(p=>`<span class="tag">${esc(portalLabels[p]||p)}</span>`).join('')}</td><td>${esc(fmt(r.uploadedAt))}</td><td><a class="download" href="${esc(r.downloadUrl)}">Download</a>${r.canDelete?` <button class="danger" onclick="removeResource('${esc(r.id)}')">Delete</button>`:''}</td></tr>`).join('');}
function accountState(a){
  if(!a.active)return {label:'Disabled',cls:'inactive-pill',detail:''};
  if(a.passwordSet)return {label:'Ready',cls:'active-pill',detail:a.passwordSetAt?`Password set ${fmt(a.passwordSetAt)}`:''};
  if(a.invitationEmailStatus==='failed')return {label:'Email failed',cls:'failed-pill',detail:a.invitationLastError||''};
  if(a.invitationExpired)return {label:'Invite expired',cls:'expired-pill',detail:a.invitationExpiresAt?`Expired ${fmt(a.invitationExpiresAt)}`:''};
  if(a.invitationEmailStatus==='sent')return {label:'Awaiting setup',cls:'pending-pill',detail:a.invitationExpiresAt?`Expires ${fmt(a.invitationExpiresAt)}`:''};
  return {label:'Invitation pending',cls:'pending-pill',detail:''};
}
async function loadAdmins(){
  const data=await getJson('/api/developer/admin-users');
  document.getElementById('adminCount').textContent=data.length;
  document.getElementById('adminRows').innerHTML=data.map((a,i)=>{
    const state=accountState(a);
    const inviteLabel=a.passwordSet?'Send Password Reset':'Resend Invite';
    const inviteButton=a.email?`<button class="secondary compact" onclick="sendAdminInvite('${esc(a.id)}')">${inviteLabel}</button>`:'';
    return `<tr><td>${i+1}</td><td><strong>${esc(a.name)}</strong><br><small>${esc(a.email||'')}</small><br><small>Username: ${esc(a.username)}</small></td><td><span class="role role-${esc(a.role)}">${esc(roleLabels[a.role]||a.role)}</span></td><td>${(a.departments||[]).map(x=>`<span class="tag">${esc(deptLabels[x]||x)}</span>`).join('')}</td><td>${(a.sections||[]).map(x=>`<span class="tag">${esc(portalLabels[x]||x)}</span>`).join('')}</td><td><span class="${state.cls}">${esc(state.label)}</span>${state.detail?`<span class="status-detail">${esc(state.detail)}</span>`:''}</td><td><div class="button-row">${inviteButton}<button class="secondary compact" onclick="toggleAdmin('${esc(a.id)}',${a.active?'false':'true'})">${a.active?'Disable':'Enable'}</button><button class="danger compact" onclick="deleteAdmin('${esc(a.id)}')">Delete</button></div></td></tr>`;
  }).join('');
}
async function loadCentres(){const data=await getJson('/api/developer/study-centres');document.getElementById('centreCount').textContent=data.length;document.getElementById('centreTags').innerHTML=data.map(c=>`<span class="centre-tag">${esc(c)}</span>`).join('');}
async function loadAll(){await Promise.all([loadResources(),loadAdmins(),loadCentres()]);}
const resourceForm=document.getElementById('resourceForm'),resourceStatus=document.getElementById('resourceStatus'),uploadBtn=document.getElementById('uploadBtn');
resourceForm.addEventListener('submit',async e=>{e.preventDefault();if(!resourceForm.querySelector('input[name="portals"]:checked')){resourceStatus.className='status bad';resourceStatus.textContent='Select at least one portal.';return;}uploadBtn.disabled=true;try{await getJson('/api/developer/resources',{method:'POST',body:new FormData(resourceForm)});resourceForm.reset();resourceStatus.className='status ok';resourceStatus.textContent='Resource published.';await loadResources();}catch(e){resourceStatus.className='status bad';resourceStatus.textContent=e.message;}finally{uploadBtn.disabled=false;}});
window.removeResource=async id=>{if(!confirm('Delete this resource?'))return;try{await getJson(`/api/developer/resources/${encodeURIComponent(id)}`,{method:'DELETE'});await loadResources();}catch(e){alert(e.message);}};
const adminForm=document.getElementById('adminForm'),adminStatus=document.getElementById('adminStatus'),createAdminBtn=document.getElementById('createAdminBtn');
adminForm.addEventListener('submit',async e=>{
  e.preventDefault();const fd=new FormData(adminForm),payload={name:fd.get('name'),email:fd.get('email'),username:fd.get('username'),role:fd.get('role'),departments:fd.getAll('departments'),sections:fd.getAll('sections')};
  if(!payload.departments.length||!payload.sections.length){adminStatus.className='status bad';adminStatus.textContent='Select at least one department and one submission section.';return;}
  createAdminBtn.disabled=true;
  try{
    const d=await getJson('/api/developer/admin-users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    adminForm.reset();adminStatus.className=d.emailSent?'status ok':'status warn';adminStatus.textContent=d.emailSent?'Administrator account created and a one-time password setup link was emailed.':(d.warning||'Administrator account created, but the invitation email was not sent. Use Resend Invite after correcting the email configuration.');await loadAdmins();
  }catch(e){adminStatus.className='status bad';adminStatus.textContent=e.message;}finally{createAdminBtn.disabled=false;}
});
window.sendAdminInvite=async id=>{if(!confirm('Send a new one-time password setup link to this administrator? Any earlier setup link will stop working.'))return;try{await getJson(`/api/developer/admin-users/${id}/resend-invitation`,{method:'POST'});adminStatus.className='status ok';adminStatus.textContent='A new one-time password setup link was emailed.';await loadAdmins();}catch(e){adminStatus.className='status bad';adminStatus.textContent=e.message;await loadAdmins().catch(()=>{});}};
window.deleteAdmin=async id=>{if(!confirm('Delete this administrator account?'))return;try{await getJson(`/api/developer/admin-users/${id}`,{method:'DELETE'});await loadAdmins();}catch(e){alert(e.message);}};
window.toggleAdmin=async(id,active)=>{try{await getJson(`/api/developer/admin-users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({active})});await loadAdmins();}catch(e){alert(e.message);}};
const centreForm=document.getElementById('centreForm'),centreStatus=document.getElementById('centreStatus'),uploadCentresBtn=document.getElementById('uploadCentresBtn');
centreForm.addEventListener('submit',async e=>{e.preventDefault();uploadCentresBtn.disabled=true;try{const d=await getJson('/api/developer/study-centres',{method:'POST',body:new FormData(centreForm)});centreForm.reset();centreStatus.className='status ok';centreStatus.textContent=`Study-centre list updated. ${d.count} centres are now available.`;await loadCentres();}catch(e){centreStatus.className='status bad';centreStatus.textContent=e.message;}finally{uploadCentresBtn.disabled=false;}});
document.getElementById('resetCentres').onclick=async()=>{if(!confirm('Restore the default study-centre list?'))return;try{await getJson('/api/developer/study-centres/reset',{method:'POST'});centreStatus.className='status ok';centreStatus.textContent='Default study centres restored.';await loadCentres();}catch(e){centreStatus.className='status bad';centreStatus.textContent=e.message;}};
document.getElementById('refreshResources').onclick=()=>loadResources().catch(e=>alert(e.message));document.getElementById('refreshAdmins').onclick=()=>loadAdmins().catch(e=>alert(e.message));
loadAll().catch(e=>{console.error(e);resourceStatus.className='status bad';resourceStatus.textContent=e.message||'Could not load developer data.';});
