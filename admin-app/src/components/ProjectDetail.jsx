import { useEffect, useState } from 'react';
import { api } from '../api';
import { socket } from '../socket';

// Admin view of a single project: KPI summary + editable tower table +
// field logs. Admin can toggle any tower's capture/upload/issue state.
export default function ProjectDetail({ projectId, onBack }) {
  const [dash, setDash] = useState(null);
  const [towers, setTowers] = useState([]);
  const [logs, setLogs] = useState([]);

  async function loadAll() {
    const [d, t, l] = await Promise.all([
      api.get(`/admin/dashboard/${projectId}`),
      api.get(`/admin/projects/${projectId}/towers`),
      api.get(`/admin/projects/${projectId}/logs`),
    ]);
    setDash(d.data);
    setTowers(t.data.towers);
    setLogs(l.data.logs);
  }

  useEffect(() => {
    loadAll();

    socket.emit('join-project', projectId);

    const handleUpdate = (data) => {
      if (data.projectId === projectId) {
        loadAll();
      }
    };

    socket.on('project-update', handleUpdate);

    return () => {
      socket.off('project-update', handleUpdate);
      socket.emit('leave-project', projectId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function toggle(tower, field) {
    const value = !tower[field];
    await api.put(`/admin/towers/${projectId}/${tower.number}`, { [field]: value });
    loadAll();
  }

  const [newTower, setNewTower] = useState('');
  async function addTower() {
    const n = newTower.trim();
    if (!n) return;
    // Upserting a tower by number creates it if missing.
    await api.put(`/admin/towers/${projectId}/${n}`, {});
    setNewTower('');
    loadAll();
  }

  async function deleteProject() {
    if (!confirm('Delete this entire project, its towers and logs?')) return;
    await api.delete(`/admin/projects/${projectId}`);
    onBack();
  }

  const [resetMsg, setResetMsg] = useState('');
  async function resetData() {
    if (!confirm('Reset ALL tower capture/upload data and delete all field logs for this project? This cannot be undone.')) return;
    setResetMsg('Resetting…');
    try {
      await api.post(`/admin/projects/${projectId}/reset-data`);
      setResetMsg('All data reset.');
      loadAll();
    } catch (e) {
      setResetMsg(e.response?.data?.error || 'Reset failed');
    }
  }

  const [syncMsg, setSyncMsg] = useState('');
  async function syncKml() {
    setSyncMsg('Syncing…');
    try {
      const { data } = await api.post(`/admin/projects/${projectId}/sync-kml`);
      setSyncMsg(`Placed ${data.updated} towers · ${data.routePoints} route points.`);
      loadAll();
    } catch (e) {
      setSyncMsg(e.response?.data?.error || 'Sync failed');
    }
  }

  if (!dash) return <div>Loading…</div>;
  const k = dash.kpi;

  return (
    <div>
      <button className="ghost" onClick={onBack}>
        ← Back to projects
      </button>
      <div className="detail-head">
        <h1>{dash.project.name}</h1>
        <div className="head-actions">
          <button className="secondary" onClick={syncKml}>
            Sync KML → map
          </button>
          {syncMsg && <span className="muted">{syncMsg}</span>}
          <button className="secondary" onClick={resetData}>
            Reset data
          </button>
          {resetMsg && <span className="muted">{resetMsg}</span>}
          <button className="danger" onClick={deleteProject}>
            Delete project
          </button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi">
          <span>Total</span>
          <b>{k.totalTower}</b>
        </div>
        <div className="kpi">
          <span>Captured</span>
          <b className="green">
            {k.capture.done} ({k.capture.pct}%)
          </b>
        </div>
        <div className="kpi">
          <span>Uploaded</span>
          <b className="blue">
            {k.upload.done} ({k.upload.pct}%)
          </b>
        </div>
        <div className="kpi">
          <span>Capture avg/day</span>
          <b>{dash.prediction.dailyCaptureAvg}</b>
        </div>
        <div className="kpi">
          <span>Remaining capture days</span>
          <b>{dash.prediction.remainingCaptureDays ?? '—'}</b>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <h3>Towers ({towers.length})</h3>
          <div className="add-tower">
            <input
              placeholder="Tower no."
              value={newTower}
              onChange={(e) => setNewTower(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTower()}
            />
            <button className="secondary" onClick={addTower}>Add tower</button>
          </div>
          <div className="table-scroll">
            <table className="grid compact">
              <thead>
                <tr>
                  <th>Tower</th>
                  <th>Capture</th>
                  <th>Upload</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {towers.map((t) => (
                  <tr key={t._id}>
                    <td>{t.number}</td>
                    <td>
                      <input type="checkbox" checked={!!t.captured} onChange={() => toggle(t, 'captured')} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!t.uploaded} onChange={() => toggle(t, 'uploaded')} />
                    </td>
                    <td>
                      <input type="checkbox" checked={!!t.issueReplace} onChange={() => toggle(t, 'issueReplace')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col">
          <h3>Field logs ({logs.length})</h3>
          <div className="table-scroll">
            <table className="grid compact">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Tower</th>
                  <th>Pilot</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td>
                      <span className={`tag ${l.type}`}>{l.type}</span>
                    </td>
                    <td>{new Date(l.date).toLocaleDateString()}</td>
                    <td>{l.towerNo}</td>
                    <td>{l.pilot?.name || '—'}</td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td colSpan="4" className="muted center">
                      No logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
