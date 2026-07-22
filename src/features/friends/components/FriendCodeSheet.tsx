import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Modal, Pressable, Share, Text, View } from 'react-native';

interface FriendCodeSheetProps {
  visible: boolean;
  username: string;
  onClose: () => void;
}

/** A real deep-link QR code. Scanning it opens /friends with the username
 * prefilled; the recipient still deliberately sends a normal request. */
export function FriendCodeSheet({ visible, username, onClose }: FriendCodeSheetProps) {
  const cleanUsername = username.trim().replace(/^@/, '');
  const link = `together://friends?add=${encodeURIComponent(cleanUsername)}`;

  async function share() {
    await Share.share({
      message: `Füge mich bei Together hinzu: @${cleanUsername}\n${link}`,
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
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#6E8BF7]/20">
              <Ionicons name="qr-code-outline" size={24} color="#AEBFFF" />
            </View>
            <Text className="mt-4 text-xl font-extrabold text-white">Mein Freundescode</Text>
            <Text className="mt-2 max-w-[250px] text-center text-sm leading-5 text-white/55">
              Der Code öffnet Together direkt mit deiner Freundschaftsanfrage. Du bestätigst sie
              danach wie gewohnt.
            </Text>
            <View className="mt-5 rounded-[24px] bg-white p-4">
              <QRCode value={link} size={196} color="#101923" backgroundColor="#FFFFFF" />
            </View>
            <View className="mt-4 rounded-full bg-white/[0.08] px-4 py-2">
              <Text className="text-sm font-extrabold text-white">@{cleanUsername}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-[18px] bg-white active:opacity-85"
            onPress={() => void share()}
          >
            <Ionicons name="share-outline" size={18} color="#101923" />
            <Text className="text-sm font-extrabold text-[#101923]">Code teilen</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
