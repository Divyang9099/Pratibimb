function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtUpdated(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NonWorkingDays({ days = [], issues = [] }) {
  const hasNwd = days.length > 0;
  const hasIssues = issues.length > 0;
  if (!hasNwd && !hasIssues) return null;

  return (
    <div className="panel">
      <div className="panel-title">
        Non-Working Days / Issues
        {(hasNwd || hasIssues) && (
          <span className="nwd-count">{days.length + issues.length}</span>
        )}
      </div>

      {hasNwd && (
        <>
          <div className="nwd-section-label">Non-Working Days</div>
          <div className="nwd-list">
            {days.map((d, i) => (
              <div key={i} className="nwd-item">
                <div className="nwd-left">
                  <span className="nwd-dot nwd-dot--off" />
                  <div>
                    <div className="nwd-date">{fmtDate(d.date)}</div>
                    <div className="nwd-note">"{d.note}"</div>
                  </div>
                </div>
                <div className="nwd-pilot">{d.pilotName}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {hasNwd && hasIssues && <div className="nwd-divider" />}

      {hasIssues && (
        <>
          <div className="nwd-section-label">Tower Issues</div>
          <div className="nwd-list">
            {issues.map((t, i) => (
              <div key={i} className="nwd-item nwd-item--issue">
                <div className="nwd-left">
                  <span className="nwd-dot nwd-dot--issue" />
                  <div>
                    <div className="nwd-date">Tower {t.number}</div>
                    <div className="nwd-note">"{t.note}"</div>
                  </div>
                </div>
                <div className="nwd-pilot">
                  {t.pilotName && <span>{t.pilotName}</span>}
                  {t.updatedAt && <span style={{ display: 'block', fontSize: 11 }}>{fmtUpdated(t.updatedAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
