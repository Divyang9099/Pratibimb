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

// Helper: return all logs for this pilot + project on a specific date.
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

// Safely fire socket notification — never throw.
function notify(projectId) {
  try { notifyProjectUpdate(projectId); } catch (_) {}
}

// Projects the pilot can log against.
router.get('/projects', async (req, res) => {
  try {
    const projects = await Project.find({ active: true })
      .select('name totalTowers client')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ projects });
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Start/end status for a project on a specific date.
router.get('/today-status/:projectId', async (req, res) => {
  try {
    const logs = await getTodayLogs(req.params.projectId, req.user._id, req.query.date);
    const startLog = logs.find((l) => l.type === 'start') || null;
    const endLog = logs.find((l) => l.type === 'end') || null;
    const nonWorkingLog = logs.find((l) => l.type === 'nonworking') || null;
    res.json({ started: !!startLog, ended: !!endLog, nonWorking: !!nonWorkingLog, startLog, endLog, nonWorkingLog });
  } catch (err) {
    console.error('GET /today-status error:', err);
    res.status(500).json({ error: 'Failed to load day status' });
  }
});

// Start Day — also handles non-working day logging.
router.post('/start-day', async (req, res) => {
  try {
    const { projectId, date, towerNo, image, note, nonWorking } = req.body || {};
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }
    if (!nonWorking && !towerNo) {
      return res.status(400).json({ error: 'Tower number is required' });
    }

    const logs = await getTodayLogs(projectId, req.user._id, date);
    const existing = logs.find((l) => l.type === 'start' || l.type === 'nonworking');
    if (existing) {
      const msg = existing.type === 'nonworking'
        ? 'This date is already marked as a non-working day.'
        : "Day already started. End today's session before starting a new one.";
      return res.status(409).json({ error: msg });
    }

    if (nonWorking) {
      if (!note || !note.trim()) {
        return res.status(400).json({ error: 'Reason is required for a non-working day.' });
      }
      const log = await DailyLog.create({
        project: projectId,
        pilot: req.user._id,
        type: 'nonworking',
        date: date ? new Date(date) : new Date(),
        towerNo: '',
        note: note.trim(),
      });
      notify(projectId);
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
      note: note || '',
    });
    notify(projectId);
    res.status(201).json({ log });
  } catch (err) {
    console.error('POST /start-day error:', err);
    res.status(500).json({ error: err.message || 'Failed to save start day' });
  }
});

// End Day — requires a start on the same date; rejects if already ended.
router.post('/end-day', async (req, res) => {
  try {
    const { projectId, date, towerNo, image, note } = req.body || {};
    if (!projectId || !towerNo) {
      return res.status(400).json({ error: 'projectId and towerNo are required' });
    }

    const logs = await getTodayLogs(projectId, req.user._id, date);
    if (!logs.find((l) => l.type === 'start')) {
      return res.status(400).json({ error: 'You must start your day first before ending it.' });
    }
    if (logs.find((l) => l.type === 'end')) {
      return res.status(409).json({ error: 'Day already ended.' });
    }

    const imageUrl = await uploadImage(image || '');
    const log = await DailyLog.create({
      project: projectId,
      pilot: req.user._id,
      type: 'end',
      date: date ? new Date(date) : new Date(),
      towerNo: String(towerNo),
      image: imageUrl,
      note: note || '',
    });
    notify(projectId);
    res.status(201).json({ log });
  } catch (err) {
    console.error('POST /end-day error:', err);
    res.status(500).json({ error: err.message || 'Failed to save end day' });
  }
});

// Most recent unended session for End Day date auto-detect.
router.get('/active-session/:projectId', async (req, res) => {
  try {
    const latestLog = await DailyLog.findOne({
      project: req.params.projectId,
      pilot: req.user._id,
      type: { $in: ['start', 'nonworking'] },
    }).sort({ date: -1, createdAt: -1 }).lean();

    if (!latestLog) return res.json({ session: null, ended: false, endLog: null, nonWorking: false });

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
  } catch (err) {
    console.error('GET /active-session error:', err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// All active pilots — for the Data Update pilot selector.
router.get('/pilots', async (req, res) => {
  try {
    const pilots = await User.find({ role: 'pilot', active: true })
      .select('name _id')
      .sort({ name: 1 })
      .lean();
    res.json({ pilots });
  } catch (err) {
    console.error('GET /pilots error:', err);
    res.status(500).json({ error: 'Failed to load pilots' });
  }
});

// Tower range for the data-update table.
router.get('/towers/:projectId', async (req, res) => {
  try {
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
        alreadyCaptured: t?.captured || false,
        alreadyUploaded: t?.uploaded || false,
      });
    }
    res.json({ rows });
  } catch (err) {
    console.error('GET /towers error:', err);
    res.status(500).json({ error: 'Failed to load towers' });
  }
});

// Save the data-update table.
router.post('/data-update', async (req, res) => {
  try {
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
      if (row.dataCapture) { set.capturedAt = when; set.capturedBy = attributeTo; }
      else { set.capturedAt = null; }
      if (row.dataUpload) { set.uploadedAt = when; set.uploadedBy = attributeTo; }
      else { set.uploadedAt = null; }
      if (row.issueReplace && row.issueNote) { set.notes = String(row.issueNote).trim(); }
      else if (!row.issueReplace) { set.notes = ''; }
      return {
        updateOne: {
          filter: { project: projectId, number: String(row.number) },
          update: { $set: set },
          upsert: true,
        },
      };
    });

    if (ops.length) await Tower.bulkWrite(ops);
    notify(projectId);
    res.json({ updated: ops.length });
  } catch (err) {
    console.error('POST /data-update error:', err);
    res.status(500).json({ error: err.message || 'Failed to save data update' });
  }
});

export default router;
