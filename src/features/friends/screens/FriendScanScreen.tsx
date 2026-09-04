import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { parseInviteLink } from '@/shared/utils/inviteLink';

import { useFriends } from '../FriendsProvider';
import type { SendFriendRequestResult } from '../services/friendService.types';

type Outcome = { tone: 'ok' | 'error'; text: string };

/**
 * Scans a friend's invite QR code.
 *
 * The system camera already opens these links directly — this exists for the
 * moment two people stand together, where leaving the app to open the camera is
 * the clumsy part. Anything that is not one of OUR invite links is ignored
 * silently: a camera pointed at the world sees plenty of other codes, and
 * complaining about each one would be noise.
 */
export function FriendScanScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { sendFriendRequest } = useFriends();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The camera reports many times per second; without a latch one code in view
  // would fire a burst of identical requests.
  const handled = useRef(false);

  const onScanned = useCallback(
    async (data: string) => {
      if (handled.current) return;
      const username = parseInviteLink(data);
      if (!username) return;
      handled.current = true;
      setBusy(true);
      try {
        const result = await sendFriendRequest(username);
        setOutcome({ tone: 'ok', text: describe(username, result) });
      } catch (error) {
        setOutcome({
          tone: 'error',
          text:
            error instanceof Error && error.message
              ? error.message
              : 'Die Freundschaftsanfrage konnte nicht gesendet werden.',
        });
      } finally {
        setBusy(false);
      }
    },
    [sendFriendRequest],
  );

  const scanAgain = useCallback(() => {
    handled.current = false;
    setOutcome(null);
  }, []);

  return (
    <View className="flex-1 bg-black">
      {permission?.granted ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={outcome || busy ? undefined : (event) => void onScanned(event.data)}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="camera-outline" size={40} color="rgba(255,255,255,0.5)" />
          <Text
            {...TEXT_FLEXIBLE}
            className="mt-4 text-center text-white"
            style={{ ...TYPE.body, fontFamily: FONT.semibold }}
          >
            {permission?.canAskAgain === false
              ? 'Der Kamerazugriff ist in den Systemeinstellungen deaktiviert.'
              : 'Für den Freundescode braucht Mica deine Kamera.'}
          </Text>
          {permission?.canAskAgain !== false ? (
            <Pressable
              accessibilityRole="button"
              className="mt-6 min-h-13 justify-center rounded-[18px] bg-white px-6 active:opacity-85"
              onPress={() => void requestPermission()}
            >
              <Text
                {...TEXT_CAPPED}
                className="text-[#101923]"
                style={{ ...TYPE.label, fontFamily: FONT.bold }}
              >
                Kamera erlauben
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scannen schließen"
        className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-black/55 active:opacity-70"
        style={{ top: insets.top + 12 }}
        onPress={onClose}
      >
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>

      <View
        className="absolute left-4 right-4 rounded-[24px] bg-[#101923]/95 p-4"
        style={{ bottom: insets.bottom + 24 }}
      >
        {busy ? (
          <View className="flex-row items-center gap-3">
            <ActivityIndicator color="#fff" />
            <Text
              {...TEXT_FLEXIBLE}
              className="text-white"
              style={{ ...TYPE.label, fontFamily: FONT.semibold }}
            >
              Anfrage wird gesendet …
            </Text>
          </View>
        ) : outcome ? (
          <View className="gap-3">
            <Text
              {...TEXT_FLEXIBLE}
              style={{
                ...TYPE.label,
                fontFamily: FONT.semibold,
                color: outcome.tone === 'ok' ? '#35BA84' : '#F2A0A0',
              }}
            >
              {outcome.text}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center active:opacity-70"
              onPress={scanAgain}
            >
              <Text
                {...TEXT_CAPPED}
                className="text-white/70"
                style={{ ...TYPE.label, fontFamily: FONT.bold }}
              >
                Nächsten Code scannen
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text
            {...TEXT_FLEXIBLE}
            className="text-center text-white/75"
            style={{ ...TYPE.label, fontFamily: FONT.medium }}
          >
            Richte die Kamera auf den Freundescode.
          </Text>
        )}
      </View>
    </View>
  );
}

function describe(username: string, result: SendFriendRequestResult): string {
  const handle = `@${username}`;
  if (result.state === 'already_friends') return 'Ihr seid bereits befreundet.';
  if (result.state === 'incoming_request') {
    return `${handle} hat dir bereits eine Anfrage geschickt — nimm sie unter Freunde an.`;
  }
  return `Anfrage an ${handle} gesendet.`;
}
