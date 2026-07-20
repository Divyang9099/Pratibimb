import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// "2026-06-12" -> "12 Jun"
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  const dateLabel = fmtDate(entry?.date);

  if (entry?.nonWorking) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{dateLabel}</p>
        <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>Non-working day</p>
        {entry.nonWorkingNote && <p style={{ color: '#94a3b8', margin: '2px 0 0', fontSize: 12 }}>"{entry.nonWorkingNote}"</p>}
      </div>
    );
  }

  // towerMin/towerMax come through as numbers (or null for empty days).
  const towerRange =
    entry?.towerMin != null
      ? entry.towerMin === entry.towerMax
        ? `Tower ${entry.towerMin}`
        : `Towers ${entry.towerMin}–${entry.towerMax}`
      : null;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{dateLabel}</p>
      {towerRange && <p style={{ color: '#64748b', margin: '0 0 2px', fontSize: 12 }}>{towerRange}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0 0', fontSize: 13 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function DailyActivityChart({ data }) {
  return (
    <div className="panel">
      <div className="panel-title">Daily Activity</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            fontSize={11}
            interval="preserveStartEnd"
            tick={{ angle: -35, textAnchor: 'end', dy: 4 }}
            height={48}
          />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="captured" name="Captured" fill="#22c55e" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.nonWorking ? '#cbd5e1' : '#22c55e'} />
            ))}
          </Bar>
          <Bar dataKey="uploaded" name="Uploaded" fill="#3b82f6" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.nonWorking ? '#e2e8f0' : '#3b82f6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
