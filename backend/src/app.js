import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/client.js';
import pilotRoutes from './routes/pilot.js';
import adminRoutes from './routes/admin.js';

const app = express();

const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      // Check if origin matches allowed origins list
      if (origins.includes(origin)) {
        return callback(null, true);
      }

      // Automatically allow all Vercel deployment URLs and localhost
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      const isVercel = /\.vercel\.app$/.test(origin);

      if (isLocalhost || isVercel) {
        return callback(null, true);
      }

      // If origins array is empty, default to allowing all in development/staging
      if (origins.length === 0) {
        return callback(null, true);
      }

      // Reject otherwise
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
// Field reference images can be base64 data URIs, so allow a large body.
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/pilot', pilotRoutes);
app.use('/api/admin', adminRoutes);

// Fallback error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', detail: err.message });
});

export default app;
