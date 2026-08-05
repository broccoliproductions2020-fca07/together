import { Stack } from 'expo-router';

export default function AuthenticatedStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="friends" />
    </Stack>
  );
}
