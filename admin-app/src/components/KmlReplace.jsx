import { useState } from 'react';
import { api } from '../api';

// Two-step KML replacement: pick a file, review the diff the backend
// computes, then confirm. The preview step exists because a re-upload
// silently rewrites every tower coordinate — an admin who grabs the wrong
// file should find out before it lands, not after.
//
// Capture/upload progress is never affected by this flow; the summary
// spells that out so the operator can see it rather than trust it.
export default function KmlReplace({ project, onClose, onApplied }) {
  const [fileName, setFileName] = useState('');
  const [kml, setKml] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onPick(file) {
    if (!file) return;
    setError('');
    setPreview(null);
    setBusy(true);
    try {
      const text = await file.text();
      setKml(text);
      setFileName(file.name);
      const { data } = await api.post(`/admin/projects/${project._id}/kml/preview`, { kml: text });
      setPreview(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not read or parse that KML');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/admin/projects/${project._id}/kml/apply`, {
        kml,
        kmlFileName: fileName,
      });
      onApplied(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to apply KML');
      setBusy(false);
    }
  }

  const canApply = preview && preview.kmlTowers > 0 && !busy;

  return (
    <div className="issue-modal-backdrop" onClick={onClose}>
      <div className="issue-modal kml-modal" onClick={(e) => e.stopPropagation()}>
        <div className="issue-modal-title">Replace KML — {project.name}</div>
        <p className="issue-modal-hint">
          Updates tower positions and the route line only. Captured / uploaded status,
          timestamps and issue notes are kept exactly as they are.
        </p>

        <label className="file-mini block">
          {fileName ? `Selected: ${fileName}` : 'Choose a .kml file…'}
          <input
            type="file"
            accept=".kml,.xml"
            onChange={(e) => onPick(e.target.files[0])}
          />
        </label>

        {busy && !preview && <div className="muted">Parsing…</div>}
        {error && <div className="error">{error}</div>}

        {preview && (
          <div className="kml-preview">
            {preview.warnings.map((w, i) => (
              <div key={i} className="kml-warn">⚠ {w}</div>
            ))}

            <div className="kml-stats">
              <Stat label="Towers in KML" value={preview.kmlTowers} />
              <Stat label="New" value={preview.added} tone={preview.added ? 'add' : ''} />
              <Stat label="Repositioned" value={preview.moved} />
              <Stat label="Unchanged" value={preview.unchanged} />
              <Stat
                label="Dropped"
                value={preview.missing}
                tone={preview.missing ? 'warn' : ''}
              />
              {preview.restored > 0 && <Stat label="Restored" value={preview.restored} tone="add" />}
            </div>

            <div className="kml-lines">
              <div>
                Total towers: <b>{preview.totalTowers.from}</b> → <b>{preview.totalTowers.to}</b>
              </div>
              {preview.moved > 0 && (
                <div className="muted">
                  Movement: avg {preview.avgMoveMeters} m, max {preview.maxMoveMeters} m
                </div>
              )}
              <div className="ok">
                {preview.preservedProgress} tower(s) with capture/upload data — all preserved
              </div>
              {preview.alreadyStale > 0 && (
                <div className="muted">
                  {preview.alreadyStale} tower(s) were already inactive from an earlier KML and
                  stay that way — this file does not bring them back.
                </div>
              )}
              {preview.missingWithProgress > 0 && (
                <div className="muted">
                  {preview.missingWithProgress} of those are dropped by this KML. Their data stays
                  in the database and returns if a later KML re-adds the number.
                </div>
              )}
              {preview.sample.missing.length > 0 && (
                <div className="muted">
                  Dropped: {preview.sample.missing.join(', ')}
                  {preview.missing > preview.sample.missing.length ? ' …' : ''}
                </div>
              )}
              {preview.sample.added.length > 0 && (
                <div className="muted">
                  New: {preview.sample.added.join(', ')}
                  {preview.added > preview.sample.added.length ? ' …' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="issue-modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button onClick={apply} disabled={!canApply}>
            {busy && preview ? 'Applying…' : 'Apply KML'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`kml-stat ${tone}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
