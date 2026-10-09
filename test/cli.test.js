import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseTime, parseSplit, formatTime, runCli } from '../src/cli.js';

const directories = [];
const temp = () => { const p = mkdtempSync(join(tmpdir(), 'paceforge-test-')); directories.push(p); return p; };
afterEach(() => directories.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));

describe('CLI', () => {
  it.each([['1:45:00', 6300], ['25:00', 1500], ['0:00:01.234', 1.234]])('parses goal %s', (s, n) => expect(parseTime(s)).toBe(n));
  it.each(['', '1:60:00', '1:22:60', '0:00', '-1:00', 'hello', '300', '1:2:3'])('rejects malformed goal %s', s => expect(() => parseTime(s)).toThrow());
  it.each([['1km', 1000], ['1mile', 1609.344], ['1mi', 1609.344], ['0.5km', 500], ['400m', 400]])('parses split %s', (s, n) => expect(parseSplit(s)).toBe(n));
  it.each(['0km', '-1km', '1ft', 'km', '1'])('rejects split %s', s => expect(() => parseSplit(s)).toThrow());
  it('formats carry across minutes and hours', () => {
    expect(formatTime(59.9)).toBe('1:00');
    expect(formatTime(3599.9)).toBe('1:00:00');
  });
  it('runs the actual executable and writes both usable formats', () => {
    const out = temp();
    const result = spawnSync(process.execPath, ['bin/paceforge.js', 'plan', '--gpx', 'fixtures/hilly-10k.gpx',
      '--goal', '1:00:00', '--splits', '1mile', '--unit', 'mile', '--export', 'zwo,fit', '--out', out], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Goal 1:00:00');
    expect(result.stdout).toContain('Pace (/mile)');
    expect(result.stderr).toContain('Zwift: set your 5K benchmark');
    expect(readFileSync(join(out, 'plan.zwo'), 'utf8')).toContain('<sportType>run</sportType>');
    expect(readFileSync(join(out, 'plan.fit')).subarray(8, 12).toString()).toBe('.FIT');
  });
  it('supports help', () => expect(execFileSync(process.execPath, ['bin/paceforge.js', '--help'], { encoding: 'utf8' })).toContain('--zwift-5k'));
  it('prints useful errors and returns nonzero exit status', () => {
    const r = spawnSync(process.execPath, ['bin/paceforge.js', 'plan'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Use: paceforge plan');
    expect(r.stderr).not.toContain('at runCli');
  });
  it('summary-only mode writes no files', async () => {
    const out = temp();
    await runCli(['plan', '--gpx', 'fixtures/flat-5k.gpx', '--goal', '25:00', '--out', out], { log() {} });
    expect(readdirSync(out)).toEqual([]);
  });
  it('refuses overwrites', async () => {
    const out = temp();
    const args = ['plan', '--gpx', 'fixtures/flat-5k.gpx', '--goal', '25:00', '--export', 'fit', '--out', out];
    await runCli(args, { log() {} });
    const original = readFileSync(join(out, 'plan.fit'));
    await expect(runCli(args, { log() {} })).rejects.toThrow('EEXIST');
    expect(readFileSync(join(out, 'plan.fit'))).toEqual(original);
  });
  it('rejects unknown formats and flags before writing', async () => {
    await expect(runCli(['plan', '--gpx', 'x', '--goal', '25:00', '--export', 'tcx'])).rejects.toThrow('formats');
    await expect(runCli(['--typo'])).rejects.toThrow();
  });
  it('runs summary mode with filesystem writes and subprocesses denied', () => {
    const result = spawnSync(process.execPath, ['--permission', `--allow-fs-read=${resolve('.')}`,
      'bin/paceforge.js', 'plan', '--gpx', 'fixtures/hilly-10k.gpx', '--goal', '1:00:00'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('1:00:00');
  });
});
