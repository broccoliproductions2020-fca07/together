import { Ionicons } from '@expo/vector-icons';
import type * as ImagePickerTypes from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/features/theme';
import { haptics } from '@/shared/utils/haptics';

interface ProfileEditSheetProps {
  visible: boolean;
  initialDisplayName: string;
  initialAvatarUrl?: string;
  openAvatarPickerOnShow?: boolean;
  onAvatarPickerRequestConsumed?: () => void;
  onClose: () => void;
  onSave: (input: { displayName: string; avatarUri?: string }) => Promise<void>;
}

// 512 is already generous: the largest place an avatar is shown is the ~112px
// marker capture, so this leaves >4x headroom for high-density screens while
// cutting the uploaded (and repeatedly downloaded) bytes roughly fourfold.
const AVATAR_SIZE = 512;

async function prepareAvatar(asset: ImagePickerTypes.ImagePickerAsset): Promise<string> {
  if (!asset.width || !asset.height) {
    throw new Error('Das Foto konnte nicht verarbeitet werden. Bitte wähle ein anderes Bild.');
  }

  // Loaded lazily so the (native) module is only touched when a photo is
  // actually cropped — never at app start. Keeps a missing native build from
  // taking down the whole app; the avatar flow itself still needs the module.
  const ImageManipulator = await import('expo-image-manipulator');
  const side = Math.min(asset.width, asset.height);
  const result = await ImageManipulator.manipulateAsync(
    asset.uri,
    [
      {
        crop: {
          originX: Math.max(0, Math.floor((asset.width - side) / 2)),
          originY: Math.max(0, Math.floor((asset.height - side) / 2)),
          width: side,
          height: side,
        },
      },
      { resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } },
    ],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
  );

  return result.uri;
}

