/**
 * Contrast-aware foreground for coloured surfaces (buttons, chips, badges).
 *
 * The activity mode accents (`now` #41C08D, `soon` #E0A23E, `open` #6E8BF7) are
 * mid-tone colours: white text on them measures ~2.2–3.1:1, below the WCAG AA
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
 * Ink or white text for the given background, whichever clears the given WCAG
 * contrast ratio against white first (default 4.5:1). Unparseable colours fall
 * back to white so nothing crashes on a malformed value.
 */
export function onColorTextColor(background: string, minWhiteContrast = 4.5): string {
  const rgb = parseColor(background);
  if (!rgb) return WHITE;
  const luminance = relativeLuminance(rgb);
  const whiteContrast = 1.05 / (luminance + 0.05);
  return whiteContrast >= minWhiteContrast ? WHITE : INK;
}
