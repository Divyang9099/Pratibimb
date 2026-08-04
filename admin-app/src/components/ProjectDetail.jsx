import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useProjectLive } from '../useProjectLive';
import AdminDataUpdate from './AdminDataUpdate.jsx';

// Admin view of a single project: KPI summary + editable tower table +
// field logs. The tower table uses soft-select — clicks change local state
// only; nothing is saved until the admin clicks Save.
export default function ProjectDetail({ projectId, onBack }) {
  const [dash, setDash] = useState(null);
  const [towers, setTowers] = useState([]);
  const [logs, setLogs] = useState([]);

  // Local pending edits for the tower table, keyed by tower number.
  // { [number]: { captured, uploaded, issueReplace } }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(edits).length > 0;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Live updates, but never at the cost of unsaved work: if the admin has
  // pending tower edits, skip the refresh rather than overwrite them.
  useProjectLive(projectId, () => {
    if (!dirtyRef.current) loadAll();
  });

  // Current displayed value for a tower field (pending edit overrides server).
  function valueOf(tower, field) {
    const e = edits[tower.number];
    return e ? !!e[field] : !!tower[field];
  }

  // Soft toggle — updates local edits only. Prunes the entry if it matches
  // the server state again (so dirty count stays accurate).
  function toggle(tower, field) {
    setEdits((prev) => {
      const base = {
        captured: !!tower.captured,
        uploaded: !!tower.uploaded,
        issueReplace: !!tower.issueReplace,
      };
      const cur = prev[tower.number] || base;
      const next = { ...cur, [field]: !cur[field] };
      const out = { ...prev };
      if (
        next.captured === base.captured &&
        next.uploaded === base.uploaded &&
        next.issueReplace === base.issueReplace
      ) {
        delete out[tower.number];
      } else {
        out[tower.number] = next;
      }
      return out;
    });
  }

  function discardEdits() {
    setEdits({});
  }

  // Un-marking work that is already recorded needs a reason, same as the
  // pilot and Data Update screens. One reason covers every reversal in a
  // single save.
  const [revertPrompt, setRevertPrompt] = useState(null); // { numbers[] }
  const [revertNote, setRevertNote] = useState('');
  const [saveErr, setSaveErr] = useState('');

  function buildRows() {
    const byNumber = new Map(towers.map((t) => [t.number, t]));
    return Object.entries(edits).map(([number, e]) => ({
      number,
      dataCapture: e.captured,
      dataUpload: e.uploaded,
      issueReplace: e.issueReplace,
      // Preserve any existing issue note on the tower.
      issueNote: byNumber.get(number)?.notes || '',
      _wasCaptured: !!byNumber.get(number)?.captured,
      _wasUploaded: !!byNumber.get(number)?.uploaded,
    }));
  }

  function revertedNumbers(rows) {
    return rows
      .filter((r) => (r._wasCaptured && !r.dataCapture) || (r._wasUploaded && !r.dataUpload))
      .map((r) => r.number);
  }

  async function postRows(rows, note) {
    setSaving(true);
    setSaveErr('');
    try {
      await api.post(`/admin/projects/${projectId}/data-update`, {
        rows: rows.map(({ _wasCaptured, _wasUploaded, ...r }) => ({
          ...r,
          ...(_wasCaptured && !r.dataCapture ? { captureRevertNote: note } : {}),
          ...(_wasUploaded && !r.dataUpload ? { uploadRevertNote: note } : {}),
        })),
      });
      setEdits({});
      setRevertPrompt(null);
      setRevertNote('');
      await loadAll();
    } catch (e) {
      setSaveErr(e.response?.data?.error || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdits() {
    if (!dirty) return;
    const rows = buildRows();
    const reverts = revertedNumbers(rows);
    if (reverts.length) {
      setRevertNote('');
      setSaveErr('');
      setRevertPrompt({ numbers: reverts });
      return;
    }
    await postRows(rows, '');
  }

  async function confirmRevert() {
    const note = revertNote.trim();
    if (!note) return;
    await postRows(buildRows(), note);
  }

  const [newTower, setNewTower] = useState('');
  async function addTower() {
    const n = newTower.trim();
    if (!n) return;
    await api.put(`/admin/towers/${projectId}/${n}`, {});
    setNewTower('');
    loadAll();
  }

  // A KML point that isn't actually a tower (a junction, substation, stray
  // reference marker the parser swept in because it has coordinates) needs a
  // way to be dropped from the counts without renumbering every other tower
  // or hand-editing the KML. This is independent of the daily capture/upload
  // edits above — it changes instantly, no Save step.
  const [excludingNo, setExcludingNo] = useState(null);
  async function toggleExcluded(tower) {
    setExcludingNo(tower.number);
    try {
      await api.put(`/admin/towers/${projectId}/${tower.number}`, { excluded: !tower.excluded });
      // Drop any unsaved capture/upload edit for this tower — excluding it
      // mid-edit shouldn't leave a stale pending change to save later.
      setEdits((prev) => {
        if (!(tower.number in prev)) return prev;
        const { [tower.number]: _drop, ...rest } = prev;
        return rest;
      });
      await loadAll();
    } finally {
      setExcludingNo(null);
    }
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
      setEdits({});
      loadAll();
    } catch (e) {
      setResetMsg(e.response?.data?.error || 'Reset failed');
    }
  }

  const [showDataUpdate, setShowDataUpdate] = useState(false);

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
          <button onClick={() => setShowDataUpdate(v => !v)}>
            {showDataUpdate ? 'Hide Data Update' : 'Data Update'}
          </button>
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

      {showDataUpdate && (
        <AdminDataUpdate projectId={projectId} onSaved={loadAll} />
      )}

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
                  <th>On Line</th>
                </tr>
              </thead>
              <tbody>
                {towers.map((t) => {
                  const changed = !!edits[t.number];
                  const stale = t.inKml === false;
                  return (
                    <tr
                      key={t._id}
                      className={[changed && 'row-dirty', t.excluded && 'row-excluded'].filter(Boolean).join(' ') || undefined}
                    >
                      <td>{t.number}</td>
                      <td>
                        <input type="checkbox" checked={valueOf(t, 'captured')} onChange={() => toggle(t, 'captured')} disabled={t.excluded} />
                      </td>
                      <td>
                        <input type="checkbox" checked={valueOf(t, 'uploaded')} onChange={() => toggle(t, 'uploaded')} disabled={t.excluded} />
                      </td>
                      <td>
                        <input type="checkbox" checked={valueOf(t, 'issueReplace')} onChange={() => toggle(t, 'issueReplace')} disabled={t.excluded} />
                      </td>
                      <td>
                        {stale ? (
                          <span className="muted" style={{ fontSize: 12 }}>dropped by KML</span>
                        ) : (
                          <button
                            type="button"
                            className={t.excluded ? 'secondary' : 'ghost'}
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => toggleExcluded(t)}
                            disabled={excludingNo === t.number}
                          >
                            {excludingNo === t.number ? '…' : t.excluded ? 'Excluded — Include' : 'Exclude'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {saveErr && <div className="error" style={{ marginTop: 8 }}>{saveErr}</div>}

          {dirty && (
            <div className="save-bar">
              <span className="save-bar-text">
                {Object.keys(edits).length} unsaved change{Object.keys(edits).length > 1 ? 's' : ''}
              </span>
              <div className="save-bar-actions">
                <button className="ghost" onClick={discardEdits} disabled={saving}>Discard</button>
                <button onClick={saveEdits} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>
          )}
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
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td>
                      <span className={`tag ${l.type}`}>
                        {l.type === 'undo' ? `undo ${l.action}` : l.type}
                      </span>
                    </td>
                    <td>{new Date(l.date).toLocaleDateString()}</td>
                    <td>{l.towerNo}</td>
                    <td>{l.pilot?.name || '—'}</td>
                    <td className="muted" title={l.note || ''}>{l.note || '—'}</td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td colSpan="5" className="muted center">
                      No logs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reason required before un-marking already-recorded work */}
      {revertPrompt && (
        <div className="issue-modal-backdrop" onClick={() => !saving && setRevertPrompt(null)}>
          <div className="issue-modal" onClick={(e) => e.stopPropagation()}>
            <div className="issue-modal-title">Reason for un-marking</div>
            <p className="issue-modal-hint">
              You are clearing recorded work on tower{revertPrompt.numbers.length > 1 ? 's' : ''}{' '}
              {revertPrompt.numbers.join(', ')}. The reason is saved to the project history and
              shown to the client.
            </p>
            <textarea
              className="issue-modal-input"
              value={revertNote}
              onChange={(e) => setRevertNote(e.target.value)}
              rows={3}
              autoFocus
              disabled={saving}
              placeholder="e.g. Marked by mistake, Re-flight required…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmRevert(); }
                if (e.key === 'Escape' && !saving) setRevertPrompt(null);
              }}
            />
            {saveErr && <div className="error">{saveErr}</div>}
            <div className="issue-modal-actions">
              <button onClick={confirmRevert} disabled={!revertNote.trim() || saving}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button className="ghost" onClick={() => setRevertPrompt(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
