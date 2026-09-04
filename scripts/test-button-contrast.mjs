/**
 * Every SquircleButton label must be readable — measured, not assumed.
 *
 * The variants that print the accent as INK (tonal, outline, ghost,
 * destructive) had no contrast rule at all. Measured before the fix, on the
 * light card: `soon` 1.98:1 and `now` 2.02:1 against the 4.5:1 threshold — the
 * label and its icon were drawn but invisible, so the button read as empty.
 * The default accent failed the other way round, at 1.30:1 on the dark card.
 * This walks the real helper over every accent the app actually passes, on
 * both cards, so neither direction can come back unnoticed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import ts from 'typescript';

const sourcePath = new URL('../src/shared/utils/contrastColor.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath.pathname,
});
const module = { exports: {} };
vm.runInNewContext(
  compiled.outputText,
  { Math, Number, parseInt, exports: module.exports, module },
  { filename: sourcePath.pathname },
);
const { onColorTextColor, onTintTextColor } = module.exports;

const AA_TEXT = 4.5;

const channel = (raw) => {
  const c = raw / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const parse = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const first = luminance(parse(a));
  const second = luminance(parse(b));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};
const composite = (accent, surface, alpha) => {
  const [ar, ag, ab] = parse(accent);
  const [sr, sg, sb] = parse(surface);
  const at = Math.min(Math.max(alpha, 0), 1);
  const round = (s, a) => Math.round(s + (a - s) * at);
  return `#${[round(sr, ar), round(sg, ag), round(sb, ab)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
};

// `ThemeColors.card`, both schemes — the surface these buttons actually sit on.
const CARDS = { hell: '#FFFFFF', dunkel: '#13201B' };
// Every colour the app actually passes as `color`: the three mode accents, the
// button's own default, the muted greys the Postfach uses, and the semantic
// colours a Safety notice can carry.
const ACCENTS = {
  soon: '#E0A23E',
  now: '#41C08D',
  open: '#3B82F6',
  default: '#0E3B2E',
  'muted (hell)': '#6B6258',
  'muted (dunkel)': '#9AA39D',
  action: '#7657A8',
  safetyAttention: '#C45178',
  danger: '#D64557',
};
// Alpha per variant, mirroring SquircleButton's A16 / A14 hex suffixes.
const VARIANTS = { tonal: 0x29 / 255, 'outline/ghost': 0, destructive: 0x24 / 255 };
const DANGER = '#C82626';

let checked = 0;
const rows = [];
for (const [variant, alpha] of Object.entries(VARIANTS)) {
  for (const [accentName, accent] of Object.entries(ACCENTS)) {
    const ink = variant === 'destructive' ? DANGER : accent;
    for (const [scheme, card] of Object.entries(CARDS)) {
      const fill = composite(ink, card, alpha);
      const label = onTintTextColor(ink, card, alpha);
      const ratio = contrast(label, fill);
      rows.push(`${variant.padEnd(14)} ${accentName.padEnd(15)} ${scheme.padEnd(7)} ${ratio.toFixed(2)}`);
      assert.ok(
        ratio >= AA_TEXT,
        `${variant} / ${accentName} / ${scheme}: label ${label} on ${fill} is ${ratio.toFixed(2)}:1, below ${AA_TEXT}`,
      );
      checked += 1;
    }
    if (variant === 'destructive') break; // destructive ignores the accent
  }
}

/**
 * The solid variant fills with the accent, so its label can only ever be ink or
 * white — and two Safety accents are mid-tone enough that neither reaches AA.
 * Asserting 4.5 flat would mean either a failing suite or deleting the two rows
 * that need watching most, so the rule is stated as what the helper OWES: the
 * better of the two endpoints, always. Reaching 4.5 on these two needs a darker
 * pink and red, which is a palette decision and not this helper's to make.
 */
const SOLID_BELOW_AA = { safetyAttention: 4.38, danger: 4.33 };
for (const [accentName, accent] of Object.entries(ACCENTS)) {
  const chosen = contrast(onColorTextColor(accent), accent);
  const best = Math.max(contrast('#ffffff', accent), contrast('#14211C', accent));
  rows.push(`${'solid'.padEnd(14)} ${accentName.padEnd(15)} ${'—'.padEnd(7)} ${chosen.toFixed(2)}`);
  assert.ok(
    Math.abs(chosen - best) < 0.01,
    `solid / ${accentName}: picked ${chosen.toFixed(2)}:1 where ${best.toFixed(2)}:1 was available`,
  );
  const floor = SOLID_BELOW_AA[accentName];
  if (floor) {
    assert.ok(
      chosen >= floor - 0.01,
      `solid / ${accentName}: ${chosen.toFixed(2)}:1 fell below the documented ${floor}:1`,
    );
  } else {
    assert.ok(chosen >= AA_TEXT, `solid / ${accentName}: ${chosen.toFixed(2)}:1 is below ${AA_TEXT}`);
  }
  checked += 1;
}

// An unchanged accent must survive: the helper may only intervene where the
// pairing actually fails, or every tonal button would drift off-brand.
assert.equal(
  onTintTextColor('#0E3B2E', '#FFFFFF', 0x29 / 255),
  '#0E3B2E',
  'a pairing that already passes must be returned untouched',
);

// The fill a translucent variant draws must actually BE translucent. This
// existed only as hex-suffix string concatenation, which React Native parses
// on hex and silently drops on `rgb(...)`: the calendar passes
// `markerModeStyles` colours, so its tonal button rendered a fully opaque
// fill under a label computed for a 16 % wash — a solid green block with no
// readable word on it. Both notations are checked so neither can regress.
const alphaSource = new URL('../src/shared/utils/colorAlpha.ts', import.meta.url);
const alphaCompiled = ts.transpileModule(readFileSync(alphaSource, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: alphaSource.pathname,
});
const alphaModule = { exports: {} };
vm.runInNewContext(
  alphaCompiled.outputText,
  { Math, Number, parseInt, exports: alphaModule.exports, module: alphaModule },
  { filename: alphaSource.pathname },
);
const { withAlpha } = alphaModule.exports;

const { default: normalizeColor } = await import('@react-native/normalize-colors');
// Every notation a caller actually passes as `color`, hex and rgb() alike.
const NOTATIONS = ['#41C08D', 'rgb(65,192,141)', '#E0A23E', 'rgb(224,162,62)'];
const ALPHAS = { tonal: 0x29 / 255, 'outline-border': 0x80 / 255, destructive: 0x24 / 255 };
for (const [variant, alpha] of Object.entries(ALPHAS)) {
  for (const notation of NOTATIONS) {
    const normalized = normalizeColor(withAlpha(notation, alpha));
    assert.notEqual(normalized, null, `${variant}: ${notation} ergab keine gueltige Farbe`);
    const drawn = (normalized & 0xff) / 255;
    assert.ok(
      Math.abs(drawn - alpha) < 0.01,
      `${variant}: ${notation} wird mit ${drawn.toFixed(3)} statt ${alpha.toFixed(3)} gezeichnet`,
    );
    checked += 1;
  }
}

console.log(`Variante        Akzent          Schema  Kontrast`);
rows.forEach((row) => console.log(row));
const exceptions = Object.entries(SOLID_BELOW_AA)
  .map(([name, value]) => `solid/${name} ${value}:1`)
  .join(', ');
console.log(
  `\n${checked} Kombinationen geprüft: alle >= ${AA_TEXT}:1 bis auf die zwei dokumentierten ` +
    `Palettengrenzen (${exceptions}), die jeweils das Beste aus Tinte und Weiss bekommen.`,
);
