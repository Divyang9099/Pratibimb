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

// "2026-06-12" -> "12 Jun"
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Cumulative capture vs upload over time, plotted by date.
export default function CommunicationChart({ data }) {
  return (
    <div className="panel">
      <div className="panel-title">Capture vs Upload (cumulative)</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ bottom: 8 }}>
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
          <Tooltip
            formatter={(val, name) => [val, name]}
            labelFormatter={fmtDate}
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
