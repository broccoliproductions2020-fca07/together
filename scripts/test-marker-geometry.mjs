import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import ts from 'typescript';

function loadTypescript(relativePath, dependencies = {}) {
  const url = new URL(relativePath, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: url.pathname,
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', compiled.outputText)(
    module.exports,
    module,
    (id) => dependencies[id] ?? {},
  );
  return module.exports;
}

const perspective = loadTypescript('../src/features/map/utils/mapPerspective.ts');
const layout = loadTypescript('../src/features/map/components/activityMarkerLayout.ts', {
  '../utils/mapPerspective': perspective,
});
const detail = loadTypescript('../src/features/map/utils/markerDetailLevel.ts');
const collision = loadTypescript('../src/features/map/utils/markerCollision.ts');
const focus = loadTypescript('../src/features/map/utils/focusFraming.ts');

const avatars = Array.from({ length: 4 }, (_, index) => ({
  userId: `user-${index}`,
  displayName: `User ${index}`,
  initials: `U${index}`,
}));

assert.equal(
  layout.ACTIVITY_MARKER_ANCHOR.y * layout.ACTIVITY_MARKER_CAPTURE_HEIGHT,
  layout.ACTIVITY_MARKER_GROUND_Y,
);
assert.ok(layout.ACTIVITY_MARKER_GROUND_Y > layout.ACTIVITY_MARKER_FIN_END_Y);
assert.equal(
  layout.ACTIVITY_MARKER_SHELL_TOP +
    layout.ACTIVITY_MARKER_SHELL_HEIGHT +
    layout.ACTIVITY_MARKER_COLLAPSED_BODY_OFFSET,
  layout.ACTIVITY_MARKER_TITLE_TOP + layout.ACTIVITY_MARKER_TITLE_HEIGHT,
);
assert.equal(
  layout.ACTIVITY_MARKER_GROUND_HEIGHT,
  layout.ACTIVITY_MARKER_GROUND_DEPTH * perspective.MAP_GROUND_VERTICAL_SCALE,
);
assert.equal(
  layout.ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
  layout.ACTIVITY_MARKER_GROUND_Y - layout.ACTIVITY_MARKER_SHELL_TOP,
);
assert.equal(layout.ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR, layout.ACTIVITY_MARKER_GROUND_HEIGHT);

const focusViewportHeight = 800;
const activityFocusInsets = {
  above: layout.ACTIVITY_MARKER_VISIBLE_ABOVE_ANCHOR,
  below: layout.ACTIVITY_MARKER_VISIBLE_BELOW_ANCHOR,
};
assert.equal(focus.focusTargetY({}, focusViewportHeight), focusViewportHeight / 2);
assert.equal(
  focus.focusTargetY({ bottomCoveredHeight: 400 }, focusViewportHeight),
  (focusViewportHeight - 400) / 2,
);
const activityFrame = {
  topCoveredHeight: 96,
  bottomCoveredHeight: 500,
  targetInsets: activityFocusInsets,
};
const activityTargetY = focus.focusTargetY(activityFrame, focusViewportHeight);
assert.ok(
  activityTargetY - activityFocusInsets.above >=
    activityFrame.topCoveredHeight + focus.FOCUS_FRAME_GAP,
);
assert.ok(
  activityTargetY + activityFocusInsets.below <=
    focusViewportHeight - activityFrame.bottomCoveredHeight - focus.FOCUS_FRAME_GAP,
);
const maximumCoveredHeight = focus.maximumFocusBottomCoveredHeight(
  activityFrame.topCoveredHeight,
  focusViewportHeight,
  activityFocusInsets,
);
const exactFitTargetY = focus.focusTargetY(
  { ...activityFrame, bottomCoveredHeight: maximumCoveredHeight },
  focusViewportHeight,
);
assert.ok(
  Math.abs(
    exactFitTargetY -
      activityFocusInsets.above -
      (activityFrame.topCoveredHeight + focus.FOCUS_FRAME_GAP),
  ) < 1e-9,
);
assert.ok(
  Math.abs(
    exactFitTargetY +
      activityFocusInsets.below -
      (focusViewportHeight - maximumCoveredHeight - focus.FOCUS_FRAME_GAP),
  ) < 1e-9,
);
assert.equal(
  focus.focusPinShift(
    { bottomCoveredHeight: 200 },
    { bottomCoveredHeight: 300 },
    focusViewportHeight,
  ),
  50,
);
const projectedFocusCenter = focus.focusCameraCenterFromProjection(
  { latitude: 0, longitude: 0 },
  { latitude: 1, longitude: 2 },
  { latitude: 0, longitude: 0 },
);
assert.ok(Math.abs(projectedFocusCenter.latitude - 1) < 1e-9);
assert.equal(projectedFocusCenter.longitude, 2);
assert.equal(
  focus.focusCameraCenterFromProjection(
    { latitude: 0, longitude: 170 },
    { latitude: 0, longitude: -179 },
    { latitude: 0, longitude: 179 },
  ).longitude,
  172,
);
// A translated duplicate of the board read as a coloured curly bracket below it.
assert.equal(layout.ACTIVITY_MARKER_BASE_DEPTH, undefined);
assert.equal(layout.ACTIVITY_MARKER_SLAB_OFFSET, undefined);

