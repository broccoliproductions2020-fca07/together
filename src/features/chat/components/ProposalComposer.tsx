import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '@/features/theme';
import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';

function Field({
  label,
  placeholder,
  value,
  autoFocus = false,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  value: string;
  autoFocus?: boolean;
  onChangeText: (t: string) => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="gap-1.5">
      <Text
        {...TEXT_FLEXIBLE}
        style={{ ...TYPE.label, fontFamily: FONT.semibold, color: colors.foreground }}
      >
        {label}
      </Text>
      <TextInput
        {...TEXT_FLEXIBLE}
        className="rounded-2xl border border-border bg-secondary px-4 py-3"
        style={{ ...TYPE.body, fontFamily: FONT.medium, color: colors.foreground }}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        maxLength={60}
      />
    </View>
  );
}

export interface ProposalComposerProps {
  visible: boolean;
  /** The room's colour. Required — the composer never invents its own accent. */
  accent: string;
  onClose: () => void;
  onSubmit: (data: { what: string; when?: string; where?: string }) => void;
}

/** Small modal to post a What/When/Where proposal into the chat. Only "Was"
 * is required — the proposal is deliberately looser than a real activity. */
export function ProposalComposer({ visible, accent, onClose, onSubmit }: ProposalComposerProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  // A ref (not state) so a rapid double-tap on "Vorschlagen" can't slip a
  // second sendProposal through before the modal has actually closed.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) submittingRef.current = false;
  }, [visible]);

  function reset() {
    setWhat('');
    setWhen('');
    setWhere('');
  }

  function handleSubmit() {
    if (submittingRef.current || !what.trim()) return;
    submittingRef.current = true;
    onSubmit({
      what: what.trim(),
      when: when.trim() || undefined,
      where: where.trim() || undefined,
    });
    reset();
  }

  function handleClose() {
    submittingRef.current = false;
    reset();
    onClose();
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={handleClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={handleClose}>
        <Pressable
          className="rounded-t-[28px] border border-border bg-card px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 12) + 8 }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-border" />
          <Text
            {...TEXT_FLEXIBLE}
            className="mb-1"
            style={{ ...TYPE.body, fontFamily: FONT.bold, color: colors.foreground }}
          >
            Vorschlag machen
          </Text>
          <Text
            {...TEXT_FLEXIBLE}
            className="mb-4"
            style={{ ...TYPE.label, fontFamily: FONT.medium, color: colors.mutedForeground }}
          >
            Unverbindlich in die Runde werfen — wer mag, tippt „Bin dabei“.
          </Text>

          <View className="gap-3">
            <Field
              label="Was"
              placeholder="z. B. Bier"
              value={what}
              autoFocus
              onChangeText={setWhat}
            />
            <Field
              label="Wann"
              placeholder="z. B. Heute 20:00"
              value={when}
              onChangeText={setWhen}
            />
            <Field
              label="Wo"
              placeholder="z. B. Prater Garten"
              value={where}
              onChangeText={setWhere}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vorschlagen"
            disabled={!what.trim()}
            onPress={handleSubmit}
            className="mt-5 min-h-13 items-center justify-center rounded-2xl py-4 active:opacity-90"
            style={{ backgroundColor: what.trim() ? accent : `${accent}4D` }}
          >
            <Text
              {...TEXT_CAPPED}
              style={{ ...TYPE.body, fontFamily: FONT.bold, color: '#ffffff' }}
            >
              Vorschlagen
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
