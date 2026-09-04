/**
 * Rendert das Wortmarken-PNG für die Bestätigungsmail.
 *
 * Liest die Pfade aus `micaLogo.tsx`, statt sie zu kopieren: E-Mail-Clients
 * entfernen Inline-SVG, das Logo muss also als Bild gehostet werden — und ein
 * abgetipptes Bild driftet still von der Marke weg, sobald jemand die
 * Komponente anfasst. Dieselbe Begründung wie bei `render-from-source.mjs`.
 *
 *   node scripts/build-email-logo.mjs
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'src/shared/components/brand/micaLogo.tsx');
const OUT = resolve(ROOT, 'hosting/public/email/mica-logo.png');

// 3x der im Template deklarierten 104x36, damit es auf Retina scharf bleibt.
const WIDTH = 312;
const HEIGHT = 108;

// Muss `COLORS.text` in functions/email/verificationTemplate.js entsprechen:
// die Mail ist dunkel, also tragen die Buchstaben das Helle.
const LETTER_COLOR = '#F4F5F7';

const source = readFileSync(SOURCE, 'utf8');

function readPath(name) {
  const match = source.match(new RegExp(`const ${name} = \`([^\`]+)\``));
  if (!match) throw new Error(`${name} nicht in micaLogo.tsx gefunden`);
  return match[1];
}

function readColor(key) {
  const match = source.match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`));
  if (!match) throw new Error(`Farbe ${key} nicht in micaLogo.tsx gefunden`);
  return match[1];
}

const viewBox = source.match(/MICA_WORDMARK_VIEW_BOX = '([^']+)'/)?.[1];
if (!viewBox) throw new Error('MICA_WORDMARK_VIEW_BOX nicht gefunden');

const paths = [
  { d: readPath('M_PATH'), fill: LETTER_COLOR },
  { d: readPath('CA_PATH'), fill: LETTER_COLOR },
  { d: readPath('FIGURE_BODY_PATH'), fill: readColor('body') },
  { d: readPath('FIGURE_ARM_PATH'), fill: readColor('arm') },
  { d: readPath('FIGURE_HEAD_PATH'), fill: readColor('head') },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${paths
  .map((p) => `<path d="${p.d}" fill="${p.fill}"/>`)
  .join('')}</svg>`;

mkdirSync(dirname(OUT), { recursive: true });

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`${OUT}\n${meta.width}x${meta.height}, alpha=${meta.hasAlpha}`);
