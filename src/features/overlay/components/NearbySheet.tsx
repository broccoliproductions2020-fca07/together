import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useActivityChat, type GroupMember, type GroupOpening } from '@/features/chat';
import type { NearbyFriend } from '@/features/map/types/map.types';
import { useOpenStatus } from '@/features/presence';
import { RadiusSlider } from '@/features/settings';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import { SquircleButton } from '@/shared/components/SquircleButton';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { openLocationSettings } from '@/shared/utils/locationPermission';

import { FLOATING_SHEET_SURFACE, FloatingSheet } from './FloatingSheet';
import { FloatingSheetHeader } from './FloatingSheetHeader';

const OPEN_COLOR = '#3B82F6';
const SHEET_BORDER_COLOR = 'rgba(104,166,255,0.28)';
const SHEET_FRAME_INSET = 12;
const MAX_WINK_RECIPIENTS = 20;

function formatDistance(km: number): string {
  if (km < 1) return 'unter 1 km entfernt';
  return `ca. ${Math.max(1, Math.round(km))} km entfernt`;
}

function formatUntil(expiresAt?: number | null): string | null {
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const date = new Date(expiresAt);
  return `bis ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function friendVibe(friend: NearbyFriend): string {
  const label = friend.vibeLabel?.trim() || friend.activity.trim();
  return !label || label.toLocaleLowerCase('de') === 'offen' ? 'Egal' : label;
}

function pluralizeFriends(count: number): string {
  return `${count} ${count === 1 ? 'Freund' : 'Freunde'}`;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text {...TEXT_FLEXIBLE} style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

function FriendRow({
  friend,
  selected,
  index,
  onToggle,
}: {
  friend: NearbyFriend;
  selected: boolean;
  index: number;
  onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const selectionProgress = useSharedValue(selected ? 1 : 0);
  const untilLabel = formatUntil(friend.expiresAt);
  const distanceLabel =
    friend.distanceKm === undefined ? 'Ohne Näheangabe' : formatDistance(friend.distanceKm);

  useEffect(() => {
    const next = selected ? 1 : 0;
    selectionProgress.value = reduceMotion
      ? next
      : withTiming(next, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, selected, selectionProgress]);

  const animatedSurface = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selectionProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.045)', 'rgba(59,130,246,0.16)'],
    ),
    borderColor: interpolateColor(
      selectionProgress.value,
      [0, 1],
      ['rgba(255,255,255,0.09)', 'rgba(88,151,255,0.58)'],
    ),
    transform: [{ scale: 1 - selectionProgress.value * 0.006 }],
  }));

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 6) * 35).duration(280)}
      layout={reduceMotion ? undefined : LinearTransition.duration(180)}
      style={[styles.friendSurface, animatedSurface]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={
          selected
            ? `${friend.displayName} aus Auswahl entfernen`
            : `${friend.displayName} auswählen`
        }
        accessibilityHint="Wählt die Person für eine spontane Runde aus"
        accessibilityState={{ checked: selected }}
        className="active:opacity-80"
        onPress={onToggle}
        style={styles.friendPressable}
      >
        <PersonAvatar
          avatarUrl={friend.avatarUrl}
          initials={friend.initials}
          size={44}
          backgroundColor="rgba(59,130,246,0.2)"
          initialsColor="#8BB8FF"
        />

        <View className="flex-1">
          <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={styles.friendName}>
            {friend.displayName}
          </Text>
          <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={styles.friendIntent}>
            {friendVibe(friend)}
            {untilLabel ? ` · ${untilLabel}` : ''}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Ionicons
              name={friend.distanceKm === undefined ? 'location-outline' : 'navigate-outline'}
              size={13}
              color="rgba(225,231,240,0.54)"
            />
            <Text {...TEXT_FLEXIBLE} numberOfLines={1} style={styles.friendDistance}>
              {distanceLabel}
            </Text>
          </View>
        </View>

        <View style={[styles.selectIndicator, selected && styles.selectIndicatorActive]}>
          <Ionicons
            name={selected ? 'checkmark' : 'add'}
            size={18}
            color={selected ? '#FFFFFF' : '#8BB8FF'}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function OwnStatusStrip({ onPress }: { onPress: () => void }) {
  const { isOpen, vibe, expiresAt, syncing, syncError } = useOpenStatus();
  const reduceMotion = useReducedMotion();
  const untilLabel = formatUntil(expiresAt);
  const summary = isOpen
    ? `${vibe?.label?.trim() || 'Egal'}${untilLabel ? ` · ${untilLabel}` : ''}`
    : 'Für Freunde gerade nicht sichtbar';

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(240)}
      style={[styles.ownStatusSurface, isOpen && styles.ownStatusSurfaceActive]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isOpen ? 'Eigenen Offen-Status bearbeiten' : 'Mich offen stellen'}
        accessibilityHint="Öffnet die Einstellungen für deinen Offen-Status"
        className="active:opacity-80"
        onPress={onPress}
        style={styles.ownStatusPressable}
      >
        <View style={[styles.statusIcon, isOpen && styles.statusIconActive]}>
          <Ionicons
            name={isOpen ? 'radio-button-on' : 'radio-button-off-outline'}
            size={19}
            color={isOpen ? '#FFFFFF' : '#8BB8FF'}
          />
        </View>
        <View className="flex-1">
          <Text {...TEXT_FLEXIBLE} style={styles.ownStatusTitle}>
            {syncing
              ? 'Status wird aktualisiert …'
              : isOpen
                ? 'Du bist offen'
                : 'Du bist nicht offen'}
          </Text>
          <Text
            {...TEXT_FLEXIBLE}
            numberOfLines={1}
            style={[styles.ownStatusSummary, syncError && styles.ownStatusError]}
          >
            {syncError ? 'Änderung fehlgeschlagen · erneut öffnen' : summary}
          </Text>
        </View>
        <Text {...TEXT_CAPPED} style={styles.ownStatusAction}>
          {isOpen ? 'Bearbeiten' : 'Offen stellen'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(219,229,244,0.42)" />
      </Pressable>
    </Animated.View>
  );
}

function OpeningRow({
  opening,
  joining,
  index,
  onJoin,
}: {
  opening: GroupOpening;
  joining: boolean;
  index: number;
  onJoin: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 5) * 45).duration(300)}
      layout={reduceMotion ? undefined : LinearTransition.duration(180)}
      style={styles.openingSurface}
    >
      <View className="flex-row items-center gap-3">
        <View className="flex-row">
          {opening.memberPreview.slice(0, 4).map((member, memberIndex) => (
            <View
              key={`${member.initials}-${memberIndex}`}
              style={[styles.previewAvatar, { marginLeft: memberIndex === 0 ? 0 : -9 }]}
            >
              <Text {...TEXT_CAPPED} style={styles.previewInitials}>
                {member.initials}
              </Text>
            </View>
          ))}
        </View>
        <View className="flex-1">
          <Text {...TEXT_FLEXIBLE} numberOfLines={2} style={styles.openingTitle}>
            {opening.title}
          </Text>
          <Text {...TEXT_FLEXIBLE} numberOfLines={2} style={styles.openingMeta}>
            {opening.memberCount} dabei{opening.vibe ? ` · ${opening.vibe}` : ''} · offen für dich
          </Text>
        </View>
      </View>

      <SquircleButton
        label={joining ? 'Runde wird geöffnet …' : 'Zur Runde dazustoßen'}
        color={OPEN_COLOR}
        size="md"
        disabled={joining}
        loading={joining}
        icon="enter-outline"
        accessibilityLabel={`Bei ${opening.title} dazustoßen`}
        onPress={onJoin}
      />
    </Animated.View>
  );
}

function LocationHint() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Standortzugriff in den Einstellungen erlauben"
      onPress={openLocationSettings}
      className="active:opacity-80"
      style={styles.locationHint}
    >
      <View style={styles.locationHintIcon}>
        <Ionicons name="location-outline" size={18} color="#F1B859" />
      </View>
      <View className="flex-1">
        <Text {...TEXT_FLEXIBLE} style={styles.locationHintTitle}>
          Entfernung nicht verfügbar
        </Text>
        <Text {...TEXT_FLEXIBLE} style={styles.locationHintBody}>
          Standortzugriff in den Einstellungen erlauben
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color="rgba(241,184,89,0.82)" />
    </Pressable>
  );
}

function EmptyFriendsState({
  reason,
  locationDenied,
  onAddFriends,
}: {
  reason: NonNullable<NearbySheetProps['emptyReason']>;
  locationDenied: boolean;
  onAddFriends?: () => void;
}) {
  if (reason === 'quiet' || (reason === 'out-of-range' && locationDenied)) return null;

  const icon =
    reason === 'no-friends'
      ? 'person-add-outline'
      : reason === 'none-open'
        ? 'moon-outline'
        : 'scan-outline';
  const title =
    reason === 'no-friends'
      ? 'Noch keine Freunde hier'
      : reason === 'none-open'
        ? 'Gerade ist niemand offen'
        : 'Niemand in diesem Umkreis';
  const body =
    reason === 'no-friends'
      ? 'Füge Freunde hinzu. Sobald jemand offen ist, erscheint die Person hier.'
      : reason === 'none-open'
        ? 'Sobald ein Freund Zeit hat, kannst du ihn hier direkt anwinken.'
        : 'Vergrößere den Radius, um weiter entfernte offene Freunde zu sehen.';

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.emptySurface}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color="#8BB8FF" />
      </View>
      <Text {...TEXT_FLEXIBLE} style={styles.emptyTitle}>
        {title}
      </Text>
      <Text {...TEXT_FLEXIBLE} style={styles.emptyBody}>
        {body}
      </Text>
      {reason === 'no-friends' && onAddFriends ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAddFriends}
          className="active:opacity-80"
          style={styles.addFriendsButton}
        >
          <Text {...TEXT_CAPPED} style={styles.addFriendsLabel}>
            Freunde hinzufügen
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function NearbySurfaceLayer() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.surfaceGlowTop} />
      <View style={styles.surfaceGlowBottom} />
    </View>
  );
}

export interface NearbySheetProps {
  visible: boolean;
  friends: NearbyFriend[];
  friendsWithoutLocation: NearbyFriend[];
  /** Open friends with a pin outside the current radius. */
  outsideRadiusCount?: number;
  emptyReason?: 'no-friends' | 'none-open' | 'out-of-range' | 'quiet';
  locationDenied?: boolean;
  onAddFriends?: () => void;
  onOpenStatus: () => void;
  onClose: () => void;
  onStartSpontaneousRound: (members: GroupMember[]) => Promise<boolean>;
  onJoinOpening: (opening: GroupOpening) => Promise<boolean>;
}

export function NearbySheet({
  visible,
  friends,
  friendsWithoutLocation,
  outsideRadiusCount = 0,
  emptyReason = 'out-of-range',
  locationDenied = false,
  onAddFriends,
  onOpenStatus,
  onClose,
  onStartSpontaneousRound,
  onJoinOpening,
}: NearbySheetProps) {
  const { groupOpenings, setOpeningsActive } = useActivityChat();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [joiningOpeningId, setJoiningOpeningId] = useState<string | null>(null);
  const joiningOpeningRef = useRef<string | null>(null);
  const interactionRevisionRef = useRef(0);

  const allFriends = useMemo(
    () => [...friends, ...friendsWithoutLocation],
    [friends, friendsWithoutLocation],
  );
  const validFriendIds = useMemo(
    () => new Set(allFriends.map((friend) => friend.id)),
    [allFriends],
  );
  const selectedCount = selected.size;
  const nearbyCount = friends.length;
  const withoutLocationCount = friendsWithoutLocation.length;
  const hasSelectableFriends = allFriends.length > 0;
  const showRadius = !locationDenied && (nearbyCount > 0 || outsideRadiusCount > 0);

  const headerDetails = [
    outsideRadiusCount > 0
      ? `${outsideRadiusCount} ${outsideRadiusCount === 1 ? 'weiterer' : 'weitere'} außerhalb`
      : null,
    withoutLocationCount > 0 ? `${withoutLocationCount} ohne Standort` : null,
  ].filter(Boolean);

  useEffect(() => {
    setOpeningsActive(visible);
    return () => setOpeningsActive(false);
  }, [visible, setOpeningsActive]);

  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => validFriendIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [validFriendIds]);

  useEffect(() => {
    if (!visible) {
      interactionRevisionRef.current += 1;
      setSelected(new Set());
      setStarting(false);
      setJoiningOpeningId(null);
      joiningOpeningRef.current = null;
    }
    startingRef.current = false;
  }, [visible]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size >= MAX_WINK_RECIPIENTS) {
        Alert.alert(
          'Bis zu 20 Freunde',
          'Eine spontane Runde kann höchstens 20 Freunde enthalten.',
        );
        return current;
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function dismiss() {
    interactionRevisionRef.current += 1;
    startingRef.current = false;
    setStarting(false);
    setJoiningOpeningId(null);
    joiningOpeningRef.current = null;
    onClose();
  }

  async function handleStartPlanning() {
    if (startingRef.current || selectedCount === 0) return;
    const members: GroupMember[] = allFriends
      .filter((friend) => selected.has(friend.id))
      .map((friend) => ({ id: friend.id, displayName: friend.displayName }));

    if (members.length !== selectedCount) {
      setSelected(new Set(members.map((member) => member.id)));
      Alert.alert(
        'Auswahl aktualisiert',
        'Mindestens ein Freund ist nicht mehr offen. Bitte prüfe deine Auswahl noch einmal.',
      );
      return;
    }

    const interactionRevision = interactionRevisionRef.current;
    startingRef.current = true;
    setStarting(true);
    try {
      const started = await onStartSpontaneousRound(members);
      if (started && interactionRevision === interactionRevisionRef.current) setSelected(new Set());
    } finally {
      if (interactionRevision === interactionRevisionRef.current) {
        startingRef.current = false;
        setStarting(false);
      }
    }
  }

  async function handleJoinOpening(opening: GroupOpening) {
    if (joiningOpeningRef.current) return;
    const interactionRevision = interactionRevisionRef.current;
    joiningOpeningRef.current = opening.id;
    setJoiningOpeningId(opening.id);
    try {
      await onJoinOpening(opening);
    } finally {
      if (interactionRevision === interactionRevisionRef.current) {
        joiningOpeningRef.current = null;
        setJoiningOpeningId(null);
      }
    }
  }

  const actionLabel =
    selectedCount === 0
      ? 'Freunde auswählen'
      : selectedCount === 1
        ? '1 Freund anwinken'
        : `${selectedCount} Freunde anwinken`;

  return (
    <FloatingSheet
      visible={visible}
      onRequestClose={dismiss}
      originColor="rgba(59,130,246,0.16)"
      originBorderColor="rgba(88,151,255,0.78)"
      borderColor={SHEET_BORDER_COLOR}
      frameInset={SHEET_FRAME_INSET}
      surfaceLayer={<NearbySurfaceLayer />}
      accessibilityLabel="Offene Freunde in deiner Nähe"
    >
      <View>
        <FloatingSheetHeader
          icon="people-outline"
          accent={OPEN_COLOR}
          surface={FLOATING_SHEET_SURFACE}
          title={`${pluralizeFriends(nearbyCount)} in deiner Nähe`}
          subtitle={headerDetails.length ? headerDetails.join(' · ') : 'Wer hat gerade Zeit?'}
          closeLabel="Offene Freunde schließen"
          onClose={dismiss}
        />

        <View style={styles.contentInset}>
          <OwnStatusStrip onPress={onOpenStatus} />
          {showRadius ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.radiusSurface}>
              <View className="mb-1 flex-row items-center justify-between">
                <Text {...TEXT_FLEXIBLE} style={styles.radiusTitle}>
                  Dein Umkreis
                </Text>
                {outsideRadiusCount > 0 ? (
                  <Text {...TEXT_FLEXIBLE} style={styles.radiusHint}>
                    {outsideRadiusCount} außerhalb
                  </Text>
                ) : null}
              </View>
              <RadiusSlider compact />
            </Animated.View>
          ) : null}
          {locationDenied ? <LocationHint /> : null}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {friends.length ? (
            <View className="gap-2">
              <SectionLabel>In deiner Nähe</SectionLabel>
              {friends.map((friend, index) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  selected={selected.has(friend.id)}
                  index={index}
                  onToggle={() => toggle(friend.id)}
                />
              ))}
            </View>
          ) : (
            <EmptyFriendsState
              reason={emptyReason}
              locationDenied={locationDenied}
              onAddFriends={onAddFriends}
            />
          )}

          {friendsWithoutLocation.length ? (
            <View className="mt-4 gap-2">
              <SectionLabel>Ohne Standort</SectionLabel>
              <Text {...TEXT_FLEXIBLE} style={styles.sectionHint}>
                Diese Freunde sind offen, teilen aber gerade keine Entfernung.
              </Text>
              {friendsWithoutLocation.map((friend, index) => (
                <FriendRow
                  key={friend.id}
                  friend={friend}
                  selected={selected.has(friend.id)}
                  index={friends.length + index}
                  onToggle={() => toggle(friend.id)}
                />
              ))}
            </View>
          ) : null}

          {groupOpenings.length ? (
            <View className="mt-5 gap-2.5">
              <SectionLabel>Offene Runden</SectionLabel>
              <Text {...TEXT_FLEXIBLE} style={styles.sectionHint}>
                Diese Gruppen haben ausdrücklich Platz für weitere Freunde.
              </Text>
              {groupOpenings.map((opening, index) => (
                <OpeningRow
                  key={opening.id}
                  opening={opening}
                  joining={joiningOpeningId === opening.id}
                  index={index}
                  onJoin={() => void handleJoinOpening(opening)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>

        {hasSelectableFriends ? (
          <View style={styles.footer}>
            <Text {...TEXT_FLEXIBLE} style={styles.footerHint}>
              {selectedCount === 0
                ? 'Tippe auf Freunde, die du spontan sehen möchtest.'
                : 'Nur die ausgewählten Freunde erhalten deinen Wink.'}
            </Text>
            <SquircleButton
              label={actionLabel}
              color={OPEN_COLOR}
              icon="hand-left-outline"
              disabled={selectedCount === 0 || starting}
              loading={starting}
              onPress={handleStartPlanning}
            />
          </View>
        ) : null}
      </View>
    </FloatingSheet>
  );
}

const styles = StyleSheet.create({
  contentInset: {
    gap: 10,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  sectionLabel: {
    color: 'rgba(237,243,251,0.72)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    letterSpacing: 0.8,
    lineHeight: TYPE.caption.lineHeight,
    textTransform: 'uppercase',
  },
  sectionHint: {
    color: 'rgba(222,230,241,0.58)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: 17,
    marginBottom: 2,
  },
  friendSurface: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  friendPressable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  friendName: {
    color: '#F4F7FB',
    fontFamily: FONT.semibold,
    fontSize: TYPE.body.fontSize,
    lineHeight: TYPE.body.lineHeight,
  },
  friendIntent: {
    color: 'rgba(229,236,246,0.7)',
    fontFamily: FONT.medium,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
    marginTop: 1,
  },
  friendDistance: {
    color: 'rgba(225,231,240,0.54)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  selectIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(119,169,255,0.38)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  selectIndicatorActive: {
    backgroundColor: OPEN_COLOR,
    borderColor: '#6CA4FF',
  },
  ownStatusSurface: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ownStatusSurfaceActive: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(91,153,255,0.4)',
  },
  ownStatusPressable: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  statusIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderColor: 'rgba(105,164,255,0.3)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  statusIconActive: {
    backgroundColor: OPEN_COLOR,
    borderColor: '#74AAFF',
  },
  ownStatusTitle: {
    color: '#F4F7FB',
    fontFamily: FONT.semibold,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
  },
  ownStatusSummary: {
    color: 'rgba(222,231,243,0.62)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
    marginTop: 2,
  },
  ownStatusError: {
    color: '#F1B859',
  },
  ownStatusAction: {
    color: '#8BB8FF',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  radiusSurface: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  radiusTitle: {
    color: 'rgba(239,244,251,0.78)',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  radiusHint: {
    color: '#8BB8FF',
    fontFamily: FONT.semibold,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  locationHint: {
    alignItems: 'center',
    backgroundColor: 'rgba(224,162,62,0.09)',
    borderColor: 'rgba(224,162,62,0.34)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  locationHintIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(224,162,62,0.12)',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  locationHintTitle: {
    color: '#F4F0E7',
    fontFamily: FONT.semibold,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
  },
  locationHintBody: {
    color: 'rgba(237,226,208,0.62)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: 17,
    marginTop: 1,
  },
  emptySurface: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(83,146,250,0.26)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginBottom: 11,
    width: 44,
  },
  emptyTitle: {
    color: '#F3F6FB',
    fontFamily: FONT.semibold,
    fontSize: TYPE.body.fontSize,
    lineHeight: TYPE.body.lineHeight,
    textAlign: 'center',
  },
  emptyBody: {
    color: 'rgba(223,231,242,0.58)',
    fontFamily: FONT.medium,
    fontSize: TYPE.label.fontSize,
    lineHeight: 20,
    marginTop: 5,
    textAlign: 'center',
  },
  addFriendsButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(59,130,246,0.16)',
    borderColor: 'rgba(95,157,255,0.42)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  addFriendsLabel: {
    color: '#A7C8FF',
    fontFamily: FONT.semibold,
    fontSize: TYPE.label.fontSize,
    lineHeight: TYPE.label.lineHeight,
  },
  openingSurface: {
    backgroundColor: 'rgba(59,130,246,0.09)',
    borderColor: 'rgba(91,153,255,0.28)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 13,
    padding: 14,
  },
  previewAvatar: {
    alignItems: 'center',
    backgroundColor: '#15263E',
    borderColor: '#101823',
    borderRadius: 20,
    borderWidth: 2,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  previewInitials: {
    color: '#9EC1FA',
    fontFamily: FONT.bold,
    fontSize: TYPE.caption.fontSize,
    lineHeight: TYPE.caption.lineHeight,
  },
  openingTitle: {
    color: '#F4F7FB',
    fontFamily: FONT.semibold,
    fontSize: TYPE.body.fontSize,
    lineHeight: TYPE.body.lineHeight,
  },
  openingMeta: {
    color: 'rgba(225,233,244,0.62)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: 17,
    marginTop: 2,
  },
  footer: {
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: 1,
    gap: 9,
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerHint: {
    color: 'rgba(221,229,240,0.56)',
    fontFamily: FONT.medium,
    fontSize: TYPE.caption.fontSize,
    lineHeight: 17,
    textAlign: 'center',
  },
  surfaceGlowTop: {
    backgroundColor: 'rgba(59,130,246,0.055)',
    borderRadius: 180,
    height: 280,
    position: 'absolute',
    right: -130,
    top: -145,
    width: 280,
  },
  surfaceGlowBottom: {
    backgroundColor: 'rgba(83,122,196,0.035)',
    borderRadius: 150,
    bottom: -130,
    height: 250,
    left: -120,
    position: 'absolute',
    width: 250,
  },
});
