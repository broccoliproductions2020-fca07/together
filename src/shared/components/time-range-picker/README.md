# TimeRangePicker

A reusable time range picker: one draggable span on an hour rail, with both
handles guaranteed visible at every frame of every gesture.

It is deliberately not built as a slider. It is a small interaction system of
four parts, and the split is what keeps it changeable:

```
core/constraints.ts   RangeEngine      what the range is allowed to be
core/viewport.ts      ViewportEngine   time <-> screen, and the anchored zoom
core/gesture.ts       GestureEngine    the state machine and the edge pedal
TimeRangePicker.tsx   Renderer         Reanimated views, theme, slots, a11y
```

Everything in `core/` is plain TypeScript with no imports outside that folder.
That is what lets the same code run inside a Reanimated worklet *and* be
replayed frame by frame in `scripts/test-time-range-picker.mjs`
(`npm run test:time-range-picker`).

---

## The decisions worth knowing before you change anything

### One transformation, and only one

```ts
screenX = (timeMs - viewport.startMs) * viewport.pxPerMs
timeMs  = viewport.startMs + screenX / viewport.pxPerMs
```

Handles, the bar, ticks, labels, the past overlay, the pointer, the pedal — all
of them read `timeToX` / `xToTime`. There is no rail origin and no scroll
offset, so there is nothing for a second, almost-identical calculation to
disagree with. Adding one is how a picker starts drifting a pixel per gesture.

### Safe bounds are the hard invariant

```
startHandleX >= safeInsetPx
endHandleX   <= width - safeInsetPx
```

Not a correction applied after a bad frame — the engine cannot produce one. The
whole geometry follows from a single relation: a range fits only while
`duration × pxPerMs <= width - 2 × safeInset`. Everything else (the scale
ceiling, the viewport window, the resize behaviour) is that inequality
rearranged.

### Edge expand and edge pan are different mechanics

They must never share a code path.

| | dragged | duration | scale | camera |
|---|---|---|---|---|
| **Edge expand** | one handle | changes | changes | anchored on the other handle |
| **Edge pan** | the whole range | fixed | fixed | travels with the range |

A single "somehow scroll and zoom" branch is exactly what produces a control
that zooms when it should pan.

### The anchor maths

While a handle is pinned at the safe edge and the opposite handle holds its
pixel, two screen positions and a duration determine the scale exactly:

```ts
pxPerMs      = |pinnedX - anchorX| / duration
viewport.startMs = anchorMs - anchorX / pxPerMs
```

The anchor is substituted back into the transform rather than corrected
afterwards, so the still handle is still for the *whole* frame.

The anchor is captured **once**, when the edge phase is entered, and held in
`PickerState.anchorMs` / `anchorX`. Re-deriving it per frame from a viewport
that was itself derived from it feeds each frame's rounding into the next; the
handle then creeps by roughly a nanometre a frame, which is invisible for a
second and then is not. Held fixed, the error oscillates around zero instead
(measured over 200 frames: < 2.5e-9 px, non-accumulating).

### Ask before you move: accepted delta

The pedal never moves anything itself. Each tick:

1. proposes a delta,
2. the constraint engine answers with the range it allows,
3. range **and** viewport react to the *accepted* delta, never the requested one.

A tick that buys nothing changes nothing and keeps the loop running. Stopping at
a limit is what makes a control bounce; restarting it on the next pointer sample
is what makes it shudder. Only leaving the zone or lifting the finger ends it.

### The edge pedal is measured from the safe edge

The zone starts where the handle pins, not where the viewport ends. That makes
the speed exactly zero at the moment of pinning and continuous from there — a
zone starting earlier would move the time while the finger was still moving the
handle, counting one gesture twice.

Depth is squared, with a floor. With the defaults that is ~4 min/s at the
entrance, ~1.75 h/s half way, 7 h/s hard against the edge. Calibrated in **time
per second**, never pixels: the scale changes under an edge expand, so a pixel
speed would silently accelerate as the picker zooms out.

