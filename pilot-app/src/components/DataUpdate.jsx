import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { useProjectLive, useLiveData } from '../useProjectLive';

// Local calendar date — toISOString() is UTC and would pre-fill yesterday
// for any save made before the local UTC offset has elapsed (before 05:30 IST).
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const REVERT_NOTE = { dataCapture: 'captureRevertNote', dataUpload: 'uploadRevertNote' };
const RECORDED_FLAG = { dataCapture: 'alreadyCaptured', dataUpload: 'alreadyUploaded' };
const FIELD_LABEL = { dataCapture: 'Data Capture', dataUpload: 'Data Upload' };

// True only for work the server has already recorded — a tick made in this
// session can still be cleared freely.
const isRecorded = (row, field) => !!row[RECORDED_FLAG[field]];

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

  // Un-ticking work already recorded on an earlier day is destructive, so it
  // asks for a reason first — an accidental click can't silently erase it.
  const [revertModal, setRevertModal] = useState(null); // { idx, field, towerNo }
  const [revertInput, setRevertInput] = useState('');
  const revertInputRef = useRef(null);

  // A loaded table holds unsaved toggles, so a live update must never reload
  // it automatically — that would silently discard a pilot's field work. We
  // surface a notice instead and let them choose when to reload.
  const [staleNotice, setStaleNotice] = useState(false);
  const selfSaveRef = useRef(0);
  // loadTable is declared below; hold it in a ref so the live handler can call
  // the current version without depending on declaration order.
  const loadTableRef = useRef(null);

  useProjectLive(projectId, () => {
    // Ignore the echo of our own save.
    if (Date.now() - selfSaveRef.current < 5000) return;
    const current = rowsRef.current;
    if (!current) return; // nothing loaded, nothing to protect

    // Only a row the pilot has actually ticked is worth protecting. With no
    // unsaved ticks we just reload silently, so the common case is live.
    const hasUnsavedTicks = current.some(
      (r) => r.dataCapture || r.dataUpload || r.issueReplace
    );
    if (hasUnsavedTicks) setStaleNotice(true);
    else loadTableRef.current?.();
  });

  const loadPilots = () => api.get('/pilot/pilots')
    .then(r => setPilots(r.data.pilots))
    .catch(() => {});

  useEffect(() => { loadPilots(); }, []);

  // Keep the pilot dropdown current. The tower rows are handled separately
  // below, since they can hold unsaved toggles.
  useLiveData(loadPilots);

  useEffect(() => {
    if (issueModal) {
      setTimeout(() => issueInputRef.current?.focus(), 50);
    }
  }, [issueModal]);

  useEffect(() => {
    if (revertModal) {
      setTimeout(() => revertInputRef.current?.focus(), 50);
    }
  }, [revertModal]);

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

  loadTableRef.current = loadTable;

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
      return;
    }

    const row = rows[idx];
    if (row[field] && isRecorded(row, field)) {
      setRevertInput(row[REVERT_NOTE[field]] || '');
      setRevertModal({ idx, field, towerNo: row.number });
      return;
    }
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, [field]: !r[field], [REVERT_NOTE[field]]: '' } : r
    ));
  }

  function confirmRevert() {
    if (!revertInput.trim()) return;
    const { idx, field } = revertModal;
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, [field]: false, [REVERT_NOTE[field]]: revertInput.trim() } : r
    ));
    setRevertModal(null);
    setRevertInput('');
  }

  function cancelRevert() {
    setRevertModal(null);
    setRevertInput('');
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
      return;
    }
    // Bulk-clearing a column can wipe work recorded on earlier days, so it
    // takes one reason covering every already-recorded row it touches.
    if (!checked && field !== 'issueReplace' && rows.some(r => r[field] && isRecorded(r, field))) {
      setRevertInput('');
      setRevertModal({ idx: 'all', field, towerNo: 'all recorded' });
      return;
    }
    setRows(prev => prev.map(r => ({
      ...r,
      [field]: checked,
      ...(field === 'issueReplace' && !checked ? { issueNote: '' } : {}),
      ...(REVERT_NOTE[field] ? { [REVERT_NOTE[field]]: '' } : {}),
    })));
  }

  function confirmRevertAll() {
    if (!revertInput.trim()) return;
    const { field } = revertModal;
    const note = revertInput.trim();
    setRows(prev => prev.map(r => ({
      ...r,
      [field]: false,
      [REVERT_NOTE[field]]: r[field] && isRecorded(r, field) ? note : '',
    })));
    setRevertModal(null);
    setRevertInput('');
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
      // What we just saved is now recorded work, so un-ticking it from here
      // counts as a revert and needs a reason like any earlier day would.
      setRows(prev => prev && prev.map(r => ({
        ...r,
        alreadyCaptured: r.dataCapture,
        alreadyUploaded: r.dataUpload,
        captureRevertNote: '',
        uploadRevertNote: '',
      })));
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.error || 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  // Drops this session's unsaved ticks and returns the table to what the
  // server last reported. Clearing already-recorded work is a revert and has
  // to go through the reason prompt instead.
  function resetTable() {
    setRows(prev =>
      prev ? prev.map(r => ({
        ...r,
        dataCapture: r.alreadyCaptured,
        dataUpload: r.alreadyUploaded,
        issueReplace: false,
        issueNote: '',
        captureRevertNote: '',
        uploadRevertNote: '',
      })) : prev
    );
  }

  function cancel() {
    setRows(null);
    setFrom('');
    setTo('');
    setMsg(null);
  }

  const selectedProject = projects.find(p => p._id === projectId);
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

      {selectedProject?.towerRange && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
          This project's towers run from {selectedProject.towerRange.min} to {selectedProject.towerRange.max}.
        </p>
      )}

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
                        {REVERT_NOTE[field] && r[REVERT_NOTE[field]] && (
                          <div className="issue-note-chip" title={r[REVERT_NOTE[field]]}>
                            Undo: {r[REVERT_NOTE[field]].length > 14
                              ? r[REVERT_NOTE[field]].slice(0, 14) + '…'
                              : r[REVERT_NOTE[field]]}
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

      {/* Reason required to un-mark work already recorded on an earlier day */}
      {revertModal && (
        <div className="issue-modal-backdrop" onClick={cancelRevert}>
          <div className="issue-modal" onClick={e => e.stopPropagation()}>
            <div className="issue-modal-title">
              Undo {FIELD_LABEL[revertModal.field]}
              {revertModal.idx !== 'all'
                ? ` — Tower ${revertModal.towerNo}`
                : ' — all recorded towers'}
            </div>
            <p className="issue-modal-hint">
              This tower was already recorded as done. Why is it being un-marked?
              The reason is saved to the project history.
            </p>
            <textarea
              ref={revertInputRef}
              className="issue-modal-input"
              value={revertInput}
              onChange={e => setRevertInput(e.target.value)}
              rows={3}
              placeholder="e.g. Marked by mistake, Data corrupted, Re-shoot required…"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); revertModal.idx === 'all' ? confirmRevertAll() : confirmRevert(); }
                if (e.key === 'Escape') cancelRevert();
              }}
            />
            <div className="issue-modal-actions">
              <button
                onClick={revertModal.idx === 'all' ? confirmRevertAll : confirmRevert}
                disabled={!revertInput.trim()}
              >
                Confirm undo
              </button>
              <button className="ghost" onClick={cancelRevert}>Cancel</button>
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
