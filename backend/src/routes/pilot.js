import { Router } from 'express';
import Project from '../models/Project.js';
import Tower from '../models/Tower.js';
import DailyLog from '../models/DailyLog.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadImage } from '../services/cloudinary.js';
import { notifyProjectUpdate } from '../services/socket.js';

const router = Router();
router.use(requireAuth, requireRole('pilot'));

// Helper: return start and end logs for this pilot + project on a specific date.
async function getTodayLogs(projectId, pilotId, dateStr) {
  let start;
  if (dateStr && !isNaN(new Date(dateStr).getTime())) {
    start = new Date(dateStr);
  } else {
    start = new Date();
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return DailyLog.find({
    project: projectId,
    pilot: pilotId,
    date: { $gte: start, $lt: end },
  })
    .sort({ createdAt: 1 })
    .lean();
}

// Projects the pilot can log against.
router.get('/projects', async (req, res) => {
  const projects = await Project.find({ active: true })
    .select('name totalTowers client')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ projects });
});

// Today's start/end status for a project — used by the frontend to drive
// the lifecycle: shows warnings, prevents double-start, etc.
router.get('/today-status/:projectId', async (req, res) => {
  const logs = await getTodayLogs(req.params.projectId, req.user._id, req.query.date);
  const startLog = logs.find((l) => l.type === 'start') || null;
  const endLog = logs.find((l) => l.type === 'end') || null;
  const nonWorkingLog = logs.find((l) => l.type === 'nonworking') || null;
  res.json({ started: !!startLog, ended: !!endLog, nonWorking: !!nonWorkingLog, startLog, endLog, nonWorkingLog });
});

// "Start Day" — morning open. Also handles non-working day logging.
router.post('/start-day', async (req, res) => {
  const { projectId, date, towerNo, image, note, nonWorking } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  if (!nonWorking && !towerNo) {
    return res.status(400).json({ error: 'projectId and towerNo are required' });
  }

  const logs = await getTodayLogs(projectId, req.user._id, date);
  const existingEntry = logs.find((l) => l.type === 'start' || l.type === 'nonworking');
  if (existingEntry) {
    const msg = existingEntry.type === 'nonworking'
      ? 'This date is already marked as a non-working day.'
      : 'Day already started. End today\'s session before starting a new one.';
    return res.status(409).json({ error: msg });
  }

  if (nonWorking) {
    const log = await DailyLog.create({
      project: projectId,
      pilot: req.user._id,
      type: 'nonworking',
      date: date ? new Date(date) : new Date(),
      towerNo: '',
      note: note || '',
    });
    notifyProjectUpdate(projectId);
    return res.status(201).json({ log });
  }

  const imageUrl = await uploadImage(image || '');
  const log = await DailyLog.create({
    project: projectId,
    pilot: req.user._id,
    type: 'start',
    date: date ? new Date(date) : new Date(),
    towerNo: String(towerNo),
    image: imageUrl,
    note,
  });
  notifyProjectUpdate(projectId);
  res.status(201).json({ log });
});

// "End Day" — evening close. Requires a start to exist; rejects if already ended.
router.post('/end-day', async (req, res) => {
  const { projectId, date, towerNo, image, note } = req.body || {};
  if (!projectId || !towerNo) {
    return res.status(400).json({ error: 'projectId and towerNo are required' });
  }

  const logs = await getTodayLogs(projectId, req.user._id, date);
  if (!logs.find((l) => l.type === 'start')) {
    return res.status(400).json({ error: 'You must start your day first before ending it.' });
  }
  if (logs.find((l) => l.type === 'end')) {
    return res.status(409).json({ error: 'Day already ended. Only one end-day entry per day is allowed.' });
  }

  const imageUrl = await uploadImage(image || '');
  const log = await DailyLog.create({
    project: projectId,
    pilot: req.user._id,
    type: 'end',
    date: date ? new Date(date) : new Date(),
    towerNo: String(towerNo),
    image: imageUrl,
    note,
  });
  notifyProjectUpdate(projectId);
  res.status(201).json({ log });
});

