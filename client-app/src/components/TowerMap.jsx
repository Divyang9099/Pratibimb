import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';

const COLORS = { green: '#22c55e', yellow: '#eab308', red: '#ef4444', grey: '#94a3b8' };

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

  // Only show the grey legend entry when a KML revision actually dropped towers.
  const hasStale = useMemo(() => located.some((t) => t.status === 'grey'), [located]);

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
    <>
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
              radius={t.status === 'grey' ? 4 : 5}
              pathOptions={{
                color: COLORS[t.status],
                fillColor: COLORS[t.status],
                fillOpacity: t.status === 'grey' ? 0.45 : 1,
                weight: 1,
              }}
            >
              <Tooltip direction="top">
                Tower {t.number}
                {t.issueReplace ? ' ⚠ issue' : ''}
                <br />
                {t.status === 'grey'
                  ? 'Not on the current line'
                  : t.status === 'green'
                  ? 'Captured & uploaded'
                  : t.status === 'yellow'
                  ? 'Captured, upload pending'
                  : 'Pending'}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="map-legend">
        <span><i style={{ background: COLORS.green }} /> Captured &amp; Uploaded</span>
        <span><i style={{ background: COLORS.yellow }} /> Captured, Upload Pending</span>
        <span><i style={{ background: COLORS.red }} /> Not Yet Captured</span>
        {hasStale && <span><i style={{ background: COLORS.grey }} /> Not On Current Line</span>}
      </div>
    </>
  );
}
