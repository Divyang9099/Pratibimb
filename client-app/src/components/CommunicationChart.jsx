import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// Cumulative capture vs upload over time.
// X-axis shows the tower range worked each day (e.g. "T5–T25").
export default function CommunicationChart({ data }) {
  return (
    <div className="panel">
      <div className="panel-title">Capture vs Upload (cumulative)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ bottom: 8 }}>
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
          <Line
            type="monotone"
            dataKey="capture"
            name="Captured"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="upload"
            name="Uploaded"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
