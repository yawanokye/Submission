'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const port = 21000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const developerUser = 'session-tester';
const developerPassword = 'session-test-password';
const developerAuthorization = `Basic ${Buffer.from(`${developerUser}:${developerPassword}`).toString('base64')}`;

function startServer(storage) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{
      ...process.env,
      PORT:String(port),
      STORAGE_DIR:storage,
      PUBLIC_BASE_URL:'https://mycode360.app',
      DEVELOPER_ADMIN_USER:developerUser,
      DEVELOPER_ADMIN_PASSWORD:developerPassword,
      SUPPORT_STATUS_TOKEN_SECRET:'independent-session-test-secret',
      GMAIL_CLIENT_ID:'', GMAIL_CLIENT_SECRET:'', GMAIL_REFRESH_TOKEN:'', GMAIL_SENDER_EMAIL:''
    },
    stdio:['ignore','pipe','pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.output = () => output;
  return child;
}

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  while (!child.output().includes('listening on') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(child.output(), /listening on/, `server did not start: ${child.output()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function cookieFrom(response) {
  const match = String(response.headers.get('set-cookie') || '').match(/ucc_admin_session=([^;]+)/);
  assert.ok(match, 'staff preview should set the session cookie');
  return { header:match[0], raw:decodeURIComponent(match[1]) };
}

async function main() {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'ucc-v51-sessions-'));
  let child = startServer(storage);
  try {
    await waitForServer(child);
    const previewResponse = await fetch(`${base}/api/developer/staff-preview-session`, {
      method:'POST',
      headers:{ authorization:developerAuthorization, 'content-type':'application/json' },
      body:JSON.stringify({ unit:'student-support' })
    });
    assert.equal(previewResponse.status, 200);
    const sessionCookie = cookieFrom(previewResponse);

    const database = new DatabaseSync(path.join(storage, 'data', 'support-tickets.sqlite'));
    const persisted = database.prepare('SELECT token_hash, department FROM portal_sessions').get();
    database.close();
    assert.equal(persisted.department, '__staff__');
    assert.match(persisted.token_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(persisted.token_hash, sessionCookie.raw, 'the raw browser token must not be stored in SQLite');

    await stopServer(child);
    child = startServer(storage);
    await waitForServer(child);

    const restored = await fetch(`${base}/api/staff/me`, { headers:{ cookie:sessionCookie.header } });
    const restoredData = await restored.json();
    assert.equal(restored.status, 200, restoredData.error || 'the staff session should survive a server restart');
    assert.equal(restoredData.staff.developerPreview, true);

    const health = await fetch(`${base}/health`).then(response => response.json());
    assert.equal(health.sessionStore, 'sqlite');
    assert.equal(health.persistentSessions, true);
    assert.ok(health.activeSessions >= 1);

    const expiredSubmit = await fetch(`${base}/secure/support-assignment/${'a'.repeat(64)}/resolve`, {
      method:'POST', redirect:'manual', headers:{ origin:'https://mycode360.app', 'content-type':'application/x-www-form-urlencoded' }, body:'reviewed=yes'
    });
    assert.equal(expiredSubmit.status, 303, 'an unauthenticated form POST should return to sign-in instead of raw JSON');
    assert.match(expiredSubmit.headers.get('location') || '', /^\/staff-login\.html\?next=.*&reason=session-expired$/);

    const acceptedAlias = await fetch(`${base}/api/support/tickets`, {
      method:'POST', headers:{ origin:'https://www.mycode360.app', 'content-type':'application/json' }, body:'{}'
    });
    assert.notEqual(acceptedAlias.status, 403, 'the www custom-domain alias should pass same-origin verification');

    const rejectedOrigin = await fetch(`${base}/api/support/tickets`, {
      method:'POST', headers:{ origin:'https://example.invalid', 'content-type':'application/json' }, body:'{}'
    });
    assert.equal(rejectedOrigin.status, 403, 'an unrelated origin must remain blocked');

    console.log('v51 persistent session and custom-domain recovery checks passed.');
  } finally {
    await stopServer(child);
    await fs.rm(storage, { recursive:true, force:true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
