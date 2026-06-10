import { useEffect, useState } from 'react';
import { accessWithKey, fetchDashboard, keyStore, pageStore } from './api';
import KeyGate from './components/KeyGate.jsx';
import Dashboard from './components/Dashboard.jsx';
import DashboardSkeleton from './components/DashboardSkeleton.jsx';
import WarmUp from './components/WarmUp.jsx';

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Show warm-up screen until backend responds.
  if (!ready) return <WarmUp onReady={() => setReady(true)} />;

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

  if (!session) {
    // Try restoring saved key after warm-up.
    const saved = keyStore.get();
    if (saved) handleKey(saved, true);
    return <KeyGate onSubmit={handleKey} error={error} />;
  }

  return <AppShell
    session={session} projectId={projectId} setProjectId={setProjectId}
    dashboard={dashboard} setDashboard={setDashboard}
    loading={loading} setLoading={setLoading}
    error={error} setError={setError}
    onLogout={() => { keyStore.clear(); setSession(null); setProjectId(''); setDashboard(null); }}
  />;
}

function AppShell({ session, projectId, setProjectId, dashboard, setDashboard, loading, setLoading, error, setError, onLogout }) {
  useEffect(() => {
    if (!projectId) return;
    pageStore.setProject(projectId);
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchDashboard(projectId, session.key);
        if (active) setDashboard(data);
      } catch (e) {
        if (active) setError(e.response?.data?.error || 'Failed to load dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { active = false; clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◢</span> प्रतिविम्ब
          <span className="muted"> · Client</span>
        </div>
        <div className="topbar-right">
          <span className="client-name">{session.client.name}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project…</option>
            {session.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="ghost" onClick={onLogout}>Exit</button>
        </div>
      </header>

      {!projectId && <div className="empty">Choose a project above to view its progress.</div>}
      {error && <div className="error-banner">{error}</div>}
      {projectId && loading && !dashboard && <DashboardSkeleton />}
      {projectId && dashboard && (
        <Dashboard data={dashboard} projectId={projectId} accessKey={session.key} />
      )}
    </div>
  );
}
