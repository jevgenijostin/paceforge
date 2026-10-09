import { XMLParser, XMLValidator } from 'fast-xml-parser';

const list = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const radians = degrees => degrees * Math.PI / 180;

export function haversineM(a, b) {
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat))
    * Math.sin(radians(b.lon - a.lon) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Missing elevations are interpolated by distance, with nearest-value ends.
 * Track/segment gaps are rejected: connecting them would invent course distance.
 */
export function parseGpx(xml) {
  if (typeof xml !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('GPX must be XML without DTDs or entity declarations.');
  }
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid GPX XML.');
  const data = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true,
    parseTagValue: false, processEntities: false }).parse(xml);
  if (!data.gpx || data.gpx['@_version'] !== '1.1') throw new Error('Expected GPX 1.1.');
  const segments = list(data.gpx.trk).flatMap(t => list(t.trkseg)).filter(s => list(s.trkpt).length);
  if (segments.length !== 1) throw new Error('Expected one continuous GPX track segment.');
  const raw = list(segments[0].trkpt).map(p => {
    const number = (value, label) => {
      if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value))) {
        throw new Error(`Invalid trackpoint ${label}.`);
      }
      return Number(value);
    };
    const lat = number(p['@_lat'], 'latitude');
    const lon = number(p['@_lon'], 'longitude');
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Coordinates out of range.');
    return { lat, lon, elevationM: p.ele === undefined ? null : number(p.ele, 'elevation') };
  });
  if (raw.length < 2) throw new Error('At least two trackpoints are required.');
  let distanceM = 0;
  const points = raw.map((p, i) => {
    if (i) distanceM += haversineM(raw[i - 1], p);
    return { distanceM, elevationM: p.elevationM };
  });
  if (distanceM <= 0) throw new Error('Course must have positive distance.');
  const known = points.map((p, i) => p.elevationM === null ? -1 : i).filter(i => i >= 0);
  if (!known.length) return points.map(p => ({ ...p, elevationM: 0 }));
  let right = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].elevationM !== null) continue;
    while (right < known.length - 1 && known[right] < i) right++;
    const b = points[known[right]];
    const a = points[known[Math.max(0, right - 1)]];
    const span = b.distanceM - a.distanceM;
    const fraction = span > 0 ? Math.min(1, Math.max(0, (points[i].distanceM - a.distanceM) / span)) : 0;
    points[i].elevationM = a.elevationM + fraction * (b.elevationM - a.elevationM);
    if (i > known.at(-1)) points[i].elevationM = points[known.at(-1)].elevationM;
  }
  return points;
}