### Nothing accumulates

`grabDx` is frozen at pointer-down and every frame recomputes the handle
position absolutely:

```ts
pointerRefX  = rawPointerX - grabDx        // where the user is pointing
visibleRefX  = clamp(pointerRefX, min, max) // where the handle is drawn
overshootPx  = pointerRefX - visibleRefX    // 0 = normal drag, else the pedal
```

Three lines, and they decide the phase, the handle position and the pedal
depth together. Because the clamp is stateless, pushing the finger far past the
edge cannot build up slack that has to be paid back on the way in — the handle
leaves the edge on the first pixel back, and a fast direction change cannot
drift.

The same expression also runs while pinned, which is why a flick that crosses
the whole zone in one sample still lands the handle on the edge instead of
leaving the next tick to make that distance up by zooming.

### Raw vs snapped

The rendering uses continuous raw values, so the bar tracks the finger exactly.
Only the **snapped** value leaves the component, and only when it actually
changes — a 40 px drag reports six times, not forty. On pointer-up the raw value
lands on the grid, which is at most half a step of visible correction.

### React is not in the frame path

The entire interaction is one Reanimated shared value mutated by worklets on the
UI thread. A drag produces **zero** React renders. React is told about the value
at snap cadence (a handful of times a second) via `runOnJS`, which also updates
the duration label and the accessibility values — deliberately not the frame
path.

Hour marks are React-rendered as a windowed list, but each mark positions itself
from its **own** time in a worklet, so panning and zooming need no React work at
all. The list is re-cut only when the camera leaves the hours it covers. Label
density is a shared value with hysteresis (1 gives way to 2 below 40 dp/h, but
only returns above 52), so a scale drifting across a boundary during an edge
expand cannot strobe the axis.

### Controlled value

**While a finger is down, the gesture owns the value. Nothing external lands —
not even an echo that looks different.**

That is stronger than "ignore an echo that matches", and it has to be. The
component reports at snap cadence during a drag; the parent turns that into
state and hands a value back, and that round trip is asynchronous and may
transform what it received. Adopting such an echo cancels the gesture, and every
later pointer sample is then ignored — the handle sits still while the finger
keeps moving.

Measured on device before this rule was applied: the range followed the finger
for six minutes, the parent's echo arrived 323 ms in, the value snapped back to
where the drag started and never moved again. Small drags appeared to work
because they only needed the one step before the echo killed the gesture — which
is exactly why it read as "slow is fine, fast is broken".

**A value this picker itself produced and has already moved past is not adopted
at all.** The last two dozen reported values are remembered, and an echo
matching one of them is dropped. Without that, a late echo carrying a longer
mid-drag range makes `ensureRangeVisible` lower the scale to fit it — and since
that function may only ever lower, the correcting echo restores the range but
not the zoom. Measured in the engine: 240 dp/h down to 58 dp/h and never back.

The same protection covers the settle that finishes a gesture. The parent lags
by frames, so the echo landing right after pointer-up can carry a value from
mid-drag — measured 50 minutes out, corrected 200 ms later. Adopting it clears
the re-zoom before its first frame runs, which made the release appear to do
nothing at all.

Outside a gesture and its settle the ordinary rules apply: an echo equal to the
last reported value is ignored, a genuinely different value is adopted, and the
camera moves only if the new range would not be visible.

### Re-zoom happens on release, never under a finger

The scale would otherwise be a one-way ratchet: edge expand is *forced* to zoom
out — two pinned handles and a growing duration leave it no choice — and nothing
ever zoomed back in.

The rule is deliberately one line, applied after a single handle is released:

```
range occupies >= 65% of the usable width  ->  do nothing
range occupies <  65%                      ->  zoom until it occupies 85%
```

