import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TogetherLogoAppearance } from '../types/branding.types';
import { TogetherLogoSplash } from './TogetherLogoSplash';

export function TogetherLogoDemo() {
  const [appearance, setAppearance] = useState<TogetherLogoAppearance>('dark');
  const [restartKey, setRestartKey] = useState(0);
  const [complete, setComplete] = useState(false);
  const dark = appearance === 'dark';

  const replay = () => {
    setComplete(false);
    setRestartKey((current) => current + 1);
  };

  return (
    <View style={[styles.root, { backgroundColor: dark ? '#09111C' : '#F5F7FA' }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <TogetherLogoSplash
        appearance={appearance}
        onAnimationComplete={() => setComplete(true)}
        restartKey={restartKey}
      />

      <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={styles.controls}>
          <Text style={[styles.state, { color: dark ? '#F3F6FA' : '#122741' }]}>
            {complete ? 'Finale Form' : 'Morphing'}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={replay}
              style={[styles.button, dark ? styles.buttonDark : styles.buttonLight]}
            >
              <Text style={[styles.buttonLabel, { color: dark ? '#F3F6FA' : '#122741' }]}>
                Wiederholen
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAppearance((current) => (current === 'dark' ? 'light' : 'dark'));
                replay();
              }}
              style={[styles.button, dark ? styles.buttonDark : styles.buttonLight]}
            >
              <Text style={[styles.buttonLabel, { color: dark ? '#F3F6FA' : '#122741' }]}>
                {dark ? 'Hell' : 'Dunkel'}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 46,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonDark: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonLabel: {
    fontFamily: 'SchibstedGrotesk_600SemiBold',
    fontSize: 14,
  },
  buttonLight: {
    backgroundColor: 'rgba(18,39,65,0.05)',
    borderColor: 'rgba(18,39,65,0.12)',
  },
  controls: {
    alignItems: 'center',
    gap: 14,
    marginTop: 'auto',
    paddingBottom: 24,
  },
  root: {
    flex: 1,
  },
  state: {
    fontFamily: 'SchibstedGrotesk_500Medium',
    fontSize: 12,
    letterSpacing: 0.5,
    opacity: 0.5,
    textTransform: 'uppercase',
  },
});
