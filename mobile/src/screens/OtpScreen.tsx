import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius } from '../theme';

const OTP_LEN = 6;

const OtpScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { mobile, masked_email, role } = route.params as { mobile: string; masked_email: string; role: string };
  const { signIn, requestOtp } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const setDigit = (i: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < OTP_LEN - 1) inputs.current[i + 1]?.focus();
    if (!v && i > 0) inputs.current[i - 1]?.focus();
  };

  const onSubmit = async () => {
    const otp = digits.join('');
    if (otp.length !== OTP_LEN) {
      Alert.alert('Incomplete', `Enter the ${OTP_LEN}-digit OTP.`);
      return;
    }
    setBusy(true);
    try {
      await signIn(mobile, otp);
      // root navigator will swap to MainTabs automatically when user becomes set
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail
        || (e?.message ? `${e.message}` : 'Invalid or expired OTP.');
      const msg = status ? `[${status}] ${detail}` : `${detail}`;
      Alert.alert('Login failed', msg);
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    if (secondsLeft > 0) return;
    try {
      await requestOtp(mobile, role === 'teacher' ? 'teacher' : 'parent');
      setSecondsLeft(60);
      setDigits(Array(OTP_LEN).fill(''));
      inputs.current[0]?.focus();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not resend OTP.');
    }
  };

  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => nav.goBack()} style={styles.back}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Back</Text>
          </Pressable>

          <Card style={{ gap: spacing.md }}>
            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              We've sent a 6-digit OTP to{'\n'}
              <Text style={{ fontWeight: '800', color: colors.primary }}>{masked_email}</Text>
              {'\n'}({role === 'teacher' ? 'Teacher' : 'Parent'} login)
            </Text>

            <View style={styles.row}>
              {digits.map((d, i) => (
                <TextInput
                  key={i}
                  ref={(r) => { inputs.current[i] = r; }}
                  value={d}
                  onChangeText={(v) => setDigit(i, v)}
                  keyboardType="number-pad"
                  maxLength={1}
                  style={styles.box}
                  textAlign="center"
                  selectTextOnFocus
                />
              ))}
            </View>

            <Button title="Verify &amp; Login" onPress={onSubmit} loading={busy} />

            <Pressable onPress={onResend} disabled={secondsLeft > 0}>
              <Text style={[styles.resend, secondsLeft > 0 && { color: colors.textMuted }]}>
                {secondsLeft > 0 ? `Resend OTP in ${secondsLeft}s` : 'Resend OTP'}
              </Text>
            </Pressable>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.textMuted, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.md },
  box: {
    width: 44, height: 56, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    fontSize: 22, fontWeight: '800', color: colors.text,
  },
  resend: { textAlign: 'center', color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
});

export default OtpScreen;
