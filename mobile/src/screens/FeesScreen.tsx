import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { feesService } from '../services/dataService';
import { colors, spacing, radius } from '../theme';

const inr = (v: number) => `₹${(v || 0).toLocaleString('en-IN')}`;

const FeesScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { studentId, name } = route.params as { studentId: number; name: string };
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await feesService.getMyChildren();
      const mine = (r.students || []).find((s: any) => s.student_id === studentId);
      setData(mine || null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Fees</Text>
        <Text style={styles.heroSub}>{name}</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        {loading && <ActivityIndicator color={colors.primary} />}

        {!loading && data && (
          <>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={styles.muted}>Total fees</Text>
                  <Text style={styles.bigNum}>{inr(data.fees_total)}</Text>
                </View>
                <View>
                  <Text style={styles.muted}>Paid</Text>
                  <Text style={[styles.bigNum, { color: colors.success }]}>{inr(data.fees_paid)}</Text>
                </View>
                <View>
                  <Text style={styles.muted}>Pending</Text>
                  <Text style={[styles.bigNum, { color: data.fees_pending > 0 ? colors.danger : colors.success }]}>
                    {inr(data.fees_pending)}
                  </Text>
                </View>
              </View>
            </Card>

            {(data.terms || []).map((t: any) => (
              <Card key={t.term}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.cardTitle}>Term {t.term}</Text>
                  <Pill
                    label={t.pending > 0 ? `Due ${inr(t.pending)}` : 'Cleared'}
                    tone={t.pending > 0 ? 'danger' : 'success'}
                  />
                </View>
                <View style={{ marginTop: spacing.sm, gap: 6 }}>
                  {(t.items || []).map((it: any, idx: number) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemLabel}>{it.fee_type}</Text>
                      <Text style={styles.itemAmount}>{inr(it.amount)}</Text>
                    </View>
                  ))}
                  <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }]}>
                    <Text style={[styles.itemLabel, { fontWeight: '800' }]}>Term total</Text>
                    <Text style={[styles.itemAmount, { fontWeight: '800' }]}>{inr(t.total)}</Text>
                  </View>
                  <View style={styles.itemRow}>
                    <Text style={[styles.itemLabel, { color: colors.success }]}>Paid</Text>
                    <Text style={[styles.itemAmount, { color: colors.success }]}>{inr(t.paid)}</Text>
                  </View>
                </View>
              </Card>
            ))}

            <Card>
              <Text style={styles.cardTitle}>Recent Payments</Text>
              {(data.payments || []).length === 0 && (
                <Text style={styles.muted}>No payments yet.</Text>
              )}
              {(data.payments || []).map((p: any) => (
                <View key={p.id} style={styles.payRow}>
                  <View>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{inr(p.amount)}</Text>
                    <Text style={styles.muted}>
                      {p.date ? new Date(p.date).toLocaleDateString() : '—'}
                      {p.term ? ` • Term ${p.term}` : ''}
                      {p.mode ? ` • ${p.mode}` : ''}
                    </Text>
                  </View>
                  {p.receipt_number && <Pill label={`#${p.receipt_number}`} tone="info" />}
                </View>
              ))}
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: 12 },
  bigNum: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemLabel: { color: colors.text },
  itemAmount: { color: colors.text },
  payRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});

export default FeesScreen;
