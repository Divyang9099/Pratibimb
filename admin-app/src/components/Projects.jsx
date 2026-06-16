import { useEffect, useState } from 'react';
import { api } from '../api';
import ProjectDetail from './ProjectDetail.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    name: '',
    client: '',
    totalTowers: 20,
    startDate: today(),
    kml: '',
    generateTowers: true,
    requirePhoto: true,
  });
  const [msg, setMsg] = useState('');

  const load = () => api.get('/admin/projects').then((r) => setProjects(r.data.projects));
  useEffect(() => {
    load();
    api.get('/admin/clients').then((r) => setClients(r.data.clients));
  }, []);

  async function create(e) {
    e.preventDefault();
    setMsg('');
    if (!form.name || !form.client) {
      setMsg('Project name and client are required');
      return;
    }
    try {
      await api.post('/admin/projects', { ...form, totalTowers: Number(form.totalTowers) });
      setForm({ name: '', client: '', totalTowers: 20, startDate: today(), kml: '', generateTowers: true, requirePhoto: true });
      load();
    } catch (e2) {
      setMsg(e2.response?.data?.error || 'Failed');
    }
  }

  async function onKmlFile(file) {
    const text = await file.text();
    setForm((f) => ({ ...f, kml: text }));
  }

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  function startEdit(p) {
    setEditingId(p._id);
    setEditForm({
      name: p.name,
      totalTowers: p.totalTowers,
      startDate: p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : '',
      active: p.active,
      requirePhoto: p.requirePhoto !== false,
      kml: '', // only sent if a new file is chosen
    });
  }

  async function saveEdit(id) {
    const body = {
      name: editForm.name,
      totalTowers: Number(editForm.totalTowers),
      startDate: editForm.startDate || undefined,
      active: editForm.active,
      requirePhoto: editForm.requirePhoto,
    };
    if (editForm.kml) body.kml = editForm.kml; // replacing the KML re-syncs the map
    await api.put(`/admin/projects/${id}`, body);
    setEditingId(null);
    load();
  }

  async function removeProject(id) {
    if (!confirm('Delete this project? All its towers and logs will be removed.')) return;
    await api.delete(`/admin/projects/${id}`);
    load();
  }

  if (selected) {
    return <ProjectDetail projectId={selected} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div>
      <h1>Projects</h1>

      <form className="card stack" onSubmit={create}>
        <h3>New project</h3>
        <div className="form-grid">
          <div>
            <label>Project name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>Client *</label>
            <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Total towers</label>
            <input
              type="number"
              value={form.totalTowers}
              onChange={(e) => setForm({ ...form, totalTowers: e.target.value })}
            />
          </div>
          <div>
            <label>Start date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label>KML file (optional — adds the route + tower points to the map)</label>
          <input type="file" accept=".kml,.xml" onChange={(e) => e.target.files[0] && onKmlFile(e.target.files[0])} />
          {form.kml && <span className="ok"> KML loaded ({form.kml.length} chars)</span>}
        </div>
        <label className="checkrow">
          <input
            type="checkbox"
            checked={form.generateTowers}
            onChange={(e) => setForm({ ...form, generateTowers: e.target.checked })}
          />
          Auto-create towers numbered 1…{form.totalTowers}
        </label>
        <label className="checkrow">
          <input
            type="checkbox"
            checked={form.requirePhoto}
            onChange={(e) => setForm({ ...form, requirePhoto: e.target.checked })}
          />
          Require a field photo from the pilot on Start &amp; End Day
        </label>
        {msg && <div className="error">{msg}</div>}
        <button type="submit">Create project</button>
      </form>

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Total Towers</th>
              <th>Start</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) =>
              editingId === p._id ? (
                <tr key={p._id} className="editing">
                  <td data-label="Project"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td data-label="Client">{p.client?.name || '—'}</td>
                  <td data-label="Total Towers"><input type="number" value={editForm.totalTowers} onChange={(e) => setEditForm({ ...editForm, totalTowers: e.target.value })} /></td>
                  <td data-label="Start"><input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} /></td>
                  <td className="actions">
                    <label className="checkrow sm">
                      <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Active
                    </label>
                    <label className="checkrow sm">
                      <input type="checkbox" checked={editForm.requirePhoto} onChange={(e) => setEditForm({ ...editForm, requirePhoto: e.target.checked })} /> Photo
                    </label>
                    <label className="file-mini">
                      Replace KML
                      <input type="file" accept=".kml,.xml" onChange={async (e) => e.target.files[0] && setEditForm({ ...editForm, kml: await e.target.files[0].text() })} />
                    </label>
                    <button onClick={() => saveEdit(p._id)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={p._id}>
                  <td data-label="Project">{p.name}</td>
                  <td data-label="Client">{p.client?.name || '—'}</td>
                  <td data-label="Total Towers">{p.totalTowers}</td>
                  <td data-label="Start">{p.startDate ? new Date(p.startDate).toLocaleDateString() : '—'}</td>
                  <td className="actions">
                    <button className="secondary" onClick={() => setSelected(p._id)}>Open</button>
                    <button className="secondary" onClick={() => startEdit(p)}>Edit</button>
                    <button className="danger" onClick={() => removeProject(p._id)}>Delete</button>
                  </td>
                </tr>
              )
            )}
            {!projects.length && (
              <tr>
                <td colSpan="5" className="muted center">No projects yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
