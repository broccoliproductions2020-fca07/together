/**
 * Multiplies an opacity into a colour.
 *
 * React Native has no `border-opacity`, and putting the opacity on the VIEW
 * would fade everything inside it. Folding the alpha into the colour keeps the
 * two tokens independent. Unparseable colours are returned untouched rather
 * than silently turned transparent.
 *
 * Always use this instead of appending an `#RRGGBBAA` suffix to a colour
 * string. That shortcut only works on hex: React Native's colour parser matches
 * the `rgb(...)` prefix and DISCARDS the trailing suffix without error, so
 * `rgb(65,192,141)` + `29` normalises to fully opaque green. Measured, not
 * assumed — it turned the calendar's tonal "Bearbeiten" button into a solid
 * green block whose label, computed for the intended 16 % wash, vanished into
 * the fill.
 */
export function withAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const clamped = Math.max(0, Math.min(1, alpha));

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const raw = hex[1];
    if (!raw) return color;
    const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamped})`;
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const content = rgb[1];
    if (!content) return color;
    const parts = content.split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const existing = parts.length >= 4 ? Number(parts[3]) : 1;
      const merged = (Number.isFinite(existing) ? existing : 1) * clamped;
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${merged})`;
    }
  }
  return color;
}
