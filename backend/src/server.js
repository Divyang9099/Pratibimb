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

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
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
