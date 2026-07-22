import { readFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Pass the connected wordmark SVG path.');

const source = await readFile(sourcePath, 'utf8');
const fullPath = source.match(/<path\s+d="([^"]+)"/s)?.[1];
if (!fullPath) throw new Error('No SVG path found.');

const start = fullPath.indexOf('M 204.00');
const end = fullPath.indexOf('M 121.00');
if (start < 0 || end < 0) throw new Error('Connected g-e segment not found.');

const connectedGe = fullPath.slice(start, end).trim();
const numbers = [...connectedGe.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
const points = Array.from({ length: numbers.length / 2 }, (_, index) => ({
  x: numbers[index * 2],
  y: numbers[index * 2 + 1],
}));

console.log(
  JSON.stringify(
    {
      bounds: {
        minX: Math.min(...points.map(({ x }) => x)),
        maxX: Math.max(...points.map(({ x }) => x)),
        minY: Math.min(...points.map(({ y }) => y)),
        maxY: Math.max(...points.map(({ y }) => y)),
      },
      characters: connectedGe.length,
      points: points.length,
      start: points[0],
      end: points.at(-1),
    },
    null,
    2,
  ),
);
console.log(connectedGe);
