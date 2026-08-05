import { Pressable, Switch, Text, View } from 'react-native';

import { AnimatedToggleIcon } from '@/shared/components/AnimatedToggleIcon';

import type { ActivityDraft } from '../types';

const MODE_ACCENTS = {
  open: '#6E8BF7',
  soon: '#E0A23E',
  now: '#41C08D',
};

export interface GuestInvitesFieldProps {
  draft: ActivityDraft;
  onChange: (draft: ActivityDraft) => void;
}

/**
 * Host opt-in for participant guest invites ("Freunde dürfen Freunde
 * mitbringen"). Default OFF — inviting a guest widens who can see the
 * activity (and its pin), so that stays a deliberate host decision, same
 * privacy-first default as the Open card's location toggle. Unlike the
 * Sichtbarkeit picker this stays editable in edit mode: toggling changes
 * only the FUTURE invite mechanism, never the current audience.
 */
export function GuestInvitesField({ draft, onChange }: GuestInvitesFieldProps) {
  const accent = MODE_ACCENTS[draft.mode];
  const enabled = draft.guestInvitesEnabled === true;

  function toggle(next: boolean) {
    onChange({ ...draft, guestInvitesEnabled: next || undefined });
  }

  return (
    <View
      className="rounded-3xl border border-white/10 px-4 py-3.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
    >
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Gäste-Einladungen erlauben"
        className="flex-row items-center gap-3"
        onPress={() => toggle(!enabled)}
      >
        <AnimatedToggleIcon
          icon="person-add"
          active={enabled}
          size={17}
          activeColor={accent}
          inactiveColor="rgba(244,245,247,0.6)"
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-white">Gäste erlauben</Text>
          <Text className="mt-0.5 text-xs text-white/50">
            {enabled
              ? 'Teilnehmer dürfen eigene Freunde einladen'
              : 'Nur deine Freunde sehen die Aktivität'}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          trackColor={{ false: 'rgba(255,255,255,0.15)', true: accent }}
          thumbColor="#ffffff"
        />
      </Pressable>
    </View>
  );
}
