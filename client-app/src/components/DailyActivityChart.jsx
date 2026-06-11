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

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload;
  if (entry?.nonWorking) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{label}</p>
        <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>Non-working day</p>
        {entry.nonWorkingNote && <p style={{ color: '#94a3b8', margin: '2px 0 0', fontSize: 12 }}>"{entry.nonWorkingNote}"</p>}
      </div>
    );
  }
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">Towers: {label}</p>
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
            dataKey="towerLabel"
            fontSize={11}
            interval="preserveStartEnd"
            tick={{ angle: -35, textAnchor: 'end', dy: 4 }}
            height={48}
          />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="captured" name="Captured" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.nonWorking ? '#cbd5e1' : '#22c55e'} />
            ))}
          </Bar>
          <Bar dataKey="uploaded" name="Uploaded" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.nonWorking ? '#e2e8f0' : '#3b82f6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
