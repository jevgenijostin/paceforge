# PaceForge

A local, offline-first Node.js CLI that turns a GPX course and goal finish time into grade-adjusted pacing splits. Export running workouts as Zwift `.zwo` and Garmin `.fit`. No backend, telemetry, account, or network connection is needed to generate plans after installation.

## Install

Requires Node.js 24 or later and npm. Install dependencies once while online:

```sh
git clone git@github.com:jevgenijostin/paceforge.git
cd paceforge
npm ci
npm link
paceforge --help
```

You can also run `node bin/paceforge.js` directly. This project is on GitHub; it has **not** been published to the npm registry.

## Generate a plan

```sh
paceforge plan --gpx fixtures/hilly-10k.gpx --goal 1:00:00 --splits 1km --export zwo,fit --out ./plan
```

Expected output (middle rows omitted):

```text
PaceForge | 10.008 km | Goal 1:00:00 | Average 6:00/km
Split  Distance (km)  Pace (/km)  Split time  Cumulative
    1          1.000        6:32        6:32        6:32
    2          1.000        5:27        5:27       12:00
...
   10          1.000        5:49        5:49       59:57
   11          0.008        5:49        0:03     1:00:00
```

Writes `plan/plan.zwo` and `plan/plan.fit`. Existing files are never overwritten; choose another `--out` directory for another plan. The final short split is intentional: the synthetic course is slightly longer than 10 km. Display values round to seconds independently, so displayed rows can differ by a second from their displayed cumulative sum. Internally, times remain unrounded.

For mile splits and pace, with your existing Zwift 5K benchmark:

```sh
paceforge plan --gpx fixtures/hilly-10k.gpx --goal 1:00:00 --splits 1mile --unit mile --zwift-5k 25:00 --export zwo,fit --out ./mile-plan
```

`--goal` accepts `H:MM:SS` or `MM:SS`, optionally with milliseconds. `--splits` accepts positive distances in `m`, `km`, `mi`, or `mile`. `--unit km|mile` controls display only. `--name "Race rehearsal"` names the workout. Omit `--export` for a summary without writing files. Invalid inputs return a readable error and exit status 1.

## What ships

- GPX 1.1 trackpoint parsing with cumulative haversine distance and partial-elevation interpolation. Entirely missing elevation becomes flat. Multiple nonempty track segments are rejected rather than connected across gaps.
- Grade-based effort redistribution and exact-distance splits, normalized to the requested finish time. Pure functions are available in `src/gpx.js` and `src/pacing.js`.
- **ZWO:** time-based running blocks with relative speed targets and a 5K pace reference. `Power` is the format's running-speed multiplier, **not watts**. Supply `--zwift-5k` matching your Zwift profile. Without it, PaceForge prints the flat-equivalent 5K time you must configure in Zwift; targets otherwise will differ. Benchmark rounding in Zwift can slightly change speeds.
- **FIT:** real binary running workouts encoded with Garmin's maintained SDK, with timed steps and absolute speed targets. Automated tests decode each step and verify CRC integrity, durations, speed units, and message types. Maximum 50 steps; increase split distance for longer plans.

Both formats encode the planned **time** for each distance split. They advance on elapsed time, so falling behind the target pace changes the distance actually covered. Neither export contains GPS navigation, a recorded activity, recovery intervals, or treadmill incline control. They are consecutive race-rehearsal intervals. Device and Zwift application imports have not been manually validated; supported watch models and their import/step limits vary. See [export details and sources](docs/EXPORTS.md).

The grade formula is a transparent approximation, not a prediction that a runner can achieve a goal. It ignores weather, surface, fatigue, and individual downhill ability. See [the pacing model and hand-calculated fixture](docs/PACING-MODEL.md).

## Tests and offline behavior

```sh
npm test
```

Vitest covers malformed GPX, missing elevation, geometry, pacing invariants, a complete hand-derived hilly-course golden plan, units, split boundaries, CLI errors, XML structure, and FIT round trips. There are no network calls or networking imports in `src/` or `bin/`. The production dependency source was also scanned: Garmin's SDK is self-contained and does not introduce a network client. URLs in GPX namespaces, documentation, package metadata, and the lockfile are identifiers or installation metadata, not runtime requests. npm installation and GitHub operations naturally require connectivity.

The three synthetic fixtures cover a roughly 5 km flat loop, 10 km of hills with 150 m ascent and descent, and a roughly 3 km course without elevation. They are hand-authored test courses, not routes for navigation.

## License

PaceForge code is [MIT licensed](LICENSE). Dependencies retain their own licenses; notably `@garmin/fitsdk` uses Garmin's FIT Protocol License, available in its installed `LICENSE.txt` and [upstream](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt).
