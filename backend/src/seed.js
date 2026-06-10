import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Client from './models/Client.js';
import Project from './models/Project.js';
import Tower from './models/Tower.js';
import DailyLog from './models/DailyLog.js';

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in environment variables');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Wiping all collection data...');

  await Promise.all([
    User.deleteMany({}),
    Client.deleteMany({}),
    Project.deleteMany({}),
    Tower.deleteMany({}),
    DailyLog.deleteMany({}),
  ]);

  console.log('Wiped all existing records. Seeding primary users...');

  // --- Admin ---
  const admin = new User({ name: 'Admin', loginId: 'admin', role: 'admin' });
  await admin.setPassword('admin123');
  await admin.save();

  // --- Pilot ---
  const pilot = new User({ name: 'Ravi Pilot', loginId: 'pilot1', role: 'pilot', phone: '9000000001' });
  await pilot.setPassword('pilot123');
  await pilot.save();

  console.log('\n✓ Database successfully cleared & seeded with primary credentials\n');
  console.log('  Admin login   : admin / admin123');
  console.log('  Pilot login   : pilot1 / pilot123');
  console.log('  Note          : All other project, client, tower, and log entries have been removed.\n');

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
