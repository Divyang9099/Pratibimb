import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';

const COLORS = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' };

// Fit the view to all available geometry (route + tower points) once.
function FitBounds({ points }) {
  const map = useMap();
  useMemo(() => {
    if (points.length) map.fitBounds(points, { padding: [20, 20] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);
  return null;
}

// Map of the powerline route. The grey base line is the KML route; each
// tower is a coloured dot:
//   green  = captured & uploaded
//   yellow = captured, upload pending
//   red    = pending capture
export default function TowerMap({ towers, route = [] }) {
  const located = useMemo(
    () => towers.filter((t) => typeof t.lat === 'number' && typeof t.lng === 'number'),
    [towers]
  );

  const allPoints = useMemo(
    () => [...route, ...located.map((t) => [t.lat, t.lng])],
    [route, located]
  );

  if (!allPoints.length) {
    return (
      <div className="map-empty">
        No tower coordinates yet. Upload a KML (or click “Sync KML → map”) in the admin app.
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <MapContainer center={allPoints[0]} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={allPoints} />

        {/* Base powerline route from the KML */}
        {route.length > 1 && (
          <Polyline positions={route} pathOptions={{ color: '#94a3b8', weight: 3 }} />
        )}

        {/* Coloured tower markers by status */}
        {located.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lng]}
            radius={5}
            pathOptions={{ color: COLORS[t.status], fillColor: COLORS[t.status], fillOpacity: 1, weight: 1 }}
          >
            <Tooltip direction="top">
              Tower {t.number}
              {t.issueReplace ? ' ⚠ issue' : ''}
              <br />
              {t.status === 'green'
                ? 'Captured & uploaded'
                : t.status === 'yellow'
                ? 'Captured, upload pending'
                : 'Pending'}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="map-legend">
        <span>
          <i style={{ background: COLORS.green }} /> Done (uploaded)
        </span>
        <span>
          <i style={{ background: COLORS.yellow }} /> Captured, upload pending
        </span>
        <span>
          <i style={{ background: COLORS.red }} /> Pending
        </span>
      </div>
    </div>
  );
}
