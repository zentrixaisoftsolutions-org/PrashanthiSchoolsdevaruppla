import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, Pressable, Modal } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { attendanceService } from '../services/dataService';
import { colors, spacing, radius } from '../theme';

interface Day {
  date: string; day: number; weekday: string; status: string;
  scan_time?: string | null;
  check_out_time?: string | null;
}

interface StudentRow {
  student_id: number;
  student_name: string;
  summary?: { present: number; absent: number; late: number; total_days: number };
  days?: Day[];
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  present:    { bg: '#dcfce7', fg: '#166534', label: 'P' },
  absent:     { bg: '#fee2e2', fg: '#991b1b', label: 'A' },
  late:       { bg: '#fef3c7', fg: '#92400e', label: 'L' },
  half_day:   { bg: '#fde68a', fg: '#92400e', label: '½' },
  not_marked: { bg: '#f1f5f9', fg: '#64748b', label: '·' },
};

const AttendanceScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { studentId, name } = route.params as { studentId: number; name: string };
  const [data, setData] = useState<StudentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);

  const load = async () => {
    try {
      const res = await attendanceService.getMyChildren({
        from_date: undefined,
      } as any);
      // we actually need month/year; call again with proper params via direct axios
    } catch {}
    try {
      const r: any = await (await import('../services/api')).default.get('/attendance/my-children', {
        params: { month, year },
      });
      const mine = (r.data?.students || []).find((s: any) => s.student_id === studentId);
      setData(mine || null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month, year]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const stepMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  };

  const summary = data?.summary || { present: 0, absent: 0, late: 0, total_days: 0 };
  const pct = summary.total_days > 0
    ? Math.round(((summary.present + summary.late) / summary.total_days) * 100)
    : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Attendance</Text>
        <Text style={styles.heroSub}>{name}</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        <Card>
          <View style={styles.monthRow}>
            <Pressable onPress={() => stepMonth(-1)} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {new Date(year, month - 1).toLocaleString('default', { month: 'long' })} {year}
            </Text>
            <Pressable onPress={() => stepMonth(1)} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.success }]}>{summary.present}</Text>
              <Text style={styles.statLabel}>Present</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.warning }]}>{summary.late}</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.danger }]}>{summary.absent}</Text>
              <Text style={styles.statLabel}>Absent</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{pct}%</Text>
              <Text style={styles.statLabel}>%age</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Daily View</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : (
            <View style={styles.calGrid}>
              {(data?.days || []).map(d => {
                const sc = STATUS_COLOR[d.status] || STATUS_COLOR.not_marked;
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => setSelectedDay(d)}
                    style={({ pressed }) => [
                      styles.calCell,
                      { backgroundColor: sc.bg, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.calDay}>{d.day}</Text>
                    <Text style={[styles.calStatus, { color: sc.fg }]}>{sc.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
            <Pill label="P = Present" tone="success" />
            <Pill label="L = Late" tone="warning" />
            <Pill label="A = Absent" tone="danger" />
          </View>
        </Card>
      </View>

      <Modal
        visible={!!selectedDay}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedDay(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {selectedDay && (() => {
              const sc = STATUS_COLOR[selectedDay.status] || STATUS_COLOR.not_marked;
              const dt = new Date(selectedDay.date);
              const dateLabel = dt.toLocaleDateString('default', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              });
              const statusText = selectedDay.status === 'not_marked'
                ? 'Not Marked'
                : selectedDay.status.charAt(0).toUpperCase() + selectedDay.status.slice(1).replace('_', ' ');
              const timeText = selectedDay.scan_time
                ? new Date(selectedDay.scan_time).toLocaleTimeString('default', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })
                : null;
              const outText = selectedDay.check_out_time
                ? new Date(selectedDay.check_out_time).toLocaleTimeString('default', {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })
                : null;
              return (
                <>
                  <View style={[styles.modalHeader, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.modalDay, { color: sc.fg }]}>{selectedDay.day}</Text>
                    <Text style={[styles.modalStatus, { color: sc.fg }]}>{statusText}</Text>
                  </View>
                  <View style={styles.modalBody}>
                    <View style={styles.modalRow}>
                      <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                      <Text style={styles.modalRowText}>{dateLabel}</Text>
                    </View>
                    {timeText ? (
                      <View style={styles.modalRow}>
                        <Ionicons name="log-in-outline" size={18} color={colors.success} />
                        <Text style={styles.modalRowText}>Came in at {timeText}</Text>
                      </View>
                    ) : (
                      <View style={styles.modalRow}>
                        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                        <Text style={styles.modalRowText}>No check-in time recorded</Text>
                      </View>
                    )}
                    {outText ? (
                      <View style={styles.modalRow}>
                        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                        <Text style={styles.modalRowText}>Checked out at {outText}</Text>
                      </View>
                    ) : (
                      <View style={styles.modalRow}>
                        <Ionicons name="log-out-outline" size={18} color={colors.textMuted} />
                        <Text style={styles.modalRowText}>No check-out time recorded</Text>
                      </View>
                    )}
                    <Pressable onPress={() => setSelectedDay(null)} style={styles.modalCloseBtn}>
                      <Text style={styles.modalCloseText}>Close</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { padding: 8 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontWeight: '800', color: colors.text, marginBottom: spacing.md, fontSize: 15 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calCell: {
    width: 38, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  calDay: { fontSize: 12, fontWeight: '700', color: colors.text },
  calStatus: { fontSize: 11, fontWeight: '800' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: '#fff',
    borderRadius: radius.md, overflow: 'hidden',
  },
  modalHeader: {
    paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  modalDay: { fontSize: 36, fontWeight: '900' },
  modalStatus: { fontSize: 14, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  modalBody: { padding: spacing.lg, gap: spacing.md },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modalRowText: { color: colors.text, fontSize: 14, flex: 1 },
  modalCloseBtn: {
    marginTop: spacing.sm, alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.sm,
  },
  modalCloseText: { color: '#fff', fontWeight: '700' },
});

export default AttendanceScreen;
