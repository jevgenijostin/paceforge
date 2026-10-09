import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGpx } from '../src/gpx.js';
import { averagePace, createPlan, gradeFactor, planSegments } from '../src/pacing.js';

const fixture = name => parseGpx(readFileSync(new URL(`../fixtures/${name}.gpx`, import.meta.url), 'utf8'));
const course = [{ distanceM: 0, elevationM: 0 }, { distanceM: 1000, elevationM: 30 }, { distanceM: 2000, elevationM: 0 }];

describe('pacing mathematics', () => {
  it('computes average pace in km and exact international miles', () => {
    expect(averagePace(1500, 5000)).toBe(300);
    expect(averagePace(1500, 5000, 'mile')).toBeCloseTo(482.8032, 8);
  });
  it.each(['flat-5k', 'no-elevation'])('keeps %s flat', name => {
    const p = createPlan(fixture(name), 1800, 1000);
    for (const s of p.splits) expect(s.pace).toBeCloseTo(p.averagePace, 8);
    for (const s of p.segments) expect(s.grade).toBe(0);
  });
  it('slows uphill and speeds downhill relative to average on balanced hills', () => {
    const p = createPlan(course, 600);
    expect(p.splits[0].pace).toBeCloseTo(327, 10);
    expect(p.splits[1].pace).toBeCloseTo(273, 10);
    expect(p.splits[0].pace).toBeGreaterThan(p.averagePace);
    expect(p.splits[1].pace).toBeLessThan(p.averagePace);
  });
  it('integrates a split crossing a grade boundary', () => {
    const p = createPlan(course, 600, 1500);
    expect(p.splits.map(s => s.timeSeconds)).toEqual([463.5, 136.5]);
    expect(p.splits.map(s => s.distanceM)).toEqual([1500, 500]);
  });
  it('does not change physical times when display units change', () => {
    const km = createPlan(course, 600, 1000);
    const mile = createPlan(course, 600, 1000, 'mile');
    expect(mile.splits[0].timeSeconds).toBe(km.splits[0].timeSeconds);
    expect(mile.splits[0].pace).toBeCloseTo(km.splits[0].pace * 1.609344, 10);
  });
  it('handles a split longer than the course', () => {
    expect(createPlan(course, 600, 5000).splits).toMatchObject([{ distanceM: 2000, timeSeconds: 600 }]);
  });
  it('clamps extreme positive and negative grades to safe positive factors', () => {
    expect(gradeFactor(0)).toBe(1);
    expect(gradeFactor(1)).toBe(1.6);
    expect(gradeFactor(-1)).toBeCloseTo(.4, 12);
  });
  it('skips duplicate points and leaves inputs unchanged', () => {
    const input = structuredClone(course);
    input.splice(1, 0, { ...input[0] });
    const before = structuredClone(input);
    expect(planSegments(input, 600)).toHaveLength(2);
    expect(input).toEqual(before);
  });
  it.each([2, 99.9, 333, 1000, 1609.344, 3000, 12000])('preserves total time for split distance %s', split => {
    for (const goal of [123.456, 3600, 86399.999]) {
      const p = createPlan(fixture('hilly-10k'), goal, split);
      expect(p.splits.reduce((sum, s) => sum + s.timeSeconds, 0)).toBeCloseTo(goal, 8);
      expect(p.splits.reduce((sum, s) => sum + s.distanceM, 0)).toBeCloseTo(p.distanceM, 7);
      expect(p.splits.every(s => s.timeSeconds > 0 && s.speedMps > 0)).toBe(true);
      expect(p.splits.at(-1).cumulativeSeconds).toBe(goal);
    }
  });
  it('matches the hand-derived complete hilly fixture golden plan', () => {
    // Each .009-degree equatorial leg: L = 6371000*pi/20000 = 1000.754339801 m.
    // Net climb zero => total weight 10L. Time per leg = 360 + 1080*rise/L.
    // Split at L (rather than 1000m) makes this independently hand-checkable.
    const p = createPlan(fixture('hilly-10k'), 3600, 1000.7543398010286);
    const times = [392.375578, 327.624422, 403.167437, 316.832563, 381.583719,
      338.416281, 413.959296, 306.040704, 370.791859, 349.208141];
    // Floating-point longitude arithmetic may leave an insignificant final fragment;
    // the splitter must absorb that numerical noise, not create an eleventh split.
    expect(p.splits).toHaveLength(10);
    expect(p.distanceM).toBeCloseTo(10007.543398010286, 7);
    expect(p.averagePace).toBeCloseTo(359.728642367, 7);
    let cumulative = 0;
    p.splits.forEach((s, i) => {
      cumulative += times[i];
      expect(s.number).toBe(i + 1);
      expect(s.distanceM).toBeCloseTo(1000.754339801, 7);
      expect(s.timeSeconds).toBeCloseTo(times[i], 5);
      expect(s.pace).toBeCloseTo(times[i] / 1.000754339801, 5);
      expect(s.cumulativeSeconds).toBeCloseTo(cumulative, 5);
    });
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid goal %s', goal => {
    expect(() => createPlan(course, goal)).toThrow();
    expect(() => averagePace(goal, 1000)).toThrow();
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid split distance %s', split => expect(() => createPlan(course, 600, split)).toThrow());
  it('rejects invalid units, unordered/invalid points and excessive split counts', () => {
    expect(() => createPlan(course, 600, 1000, 'feet')).toThrow();
    expect(() => createPlan(course, 600, .01)).toThrow();
    expect(() => planSegments([], 600)).toThrow();
    expect(() => planSegments([course[1], course[2]], 600)).toThrow();
    expect(() => planSegments([course[0], course[2], course[1]], 600)).toThrow();
    expect(() => planSegments([course[0], { distanceM: 1, elevationM: NaN }], 600)).toThrow();
    expect(() => gradeFactor(NaN)).toThrow();
  });
});
