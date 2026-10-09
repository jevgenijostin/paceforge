import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Decoder, Stream } from '@garmin/fitsdk';
import { parseGpx } from '../src/gpx.js';
import { createPlan } from '../src/pacing.js';
import { exportFit } from '../src/export/fit.js';
import { exportZwo } from '../src/export/zwo.js';

const points = parseGpx(readFileSync(new URL('../fixtures/hilly-10k.gpx', import.meta.url), 'utf8'));
const plan = createPlan(points, 3600.123, 1000);
const decode = bytes => {
  const decoder = new Decoder(Stream.fromBuffer(bytes));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return messages;
};

describe('Zwift running export', () => {
  it('produces well-formed time-based running XML with correct relative speeds', () => {
    const xml = exportZwo(plan, { name: 'Hill <A> & "B"', fiveKSeconds: 1500 });
    expect(XMLValidator.validate(xml)).toBe(true);
    const doc = new XMLParser({ ignoreAttributes: false }).parse(xml).workout_file;
    expect(doc.name).toBe('Hill <A> & "B"');
    expect(doc.sportType).toBe('run');
    expect(doc.durationType).toBe('time');
    expect(doc.description).toContain('1500.000 seconds');
    const blocks = doc.workout.SteadyState;
    expect(blocks).toHaveLength(plan.splits.length);
    let total = 0;
    blocks.forEach((b, i) => {
      expect(b['@_pace']).toBe('1');
      expect(Number(b['@_Power']) * (5000 / 1500)).toBeCloseTo(plan.splits[i].speedMps, 7);
      expect(Number(b['@_Duration'])).toBeCloseTo(plan.splits[i].timeSeconds, 2);
      total += Number(b['@_Duration']);
    });
    expect(total).toBeCloseTo(plan.goalSeconds, 9);
  });
  it('documents the flat-equivalent default benchmark', () => {
    expect(exportZwo(plan)).toContain(`${(plan.goalSeconds / plan.distanceM * 5000).toFixed(3)} seconds`);
  });
  it('rejects invalid benchmarks', () => expect(() => exportZwo(plan, { fiveKSeconds: 0 })).toThrow());
});

describe('Garmin FIT export', () => {
  it('round-trips file identity, running workout, durations and speed targets with valid CRC', () => {
    const messages = decode(exportFit(plan));
    expect(messages.fileIdMesgs).toHaveLength(1);
    expect(messages.fileIdMesgs[0]).toMatchObject({ type: 'workout', manufacturer: 'development', product: 0 });
    expect(messages.workoutMesgs).toHaveLength(1);
    expect(messages.workoutMesgs[0]).toMatchObject({ sport: 'running', numValidSteps: plan.splits.length, wktName: 'PaceForge race plan' });
    expect(messages.recordMesgs).toBeUndefined();
    expect(messages.lapMesgs).toBeUndefined();
    expect(messages.workoutStepMesgs).toHaveLength(plan.splits.length);
    let total = 0;
    messages.workoutStepMesgs.forEach((s, i) => {
      expect(s).toMatchObject({ messageIndex: i, wktStepName: `Split ${i + 1}`, intensity: 'active',
        durationType: 'time', targetType: 'speed', targetValue: 0 });
      expect(s.durationTime).toBeCloseTo(plan.splits[i].timeSeconds, 2);
      expect(s.customTargetSpeedLow).toBeCloseTo(plan.splits[i].speedMps, 3);
      expect(s.customTargetSpeedHigh).toBe(s.customTargetSpeedLow);
      total += s.durationTime;
    });
    expect(total).toBeCloseTo(plan.goalSeconds, 9);
  });
  it('is deterministic and changes file identity for different plans', () => {
    expect(exportFit(plan)).toEqual(exportFit(plan));
    const other = createPlan(points, 4000, 1000);
    expect(decode(exportFit(plan)).fileIdMesgs[0].serialNumber).not.toBe(decode(exportFit(other)).fileIdMesgs[0].serialNumber);
  });
  it('detects corrupted binary via SDK integrity check', () => {
    const bytes = exportFit(plan);
    bytes[bytes.length - 3] ^= 1;
    expect(new Decoder(Stream.fromBuffer(bytes)).checkIntegrity()).toBe(false);
  });
  it('supports one step and a fractional final step', () => {
    expect(decode(exportFit(createPlan(points, 3600, 20000))).workoutStepMesgs).toHaveLength(1);
    expect(decode(exportFit(plan)).workoutStepMesgs.at(-1).durationTime).toBeGreaterThan(0);
  });
  it('rejects more than 50 steps with an actionable message', () => {
    expect(() => exportFit(createPlan(points, 3600, 100))).toThrow('increase --splits');
  });
  it.each([exportFit, exportZwo])('rejects sub-millisecond splits instead of emitting zero durations', exporter => {
    expect(() => exporter(createPlan(points, .0001, 1000))).toThrow('resolution');
  });
});
