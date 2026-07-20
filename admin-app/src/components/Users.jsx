import { useEffect, useState } from 'react';
import { api, auth } from '../api';
import { useLiveData } from '../useProjectLive';

const empty = { name: '', loginId: '', password: '', phone: '', role: 'pilot' };

export default function Users() {
  const me = auth.user();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [revealed, setRevealed] = useState({}); // { [userId]: true } -> show password

  const load = () => api.get('/admin/users').then((r) => setUsers(r.data.users));
  // Refresh whenever anything changes server-side, from any app or user.
  useLiveData(load);
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
      await api.post('/admin/users', form);
      setForm(empty);
      load();
    } catch (e2) {
      setMsg(e2.response?.data?.error || 'Failed');
    }
  }

  function startEdit(u) {
    setEditingId(u._id);
    setEditForm({
      name: u.name,
      loginId: u.loginId,
      phone: u.phone || '',
      password: '',
      role: u.role,
      active: u.active,
    });
  }

  async function saveEdit(id) {
    setMsg('');
    const body = {
      name: editForm.name,
      loginId: editForm.loginId,
      phone: editForm.phone,
      role: editForm.role,
      active: editForm.active,
    };
    if (editForm.password) body.password = editForm.password;
    try {
      await api.put(`/admin/users/${id}`, body);
      setEditingId(null);
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to update user');
    }
  }

  async function remove(id) {
    if (!confirm('Delete this user?')) return;
    setMsg('');
    try {
      await api.delete(`/admin/users/${id}`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to delete user');
    }
  }

  return (
    <div>
      <h1>Users</h1>
      <p className="muted">
        Manage every account — admins and pilots. You can view and change any user&apos;s login ID and
        password, and see their current password.
      </p>

      <form className="inline-form" onSubmit={create}>
        <input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Login ID *" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
        <input placeholder="Password *" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="pilot">Pilot</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Add user</button>
      </form>
      {msg && <div className="error">{msg}</div>}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Password</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = me && (u._id === me.id);
              return editingId === u._id ? (
                <tr key={u._id} className="editing">
                  <td data-label="Name"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></td>
                  <td data-label="Login ID"><input value={editForm.loginId} onChange={(e) => setEditForm({ ...editForm, loginId: e.target.value })} /></td>
                  <td data-label="Role">
                    <select
                      value={editForm.role}
                      disabled={isSelf}
                      title={isSelf ? "You can't change your own role" : ''}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    >
                      <option value="pilot">Pilot</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td data-label="Phone"><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td data-label="New password"><input placeholder="leave blank to keep" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} /></td>
                  <td data-label="Status">
                    <label className="checkrow sm">
                      <input
                        type="checkbox"
                        checked={editForm.active}
                        disabled={isSelf}
                        title={isSelf ? "You can't deactivate yourself" : ''}
                        onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                      /> Active
                    </label>
                  </td>
                  <td className="actions">
                    <button onClick={() => saveEdit(u._id)}>Save</button>
                    <button className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </td>
                </tr>
              ) : (
                <tr key={u._id}>
                  <td data-label="Name">{u.name}{isSelf && <span className="muted"> (you)</span>}</td>
                  <td data-label="Login ID">{u.loginId}</td>
                  <td data-label="Role">
                    <span className={`role-badge role-${u.role}`}>{u.role}</span>
                  </td>
                  <td data-label="Phone">{u.phone || '—'}</td>
                  <td data-label="Password">
                    {u.password ? (
                      <span className="pwd-cell">
                        <code>{revealed[u._id] ? u.password : '••••••'}</code>
                        <button type="button" className="ghost sm" onClick={() => toggleReveal(u._id)}>
                          {revealed[u._id] ? 'Hide' : 'Show'}
                        </button>
                      </span>
                    ) : (
                      <span className="muted" title="Set a new password to store it">— not stored —</span>
                    )}
                  </td>
                  <td data-label="Status">{u.active ? 'Active' : 'Inactive'}</td>
                  <td className="actions">
                    <button className="secondary" onClick={() => startEdit(u)}>Edit</button>
                    <button className="danger" disabled={isSelf} title={isSelf ? "You can't delete yourself" : ''} onClick={() => remove(u._id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {!users.length && (
              <tr>
                <td colSpan="7" className="muted center">No users yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
