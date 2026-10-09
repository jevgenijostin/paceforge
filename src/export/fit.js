import { createHash } from 'node:crypto';
import { Encoder, Profile } from '@garmin/fitsdk';
import { durationsMs } from './common.js';

/** FIT workouts use FileId + Workout + WorkoutStep, not activity Record/Lap.
 * SDK encoder ignores subfields; write raw parent values: milliseconds for
 * durationValue and 1000 * m/s for custom speed limits (FIT Profile 21.218).
 */
export function exportFit(plan, { name = 'PaceForge race plan', createdAt = new Date('2026-01-01T00:00:00Z') } = {}) {
  const durations = durationsMs(plan);
  if (plan.splits.length > 50) throw new Error('FIT export supports at most 50 steps for device compatibility; increase --splits.');
  const encoder = new Encoder();
  const serialNumber = createHash('sha256').update(JSON.stringify({ name, splits: plan.splits })).digest().readUInt32LE(0) % 0xffffffff;
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: 'workout', manufacturer: 'development',
    product: 0, serialNumber, timeCreated: createdAt });
  encoder.onMesg(Profile.MesgNum.WORKOUT, { sport: 'running', numValidSteps: plan.splits.length,
    wktName: [...name].slice(0, 30).join('') });
  plan.splits.forEach((s, i) => {
    const speed = Math.round(s.speedMps * 1000);
    if (speed < 1 || speed >= 0xffffffff) throw new Error('FIT speed is outside encoding limits.');
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, { messageIndex: i, wktStepName: `Split ${i + 1}`,
      intensity: 'active', durationType: 'time', durationValue: durations[i],
      targetType: 'speed', targetValue: 0, customTargetValueLow: speed, customTargetValueHigh: speed });
  });
  return Buffer.from(encoder.close());
}