export function ProfileEditSheet({
  visible,
  initialDisplayName,
  initialAvatarUrl,
  openAvatarPickerOnShow = false,
  onAvatarPickerRequestConsumed,
  onClose,
  onSave,
}: ProfileEditSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUri, setAvatarUri] = useState<string>();
  const [avatarSourceVisible, setAvatarSourceVisible] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State only disables after React has rendered. These refs cover the tiny
  // gap during which a second tap could open another native picker or submit a
  // second profile write.
  const avatarPickInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const sessionRevisionRef = useRef(0);
  const avatarOperationRevisionRef = useRef(0);
  const saveOperationRevisionRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setAvatarSourceVisible(false);
      return;
    }
    sessionRevisionRef.current += 1;
    avatarOperationRevisionRef.current += 1;
    saveOperationRevisionRef.current += 1;
    avatarPickInFlightRef.current = false;
    saveInFlightRef.current = false;
    setImageBusy(false);
    setBusy(false);
    setDisplayName(initialDisplayName);
    setAvatarUri(undefined);
    setError(null);
  }, [initialDisplayName, visible]);

  useEffect(() => {
    if (!visible || !openAvatarPickerOnShow) return;
    const timer = setTimeout(() => {
      setAvatarSourceVisible(true);
      onAvatarPickerRequestConsumed?.();
    }, 180);
    return () => clearTimeout(timer);
  }, [onAvatarPickerRequestConsumed, openAvatarPickerOnShow, visible]);

  function dismiss() {
    sessionRevisionRef.current += 1;
    setAvatarSourceVisible(false);
    onClose();
  }

  const interactionLocked = busy || imageBusy;

  async function chooseAvatar(source: 'camera' | 'library') {
    if (interactionLocked || avatarPickInFlightRef.current) return;
    const sessionRevision = sessionRevisionRef.current;
    const operationRevision = ++avatarOperationRevisionRef.current;
    avatarPickInFlightRef.current = true;
    setImageBusy(true);
    setAvatarSourceVisible(false);
    setError(null);
    try {
      // Lazy for the same reason as ImageManipulator above — no native access at start.
      const ImagePicker = await import('expo-image-picker');
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        const label = source === 'camera' ? 'Kamera' : 'Fotos';
        const message = `Erlaube Mica den Zugriff auf ${label} in den Systemeinstellungen, um ein Profilbild zu wählen.`;
        if (sessionRevision === sessionRevisionRef.current) {
          setError(message);
          if (!permission.canAskAgain) Alert.alert(`${label}-Zugriff fehlt`, message);
        }
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              cameraType: ImagePicker.CameraType.front,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 1,
              exif: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 1,
              exif: false,
            });

      if (result.canceled || !result.assets[0]) return;

      const preparedAvatar = await prepareAvatar(result.assets[0]);
      if (sessionRevision !== sessionRevisionRef.current) return;
      setAvatarUri(preparedAvatar);
      haptics.success();
    } catch (imageError) {
      if (sessionRevision !== sessionRevisionRef.current) return;
      setError(
        imageError instanceof Error
          ? imageError.message
          : 'Das Foto konnte nicht verarbeitet werden. Bitte versuche es erneut.',
      );
      haptics.warning();
    } finally {
      if (operationRevision !== avatarOperationRevisionRef.current) return;
      avatarPickInFlightRef.current = false;
      if (sessionRevision === sessionRevisionRef.current) setImageBusy(false);
    }
  }

  async function save() {
    if (interactionLocked || saveInFlightRef.current) return;
    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      setError('Dein Anzeigename braucht mindestens 2 Zeichen.');
      return;
    }
    const sessionRevision = sessionRevisionRef.current;
    const operationRevision = ++saveOperationRevisionRef.current;
    saveInFlightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave({ displayName: trimmed, avatarUri });
      if (sessionRevision !== sessionRevisionRef.current) return;
      haptics.success();
      dismiss();
    } catch (saveError) {
      if (sessionRevision !== sessionRevisionRef.current) return;
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Dein Profil konnte nicht gespeichert werden.',
      );
      haptics.warning();
    } finally {
      if (operationRevision !== saveOperationRevisionRef.current) return;
      saveInFlightRef.current = false;
      if (sessionRevision === sessionRevisionRef.current) setBusy(false);
    }
  }

  const preview = avatarUri ?? initialAvatarUrl;
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={dismiss}
        />
        <View
          className="rounded-t-[30px] border border-border bg-card px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 18) + 12 }}
        >
          <View className="mb-5 h-1.5 w-12 self-center rounded-full bg-border" />
          <View className="mb-6 flex-row items-center justify-between">
            <View>
              <Text className="text-2xl font-extrabold text-foreground">Profil bearbeiten</Text>
              <Text className="mt-1 text-sm text-muted-foreground">
                So sehen dich deine Freunde.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profilbearbeitung schließen"
              className="h-10 w-10 items-center justify-center rounded-full bg-secondary active:opacity-70"
              onPress={dismiss}
            >
              <Ionicons name="close" size={21} color={colors.foreground} />
            </Pressable>
          </View>

          <View className="items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profilbild ändern"
              accessibilityHint="Öffnet Kamera und deine Fotos"
              disabled={interactionLocked}
              className="h-28 w-28 items-center justify-center overflow-visible rounded-[38px] border-2 border-primary bg-primary/15 active:opacity-80"
              onPress={() => {
                haptics.light();
                setAvatarSourceVisible(true);
              }}
            >
              <View className="h-full w-full overflow-hidden rounded-[35px]">
                {preview ? (
                  <Image source={{ uri: preview }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <Text className="text-3xl font-extrabold text-primary">{initials || 'DU'}</Text>
                )}
              </View>
              <View className="absolute -bottom-1 -right-1 h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-primary">
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </Pressable>
            <Text className="mt-3 text-sm font-bold text-primary">
              {avatarUri ? 'Anderes Profilbild wählen' : 'Profilbild ändern'}
            </Text>
            <Text className="mt-1 text-center text-xs text-muted-foreground">
              Quadrat wählen, dann Ausschnitt und Drehung anpassen.
            </Text>
          </View>

          <View className="mt-7 gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Anzeigename
            </Text>
            <TextInput
              autoFocus
              autoCapitalize="words"
              maxLength={50}
              editable={!interactionLocked}
              value={displayName}
              onChangeText={setDisplayName}
              className="min-h-14 rounded-2xl border border-border bg-background px-4 text-base text-foreground"
              placeholder="Dein Name"
              placeholderTextColor="rgba(150,150,160,0.7)"
            />
            <Text className="mt-1 text-xs leading-4 text-muted-foreground">
              Anzeigename: bis zu 3 Änderungen in 24 Stunden, mit 10 Minuten Abstand. Profilbild:
              maximal 5 Änderungen in 24 Stunden.
            </Text>
          </View>

          {error ? (
            <View className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3">
              <Text className="text-sm font-semibold text-red-400">{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: interactionLocked, disabled: interactionLocked }}
            disabled={interactionLocked}
            onPress={() => void save()}
            className="mt-6 min-h-14 items-center justify-center rounded-2xl bg-primary active:opacity-80"
          >
            <Text className="text-base font-extrabold text-primary-foreground">
              {imageBusy
                ? 'Foto wird vorbereitet …'
                : busy
                  ? 'Wird gespeichert …'
                  : 'Änderungen speichern'}
            </Text>
          </Pressable>
        </View>

        {avatarSourceVisible ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            className="absolute inset-0 justify-end bg-black/55"
          >
            <Pressable className="absolute inset-0" onPress={() => setAvatarSourceVisible(false)} />
            <Animated.View
              entering={SlideInDown.duration(260)}
              exiting={SlideOutDown.duration(180)}
              className="rounded-t-[32px] border border-border bg-card px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 18) + 12 }}
            >
              <View className="mb-5 h-1.5 w-12 self-center rounded-full bg-border" />
              <View className="mb-5">
                <Text className="text-xl font-extrabold text-foreground">Neues Profilbild</Text>
                <Text className="mt-1 text-sm leading-5 text-muted-foreground">
                  Wähle ein Foto und passe den quadratischen Ausschnitt direkt danach an.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                className="mb-3 min-h-[72px] flex-row items-center gap-4 rounded-[22px] border border-primary/25 bg-primary/10 px-4 active:opacity-75"
                onPress={() => {
                  haptics.selection();
                  void chooseAvatar('camera');
                }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary">
                  <Ionicons name="camera-outline" size={21} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-foreground">Foto aufnehmen</Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    Mit deiner Frontkamera
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#3B82F6" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                className="min-h-[72px] flex-row items-center gap-4 rounded-[22px] border border-border bg-secondary/60 px-4 active:opacity-75"
                onPress={() => {
                  haptics.selection();
                  void chooseAvatar('library');
                }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-background">
                  <Ionicons name="images-outline" size={21} color="#3B82F6" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-foreground">
                    Aus Fotos wählen
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    Ausschnitt und Drehung anpassen
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#3B82F6" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                className="mt-3 min-h-12 items-center justify-center rounded-2xl active:bg-secondary"
                onPress={() => setAvatarSourceVisible(false)}
              >
                <Text className="text-sm font-bold text-muted-foreground">Abbrechen</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