// The shell stays in the squircle range: neither a rounded box nor a pill.
const shellRatio = layout.ACTIVITY_MARKER_SHELL_RADIUS / layout.ACTIVITY_MARKER_SHELL_HEIGHT;
assert.ok(
  shellRatio > 0.3 && shellRatio < 0.42,
  `shell radius ratio ${shellRatio} left the squircle band`,
);
for (const width of [40, 60, 116, 138]) {
  assert.equal(
    layout.activityMarkerShellRadius(width),
    layout.ACTIVITY_MARKER_SHELL_RADIUS,
    `shell of ${width} should carry the full corner radius`,
  );
}
const faceRatio = layout.ACTIVITY_MARKER_FACE_RADIUS_RATIO;
assert.ok(
  faceRatio > 0.3 && faceRatio < 0.42,
  `face radius ratio ${faceRatio} is a circle, not a squircle`,
);

assert.equal(layout.activityMarkerTitleReveal(0.2, false, true), 0);
assert.equal(layout.activityMarkerTitleReveal(0.3, true, true), 1);
assert.equal(layout.activityMarkerTitleReveal(1, true, false), 0);
assert.ok(
  layout.activityMarkerTitleWidth('Kino') < layout.activityMarkerTitleWidth('Grillen im Park'),
);
assert.equal(
  layout.activityMarkerTitleHeight('Kino'),
  layout.ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT,
);
assert.equal(layout.activityMarkerTitleLineCount('Kino'), 1);
assert.equal(
  layout.activityMarkerTitleWidth('Ein sehr langer Aktivitätstitel, der sicher umbricht'),
  layout.ACTIVITY_MARKER_TITLE_MAX_WIDTH,
);
assert.equal(
  layout.activityMarkerTitleHeight('Ein sehr langer Aktivitätstitel, der sicher umbricht'),
  layout.ACTIVITY_MARKER_TITLE_TWO_LINE_HEIGHT,
);
assert.equal(
  layout.activityMarkerTitleLineCount('Ein sehr langer Aktivitätstitel, der sicher umbricht'),
  2,
);
assert.ok(
  layout.activityMarkerTitleWidth('Anreise', 10) > layout.activityMarkerTitleWidth('Anreise', 1),
);
assert.ok(
  layout.activityMarkerFinTopY(layout.ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT) <
    layout.ACTIVITY_MARKER_FIN_TOP_Y,
);

assert.equal(detail.visibleMarkerFaceCount(avatars, 4), 4);
assert.deepEqual(
  detail.buildMarkerFaces(avatars.slice(0, 1), 3).map((face) => face.overflowLabel),
  [undefined, '+2'],
);
assert.equal(detail.buildMarkerFaces(avatars.slice(0, 1), 5).at(-1)?.overflowLabel, '+4');
assert.equal(detail.buildMarkerFaces([], 4)[0]?.overflowLabel, '+4');

const collisionMarker = (id, latitude, longitude) => ({
  id,
  userId: id,
  displayName: id,
  initials: id.slice(0, 2),
  mode: 'soon',
  coordinate: { latitude, longitude },
});
const samePlaceCandidates = [
  { marker: collisionMarker('a', 48.1, 11.5), width: 60, height: 50 },
  { marker: collisionMarker('b', 48.1, 11.5), width: 60, height: 50 },
];
assert.equal(collision.groupMarkersByProjectedCollision(samePlaceCandidates, {}).length, 1);
assert.equal(
  collision.groupMarkersByProjectedCollision(samePlaceCandidates, {}, new Set(['a'])).length,
  2,
);
assert.equal(
  collision.groupMarkersByProjectedCollision(samePlaceCandidates, {
    a: { x: 20, y: 20 },
    b: { x: 220, y: 20 },
  }).length,
  2,
);
const anchoredCandidates = [
  { ...samePlaceCandidates[0], height: 80, anchor: { x: 0.5, y: 0.9 } },
  { ...samePlaceCandidates[1], height: 20, anchor: { x: 0.5, y: 0.9 } },
];
assert.equal(
  collision.groupMarkersByProjectedCollision(anchoredCandidates, {
    a: { x: 20, y: 100 },
    b: { x: 20, y: 140 },
  }).length,
  2,
);
assert.equal(
  collision.groupMarkersByProjectedCollision(anchoredCandidates, {
    a: { x: 20, y: 100 },
    b: { x: 20, y: 125 },
  }).length,
  1,
);

