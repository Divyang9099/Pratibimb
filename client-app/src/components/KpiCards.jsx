const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—';

// The four headline KPIs across the top of the client dashboard.
export default function KpiCards({ kpi }) {
  const { totalTower, capture, upload, acquisition } = kpi;

  return (
    <div className="kpi-row">
      <div className="kpi-card">
        <div className="kpi-label">Total Towers</div>
        <div className="kpi-value">{totalTower}</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Data Capture</div>
        <div className="kpi-value">
          {capture.pct}
          <span className="pct">%</span>
        </div>
        <div className="kpi-sub">
          <span className="done">Done {capture.done}</span>
          <span className="pending">Pending {capture.pending}</span>
        </div>
        <div className="bar">
          <div className="bar-fill green" style={{ width: `${capture.pct}%` }} />
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Data Upload</div>
        <div className="kpi-value">
          {upload.pct}
          <span className="pct">%</span>
        </div>
        <div className="kpi-sub">
          <span className="done">Done {upload.done}</span>
          <span className="pending">Pending {upload.pending}</span>
        </div>
        <div className="bar">
          <div className="bar-fill blue" style={{ width: `${upload.pct}%` }} />
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-label">Acquisition Update</div>
        <div className="acq-row">
          <span className="acq-tag start">Start</span>
          <span>{fmtDate(acquisition.start?.date)} (AM)</span>
          <span className="acq-tower">Tower {acquisition.start?.towerNo ?? '—'}</span>
        </div>
        <div className="acq-row">
          <span className="acq-tag close">Close</span>
          <span>{fmtDate(acquisition.close?.date)} (PM)</span>
          <span className="acq-tower">Tower {acquisition.close?.towerNo ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
