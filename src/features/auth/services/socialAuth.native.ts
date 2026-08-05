import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

export type GoogleIdentity = {
  idToken: string;
  displayName?: string;
};

export type AppleIdentity = {
  authorizationCode: string;
  displayName?: string;
  idToken: string;
  rawNonce: string;
};

let configuredGoogleWebClientId: string | null = null;

function getGoogleWebClientId(): string {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new Error(
      'Die Google-Anmeldung ist noch nicht konfiguriert. Bitte den Google OAuth Web-Client für diesen Build hinterlegen.',
    );
  }
  return webClientId;
}

function configureGoogle(): void {
  const webClientId = getGoogleWebClientId();
  if (configuredGoogleWebClientId === webClientId) return;
  GoogleSignin.configure({ webClientId });
  configuredGoogleWebClientId = webClientId;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isAppleCancellation(error: unknown): boolean {
  return (error as { code?: string } | undefined)?.code === 'ERR_REQUEST_CANCELED';
}

export async function getGoogleIdentity(): Promise<GoogleIdentity | null> {
  configureGoogle();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const result = await GoogleSignin.signIn();
    if (isCancelledResponse(result)) return null;
    if (!result.data.idToken) {
      throw new Error('Google hat kein ID-Token zur Anmeldung zurückgegeben.');
    }
    return {
      idToken: result.data.idToken,
      ...(result.data.user.name ? { displayName: result.data.user.name } : {}),
    };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
}

export async function getAppleIdentity(): Promise<AppleIdentity | null> {
  if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('Apple-Anmeldung ist auf diesem Gerät nicht verfügbar.');
  }

  const rawNonce = bytesToHex(Crypto.getRandomBytes(32));
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
    {
      encoding: Crypto.CryptoEncoding.HEX,
    },
  );

  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!result.identityToken || !result.authorizationCode) {
      throw new Error('Apple hat keine vollständigen Anmeldedaten zurückgegeben.');
    }
    const displayName = result.fullName
      ? AppleAuthentication.formatFullName(result.fullName)?.trim()
      : undefined;
    return {
      authorizationCode: result.authorizationCode,
      idToken: result.identityToken,
      rawNonce,
      ...(displayName ? { displayName } : {}),
    };
  } catch (error) {
    if (isAppleCancellation(error)) return null;
    throw error;
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    configureGoogle();
    await GoogleSignin.signOut();
  } catch {
    // Firebase sign-out is still authoritative if the provider has no local session.
  }
}
