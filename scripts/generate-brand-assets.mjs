import { Buffer } from 'node:buffer';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'assets', 'images');
const legacy = path.join(images, 'legacy');
const legacyWoven = path.join(images, 'legacy-woven');

const currentAssets = [
  'icon.png',
  'android-icon-foreground.png',
  'android-icon-background.png',
  'android-icon-monochrome.png',
  'favicon.png',
];

await mkdir(legacy, { recursive: true });
await mkdir(legacyWoven, { recursive: true });
for (const name of currentAssets) {
  await copyFile(path.join(images, name), path.join(legacy, name), 1).catch((error) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  await copyFile(path.join(images, name), path.join(legacyWoven, name), 1).catch((error) => {
    if (error?.code !== 'EEXIST') throw error;
  });
}

const mark = ({ monochrome = false } = {}) => `
  <g fill="none" stroke-linecap="round" stroke-width="9.5">
    <path d="M43 15V78C43 90 50 96 63 94" stroke="#FFFFFF" stroke-linejoin="round" />
    <path d="M14 92C27 92 35 82 43 70" stroke="${monochrome ? '#FFFFFF' : '#8991FF'}" />
    <path d="M16 39H70" stroke="#FFFFFF" />
  </g>`;

const defs = `
  <defs>
    <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#070910" />
      <stop offset="0.58" stop-color="#0B0F1C" />
      <stop offset="1" stop-color="#171C35" />
    </linearGradient>
  </defs>`;

const iconSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${defs}
    <rect width="1024" height="1024" fill="url(#night)" />
    <path d="M-180 238C162 28 448 382 1180 70" fill="none" stroke="#8991FF" stroke-opacity=".09" stroke-width="116" stroke-linecap="round" />
    <path d="M-150 850C206 584 524 1080 1180 650" fill="none" stroke="#B8BCFF" stroke-opacity=".055" stroke-width="104" stroke-linecap="round" />
    <g transform="translate(293 226) scale(5.1)">${mark()}</g>
  </svg>`);

const foregroundSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${defs}
    <g transform="translate(142 108) scale(2.65)">${mark()}</g>
  </svg>`);

const backgroundSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    ${defs}
    <rect width="512" height="512" fill="url(#night)" />
    <path d="M-100 112C90 6 236 188 612 32" fill="none" stroke="#8991FF" stroke-opacity=".09" stroke-width="66" stroke-linecap="round" />
    <path d="M-90 436C106 292 278 548 610 332" fill="none" stroke="#B8BCFF" stroke-opacity=".055" stroke-width="58" stroke-linecap="round" />
  </svg>`);

const monochromeSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
    <g transform="translate(117 87) scale(2.3)">${mark({ monochrome: true })}</g>
  </svg>`);

await Promise.all([
  sharp(iconSvg).png().toFile(path.join(images, 'icon.png')),
  sharp(foregroundSvg).png().toFile(path.join(images, 'android-icon-foreground.png')),
  sharp(backgroundSvg).png().toFile(path.join(images, 'android-icon-background.png')),
  sharp(monochromeSvg).png().toFile(path.join(images, 'android-icon-monochrome.png')),
  sharp(iconSvg).resize(48, 48).png().toFile(path.join(images, 'favicon.png')),
]);

console.log('Together brand assets generated; earlier concepts remain in assets/images/legacy*.');
