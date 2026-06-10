/**
 * One-shot migration script.
 * Run: node backend/src/migrate.js
 *
 * 1. Reset all tower progress + logs for the "VAD-IND 765KV" project.
 * 2. Set the Better Drones client access key to "BDVI885".
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Project from './models/Project.js';
import Tower from './models/Tower.js';
import DailyLog from './models/DailyLog.js';
import Client from './models/Client.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('Connected to MongoDB');

// 1. Reset tower data for VAD-IND 765KV
const vadInd = await Project.findOne({ name: /VAD.IND/i });
if (vadInd) {
  const towerResult = await Tower.updateMany(
    { project: vadInd._id },
    {
      $set: {
        captured: false,
        uploaded: false,
        issueReplace: false,
        capturedAt: null,
        uploadedAt: null,
        capturedBy: null,
        uploadedBy: null,
      },
    }
  );
  const logResult = await DailyLog.deleteMany({ project: vadInd._id });
  console.log(`Reset ${towerResult.modifiedCount} towers and deleted ${logResult.deletedCount} logs for "${vadInd.name}"`);
} else {
  console.log('VAD-IND project not found — skipping tower reset');
}

// 2. Set Better Drones client key to BDVI885
const bd = await Client.findOne({ name: /better.*drones/i });
if (bd) {
  // Check if key is already in use by a different client
  const conflict = await Client.findOne({ accessKey: 'BDVI885', _id: { $ne: bd._id } });
  if (conflict) {
    console.log('BDVI885 already used by another client — skipping key update');
  } else {
    bd.accessKey = 'BDVI885';
    await bd.save();
    console.log(`Set Better Drones (${bd.name}) access key to BDVI885`);
  }
} else {
  console.log('Better Drones client not found — skipping key update');
}

await mongoose.disconnect();
console.log('Done.');
