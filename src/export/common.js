import { positive } from '../pacing.js';

// Round cumulative boundaries, not individual durations: total error <= 0.5ms.
export function durationsMs(plan) {
  positive(plan.goalSeconds, 'Goal time');
  if (!plan.splits?.length) throw new Error('Export requires splits.');
  let previous = 0;
  return plan.splits.map(s => {
    positive(s.speedMps, 'Split speed');
    const end = Math.round(s.cumulativeSeconds * 1000);
    const duration = end - previous;
    previous = end;
    if (duration < 1 || duration >= 0xffffffff) throw new Error('Export step duration is outside FIT/time resolution limits.');
    return duration;
  });
}
