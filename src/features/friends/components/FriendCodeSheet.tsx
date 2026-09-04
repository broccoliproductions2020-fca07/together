import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Modal, Pressable, Share, Text, View } from 'react-native';

import { FONT, TEXT_CAPPED, TEXT_FLEXIBLE, TYPE } from '@/shared/theme';
import { buildInviteLink } from '@/shared/utils/inviteLink';

const TEXT = {
  // 20 is off the scale and kept for now — see ScreenHeader.
  title: { fontSize: 20, lineHeight: 26, fontFamily: FONT.bold },
  body: { ...TYPE.label, fontFamily: FONT.medium },
  handle: { ...TYPE.label, fontFamily: FONT.bold },
  action: { ...TYPE.label, fontFamily: FONT.bold },
};

interface FriendCodeSheetProps {
  visible: boolean;
  username: string;
  onClose: () => void;
}

/** A real invite QR code. Scanning it opens Mica and sends the request; without
 * the app installed the link lands on a page that offers the download. */
export function FriendCodeSheet({ visible, username, onClose }: FriendCodeSheetProps) {
  const cleanUsername = username.trim().replace(/^@/, '');
  // An https Universal Link, never the custom scheme: the system camera opens
  // http(s) reliably and a custom scheme not at all, and only this form has
  // somewhere to land when the app is missing.
  const link = buildInviteLink(cleanUsername);

  async function share() {
    await Share.share({
      message: `Füge mich bei Mica hinzu: @${cleanUsername}\n${link}`,
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-[360px] overflow-hidden rounded-[32px] bg-[#101923] p-6 shadow-2xl">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="QR-Code schließen"
            className="absolute right-4 top-4 z-10 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            onPress={onClose}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View className="items-center">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#3B82F6]/20">
              <Ionicons name="qr-code-outline" size={24} color="#B6D3FF" />
            </View>
            <Text {...TEXT_FLEXIBLE} className="mt-4 text-white" style={TEXT.title}>
              Mein Freundescode
            </Text>
            <Text
              {...TEXT_FLEXIBLE}
              className="mt-2 max-w-[250px] text-center text-white/55"
              style={TEXT.body}
            >
              Wer den Code scannt, schickt dir eine Freundschaftsanfrage. Du entscheidest wie
              gewohnt, ob du sie annimmst.
            </Text>
            <View className="mt-5 rounded-[24px] bg-white p-4">
              <QRCode value={link} size={196} color="#101923" backgroundColor="#FFFFFF" />
            </View>
            <View className="mt-4 rounded-full bg-white/[0.08] px-4 py-2">
              <Text {...TEXT_CAPPED} className="text-white" style={TEXT.handle}>
                @{cleanUsername}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-[18px] bg-white active:opacity-85"
            onPress={() => void share()}
          >
            <Ionicons name="share-outline" size={18} color="#101923" />
            <Text {...TEXT_CAPPED} className="text-[#101923]" style={TEXT.action}>
              Code teilen
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
