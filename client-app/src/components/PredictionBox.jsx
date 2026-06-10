const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—';

// Forward-looking estimates derived from running daily averages.
export default function PredictionBox({ prediction }) {
  const p = prediction;
  const cells = [
    { label: 'Daily Capture Avg', value: `${p.dailyCaptureAvg} /day` },
    { label: 'Tentative Capture Done', value: fmtDate(p.tentativeCaptureDate) },
    { label: 'Daily Upload Avg', value: `${p.dailyUploadAvg} /day` },
    { label: 'Tentative Upload Done', value: fmtDate(p.tentativeUploadDate) },
    { label: 'Remaining Capture Days', value: p.remainingCaptureDays ?? '—' },
    { label: 'Remaining Upload Days', value: p.remainingUploadDays ?? '—' },
  ];

  return (
    <div className="panel prediction">
      <div className="panel-title">Prediction</div>
      <div className="pred-grid">
        {cells.map((c) => (
          <div className="pred-cell" key={c.label}>
            <div className="pred-label">{c.label}</div>
            <div className="pred-value">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
