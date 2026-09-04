/**
 * Contrast-aware foreground for coloured surfaces (buttons, chips, badges).
 *
 * The activity mode accents (`now` #41C08D, `soon` #E0A23E, `open` #3B82F6) are
 * mid-tone colours: white text on them measures ~2.2–3.7:1, below the WCAG AA
 * threshold (4.5:1 body / 3:1 large text). Picking the foreground by measured
 * luminance instead of hard-coding white keeps every accent button legible —
 * dark ink lands on the light accents, white stays where it genuinely passes.
 */

const INK = '#14211C';
const WHITE = '#ffffff';

function parseColor(color: string): [number, number, number] | null {
  const hex = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

/** WCAG relative luminance of an sRGB colour channel triple (0–255). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Ink or white text for the given background: white when it clears the given
 * WCAG ratio (default 4.5:1), otherwise ink. Unparseable colours fall back to
 * white so nothing crashes on a malformed value.
 *
 * When NEITHER endpoint clears the threshold the better one still wins. That
 * used to fall through to ink unconditionally, which picked the WORSE colour
 * in exactly the case that needed help: on the Safety pink (#C45178) and red
 * (#D64557) — the two accents in the palette that no black-or-white label can
 * carry to AA — it printed ink at 3.79:1 and 3.84:1 where white would have
 * given 4.38:1 and 4.33:1. Reaching AA there needs a darker colour, which is a
 * palette decision; picking the better of two is not.
 */
export function onColorTextColor(background: string, minWhiteContrast = 4.5): string {
  const rgb = parseColor(background);
  if (!rgb) return WHITE;
  const luminance = relativeLuminance(rgb);
  const whiteContrast = 1.05 / (luminance + 0.05);
  if (whiteContrast >= minWhiteContrast) return WHITE;
  const inkRgb = parseColor(INK);
  if (!inkRgb) return INK;
  const inkContrast =
    (Math.max(luminance, relativeLuminance(inkRgb)) + 0.05) /
    (Math.min(luminance, relativeLuminance(inkRgb)) + 0.05);
  return inkContrast >= whiteContrast ? INK : WHITE;
}

type Rgb = [number, number, number];

function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Label colour for a TINTED surface — an accent laid over a card at low alpha,
 * which is what the `tonal` button variant is.
 *
 * The mirror image of the problem `onColorTextColor` solves, and it went
 * unnoticed for the opposite reason: on a DARK card an accent-on-accent-tint
 * label measures ~6:1 and reads fine, so nothing looked wrong. On a light card
 * the same two colours are the mode accent over a near-white wash of itself —
 * measured 1.98:1 for `soon` and 2.02:1 for `now`, against the 4.5:1 threshold.
 * The label and its icon were still drawn; they were simply not visible, which
 * reads as an empty button rather than as a contrast fault.
 *
 * The accent is walked toward black or white — whichever way the composited
 * fill demands — so the button keeps its identity: a darkened amber is still
 * unmistakably amber, where dropping to neutral ink would throw that away. The
 * walk always terminates at an endpoint that passes, so this can never return
 * an unreadable colour, whatever surface a future call site puts it on.
 */
export function onTintTextColor(
  accent: string,
  surface: string,
  alpha: number,
  minContrast = 4.5,
): string {
  const accentRgb = parseColor(accent);
  const surfaceRgb = parseColor(surface);
  if (!accentRgb || !surfaceRgb) return INK;

  const fill = mix(surfaceRgb, accentRgb, Math.min(Math.max(alpha, 0), 1));
  if (contrastRatio(accentRgb, fill) >= minContrast) return accent;

  // A light fill needs a darker label and a dark fill a lighter one; going the
  // wrong way walks toward the fill's own luminance and never converges.
  const target: Rgb = relativeLuminance(fill) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(accentRgb, target, step / 20);
    if (contrastRatio(candidate, fill) >= minContrast) return toHex(candidate);
  }
  return onColorTextColor(toHex(fill), minContrast);
}