// Most recent unended session for this pilot + project (any date).
// Also detects if the latest entry was a non-working day, which blocks End Day.
router.get('/active-session/:projectId', async (req, res) => {
  const latestLog = await DailyLog.findOne({
    project: req.params.projectId,
    pilot: req.user._id,
    type: { $in: ['start', 'nonworking'] },
  }).sort({ date: -1, createdAt: -1 }).lean();

  if (!latestLog) return res.json({ session: null, ended: false, endLog: null, nonWorking: false });

  // Non-working day: End Day is not required
  if (latestLog.type === 'nonworking') {
    return res.json({ session: null, ended: false, endLog: null, nonWorking: true, nonWorkingLog: latestLog });
  }

  const dayStart = new Date(latestLog.date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const endLog = await DailyLog.findOne({
    project: req.params.projectId,
    pilot: req.user._id,
    type: 'end',
    date: { $gte: dayStart, $lt: dayEnd },
  }).lean();

  res.json({ session: latestLog, ended: !!endLog, endLog: endLog || null, nonWorking: false });
});

// All active pilots — used to populate the pilot selector in Data Update.
router.get('/pilots', async (req, res) => {
  const pilots = await User.find({ role: 'pilot', active: true })
    .select('name _id')
    .sort({ name: 1 })
    .lean();
  res.json({ pilots });
});

// Tower range for the data-update table.
// Returns each row with `alreadyCaptured` / `alreadyUploaded` flags so the
// frontend can highlight towers that were previously recorded.
router.get('/towers/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const from = parseInt(req.query.from, 10);
  const to = parseInt(req.query.to, 10);
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
    return res.status(400).json({ error: 'Provide a valid from <= to range' });
  }
  if (to - from > 1000) {
    return res.status(400).json({ error: 'Range too large (max 1000 towers)' });
  }

  const existing = await Tower.find({
    project: projectId,
    number: { $in: Array.from({ length: to - from + 1 }, (_, i) => String(from + i)) },
  }).lean();
  const byNumber = new Map(existing.map((t) => [t.number, t]));

  const rows = [];
  for (let n = from; n <= to; n += 1) {
    const t = byNumber.get(String(n));
    rows.push({
      number: String(n),
      dataCapture: t?.captured || false,
      dataUpload: t?.uploaded || false,
      issueReplace: t?.issueReplace || false,
      // These flags tell the UI which towers were already recorded before
      // this session so it can highlight them as warnings.
      alreadyCaptured: t?.captured || false,
      alreadyUploaded: t?.uploaded || false,
    });
  }
  res.json({ rows });
});

// Save the data-update table — drives all client KPIs and map colours.
router.post('/data-update', async (req, res) => {
  const { projectId, date, rows, pilotId } = req.body || {};
  if (!projectId || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'projectId and rows[] are required' });
  }
  const when = date ? new Date(date) : new Date();
  const attributeTo = pilotId || req.user._id;

  const ops = rows.map((row) => {
    const set = {
      captured: !!row.dataCapture,
      uploaded: !!row.dataUpload,
      issueReplace: !!row.issueReplace,
    };
    if (row.dataCapture) {
      set.capturedAt = when;
      set.capturedBy = attributeTo;
    } else {
      set.capturedAt = null;
    }
    if (row.dataUpload) {
      set.uploadedAt = when;
      set.uploadedBy = attributeTo;
    } else {
      set.uploadedAt = null;
    }
    return {
      updateOne: {
        filter: { project: projectId, number: String(row.number) },
        update: { $set: set },
        upsert: true,
      },
    };
  });

  if (ops.length) await Tower.bulkWrite(ops);
  notifyProjectUpdate(projectId);
  res.json({ updated: ops.length });
});

export default router;
