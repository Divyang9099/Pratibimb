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

const short = (d) => d.slice(5);

// Cumulative capture vs upload over time. Capture is a solid line,
// upload is a dashed line — the gap shows the upload backlog.
export default function CommunicationChart({ data }) {
  return (
    <div className="panel">
      <div className="panel-title">Capture vs Upload (cumulative)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data.map((d) => ({ ...d, label: short(d.date) }))}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
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