`planReZoom` decides it, `beginSettle`/`tickSettle` animate it over
`RE_ZOOM_DURATION_MS` (180 ms, eased out, so it never overshoots and never needs
a correcting second pass). Only the camera moves; the range is not an output.
A new pointer-down clears the settle and adopts whatever it had reached, so a
gesture can never fight an animation.

**Nothing raises the scale while a finger is down.** During a handle drag the
camera may only stay put or give way to edge expand. A range drag never triggers
the rule at all — moving a selection changes nothing about how precisely it can
be edited, so it must not move the camera either.

This replaced two earlier mechanisms, a zoom that ran DURING the drag and a
narrower rescue keyed on a handle touching a safe edge. The first could not work
where it was needed: with the opposite handle against a safe edge the bar's
width is `fingerX - safeEdge`, so zooming could only push that handle out of view
and was correctly refused — measured at zero zoom steps across six hundred
frames. With the finger up there is no anchor to honour and no time to disturb,
which is why the rule lives there and is this short.

If the scale ceiling stops the range short of 85%, the ceiling wins and the
widest reachable view is used. There is no second rule for that case.

**Two scales, and only one of them is reachable by a gesture.** The picker opens
and works at `DEFAULT_PREFERRED_PX_PER_HOUR` (80); the ceiling is higher and only
the release re-zoom can get there. At 80 the target width was unreachable below
three hours, so repeated shrinking just made the bar smaller and smaller —
measured 41%, 21%, 11%, 7% over four halvings with no zoom after the second.

The ceiling trades precision against context, on a ~292 dp band:

| ceiling | context shown | 5-min step | 85% reachable from | 1 h of travel |
| ------- | ------------- | ---------- | ------------------ | ------------- |
| 80      | 219 min       | 6.7 dp     | 3 h 06             | 27% of band   |
| **160** | **110 min**   | **13.3 dp**| **1 h 33**         | **55% of band** |
| 240     | 73 min        | 20 dp      | 62 min             | 82% of band   |

The last column is the real limit: past ~292 dp/h an hour of adjustment no longer
fits in one gesture and every ordinary edit has to go through the edge mechanics.
Note also that precision per step does NOT depend on the duration — a five-minute
step is the same width at fifteen minutes as at three hours. Below the boundary
only the BAR gets shorter, which for a short activity is honest rather than
broken. Currently trialling **160**.

It is ONE ceiling rather than a separate re-zoom limit on purpose:
`ensureRangeVisible` runs on every release *before* `planReZoom` and clamps to
`scale.maxPxPerMs`, so a lower value there would claw the re-zoom straight back —
and on a release needing no re-zoom it would zoom OUT instead. Nothing during a
gesture raises the scale, so the higher ceiling never becomes the everyday view.

### The camera moves only when it must

`ensureRangeVisible` is the single automatic camera move, and it returns the
viewport unchanged when it is already valid. It runs on mount, on resize and on
an external value — never at the end of a gesture. A viewport the user left
behind is one they chose, and a scale reached by pushing against an edge is
kept. There is no zoom rubber band.

---

## Usage

```tsx
import { TimeRangePicker } from '@/shared/components/time-range-picker';

<TimeRangePicker
  value={range}
  min={now}
  stepMinutes={5}
  minDurationMinutes={15}
  maxDurationMinutes={720}
  density="comfortable"
  accent="#41C08D"
  onChange={setRange}
  onChangeEnd={commit}
/>;
```

### Styling

React Native has no CSS custom properties, so the `theme` prop *is* the variable
layer — a one-level deep-partial merged over the density defaults:

```tsx
<TimeRangePicker
  value={range}
  density="compact"
  theme={{
    container: { height: 52, radius: 16, background: '#232325' },
    range: { color: '#34C759', height: 22, radius: 11 },
    startHandle: { width: 6, hitWidth: 36, color: '#FFFFFF' },
    labels: { color: 'rgba(255,255,255,0.5)', fontSize: 9.5 },
    interaction: { safeInsetPx: 12, edgeZonePx: 52 },
  }}
/>
```

