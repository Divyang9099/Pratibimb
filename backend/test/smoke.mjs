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
const pilot2 = new User({ name: 'Pilot Two', loginId: 'pilot2', role: 'pilot' });
await pilot2.setPassword('pilot123');
await pilot2.save();
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
const patch = (p, body, token) =>
  fetch(base + p, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

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

  // Client photos
  const photosRes = await get(`/client/photos/${project._id}?key=TWR-DEMO1234`);
  check('photos fetch status is 200', photosRes.status === 200);
  const photosData = await photosRes.json();
  check('photos results is an array', Array.isArray(photosData.photos));

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

  // Correcting a tower back to an *earlier* day has to move it on the Daily
  // Activity chart. Mirrors a real incident: tower flown on the 4th but logged
  // on the 5th together with its upload, then the capture corrected to the 4th.
  // Replaying events by date instead of by record order let the cancelled 5 Aug
  // event outrank the correction, so the chart never moved.
  const t9 = { number: '9', dataCapture: true, dataUpload: true, issueReplace: false };
  const dataUpdate = (date, rows) =>
    post('/pilot/data-update', { projectId: project._id, date, rows }, pilotLogin.token);
  await dataUpdate('2026-08-05', [t9]);
  await dataUpdate('2026-08-05', [{ ...t9, dataCapture: false, captureRevertNote: 'flown on the 4th' }]);
  await dataUpdate('2026-08-04', [t9]);

  const dash3 = await (await get(`/client/dashboard/${project._id}?key=TWR-DEMO1234`)).json();
  const activityOn = (date, field) =>
    dash3.dailyActivity.find((d) => d.date === date)?.[`${field}Numbers`] || [];
  check('corrected capture moves to 4 Aug', activityOn('2026-08-04', 'captured').includes(9));
  check('corrected capture leaves 5 Aug', !activityOn('2026-08-05', 'captured').includes(9));
  check('untouched upload stays on 5 Aug', activityOn('2026-08-05', 'uploaded').includes(9));
  check('corrected tower counted once', dash3.kpi.capture.done === 9);

  // Pilot cannot hit admin route
  check('pilot blocked from admin route', (await get('/admin/clients', pilotLogin.token)).status === 403);

  // Admin creates a client (gets a key)
  const newClient = await (await post('/admin/clients', { name: 'New Co' }, adminLogin.token)).json();
  check('admin creates client with key', /^TWR-/.test(newClient.client?.accessKey));

  // Range validation
  check('invalid range rejected', (await get(`/pilot/towers/${project._id}?from=9&to=2`, pilotLogin.token)).status === 400);

  // Pilot corrects a tower number after Start Day is already locked in
  const startDay2 = await (
    await post(
      '/pilot/start-day',
      { projectId: project._id, date: '2026-07-21', towerNo: '3', image: 'data:image/jpeg;base64,x' },
      pilotLogin.token
    )
  ).json();
  check('start-day creates a log with tower 3', startDay2.log?.towerNo === '3');

  const editTower = await (
    await patch(`/pilot/log/${startDay2.log._id}/tower`, { towerNo: '7' }, pilotLogin.token)
  ).json();
  check('tower-no edit returns the updated log', editTower.log?.towerNo === '7');

  const statusAfterEdit = await (
    await get(`/pilot/today-status/${project._id}?date=2026-07-21`, pilotLogin.token)
  ).json();
  check('today-status reflects the edited tower no', statusAfterEdit.startLog?.towerNo === '7');

  check(
    'empty tower-no edit rejected',
    (await patch(`/pilot/log/${startDay2.log._id}/tower`, { towerNo: '   ' }, pilotLogin.token)).status === 400
  );

  const pilot2Login = await (await post('/auth/login', { loginId: 'pilot2', password: 'pilot123', expectedRole: 'pilot' })).json();
  check(
    "editing another pilot's log is rejected",
    (await patch(`/pilot/log/${startDay2.log._id}/tower`, { towerNo: '9' }, pilot2Login.token)).status === 404
  );

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
