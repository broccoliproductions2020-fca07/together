// Renders the src/features/legal/*.de.json documents — the SAME sources the
// in-app legal screens use — into self-contained, hostable HTML pages for the
// store listings (docs/legal/*.html). Run: npm run legal:html
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, 'src', 'features', 'legal');
const outputDir = path.join(root, 'docs', 'legal');
const DOCS = ['datenschutz', 'nutzungsbedingungen', 'impressum'];

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const renderBlock = (block) => {
  if (block.type === 'list') {
    const items = (block.items ?? []).map((item) => `      <li>${escapeHtml(item)}</li>`);
    return `    <ul>\n${items.join('\n')}\n    </ul>`;
  }
  return `    <p>${escapeHtml(block.text ?? '')}</p>`;
};

const renderDocument = (legal) => {
  const sections = legal.sections
    .map(
      (section) =>
        `  <section>\n    <h2>${escapeHtml(section.title)}</h2>\n${section.blocks
          .map(renderBlock)
          .join('\n')}\n  </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(legal.title)} · Mica</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0 auto;
      padding: 32px 20px 64px;
      max-width: 720px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1c2028;
      background: #ffffff;
    }
    h1 { font-size: 1.9rem; line-height: 1.2; margin-bottom: 4px; }
    h2 { font-size: 1.15rem; margin: 32px 0 8px; }
    p, li { font-size: 0.95rem; }
    p { margin: 0 0 10px; }
    ul { margin: 0 0 10px; padding-left: 22px; }
    li { margin-bottom: 6px; }
    .stand { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
    @media (prefers-color-scheme: dark) {
      body { color: #e7e9ee; background: #0b0e14; }
      .stand { color: #9aa1ad; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(legal.title)}</h1>
  <p class="stand">Stand: ${escapeHtml(legal.stand)}</p>
${sections}
</body>
</html>
`;
};

await mkdir(outputDir, { recursive: true });
for (const name of DOCS) {
  const legal = JSON.parse(await readFile(path.join(sourceDir, `${name}.de.json`), 'utf8'));
  const remainingPlaceholders = JSON.stringify(legal).match(/\[[^\]"]{3,80}\]/g) ?? [];
  if (remainingPlaceholders.length > 0) {
    console.warn(`WARNUNG: ${legal.title} enthält noch Platzhalter — vor dem Hosten ausfüllen:`);
    for (const placeholder of new Set(remainingPlaceholders)) console.warn(`  ${placeholder}`);
  }
  const outputPath = path.join(outputDir, `${name}.html`);
  await writeFile(outputPath, renderDocument(legal), 'utf8');
  console.log(`Geschrieben: ${path.relative(root, outputPath)}`);
}
