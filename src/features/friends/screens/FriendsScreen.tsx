import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, Share, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/features/auth';
import { CirclesSection } from '@/features/circles';
import {
  FriendCodeSheet,
  useFriends,
  type FriendProfile,
  type FriendRequest,
  type PeopleSearchProfile,
} from '@/features/friends';
import { usePushNudge } from '@/features/notifications';
import { FriendScanScreen } from './FriendScanScreen';
import {
  AppScreen,
  AppStateView,
  AppText,
  loaderSizeForIcon,
  ScreenHeader,
  TogetherLoader,
} from '@/shared/components';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { buildInviteLink } from '@/shared/utils/inviteLink';

const ACCENT = '#3B82F6';

/**
 * Every piece of text on this screen used to be sized and weighted with
 * Tailwind classes alone (`text-sm font-extrabold`). With static font files a
 * weight class without a `fontFamily` renders the SYSTEM font, so the whole
 * screen sat in a different typeface than the rest of the app — visible
 * immediately, hard to name. Sizes come from the scale, weights from `FONT`,
 * and colours stay on className where light/dark resolves for free.
 */
const TEXT = {
  /** A person's name as the headline of a card. */
  personTitle: { ...TYPE.body, fontFamily: FONT.bold },
  /** A person's name in a plain list row. */
  personRow: { ...TYPE.body, fontFamily: FONT.semibold },
  /** The line under a name: relationship state, handle, count. */
  meta: { ...TYPE.label, fontFamily: FONT.medium },
  /** Section titles inside the dark add-friends card. */
  cardTitle: { ...TYPE.body, fontFamily: FONT.bold },
  /** Explanatory copy, search results, error and feedback lines. */
  note: { ...TYPE.label, fontFamily: FONT.semibold },
  /** The quiet layer: hints and the privacy note. */
  fine: { ...TYPE.caption, fontFamily: FONT.medium },
  /** Primary button labels. */
  action: { ...TYPE.label, fontFamily: FONT.bold },
  /** Secondary button labels. */
  actionQuiet: { ...TYPE.label, fontFamily: FONT.semibold },
  /** Labels inside pills and chips. */
  pill: { ...TYPE.caption, fontFamily: FONT.semibold },
  /** Avatar initials. */
  initials: { ...TYPE.label, fontFamily: FONT.bold },
  /** Text fields. */
  input: { ...TYPE.body, fontFamily: FONT.medium },
  inputCompact: { ...TYPE.label, fontFamily: FONT.medium },
} as const;
const MIN_PEOPLE_SEARCH_LENGTH = 3;
const PEOPLE_SEARCH_CACHE_MS = 5 * 60 * 1000;
const PEOPLE_SEARCH_CACHE_LIMIT = 20;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,29}$/;

function Avatar({ friend, size = 'h-11 w-11' }: { friend: FriendProfile; size?: string }) {
  return (
    <View
      className={`${size} items-center justify-center overflow-hidden rounded-full`}
      style={{ backgroundColor: `${ACCENT}1F` }}
    >
      {friend.avatarUrl ? (
        <Image source={{ uri: friend.avatarUrl }} className="h-full w-full" />
      ) : (
        <Text {...TEXT_CAPPED} style={{ ...TEXT.initials, color: ACCENT }}>
          {friend.initials}
        </Text>
      )}
    </View>
  );
}

function matches(query: string, friend: FriendProfile) {
  const needle = query.trim().toLowerCase();
  return (
    !needle ||
    friend.displayName.toLowerCase().includes(needle) ||
    (friend.username?.toLowerCase().includes(needle) ?? false)
  );
}

