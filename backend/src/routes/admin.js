import { Router } from 'express';
import User from '../models/User.js';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import Tower from '../models/Tower.js';
import DailyLog from '../models/DailyLog.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildDashboard } from '../services/analytics.js';
import { parseKml } from '../services/kml.js';
import { notifyProjectUpdate } from '../services/socket.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// Parse a project's KML and apply it: write lat/lng onto matching Tower
// docs (by number) and store the route line on the project. Returns the
// number of towers updated. Tower docs are upserted so points that exist
// in the KML but not yet as towers still get placed on the map.
// Natural sort for tower numbers stored as strings ("2" before "10",
// "25" before "250"). Falls back to text compare for non-numeric labels.
function compareTowerNumbers(a, b) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

async function applyKml(projectId, kml) {
  const { towers, route } = parseKml(kml);

  if (towers.length) {
    await Tower.bulkWrite(
      towers.map((t) => ({
        updateOne: {
          filter: { project: projectId, number: t.number },
          update: { $set: { lat: t.lat, lng: t.lng } },
          upsert: true,
        },
      }))
    );
  }
  await Project.findByIdAndUpdate(projectId, { $set: { route } });
  return { updated: towers.length, routePoints: route.length };
}

/* ----------------------------- Clients ----------------------------- */

router.get('/clients', async (req, res) => {
  const clients = await Client.find().sort({ createdAt: -1 }).lean();
  res.json({ clients });
});

router.post('/clients', async (req, res) => {
  const { name, contactEmail, contactPhone } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const client = await Client.create({
    name,
    contactEmail,
    contactPhone,
    accessKey: Client.generateKey(),
  });
  res.status(201).json({ client });
});

router.put('/clients/:id', async (req, res) => {
  const { name, contactEmail, contactPhone, active } = req.body || {};
  const client = await Client.findByIdAndUpdate(
    req.params.id,
    { $set: { name, contactEmail, contactPhone, active } },
    { new: true }
  );
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ client });
});

// Set a specific custom access key on a client.
router.post('/clients/:id/set-key', async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key is required' });
  const k = String(key).trim().toUpperCase();
  const conflict = await Client.findOne({ accessKey: k, _id: { $ne: req.params.id } });
  if (conflict) return res.status(409).json({ error: 'Key already used by another client' });
  const client = await Client.findByIdAndUpdate(
    req.params.id,
    { $set: { accessKey: k } },
    { new: true }
  );
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json({ client });
});

// Rotate (regenerate) a client's access key.
router.post('/clients/:id/rotate-key', async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  client.accessKey = Client.generateKey();
  await client.save();
  res.json({ client });
});

router.delete('/clients/:id', async (req, res) => {
  await Client.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ Pilots ----------------------------- */

router.get('/pilots', async (req, res) => {
  const pilots = await User.find({ role: 'pilot' }).sort({ createdAt: -1 }).lean();
  res.json({ pilots: pilots.map((p) => ({ ...p, passwordHash: undefined })) });
});

router.post('/pilots', async (req, res) => {
  const { name, loginId, password, phone } = req.body || {};
  if (!name || !loginId || !password) {
    return res.status(400).json({ error: 'name, loginId and password are required' });
  }
  const exists = await User.findOne({ loginId: loginId.toLowerCase().trim() });
  if (exists) return res.status(409).json({ error: 'loginId already in use' });

  const pilot = new User({ name, loginId, role: 'pilot', phone });
  await pilot.setPassword(password);
  await pilot.save();
  res.status(201).json({ pilot: pilot.toSafeJSON() });
});

router.put('/pilots/:id', async (req, res) => {
  const { name, phone, active, password } = req.body || {};
  const pilot = await User.findOne({ _id: req.params.id, role: 'pilot' });
  if (!pilot) return res.status(404).json({ error: 'Pilot not found' });
  if (name != null) pilot.name = name;
  if (phone != null) pilot.phone = phone;
  if (active != null) pilot.active = active;
  if (password) await pilot.setPassword(password);
  await pilot.save();
  res.json({ pilot: pilot.toSafeJSON() });
});

router.delete('/pilots/:id', async (req, res) => {
  await User.deleteOne({ _id: req.params.id, role: 'pilot' });
  res.json({ ok: true });
});

/* ----------------------------- Projects ---------------------------- */

router.get('/projects', async (req, res) => {
  const projects = await Project.find().populate('client', 'name').sort({ createdAt: -1 }).lean();
  res.json({ projects });
});

router.post('/projects', async (req, res) => {
  const { name, client, totalTowers, kml, description, startDate, generateTowers } = req.body || {};
  if (!name || !client) return res.status(400).json({ error: 'name and client are required' });

  const project = await Project.create({
    name,
    client,
    totalTowers: totalTowers || 0,
    kml: kml || '',
    description,
    startDate: startDate ? new Date(startDate) : undefined,
  });

  // Optionally pre-create Tower docs numbered 1..totalTowers.
  if (generateTowers && totalTowers > 0) {
    const docs = Array.from({ length: totalTowers }, (_, i) => ({
      project: project._id,
      number: String(i + 1),
    }));
    await Tower.insertMany(docs, { ordered: false }).catch(() => {});
  }

  // Place towers + route on the map from the KML, if one was provided.
  if (kml) await applyKml(project._id, kml);

  res.status(201).json({ project });
});

router.put('/projects/:id', async (req, res) => {
  const { name, totalTowers, kml, description, startDate, active } = req.body || {};
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { $set: { name, totalTowers, kml, description, startDate, active } },
    { new: true }
  );
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Re-apply coordinates whenever the KML is (re)uploaded.
  if (kml) await applyKml(project._id, kml);

  notifyProjectUpdate(project._id);
  res.json({ project });
});

// Backfill: re-parse a project's stored KML onto its towers + route.
router.post('/projects/:id/sync-kml', async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.kml) return res.status(400).json({ error: 'Project has no KML to sync' });

  const result = await applyKml(project._id, project.kml);
  notifyProjectUpdate(project._id);
  res.json(result);
});

