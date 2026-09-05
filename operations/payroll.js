const department=location.pathname.split('/').filter(Boolean)[1]||'';
let rows=[];
let identity={};
const roleRank={viewer:1,officer:2,administrator:3};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const fmt=value=>{if(!value)return '';try{return new Date(value).toLocaleString()}catch{return value}};

function showDeveloperPreviewBanner(admin){
  let banner=document.getElementById('developerPreviewBanner');
  if(!admin?.developerPreview){if(banner)banner.remove();return;}
  if(!banner){banner=document.createElement('div');banner.id='developerPreviewBanner';banner.className='developer-preview-banner';document.querySelector('header.topbar')?.insertAdjacentElement('afterend',banner);}
  const label=admin.developerPreviewLabel||admin.name||admin.username||'user';
  const expiry=admin.previewExpiresAt?` · expires ${fmt(admin.previewExpiresAt)}`:'';
  banner.innerHTML=`<div><strong>Developer Preview Mode</strong><span>Viewing as ${esc(label)}${esc(expiry)}. Actions, where permitted, are real and recorded as Developer Preview actions.</span></div><div class="developer-preview-actions"><a href="/developer#preview">Return to Developer Portal</a><button type="button" id="exitDeveloperPreview">Exit Preview</button></div>`;
  banner.querySelector('#exitDeveloperPreview').onclick=async()=>{await fetch('/api/admin-logout',{method:'POST'}).catch(()=>{});location.href='/developer#preview';};
}
async function get(url,options){
  const response=await fetch(url,options),data=await response.json().catch(()=>({}));
  if(response.status===401){location.href=`/admin-login.html?department=${encodeURIComponent(department)}&next=${encodeURIComponent(location.pathname)}`;throw new Error('Authentication required.');}
  if(!response.ok)throw new Error(data.error||'Request failed.');
  return data;
}
function matches(row){
  const query=document.getElementById('search').value.trim().toLowerCase();
  if(!query)return true;
  return [row.reference,row.workType,row.category,row.supervisorName,row.email,row.studyCentres,row.payrollStatusLabel,row.payrollNote].join(' ').toLowerCase().includes(query);
}
function render(){
  const list=rows.filter(matches);
  document.getElementById('count').textContent=list.length;
  document.getElementById('empty').hidden=Boolean(list.length);
  document.getElementById('rows').innerHTML=list.map((row,index)=>`<tr><td>${index+1}</td><td><strong>${esc(row.reference)}</strong><br><small>${esc(row.workType)}</small></td><td>${esc(row.supervisorName)}<br><small>${esc(row.email)}</small></td><td>${esc(row.studyCentres)}</td><td>${esc(fmt(row.approvedAt))}<br><small>${esc(row.approvedBy)}</small></td><td>${esc(row.category)}</td><td>${esc(row.claimedQuantity??row.claimedGroupsRaw)}</td><td>${esc(row.scoreSheetQuantity)}</td><td>${row.supportingWorkCount==null?'Not applicable':esc(row.supportingWorkCount)}</td><td class="${row.validation?.valid?'check-ok':'check-bad'}">${row.validation?.valid?'MATCH':'REQUIRES RECONCILIATION'}</td><td>${row.claimFormPresent?`<button class="btn" onclick="openClaim('${esc(row.id)}','${esc(row.reference)}')">Preview</button>`:'<span class="check-bad">Missing</span>'}</td><td><span class="status ${esc(row.payrollStatus)}">${esc(row.payrollStatusLabel)}</span></td><td class="note">${esc(row.payrollNote||'')}</td><td>${(roleRank[identity.role]||0)>=2?`<div class="actions payroll-row-actions"><button class="btn good" onclick="setStatus('${esc(row.id)}','verified')">Verified</button><button class="btn primary" onclick="setStatus('${esc(row.id)}','approved-for-payment')">Approve for Payment</button><button class="btn good" onclick="setStatus('${esc(row.id)}','paid')">Paid</button><button class="btn warn" onclick="setStatus('${esc(row.id)}','queried')">Query / Hold</button><button class="btn" onclick="setStatus('${esc(row.id)}','pending')">Reset</button></div>`:'Read only'}</td></tr>`).join('');
}
window.openClaim=(id,reference)=>{document.getElementById('claimTitle').textContent=`Claim Form · ${reference}`;document.getElementById('claimFrame').src=`/api/admin/${encodeURIComponent(department)}/submissions/${encodeURIComponent(id)}/claim-preview`;document.getElementById('claimDialog').showModal();};
window.setStatus=async(id,status)=>{
  let note='';
  if(['queried','paid','approved-for-payment'].includes(status)){const entered=prompt(status==='queried'?'Enter query/hold reason:':status==='paid'?'Enter payment reference or note (optional):':'Enter approval note (optional):','');if(entered===null)return;note=entered.trim();}
  try{await get(`/api/payroll/${encodeURIComponent(department)}/claims/${encodeURIComponent(id)}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note})});await load();}catch(error){alert(error.message);}
};
async function load(){
  const [info,data]=await Promise.all([get(`/api/admin/${encodeURIComponent(department)}/info`),get(`/api/payroll/${encodeURIComponent(department)}/claims`)]);
  identity=info.admin||{};showDeveloperPreviewBanner(identity);rows=data;
  document.getElementById('departmentName').textContent=info.departmentName;
  document.getElementById('adminLink').href=`/admin/${encodeURIComponent(department)}`;
  document.getElementById('auditorLink').href=`/auditor/${encodeURIComponent(department)}`;
  document.getElementById('approvedRegister').href=`/api/payroll/${encodeURIComponent(department)}/approved-register.xlsx`;
  document.getElementById('payrollRegister').href=`/api/payroll/${encodeURIComponent(department)}/register.xlsx`;
  render();
}
document.getElementById('search').oninput=render;
document.getElementById('closeClaim').onclick=()=>{document.getElementById('claimFrame').src='about:blank';document.getElementById('claimDialog').close();};
document.getElementById('logoutBtn').onclick=async()=>{await fetch('/api/admin-logout',{method:'POST'}).catch(()=>{});location.href='/';};
load().catch(error=>{console.error(error);alert(error.message);});
