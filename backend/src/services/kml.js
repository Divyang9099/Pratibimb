// Lightweight KML parser tailored to the inspection KMLs we ingest:
//   - one <LineString> for the powerline route
//   - many <Placemark> Points named like "Tower 12" for each tower
//
// Coordinates in KML are "lng,lat,alt". We return lat/lng pairs.
// This is intentionally dependency-free; swap for @tmcw/togeojson +
// @xmldom/xmldom if arbitrary/complex KML support is ever needed.

const firstMatch = (str, re) => {
  const m = str.match(re);
  return m ? m[1] : null;
};

// Parse a "lng,lat,alt lng,lat,alt …" coordinate blob into [[lat,lng], …].
function parseCoordBlob(blob) {
  if (!blob) return [];
  return blob
    .trim()
    .split(/\s+/)
    .map((tuple) => {
      const [lng, lat] = tuple.split(',').map(Number);
      return [lat, lng];
    })
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

export function parseKml(kml) {
  const result = { towers: [], route: [] };
  if (!kml || typeof kml !== 'string') return result;

  // --- Route: first LineString ---
  const lineCoords = firstMatch(
    kml,
    /<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/i
  );
  result.route = parseCoordBlob(lineCoords);

  // --- Towers: every Placemark that has a Point ---
  const placemarks = kml.split(/<Placemark>/i).slice(1);
  for (const block of placemarks) {
    const pointCoords = firstMatch(
      block,
      /<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i
    );
    if (!pointCoords) continue; // not a tower point (e.g. the LineString placemark)

    const name = firstMatch(block, /<name>([\s\S]*?)<\/name>/i) || '';
    const numMatch = name.match(/(\d+)/); // "Tower 12" -> "12"
    if (!numMatch) continue;

    const [pair] = parseCoordBlob(pointCoords);
    if (!pair) continue;
    const [lat, lng] = pair;
    result.towers.push({ number: numMatch[1], lat, lng });
  }

  return result;
}