router.delete('/projects/:id', async (req, res) => {
  await Tower.deleteMany({ project: req.params.id });
  await DailyLog.deleteMany({ project: req.params.id });
  await Project.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// Reset all tower progress + daily logs for a project (useful for testing).
router.post('/projects/:id/reset-data', async (req, res) => {
  await Tower.updateMany(
    { project: req.params.id },
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
  await DailyLog.deleteMany({ project: req.params.id });
  notifyProjectUpdate(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------ Towers ----------------------------- */

router.get('/projects/:id/towers', async (req, res) => {
  const towers = await Tower.find({ project: req.params.id }).lean();
  towers.sort((a, b) => compareTowerNumbers(a.number, b.number));
  res.json({ towers });
});

// Load a tower-number range for the bulk Data Update editor.
// Mirrors the pilot's /pilot/towers endpoint but also returns the existing
// issue note so the admin can see/edit it.
router.get('/projects/:id/towers-range', async (req, res) => {
  try {
    const projectId = req.params.id;
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
        issueNote: t?.notes || '',
        alreadyCaptured: t?.captured || false,
        alreadyUploaded: t?.uploaded || false,
      });
    }
    res.json({ rows });
  } catch (err) {
    console.error('GET /projects/:id/towers-range error:', err);
    res.status(500).json({ error: 'Failed to load towers' });
  }
});

// Bulk save the Data Update table (admin). Optionally attribute the
// capture/upload to a specific pilot; otherwise it's left as-is.
router.post('/projects/:id/data-update', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { date, rows, pilotId } = req.body || {};
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows[] is required' });
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
    notifyProjectUpdate(projectId);
    res.json({ updated: ops.length });
  } catch (err) {
    console.error('POST /projects/:id/data-update error:', err);
    res.status(500).json({ error: err.message || 'Failed to save data update' });
  }
});

// Upsert a single tower (admin manual edit, incl. lat/lng for the map).
router.put('/towers/:projectId/:number', async (req, res) => {
  const { captured, uploaded, issueReplace, lat, lng, notes } = req.body || {};
  const set = {};
  if (captured != null) {
    set.captured = captured;
    set.capturedAt = captured ? new Date() : null;
  }
  if (uploaded != null) {
    set.uploaded = uploaded;
    set.uploadedAt = uploaded ? new Date() : null;
  }
  if (issueReplace != null) set.issueReplace = issueReplace;
  if (lat != null) set.lat = lat;
  if (lng != null) set.lng = lng;
  if (notes != null) set.notes = notes;

  const tower = await Tower.findOneAndUpdate(
    { project: req.params.projectId, number: req.params.number },
    { $set: set },
    { new: true, upsert: true }
  );
  notifyProjectUpdate(req.params.projectId);
  res.json({ tower });
});

/* ------------------------- Dashboard & logs ------------------------ */

router.get('/dashboard/:projectId', async (req, res) => {
  const data = await buildDashboard(req.params.projectId);
  if (!data) return res.status(404).json({ error: 'Project not found' });
  res.json(data);
});

router.get('/projects/:id/logs', async (req, res) => {
  const logs = await DailyLog.find({ project: req.params.id })
    .populate('pilot', 'name loginId')
    .sort({ date: -1 })
    .lean();
  res.json({ logs });
});

export default router;
