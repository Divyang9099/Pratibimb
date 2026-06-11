function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function NonWorkingDays({ days }) {
  if (!days || days.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-title">
        Non-Working Days
        <span className="nwd-count">{days.length}</span>
      </div>
      <div className="nwd-list">
        {days.map((d, i) => (
          <div key={i} className="nwd-item">
            <div className="nwd-left">
              <span className="nwd-dot" />
              <div>
                <div className="nwd-date">{fmtDate(d.date)}</div>
                {d.note && <div className="nwd-note">"{d.note}"</div>}
              </div>
            </div>
            <div className="nwd-pilot">{d.pilotName}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
