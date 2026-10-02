'use strict';

const assert = require('assert/strict');
const fsp = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const appPort = 20600 + Math.floor(Math.random() * 150);
const smsPort = appPort + 200;
const base = `http://127.0.0.1:${appPort}`;
const developerUser = 'arkesel-test';
const developerPassword = 'arkesel-test-password';
const developerAuthorization = `Basic ${Buffer.from(`${developerUser}:${developerPassword}`).toString('base64')}`;

async function waitFor(check, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(message);
}
function sessionCookie(response) {
  const match = String(response.headers.get('set-cookie') || '').match(/ucc_admin_session=[^;]+/);
  assert.ok(match, 'developer preview must set a session cookie');
  return match[0];
}

async function main() {
  const received = [];
  const smsServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v2/sms/send') { res.writeHead(404).end(); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      received.push({ payload, apiKey:req.headers['api-key'] || '' });
      res.writeHead(200, { 'content-type':'application/json' });
      res.end(JSON.stringify({ status:'success', data:[{ id:`arkesel-${received.length}`, recipient:payload.recipients?.[0] }] }));
    });
  });
  await new Promise(resolve => smsServer.listen(smsPort, '127.0.0.1', resolve));
  const storage = await fsp.mkdtemp(path.join(os.tmpdir(), 'ucc-code-arkesel-v49-'));
  const dataDir = path.join(storage, 'data');
  await fsp.mkdir(dataDir, { recursive:true });
  await Promise.all([
    fsp.writeFile(path.join(dataDir, 'support-tickets.json'), '[]'),
    fsp.writeFile(path.join(dataDir, 'admin-users.json'), '[]')
  ]);
  const child = spawn(process.execPath, ['server.js'], { cwd:root, env:{
    ...process.env, PORT:String(appPort), STORAGE_DIR:storage,
    DEVELOPER_ADMIN_USER:developerUser, DEVELOPER_ADMIN_PASSWORD:developerPassword,
    SUPPORT_STATUS_TOKEN_SECRET:'arkesel-status-secret', PUBLIC_BASE_URL:base,
    SUPPORT_SMS_ENABLED:'true', ARKESEL_API_KEY:'test-arkesel-key', ARKESEL_SENDER_ID:'UCC-CoDE',
    ARKESEL_CALLBACK_SECRET:'test-callback-secret', ARKESEL_API_BASE_URL:`http://127.0.0.1:${smsPort}/api/v2`,
    GMAIL_CLIENT_ID:'', GMAIL_CLIENT_SECRET:'', GMAIL_REFRESH_TOKEN:'', GMAIL_SENDER_EMAIL:''
  }, stdio:['ignore','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    await waitFor(() => output.includes('listening on'), `application did not start: ${output}`, 15000);
    const configResponse = await fetch(`${base}/api/support/config`);
    const config = await configResponse.json();
    assert.equal(configResponse.status, 200);
    assert.deepEqual(config.notificationChannels, [{ id:'email-sms', label:'Email and SMS', available:true }]);

    const form = new FormData();
    Object.entries({ type:'complaint', category:'general', priority:'normal', firstName:'Ama', lastName:'Mensah', email:'ama@example.edu', phone:'0241234567', studyLevel:'undergraduate', subject:'Arkesel notification test', description:'Please verify the required email and SMS notification policy for this support request.' }).forEach(([key, value]) => form.set(key, value));
    const submissionResponse = await fetch(`${base}/api/support/tickets`, { method:'POST', body:form });
    const submission = await submissionResponse.json();
    assert.equal(submissionResponse.status, 201, submission.error || 'ticket submission failed');
    assert.equal(submission.ticket.notificationPreference, 'email-sms');
    await waitFor(() => received.length === 1, 'submission acknowledgement SMS was not sent');
    assert.equal(received[0].apiKey, 'test-arkesel-key');
    assert.equal(received[0].payload.sender, 'UCC-CoDE');
    assert.deepEqual(received[0].payload.recipients, ['+233241234567']);
    assert.deepEqual(Object.keys(received[0].payload).sort(), ['callback_url','message','recipients','sender']);
    assert.equal(received[0].payload.callback_url, `${base}/api/support/sms/arkesel/callback?token=test-callback-secret`);
    assert.match(received[0].payload.message, /has been received/i);

    const previewResponse = await fetch(`${base}/api/developer/staff-preview-session`, { method:'POST', headers:{ authorization:developerAuthorization, 'content-type':'application/json' }, body:JSON.stringify({ unit:'student-support' }) });
    const preview = await previewResponse.json();
    assert.equal(previewResponse.status, 200, preview.error || 'student-support preview failed');
    const cookie = sessionCookie(previewResponse);
    const initialQueueResponse = await fetch(`${base}/api/support/admin/tickets`, { headers:{ cookie } });
    const initialQueue = await initialQueueResponse.json();
    const adminTicket = initialQueue.tickets.find(ticket => ticket.reference === submission.ticket.reference);
    assert.ok(adminTicket?.id, 'submitted ticket must appear in the Student Support register');
    const update = async(status, note) => {
      const response = await fetch(`${base}/api/support/admin/tickets/${adminTicket.id}`, { method:'PATCH', headers:{ cookie, 'content-type':'application/json' }, body:JSON.stringify({ status, note }) });
      const data = await response.json();
      assert.equal(response.status, 200, data.error || `${status} update failed`);
      return data;
    };

    await update('evidence-requested', 'Upload the official payment receipt and registration statement.');
    await waitFor(() => received.length === 2, 'additional-information SMS was not sent');
    assert.match(received[1].payload.message, /more information is required/i);

    await update('investigation-ongoing', 'The responsible unit is checking the submitted records.');
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(received.length, 2, 'routine progress updates must remain email-only');

    await update('resolved', 'A resolution has been proposed for the student to review.');
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(received.length, 2, 'a proposed resolution must remain email-only until a final decision is recorded');

    await update('final-decision', 'The final decision has been approved and recorded.');
    await waitFor(() => received.length === 3, 'final-decision SMS was not sent');
    assert.match(received[2].payload.message, /final decision has been recorded/i);

    const callback = await fetch(`${base}/api/support/sms/arkesel/callback?token=test-callback-secret&sms_id=arkesel-3&status=DELIVERED`);
    assert.equal(callback.status, 200);
    const queueResponse = await fetch(`${base}/api/support/admin/tickets`, { headers:{ cookie } });
    const queue = await queueResponse.json();
    const stored = queue.tickets.find(ticket => ticket.id === adminTicket.id);
    const finalSms = [...(stored.notificationHistory || [])].reverse().find(item => item.providerMessageId === 'arkesel-3');
    assert.equal(finalSms.provider, 'arkesel');
    assert.equal(finalSms.deliveryStatus, 'delivered');
    console.log('v49 Arkesel notification policy verified');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => smsServer.close(resolve));
    await fsp.rm(storage, { recursive:true, force:true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
