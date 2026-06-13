import { useEffect, useState, useRef } from 'react';
import { api } from '../api';

const today = () => new Date().toISOString().slice(0, 10);

// Admin bulk Data Update editor for a single project. Mirrors the pilot's
// Data Update screen: load a tower-number range, bulk toggle capture /
// upload / issue, capture an issue reason, and save in one request.
export default function AdminDataUpdate({ projectId, onSaved }) {
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pilots, setPilots] = useState([]);
  const [selectedPilotId, setSelectedPilotId] = useState('');

  // Issue reason modal state
  const [issueModal, setIssueModal] = useState(null); // { idx, towerNo }
  const [issueInput, setIssueInput] = useState('');
  const issueInputRef = useRef(null);

  useEffect(() => {
    api.get('/admin/pilots')
      .then(r => setPilots((r.data.pilots || []).filter(p => p.active !== false)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (issueModal) setTimeout(() => issueInputRef.current?.focus(), 50);
  }, [issueModal]);

  function validateRange() {
    const f = parseInt(from, 10);
    const t = parseInt(to, 10);
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
      const { data } = await api.get(`/admin/projects/${projectId}/towers-range`, { params: { from, to } });
      setRows(data.rows);
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to load towers' });
    } finally {
      setBusy(false);
    }
  }

  function toggle(idx, field) {
    if (field === 'issueReplace') {
      const current = rows[idx].issueReplace;
      if (!current) {
        setIssueInput(rows[idx].issueNote || '');
        setIssueModal({ idx, towerNo: rows[idx].number });
      } else {
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, issueReplace: false, issueNote: '' } : r));
      }
    } else {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: !r[field] } : r));
    }
  }

  function confirmIssue() {
    if (!issueInput.trim()) return;
    const { idx } = issueModal;
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, issueReplace: true, issueNote: issueInput.trim() } : r));
    setIssueModal(null);
    setIssueInput('');
  }

  function confirmIssueAll() {
    if (!issueInput.trim()) return;
    setRows(prev => prev.map(r => ({ ...r, issueReplace: true, issueNote: issueInput.trim() })));
    setIssueModal(null);
    setIssueInput('');
  }

  function cancelIssue() {
    setIssueModal(null);
    setIssueInput('');
  }

  function toggleAll(field, checked) {
    if (field === 'issueReplace' && checked) {
      setIssueInput('');
      setIssueModal({ idx: 'all', towerNo: 'all selected' });
    } else {
      setRows(prev => prev.map(r => ({
        ...r,
        [field]: checked,
        ...(field === 'issueReplace' && !checked ? { issueNote: '' } : {}),
      })));
    }
  }

  function isAllChecked(field) {
    return rows && rows.length > 0 && rows.every(r => r[field]);
  }
  function isSomeChecked(field) {
    return rows && rows.some(r => r[field]) && !isAllChecked(field);
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post(`/admin/projects/${projectId}/data-update`, {
        date,
        rows,
        pilotId: selectedPilotId || undefined,
      });
      setMsg({ type: 'ok', text: `Saved ${data.updated} towers.` });
      onSaved?.();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  function resetTable() {
    setRows(prev => prev ? prev.map(r => ({ ...r, dataCapture: false, dataUpload: false, issueReplace: false, issueNote: '' })) : prev);
  }

  function cancel() {
    setRows(null);
    setFrom('');
    setTo('');
    setMsg(null);
  }

  const alreadyCapturedCount = rows ? rows.filter(r => r.alreadyCaptured).length : 0;
  const checkboxCols = [
    { field: 'dataCapture', label: 'Data Capture' },
    { field: 'dataUpload', label: 'Data Upload' },
    { field: 'issueReplace', label: 'Issue / Replace' },
  ];

  return (
    <div className="card">
      <h3>Data Update — edit tower progress</h3>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12, fontSize: 13 }}>
        Load a tower range, then bulk-update capture, upload and issues. Saved instantly to the client dashboard.
      </p>

      <div className="form-grid">
        <div>
          <label>Attribute to pilot (optional)</label>
          <select value={selectedPilotId} onChange={e => setSelectedPilotId(e.target.value)}>
            <option value="">Admin (me)</option>
            {pilots.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="range-row">
        <div>
          <label>Tower from</label>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label>Tower to</label>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="20" />
        </div>
        <button className="secondary" onClick={loadTable} disabled={busy}>Load table</button>
      </div>

      {msg && <div className={msg.type === 'ok' ? 'ok-banner' : 'error'} style={{ marginTop: 8 }}>{msg.text}</div>}

      {rows && (
        <>
          {alreadyCapturedCount > 0 && (
            <div className="info-banner">
              {alreadyCapturedCount} tower{alreadyCapturedCount > 1 ? 's' : ''} in this range already recorded (highlighted).
            </div>
          )}

          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table className="update-table">
              <thead>
                <tr>
                  <th>Tower</th>
                  {checkboxCols.map(({ field, label }) => (
                    <th key={field} className="check-cell">
                      <SelectAllCheckbox
                        checked={isAllChecked(field)}
                        indeterminate={isSomeChecked(field)}
                        onChange={v => toggleAll(field, v)}
                      />
                      <span style={{ marginLeft: 6 }}>{label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.number} className={r.alreadyCaptured ? 'already-done' : undefined}>
                    <td className="tower-cell">{r.number}</td>
                    {checkboxCols.map(({ field }) => (
                      <td key={field} className="check-cell">
                        <input type="checkbox" checked={r[field]} onChange={() => toggle(idx, field)} />
                        {field === 'issueReplace' && r.issueReplace && r.issueNote && (
                          <div className="issue-note-chip" title={r.issueNote}>
                            {r.issueNote.length > 18 ? r.issueNote.slice(0, 18) + '…' : r.issueNote}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="btn-row">
            <button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button className="secondary" onClick={resetTable} disabled={busy}>Clear all</button>
            <button className="ghost" onClick={cancel} disabled={busy}>Close</button>
          </div>
        </>
      )}

      {issueModal && (
        <div className="issue-modal-backdrop" onClick={cancelIssue}>
          <div className="issue-modal" onClick={e => e.stopPropagation()}>
            <div className="issue-modal-title">
              Issue reason
              {issueModal.idx !== 'all' ? ` — Tower ${issueModal.towerNo}` : ' — all towers'}
            </div>
            <p className="issue-modal-hint">Describe the issue so the client can see it on the dashboard.</p>
            <textarea
              ref={issueInputRef}
              className="issue-modal-input"
              value={issueInput}
              onChange={e => setIssueInput(e.target.value)}
              rows={3}
              placeholder="e.g. Foundation crack, Access blocked, Loose hardware…"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); issueModal.idx === 'all' ? confirmIssueAll() : confirmIssue(); }
                if (e.key === 'Escape') cancelIssue();
              }}
            />
            <div className="issue-modal-actions">
              <button onClick={issueModal.idx === 'all' ? confirmIssueAll : confirmIssue} disabled={!issueInput.trim()}>
                Confirm
              </button>
              <button className="ghost" onClick={cancelIssue}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectAllCheckbox({ checked, indeterminate, onChange }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={el => { if (el) el.indeterminate = indeterminate; }}
      onChange={e => onChange(e.target.checked)}
    />
  );
}
