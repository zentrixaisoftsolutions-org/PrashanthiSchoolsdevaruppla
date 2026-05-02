import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  subscribeToNetworkStatus,
  getNetworkStatus,
} from '../services/offlineService';

const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(getNetworkStatus());

  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus((status) => {
      setIsOnline(status);
    });

    return unsubscribe;
  }, []);

  if (isOnline) {
    return null; // Don't show anything when online
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>📡 OFFLINE MODE - Using Cached Data</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FF9500',
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default OfflineIndicator;
