import { useColorScheme } from 'react-native';

export function useOverlayColors() {
  const isDark = useColorScheme() === 'dark';

  return {
    primary: isDark ? 'rgb(52,211,153)' : 'rgb(14,59,46)',
    primaryBorder: isDark ? 'rgba(52,211,153,0.34)' : 'rgba(14,59,46,0.18)',
    icon: isDark ? 'rgb(242,239,233)' : 'rgb(20,33,28)',
    iconMuted: isDark ? 'rgb(154,163,157)' : 'rgb(107,98,88)',
    onPrimary: isDark ? 'rgb(12,21,18)' : 'rgb(250,247,242)',
    glassTint: isDark ? 'rgba(19,32,27,0.72)' : 'rgba(255,255,255,0.64)',
    highlight: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.72)',
    liquidWash: isDark ? 'rgba(19,32,27,0.66)' : 'rgba(255,255,255,0.42)',
  };
}
