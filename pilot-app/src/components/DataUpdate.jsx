import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useProjectLive } from '../useProjectLive';

const today = () => new Date().toISOString().slice(0, 10);

export default function DataUpdate({ user, projects, projectId, onProjectChange }) {
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);
  const rowsRef = useRef(null);
  rowsRef.current = rows;
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pilots, setPilots] = useState([]);
  const [selectedPilotId, setSelectedPilotId] = useState(user._id || user.id || '');

  // Issue reason modal state
  const [issueModal, setIssueModal] = useState(null); // { idx, towerNo }
  const [issueInput, setIssueInput] = useState('');
  const issueInputRef = useRef(null);

  // A loaded table holds unsaved toggles, so a live update must never reload
  // it automatically — that would silently discard a pilot's field work. We
  // surface a notice instead and let them choose when to reload.
  const [staleNotice, setStaleNotice] = useState(false);
  const selfSaveRef = useRef(0);

  useProjectLive(projectId, () => {
    // Ignore the echo of our own save.
    if (Date.now() - selfSaveRef.current < 5000) return;
    // Nothing loaded means nothing to protect — the next load is fresh anyway.
    if (rowsRef.current) setStaleNotice(true);
  });

  useEffect(() => {
    api.get('/pilot/pilots')
      .then(r => setPilots(r.data.pilots))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (issueModal) {
      setTimeout(() => issueInputRef.current?.focus(), 50);
    }
  }, [issueModal]);

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
      setRows(data.rows.map(r => ({ ...r, issueNote: '' })));
      setStaleNotice(false);
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
        // Turning ON: open the modal to ask for reason
        setIssueInput(rows[idx].issueNote || '');
        setIssueModal({ idx, towerNo: rows[idx].number });
      } else {
        // Turning OFF: clear the issue
        setRows(prev => prev.map((r, i) => i === idx ? { ...r, issueReplace: false, issueNote: '' } : r));
      }
    } else {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: !r[field] } : r));
    }
  }

  function confirmIssue() {
    if (!issueInput.trim()) return; // require reason
    const { idx } = issueModal;
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, issueReplace: true, issueNote: issueInput.trim() } : r));
    setIssueModal(null);
    setIssueInput('');
  }

  function cancelIssue() {
    setIssueModal(null);
    setIssueInput('');
  }

  function toggleAll(field, checked) {
    if (field === 'issueReplace' && checked) {
      // Bulk-check issues: open a single modal for all
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

  function confirmIssueAll() {
    if (!issueInput.trim()) return;
    setRows(prev => prev.map(r => ({ ...r, issueReplace: true, issueNote: issueInput.trim() })));
    setIssueModal(null);
    setIssueInput('');
  }

  function isAllChecked(field) {
    return rows && rows.length > 0 && rows.every((r) => r[field]);
  }

  function isSomeChecked(field) {
    return rows && rows.some((r) => r[field]) && !isAllChecked(field);
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      // The server broadcasts project-update on save. Mark the window so our
      // own write doesn't come back as a "changed elsewhere" notice.
      selfSaveRef.current = Date.now();
      const { data } = await api.post('/pilot/data-update', {
        projectId,
        date,
        rows,
        pilotId: selectedPilotId,
      });
      setMsg({ type: 'ok', text: `Saved ${data.updated} towers.` });
      setStaleNotice(false);
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  function resetTable() {
    setRows(prev =>
      prev ? prev.map(r => ({ ...r, dataCapture: false, dataUpload: false, issueReplace: false, issueNote: '' })) : prev
    );
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
      <h2>Data Update</h2>

      <div className="form-grid">
        <div>
          <label>Pilot</label>
          <select value={selectedPilotId} onChange={e => setSelectedPilotId(e.target.value)}>
            {pilots.length === 0 && <option value={user._id || user.id}>{user.name}</option>}
            {pilots.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label>Project</label>
          <select value={projectId} onChange={e => onProjectChange(e.target.value)}>
            <option value="">Select project…</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
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
        <button className="secondary" onClick={loadTable} disabled={busy}>
          Load table
        </button>
      </div>

      {msg && <div className={msg.type === 'ok' ? 'ok' : 'error'}>{msg.text}</div>}

      {rows && (
        <>
          {staleNotice && (
            <div className="status-banner warn" style={{ marginTop: 8 }}>
              Someone else updated this project. Your ticks below are still unsaved —
              reload to see their changes, or save yours first.
              <button
                className="ghost"
                style={{ marginLeft: 10 }}
                onClick={loadTable}
                disabled={busy}
              >
                Reload table
              </button>
            </div>
          )}

          {alreadyCapturedCount > 0 && (
            <div className="status-banner warn" style={{ marginTop: 8 }}>
              {alreadyCapturedCount} tower{alreadyCapturedCount > 1 ? 's' : ''} in this range{' '}
              {alreadyCapturedCount > 1 ? 'are' : 'is'} already recorded (highlighted in yellow).
            </div>
          )}

          <div className="table-scroll">
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
                        <input
                          type="checkbox"
                          checked={r[field]}
                          onChange={() => toggle(idx, field)}
                        />
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
            <button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Submit'}</button>
            <button className="secondary" onClick={resetTable} disabled={busy}>Reset</button>
            <button className="ghost" onClick={cancel} disabled={busy}>Cancel</button>
          </div>
        </>
      )}

      {/* Issue reason modal */}
      {issueModal && (
        <div className="issue-modal-backdrop" onClick={cancelIssue}>
          <div className="issue-modal" onClick={e => e.stopPropagation()}>
            <div className="issue-modal-title">
              Issue reason
              {issueModal.idx !== 'all'
                ? ` — Tower ${issueModal.towerNo}`
                : ' — all towers'}
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
              <button
                onClick={issueModal.idx === 'all' ? confirmIssueAll : confirmIssue}
                disabled={!issueInput.trim()}
              >
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
