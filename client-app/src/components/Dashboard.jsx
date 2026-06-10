import KpiCards from './KpiCards.jsx';
import TowerMap from './TowerMap.jsx';
import DailyActivityChart from './DailyActivityChart.jsx';
import PredictionBox from './PredictionBox.jsx';
import CommunicationChart from './CommunicationChart.jsx';
import FieldPhotos from './FieldPhotos.jsx';

export default function Dashboard({ data, projectId, accessKey }) {
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

      {/* Field photos row — full width */}
      <div style={{ marginTop: 16 }}>
        <FieldPhotos projectId={projectId} accessKey={accessKey} />
      </div>
    </div>
  );
}
