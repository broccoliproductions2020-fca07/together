import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { AUTH_CONTROL_HEIGHT } from './authInteractionStyles';

type AppleSignInButtonProps = {
  disabled?: boolean;
  onPress: () => void;
};

export function AppleSignInButton({ disabled = false, onPress }: AppleSignInButtonProps) {
  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? styles.disabled : undefined}>
      <AppleAuthentication.AppleAuthenticationButton
        accessibilityLabel="Mit Apple anmelden"
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        cornerRadius={16}
        onPress={onPress}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: AUTH_CONTROL_HEIGHT,
    width: '100%',
  },
  disabled: {
    opacity: 0.55,
  },
});
