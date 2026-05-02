import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS } from '../config/constants';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  // Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
    });
  }

  return tokenData.data;
}

export function usePushNotifications(isAuthenticated: boolean) {
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotificationsAsync().then(async (token) => {
      if (token) {
        tokenRef.current = token;
        try {
          await apiClient.post(API_ENDPOINTS.REGISTER_PUSH_TOKEN, {
            token,
            device_name: `${Device.brand || ''} ${Device.modelName || 'Unknown'}`.trim(),
          });
          console.log('Push token registered:', token);
        } catch (err) {
          console.error('Failed to register push token:', err);
        }
      }
    });
  }, [isAuthenticated]);

  // Return token and unregister function for logout
  const unregisterToken = async () => {
    if (tokenRef.current) {
      try {
        await apiClient.delete(API_ENDPOINTS.UNREGISTER_PUSH_TOKEN, {
          data: { token: tokenRef.current },
        });
      } catch (err) {
        console.error('Failed to unregister push token:', err);
      }
    }
  };

  return { pushToken: tokenRef.current, unregisterToken };
}
