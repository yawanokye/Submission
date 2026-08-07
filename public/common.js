function setStatus(el, ok, message){ el.className='status show '+(ok?'ok':'bad'); el.textContent=message; }
async function submitForm(form, endpoint, statusEl, submitBtn){
  submitBtn.disabled=true; const old=submitBtn.textContent; submitBtn.textContent='Submitting…'; statusEl.className='status';
  try{
    const res=await fetch(endpoint,{method:'POST',body:new FormData(form)}); const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Submission failed.');
    setStatus(statusEl,true,`Submission received successfully. Reference: ${data.reference}`); form.reset(); return data;
  }catch(err){ setStatus(statusEl,false,err.message||'Submission failed.'); throw err; }
  finally{ submitBtn.disabled=false; submitBtn.textContent=old; }
}