let previousShell = 0;
let previousCard = 0;
let previousGround = 0;
const fittedTitle = 'Sommerfest';
const fittedTitleWidth = layout.activityMarkerTitleWidth(fittedTitle);
for (let faceCount = 1; faceCount <= 4; faceCount += 1) {
  const shell = layout.activityMarkerShellWidth(faceCount, false, 1);
  const card = layout.activityMarkerCardWidth(faceCount, false, 1, false, fittedTitle);
  const ground = layout.activityMarkerGroundWidth(faceCount, false, 1, false, fittedTitle);
  assert.ok(shell >= previousShell);
  assert.ok(card >= previousCard);
  assert.ok(ground >= previousGround);
  assert.equal(card, Math.max(shell, fittedTitleWidth));
  assert.equal(ground, layout.activityMarkerGroundWidthForCard(card));
  assert.ok(shell <= layout.ACTIVITY_MARKER_CAPTURE_WIDTH);
  assert.ok(card <= layout.ACTIVITY_MARKER_CAPTURE_WIDTH);
  previousShell = shell;
  previousCard = card;
  previousGround = ground;
}

assert.equal(
  layout.activityMarkerGroundWidth(1, true, 0),
  layout.activityMarkerGroundWidth(1, true, 1),
);
assert.ok(
  layout.activityMarkerGroundWidth(1, true, 1, false, fittedTitle) >
    layout.activityMarkerGroundWidth(1, true, 0, false, fittedTitle),
);

const collapsedPath = layout.activityMarkerBoardPath(48, 48, 0);
const fittedPath = layout.activityMarkerBoardPath(
  48,
  fittedTitleWidth,
  1,
  layout.activityMarkerTitleHeight(fittedTitle),
);
assert.ok(!collapsedPath.includes('NaN'));
assert.ok(!fittedPath.includes('NaN'));
assert.notEqual(collapsedPath, fittedPath);
assert.ok(!fittedPath.includes(' C '));
const joinY = layout.ACTIVITY_MARKER_SHELL_TOP + layout.ACTIVITY_MARKER_SHELL_HEIGHT;
const shellRight = layout.ACTIVITY_MARKER_CAPTURE_WIDTH / 2 + 48 / 2;
const titleRight = layout.ACTIVITY_MARKER_CAPTURE_WIDTH / 2 + fittedTitleWidth / 2;
assert.ok(
  fittedPath.includes(`L ${shellRight} ${joinY} L ${titleRight} ${joinY}`),
  'avatar shell and title band must meet across a horizontal edge',
);
// The band ends in a stadium too — a clipped corner is exactly what read as
// angular. One-line band 18 high must round at 9, not at some capped value.
const oneLine = layout.ACTIVITY_MARKER_TITLE_ONE_LINE_HEIGHT;
assert.ok(
  layout
    .activityMarkerBoardPath(60, fittedTitleWidth, 1, oneLine)
    .includes(`A ${oneLine / 2} ${oneLine / 2} `),
  'title band should end fully round',
);

// The band hugs the name. Padding is what made it look like a plate the text
// floats in, so both axes are held to a budget rather than left to taste.
assert.ok(
  oneLine - layout.ACTIVITY_MARKER_TITLE_LINE_HEIGHT <= 3,
  'the one-line band has more than 3 px of vertical air around the text',
);
assert.ok(
  layout.ACTIVITY_MARKER_TITLE_HORIZONTAL_PADDING <= 10,
  'the band has more than 5 px of air per side',
);

assert.equal(layout.ACTIVITY_MARKER_TRANSITION_MAX, undefined);

// The clock: perimeter must match the closed stadium the ring is drawn on, and
// twelve o'clock must sit on the top edge, never inside a corner arc.
for (const width of [41, 60, 116]) {
  const radius = layout.activityMarkerShellRadius(width);
  const expected =
    2 * Math.max(0, width - 2 * radius) +
    2 * Math.max(0, layout.ACTIVITY_MARKER_SHELL_HEIGHT - 2 * radius) +
    2 * Math.PI * radius;
  assert.ok(Math.abs(layout.activityMarkerShellPerimeter(width) - expected) < 1e-9);

  const start = layout.activityMarkerShellClockStart(width);
  assert.ok(start >= 0 && start <= width / 2 - radius + 1e-9);
  assert.ok(start <= layout.activityMarkerShellPerimeter(width));
  assert.ok(!layout.activityMarkerShellPath(width).includes('NaN'));
}

// A collapsed board IS the shell, so the ring and the silhouette agree exactly
// at city zoom instead of being two shapes that happen to look alike.
assert.equal(layout.activityMarkerBoardPath(60, 60, 0), layout.activityMarkerShellPath(60));

