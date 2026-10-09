# Pacing model

## Geometry and elevation

Trackpoint distances use the haversine formula on a sphere with radius 6,371,000 m. The distance is horizontal ground distance; elevation does not increase segment length. Coordinates must be finite, within latitude/longitude bounds, and belong to a single continuous GPX 1.1 track segment. Duplicate coordinates consume zero distance and time. The last duplicate elevation becomes the origin for the next nonzero segment.

Missing internal elevations are interpolated linearly **by cumulative distance**, with nearest known elevation extended to the beginning/end. If all elevation is missing, every elevation is set to zero. Invalid explicit elevations are errors. Interpolation cannot recover hills absent from the data. Segment breaks are rejected because the missing path cannot be inferred.

## Grade weighting

For segment `i`, with horizontal distance `d_i` and elevation change `h_i`:

```text
g_i = h_i / d_i                           (0.01 means 1%)
clamped_g_i = min(0.20, max(-0.20, g_i))
f_i = 1 + 3 * clamped_g_i
w_i = d_i * f_i
t_i = goal_seconds * w_i / sum(w)
seconds_per_meter_i = t_i / d_i
```

This is a simple linear grade-adjustment heuristic: each percentage point of uphill grade increases the unnormalized seconds per meter by 3%; downhill decreases it by 3%. The coefficient is an explicit engineering assumption chosen for modest road gradients, **not a fitted or peer-reviewed physiological model**. Its rationale is a first-order approximation around flat terrain: uphill costs more effort per horizontal meter and modest downhill costs less. The clamp keeps the multiplier between 0.4 and 1.6 so steep terrain or GPS noise cannot produce zero or negative pace. It is not calibrated for trails or steep descents.

We deliberately do not claim this is the Minetti energy-cost model or a replication of a proprietary grade-adjusted pace algorithm. The formula is fully specified here so its assumptions can be inspected and replaced. No external physiological source is claimed for the coefficient.

The normalization is essential: grade redistributes the goal time, never adds to it. Equal-distance uphill/downhill segments on a balanced route are slower/faster than the flat average respectively. On a course consisting entirely of one constant uphill grade, all segments must retain the goal's average pace; it is mathematically impossible to both slow every split relative to that average and preserve the same goal time. Grade ordering is preserved across the course, but signs alone do not guarantee a relation to the course-wide average on a net uphill/downhill route.

Average display pace is `goal_seconds / distance_meters * unit_meters`, with 1 km = 1000 m and 1 international mile = 1609.344 m.

## Splits and precision

Split boundaries are placed at the requested distance, with a shorter final split. Segment seconds-per-meter are integrated over each overlapping part of a split; grades are not simply averaged by trackpoint count. Split times are normalized again to remove floating-point accumulation error, with the last split receiving the exact remaining time. A residual distance below 0.1 micrometers is absorbed into the last split to avoid numerical phantom splits. More than 10,000 splits is rejected to bound memory/output.

The table rounds each pace/time to a whole second for readability. Exports round cumulative boundaries to milliseconds, then difference them. Thus total export duration differs from the goal by at most 0.5 ms; rounding each individual step would accumulate error. FIT target speeds round to 0.001 m/s. ZWO speed multipliers retain nine decimal places.

## Independently calculated hilly golden fixture

`fixtures/hilly-10k.gpx` has ten equatorial legs, each spanning 0.009 degrees longitude:

```text
L = 6371000 * pi * 0.009 / 180
  = 1000.7543398010286 meters
total distance = 10L = 10007.543398010286 meters
elevation changes = +30, -30, +40, -40, +20, -20, +50, -50, +10, -10 meters
ascent = descent = 150 meters
```

For a 3600-second goal and splits at `L`, none of these grades reaches the clamp. The net elevation change is zero, so `sum(w) = 10L`. Each leg's time simplifies to `360 + 1080*h/L`. This gives the following expected output independently of the implementation:

| Split | Rise (m) | Time (s) |
| --- | --- | --- |
| 1 | 30 | 392.375578 |
| 2 | -30 | 327.624422 |
| 3 | 40 | 403.167437 |
| 4 | -40 | 316.832563 |
| 5 | 20 | 381.583719 |
| 6 | -20 | 338.416281 |
| 7 | 50 | 413.959296 |
| 8 | -50 | 306.040704 |
| 9 | 10 | 370.791859 |
| 10 | -10 | 349.208141 |

Each pair sums to 720 seconds, giving exactly 3600 seconds overall. Pace in seconds/km is the row's time divided by `1.0007543398010286`. The test checks every row's distance, time, pace, and cumulative time, plus total distance and average pace. Separate tests integrate splits crossing grade boundaries.

## Limits

No elevation smoothing, terrain correction, altitude effect, fatigue model, wind/temperature adjustment, or athlete calibration is implemented. The symmetric downhill rule becomes unrealistic on steep slopes where braking costs increase. Sparse trackpoints conceal local slopes; noisy elevation can overstate them. A feasible finish time remains the runner's input. This tool redistributes that input rather than estimating fitness.
