import { positive } from '../pacing.js';
import { durationsMs } from './common.js';

const escapeXml = value => String(value).replace(/[<>&"']/g, c => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
})[c]);

/** Zwift run Power is a speed multiplier, not watts. pace=1 selects 5K
 * benchmark; durationType=time makes Duration seconds. See docs/EXPORTS.md.
 * Without a supplied benchmark, the user must set Zwift's 5K time to the
 * flat-equivalent 5K goal shown in the description and CLI warning.
 */
export function exportZwo(plan, { name = 'PaceForge race plan', fiveKSeconds = plan.goalSeconds / plan.distanceM * 5000 } = {}) {
  positive(fiveKSeconds, 'Zwift 5K benchmark');
  const durations = durationsMs(plan);
  const referenceSpeed = 5000 / fiveKSeconds;
  const blocks = plan.splits.map((s, i) =>
    `    <SteadyState Duration="${durations[i] / 1000}" Power="${(s.speedMps / referenceSpeed).toFixed(9)}" pace="1"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>PaceForge</author>
  <name>${escapeXml(name)}</name>
  <description>${escapeXml(`Running targets require Zwift 5K benchmark ${fiveKSeconds.toFixed(3)} seconds. Power attributes are relative running speeds, not watts.`)}</description>
  <sportType>run</sportType>
  <durationType>time</durationType>
  <tags/>
  <workout>
${blocks}
  </workout>
</workout_file>
`;
}
