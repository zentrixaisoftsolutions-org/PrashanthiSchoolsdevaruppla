import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface BtnProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  style?: ViewStyle;
}

export const Button: React.FC<BtnProps> = ({
  title, onPress, loading, disabled, variant = 'primary', style,
}) => {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        isDisabled && { opacity: 0.6 },
        pressed && !isDisabled && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' && { color: '#fff' },
            (variant === 'outline' || variant === 'ghost') && { color: colors.primary },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  outline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  text: { fontWeight: '700', fontSize: 16 },
});
