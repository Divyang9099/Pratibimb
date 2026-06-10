import { Router } from 'express';
import User from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

// Shared login for admin & pilot. The frontend can pass an expectedRole
// to keep e.g. the pilot app from accepting an admin account.
router.post('/login', async (req, res) => {
  const { loginId, password, expectedRole } = req.body || {};
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password are required' });
  }

  const user = await User.findOne({ loginId: String(loginId).toLowerCase().trim() });
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await user.verifyPassword(password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  if (expectedRole && user.role !== expectedRole) {
    return res.status(403).json({ error: `This account is not a ${expectedRole}` });
  }

  return res.json({ token: signToken(user), user: user.toSafeJSON() });
});

// Returns the current user (used by the apps to restore a session).
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

export default router;
