export default function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <span className="sk sk-head" style={{ width: '40%' }} />

      {/* KPI row */}
      <div className="kpi-row" style={{ marginBottom: 18 }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="sk sk-kpi" />
        ))}
      </div>

      {/* Map + chart row */}
      <div className="grid-2" style={{ marginBottom: 18 }}>
        <span className="sk sk-map" />
        <span className="sk sk-chart" />
      </div>

      {/* Prediction + communication row */}
      <div className="grid-2">
        <span className="sk sk-card" />
        <span className="sk sk-card" />
      </div>
    </div>
  );
}
