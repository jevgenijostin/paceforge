import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGpx, haversineM } from '../src/gpx.js';

export const fixture = name => readFileSync(new URL(`../fixtures/${name}.gpx`, import.meta.url), 'utf8');
const wrap = points => `<gpx version="1.1"><trk><trkseg>${points}</trkseg></trk></gpx>`;
const pt = (lon, ele = '') => `<trkpt lat="0" lon="${lon}">${ele === '' ? '' : `<ele>${ele}</ele>`}</trkpt>`;

describe('GPX parsing', () => {
  it('computes ordered cumulative haversine distance on a flat loop', () => {
    const points = parseGpx(fixture('flat-5k'));
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ distanceM: 0, elevationM: 20 });
    expect(points.at(-1).distanceM).toBeCloseTo(5003.771675, 3);
    expect(points.every((p, i) => !i || p.distanceM > points[i - 1].distanceM)).toBe(true);
  });
  it('preserves real gain and loss', () => {
    const p = parseGpx(fixture('hilly-10k'));
    expect(p.at(-1).distanceM).toBeCloseTo(10007.543398, 5);
    expect(p.reduce((sum, v, i) => sum + (i ? Math.max(0, v.elevationM - p[i - 1].elevationM) : 0), 0)).toBe(150);
  });
  it('falls back to zero when all elevation is missing', () => {
    expect(parseGpx(fixture('no-elevation')).every(p => p.elevationM === 0)).toBe(true);
  });
  it('interpolates internal gaps by distance and extends endpoints', () => {
    const points = parseGpx(wrap(pt(0) + pt(.001, 10) + pt(.002) + pt(.004, 40) + pt(.005)));
    expect(points.map(p => p.elevationM)).toEqual([10, 10, 20, 40, 40]);
  });
  it('extends one known elevation throughout', () => {
    expect(parseGpx(wrap(pt(0) + pt(.001, 12) + pt(.002))).map(p => p.elevationM)).toEqual([12, 12, 12]);
  });
  it('accepts namespace prefixes', () => {
    const xml = wrap(pt(0, 0) + pt(.01, 0)).replace(/<(\/?)(gpx|trk|trkseg|trkpt|ele)/g, '<$1g:$2');
    expect(parseGpx(xml)).toHaveLength(2);
  });
  it('handles duplicate samples without invented distance', () => {
    const p = parseGpx(wrap(pt(0, 0) + pt(0, 5) + pt(.01, 0)));
    expect(p[1].distanceM).toBe(0);
  });
  it('handles antimeridian and identical coordinates', () => {
    expect(haversineM({ lat: 0, lon: 179.99 }, { lat: 0, lon: -179.99 })).toBeCloseTo(2223.898533, 5);
    expect(haversineM({ lat: 90, lon: 0 }, { lat: 90, lon: 0 })).toBe(0);
  });
  it.each([
    '', '<gpx>', wrap(pt(0)), wrap(pt(0) + pt(0)),
    wrap(pt(0) + '<trkpt lat="100" lon="0"/>'),
    wrap(pt(0) + '<trkpt lat="0"/>'), wrap(pt(0) + pt('NaN')),
    wrap(pt(0) + pt(.01, 'bad')), wrap(pt(0) + '<trkpt lat="" lon="1"/>'),
    '<!DOCTYPE gpx><gpx version="1.1"/>',
    '<gpx version="1.1"><trk><trkseg><trkpt lat="0" lon="0"/></trkseg><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>',
    wrap(pt(0) + pt(.01)).replace('1.1', '1.0'),
  ])('rejects invalid or discontinuous GPX: %s', xml => expect(() => parseGpx(xml)).toThrow());
});
