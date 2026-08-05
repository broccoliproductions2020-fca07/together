const fs = require('node:fs');
const path = require('node:path');

const releaseTag = process.argv[2];
if (!releaseTag) {
  console.error('Release tag fehlt. Erwartet wird v<app.json expo.version>.');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const expectedTag = `v${appJson.expo?.version}`;
if (releaseTag !== expectedTag) {
  console.error(`Release tag ${releaseTag} passt nicht zur App-Version ${expectedTag}.`);
  process.exit(1);
}

console.log(`Release tag bestaetigt: ${releaseTag}`);
