import { useEffect, useState } from 'react';
import { api } from '../api';

const empty = { name: '', loginId: '', password: '', phone: '' };

export default function Pilots() {
  const [pilots, setPilots] = useState([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [revealed, setRevealed] = useState({}); // { [pilotId]: true } -> show password

  const load = () => api.get('/admin/pilots').then((r) => setPilots(r.data.pilots));
  useEffect(() => {
    load();
  }, []);

  function toggleReveal(id) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }));
  }

  async function create(e) {
    e.preventDefault();
    setMsg('');
    if (!form.name || !form.loginId || !form.password) {
      setMsg('Name, login ID and password are required');
      return;
    }
    try {
      await api.post('/admin/pilots', form);
      setForm(empty);
      load();
    } catch (e2) {
      setMsg(e2.response?.data?.error || 'Failed');
    }
  }

  function startEdit(p) {
    setEditingId(p._id);
    setEditForm({ name: p.name, loginId: p.loginId, phone: p.phone || '', password: '', active: p.active });
  }

  async function saveEdit(id) {
    setMsg('');
    // loginId, name, phone, active always sent; password only when changed.
    const body = {
      name: editForm.name,
      loginId: editForm.loginId,
      phone: editForm.phone,
      active: editForm.active,
    };
    if (editForm.password) body.password = editForm.password;
    try {
      await api.put(`/admin/pilots/${id}`, body);
      setEditingId(null);
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to update pilot');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this pilot?')) return;
    await api.delete(`/admin/pilots/${id}`);
    load();
  }

  return (
    <div>
      <h1>Pilots</h1>
      <p className="muted">Pilots log in to the pilot app with these credentials. You can view and change a pilot's login ID and password here.</p>

      <form className="inline-form" onSubmit={create}>
        <input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Login ID *" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
        <input placeholder="Password *" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button type="submit">Add pilot</button>
      </form>
      {msg && <div className="error">{msg}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID</th>
              <th>Phone</th>
              <th>Password</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pilots.map((p) =>
              editingId === p._id ? (
                <tr key={p._id} className="editing">
                  <td data-label="Name"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td data-label="Login ID"><input value={editForm.loginId} onChange={(e) => setEditForm({ ...editForm, loginId: e.target.value })} /></td>
                  <td data-label="Phone"><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td data-label="New password"><input placeholder="leave blank to keep" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} /></td>
                  <td data-label="Status">
                    <label className="checkrow sm">
                      <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Active
                    </label>
                  </td>
                  <td className="actions">
                    <button onClick={() => saveEdit(p._id)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={p._id}>
                  <td data-label="Name">{p.name}</td>
                  <td data-label="Login ID">{p.loginId}</td>
                  <td data-label="Phone">{p.phone || '—'}</td>
                  <td data-label="Password">
                    {p.password ? (
                      <span className="pwd-cell">
                        <code>{revealed[p._id] ? p.password : '••••••'}</code>
                        <button type="button" className="ghost sm" onClick={() => toggleReveal(p._id)}>
                          {revealed[p._id] ? 'Hide' : 'Show'}
                        </button>
                      </span>
                    ) : (
                      <span className="muted" title="Set a new password to store it">— not stored —</span>
                    )}
                  </td>
                  <td data-label="Status">{p.active ? 'Active' : 'Inactive'}</td>
                  <td className="actions">
                    <button className="secondary" onClick={() => startEdit(p)}>Edit</button>
                    <button className="danger" onClick={() => remove(p._id)}>Delete</button>
                  </td>
                </tr>
              )
            )}
            {!pilots.length && (
              <tr>
                <td colSpan="6" className="muted center">No pilots yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
