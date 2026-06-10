import { Router } from 'express';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import DailyLog from '../models/DailyLog.js';
import { buildDashboard } from '../services/analytics.js';

const router = Router();

// Resolve the client owning a key, or null. Used to gate every client call.
async function clientFromKey(key) {
  if (!key) return null;
  return Client.findOne({ accessKey: String(key).trim().toUpperCase(), active: true });
}

// Step 1: client enters their access key -> we return the client name and
// the list of projects they're allowed to view.
router.post('/access', async (req, res) => {
  const client = await clientFromKey(req.body?.key);
  if (!client) return res.status(401).json({ error: 'Invalid or inactive access key' });

  const projects = await Project.find({ client: client._id, active: true })
    .select('name totalTowers startDate')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    client: { id: client._id, name: client.name },
    projects: projects.map((p) => ({
      id: p._id,
      name: p.name,
      totalTowers: p.totalTowers,
      startDate: p.startDate,
    })),
  });
});

// Step 2: client selects a project -> full dashboard payload.
// Key is required again so the link can't be shared without the key.
router.get('/dashboard/:projectId', async (req, res) => {
  const client = await clientFromKey(req.query.key);
  if (!client) return res.status(401).json({ error: 'Invalid or inactive access key' });

  const project = await Project.findOne({ _id: req.params.projectId, client: client._id });
  if (!project) return res.status(404).json({ error: 'Project not found for this client' });

  const data = await buildDashboard(project._id);
  res.json(data);
});

// Return field log photos for a project (start/end day images with metadata).
// Client can see all daily photo evidence for their project.
router.get('/photos/:projectId', async (req, res) => {
  const client = await clientFromKey(req.query.key);
  if (!client) return res.status(401).json({ error: 'Invalid or inactive access key' });

  const project = await Project.findOne({ _id: req.params.projectId, client: client._id });
  if (!project) return res.status(404).json({ error: 'Project not found for this client' });

  const photos = await DailyLog.find({ project: project._id })
    .populate('pilot', 'name')
    .sort({ date: -1, createdAt: -1 })
    .select('type date towerNo image note pilot createdAt')
    .lean();

  res.json({ photos });
});

export default router;
