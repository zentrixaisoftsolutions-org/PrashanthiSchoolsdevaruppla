import React, { useEffect, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
  RefreshControl, Pressable, Modal, Dimensions, FlatList,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { resultsService, parentService, ExamMapping } from '../services/dataService';
import { ProgressReportCard } from '../components/ProgressReportCard';
import { colors, spacing, radius } from '../theme';

const ResultsScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { studentId, name } = route.params as { studentId: number; name: string };
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [perfOpen, setPerfOpen] = useState(false);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfData, setPerfData] = useState<any | null>(null);

  const [annualOpen, setAnnualOpen] = useState(false);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [annualData, setAnnualData] = useState<any | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressData, setProgressData] = useState<any | null>(null);
  const [progressExam, setProgressExam] = useState<ExamMapping | null>(null);

  // Exam picker for progress report
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [examMappingsLoading, setExamMappingsLoading] = useState(false);
  const [examMappings, setExamMappings] = useState<ExamMapping[]>([]);
  const [child, setChild] = useState<any | null>(null);

  const load = async () => {
    try {
      const r = await resultsService.getMyChildren();
      const mine = (r.students || []).find((s: any) => s.student_id === studentId);
      setExams(mine?.exams || []);
      // Fetch parent's children to get class_name + section for this student.
      try {
        const kids = await parentService.getChildren();
        const c = kids.find((k) => k.id === studentId);
        if (c) setChild(c);
      } catch {}
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openPerformance = async () => {
    setPerfOpen(true);
    if (perfData) return;
    setPerfLoading(true);
    try {
      const data = await parentService.getPerformanceReport(studentId);
      setPerfData(data);
    } catch (e: any) {
      setPerfData({ error: e?.response?.data?.detail || 'Failed to load report.' });
    } finally { setPerfLoading(false); }
  };

  const openAnnual = async () => {
    setAnnualOpen(true);
    if (annualData) return;
    setAnnualLoading(true);
    try {
      const data = await parentService.getAnnualReport(studentId);
      setAnnualData(data);
    } catch (e: any) {
      setAnnualData({ error: e?.response?.data?.detail || 'Failed to load report.' });
    } finally { setAnnualLoading(false); }
  };

  const openProgress = async () => {
    // Load available exams (filtered by child's class+section) and let the user pick one.
    setExamPickerOpen(true);
    if (examMappings.length > 0) return;
    setExamMappingsLoading(true);
    try {
      const list = await parentService.getProgressExamOptions(
        child?.class_name || null,
        child?.section || null,
      );
      setExamMappings(list);
    } catch {
      setExamMappings([]);
    } finally {
      setExamMappingsLoading(false);
    }
  };

  const selectProgressExam = async (mapping: ExamMapping) => {
    setExamPickerOpen(false);
    setProgressExam(mapping);
    setProgressOpen(true);
    setProgressLoading(true);
    setProgressData(null);
    try {
      const card = await parentService.getProgressReportCard(
        studentId,
        mapping.class_section_id,
        mapping.exam_type_id,
        mapping.academic_year_id,
      );
      if (!card) {
        setProgressData({ error: 'No report card found for this exam.' });
      } else {
        setProgressData(card);
      }
    } catch (e: any) {
      setProgressData({ error: e?.response?.data?.detail || 'Failed to load report.' });
    } finally {
      setProgressLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Results</Text>
        <Text style={styles.heroSub}>{name}</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && exams.length === 0 && (
          <Card><Text style={{ color: colors.textMuted }}>No exam results published yet.</Text></Card>
        )}
        {exams.map((e, i) => (
          <Card key={i}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.title}>{e.exam_name}</Text>
              <Pill
                label={`${e.overall_percentage}%`}
                tone={e.overall_percentage >= 75 ? 'success' : e.overall_percentage >= 50 ? 'info' : 'warning'}
              />
            </View>
            <Text style={styles.muted}>
              {e.total_obtained} / {e.total_max}
            </Text>
            <View style={{ marginTop: spacing.sm, gap: 4 }}>
              {(e.subjects || []).map((s: any, idx: number) => (
                <View key={idx} style={styles.row}>
                  <Text style={[styles.subject, { flex: 1 }]}>{s.subject}</Text>
                  <Text style={styles.marks}>
                    {s.is_absent ? 'AB' : `${s.marks_obtained}/${s.max_marks}`}
                  </Text>
                  <View style={{ width: 50, alignItems: 'flex-end' }}>
                    <Pill label={s.grade || '—'} tone={s.percentage >= 75 ? 'success' : s.percentage >= 50 ? 'info' : 'warning'} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ))}

        {!loading && (
          <Card>
            <Text style={styles.sectionLabel}>Reports</Text>
            <Pressable onPress={openPerformance} style={styles.reportRow}>
              <View style={[styles.iconBubble, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="stats-chart" size={20} color="#1d4ed8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportTitle}>Performance Report</Text>
                <Text style={styles.reportSub}>Attendance + marks summary</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={openProgress} style={styles.reportRow}>
              <View style={[styles.iconBubble, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="trending-up" size={20} color="#15803d" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportTitle}>Progress Report</Text>
                <Text style={styles.reportSub}>Comprehensive academic progress overview</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={openAnnual} style={styles.reportRow}>
              <View style={[styles.iconBubble, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="document-text" size={20} color="#92400e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportTitle}>Annual Report</Text>
                <Text style={styles.reportSub}>Year-end consolidated report (if generated)</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </Card>
        )}
      </View>

      <Modal visible={perfOpen} transparent animationType="fade" onRequestClose={() => setPerfOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Performance Report</Text>
              <Pressable onPress={() => setPerfOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: Dimensions.get('window').height * 0.65 }}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
            >
              {perfLoading && <ActivityIndicator color={colors.primary} />}
              {perfData?.error && <Text style={{ color: colors.danger }}>{perfData.error}</Text>}
              {perfData && !perfData.error && (
                <View style={{ gap: spacing.md }}>
                  {perfData.student && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Student</Text>
                      <Text style={styles.modalLine}>
                        {(perfData.student.first_name || '') + ' ' + (perfData.student.surname || '')}
                      </Text>
                      <Text style={styles.modalMuted}>
                        Adm. # {perfData.student.admission_number || '—'}
                        {perfData.student.class_name ? ` • ${perfData.student.class_name}` : ''}
                      </Text>
                    </View>
                  )}

                  {perfData.attendance && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Attendance ({new Date().getFullYear()})</Text>
                      <View style={styles.statsGrid}>
                        <Stat label="Working Days" value={perfData.attendance.total_working_days} />
                        <Stat label="Present" value={perfData.attendance.days_present} color={colors.success} />
                        <Stat label="Absent" value={perfData.attendance.days_absent} color={colors.danger} />
                        <Stat label="Late" value={perfData.attendance.days_late} color={colors.warning} />
                      </View>
                      <Text style={[styles.modalLine, { marginTop: spacing.sm }]}>
                        Attendance: <Text style={{ fontWeight: '800', color: colors.primary }}>
                          {perfData.attendance.attendance_percentage}%
                        </Text>
                      </Text>
                    </View>
                  )}

                  <View>
                    <Text style={styles.modalSectionTitle}>Exam Marks</Text>
                    {Array.isArray(perfData.exams) && perfData.exams.length > 0 ? (
                      perfData.exams.map((ex: any, i: number) => (
                        <View key={i} style={styles.examBlock}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{ex.exam_name}</Text>
                            <Text style={{ color: colors.primary, fontWeight: '700' }}>
                              {ex.overall_grade || ''}{ex.average_gpa ? ` · GPA ${ex.average_gpa}` : ''}
                            </Text>
                          </View>
                          <Text style={styles.modalMuted}>
                            Total: {ex.total_marks_obtained} / {ex.total_max_marks}
                          </Text>
                          {Array.isArray(ex.subjects) && ex.subjects.length > 0 && (
                            <View style={{ marginTop: spacing.sm, gap: 2 }}>
                              {ex.subjects.map((s: any, j: number) => (
                                <View key={j} style={styles.subjectRow}>
                                  <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>
                                    {s.subject_name}
                                  </Text>
                                  <Text style={{ width: 70, textAlign: 'right', fontWeight: '700', color: colors.text, fontSize: 13 }}>
                                    {s.is_absent ? 'AB' : `${s.marks_obtained}/${s.total_marks}`}
                                  </Text>
                                  <Text style={{ width: 40, textAlign: 'right', color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                                    {s.grade || '—'}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))
                    ) : (
                      <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
                        <Ionicons name="document-outline" size={32} color={colors.textMuted} />
                        <Text style={[styles.modalMuted, { marginTop: 4 }]}>
                          No exam marks published yet.
                        </Text>
                      </View>
                    )}
                  </View>

                  {perfData.grade_scale && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Grade Scale</Text>
                      {Object.entries(perfData.grade_scale).map(([g, range]) => (
                        <Text key={g} style={styles.modalLine}>
                          <Text style={{ fontWeight: '700' }}>{g}</Text> — {String(range)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={annualOpen} transparent animationType="fade" onRequestClose={() => setAnnualOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAnnualOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Annual Report</Text>
              <Pressable onPress={() => setAnnualOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={{ padding: spacing.lg }}>
              {annualLoading && <ActivityIndicator color={colors.primary} />}
              {annualData?.error && <Text style={{ color: colors.danger }}>{annualData.error}</Text>}
              {annualData && !annualData.error && annualData.available === false && (
                <View style={{ alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
                  <Ionicons name="time-outline" size={42} color={colors.textMuted} />
                  <Text style={styles.modalLine}>
                    {annualData.message || 'Annual report has not been generated yet.'}
                  </Text>
                </View>
              )}
              {annualData && annualData.available && (
                <Text style={styles.modalLine}>Annual report available.</Text>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={progressOpen} transparent animationType="fade" onRequestClose={() => setProgressOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Progress Report</Text>
              <Pressable onPress={() => setProgressOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: Dimensions.get('window').height * 0.65 }}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
            >
              {progressLoading && <ActivityIndicator color={colors.primary} />}
              {progressData?.error && <Text style={{ color: colors.danger }}>{progressData.error}</Text>}
              {progressData && !progressData.error && progressExam && (
                <ProgressReportCard data={progressData} examName={progressExam.exam_type_name} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exam picker for Progress Report */}
      <Modal
        visible={examPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setExamPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Select Exam</Text>
              <Pressable onPress={() => setExamPickerOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            {examMappingsLoading ? (
              <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : examMappings.length === 0 ? (
              <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                  No exams with marks available yet.
                </Text>
              </View>
            ) : (
              <FlatList
                data={examMappings}
                keyExtractor={(m) => m.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => selectProgressExam(item)} style={styles.reportRow}>
                    <View style={[styles.iconBubble, { backgroundColor: '#dcfce7' }]}>
                      <Ionicons name="school" size={20} color="#15803d" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportTitle}>{item.exam_type_name}</Text>
                      <Text style={styles.reportSub}>
                        {item.class_name} - {item.section_name}
                        {item.academic_year_name ? ` • ${item.academic_year_name}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const Stat: React.FC<{ label: string; value: any; color?: string }> = ({ label, value, color }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, color ? { color } : null]}>{value ?? '—'}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  title: { fontWeight: '800', color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  subject: { color: colors.text },
  marks: { color: colors.text, fontWeight: '700', width: 70, textAlign: 'right' },
  sectionLabel: { fontWeight: '800', color: colors.text, marginBottom: spacing.sm, fontSize: 14 },
  reportRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  iconBubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { fontWeight: '700', color: colors.text },
  reportSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff',
    borderRadius: radius.md, overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  modalHeaderText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  modalSectionTitle: { fontWeight: '800', color: colors.text, marginBottom: 4 },
  modalLine: { color: colors.text, fontSize: 14 },
  modalMuted: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statBox: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: '#f8fafc',
    padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center',
  },
  statValue: { fontWeight: '800', fontSize: 18, color: colors.text },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  examBlock: {
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4, paddingHorizontal: spacing.sm,
    backgroundColor: '#f8fafc', borderRadius: radius.sm,
  },
});

export default ResultsScreen;
