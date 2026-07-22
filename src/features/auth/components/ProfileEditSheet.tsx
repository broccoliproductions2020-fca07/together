import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProfileEditSheetProps {
  visible: boolean;
  initialDisplayName: string;
  initialAvatarUrl?: string;
  onClose: () => void;
  onSave: (input: { displayName: string; avatarUri?: string }) => Promise<void>;
}

export function ProfileEditSheet({
  visible,
  initialDisplayName,
  initialAvatarUrl,
  onClose,
  onSave,
}: ProfileEditSheetProps) {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUri, setAvatarUri] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(initialDisplayName);
    setAvatarUri(undefined);
    setError(null);
  }, [initialDisplayName, visible]);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (!result.canceled) setAvatarUri(result.assets[0]?.uri);
  }

  async function save() {
    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      setError('Dein Anzeigename braucht mindestens 2 Zeichen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ displayName: trimmed, avatarUri });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Dein Profil konnte nicht gespeichert werden.',
      );
    } finally {
      setBusy(false);
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
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />
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
              onPress={onClose}
            >
              <Text className="text-xl text-foreground">×</Text>
            </Pressable>
          </View>

          <View className="items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profilbild ändern"
              className="h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-primary/15 active:opacity-80"
              onPress={pickAvatar}
            >
              {preview ? (
                <Image source={{ uri: preview }} className="h-full w-full" />
              ) : (
                <Text className="text-2xl font-extrabold text-primary">{initials || 'DU'}</Text>
              )}
            </Pressable>
            <Text className="mt-2 text-sm font-semibold text-primary">Profilbild ändern</Text>
          </View>

          <View className="mt-7 gap-2">
            <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Anzeigename
            </Text>
            <TextInput
              autoFocus
              autoCapitalize="words"
              maxLength={50}
              value={displayName}
              onChangeText={setDisplayName}
              className="min-h-14 rounded-2xl border border-border bg-background px-4 text-base text-foreground"
              placeholder="Dein Name"
              placeholderTextColor="rgba(150,150,160,0.7)"
            />
          </View>

          {error ? (
            <View className="mt-3 rounded-2xl bg-red-500/10 px-4 py-3">
              <Text className="text-sm font-semibold text-red-400">{error}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={() => void save()}
            className="mt-6 min-h-14 items-center justify-center rounded-2xl bg-primary active:opacity-80"
          >
            <Text className="text-base font-extrabold text-primary-foreground">
              {busy ? 'Wird gespeichert …' : 'Änderungen speichern'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
