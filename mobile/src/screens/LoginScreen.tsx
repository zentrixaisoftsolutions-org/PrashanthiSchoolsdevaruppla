import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Image, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radius } from '../theme';
import { SCHOOL_NAME, API_BASE_URL } from '../config';

const LoginScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const { requestOtp } = useAuth();
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<'parent' | 'teacher'>('parent');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const m = mobile.replace(/\D/g, '');
    if (m.length !== 10) {
      Alert.alert('Invalid mobile', 'Please enter a 10-digit mobile number.');
      return;
    }
    setBusy(true);
    try {
      const r = await requestOtp(m, role);
      nav.navigate('Otp', { mobile: r.mobile_used, masked_email: r.masked_email, role: r.role });
    } catch (e: any) {
      // Surface the real failure so we can tell network issues from API errors.
      const status = e?.response?.status;
      const apiDetail = e?.response?.data?.detail;
      const code = e?.code; // e.g. ERR_NETWORK, ECONNABORTED
      const msg = e?.message;
      let detail: string;
      if (apiDetail) {
        detail = typeof apiDetail === 'string' ? apiDetail : JSON.stringify(apiDetail);
      } else if (status) {
        detail = `Server returned ${status}.`;
      } else {
        detail = `Network error: ${code || ''} ${msg || ''}`.trim();
      }
      detail += `\n\nAPI: ${API_BASE_URL}`;
      Alert.alert('Error', detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Ionicons name="school" size={56} color="#fff" />
            </View>
            <Text style={styles.appName}>{SCHOOL_NAME}</Text>
            <Text style={styles.tag}>Parent &amp; Teacher Portal</Text>
          </View>

          <Card style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Choose your account type, then enter your registered mobile. We'll send a one-time password to your registered email.
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Login as</Text>
              <View style={styles.roleRow}>
                <Pressable
                  onPress={() => setRole('parent')}
                  style={[styles.roleChip, role === 'parent' && styles.roleChipActive]}
                >
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={role === 'parent' ? '#fff' : colors.primary}
                  />
                  <Text style={[styles.roleChipText, role === 'parent' && styles.roleChipTextActive]}>
                    Parent
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setRole('teacher')}
                  style={[styles.roleChip, role === 'teacher' && styles.roleChipActive]}
                >
                  <Ionicons
                    name="school-outline"
                    size={18}
                    color={role === 'teacher' ? '#fff' : colors.primary}
                  />
                  <Text style={[styles.roleChipText, role === 'teacher' && styles.roleChipTextActive]}>
                    Teacher
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.inputWrap}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  value={mobile}
                  onChangeText={(t) => setMobile(t.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  placeholder="10-digit mobile"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  maxLength={10}
                />
              </View>
            </View>

            <Button title="Send OTP" onPress={onSubmit} loading={busy} />
          </Card>

          <Text style={styles.foot}>
            Use the same mobile number that's registered with the school.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logoBadge: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  appName: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  tag: { color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  card: { gap: spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  prefix: { color: colors.textMuted, marginRight: spacing.sm, fontWeight: '700' },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  roleChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff',
  },
  roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleChipText: { color: colors.text, fontWeight: '700' },
  roleChipTextActive: { color: '#fff' },
  foot: { color: 'rgba(255,255,255,0.85)', marginTop: spacing.xl, textAlign: 'center' },
});

export default LoginScreen;
