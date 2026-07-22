# Handoff: Together — App Icon & Wordmark Morph Animation

## Overview
The "Farbpalette" icon and its build-in animation for the Together brand: three overlapping,
brand-colored circles that rotate-and-grow into a fixed cluster standing in for the "o" in the
"together" wordmark, capped off with a small dot that drops in at the very end ("together.").
Used as (1) the static app icon and (2) a looping/one-shot animation on the splash/loading screen
and the login screen.

## About the Design Files
The files in this bundle (`reference.html`, screenshots if included) are **design references
created in HTML** — they show the intended look, colors, geometry and motion timing. They are
**not production code to copy directly**. Your task is to **recreate this design natively in the
app's existing React Native codebase** (using whatever navigation/theming patterns the app already
has), not to embed the HTML.

Recommended RN building blocks:
- `react-native-svg` for the three circles (they're plain vector shapes with a blend mode).
- `react-native-reanimated` (v2/v3) for the timing — the motion is a small number of sequenced
  `withTiming`/`withSequence` steps per element, documented below with exact ms offsets.
- If your team prefers not to hand-roll the choreography, this animation could alternatively be
  authored once in **Lottie/After Effects** by a motion designer using the spec below and played
  back with `lottie-react-native` — either approach is valid, native Reanimated gives you more
  control over interrupting/replaying it based on real load state.

## Fidelity
**High-fidelity.** Exact colors, sizes (as ratios, see below) and timing are final. Recreate
pixel-for-pixel / frame-for-frame where the target screen size allows; scale the icon geometry
proportionally for different screen densities.

## Screens / Views

### 1. App Icon (static)
- **Purpose:** Home-screen icon / favicon-equivalent / any small static brand mark in-app (nav bar, empty states, etc).
- **Layout:** Square, rounded corners at ~23% of the icon's edge length (e.g. 24px radius on a 104px icon).
- **Background:** `#0E1116` (Ink) — this is the default/recommended tile color. Do not use the light or tint background variants unless a specific screen calls for them.
- **Content:** The three-circle cluster (see "Circle geometry" below) centered in the tile, at rest (no animation, final state only — same pose as the animation's settled state).

### 2. Splash / Loading Screen
- **Purpose:** Shown while the app cold-starts / while the initial session or feed data loads.
- **Layout:** Full-bleed `#0E1116` background, wordmark animation centered on screen, no other chrome.
- **Behavior:** Play the animation **once** (not looping) timed to the length of the actual load; if the load finishes before the animation's ~5.4s "settle" point, hold on the final settled frame rather than cutting it off mid-motion. If the load takes longer than one cycle, loop the animation seamlessly (the keyframes are authored to loop cleanly at 6s).

### 3. Login Screen
- **Purpose:** Pre-auth screen with "Sign in with Apple / Google" actions.
- **Layout:** Wordmark animation near the top third of the screen, subtitle text below it, then the auth buttons and legal copy stacked beneath (see the full phone mockup in the wider design set for exact button styling — out of scope for this handoff unless requested).
- **Behavior:** Same animation as the splash screen; can loop continuously here since there's no loading state gating it.

## Components

### A. The three-circle cluster ("o" replacement / icon)
- Three filled circles, each **radius = 30 units** in a 110×110 local coordinate space (i.e. radius ≈ 27% of the cluster's bounding box width). Scale this ratio to whatever pixel size the "o" slot needs to be in your type scale.
- Each circle sits **20 units from the cluster's center**, at a fixed final angle:
  - Blue `#6E8BF7` ("Open") → **-90°** (top)
  - Orange `#E0A23E` ("Soon") → **30°** (lower-right)
  - Green `#41C08D` ("Now") → **150°** (lower-left)
  - (These angles are 120° apart — a perfect trefoil/Venn arrangement.)
- **Blend mode:** `screen` on all three circles (in RN/Skia: `BlendMode.Screen`; this is what makes the overlaps lighten instead of muddying — important, don't skip it, and it only reads correctly on the dark `#0E1116` background).
- At rest (icon use case) they simply sit at their final angle/position — no animation needed.

### B. The wordmark ("t[o]gether.")
- Font: **Schibsted Grotesk**, weight 600 (Google Font — bundle it, don't rely on a web link in the app).
- Reference size: 58px, letter-spacing -0.03em, color `#F4F5F7` (Paper) on the `#0E1116` background. Scale proportionally for your type scale; keep the negative tracking.
- The "o" is entirely replaced by the circle cluster (component A), sized to visually match the cap-height/x-height of the surrounding letters (54×54 at this 58px reference size).
- A period is appended after "gether" — i.e. the wordmark reads **"together."** — see component C.

### C. The dot ("period")
- A single "." glyph, same color as the wordmark (`#F4F5F7`), same font/weight.
- Not part of the static logo — **only appears during/after the build animation** (see timeline). Think of it as a "confirmation" beat, like a full stop landing after the word finishes assembling.

## Interactions & Behavior — Animation Timeline

Total loop length: **6000ms**. All percentages below are of that 6s loop; ms offsets included for direct Reanimated/Lottie authoring. Easing: standard ease (cubic-bezier ~0.4,0,0.2,1) between keyframes unless noted "linear"; the settle points use a slight overshoot (spring-like) as noted.

**"t" (leftmost letter)**
| % | ms | state |
|---|---|---|
| 0–22% | 0–1320ms | hidden, offset +12px to the right |
| 36–80% | 2160–4800ms | fully visible, settled at 0 offset |
| 90–100% | 5400–6000ms | fades back out (for seamless looping) |

**"gether" (right-hand text)** — mirror of "t": same timing, offset starts at -12px (from the left) and settles to 0.

**Each of the 3 circles** (all three share this shape, offset only by final angle — see component A):
| % | ms | state |
|---|---|---|
| 0–3% | 0–180ms | invisible, scaled to 4% size, rotated ~220–240° away from its final angle |
| 8% | 480ms | becomes visible (still tiny, still rotating in) |
| 30% | 1800ms | overshoots — scaled to 110%, rotated to ~8° past its final angle |
| 40–80% | 2400–4800ms | settled: full size (100%), opacity 92%, at its exact final angle |
| 90–100% | 5400–6000ms | fades out (for looping) |

This reads as: each circle starts as a near-invisible speck, spins ~220° while growing, slightly
overshoots past its landing angle/size (a quick "snap" feel, like a button-press release), then
settles. All three run simultaneously/identically, just rotated 120° apart from each other, so the
whole cluster assembles as one coordinated gesture, not a sequence.

**The dot ("period")**
| % | ms | state |
|---|---|---|
| 0–36% | 0–2160ms | invisible, offset -42px up, rotated -30°, scaled to 40% (waits for the wordmark to finish sliding in) |
| 42% | 2520ms | becomes visible, still above/rotated |
| 46% | 2760ms | falls past its resting spot — offset +7px down, rotated +8°, scaled to 115% (overshoot/bounce) |
| 50% | 3000ms | rebounds slightly — offset -3px, rotated -3°, scaled to 95% |
| 54–80% | 3240–4800ms | settled at 0 offset, 0° rotation, 100% scale |
| 90–100% | 5400–6000ms | fades out (for looping) |

Reads as a small object dropping in from above with a bit of rotation, bouncing once, and coming to rest — a light, "modern" finishing touch, not a heavy bounce.

**Sequencing summary:** text slides in first and is fully settled by 2.16s → circles are mid-assembly
throughout and fully settled by 2.4s → dot starts falling right as the text settles (2.16s) and is
fully at rest by 3.24s. Everything holds until 4.8s, then fades 5.4s→6s if looping.

## State Management
Purely presentational — no app state is required to drive the animation itself. The only state
the surrounding screen needs to track:
- **Splash screen:** whether the real loading task (auth check, initial fetch, etc.) has finished, to decide whether to hold on the settled frame or navigate away once both the animation and the load are done.
- No user interaction drives this animation; it is not tied to touch/press events.

## Design Tokens
| Token | Hex | Usage |
|---|---|---|
| Ink | `#0E1116` | Primary dark background (icon tile, splash, login background) |
| Paper | `#F4F5F7` | Wordmark text color on dark background |
| Open (blue) | `#6E8BF7` | First circle / "available" status color elsewhere in the product |
| Soon (orange) | `#E0A23E` | Second circle / "upcoming" status color elsewhere in the product |
| Now (green) | `#41C08D` | Third circle / "active" status color elsewhere in the product |

Typography: **Schibsted Grotesk**, weight 600, letter-spacing -0.03em at the reference 58px size.

## Assets
No bitmap/raster assets — everything here is vector (circles + type). Bundle the Schibsted
Grotesk font file(s) with the app rather than loading from Google Fonts at runtime, for offline
reliability and to avoid a font-swap flash on the splash screen.

## Files
- `reference.html` — open in any browser to see the static icon and the looping animation exactly as designed (view source for the literal CSS `@keyframes` if you want the raw easing curves to reference/convert).
