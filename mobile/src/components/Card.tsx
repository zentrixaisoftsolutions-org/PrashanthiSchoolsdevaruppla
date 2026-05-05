import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, padded = true }) => (
  <View style={[styles.card, padded && styles.padded, style as any]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
});
