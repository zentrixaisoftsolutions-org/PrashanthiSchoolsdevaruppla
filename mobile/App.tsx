import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, LogBox } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { initDatabase } from './src/database/database';
import { initNetworkListener } from './src/services/offlineService';
import { usePushNotifications } from './src/utils/usePushNotifications';

// Suppress non-critical warnings in release
LogBox.ignoreLogs(['Warning:']);

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize database
        await initDatabase();
        console.log('Database initialized');
      } catch (err) {
        console.error('Database init error:', err);
        // Continue without database — app can still show login
      }

      try {
        // Initialize network listener
        initNetworkListener();
        console.log('Network listener initialized');
      } catch (err) {
        console.error('Network listener error:', err);
        // Continue without network listener
      }

      setIsReady(true);
    };

    initialize();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>Loading...</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <PushNotificationWrapper />
    </AuthProvider>
  );
}

function PushNotificationWrapper() {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);
  return <AppNavigator />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
