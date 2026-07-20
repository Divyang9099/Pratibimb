import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Client from './models/Client.js';
import Project from './models/Project.js';
import Tower from './models/Tower.js';
import DailyLog from './models/DailyLog.js';

// Seed credentials come from the environment. They are deliberately NOT
// hardcoded: this repo is public, and a password committed here is a password
// published to the world and preserved in git history forever.
//
// Set these in backend/.env (which is gitignored) before running:
//   SEED_ADMIN_LOGIN, SEED_ADMIN_PASSWORD, SEED_PILOT_LOGIN, SEED_PILOT_PASSWORD
const SEED = {
  adminName: process.env.SEED_ADMIN_NAME || 'Admin',
  adminLogin: process.env.SEED_ADMIN_LOGIN,
  adminPassword: process.env.SEED_ADMIN_PASSWORD,
  pilotName: process.env.SEED_PILOT_NAME || 'Pilot',
  pilotLogin: process.env.SEED_PILOT_LOGIN,
  pilotPassword: process.env.SEED_PILOT_PASSWORD,
};

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in environment variables');
    process.exit(1);
  }

  const missing = Object.entries(SEED)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error(
      'Refusing to seed: missing env vars for ' + missing.join(', ') + '.\n' +
      'Set SEED_ADMIN_LOGIN / SEED_ADMIN_PASSWORD / SEED_PILOT_LOGIN / SEED_PILOT_PASSWORD\n' +
      'in backend/.env first. This script WIPES every collection.'
    );
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
  const admin = new User({ name: SEED.adminName, loginId: SEED.adminLogin, role: 'admin' });
  await admin.setPassword(SEED.adminPassword);
  await admin.save();

  // --- Pilot ---
  const pilot = new User({ name: SEED.pilotName, loginId: SEED.pilotLogin, role: 'pilot', phone: process.env.SEED_PILOT_PHONE || '' });
  await pilot.setPassword(SEED.pilotPassword);
  await pilot.save();

  // Login IDs are echoed for confirmation; passwords never are.
  console.log('\n✓ Database cleared & seeded\n');
  console.log('  Admin login   : ' + SEED.adminLogin);
  console.log('  Pilot login   : ' + SEED.pilotLogin);
  console.log('  Passwords     : as set in your environment (not printed)');
  console.log('  Note          : All other project, client, tower, and log entries have been removed.\n');

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
