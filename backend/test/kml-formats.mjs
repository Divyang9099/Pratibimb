// Regression tests for the real-world KML dialects we've hit in the field.
// Each fixture is trimmed from an actual customer file — the shapes differ
// enough that a parser handling one can silently return zero towers for
// another, which is exactly the failure these guard against.
// Run: node test/kml-formats.mjs   (from the backend folder)
import { parseKml, towerNumberFrom } from '../src/services/kml.js';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
};

// --- Dialect A: OSM-style. <name>Tower N</name> + a real LineString. ---
const osmStyle = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>Line 353881207 (2.00 km)</name><LineString><coordinates>
    74.113234,22.6825194,0 74.1152941,22.6849744,0 74.1171866,22.6872754,0
  </coordinates></LineString></Placemark>
  <Placemark><name>Tower 546</name>
    <description><![CDATA[<b>Tower Number:</b> 546]]></description>
    <Point><coordinates>74.113234,22.6825194,0</coordinates></Point></Placemark>
  <Placemark><name>Tower 547</name>
    <Point><coordinates>74.1152941,22.6849744,0</coordinates></Point></Placemark>
</Document></kml>`;

const a = parseKml(osmStyle);
check('A: parses 2 towers', a.towers.length === 2);
check('A: numbers are 546,547', a.towers.map((t) => t.number).join(',') === '546,547');
check('A: lat/lng in the right order', a.towers[0].lat === 22.6825194 && a.towers[0].lng === 74.113234);
check('A: uses the real LineString (3 pts), not the 2 tower points', a.route.length === 3);
check('A: skips the LineString placemark despite digits in its name', a.towers.length === 2);

// --- Dialect B: ERP/GIS. <Placemark id="…">, zero-padded T-labels, no line. ---
const erpStyle = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"
  xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>
  <name>765kV Vadodara-Assoj.kmz</name>
  <Schema name="ERPdata" id="S_ERPdata_SDD"><SimpleField type="string" name="TOWER"/></Schema>
  <Placemark id="0ACF214CC63F64EBAA45"><name>T0515</name>
    <ExtendedData><SchemaData schemaUrl="#S_ERPdata_SDD">
      <SimpleData name="TOWER">T0515</SimpleData>
      <SimpleData name="LONG">74.3953</SimpleData>
      <SimpleData name="LAT">22.7214</SimpleData>
    </SchemaData></ExtendedData>
    <Point><coordinates>74.39531238722753,22.72128705294708,0</coordinates></Point></Placemark>
  <Placemark id="1EDB4EAF6F3F64EBAA45"><name>T0546</name>
    <ExtendedData><SchemaData schemaUrl="#S_ERPdata_SDD">
      <SimpleData name="TOWER">T0546</SimpleData>
    </SchemaData></ExtendedData>
    <Point><coordinates>74.39331728434504,22.71998248410154,0</coordinates></Point></Placemark>
</Document></kml>`;

const b = parseKml(erpStyle);
// The attribute on <Placemark id="…"> is what broke the original parser.
check('B: parses placemarks that carry attributes', b.towers.length === 2);
check('B: strips leading zeros (T0515 -> 515)', b.towers[0].number === '515');
check('B: T0546 matches an existing "546" tower', b.towers[1].number === '546');
check('B: ignores the <Schema> name outside placemarks', !b.towers.some((t) => t.number === null));
check('B: synthesises a route when the file has no LineString', b.route.length === 2);

// --- Dialect C: ogr2ogr-style. No <name> at all; label only in ExtendedData,
//     under a differently-spelled field, and 2-component coordinates. ---
const ogrStyle = `<?xml version="1.0" encoding="utf-8"?><kml xmlns="http://www.opengis.net/kml/2.2">
<Document id="root_doc">
<Schema name="t_locations" id="t_locations">
  <SimpleField name="Tower Name" type="string"></SimpleField>
</Schema>
<Folder><name>t_locations</name>
  <Placemark><ExtendedData><SchemaData schemaUrl="#t_locations">
    <SimpleData name="Tower Name">Tower 3</SimpleData>
    <SimpleData name="Longitude">75.9010415</SimpleData>
    <SimpleData name="Latitude">22.9074891</SimpleData>
  </SchemaData></ExtendedData>
  <Point><coordinates>75.9010415,22.9074891</coordinates></Point></Placemark>
  <Placemark><ExtendedData><SchemaData schemaUrl="#t_locations">
    <SimpleData name="Tower Name">Tower 4</SimpleData>
    <SimpleData name="Longitude">75.8996487</SimpleData>
    <SimpleData name="Latitude">22.9077296</SimpleData>
  </SchemaData></ExtendedData>
  <Point><coordinates>75.8996487,22.9077296</coordinates></Point></Placemark>
</Folder></Document></kml>`;

const c = parseKml(ogrStyle);
check('C: parses placemarks with no <name> tag', c.towers.length === 2);
check('C: reads the "Tower Name" ExtendedData field', c.towers.map((t) => t.number).join(',') === '3,4');
check('C: handles 2-component coordinates (no altitude)', c.towers[0].lat === 22.9074891 && c.towers[0].lng === 75.9010415);
check('C: does not mistake Latitude/Longitude fields for the label', c.towers[0].number === '3');
check('C: ignores the <Folder> name', c.towers.length === 2);

// --- Cross-cutting behaviour ---
check('route-only KML yields no towers', parseKml(
  '<kml><Placemark><LineString><coordinates>1,2,0 3,4,0</coordinates></LineString></Placemark></kml>'
).towers.length === 0);
check('style-only KML yields nothing at all', (() => {
  const r = parseKml('<kml><Document><name>x.kml</name><Style id="s"><IconStyle><scale>1.1</scale></IconStyle></Style></Document></kml>');
  return r.towers.length === 0 && r.route.length === 0;
})());
check('namespace-prefixed tags parse', parseKml(
  '<kml:kml><kml:Placemark><kml:name>Tower 9</kml:name><kml:Point><kml:coordinates>72.5,21.5,0</kml:coordinates></kml:Point></kml:Placemark></kml:kml>'
).towers[0]?.number === '9');
check('duplicate tower numbers collapse to the first', parseKml(
  `<kml><Placemark><name>Tower 1</name><Point><coordinates>72.5,21.5,0</coordinates></Point></Placemark>
   <Placemark><name>Tower 1</name><Point><coordinates>99.9,9.9,0</coordinates></Point></Placemark></kml>`
).towers.length === 1);
check('non-string input is handled', parseKml(null).towers.length === 0);

// --- Number normalisation: the key to matching across export formats ---
check('towerNumberFrom: "Tower 546" -> 546', towerNumberFrom('Tower 546') === '546');
check('towerNumberFrom: "T0515" -> 515', towerNumberFrom('T0515') === '515');
check('towerNumberFrom: "T-12A" -> 12', towerNumberFrom('T-12A') === '12');
check('towerNumberFrom: "0" stays "0"', towerNumberFrom('0') === '0');
check('towerNumberFrom: no digits -> null', towerNumberFrom('Substation') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
