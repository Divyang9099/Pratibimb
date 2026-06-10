import { useEffect, useState } from 'react';
import { accessWithKey, fetchDashboard, keyStore, pageStore } from './api';
import { warmBackend } from './components/WarmUp.jsx';
import KeyGate from './components/KeyGate.jsx';
import Dashboard from './components/Dashboard.jsx';
import DashboardSkeleton from './components/DashboardSkeleton.jsx';
import { socket } from './socket';

// Kick off a silent background ping so the free Render server wakes up
// while the client is typing their access key.
warmBackend();

export default function App() {
  const [session, setSession] = useState(null); // { client, projects, key }
  const [projectId, setProjectId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Restore key + project on first load.
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
      // Restore last viewed project if still in the list.
      const savedProject = pageStore.getProject();
      const match = data.projects.find((p) => p.id === savedProject);
      if (match) setProjectId(match.id);
      else if (data.projects.length === 1) setProjectId(data.projects[0].id);
    } catch (e) {
      if (!silent) setError(e.response?.data?.error || 'Could not validate key');
      keyStore.clear();
    }
  }

  // Connect/disconnect socket based on session.
  useEffect(() => {
    if (!session) {
      socket.disconnect();
      return;
    }
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [session]);

  // Reload dashboard whenever project changes; listen for socket updates to instantly refresh.
  useEffect(() => {
    if (!session || !projectId) return;
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

    socket.emit('join-project', projectId);

    const handleUpdate = (data) => {
      if (data.projectId === projectId) {
        load();
      }
    };

    socket.on('project-update', handleUpdate);

    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
      socket.off('project-update', handleUpdate);
      socket.emit('leave-project', projectId);
    };
  }, [session, projectId]);

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
        <div className="brand">
          <span className="logo">◢</span> प्रतिविम्ब:
          <span className="muted"> · Client</span>
        </div>
        <div className="topbar-right">
          <span className="client-name">{session.client.name}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project…</option>
            {session.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={logout}>
            Exit
          </button>
        </div>
      </header>

      {!projectId && (
        <div className="empty">Choose a project above to view its progress.</div>
      )}
      {error && <div className="error-banner">{error}</div>}
      {projectId && loading && !dashboard && <DashboardSkeleton />}
      {projectId && dashboard && (
        <Dashboard data={dashboard} projectId={projectId} accessKey={session.key} />
      )}
    </div>
  );
}
