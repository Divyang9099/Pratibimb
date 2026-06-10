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

const short = (d) => d.slice(5); // MM-DD

// Daily activity: towers captured vs uploaded per day.
export default function DailyActivityChart({ data }) {
  return (
    <div className="panel">
      <div className="panel-title">Daily Activity</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data.map((d) => ({ ...d, label: short(d.date) }))}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Legend />
          <Bar dataKey="captured" name="Captured" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="uploaded" name="Uploaded" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
