import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

const GREEN = '#41C08D';

interface GuaranteeSection {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Plain lead-in rendered without a checkmark (e.g. "…nur wenn:"). */
  intro?: string;
  lines: string[];
  /** Plain closing line rendered without a checkmark. */
  outro?: string;
}

/** Fixed product guarantees — informational only. Anything the user can actually
 * CHANGE lives in the settings list, never here. */
// Written for FIRST-TIME users: plain principles in everyday language.
const GUARANTEES: GuaranteeSection[] = [
  {
    icon: 'lock-closed',
    title: 'Dein Profil',
    lines: [
      'Nur Menschen, die du als Freunde bestätigt hast, sehen dein Profil.',
      'Fremde können dich nicht finden — es gibt keine öffentliche Suche.',
    ],
  },
  {
    icon: 'eye-off',
    title: 'Deine Aktivitäten',
    lines: ['Was du planst, sehen nur die Freunde, die du dafür auswählst.'],
  },
  {
    icon: 'locate',
    title: 'Dein Standort',
    intro: 'Dein Standort wird nie automatisch geteilt. Nur wenn:',
    lines: [
      'du dich als verfügbar zeigst und das Teilen dabei selbst einschaltest',
      'du auf dem Weg zu einem Treffen deinen Live-Standort für die Teilnehmer freigibst',
    ],
    outro:
      'Jede Freigabe endet von selbst — spätestens, wenn das Treffen oder deine Anreise vorbei ist.',
  },
  {
    icon: 'chatbubbles',
    title: 'Deine Nachrichten',
    lines: [
      'Aktivitäten-Chats löschen sich 12 Stunden nach dem Ende von selbst.',
      'Es entsteht kein dauerhaftes Archiv über dich.',
    ],
  },
];

export interface PrivacyInfoSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** "So schützt dich Together" — the read-only guarantees page. Deliberately
 * separate from the settings list so unchangeable facts never wear the
 * affordances of a setting. */
export function PrivacyInfoSheet({ visible, onClose }: PrivacyInfoSheetProps) {
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[88%] rounded-t-[32px] border border-white/10 bg-[#0E1116] px-5 pb-8 pt-3">
          <View className="mb-4 h-1.5 w-12 self-center rounded-full bg-white/20" />
          <View className="flex-row items-center justify-between">
            <View className="w-11" />
            <Text className="text-2xl font-extrabold text-white">So schützt dich Together</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Info schließen"
              className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
              onPress={onClose}
            >
              <Ionicons name="close" size={21} color="#F4F5F7" />
            </Pressable>
          </View>

          <Text className="mt-2 text-center text-sm text-white/50">
            Diese Regeln gelten immer — sie lassen sich nicht ausschalten.
          </Text>

          <ScrollView className="mt-4" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            {GUARANTEES.map((section) => (
              <View
                key={section.title}
                className="gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${GREEN}1A` }}
                  >
                    <Ionicons name={section.icon} size={18} color={GREEN} />
                  </View>
                  <Text className="text-base font-bold text-white">{section.title}</Text>
                </View>
                <View className="gap-2">
                  {section.intro ? (
                    <Text className="text-sm leading-5 text-white/70">{section.intro}</Text>
                  ) : null}
                  {section.lines.map((line) => (
                    <View key={line} className="flex-row items-start gap-2">
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={GREEN}
                        style={{ marginTop: 2 }}
                      />
                      <Text className="flex-1 text-sm leading-5 text-white/70">{line}</Text>
                    </View>
                  ))}
                  {section.outro ? (
                    <Text className="text-sm leading-5 text-white/55">{section.outro}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