function RequestRow({
  request,
  busy,
  onRespond,
  onWithdraw,
}: {
  request: FriendRequest;
  busy: boolean;
  onRespond: (accept: boolean) => void;
  /** Only passed for outgoing rows — an incoming request is not yours to take back. */
  onWithdraw?: () => void;
}) {
  const incoming = request.direction === 'incoming';
  return (
    <View className="rounded-[24px] border border-primary/20 bg-primary/5 p-4">
      <View className="flex-row items-center gap-3">
        <Avatar friend={request.friend} />
        <View className="min-w-0 flex-1">
          <Text
            {...TEXT_FLEXIBLE}
            className="text-foreground"
            numberOfLines={1}
            style={TEXT.personTitle}
          >
            {request.friend.displayName}
          </Text>
          <Text {...TEXT_FLEXIBLE} className="mt-0.5 text-muted-foreground" style={TEXT.meta}>
            {incoming ? 'möchte mit dir befreundet sein' : 'Anfrage gesendet'}
          </Text>
        </View>
        {incoming ? (
          <Ionicons name="person-add-outline" size={21} color={ACCENT} />
        ) : onWithdraw ? (
          /* The way back out sits where the eye ends the row, and it replaces
             the clock rather than joining it: an icon that only says "waiting"
             next to a control that can end the waiting is one element too many.
             Muted, never red — taking back your own request is a correction,
             not a destruction. */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Anfrage an ${request.friend.displayName} zurückziehen`}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            hitSlop={6}
            className="min-h-10 flex-row items-center justify-center gap-1.5 rounded-2xl border border-border px-3 active:opacity-70"
            style={{ opacity: busy ? 0.6 : 1 }}
            onPress={onWithdraw}
          >
            {busy ? (
              <TogetherLoader accessibilityLabel="" color="#93939B" size={loaderSizeForIcon(15)} />
            ) : (
              <Ionicons name="close" size={15} color="#93939B" />
            )}
            <Text {...TEXT_CAPPED} className="text-muted-foreground" style={TEXT.pill}>
              Zurückziehen
            </Text>
          </Pressable>
        ) : (
          <Ionicons name="time-outline" size={21} color="#93939B" />
        )}
      </View>
      {incoming ? (
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            className="min-h-11 flex-1 items-center justify-center rounded-2xl bg-secondary active:opacity-70"
            onPress={() => onRespond(false)}
          >
            <Text {...TEXT_CAPPED} className="text-muted-foreground" style={TEXT.actionQuiet}>
              Ablehnen
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            className="min-h-11 flex-1 items-center justify-center rounded-2xl active:opacity-85"
            style={{ backgroundColor: ACCENT }}
            onPress={() => onRespond(true)}
          >
            <Text {...TEXT_CAPPED} className="text-white" style={TEXT.action}>
              Annehmen
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type SearchRelationship =
  | { state: 'friends' }
  | { state: 'outgoing' }
  | { state: 'incoming'; requestId: string }
  | { state: 'none' };

function PeopleSearchRow({
  person,
  relationship,
  busy,
  onSend,
  onAccept,
  onWithdraw,
}: {
  person: PeopleSearchProfile;
  relationship: SearchRelationship;
  busy: boolean;
  onSend: () => void;
  onAccept: () => void;
  onWithdraw: () => void;
}) {
  /**
   * "Gesendet" used to sit here as a dead, greyed-out pill — the state was
   * stated and nothing could be done about it, so a mistyped name had to be
   * hunted down in the list below. The slot now carries the action instead;
   * that you sent it is implied by being able to take it back.
   */
  const action =
    relationship.state === 'friends'
      ? { label: 'Freunde', icon: 'checkmark' as const, disabled: true, onPress: onSend }
      : relationship.state === 'outgoing'
        ? { label: 'Zurückziehen', icon: 'close' as const, disabled: busy, onPress: onWithdraw }
        : relationship.state === 'incoming'
          ? { label: 'Annehmen', icon: 'checkmark' as const, disabled: busy, onPress: onAccept }
          : {
              label: 'Anfragen',
              icon: 'person-add-outline' as const,
              disabled: busy,
              onPress: onSend,
            };
  // Withdrawing is a correction, not the row's purpose — it must not wear the
  // same solid fill as "Anfragen", which is what the search is actually for.
  const quiet = relationship.state === 'outgoing';
  return (
    <View className="flex-row items-center gap-3 rounded-[18px] bg-white/[0.07] px-3 py-2.5">
      <Avatar friend={person} size="h-10 w-10" />
      <View className="min-w-0 flex-1">
        <Text
          {...TEXT_FLEXIBLE}
          className="text-white"
          numberOfLines={1}
          style={TEXT.personRow}
        >
          {person.displayName}
        </Text>
        <Text {...TEXT_FLEXIBLE} className="mt-0.5 text-white/55" numberOfLines={1} style={TEXT.fine}>
          @{person.username}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${person.displayName}: ${action.label}`}
        accessibilityState={{ busy: busy && !action.disabled, disabled: action.disabled }}
        disabled={action.disabled}
        className={`min-h-10 flex-row items-center justify-center gap-1.5 rounded-xl px-3 active:opacity-80 ${
          quiet ? 'border border-white/20' : 'bg-white'
        }`}
        style={{ opacity: action.disabled ? 0.55 : 1 }}
        onPress={action.onPress}
      >
        <Ionicons name={action.icon} size={15} color={quiet ? '#FFFFFFB8' : '#101923'} />
        <Text
          {...TEXT_CAPPED}
          className={quiet ? 'text-white/70' : 'text-[#101923]'}
          style={TEXT.pill}
        >
          {action.label}
        </Text>
      </Pressable>
    </View>
  );
}

function FriendRow({
  friend,
  isClose,
  onToggleClose,
  onRemove,
}: {
  friend: FriendProfile;
  isClose: boolean;
  onToggleClose: () => void;
  onRemove: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-[22px] border border-border bg-card px-4 py-3 shadow-sm">
      <Avatar friend={friend} />
      <View className="flex-1">
        <Text {...TEXT_FLEXIBLE} className="text-foreground" style={TEXT.personRow}>
          {friend.displayName}
        </Text>
        <Text {...TEXT_FLEXIBLE} className="mt-0.5 text-muted-foreground" style={TEXT.meta}>
          {friend.username ? `@${friend.username}` : 'Bestätigte Freundschaft'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isClose
            ? `${friend.displayName} nicht mehr als enge Freund:in markieren`
            : `${friend.displayName} als enge Freund:in markieren`
        }
        accessibilityState={{ selected: isClose }}
        hitSlop={8}
        onPress={onToggleClose}
      >
        <Ionicons
          name={isClose ? 'star' : 'star-outline'}
          size={22}
          color={isClose ? '#E0A23E' : '#8E8C91'}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${friend.displayName} entfernen`}
        hitSlop={8}
        onPress={onRemove}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color="#8E8C91" />
      </Pressable>
    </View>
  );
}

export function FriendsScreen() {
  const { user } = useAuth();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    closeFriendUids,
    closeFriends,
    friendRequestPolicy,
    sendFriendRequest,
    searchPeople,
    respondToFriendRequest,
    withdrawFriendRequest,
    removeFriend,
    toggleCloseFriend,
  } = useFriends();
  const { maybeAskForPush } = usePushNudge();
  const [query, setQuery] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');
  const [people, setPeople] = useState<PeopleSearchProfile[]>([]);
  const [peopleSearchBusy, setPeopleSearchBusy] = useState(false);
  const [peopleSearchError, setPeopleSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [codeVisible, setCodeVisible] = useState(false);
  const [scanVisible, setScanVisible] = useState(false);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const respondingRequestRef = useRef<string | null>(null);
  const [withdrawingUid, setWithdrawingUid] = useState<string | null>(null);
  const withdrawingUidRef = useRef<string | null>(null);
  const peopleSearchRequestRef = useRef(0);
  const peopleSearchCacheRef = useRef<
    Map<string, { expiresAt: number; people: PeopleSearchProfile[] }>
  >(new Map());
  const normalizedPeopleQuery = peopleQuery.trim().replace(/^@+/, '').toLocaleLowerCase('de-DE');
  const explicitHandleSearch = peopleQuery.trim().startsWith('@');
  const minimumPeopleSearchLength = explicitHandleSearch ? 2 : MIN_PEOPLE_SEARCH_LENGTH;
  /**
   * A removed row leaves on the tap, not when the server answers.
   *
   * `removeFriend` is a callable plus a friendship refresh — a second or two,
   * more on a cold start — and the row used to sit there unchanged for all of
   * it, right after a confirm dialog said it would go. If the write fails the
   * row comes back and an error appears; that reappearance IS the message.
   */
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const removingUidRef = useRef<string | null>(null);
  const visibleFriends = useMemo(
    () => (removingUid ? friends.filter((friend) => friend.uid !== removingUid) : friends),
    [friends, removingUid],
  );
  const visibleCloseFriends = useMemo(
    () => (removingUid ? closeFriends.filter((friend) => friend.uid !== removingUid) : closeFriends),
    [closeFriends, removingUid],
  );
  const filteredFriends = useMemo(
    () => visibleFriends.filter((friend) => matches(query, friend)),
    [visibleFriends, query],
  );
  const peopleRelationships = useMemo(() => {
    const byUid = new Map<string, SearchRelationship>();
    friends.forEach((friend) => byUid.set(friend.uid, { state: 'friends' }));
    outgoingRequests.forEach((request) => byUid.set(request.friend.uid, { state: 'outgoing' }));
    incomingRequests.forEach((request) =>
      byUid.set(request.friend.uid, { state: 'incoming', requestId: request.id }),
    );
    return byUid;
  }, [friends, incomingRequests, outgoingRequests]);

  useEffect(() => {
    if (typeof add === 'string' && add.trim()) setPeopleQuery(`@${add.trim().replace(/^@/, '')}`);
  }, [add]);

  useEffect(() => {
    const requestId = ++peopleSearchRequestRef.current;
    if (normalizedPeopleQuery.length < minimumPeopleSearchLength) {
      setPeople([]);
      setPeopleSearchBusy(false);
      setPeopleSearchError(null);
      return;
    }
    const cached = peopleSearchCacheRef.current.get(normalizedPeopleQuery);
    if (cached && cached.expiresAt > Date.now()) {
      setPeople(cached.people);
      setPeopleSearchBusy(false);
      setPeopleSearchError(null);
      return;
    }
    setPeople([]);
    setPeopleSearchError(null);
    const timeout = setTimeout(() => {
      setPeopleSearchBusy(true);
      void searchPeople(peopleQuery)
        .then((next) => {
          if (requestId !== peopleSearchRequestRef.current) return;
          const cache = peopleSearchCacheRef.current;
          cache.set(normalizedPeopleQuery, {
            expiresAt: Date.now() + PEOPLE_SEARCH_CACHE_MS,
            people: next,
          });
          while (cache.size > PEOPLE_SEARCH_CACHE_LIMIT) {
            cache.delete(cache.keys().next().value as string);
          }
          setPeople(next);
        })
        .catch((error) => {
          if (requestId !== peopleSearchRequestRef.current) return;
          setPeople([]);
          setPeopleSearchError(
            error instanceof Error ? error.message : 'Die Suche ist gerade nicht verfügbar.',
          );
        })
        .finally(() => {
          if (requestId === peopleSearchRequestRef.current) setPeopleSearchBusy(false);
        });
    }, 350);
    return () => clearTimeout(timeout);
  }, [minimumPeopleSearchLength, normalizedPeopleQuery, peopleQuery, searchPeople]);

  /**
   * The ask is the safety net, so the pill itself needs none — no red, no
   * long-press. It also names what happens NEXT ("du kannst später erneut
   * anfragen"), because the fear that stops people undoing something is
   * usually that the door closes behind them.
   */
  function confirmWithdraw(person: { uid: string; displayName: string }) {
    if (withdrawingUidRef.current) return;
    Alert.alert(
      'Anfrage zurückziehen?',
      `${person.displayName} sieht deine Freundschaftsanfrage dann nicht mehr. Du kannst später erneut anfragen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurückziehen', onPress: () => void withdraw(person) },
      ],
    );
  }

  async function withdraw(person: { uid: string; displayName: string }) {
    if (withdrawingUidRef.current) return;
    withdrawingUidRef.current = person.uid;
    setWithdrawingUid(person.uid);
    setFeedback(null);
    try {
      await withdrawFriendRequest(person.uid);
      setFeedback(`Anfrage an ${person.displayName} zurückgezogen.`);
    } catch (error) {
      // The callable answers in German, including its per-person daily cap.
      setFeedback(
        error instanceof Error ? error.message : 'Die Anfrage konnte nicht zurückgezogen werden.',
      );
    } finally {
      withdrawingUidRef.current = null;
      setWithdrawingUid(null);
    }
  }

  async function addFriend(username: string) {
    const value = username.trim().replace(/^@/, '').toLocaleLowerCase('de-DE');
    if (!value || busy) return;
    if (!USERNAME_RE.test(value)) {
      setFeedback(
        'Nutzernamen haben 2–30 Zeichen und verwenden nur Buchstaben, Zahlen, Punkt, _ oder - .',
      );
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendFriendRequest(value);
      setPeopleQuery('');
      setPeople([]);
      setFeedback(
        result.state === 'sent'
          ? `Anfrage an ${result.friend.displayName} gesendet.`
          : result.state === 'already_friends'
            ? `Ihr seid bereits befreundet.`
            : `${result.friend.displayName} hat dir bereits eine Anfrage geschickt – bestätige sie oben.`,
      );
      // The moment an answer is pending is the moment this permission finally
      // has an obvious reason. Asks once per device at most.
      if (result.state === 'sent') void maybeAskForPush();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Die Anfrage konnte nicht gesendet werden.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function respond(requestId: string, accept: boolean) {
    if (respondingRequestRef.current) return;
    respondingRequestRef.current = requestId;
    setRespondingRequestId(requestId);
    try {
      await respondToFriendRequest(requestId, accept);
      if (accept) void maybeAskForPush();
    } catch (error) {
      Alert.alert(
        'Anfrage konnte nicht bearbeitet werden',
        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
      );
    } finally {
      respondingRequestRef.current = null;
      setRespondingRequestId(null);
    }
  }

  function confirmRemoval(friend: FriendProfile) {
    Alert.alert(
      'Aus Freunden entfernen?',
      `${friend.displayName} sieht neue Activities von dir danach nicht mehr. Gemeinsame, bereits beigetretene Pläne bleiben bis zu ihrem Ende erhalten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: () => void remove(friend),
        },
      ],
    );
  }

  async function remove(friend: FriendProfile) {
    if (removingUidRef.current) return;
    removingUidRef.current = friend.uid;
    setRemovingUid(friend.uid);
    setFeedback(null);
    try {
      await removeFriend(friend.uid);
      setFeedback(`${friend.displayName} ist nicht mehr in deinen Freunden.`);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Der Freund konnte nicht entfernt werden.',
      );
    } finally {
      removingUidRef.current = null;
      // Safe here: removeFriend awaits refreshFriendships, so the real list and
      // this reset land in the same render — the row never flickers back.
      setRemovingUid(null);
    }
  }

  async function shareHandle() {
    const handle = user?.username?.trim();
    // Same link the QR code carries: a bare handle makes the recipient search
    // for it by hand, which is the step the invite exists to remove.
    if (handle) {
      await Share.share({
        message: `Füge mich bei Mica hinzu: @${handle}\n${buildInviteLink(handle)}`,
      });
    }
  }

  return (
    <AppScreen scroll contentClassName="px-5 pb-9 pt-3">
      <View className="flex-1 gap-7">
        <ScreenHeader
          title="Freunde"
          subtitle="Dein privates Netzwerk"
          onBack={() => router.back()}
        />
        <View className="overflow-hidden rounded-[28px] bg-[#101923] p-5 shadow-lg">
          <View
            pointerEvents="none"
            className="absolute -right-8 -top-10 h-36 w-36 rounded-full"
            style={{ backgroundColor: `${ACCENT}28` }}
          />
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <Ionicons name="person-add-outline" size={21} color="#fff" />
            </View>
            <View className="flex-1">
              <Text {...TEXT_FLEXIBLE} className="text-white" style={TEXT.cardTitle}>
                Freunde hinzufügen
              </Text>
              <Text {...TEXT_FLEXIBLE} className="mt-1 text-white/55" style={TEXT.meta}>
                Suche nach Name oder @Nutzername. Erst nach Annahme entstehen Sichtbarkeit und
                Chat-Zugriff.
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row items-center gap-2 rounded-[20px] bg-white/[0.09] p-2">
            <Ionicons name="search-outline" size={19} color="rgba(255,255,255,0.52)" />
            <TextInput
              className="min-h-10 flex-1 text-white"
              style={TEXT.input}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Name oder @nutzername"
              placeholderTextColor="rgba(255,255,255,0.42)"
              value={peopleQuery}
              onChangeText={setPeopleQuery}
              maxLength={50}
            />
            {peopleSearchBusy ? (
              <TogetherLoader color="#BFCBFF" size={loaderSizeForIcon(20)} />
            ) : peopleQuery ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Personensuche löschen"
                className="h-10 w-10 items-center justify-center rounded-[14px]"
                onPress={() => setPeopleQuery('')}
              >
                <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.6)" />
              </Pressable>
            ) : null}
          </View>
          {normalizedPeopleQuery.length > 0 &&
          normalizedPeopleQuery.length < minimumPeopleSearchLength ? (
            <Text {...TEXT_FLEXIBLE} className="mt-3 text-white/55" style={TEXT.fine}>
              {explicitHandleSearch
                ? 'Ein @Nutzername braucht mindestens zwei Zeichen.'
                : 'Gib mindestens drei Zeichen ein.'}
            </Text>
          ) : null}
          {people.length ? (
            <View className="mt-3 gap-2">
              {people.map((person) => {
                const relationship = peopleRelationships.get(person.uid) ?? {
                  state: 'none' as const,
                };
                return (
                  <PeopleSearchRow
                    key={person.uid}
                    person={person}
                    relationship={relationship}
                    busy={
                      busy ||
                      withdrawingUid === person.uid ||
                      (relationship.state === 'incoming' &&
                        respondingRequestId === relationship.requestId)
                    }
                    onSend={() => void addFriend(person.username)}
                    onWithdraw={() => confirmWithdraw(person)}
                    onAccept={() => {
                      if (relationship.state === 'incoming') {
                        void respond(relationship.requestId, true);
                      }
                    }}
                  />
                );
              })}
            </View>
          ) : null}
          {peopleSearchError ? (
            <Text {...TEXT_FLEXIBLE} className="mt-3 text-white/70" style={TEXT.note}>
              {peopleSearchError}
            </Text>
          ) : null}
          {normalizedPeopleQuery.length >= minimumPeopleSearchLength &&
          !peopleSearchBusy &&
          !peopleSearchError &&
          people.length === 0 ? (
            <Text {...TEXT_FLEXIBLE} className="mt-3 text-white/55" style={TEXT.note}>
              Keine passende Person gefunden.
            </Text>
          ) : null}
          {feedback ? (
            <Text {...TEXT_FLEXIBLE} className="mt-3 text-white/70" style={TEXT.note}>
              {feedback}
            </Text>
          ) : null}
          {/* Scanning is about sending a request, not about being findable, so
              it stays available whatever your own request policy is. */}
          <View className="mt-4 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2 active:opacity-70"
              onPress={() => setScanVisible(true)}
            >
              <Ionicons name="scan-outline" size={16} color="#BFCBFF" />
              <Text {...TEXT_CAPPED} className="text-white/80" style={TEXT.pill}>
                Code scannen
              </Text>
            </Pressable>
          </View>
          {user?.username && friendRequestPolicy === 'anyone' ? (
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2 active:opacity-70"
                onPress={() => setCodeVisible(true)}
              >
                <Ionicons name="qr-code-outline" size={16} color="#BFCBFF" />
                <Text {...TEXT_CAPPED} className="text-white/80" style={TEXT.pill}>
                  Mein QR-Code
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2 active:opacity-70"
                onPress={() => void shareHandle()}
              >
                <Ionicons name="share-outline" size={16} color="#BFCBFF" />
                <Text {...TEXT_CAPPED} className="text-white/80" style={TEXT.pill}>
                  @{user.username} teilen
                </Text>
              </Pressable>
            </View>
          ) : user?.username ? (
            <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-white/[0.07] px-3 py-2.5">
              <Ionicons name="shield-checkmark-outline" size={17} color="#BFCBFF" />
              <Text {...TEXT_FLEXIBLE} className="flex-1 text-white/65" style={TEXT.fine}>
                Dein QR-Code ist ausgeblendet, weil du neue Anfragen in deinen Privatsphäre-
                Einstellungen eingeschränkt hast.
              </Text>
            </View>
          ) : null}
        </View>
        {incomingRequests.length ? (
          <View className="gap-2.5">
            <AppText variant="label">Anfragen</AppText>
            {incomingRequests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                busy={respondingRequestId === request.id}
                onRespond={(accept) => void respond(request.id, accept)}
              />
            ))}
          </View>
        ) : null}
        {outgoingRequests.length ? (
          <View className="gap-2.5">
            <AppText variant="label">Gesendet</AppText>
            {outgoingRequests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                busy={withdrawingUid === request.friend.uid}
                onRespond={() => {}}
                onWithdraw={() => confirmWithdraw(request.friend)}
              />
            ))}
          </View>
        ) : null}
        {visibleCloseFriends.length ? (
          <View className="gap-2.5">
            <AppText variant="label">Enge Freunde</AppText>
            <View className="flex-row flex-wrap gap-2">
              {visibleCloseFriends.map((friend) => (
                <View
                  key={friend.uid}
                  className="flex-row items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3"
                >
                  <Avatar friend={friend} size="h-8 w-8" />
                  <Text {...TEXT_CAPPED} className="text-foreground" style={TEXT.actionQuiet}>
                    {friend.displayName}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View className="gap-2.5">
          <View className="flex-row items-center justify-between">
            <AppText variant="label">Alle Freunde</AppText>
            <Text {...TEXT_FLEXIBLE} className="text-muted-foreground" style={TEXT.actionQuiet}>
              {visibleFriends.length}
            </Text>
          </View>
          {visibleFriends.length ? (
            <View className="min-h-13 flex-row items-center gap-3 rounded-[20px] border border-border bg-card px-4">
              <Ionicons name="search-outline" size={19} color="#8F8B84" />
              <TextInput
                className="flex-1 py-3 text-foreground"
                style={TEXT.inputCompact}
                placeholder="Freunde durchsuchen"
                placeholderTextColor="rgba(143,139,132,0.8)"
                value={query}
                onChangeText={setQuery}
              />
              {query ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Suche löschen"
                  onPress={() => setQuery('')}
                >
                  <Ionicons name="close-circle" size={18} color="#A19D96" />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {visibleFriends.length === 0 ? (
            <AppStateView
              compact
              icon="people-outline"
              title="Dein Netzwerk beginnt hier"
              description="Sende einer Person eine Freundschaftsanfrage. Erst nach ihrer Annahme sieht sie deine Activities."
            />
          ) : filteredFriends.length === 0 ? (
            <AppStateView
              compact
              icon="search-outline"
              title="Keine Treffer"
              description={`Für „${query}“ wurde niemand gefunden.`}
            />
          ) : (
            <View className="gap-2">
              {filteredFriends.map((friend) => (
                <FriendRow
                  key={friend.uid}
                  friend={friend}
                  isClose={closeFriendUids.includes(friend.uid)}
                  onToggleClose={() => {
                    void toggleCloseFriend(friend.uid).catch((error) =>
                      Alert.alert(
                        'Nicht möglich',
                        error instanceof Error ? error.message : 'Bitte versuche es erneut.',
                      ),
                    );
                  }}
                  onRemove={() => confirmRemoval(friend)}
                />
              ))}
            </View>
          )}
        </View>
        <CirclesSection />
      </View>
      {user?.username && friendRequestPolicy === 'anyone' ? (
        <FriendCodeSheet
          visible={codeVisible}
          username={user.username}
          onClose={() => setCodeVisible(false)}
        />
      ) : null}
      {/* Full screen, not a sheet: a camera preview in a small centred card is
          unusable. Mounted only while open so the camera never runs idle. */}
      <Modal
        visible={scanVisible}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setScanVisible(false)}
      >
        <FriendScanScreen onClose={() => setScanVisible(false)} />
      </Modal>
    </AppScreen>
  );
}
