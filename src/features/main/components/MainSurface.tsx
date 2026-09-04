import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { MapScreen, useMapBoot } from '@/features/map';
import { usePushNudge } from '@/features/notifications';
import { SafetyConsoleHost, SafetyConsolePanel } from '@/features/safety';

import { WelcomeIntro } from './WelcomeIntro';

/**
 * Hosts the app's one main surface: the map, filling the screen, with every
 * other surface floating over it as a card.
 *
 * There used to be a second "mode" here — the calendar — which took the whole
 * display, cross-faded in and needed its own control at the bottom edge to get
 * back out of. It is a `FloatingSheet` on the map now, opened from the Core and
 * closed by its own header button, which left this component with a single
 * layer and no mode to switch. The layer machinery went with it.
 */
export function MainSurface() {
  const { prewarming } = useMapBoot();

  /**
   * The notification ask rides along with the start of the app, right behind the
   * location question — the two permissions are asked in one stretch instead of
   * one now and one at some unpredictable later moment.
   *
   * Two gates, both load-bearing. `prewarming` keeps it from firing behind the
   * boot curtain, where the dialog would sit invisibly under the Mica mark. And
   * it waits for the welcome hero to be OUT OF THE WAY — that is a modal, and
   * an alert stacked on it is the permission gauntlet this ask is designed not
   * to be. `onResolved` fires for a returning account too, which never sees the
   * hero at all.
   */
  const { maybeAskForPush } = usePushNudge();
  const [welcomeResolved, setWelcomeResolved] = useState(false);
  useEffect(() => {
    if (!welcomeResolved || prewarming) return;
    void maybeAskForPush();
  }, [welcomeResolved, prewarming, maybeAskForPush]);

  return (
    <View style={{ flex: 1 }} className="bg-background">
      <MapScreen active={!prewarming} />

      {/* Heimweg safety mode (docs/safety-mode.md → Heimweg-Fokus):
          - Fall 1 (own session only): full-screen console modal.
          - Fall 2 (own session + friends sharing): floating panel over the
          focus map instead of a covering modal.
          - Die Heimweg-Pill gehört ausschließlich zur Kartenoberfläche und
            wird dort zusammen mit den übrigen Karten-Elementen gerendert. */}
      <SafetyConsoleHost />
      <SafetyConsolePanel />

      {/* One-time welcome hero after the first sign-in */}
      <WelcomeIntro onResolved={() => setWelcomeResolved(true)} />
    </View>
  );
}
