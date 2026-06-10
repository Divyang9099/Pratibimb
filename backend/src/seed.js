import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Client from './models/Client.js';
import Project from './models/Project.js';
import Tower from './models/Tower.js';
import DailyLog from './models/DailyLog.js';

// A small powerline route near Ahmedabad, used for the demo map.
const ROUTE_START = { lat: 23.0225, lng: 72.5714 };
const STEP = 0.004; // ~450 m between towers

const TOTAL = 40;

function buildKml(towers) {
  const coords = towers.map((t) => `${t.lng},${t.lat},0`).join(' ');
  const placemarks = towers
    .map(
      (t) => `    <Placemark>
      <name>${t.number}</name>
      <Point><coordinates>${t.lng},${t.lat},0</coordinates></Point>
    </Placemark>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Demo Powerline</name>
    <Placemark>
      <name>Line</name>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>
${placemarks}
  </Document>
</kml>`;
}

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d;
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Wiping demo data…');

  await Promise.all([
    User.deleteMany({}),
    Client.deleteMany({}),
    Project.deleteMany({}),
    Tower.deleteMany({}),
    DailyLog.deleteMany({}),
  ]);

  // --- Admin ---
  const admin = new User({ name: 'Admin', loginId: 'admin', role: 'admin' });
  await admin.setPassword('admin123');
  await admin.save();

  // --- Pilot ---
  const pilot = new User({ name: 'Ravi Pilot', loginId: 'pilot1', role: 'pilot', phone: '9000000001' });
  await pilot.setPassword('pilot123');
  await pilot.save();

  // --- Client ---
  const client = await Client.create({
    name: 'PowerGrid Ltd',
    contactEmail: 'ops@powergrid.example',
    accessKey: 'TWR-DEMO1234',
  });

  // --- Tower geometry ---
  const towerGeo = Array.from({ length: TOTAL }, (_, i) => ({
    number: String(i + 1),
    lat: ROUTE_START.lat + i * STEP,
    lng: ROUTE_START.lng + i * STEP * 0.6,
  }));

  // --- Project ---
  const project = await Project.create({
    name: '400kV Line A-B Inspection',
    client: client._id,
    totalTowers: TOTAL,
    kml: buildKml(towerGeo),
    description: 'Demo inspection project',
    startDate: addDays(-6),
  });

  // --- Towers with staged progress over the last 6 days ---
  // 22 captured, of those 15 uploaded -> mix of green/yellow/red.
  const towers = towerGeo.map((g, i) => {
    const captured = i < 22;
    const uploaded = i < 15;
    const dayOffset = -6 + Math.floor(i / 4); // ~4 towers per day
    return {
      project: project._id,
      number: g.number,
      lat: g.lat,
      lng: g.lng,
      captured,
      capturedAt: captured ? addDays(dayOffset) : null,
      capturedBy: captured ? pilot._id : null,
      uploaded,
      uploadedAt: uploaded ? addDays(dayOffset + 1) : null,
      uploadedBy: uploaded ? pilot._id : null,
      issueReplace: i === 7 || i === 18,
    };
  });
  await Tower.insertMany(towers);

  // --- Daily start/end logs (acquisition KPI) ---
  await DailyLog.create([
    { project: project._id, pilot: pilot._id, type: 'start', date: addDays(0), towerNo: '23', note: 'Morning open' },
    { project: project._id, pilot: pilot._id, type: 'end', date: addDays(0), towerNo: '26', note: 'Evening close' },
  ]);

  console.log('\n✓ Seed complete\n');
  console.log('  Admin login   : admin / admin123');
  console.log('  Pilot login   : pilot1 / pilot123');
  console.log('  Client key    : TWR-DEMO1234');
  console.log(`  Project       : ${project.name} (${TOTAL} towers)\n`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
