// Verifies the KML re-upload contract: geometry and tower count change,
// captured/uploaded history never does.
// Run: node test/kml-replace.mjs   (from the backend folder)
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.JWT_SECRET = 'test_secret';
process.env.CORS_ORIGINS = '';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI = mongod.getUri();
await mongoose.connect(process.env.MONGO_URI);

const { default: Client } = await import('../src/models/Client.js');
const { default: Project } = await import('../src/models/Project.js');
const { default: Tower } = await import('../src/models/Tower.js');
const { previewKml, applyKmlToProject } = await import('../src/services/kmlSync.js');
const { buildDashboard } = await import('../src/services/analytics.js');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
};

// Build a KML with towers `from`..`to`, optionally nudged east by `shift` deg.
const makeKml = (from, to, shift = 0) => `<?xml version="1.0"?><kml><Document>
  <Placemark><LineString><coordinates>
    ${Array.from({ length: to - from + 1 }, (_, i) => `${72.5 + shift + (from + i) * 0.01},21.5,0`).join(' ')}
  </coordinates></LineString></Placemark>
  ${Array.from({ length: to - from + 1 }, (_, i) => {
    const n = from + i;
    return `<Placemark><name>Tower ${n}</name><Point><coordinates>${72.5 + shift + n * 0.01},21.5,0</coordinates></Point></Placemark>`;
  }).join('\n')}
</Document></kml>`;

const client = await Client.create({ name: 'PowerGrid', accessKey: 'TWR-TEST0001' });
const project = await Project.create({ name: 'Line A', client: client._id, totalTowers: 10 });

// ---- v1: 10 towers, then field work happens on 1-4 ----
await applyKmlToProject(project._id, makeKml(1, 10), { fileName: 'v1.kml' });

await Tower.updateMany(
  { project: project._id, number: { $in: ['1', '2', '3', '4'] } },
  { $set: { captured: true, capturedAt: new Date() } }
);
await Tower.updateMany(
  { project: project._id, number: { $in: ['1', '2'] } },
  { $set: { uploaded: true, uploadedAt: new Date() } }
);
await Tower.updateOne(
  { project: project._id, number: '9' },
  { $set: { issueReplace: true, notes: 'insulator damaged' } }
);

const v1 = await Tower.find({ project: project._id }).lean();
check('v1 applied 10 towers with coordinates', v1.length === 10 && v1.every((t) => Number.isFinite(t.lat)));
check('v1 set totalTowers from the KML', (await Project.findById(project._id).lean()).totalTowers === 10);

// ---- v2: same line, re-exported (tiny coordinate drift), towers 1-12 ----
const preview = await previewKml(project._id, makeKml(1, 12, 0.000001));
check('preview reports 12 towers in KML', preview.kmlTowers === 12);
check('preview reports 2 new towers', preview.added === 2);
check('preview reports 0 dropped', preview.missing === 0);
check('preview reports 4 towers with progress preserved', preview.preservedProgress === 4);
check('preview shows totalTowers 10 -> 12', preview.totalTowers.from === 10 && preview.totalTowers.to === 12);
check('preview raises no wrong-file warning for a small drift', preview.warnings.length === 0);

const beforeV2 = await Tower.find({ project: project._id }).lean();
check('preview wrote nothing', beforeV2.length === 10);

await applyKmlToProject(project._id, makeKml(1, 12, 0.000001), { fileName: 'v2.kml' });

const v2 = await Tower.find({ project: project._id }).lean();
const byNum = Object.fromEntries(v2.map((t) => [t.number, t]));

check('v2 has 12 towers', v2.length === 12);
check('v2 kept captured on 1-4', ['1', '2', '3', '4'].every((n) => byNum[n].captured));
check('v2 kept uploaded on 1-2', byNum['1'].uploaded && byNum['2'].uploaded);
check('v2 did not mark 5-12 captured', ['5', '6', '11', '12'].every((n) => !byNum[n].captured));
check('v2 kept capturedAt timestamps', ['1', '2', '3', '4'].every((n) => byNum[n].capturedAt));
check('v2 kept the issue note on tower 9', byNum['9'].issueReplace && byNum['9'].notes === 'insulator damaged');
check('v2 updated totalTowers to 12', (await Project.findById(project._id).lean()).totalTowers === 12);

// ---- v3: shortened line, towers 1-8. 9-12 drop out. ----
await applyKmlToProject(project._id, makeKml(1, 8), { fileName: 'v3.kml' });

const v3 = await Tower.find({ project: project._id }).lean();
const byNum3 = Object.fromEntries(v3.map((t) => [t.number, t]));

check('v3 kept all 12 tower docs (nothing deleted)', v3.length === 12);
check('v3 flagged 9-12 as not in KML', ['9', '10', '11', '12'].every((n) => byNum3[n].inKml === false));
check('v3 left 1-8 active', ['1', '8'].every((n) => byNum3[n].inKml !== false));
check('v3 still kept the issue note on dropped tower 9', byNum3['9'].notes === 'insulator damaged');
check('v3 set totalTowers to 8', (await Project.findById(project._id).lean()).totalTowers === 8);

const dash = await buildDashboard(project._id);
check('dashboard denominator is 8', dash.kpi.totalTower === 8);
check('dashboard counts 4 captured', dash.kpi.capture.done === 4);
check('dashboard marks dropped towers grey', byNum3['9'] && dash.towers.find((t) => t.number === '9').status === 'grey');
check('dashboard drops the stale issue note', dash.towerIssues.length === 0);

// ---- v4: line 1-12 again. Dropped towers must come back with history. ----
const previewRestore = await previewKml(project._id, makeKml(1, 12));
check('preview reports 4 restored towers', previewRestore.restored === 4);
check('preview reports 0 already-stale when all are revived', previewRestore.alreadyStale === 0);

// A KML that revives none of the dropped towers reports them as already-stale,
// not as freshly dropped — the admin should not see the same loss twice.
const previewNoRevive = await previewKml(project._id, makeKml(1, 8));
check('already-stale towers counted separately', previewNoRevive.alreadyStale === 4);
check('already-stale towers are not double-counted as dropped', previewNoRevive.missing === 0);

await applyKmlToProject(project._id, makeKml(1, 12), { fileName: 'v4.kml' });
const v4 = Object.fromEntries((await Tower.find({ project: project._id }).lean()).map((t) => [t.number, t]));
check('v4 reactivated tower 9', v4['9'].inKml === true);
check('v4 restored the issue note on tower 9', v4['9'].notes === 'insulator damaged');
check('v4 restored totalTowers to 12', (await Project.findById(project._id).lean()).totalTowers === 12);

// ---- Wrong-file guard: a completely different line ----
const wrongFile = await previewKml(project._id, makeKml(1, 12, 2.0));
check('preview warns when towers move kilometres', wrongFile.warnings.some((w) => w.includes('long way')));
check('preview reports the large max move', wrongFile.maxMoveMeters > 500);

// ---- Empty KML is rejected outright ----
let rejected = false;
try {
  await applyKmlToProject(project._id, '<kml></kml>');
} catch (e) {
  rejected = e.status === 400;
}
check('apply rejects a KML with no tower points', rejected);
check('rejected apply left totalTowers alone', (await Project.findById(project._id).lean()).totalTowers === 12);

console.log(`\n${pass} passed, ${fail} failed`);
await mongoose.disconnect();
await mongod.stop();
process.exit(fail ? 1 : 0);
