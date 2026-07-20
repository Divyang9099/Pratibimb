// End-to-end realtime test: real HTTP mutations against a real server, with a
// real socket.io client listening. Asserts that every mutation a pilot or
// admin can perform actually reaches subscribed clients.
//
// Uses an in-memory MongoDB, so it never touches live data.
// Run: node test/realtime.mjs   (from the backend folder)
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import http from 'http';

const { io } = await import(
  'file:///D:/Tower%20Traker/admin-app/node_modules/socket.io-client/build/esm/index.js'
);

process.env.JWT_SECRET = 'test_secret';
process.env.CORS_ORIGINS = '';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
await mongoose.connect(process.env.MONGO_URI);

const { default: User } = await import('../src/models/User.js');
const { default: Client } = await import('../src/models/Client.js');
const { default: Project } = await import('../src/models/Project.js');
const { default: Tower } = await import('../src/models/Tower.js');
const { default: app, origins } = await import('../src/app.js');
const { initSocket } = await import('../src/services/socket.js');

const PORT = 5123;
const server = http.createServer(app);
initSocket(server, origins);
await new Promise((r) => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}/api`;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
};

// ---- Seed ----
const admin = new User({ name: 'A', loginId: 'admin', role: 'admin' });
await admin.setPassword('pw');
await admin.save();
const pilot = new User({ name: 'P', loginId: 'pilot1', role: 'pilot' });
await pilot.setPassword('pw');
await pilot.save();
const client = await Client.create({ name: 'C', accessKey: 'TWR-TEST0001' });
const project = await Project.create({ name: 'Line A', client: client._id, totalTowers: 5, requirePhoto: false });
await Tower.insertMany(
  Array.from({ length: 5 }, (_, i) => ({ project: project._id, number: String(i + 1) }))
);
const projectId = String(project._id);

const post = (path, body, token) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const put = (path, body, token) =>
  fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const adminToken = (await (await post('/auth/login', { loginId: 'admin', password: 'pw' })).json()).token;
const pilotToken = (await (await post('/auth/login', { loginId: 'pilot1', password: 'pw' })).json()).token;
check('admin + pilot logged in', !!adminToken && !!pilotToken);

// ---- Socket client, wired exactly like useProjectLive ----
const s = io(`http://localhost:${PORT}`, { autoConnect: false });
let events = 0;
s.on('project-update', (d) => { if (String(d?.projectId) === projectId) events += 1; });
s.connect();
await new Promise((r) => s.on('connect', r));
const join = () => s.emit('join-project', projectId);
s.on('connect', join);
join();
await new Promise((r) => setTimeout(r, 300));
check('socket connected and joined the project room', s.connected);

// Run one mutation and report whether it produced a broadcast.
async function expectBroadcast(label, fn) {
  const before = events;
  const res = await fn();
  await new Promise((r) => setTimeout(r, 500));
  const got = events > before;
  const okStatus = res.status < 400;
  if (!okStatus) {
    check(`${label} → broadcast (request failed: HTTP ${res.status})`, false);
    return;
  }
  check(`${label} → broadcast received`, got);
}

console.log('\n--- pilot actions (the main field flow) ---');
await expectBroadcast('pilot POST /pilot/start-day', () =>
  post('/pilot/start-day', { projectId, date: '2026-07-20', towerNo: '1', image: '', note: '' }, pilotToken)
);
await expectBroadcast('pilot POST /pilot/data-update', () =>
  post('/pilot/data-update', {
    projectId,
    date: '2026-07-20',
    pilotId: String(pilot._id),
    rows: [{ number: '1', dataCapture: true, dataUpload: false, issueReplace: false, issueNote: '' }],
  }, pilotToken)
);
await expectBroadcast('pilot POST /pilot/end-day', () =>
  post('/pilot/end-day', { projectId, date: '2026-07-20', towerNo: '2', image: '', note: '' }, pilotToken)
);

console.log('\n--- admin actions ---');
await expectBroadcast('admin PUT /admin/towers/:projectId/:number', () =>
  put(`/admin/towers/${projectId}/3`, { captured: true, uploaded: true }, adminToken)
);
await expectBroadcast('admin POST /admin/projects/:id/data-update', () =>
  post(`/admin/projects/${projectId}/data-update`, {
    date: '2026-07-20',
    rows: [{ number: '4', dataCapture: true, dataUpload: true, issueReplace: false }],
  }, adminToken)
);
await expectBroadcast('admin PUT /admin/projects/:id', () =>
  put(`/admin/projects/${projectId}`, { name: 'Line A2' }, adminToken)
);
await expectBroadcast('admin POST /admin/projects/:id/reset-data', () =>
  post(`/admin/projects/${projectId}/reset-data`, {}, adminToken)
);

// ---- Global data-change: the signal list screens depend on ----
// These belong to no project room, so project-update can never reach them.
let globals = 0;
s.on('data-change', () => { globals += 1; });

async function expectGlobal(label, fn) {
  const before = globals;
  const res = await fn();
  await new Promise((r) => setTimeout(r, 500));
  if (res.status >= 400) {
    check(`${label} → data-change (request failed: HTTP ${res.status})`, false);
    return;
  }
  check(`${label} → data-change received`, globals > before);
}

console.log('\n--- list screens (previously received nothing at all) ---');
await expectGlobal('admin POST /admin/clients', () =>
  post('/admin/clients', { name: 'New Client' }, adminToken)
);
await expectGlobal('admin POST /admin/pilots', () =>
  post('/admin/pilots', { name: 'New Pilot', loginId: 'pilot2', password: 'pw123456' }, adminToken)
);
await expectGlobal('admin POST /admin/projects', () =>
  post('/admin/projects', { name: 'Line B', client: String(client._id) }, adminToken)
);
await expectGlobal('admin PUT /admin/pilots/:id', () =>
  put(`/admin/pilots/${pilot._id}`, { name: 'Renamed Pilot' }, adminToken)
);
await expectGlobal('pilot POST /pilot/data-update', () =>
  post('/pilot/data-update', {
    projectId, date: '2026-07-20', pilotId: String(pilot._id),
    rows: [{ number: '5', dataCapture: true, dataUpload: false, issueReplace: false, issueNote: '' }],
  }, pilotToken)
);

// A failed mutation must not claim success to every open screen.
const beforeBad = globals;
await put(`/admin/pilots/000000000000000000000000`, { name: 'nope' }, adminToken);
await new Promise((r) => setTimeout(r, 400));
check('failed mutation does NOT broadcast', globals === beforeBad);

// Reads must stay silent, or every poll would storm the clients.
const beforeRead = globals;
await fetch(`${BASE}/admin/projects`, { headers: { Authorization: `Bearer ${adminToken}` } });
await new Promise((r) => setTimeout(r, 400));
check('GET requests do NOT broadcast', globals === beforeRead);

console.log(`\n${pass} passed, ${fail} failed`);
s.close();
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(fail ? 1 : 0);
