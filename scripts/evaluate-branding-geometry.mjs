import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/features/branding/assets/together-morph-paths.ts', import.meta.url),
  'utf8',
);
const encodedPath = source.match(/FINAL_CONNECTED_GE_PATH\s*=\s*\n\s*'([^']+)'/)?.[1];
if (!encodedPath) throw new Error('Final connected g-e path not found.');

const values = [...encodedPath.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
const exactPolygon = Array.from({ length: values.length / 2 }, (_, index) => ({
  x: values[index * 2],
  y: values[index * 2 + 1],
}));

const upperInner = [
  [297, 92],
  [302, 96],
  [310, 100],
  [320, 103],
  [341, 103],
  [349, 101],
  [354, 99],
  [359, 96],
  [363, 93],
  [371, 84],
].map(([x, y]) => ({ x, y }));
const upperOuter = [
  [360, 75],
  [352, 83],
  [345, 87],
  [338, 89],
  [323, 89],
  [316, 87],
  [312, 85],
  [309, 83],
  [292, 65],
].map(([x, y]) => ({ x, y }));
const lowerOuter = [
  [303, 137],
  [306, 134],
  [306, 133],
  [308, 131],
  [309, 131],
  [312, 128],
  [315, 126],
  [320, 124],
  [340, 124],
  [346, 126],
  [352, 130],
  [357, 135],
  [357, 136],
  [363, 143],
].map(([x, y]) => ({ x, y }));
const lowerInner = [
  [363, 120],
  [358, 116],
  [350, 112],
  [344, 110],
  [337, 109],
  [323, 109],
  [314, 111],
  [311, 112],
  [305, 115],
  [302, 117],
  [283, 136],
].map(([x, y]) => ({ x, y }));
const upperBand = [...upperInner, ...upperOuter];
const lowerBand = [...lowerOuter, ...lowerInner];
const tail = [
  [286, 151],
  [288, 153],
  [288, 164],
  [287, 170],
  [284, 177],
  [276, 185],
  [269, 188],
  [265, 189],
  [247, 189],
  [240, 187],
  [236, 185],
  [228, 177],
  [211, 178],
  [213, 183],
  [218, 190],
  [224, 195],
  [229, 198],
  [240, 202],
  [246, 203],
  [267, 203],
  [276, 201],
  [281, 199],
  [288, 195],
  [296, 187],
  [300, 180],
  [302, 174],
  [303, 168],
  [303, 137],
].map(([x, y]) => ({ x, y }));
const crossbar = [
  [393, 98],
  [389, 100],
  [386, 103],
  [386, 112],
  [453, 112],
  [453, 99],
].map(([x, y]) => ({ x, y }));
const eLowerOuter = [
  [363, 143],
  [367, 147],
  [374, 152],
  [382, 156],
  [388, 158],
  [393, 159],
  [413, 159],
  [418, 158],
  [427, 155],
  [431, 153],
  [437, 149],
  [444, 142],
  [446, 139],
  [451, 128],
].map(([x, y]) => ({ x, y }));
const eLowerInner = [
  [433, 129],
  [430, 134],
  [427, 137],
  [423, 140],
  [414, 144],
  [408, 145],
  [398, 145],
  [390, 143],
  [385, 141],
  [379, 137],
  [363, 120],
].map(([x, y]) => ({ x, y }));
const eUpperInner = [
  [371, 84],
  [375, 80],
  [376, 80],
  [381, 75],
  [387, 72],
  [397, 69],
  [409, 69],
  [414, 70],
  [421, 73],
  [424, 75],
  [429, 80],
  [433, 86],
  [435, 92],
  [436, 97],
].map(([x, y]) => ({ x, y }));
const eUpperOuter = [
  [453, 99],
  [452, 93],
  [449, 83],
  [445, 75],
  [442, 71],
  [435, 64],
  [429, 60],
  [425, 58],
  [416, 55],
  [410, 54],
  [396, 54],
  [390, 55],
  [383, 57],
  [373, 62],
  [369, 65],
  [360, 75],
].map(([x, y]) => ({ x, y }));
const eLower = [...eLowerOuter, ...eLowerInner];
const eUpper = [...eUpperInner, ...eUpperOuter];
const gLowerOuter = [
  [204, 104],
  [204, 109],
  [205, 118],
  [208, 128],
  [211, 134],
  [215, 140],
  [224, 149],
  [230, 153],
  [239, 157],
  [247, 159],
  [267, 159],
  [272, 158],
  [278, 156],
  [286, 151],
].map(([x, y]) => ({ x, y }));
const gLowerInner = [
  [283, 136],
  [279, 139],
  [273, 142],
  [267, 144],
  [262, 145],
  [254, 145],
  [245, 143],
  [236, 138],
  [227, 129],
  [223, 122],
  [221, 115],
  [221, 99],
].map(([x, y]) => ({ x, y }));
const gUpperInner = [
  [221, 99],
  [223, 92],
  [226, 86],
  [229, 82],
  [234, 77],
  [238, 74],
  [247, 70],
  [252, 69],
  [263, 69],
  [268, 70],
  [274, 72],
  [281, 76],
  [285, 79],
  [297, 92],
].map(([x, y]) => ({ x, y }));
const gUpperOuter = [
  [292, 65],
  [286, 61],
  [280, 58],
  [274, 56],
  [265, 54],
  [250, 54],
  [245, 55],
  [238, 57],
  [228, 62],
  [225, 64],
  [215, 74],
  [211, 80],
  [208, 86],
  [205, 96],
].map(([x, y]) => ({ x, y }));
const gLower = [...gLowerOuter, ...gLowerInner];
const gUpper = [...gUpperInner, ...gUpperOuter];
const leftSeam = [gUpperOuter.at(-1), gLowerOuter[0], gLowerInner.at(-1)];
const lowerJunction = [gLowerOuter.at(-1), lowerOuter[0], gLowerInner[0]];
const crossbarJunction = [eUpperInner.at(-1), crossbar[0], crossbar.at(-1)];

const innerCorridor = [...upperInner, ...lowerInner];

function isInsidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function isApproximateShape(point) {
  const outer =
    isInsidePolygon(point, gLower) ||
    isInsidePolygon(point, gUpper) ||
    isInsidePolygon(point, eLower) ||
    isInsidePolygon(point, eUpper);
  const cutout = isInsidePolygon(point, innerCorridor);
  const additions =
    isInsidePolygon(point, upperBand) ||
    isInsidePolygon(point, lowerBand) ||
    isInsidePolygon(point, tail) ||
    isInsidePolygon(point, crossbar) ||
    isInsidePolygon(point, leftSeam) ||
    isInsidePolygon(point, lowerJunction) ||
    isInsidePolygon(point, crossbarJunction);
  return (outer && !cutout) || additions;
}

let intersection = 0;
let union = 0;
let exactOnly = 0;
let approximateOnly = 0;
const regions = new Map();
const step = 0.5;

for (let y = 40; y <= 216; y += step) {
  for (let x = 190; x <= 466; x += step) {
    const point = { x, y };
    const exact = isInsidePolygon(point, exactPolygon);
    const approximate = isApproximateShape(point);
    if (exact && approximate) intersection += 1;
    if (exact || approximate) union += 1;
    if (exact && !approximate) exactOnly += 1;
    if (!exact && approximate) approximateOnly += 1;
    if (exact !== approximate) {
      const regionX = Math.floor((x - 190) / 25);
      const regionY = Math.floor((y - 40) / 25);
      const key = `${regionX}:${regionY}`;
      const current = regions.get(key) ?? { exactOnly: 0, approximateOnly: 0 };
      if (exact) current.exactOnly += 1;
      else current.approximateOnly += 1;
      regions.set(key, current);
    }
  }
}

console.log(
  JSON.stringify(
    {
      intersectionOverUnion: intersection / union,
      exactOnlyRatio: exactOnly / union,
      approximateOnlyRatio: approximateOnly / union,
      sampledCells: union,
      largestMismatchRegions: [...regions.entries()]
        .map(([region, counts]) => ({
          region,
          ...counts,
          total: counts.exactOnly + counts.approximateOnly,
        }))
        .sort((left, right) => right.total - left.total)
        .slice(0, 12),
    },
    null,
    2,
  ),
);

function intervalsAt(y, predicate) {
  const intervals = [];
  let start = null;
  for (let x = 190; x <= 466.5; x += 0.5) {
    const inside = predicate({ x, y });
    if (inside && start === null) start = x;
    if (!inside && start !== null) {
      intervals.push([start, x - 0.5]);
      start = null;
    }
  }
  if (start !== null) intervals.push([start, 466]);
  return intervals;
}

for (const y of [
  55, 70, 85, 95, 102, 106, 110, 118, 128, 140, 155, 165, 170, 175, 180, 185, 190, 198, 202,
]) {
  console.log(
    JSON.stringify({
      y,
      exact: intervalsAt(y, (point) => isInsidePolygon(point, exactPolygon)),
      approximate: intervalsAt(y, isApproximateShape),
    }),
  );
}
