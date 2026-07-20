import 'dotenv/config';
import mongoose from 'mongoose';
import http from 'http';
import app, { origins } from './app.js';
import { initSocket } from './services/socket.js';

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry rather than exit: a DNS hiccup or a laptop waking from sleep used to
// kill the process, and under nodemon it then sat dead until an unrelated file
// was touched — which looks exactly like the API being broken.
async function connectWithRetry(maxAttempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      return;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const wait = Math.min(2000 * 2 ** (attempt - 1), 30000);
      console.error(`✗ MongoDB connect failed (${attempt}/${maxAttempts}): ${err.message}`);
      if (/querySrv|ENOTFOUND|EAI_AGAIN/i.test(err.message)) {
        console.error('  ↳ This is a DNS failure, not a credentials problem. If it persists,');
        console.error('    swap MONGO_URI to the non-SRV seed-list form (see .env comments).');
      }
      console.error(`  retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

async function start() {
  try {
    await connectWithRetry();
    console.log('✓ MongoDB connected');

    const server = http.createServer(app);
    initSocket(server, origins);

    server.listen(PORT, () => console.log(`✓ API listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('✗ Failed to start:', err.message);
    process.exit(1);
  }
}

start();
