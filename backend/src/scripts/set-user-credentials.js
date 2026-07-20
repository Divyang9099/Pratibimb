import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

// Non-destructive helper to change a single user's login ID and password
// without wiping the database (unlike seed.js).
//
// Usage:
//   node src/scripts/set-user-credentials.js <currentLoginId> <newLoginId> <newPassword>
// Example:
//   node src/scripts/set-user-credentials.js admin someone@example.com '<new-password>'
//
// Pass real credentials on the command line only — never write them into this
// file. This repo is public.

const [, , currentLoginId, newLoginId, newPassword] = process.argv;

async function run() {
  if (!currentLoginId || !newLoginId || !newPassword) {
    console.error('Usage: node src/scripts/set-user-credentials.js <currentLoginId> <newLoginId> <newPassword>');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in environment variables');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ loginId: String(currentLoginId).toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with loginId "${currentLoginId}"`);
    process.exit(1);
  }

  const newId = String(newLoginId).toLowerCase().trim();
  const clash = await User.findOne({ loginId: newId, _id: { $ne: user._id } });
  if (clash) {
    console.error(`loginId "${newId}" is already in use by another account`);
    process.exit(1);
  }

  user.loginId = newId;
  await user.setPassword(newPassword);
  await user.save();

  console.log(`\n✓ Updated ${user.role} account`);
  console.log(`  Login ID : ${user.loginId}`);
  console.log(`  Password : ${newPassword}\n`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
