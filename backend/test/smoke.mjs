// End-to-end smoke test of the shared API using an in-memory MongoDB.
// Run: node test/smoke.mjs   (from the backend folder)
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.CORS_ORIGINS = '';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
await mongoose.connect(process.env.MONGO_URI);

const { default: User } = await import('../src/models/User.js');
const { default: Client } = await import('../src/models/Client.js');
const { default: Project } = await import('../src/models/Project.js');
const { default: Tower } = await import('../src/models/Tower.js');
const { default: app } = await import('../src/app.js');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
};

// ---- Seed minimal data ----
const admin = new User({ name: 'Admin', loginId: 'admin', role: 'admin' });
await admin.setPassword('admin123');
await admin.save();
const pilot = new User({ name: 'Pilot', loginId: 'pilot1', role: 'pilot' });
await pilot.setPassword('pilot123');
await pilot.save();
const client = await Client.create({ name: 'PowerGrid', accessKey: 'TWR-DEMO1234' });
const project = await Project.create({ name: 'Line A', client: client._id, totalTowers: 10 });
await Tower.insertMany(
  Array.from({ length: 10 }, (_, i) => ({
    project: project._id,
    number: String(i + 1),
    captured: i < 4,
    capturedAt: i < 4 ? new Date() : null,
    uploaded: i < 2,
    uploadedAt: i < 2 ? new Date() : null,
  }))
);

const server = app.listen(5099);
const base = 'http://localhost:5099/api';
const post = (p, body, token) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const get = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

try {
  // Health
  check('health ok', (await (await get('/health')).json()).ok === true);

  // Admin login
  const adminLogin = await (await post('/auth/login', { loginId: 'admin', password: 'admin123', expectedRole: 'admin' })).json();
  check('admin login returns token', !!adminLogin.token);
  check('pilot cannot log into admin', (await post('/auth/login', { loginId: 'pilot1', password: 'pilot123', expectedRole: 'admin' })).status === 403);

  // Pilot login
  const pilotLogin = await (await post('/auth/login', { loginId: 'pilot1', password: 'pilot123', expectedRole: 'pilot' })).json();
  check('pilot login returns token', !!pilotLogin.token);

  // Client access by key
  const access = await (await post('/client/access', { key: 'TWR-DEMO1234' })).json();
  check('client access lists 1 project', access.projects?.length === 1);
  check('bad key rejected', (await post('/client/access', { key: 'NOPE' })).status === 401);

  // Client dashboard
  const dash = await (await get(`/client/dashboard/${project._id}?key=TWR-DEMO1234`)).json();
  check('dashboard total towers = 10', dash.kpi.totalTower === 10);
  check('dashboard capture done = 4', dash.kpi.capture.done === 4);
  check('dashboard upload done = 2', dash.kpi.upload.done === 2);
  check('dashboard capture pct = 40', dash.kpi.capture.pct === 40);
  check('map towers carry status', dash.towers.some((t) => t.status === 'green') && dash.towers.some((t) => t.status === 'red'));
  check('prediction has daily avg', typeof dash.prediction.dailyCaptureAvg === 'number');

  // Pilot loads range + updates data
  const rows = await (await get(`/pilot/towers/${project._id}?from=5&to=8`, pilotLogin.token)).json();
  check('pilot range returns 4 rows', rows.rows?.length === 4);
  const update = await (
    await post(
      '/pilot/data-update',
      { projectId: project._id, date: new Date().toISOString(), rows: rows.rows.map((r) => ({ ...r, dataCapture: true })) },
      pilotLogin.token
    )
  ).json();
  check('pilot data-update saved 4', update.updated === 4);

  // Dashboard reflects new captures (4 + 4 = 8)
  const dash2 = await (await get(`/client/dashboard/${project._id}?key=TWR-DEMO1234`)).json();
  check('dashboard capture done now 8', dash2.kpi.capture.done === 8);

  // Pilot cannot hit admin route
  check('pilot blocked from admin route', (await get('/admin/clients', pilotLogin.token)).status === 403);

  // Admin creates a client (gets a key)
  const newClient = await (await post('/admin/clients', { name: 'New Co' }, adminLogin.token)).json();
  check('admin creates client with key', /^TWR-/.test(newClient.client?.accessKey));

  // Range validation
  check('invalid range rejected', (await get(`/pilot/towers/${project._id}?from=9&to=2`, pilotLogin.token)).status === 400);

  // KML parser
  const { parseKml } = await import('../src/services/kml.js');
  const sampleKml = `<?xml version="1.0"?><kml><Document>
    <Placemark><name>Line</name><LineString><coordinates>73.1,22.1,0 73.2,22.2,0 73.3,22.3,0</coordinates></LineString></Placemark>
    <Placemark><name>Tower 1</name><Point><coordinates>73.1,22.1,0</coordinates></Point></Placemark>
    <Placemark><name>Tower 2</name><Point><coordinates>73.2,22.2,0</coordinates></Point></Placemark>
  </Document></kml>`;
  const parsed = parseKml(sampleKml);
  check('parseKml finds 2 towers', parsed.towers.length === 2);
  check('parseKml maps lat/lng (lng,lat order)', parsed.towers[0].lat === 22.1 && parsed.towers[0].lng === 73.1);
  check('parseKml extracts route of 3 points', parsed.route.length === 3);
} catch (e) {
  console.error('Test threw:', e);
  fail += 1;
}

server.close();
await mongoose.disconnect();
await mongod.stop();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
