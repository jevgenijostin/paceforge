import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseGpx } from './gpx.js';
import { createPlan, UNIT_METERS, positive } from './pacing.js';
import { exportZwo } from './export/zwo.js';
import { exportFit } from './export/fit.js';

export function parseTime(text) {
  if (typeof text !== 'string' || !/^(?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?$/.test(text)) {
    throw new Error('Time must be H:MM:SS or MM:SS (optional milliseconds).');
  }
  const parts = text.split(':').map(Number);
  if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) throw new Error('Minutes/seconds must be below 60.');
  return positive(parts.reduce((s, p) => s * 60 + p, 0), 'Time');
}

export function parseSplit(text) {
  const match = /^(\d+(?:\.\d+)?)(km|mi|mile|m)$/.exec(text ?? '');
  if (!match) throw new Error('Splits must be a distance such as 1km, 1mile, or 500m.');
  return positive(Number(match[1]) * ({ m: 1, km: 1000, mi: 1609.344, mile: 1609.344 })[match[2]], 'Split distance');
}

export function formatTime(seconds) {
  const total = Math.round(seconds);
  const sec = String(total % 60).padStart(2, '0');
  const min = Math.floor(total / 60) % 60;
  return total >= 3600 ? `${Math.floor(total / 3600)}:${String(min).padStart(2, '0')}:${sec}` : `${min}:${sec}`;
}

const HELP = `PaceForge — offline grade-adjusted race plans

paceforge plan --gpx route.gpx --goal 1:45:00 [options]
  --splits 1km         Split distance: km, mile, mi, or m
  --unit km            Display pace/distance in km or mile
  --export zwo,fit     Formats to write (omit for summary only)
  --out ./plan        Output directory; writes plan.zwo / plan.fit
  --zwift-5k MM:SS     Your existing Zwift 5K benchmark (recommended)
  --name TEXT          Workout name
  --help               Show help

Existing export files are never overwritten. No network access or accounts required.
`;

export async function runCli(args, { log = console.log, warn = console.error } = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    gpx: { type: 'string' }, goal: { type: 'string' }, splits: { type: 'string', default: '1km' },
    unit: { type: 'string', default: 'km' }, export: { type: 'string' }, out: { type: 'string', default: './plan' },
    name: { type: 'string', default: 'PaceForge race plan' }, 'zwift-5k': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) { log(HELP); return; }
  if (positionals.length !== 1 || positionals[0] !== 'plan' || !values.gpx || !values.goal) {
    throw new Error('Use: paceforge plan --gpx route.gpx --goal H:MM:SS (see --help).');
  }
  const formats = values.export === undefined ? [] : [...new Set(values.export.split(','))];
  if (formats.some(f => !['fit', 'zwo'].includes(f))) throw new Error('Export formats must be zwo and/or fit.');
  const goal = parseTime(values.goal);
  const split = parseSplit(values.splits);
  const fiveKSeconds = values['zwift-5k'] ? parseTime(values['zwift-5k']) : undefined;
  const points = parseGpx(await readFile(values.gpx, 'utf8'));
  const plan = createPlan(points, goal, split, values.unit);
  // Render all formats before writing, so encoding errors do not leave partial exports.
  const outputs = formats.map(format => [format, format === 'fit'
    ? exportFit(plan, { name: values.name }) : exportZwo(plan, { name: values.name, fiveKSeconds })]);
  log(`PaceForge | ${(plan.distanceM / 1000).toFixed(3)} km | Goal ${formatTime(goal)} | Average ${formatTime(plan.averagePace)}/${values.unit}`);
  log(`Split  Distance (${values.unit})  Pace (/${values.unit})  Split time  Cumulative`);
  for (const s of plan.splits) {
    log(`${String(s.number).padStart(5)}  ${(s.distanceM / UNIT_METERS[values.unit]).toFixed(3).padStart(13)}  ${formatTime(s.pace).padStart(10)}  ${formatTime(s.timeSeconds).padStart(10)}  ${formatTime(s.cumulativeSeconds).padStart(10)}`);
  }
  if (formats.includes('zwo')) warn(`Zwift: set your 5K benchmark to ${formatTime(fiveKSeconds ?? goal / plan.distanceM * 5000)} (${(fiveKSeconds ?? goal / plan.distanceM * 5000).toFixed(3)} seconds) for these targets. See docs/EXPORTS.md.`);
  if (outputs.length) await mkdir(values.out, { recursive: true });
  for (const [format, data] of outputs) {
    const path = join(values.out, `plan.${format}`);
    await writeFile(path, data, { flag: 'wx' });
    log(`Wrote ${path}`);
  }
  return plan;
}
