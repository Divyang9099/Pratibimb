// Lightweight KML parser tailored to the inspection KMLs we ingest:
//   - an optional <LineString> for the powerline route
//   - many <Placemark> Points, one per tower
//
// Real-world exports vary more than you'd hope, so this handles:
//   - attributes on tags:      <Placemark id="0ACF21…">
//   - namespace prefixes:      <kml:Placemark>
//   - tower labels as either   <name>Tower 546</name>  (OSM-style export)
//                       or     <name>T0515</name> + <SimpleData name="TOWER">
//                              (ERP/GIS-style export)
//   - CDATA-wrapped names
//
// Coordinates in KML are "lng,lat,alt". We return lat/lng pairs.
// This is intentionally dependency-free; swap for @tmcw/togeojson +
// @xmldom/xmldom if arbitrary/complex KML support is ever needed.

// Tag matchers that tolerate a namespace prefix and any attributes.
const OPEN = (tag) => new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>`, 'i');
const PAIR = (tag) => new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i');

const firstMatch = (str, re) => {
  const m = str.match(re);
  return m ? m[1] : null;
};

const stripCdata = (s) =>
  (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

// Parse a "lng,lat,alt lng,lat,alt …" coordinate blob into [[lat, lng], …].
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

// Pull every <SimpleData name="…">value</SimpleData> pair out of a placemark.
function extendedDataFields(block) {
  const out = {};
  const re =
    /<(?:\w+:)?SimpleData\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?SimpleData>/gi;
  let m;
  while ((m = re.exec(block))) out[m[1].trim()] = stripCdata(m[2]);
  return out;
}

// Exports name the tower field inconsistently — "TOWER", "Tower Name",
// "TowerNo" — and some omit <name> on the placemark entirely, carrying the
// label only in ExtendedData. Prefer an exact-ish field match, then any
// tower-ish field, then the placemark's own <name>. The negative lookahead
// keeps neighbouring "Latitude"/"Longitude" fields from being mistaken for
// the label.
const TOWER_FIELD = /^tower(\s*[_-]?\s*(name|no\.?|number|id))?$/i;

function towerLabelFrom(block) {
  const fields = extendedDataFields(block);
  const keys = Object.keys(fields);
  const key =
    keys.find((k) => TOWER_FIELD.test(k)) ||
    keys.find((k) => /tower/i.test(k) && !/lat|long?|height|type|status|owner/i.test(k));
  if (key && fields[key]) return fields[key];
  return firstMatch(block, PAIR('name')) || '';
}

// Reduce a tower label to its numeric identity: "Tower 546" -> "546",
// "T0515" -> "515". Leading zeros are stripped so the same physical tower
// matches across exports that pad differently ("T0546" vs "Tower 546") —
// without this, a re-upload would drop every tower and re-add it as new,
// orphaning its capture history.
export function towerNumberFrom(label) {
  const m = stripCdata(label).match(/\d+/);
  if (!m) return null;
  return m[0].replace(/^0+(?=\d)/, '');
}

export function parseKml(kml) {
  const result = { towers: [], route: [] };
  if (!kml || typeof kml !== 'string') return result;

  // --- Route: first LineString, if the export includes one ---
  const lineCoords = firstMatch(
    kml,
    /<(?:\w+:)?LineString\b[^>]*>[\s\S]*?<(?:\w+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:\w+:)?coordinates>/i
  );
  result.route = parseCoordBlob(lineCoords);

  // --- Towers: every Placemark that carries a Point ---
  const placemarks = kml.split(OPEN('Placemark')).slice(1);
  const seen = new Set();

  for (const block of placemarks) {
    const pointCoords = firstMatch(
      block,
      /<(?:\w+:)?Point\b[^>]*>[\s\S]*?<(?:\w+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:\w+:)?coordinates>/i
    );
    if (!pointCoords) continue; // not a tower (e.g. the LineString placemark)

    const number = towerNumberFrom(towerLabelFrom(block));
    if (!number || seen.has(number)) continue;

    const [pair] = parseCoordBlob(pointCoords);
    if (!pair) continue;
    const [lat, lng] = pair;

    seen.add(number);
    result.towers.push({ number, lat, lng });
  }

  // Many GIS exports ship tower points with no LineString at all. Towers on a
  // transmission line are numbered sequentially along it, so joining them in
  // numeric order reconstructs the route. Only used when the KML has none of
  // its own — a real LineString always wins.
  if (!result.route.length && result.towers.length > 1) {
    result.route = [...result.towers]
      .sort((a, b) => Number(a.number) - Number(b.number))
      .map((t) => [t.lat, t.lng]);
  }

  return result;
}
