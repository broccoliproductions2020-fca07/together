import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const landing = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(landing, '..');
const output = join(landing, 'public', 'screenshots');
const masterSize = { width: 1080, height: 2400 };
const screenshotNames = [
  'mica-open-status',
  'mica-now-activity',
  'mica-padel-activity',
  'mica-time-matching',
  'mica-activity-composer',
  'mica-activity-detail',
  'mica-journey-focus',
  'mica-safety-home',
];

const screens = {
  'mica-open-status': 'wink-preview2.png',
  'mica-now-activity': 'round-chat.png',
  'mica-padel-activity': 'final-emulator-state.png',
  'mica-time-matching': 'final-emulator-state.png',
  'mica-activity-composer': 'final-emulator-state.png',
  'mica-activity-detail': 'round-chat.png',
  'mica-journey-focus': 'berlin-portrait-activities.png',
  'mica-safety-home': 'notifications-open-blue-settled.png',
};

for (const name of screenshotNames) {
  if (!(name in screens)) throw new Error(`Screenshot-Zuordnung fehlt: ${name}`);
}

await mkdir(output, { recursive: true });

for (const [name, fallback] of Object.entries(screens)) {
  const master = join(landing, 'screenshots-master', `${name}.png`);
  const source = existsSync(master) ? master : join(repo, '.artifacts', fallback);
  if (!existsSync(source)) throw new Error(`Kein echter App-Rendering für ${name}: ${source}`);
  const metadata = await sharp(source).metadata();
  if (metadata.width !== masterSize.width || metadata.height !== masterSize.height) {
    throw new Error(`${name}: ${metadata.width}x${metadata.height}, erwartet ${masterSize.width}x${masterSize.height}`);
  }
  await sharp(source)
    .resize({ width: 810, withoutEnlargement: true })
    .webp({ quality: 84, effort: 5 })
    .toFile(join(output, `${name}.webp`));
  console.log(`${name}: ${source === master ? 'Master' : `Fallback ${fallback}`}`);
}
