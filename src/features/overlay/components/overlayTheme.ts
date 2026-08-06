import { useColorScheme } from 'react-native';

export function useOverlayColors() {
  const isDark = useColorScheme() === 'dark';

  return {
    primary: isDark ? 'rgb(52,211,153)' : 'rgb(14,59,46)',
    primaryBorder: isDark ? 'rgba(52,211,153,0.34)' : 'rgba(14,59,46,0.18)',
    icon: isDark ? 'rgb(242,239,233)' : 'rgb(20,33,28)',
    iconMuted: isDark ? 'rgb(154,163,157)' : 'rgb(107,98,88)',
    onPrimary: isDark ? 'rgb(12,21,18)' : 'rgb(250,247,242)',
    // Tint only — the material does the work. Kept light on purpose: at 0.72
    // the glass read as flat paint. This is THE dial for "more/less glass";
    // raise it if icons lose contrast over a bright map.
    glassTint: isDark ? 'rgba(19,32,27,0.34)' : 'rgba(255,255,255,0.30)',
    highlight: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
    // The edge is what gives a glass control its shape over a live map. In dark
    // mode a white hairline does that; in light mode it CANNOT — white on a
    // bright map is invisible, which is what made these buttons disappear. So
    // light mode gets the opposite hairline, dark and faint, rather than a
    // brand colour: the blue belongs to "offen", not to every button.
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(20,33,28,0.16)',
    liquidWash: isDark ? 'rgba(19,32,27,0.66)' : 'rgba(255,255,255,0.42)',
  };
}
