import KpiCards from './KpiCards.jsx';
import TowerMap from './TowerMap.jsx';
import DailyActivityChart from './DailyActivityChart.jsx';
import PredictionBox from './PredictionBox.jsx';
import CommunicationChart from './CommunicationChart.jsx';
import FieldPhotos from './FieldPhotos.jsx';
import NonWorkingDays from './NonWorkingDays.jsx';

export default function Dashboard({ data, projectId, accessKey }) {
  const hasNonWorking = (data.nonWorkingDays && data.nonWorkingDays.length > 0) ||
                        (data.towerIssues && data.towerIssues.length > 0);

  return (
    <div className="dashboard">
      <h2 className="proj-title">{data.project.name}</h2>

      <KpiCards kpi={data.kpi} />

      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">Route Map</div>
          <TowerMap towers={data.towers} route={data.project.route} />
        </div>
        <DailyActivityChart data={data.dailyActivity} />
      </div>

      <div className="grid-2">
        <PredictionBox prediction={data.prediction} />
        <CommunicationChart data={data.communication} />
      </div>

      {/* Non-working days + field photos — full width */}
      {hasNonWorking && (
        <div style={{ marginTop: 16 }}>
          <NonWorkingDays days={data.nonWorkingDays || []} issues={data.towerIssues || []} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <FieldPhotos projectId={projectId} accessKey={accessKey} />
      </div>
    </div>
  );
}
