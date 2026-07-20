import { useCallback, useEffect, useRef, useState } from 'react';
import { accessWithKey, fetchDashboard, keyStore, pageStore } from './api';
import { useProjectLive, useLiveData } from './useProjectLive';
import { warmBackend } from './components/WarmUp.jsx';
import KeyGate from './components/KeyGate.jsx';
import Dashboard from './components/Dashboard.jsx';
import DashboardSkeleton from './components/DashboardSkeleton.jsx';
import { withRetry } from './components/WarmUp.jsx';

// Silent background ping so the Render free-tier server wakes up while the
// client is reading the page and typing their key.
warmBackend();

export default function App() {
  const [session, setSession] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Restore saved key on first load.
  useEffect(() => {
    const saved = keyStore.get();
    if (saved) handleKey(saved, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleKey(key, silent = false) {
    setError('');
    try {
      const data = await accessWithKey(key);
      keyStore.set(key);
      setSession({ ...data, key });
      const savedProject = pageStore.getProject();
      const match = data.projects.find((p) => p.id === savedProject);
      if (match) setProjectId(match.id);
      else if (data.projects.length === 1) setProjectId(data.projects[0].id);
    } catch (e) {
      if (!silent) setError(e.response?.data?.error || 'Could not validate key');
      keyStore.clear();
    }
  }

  // Read the session from a ref so `refresh` stays stable across renders and
  // doesn't re-subscribe the socket every time the dashboard updates.
  const sessionRef = useRef(null);
  sessionRef.current = session;

  // Background refresh, shared by the live socket push and the polling
  // fallback. Failures are swallowed so a blip never replaces a good
  // dashboard with an error banner.
  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !projectId) return;
    try {
      const data = await fetchDashboard(projectId, s.key);
      setDashboard(data);
      setError('');
    } catch {
      /* keep showing the last good dashboard */
    }
  }, [projectId]);

  // Live updates: the server pushes project-update whenever a pilot or admin
  // changes anything on this project, so the dashboard reflects it instantly.
  useProjectLive(projectId, refresh);

  // The project list itself also has to stay current — a project added,
  // renamed or deactivated for this client must appear without the client
  // re-entering their key. Only `projects` is replaced, so the stored key and
  // the current selection survive.
  useLiveData(() => {
    const s = sessionRef.current;
    if (!s?.key) return;
    accessWithKey(s.key)
      .then((data) => setSession((prev) => (prev ? { ...prev, projects: data.projects } : prev)))
      .catch(() => { /* keep the current list on a transient failure */ });
  });

  // First load for a project, plus a slow poll as a safety net in case a
  // socket event is missed or the connection is down.
  useEffect(() => {
    if (!session || !projectId) return;
    pageStore.setProject(projectId);
    let active = true;

    (async () => {
      setLoading(true);
      try {
        // Retry through cold-starts on the first load only.
        const data = await withRetry(() => fetchDashboard(projectId, session.key));
        if (active) { setDashboard(data); setError(''); }
      } catch (e) {
        if (active) setError(e.response?.data?.error || 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    })();

    const t = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(t); };
  }, [session, projectId, refresh]);

  function logout() {
    keyStore.clear();
    setSession(null);
    setProjectId('');
    setDashboard(null);
  }

  if (!session) return <KeyGate onSubmit={handleKey} error={error} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <img src="/logo.png" alt="प्रतिबिम्ब:" className="brand-logo" />
            <span className="brand-role">Client</span>
          </div>
        </div>
      </header>

      <div className="project-bar">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— Select a project —</option>
          {session.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <a href="/client-guide.html" target="_blank" rel="noreferrer" className="guide-btn">
          Guide
        </a>
        <button className="ghost" onClick={logout}>Exit</button>
      </div>

      {!projectId && <div className="empty">Choose a project above to view its progress.</div>}
      {error && <div className="error-banner">{error}</div>}
      {projectId && loading && !dashboard && <DashboardSkeleton />}
      {projectId && dashboard && (
        <Dashboard data={dashboard} projectId={projectId} accessKey={session.key} />
      )}
    </div>
  );
}