/**
 * The avatars must stay INSIDE the shell at every zoom stage. This is the check
 * that was missing: quadCenters carried a ±8.5 spread tuned for a 48 px shell,
 * the shell later became 38, and four plates poked 1.3 px out of the rounded
 * corner. Nothing in code review or typecheck can see that — only geometry can.
 *
 * A rounded plate's extreme points are its four corner-arc centres pushed out
 * by the plate radius, so the plate fits iff every arc centre sits inside the
 * shell shrunk by that radius.
 */
function plateFitsShell(plateCenter, plateSize, plateRadius, shellWidth) {
  const shellRadius = layout.activityMarkerShellRadius(shellWidth);
  const cx = layout.ACTIVITY_MARKER_CAPTURE_WIDTH / 2;
  const cy = layout.ACTIVITY_MARKER_SHELL_TOP + layout.ACTIVITY_MARKER_SHELL_HEIGHT / 2;
  const innerX = shellWidth / 2 - shellRadius;
  const innerY = layout.ACTIVITY_MARKER_SHELL_HEIGHT / 2 - shellRadius;
  const reach = plateSize / 2 - plateRadius;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const ax = plateCenter.x - cx + sx * reach;
      const ay = plateCenter.y - cy + sy * reach;
      const clampedX = Math.min(Math.max(ax, -innerX), innerX);
      const clampedY = Math.min(Math.max(ay, -innerY), innerY);
      if (Math.hypot(ax - clampedX, ay - clampedY) > shellRadius - plateRadius + 1e-9) return false;
    }
  }
  return true;
}

const CY = layout.ACTIVITY_MARKER_SHELL_TOP + layout.ACTIVITY_MARKER_SHELL_HEIGHT / 2;
const CXC = layout.ACTIVITY_MARKER_CAPTURE_WIDTH / 2;
const ratio = layout.ACTIVITY_MARKER_FACE_RADIUS_RATIO;

for (let faceCount = 1; faceCount <= 4; faceCount += 1) {
  const [cityShell, , streetShell] = layout.activityMarkerShellWidths(faceCount, false);

  const cityFace = layout.ACTIVITY_MARKER_CITY_FACE;
  for (const point of detail.quadCenters(faceCount, CXC, CY, layout.ACTIVITY_MARKER_QUAD_SPREAD)) {
    assert.ok(
      plateFitsShell(point, cityFace, cityFace * ratio, cityShell),
      `city plate of a ${faceCount}-face marker pokes out of the shell`,
    );
  }

  const streetFace = layout.ACTIVITY_MARKER_GROUP_FACE_STREET;
  for (const point of detail.rowCenters(
    faceCount,
    CXC,
    CY,
    streetFace,
    layout.ACTIVITY_MARKER_ROW_STEP,
  )) {
    assert.ok(
      plateFitsShell(point, streetFace, streetFace * ratio, streetShell),
      `street plate of a ${faceCount}-face marker pokes out of the shell`,
    );
  }
}

const soloShell = layout.activityMarkerShellWidths(1, true)[2];
const soloFace = layout.ACTIVITY_MARKER_SOLO_FACE;
assert.ok(
  plateFitsShell({ x: CXC, y: CY }, soloFace, soloFace * ratio, soloShell),
  'the solo avatar pokes out of its shell',
);

/**
 * The planning ring's dashes have to close on themselves at every shell width,
 * or one seam at one zoom stage carries a stray long or short dash — the kind
 * of thing neither a typecheck nor a review can see. Round caps are the other
 * trap: they add half a stroke at each end, and at the marker's 3 px stroke
 * that is most of a 7.5 px period, so a naive dash length would render as a
 * solid ring and the round would look exactly like a fixed activity.
 */
for (const faceCount of [1, 2, 3, 4]) {
  for (const shell of layout.activityMarkerShellWidths(faceCount, faceCount === 1)) {
    const perimeter = layout.activityMarkerShellPerimeter(shell);
    for (const stroke of [3, 3.5]) {
      const { dash, gap, count, period } = layout.activityMarkerPlanningDash(shell, stroke);
      assert.ok(count >= 6, `only ${count} dashes on a ${shell} shell — that is not a dash`);
      assert.ok(
        Math.abs(count * period - perimeter) < 1e-9,
        `dash pattern does not close on a ${shell} shell`,
      );
      assert.ok(
        Math.abs(dash + gap - period) < 1e-9,
        `dash and gap do not add up to one period on a ${shell} shell`,
      );
      // What is actually drawn once the caps are added.
      assert.ok(
        period - (dash + stroke) > 0.8,
        `round caps close the gaps on a ${shell} shell at stroke ${stroke}`,
      );
      assert.ok(
        dash + stroke > stroke,
        `nothing is drawn between the gaps on a ${shell} shell`,
      );
    }
  }
}

console.log('marker geometry checks passed');
