import { useState } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

export default function DataUpdate({ user, projects, projectId, onProjectChange }) {
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  function validateRange() {
    const f = parseInt(from, 10);
    const t = parseInt(to, 10);
    if (!projectId) return 'Select a project first';
    if (Number.isNaN(f) || Number.isNaN(t)) return 'Enter numeric From and To values';
    if (f < 1) return 'From must be 1 or greater';
    if (f > t) return 'From must be less than or equal to To';
    if (t - f > 1000) return 'Range too large (max 1000 towers)';
    return null;
  }

  async function loadTable() {
    const err = validateRange();
    if (err) { setMsg({ type: 'err', text: err }); return; }
    setMsg(null);
    setBusy(true);
    try {
      const { data } = await api.get(`/pilot/towers/${projectId}`, { params: { from, to } });
      setRows(data.rows);
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to load towers' });
    } finally {
      setBusy(false);
    }
  }

  function toggle(idx, field) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: !r[field] } : r)));
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/pilot/data-update', { projectId, date, rows });
      setMsg({ type: 'ok', text: `Saved ${data.updated} towers.` });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  function resetTable() {
    setRows((prev) =>
      prev ? prev.map((r) => ({ ...r, dataCapture: false, dataUpload: false, issueReplace: false })) : prev
    );
  }

  function cancel() {
    setRows(null);
    setFrom('');
    setTo('');
    setMsg(null);
  }

  const alreadyCapturedCount = rows ? rows.filter((r) => r.alreadyCaptured).length : 0;

  return (
    <div className="card">
      <h2>Data Update</h2>

      <div className="form-grid">
        <div>
          <label>Pilot</label>
          <input value={user.name} disabled />
        </div>
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>Project</label>
          <select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="range-row">
        <div>
          <label>Tower from</label>
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label>Tower to</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="20" />
        </div>
        <button className="secondary" onClick={loadTable} disabled={busy}>
          Load table
        </button>
      </div>

      {msg && <div className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</div>}

      {rows && (
        <>
          {alreadyCapturedCount > 0 && (
            <div className="status-banner warn" style={{ marginTop: 8 }}>
              {alreadyCapturedCount} tower{alreadyCapturedCount > 1 ? 's' : ''} in this range{' '}
              {alreadyCapturedCount > 1 ? 'are' : 'is'} already recorded (highlighted in yellow).
              Unchecking and re-saving will overwrite the existing record.
            </div>
          )}

          <div className="table-scroll">
            <table className="update-table">
              <thead>
                <tr>
                  <th>Tower</th>
                  <th>Data Capture</th>
                  <th>Data Upload</th>
                  <th>Issue / Replace</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.number}
                    className={r.alreadyCaptured ? 'already-done' : undefined}
                    title={r.alreadyCaptured ? 'Previously captured — editing will overwrite' : undefined}
                  >
                    <td className="tower-cell">{r.number}</td>
                    {(['dataCapture', 'dataUpload', 'issueReplace']).map((field) => (
                      <td key={field} className="check-cell">
                        <input
                          type="checkbox"
                          checked={r[field]}
                          onChange={() => toggle(idx, field)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btn-row">
            <button onClick={submit} disabled={busy}>
              {busy ? 'Saving…' : 'Submit'}
            </button>
            <button className="secondary" onClick={resetTable} disabled={busy}>
              Reset table
            </button>
            <button className="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
