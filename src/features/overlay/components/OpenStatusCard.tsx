import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Switch, Text, TextInput, useColorScheme, View } from 'react-native';

import { useOpenStatus } from '@/features/presence';

const OPEN_COLOR = '#6E8BF7';

function formatUntil(expiresAt: number): string {
  const date = new Date(expiresAt);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** A chosen wall-clock time → absolute expiry. If it's already past today, it
 * rolls to tomorrow (so "offen bis 02:00" late at night means next morning). */
function resolveTimeToExpiry(selected: Date): number {
  const next = new Date();
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function SubLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white">
      {children}
    </Text>
  );
}

/** Exact wall-clock time control. iOS shows the native compact picker inline;
 * Android opens the native time dialog from a chip. */
function ExactTimeControl({
  expiresAt,
  onPick,
}: {
  expiresAt: number | null;
  onPick: (ts: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [showAndroid, setShowAndroid] = useState(false);
  const value = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 3 * 60 * 60 * 1000);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        themeVariant={scheme}
        onChange={(_event, date) => {
          if (date) onPick(resolveTimeToExpiry(date));
        }}
      />
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Genaue Uhrzeit wählen"
        onPress={() => setShowAndroid(true)}
        className="flex-row items-center gap-2 rounded-xl border px-3.5 py-2.5 active:opacity-80"
        style={{ borderColor: `${OPEN_COLOR}88`, backgroundColor: `${OPEN_COLOR}18` }}
      >
        <Ionicons name="time-outline" size={16} color={OPEN_COLOR} />
        <Text className="text-sm font-bold text-white">
          {expiresAt ? `bis ${formatUntil(expiresAt)}` : 'Uhrzeit wählen'}
        </Text>
        <Text className="text-xs font-semibold" style={{ color: OPEN_COLOR }}>
          ändern
        </Text>
        <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.6)" />
      </Pressable>
      {showAndroid ? (
        <DateTimePicker
          value={value}
          mode="time"
          is24Hour
          onChange={(event, date) => {
            setShowAndroid(false);
            if (event.type === 'set' && date) onPick(resolveTimeToExpiry(date));
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Top of the NearbySheet: the current user's own "I'm open" presence.
 * Not open → one tap to go open (defaults, no form). Open → a live card where
 * everything is OPTIONAL refinement: an exact time picker and a free-text vibe
 * field. No vibe set displays as "Egal" (display convention — the data stays
 * null). "open" was deliberately removed from the activity composer
 * (open = presence, not event).
 */
export function OpenStatusCard() {
  const {
    isOpen,
    vibe,
    expiresAt,
    goOpen,
    setVibe,
    setExpiresAt,
    shareLocation,
    setShareLocation,
    close,
  } = useOpenStatus();
  // Collapsed by default: once open, the card is just a compact summary; the
  // duration/vibe controls only unfold when you actually want to tweak them.
  const [expanded, setExpanded] = useState(false);

  // Local draft for the vibe field: typing only updates this; committing
  // (blur / keyboard "done") is the one point it's written through to the
  // presence backend — avoids a Firestore write per keystroke.
  const [customVibeDraft, setCustomVibeDraft] = useState(vibe ? vibe.label : '');
  const [customVibeFocused, setCustomVibeFocused] = useState(false);

  useEffect(() => {
    if (customVibeFocused) return;
    setCustomVibeDraft(vibe ? vibe.label : '');
  }, [vibe, customVibeFocused]);

  const commitCustomVibe = () => {
    const trimmed = customVibeDraft.trim();
    setVibe(trimmed ? { label: trimmed } : null);
  };

  if (!isOpen) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Offen stellen"
        onPress={goOpen}
        className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5 active:opacity-90"
        style={{
          backgroundColor: `${OPEN_COLOR}22`,
          borderWidth: 1,
          borderColor: `${OPEN_COLOR}55`,
        }}
      >
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: OPEN_COLOR }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-white">Offen stellen</Text>
          <Text className="text-xs text-white/55">
            Zeig deinen Freunden, dass du gerade Zeit hast
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" />
      </Pressable>
    );
  }

  return (
    <View
      className="gap-3 rounded-2xl px-4 py-3.5"
      style={{ backgroundColor: `${OPEN_COLOR}1f`, borderWidth: 1, borderColor: `${OPEN_COLOR}66` }}
    >
      {/* Summary line — tap to expand/collapse the refinement controls */}
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OPEN_COLOR }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Details einklappen' : 'Details anpassen'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          className="flex-1 flex-row items-center gap-2 active:opacity-70"
        >
          <Text className="flex-1 text-sm font-bold text-white">
            Du bist offen · {vibe ? vibe.label : 'Egal'}
            {expiresAt ? ` · bis ${formatUntil(expiresAt)}` : ''}
          </Text>
          {shareLocation ? <Ionicons name="locate" size={13} color={OPEN_COLOR} /> : null}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="rgba(255,255,255,0.55)"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nicht mehr offen"
          onPress={close}
          hitSlop={8}
          className="flex-row items-center gap-1 rounded-full px-2.5 py-1 active:opacity-70"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          <Ionicons name="close" size={13} color="rgba(255,255,255,0.75)" />
          <Text className="text-xs font-bold text-white/75">aus</Text>
        </Pressable>
      </View>

      {expanded ? (
        <>
          {/* Vibe first — the "what" is the social headline; time is just the frame.
              Free text only; empty = "Egal" (display convention, no data write) */}
          <View>
            <SubLabel>Offen für</SubLabel>
            <TextInput
              className="rounded-xl border px-3 py-2.5 text-sm text-white"
              style={{
                borderColor: customVibeDraft.trim() ? OPEN_COLOR : 'rgba(255,255,255,0.15)',
                backgroundColor: 'rgba(255,255,255,0.05)',
              }}
              placeholder="Egal"
              placeholderTextColor="rgba(244,245,247,0.4)"
              value={customVibeDraft}
              onChangeText={setCustomVibeDraft}
              onFocus={() => setCustomVibeFocused(true)}
              onBlur={() => {
                setCustomVibeFocused(false);
                commitCustomVibe();
              }}
              onSubmitEditing={commitCustomVibe}
              maxLength={40}
              returnKeyType="done"
            />
          </View>

          {/* Duration — exact native time picker. Result also shows as "bis HH:MM" above. */}
          <View>
            <SubLabel>Bis wann?</SubLabel>
            <View className="flex-row flex-wrap items-center gap-2">
              <ExactTimeControl expiresAt={expiresAt} onPick={setExpiresAt} />
            </View>
          </View>

          {/* Optional coarse proximity — visible only inside the Offen-Fenster. */}
          <View>
            <SubLabel>Nähe</SubLabel>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: shareLocation }}
              accessibilityLabel="Nähe mit Freunden teilen"
              onPress={() => setShareLocation(!shareLocation)}
              className="flex-row items-center gap-3 rounded-xl border px-3.5 py-2.5"
              style={{
                borderColor: shareLocation ? `${OPEN_COLOR}88` : 'rgba(255,255,255,0.12)',
                backgroundColor: shareLocation ? `${OPEN_COLOR}18` : 'rgba(255,255,255,0.04)',
              }}
            >
              <Ionicons
                name={shareLocation ? 'locate' : 'locate-outline'}
                size={17}
                color={shareLocation ? OPEN_COLOR : 'rgba(244,245,247,0.6)'}
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">Nähe teilen</Text>
                <Text className="text-xs text-white/50">
                  {shareLocation
                    ? 'Freunde können dich grob als nah einordnen'
                    : 'Freunde sehen dich ohne Näheangabe'}
                </Text>
              </View>
              <Switch
                value={shareLocation}
                onValueChange={setShareLocation}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: OPEN_COLOR }}
                thumbColor="#ffffff"
              />
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}
