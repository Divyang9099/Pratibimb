import { useEffect, useState } from 'react';
import { api } from '../api';
import { useLiveData } from '../useProjectLive';

const empty = { name: '', contactEmail: '', contactPhone: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [customKey, setCustomKey] = useState('');
  const [setKeyId, setSetKeyId] = useState(null);

  const load = () => api.get('/admin/clients').then((r) => setClients(r.data.clients));
  // Refresh whenever anything changes server-side, from any app or user.
  useLiveData(load);
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.name) return;
    const { data } = await api.post('/admin/clients', form);
    setMsg(`Created "${data.client.name}" — access key: ${data.client.accessKey}`);
    setForm(empty);
    load();
  }

  function startEdit(c) {
    setEditingId(c._id);
    setEditForm({ name: c.name, contactEmail: c.contactEmail || '', contactPhone: c.contactPhone || '', active: c.active });
  }

  async function saveEdit(id) {
    await api.put(`/admin/clients/${id}`, editForm);
    setEditingId(null);
    load();
  }

  async function rotate(id) {
    const { data } = await api.post(`/admin/clients/${id}/rotate-key`);
    setMsg(`New key for ${data.client.name}: ${data.client.accessKey}`);
    load();
  }

  async function setKey(id) {
    const k = customKey.trim().toUpperCase();
    if (!k) return;
    try {
      const { data } = await api.post(`/admin/clients/${id}/set-key`, { key: k });
      setMsg(`Key updated to: ${data.client.accessKey}`);
      setSetKeyId(null);
      setCustomKey('');
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to set key');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this client? Their projects stay but lose this key.')) return;
    await api.delete(`/admin/clients/${id}`);
    load();
  }

  return (
    <div>
      <h1>Clients</h1>
      <p className="muted">Create a client to generate the access key they use on the client portal.</p>

      <form className="inline-form" onSubmit={create}>
        <input placeholder="Client name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
        <input placeholder="Phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
        <button type="submit">Add client</button>
      </form>
      {msg && <div className="ok-banner">{msg}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Access Key</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) =>
              editingId === c._id ? (
                <tr key={c._id} className="editing">
                  <td data-label="Name"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td data-label="Key">
                    {setKeyId === c._id ? (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={customKey}
                          onChange={(e) => setCustomKey(e.target.value)}
                          placeholder="Custom key…"
                          style={{ width: 130 }}
                        />
                        <button onClick={() => setKey(c._id)}>Set</button>
                        <button className="ghost" onClick={() => { setSetKeyId(null); setCustomKey(''); }}>✕</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <code className="key">{c.accessKey}</code>
                        <button className="ghost" style={{ fontSize: 11, padding: '3px 7px' }} onClick={() => setSetKeyId(c._id)}>Set custom…</button>
                      </span>
                    )}
                  </td>
                  <td data-label="Email"><input value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} /></td>
                  <td data-label="Phone"><input value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} /></td>
                  <td data-label="Status">
                    <label className="checkrow sm">
                      <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Active
                    </label>
                  </td>
                  <td className="actions">
                    <button onClick={() => saveEdit(c._id)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={c._id}>
                  <td data-label="Name">{c.name}</td>
                  <td data-label="Key"><code className="key">{c.accessKey}</code></td>
                  <td data-label="Email">{c.contactEmail || '—'}</td>
                  <td data-label="Phone">{c.contactPhone || '—'}</td>
                  <td data-label="Status">{c.active ? 'Active' : 'Inactive'}</td>
                  <td className="actions">
                    <button className="secondary" onClick={() => startEdit(c)}>Edit</button>
                    <button className="secondary" onClick={() => rotate(c._id)}>Rotate key</button>
                    <button className="danger" onClick={() => remove(c._id)}>Delete</button>
                  </td>
                </tr>
              )
            )}
            {!clients.length && (
              <tr>
                <td colSpan="6" className="muted center">No clients yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
