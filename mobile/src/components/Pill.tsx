import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

export const Pill: React.FC<{ label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> =
  ({ label, tone = 'neutral' }) => {
  const palette: Record<string, { bg: string; fg: string }> = {
    success: { bg: '#dcfce7', fg: '#166534' },
    warning: { bg: '#fef3c7', fg: '#92400e' },
    danger:  { bg: '#fee2e2', fg: '#991b1b' },
    info:    { bg: '#e0f2fe', fg: '#075985' },
    neutral: { bg: '#e2e8f0', fg: '#334155' },
  };
  const c = palette[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
});
