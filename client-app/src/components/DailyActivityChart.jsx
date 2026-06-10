import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// Daily activity: towers captured vs uploaded per day.
// X-axis shows the tower range worked that day (e.g. "T5–T25").
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
          <Tooltip
            formatter={(val, name) => [val, name]}
            labelFormatter={(label) => `Towers: ${label}`}
          />
          <Legend />
          <Bar dataKey="captured" name="Captured" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="uploaded" name="Uploaded" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
