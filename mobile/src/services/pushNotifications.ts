import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

// Foreground display behaviour (sound + alert + badge)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Backwards compat for older SDKs
    shouldShowAlert: true,
  } as any),
});

let lastRegisteredToken: string | null = null;

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Sri Sai Prashanthi Vidyaniketan Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f766e',
    });
  } catch {
    // ignore
  }
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId ||
    undefined;

  try {
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return tokenResp.data || null;
  } catch (err) {
    // In Expo Go on SDK 53+ remote push tokens may be unsupported; ignore quietly.
    console.warn('[push] getExpoPushToken failed', err);
    return null;
  }
}

/** Register the device's Expo push token with the backend. Idempotent. */
export async function registerPushToken(): Promise<void> {
  try {
    await ensureAndroidChannel();
    const token = await getExpoPushToken();
    if (!token) return;
    if (token === lastRegisteredToken) return;
    await api.post('/notifications/register-token', {
      token,
      device_name: `${Device.osName ?? Platform.OS} ${Device.modelName ?? ''}`.trim(),
    });
    lastRegisteredToken = token;
  } catch (err) {
    console.warn('[push] registerPushToken failed', err);
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    if (!lastRegisteredToken) return;
    await api.delete('/notifications/unregister-token', {
      data: { token: lastRegisteredToken },
    });
  } catch {
    // ignore
  } finally {
    lastRegisteredToken = null;
  }
}
