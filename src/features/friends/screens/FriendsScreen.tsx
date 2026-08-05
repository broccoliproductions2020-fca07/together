import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, Share, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/features/auth';
import { CirclesSection } from '@/features/circles';
import {
  FriendCodeSheet,
  useFriends,
  type FriendProfile,
  type FriendRequest,
} from '@/features/friends';
import { AppScreen, AppStateView, AppText, ScreenHeader } from '@/shared/components';

const ACCENT = '#6E8BF7';

function Avatar({ friend, size = 'h-11 w-11' }: { friend: FriendProfile; size?: string }) {
  return (
    <View
      className={`${size} items-center justify-center overflow-hidden rounded-full`}
      style={{ backgroundColor: `${ACCENT}1F` }}
    >
      {friend.avatarUrl ? (
        <Image source={{ uri: friend.avatarUrl }} className="h-full w-full" />
      ) : (
        <Text className="text-sm font-extrabold" style={{ color: ACCENT }}>
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
  onRespond,
}: {
  request: FriendRequest;
  onRespond: (accept: boolean) => void;
}) {
  const incoming = request.direction === 'incoming';
  return (
    <View className="rounded-[24px] border border-primary/20 bg-primary/5 p-4">
      <View className="flex-row items-center gap-3">
        <Avatar friend={request.friend} />
        <View className="flex-1">
          <Text className="text-base font-extrabold text-foreground">
            {request.friend.displayName}
          </Text>
          <Text className="mt-0.5 text-sm text-muted-foreground">
            {incoming ? 'möchte mit dir befreundet sein' : 'Anfrage gesendet'}
          </Text>
        </View>
        <Ionicons
          name={incoming ? 'person-add-outline' : 'time-outline'}
          size={21}
          color={incoming ? ACCENT : '#93939B'}
        />
      </View>
      {incoming ? (
        <View className="mt-4 flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 flex-1 items-center justify-center rounded-2xl bg-secondary active:opacity-70"
            onPress={() => onRespond(false)}
          >
            <Text className="text-sm font-bold text-muted-foreground">Ablehnen</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 flex-1 items-center justify-center rounded-2xl active:opacity-85"
            style={{ backgroundColor: ACCENT }}
            onPress={() => onRespond(true)}
          >
            <Text className="text-sm font-extrabold text-white">Annehmen</Text>
          </Pressable>
        </View>
      ) : null}
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
        <Text className="text-base font-bold text-foreground">{friend.displayName}</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
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
    respondToFriendRequest,
    removeFriend,
    toggleCloseFriend,
  } = useFriends();
  const [query, setQuery] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [codeVisible, setCodeVisible] = useState(false);
  const filteredFriends = useMemo(
    () => friends.filter((friend) => matches(query, friend)),
    [friends, query],
  );

  useEffect(() => {
    if (typeof add === 'string' && add.trim()) setUsername(add.trim().replace(/^@/, ''));
  }, [add]);

  async function addFriend() {
    const value = username.trim().replace(/^@/, '');
    if (!value || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendFriendRequest(value);
      setUsername('');
      setFeedback(
        result.state === 'sent'
          ? `Anfrage an ${result.friend.displayName} gesendet.`
          : result.state === 'already_friends'
            ? `Ihr seid bereits befreundet.`
            : `${result.friend.displayName} hat dir bereits eine Anfrage geschickt – bestätige sie oben.`,
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Die Anfrage konnte nicht gesendet werden.',
      );
    } finally {
      setBusy(false);
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
          onPress: () => {
            void removeFriend(friend.uid).catch((error) =>
              Alert.alert(
                'Nicht möglich',
                error instanceof Error ? error.message : 'Bitte versuche es erneut.',
              ),
            );
          },
        },
      ],
    );
  }

  async function shareHandle() {
    const handle = user?.username?.trim();
    if (handle) await Share.share({ message: `Füge mich bei Together hinzu: @${handle}` });
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
              <Text className="text-lg font-extrabold text-white">Freunde hinzufügen</Text>
              <Text className="mt-1 text-sm leading-5 text-white/55">
                Sende eine Anfrage über den eindeutigen Nutzernamen. Erst nach Annahme entstehen
                Sichtbarkeit und Chat-Zugriff.
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row items-center gap-2 rounded-[20px] bg-white/[0.09] p-2">
            <Text className="pl-2 text-base font-bold text-white/50">@</Text>
            <TextInput
              className="min-h-10 flex-1 text-base text-white"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="nutzername"
              placeholderTextColor="rgba(255,255,255,0.42)"
              value={username}
              onChangeText={setUsername}
              onSubmitEditing={() => void addFriend()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Freundschaftsanfrage senden"
              disabled={busy || !username.trim()}
              className="h-10 w-10 items-center justify-center rounded-[14px]"
              style={{ backgroundColor: username.trim() ? '#fff' : 'rgba(255,255,255,0.22)' }}
              onPress={() => void addFriend()}
            >
              <Ionicons name="arrow-forward" size={19} color="#101923" />
            </Pressable>
          </View>
          {feedback ? (
            <Text className="mt-3 text-sm font-semibold text-white/70">{feedback}</Text>
          ) : null}
          {user?.username && friendRequestPolicy === 'anyone' ? (
            <View className="mt-4 flex-row flex-wrap gap-2">
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2 active:opacity-70"
                onPress={() => setCodeVisible(true)}
              >
                <Ionicons name="qr-code-outline" size={16} color="#BFCBFF" />
                <Text className="text-xs font-bold text-white/80">QR-Code</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-full bg-white/[0.08] px-3 py-2 active:opacity-70"
                onPress={() => void shareHandle()}
              >
                <Ionicons name="share-outline" size={16} color="#BFCBFF" />
                <Text className="text-xs font-bold text-white/80">@{user.username} teilen</Text>
              </Pressable>
            </View>
          ) : user?.username ? (
            <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-white/[0.07] px-3 py-2.5">
              <Ionicons name="shield-checkmark-outline" size={17} color="#BFCBFF" />
              <Text className="flex-1 text-xs leading-4 text-white/65">
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
                onRespond={(accept) => void respondToFriendRequest(request.id, accept)}
              />
            ))}
          </View>
        ) : null}
        {outgoingRequests.length ? (
          <View className="gap-2.5">
            <AppText variant="label">Gesendet</AppText>
            {outgoingRequests.map((request) => (
              <RequestRow key={request.id} request={request} onRespond={() => {}} />
            ))}
          </View>
        ) : null}
        {closeFriends.length ? (
          <View className="gap-2.5">
            <AppText variant="label">Enge Freunde</AppText>
            <View className="flex-row flex-wrap gap-2">
              {closeFriends.map((friend) => (
                <View
                  key={friend.uid}
                  className="flex-row items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3"
                >
                  <Avatar friend={friend} size="h-8 w-8" />
                  <Text className="text-sm font-bold text-foreground">{friend.displayName}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View className="gap-2.5">
          <View className="flex-row items-center justify-between">
            <AppText variant="label">Alle Freunde</AppText>
            <Text className="text-sm font-bold text-muted-foreground">{friends.length}</Text>
          </View>
          {friends.length ? (
            <View className="min-h-13 flex-row items-center gap-3 rounded-[20px] border border-border bg-card px-4">
              <Ionicons name="search-outline" size={19} color="#8F8B84" />
              <TextInput
                className="flex-1 py-3 text-sm text-foreground"
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
          {friends.length === 0 ? (
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
    </AppScreen>
  );
}
