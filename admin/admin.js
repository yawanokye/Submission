let submissions = [];
const tbody = document.getElementById('submissionRows');
const search = document.getElementById('search');
const emptyState = document.getElementById('emptyState');
const dialog = document.getElementById('detailDialog');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = v => { try { return new Date(v).toLocaleString(); } catch { return v || ''; } };

async function load() {
  const [rowsRes, summaryRes] = await Promise.all([
    fetch('/api/admin/submissions'),
    fetch('/api/admin/summary')
  ]);
  submissions = await rowsRes.json();
  const summary = await summaryRes.json();
  document.getElementById('totalSubmissions').textContent = summary.submissions ?? 0;
  document.getElementById('totalRows').textContent = summary.scoreRows ?? 0;
  document.getElementById('centreCount').textContent = Object.keys(summary.centres || {}).length;
  render(submissions);
}

function fileButtons(s) {
  return `<div class="files">
    <a class="btn small" href="/api/admin/submissions/${s.id}/files/scoresFile">Original scores</a>
    <a class="btn small" href="/api/admin/submissions/${s.id}/scores.xlsx">Clean scores</a>
    <button class="btn small" type="button" onclick="showDetail('${s.id}')">View record</button>
  </div>`;
}

function render(rows) {
  tbody.innerHTML = rows.map(s => `<tr>
    <td><span class="ref">${esc(s.reference)}</span></td>
    <td>${esc(fmtDate(s.submittedAt))}</td>
    <td>${esc(s.fullName)}<br><small>${esc(s.email)}</small></td>
    <td>${esc(s.studyCentre)}</td>
    <td>${esc(s.submissionType)}</td>
    <td>${esc(s.groupCount)}</td>
    <td>${esc(s.scoreRows)}</td>
    <td>${fileButtons(s)}</td>
  </tr>`).join('');
  emptyState.classList.toggle('hidden', rows.length > 0);
}

search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  if (!q) return render(submissions);
  render(submissions.filter(s => [s.reference,s.fullName,s.email,s.phone,s.studyCentre,s.submissionType].join(' ').toLowerCase().includes(q)));
});

window.showDetail = async id => {
  const res = await fetch(`/api/admin/submissions/${id}`);
  const s = await res.json();
  document.getElementById('detailReference').textContent = s.reference || '';
  const works = (s.files?.completedWork || []).map((f,i) => `<a href="/api/admin/submissions/${s.id}/files/completedWork/${i}">${esc(f.originalName)}</a>`).join('');
  document.getElementById('detailBody').innerHTML = `<div class="detail">
    <div class="detail-grid">
      <div class="detail-item"><span>Examiner / Supervisor</span><strong>${esc(s.fullName)}</strong></div>
      <div class="detail-item"><span>Submitted</span><strong>${esc(fmtDate(s.submittedAt))}</strong></div>
      <div class="detail-item"><span>Phone</span><strong>${esc(s.phone)}</strong></div>
      <div class="detail-item"><span>Email</span><strong>${esc(s.email)}</strong></div>
      <div class="detail-item"><span>Study Centre</span><strong>${esc(s.studyCentre)}</strong></div>
      <div class="detail-item"><span>Submission Type</span><strong>${esc(s.submissionType)}</strong></div>
      <div class="detail-item"><span>Groups / Candidates</span><strong>${esc(s.groupCount)}</strong></div>
      <div class="detail-item"><span>Rows included in clean scores</span><strong>${esc(s.scoreSheet?.rowCount || 0)}</strong></div>
    </div>
    <h3>Original submission files</h3>
    <div class="file-list">
      <a href="/api/admin/submissions/${s.id}/files/claimForm">Claim form, ${esc(s.files?.claimForm?.originalName || '')}</a>
      <a href="/api/admin/submissions/${s.id}/files/reportFile">Report, ${esc(s.files?.reportFile?.originalName || '')}</a>
      <a href="/api/admin/submissions/${s.id}/files/scoresFile">Original score sheet, ${esc(s.files?.scoresFile?.originalName || '')}</a>
      ${works}
      <a href="/api/admin/submissions/${s.id}/scores.xlsx"><strong>Download this submission as a clean score sheet</strong></a>
    </div>
  </div>`;
  dialog.showModal();
};

document.getElementById('closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

load().catch(err => {
  console.error(err);
  tbody.innerHTML = '<tr><td colspan="8">Could not load submissions.</td></tr>';
});
