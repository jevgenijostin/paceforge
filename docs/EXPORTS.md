# Workout export decisions

## Zwift running ZWO

PaceForge emits `workout_file`, `sportType=run`, `durationType=time`, and one `SteadyState` per split. `Duration` is seconds, `pace=1` selects the 5K benchmark, and `Power` is a multiplier of benchmark **running speed**. If the benchmark is `B` seconds for 5000 m and the split target speed is `v` m/s, then `Power = v / (5000/B)`. No FTP or watt values are fabricated.

Use `--zwift-5k MM:SS` with the 5K time currently configured in Zwift. If omitted, PaceForge uses `goal_seconds / course_meters * 5000` and prints that required profile value. This makes export possible with only the course and goal, but is an explicit interoperability compromise: ZWO itself does not set the athlete's benchmark. Supplying the actual benchmark avoids changing the profile. The same value is written into the workout description.

ZWO has public examples and reverse-engineered tag documentation rather than a stable official XSD we can certify against. These primary implementation/reference sources informed the chosen shape:

- [Zwift forum running-workout example](https://forums.zwift.com/t/customizable-run-workouts-please/2452): running sport selection, timed blocks, relative running targets.
- [ZWO exporter source](https://gist.github.com/p3g4asus/f7f00052a928686553257a655b657dad): `pace=1` for 5K and explicit time/distance duration types.
- [Workout file tag reference built from workout files](https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md): actual XML elements and attributes.
- [QZ project discussion with running ZWO examples](https://github.com/cagnulein/qdomyos-zwift/discussions/2242): time-based running workout examples and pace selectors.

Tests validate well-formed XML, root/block structure, running/time flags, the benchmark selector, speed ratios, escaped names, and total duration. Import into the Zwift desktop application's custom workout folder is a manual user step; the current app has not been exercised in this project. There is no incline control and no claim of cross-version UI certification.

## Garmin FIT

Uses the official [`@garmin/fitsdk`](https://github.com/garmin/fit-javascript-sdk), version 21.218.0 at MVP creation. npm metadata checked on 2026-10-09 showed it was updated on 2026-10-06. The package supports both Encoder and Decoder, has no production dependencies, and performs no network access. Its own license is Garmin's FIT Protocol License; PaceForge source is MIT.

Following [Garmin's workout encoder example](https://github.com/garmin/fit-java-sdk/blob/main/src/main/java/com/garmin/fit/examples/EncodeWorkout.java), the file contains a `FileId` of type `workout`, a `Workout` of sport `running`, and consecutive `WorkoutStep` messages. **Record and Lap messages belong to activity files**, so adding them to a planned workout would misrepresent it as a recorded activity. No activity data is invented.

Each step has a time duration and a custom absolute speed target (`targetType=speed`, `targetValue=0`). Low and high target values are equal to the planned speed, rounded to 0.001 m/s. The SDK encoder ignores derived subfields, so we encode their parent fields in FIT Profile units:

- `durationValue`: milliseconds for `durationType=time`.
- `customTargetValueLow/High`: speed in thousandths of m/s.
- `messageIndex`: zero-based, consecutive.

The SDK writes the binary definitions, header, and CRC. Tests use its decoder to check integrity and the expanded `durationTime` and `customTargetSpeedLow/High` values against the original plan. Corruption is separately detected by a CRC test.

For reproducible files the creation date defaults to 2026-01-01 UTC, and a SHA-256-derived serial identifies the plan. The library function accepts `createdAt` for callers wanting a real creation timestamp. File names are `plan.fit`; workout names are truncated to 30 Unicode code points. FIT export rejects over 50 steps as a conservative compatibility cap, not a universal hardware guarantee. Different devices may impose stricter limits. If an export step would round to zero milliseconds or overflow its fields, export fails with an error.

To use the file, copy it to the compatible watch's `GARMIN/NewFiles` folder where supported, then disconnect and open running workouts. Device support/import behavior is not hardware-tested here. This is an encoded workout, not a GPX navigation course or a completed activity suitable for an activity-upload page. Optional paid roadmap work includes broader device validation and distance-triggered steps; no such paid tier exists yet.

## Offline scope

Generation is local: filesystem input/output, arithmetic, XML parsing, and SDK binary encoding only. No accounts, credentials, telemetry, network clients, or subprocesses are used by the CLI. Package installation, fetching this repository, and importing into third-party applications are outside this guarantee. The audit covers runtime source and production dependency JavaScript; test tooling and npm metadata are not part of the runtime graph.
