export const UNIT_METERS = Object.freeze({ km: 1000, mile: 1609.344 });

export function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite.`);
  return value;
}

function unitMeters(unit) {
  if (!Object.hasOwn(UNIT_METERS, unit)) throw new Error('Unit must be km or mile.');
  return UNIT_METERS[unit];
}

export function averagePace(goalSeconds, distanceM, unit = 'km') {
  return positive(goalSeconds, 'Goal time') / positive(distanceM, 'Distance') * unitMeters(unit);
}

/** Simple linear grade heuristic: +3% pace per +1 percentage-point grade.
 * Clamp grades at +/-20% to avoid absurd GPS spikes. Symmetric, deliberately
 * approximate, not a physiological model; derivation/limits in docs/PACING-MODEL.md.
 */
export function gradeFactor(grade) {
  if (!Number.isFinite(grade)) throw new Error('Grade must be finite.');
  return 1 + 3 * Math.max(-0.2, Math.min(0.2, grade));
}

export function planSegments(points, goalSeconds) {
  positive(goalSeconds, 'Goal time');
  if (!Array.isArray(points) || points.length < 2 || points[0].distanceM !== 0) {
    throw new Error('Course needs at least two points and must start at distance zero.');
  }
  const segments = [];
  points.forEach((p, i) => {
    if (!Number.isFinite(p.distanceM) || !Number.isFinite(p.elevationM) || p.distanceM < 0) {
      throw new Error('Course coordinates must be finite and distance nonnegative.');
    }
    if (!i) return;
    const a = points[i - 1];
    const distanceM = p.distanceM - a.distanceM;
    if (distanceM < 0) throw new Error('Course distances must be ordered.');
    if (!distanceM) return; // Duplicate GPS samples consume no distance or time.
    const grade = (p.elevationM - a.elevationM) / distanceM;
    segments.push({ startM: a.distanceM, endM: p.distanceM, distanceM, grade,
      weight: distanceM * gradeFactor(grade) });
  });
  const weight = positive(segments.reduce((sum, s) => sum + s.weight, 0), 'Course distance');
  return segments.map(s => ({ ...s, timeSeconds: goalSeconds * s.weight / weight,
    secondsPerM: goalSeconds * s.weight / weight / s.distanceM }));
}

/** Integrate piecewise-constant segment pace over exact split boundaries. */
export function createPlan(points, goalSeconds, splitDistanceM = 1000, unit = 'km') {
  positive(splitDistanceM, 'Split distance');
  const meters = unitMeters(unit);
  const segments = planSegments(points, goalSeconds);
  const distanceM = points.at(-1).distanceM;
  if (Math.ceil(distanceM / splitDistanceM) > 10000) throw new Error('Maximum 10000 splits.');
  const splits = [];
  let segmentIndex = 0;
  for (let startM = 0; startM < distanceM;) {
    const proposedEnd = startM + splitDistanceM;
    const endM = distanceM - proposedEnd < 1e-7 ? distanceM : proposedEnd;
    let timeSeconds = 0;
    while (segmentIndex < segments.length) {
      const s = segments[segmentIndex];
      timeSeconds += Math.max(0, Math.min(endM, s.endM) - Math.max(startM, s.startM)) * s.secondsPerM;
      if (s.endM >= endM) break;
      segmentIndex++;
    }
    splits.push({ number: splits.length + 1, startM, endM, distanceM: endM - startM, timeSeconds });
    startM = endM;
  }
  const scale = goalSeconds / splits.reduce((sum, s) => sum + s.timeSeconds, 0);
  let cumulativeSeconds = 0;
  splits.forEach((s, i) => {
    s.timeSeconds = i === splits.length - 1 ? goalSeconds - cumulativeSeconds : s.timeSeconds * scale;
    cumulativeSeconds += s.timeSeconds;
    s.cumulativeSeconds = cumulativeSeconds;
    s.pace = s.timeSeconds / s.distanceM * meters;
    s.speedMps = s.distanceM / s.timeSeconds;
  });
  return { distanceM, goalSeconds, unit, averagePace: averagePace(goalSeconds, distanceM, unit), segments, splits };
}