Density presets are `comfortable` (56), `default` (46) and `compact` (36); the
height stays freely overridable, and everything else derives from it.

For a complete visual replacement there are render slots — `renderStartHandle`,
`renderEndHandle`, `renderRange`, `renderRangeLabel` and `renderTickLabel`. They
receive position and state, not engine internals: `viewportStartMs`, `pxPerMs`,
the gesture snapshot and the pedal never leave the component. `renderRange`
replaces the bar's visual only; its position and size stay engine-owned, so a
custom bar cannot break the safe-bounds invariant.

`fillOpacity` and `borderOpacity` are folded into their colours rather than set
as view opacity — an opacity on the bar would fade its own duration label with
it.

The edge pedal's calibration is a prop too (`edgeSpeed`), stated in TIME per
second: `{ maxMsPerSecond, minStrength }`.

**There is deliberately no `fontWeight` token.** The app ships static font files,
and a weight set next to a family makes Android synthesize a second, fake bold on
top of the real one. Pick a different `fontFamily` instead.

---

## Deliberate deviations from the original brief

The brief was written against the DOM. Three things were translated rather than
implemented literally, and one product rule was dropped on purpose.

1. **Pointer events → `Gesture.Pan`; RAF + CSS custom properties → Reanimated
   worklets; `ResizeObserver` → `onLayout`.** The platform half of the brief
   does not exist in React Native. The architectural half is unchanged, and the
   result is stricter than asked: the engine runs on the UI thread, so React is
   not merely kept out of the render loop, it is not on the thread that draws.

2. **Arrow-key stepping → accessibility `adjustable` actions.** React Native has
   no key events on mobile. Increment/decrement on each handle is the platform
   equivalent, it is what a screen reader actually drives, and the pointer
   architecture does not stand in the way of adding key handling later.

3. **The gesture snapshot is two fields, not seven.** The brief's snapshot also
   carried the base range, base viewport, base duration and pointer start, to
   compute each frame from a stable base and avoid cumulative drift. This design
   reaches that goal a shorter way — every frame maps the raw pointer to a handle
   position absolutely — so those fields were written into a shared value sixty
   times a second and read exactly never. A second finger is handled by
   `maxPointers(1)` on the gesture rather than by carrying a pointer id.

4. **`minPxPerHour` yields to the safe bounds.** If `minPxPerHour × maxDuration`
   does not fit the usable width, the three settings are asking for something
   geometrically impossible. Both handles staying visible is a hard invariant and
   a legibility floor is not, so the floor drops and a development warning names
   the width that would have been needed. Nothing breaks quietly.

5. **No settle-and-re-zoom.** The band this replaces zoomed out to fit the whole
   span on release and zoomed back in when a grip was touched. That is precisely
   the rubber band the brief rules out, and the two rules cannot both hold. The
   brief wins: the scale a gesture leaves behind is kept. The practical
   consequence is that at a compressed scale you rarely need the pedal at all,
   because the whole range is then reachable by an ordinary drag.

One collision inside the brief itself is worth naming. When the opposite handle
happens to sit close to the dragged one, holding it pixel-stable (§75.6) means
the expand has very little distance to work with, and the span would be squeezed
into an unreadable sliver. Anchor stability wins, and the scale limits are
converted into **duration** limits before the constraint engine sees them
(`withGeometricDurationBounds`) — so the duration stops before the geometry can
break, the pinned handle stays pinned without a special case, and the pedal
simply reports `accepted = 0`.

---

## Tests

```
npm run test:time-range-picker
```

34 checks over the invariants: handle drag holds the opposite handle to the
pixel; edge expand holds both while duration grows and the scale falls; edge pan
holds both while nothing zooms; accepted delta at a limit changes nothing and
does not bounce; returning from the edge zone does not jump; snapping reports
only on a step change; resize keeps both handles visible; cancel returns cleanly
to idle.

They run against the real engines, not a copy. If a change here breaks a promise
the picker makes, the suite says which one.
