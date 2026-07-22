import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, useColorScheme, View } from 'react-native';

import { SOCIAL_RADII_KM, SOCIALIZE_COLOR, useSocialize } from '../SocializeProvider';

function formatUntil(expiresAt: number): string {
  const date = new Date(expiresAt);
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** A chosen wall-clock time → absolute expiry; past times roll to tomorrow
 * (same semantics as the OpenStatusCard time control). */
function resolveTimeToExpiry(selected: Date): number {
  const next = new Date();
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function SubLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/35">
      {children}
    </Text>
  );
}

function Chip({
  active,
  onPress,
  accessibilityLabel,
  children,
}: {
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className="flex-row items-center gap-1 rounded-full border px-3 py-1.5 active:opacity-80"
      style={{
        borderColor: active ? SOCIALIZE_COLOR : 'rgba(255,255,255,0.15)',
        backgroundColor: active ? `${SOCIALIZE_COLOR}33` : 'rgba(255,255,255,0.05)',
      }}
    >
      {children}
    </Pressable>
  );
}

/** Exact wall-clock end-time control (iOS inline compact, Android dialog). */
function ExactTimeControl({
  expiresAt,
  onPick,
}: {
  expiresAt: number;
  onPick: (ts: number) => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [showAndroid, setShowAndroid] = useState(false);
  const value = new Date(expiresAt);

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
        style={{ borderColor: `${SOCIALIZE_COLOR}88`, backgroundColor: `${SOCIALIZE_COLOR}18` }}
      >
        <Ionicons name="time-outline" size={16} color={SOCIALIZE_COLOR} />
        <Text className="text-sm font-bold text-white">bis {formatUntil(expiresAt)}</Text>
        <Text className="text-xs font-semibold" style={{ color: SOCIALIZE_COLOR }}>
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
 * The live status card while visible: collapsed = one summary line
 * ("Sichtbar · 5 km · bis HH:MM") + stop; expanded = OPTIONAL refinement
 * (radius chips, exact end time, prominent free text, vibe chips). Same
 * collapse-by-default philosophy as the OpenStatusCard.
 */
export function SocializeSetupCard() {
  const { session, stopVisible, setRadius, setExpiresAt, setNote, toggleVibe, vibes } =
    useSocialize();
  const [expanded, setExpanded] = useState(false);

  // Local draft for the note field: typing only updates this, so nothing is
  // written until you commit (blur / keyboard "done") — one write per edit
  // instead of one per keystroke. Re-synced from the session whenever it
  // changes elsewhere, but never while you're actively editing.
  const [noteDraft, setNoteDraft] = useState(session?.note ?? '');
  const [noteFocused, setNoteFocused] = useState(false);

  useEffect(() => {
    if (noteFocused) return;
    setNoteDraft(session?.note ?? '');
  }, [session?.note, noteFocused]);

  if (!session) return null;

  const commitNote = () => setNote(noteDraft.trim());

  return (
    <View
      className="gap-3 rounded-2xl border px-4 py-3.5"
      style={{ backgroundColor: `${SOCIALIZE_COLOR}1f`, borderColor: `${SOCIALIZE_COLOR}66` }}
    >
      {/* Summary line — tap to expand/collapse */}
      <View className="flex-row items-center gap-2">
        <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOCIALIZE_COLOR }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Einstellungen einklappen' : 'Einstellungen anpassen'}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          className="flex-1 flex-row items-center gap-2 active:opacity-70"
        >
          <Text className="flex-1 text-sm font-bold text-white">
            Sichtbar · {session.radiusKm} km · bis {formatUntil(session.expiresAt)}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="rgba(255,255,255,0.55)"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nicht mehr sichtbar"
          onPress={stopVisible}
          hitSlop={8}
          className="flex-row items-center gap-1 rounded-full px-2.5 py-1 active:opacity-70"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
        >
          <Ionicons name="close" size={13} color="rgba(255,255,255,0.75)" />
          <Text className="text-xs font-bold text-white/75">Stopp</Text>
        </Pressable>
      </View>

      {expanded ? (
        <>
          {/* Radius */}
          <View>
            <SubLabel>Umkreis</SubLabel>
            <View className="flex-row gap-2">
              {SOCIAL_RADII_KM.map((km) => (
                <Chip
                  key={km}
                  active={session.radiusKm === km}
                  accessibilityLabel={`Umkreis ${km} Kilometer`}
                  onPress={() => setRadius(km)}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{
                      color: session.radiusKm === km ? '#fff' : 'rgba(244,245,247,0.75)',
                    }}
                  >
                    {km} km
                  </Text>
                </Chip>
              ))}
            </View>
          </View>

          {/* End time */}
          <View>
            <SubLabel>Bis wann?</SubLabel>
            <View className="flex-row flex-wrap items-center gap-2">
              <ExactTimeControl expiresAt={session.expiresAt} onPick={setExpiresAt} />
            </View>
          </View>

          {/* Free text — prominent: it's what strangers decide on. Typing only
              updates the local draft; committing (tap away / keyboard "done")
              is the one moment it's actually written — cheap, and the
              checkmark then confirms exactly what got saved. */}
          <View>
            <SubLabel>Worauf hast du Lust?</SubLabel>
            <View className="relative justify-center">
              <TextInput
                className="rounded-xl border py-2.5 pl-3 pr-9 text-sm text-white"
                style={{
                  borderColor: noteDraft.trim() ? SOCIALIZE_COLOR : 'rgba(255,255,255,0.15)',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}
                placeholder="z. B. Kaffee und quatschen, jemand dabei?"
                placeholderTextColor="rgba(244,245,247,0.4)"
                value={noteDraft}
                onChangeText={setNoteDraft}
                onFocus={() => setNoteFocused(true)}
                onBlur={() => {
                  setNoteFocused(false);
                  commitNote();
                }}
                onSubmitEditing={commitNote}
                maxLength={120}
                returnKeyType="done"
              />
              {session.note.trim() ? (
                <Ionicons
                  name="checkmark-circle"
                  size={17}
                  color={SOCIALIZE_COLOR}
                  style={{ position: 'absolute', right: 10 }}
                />
              ) : null}
            </View>
            <Text className="mt-1 text-[11px] text-white/40">
              {noteFocused
                ? 'Wird gespeichert, sobald du fertig bist.'
                : session.note.trim()
                  ? 'Gespeichert — wird sofort mit angezeigt.'
                  : 'Mit ein paar Worten bekommst du deutlich mehr Antworten.'}
            </Text>
          </View>

          {/* Vibes */}
          <View>
            <SubLabel>Vibes</SubLabel>
            <View className="flex-row flex-wrap gap-2">
              {vibes.map((item) => {
                const active = session.vibes.includes(item.label);
                return (
                  <Chip
                    key={item.label}
                    active={active}
                    accessibilityLabel={`Vibe ${item.label}`}
                    onPress={() => toggleVibe(item.label)}
                  >
                    <Text className="text-sm">{item.emoji}</Text>
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: active ? '#fff' : 'rgba(244,245,247,0.75)' }}
                    >
                      {item.label}
                    </Text>
                  </Chip>
                );
              })}
            </View>
          </View>

          {/* Privacy reminder */}
          <View className="flex-row items-center gap-2">
            <Ionicons name="shield-checkmark-outline" size={14} color={SOCIALIZE_COLOR} />
            <Text className="flex-1 text-[11px] text-white/45">
              {'Andere sehen nur „Person in deiner Nähe“ mit grober Entfernung — dein Name und Profil werden erst nach einem Match sichtbar.'}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
