import React, { useState, useEffect } from 'react';
import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
  Pressable, Modal, TextInput, FlatList, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { teacherReportsService, ExamMapping, TeacherReportStudent } from '../services/dataService';
import { ProgressReportCard } from '../components/ProgressReportCard';
import { colors, spacing } from '../theme';

type Student = TeacherReportStudent;

const TeacherReportsScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const [students, setStudents] = useState<Student[] | null>(null); // null = not yet fetched
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [reportType, setReportType] = useState<'performance' | 'progress' | null>(null);

  // Report data states
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<any | null>(null);

  // Progress-report exam picker state
  const [examPickerOpen, setExamPickerOpen] = useState(false);
  const [examMappingsLoading, setExamMappingsLoading] = useState(false);
  const [examMappings, setExamMappings] = useState<ExamMapping[]>([]);
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [selectedExam, setSelectedExam] = useState<ExamMapping | null>(null);

  // Filter the (already-fetched) student list locally by the search query.
  const filteredStudents: Student[] = React.useMemo(() => {
    if (!students || searchQuery.trim() === '') return [];
    const q = searchQuery.trim().toLowerCase();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.admission_number.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  // Lazily fetch the full student list the first time the user types.
  useEffect(() => {
    if (
      selectModalOpen &&
      searchQuery.trim().length > 0 &&
      students === null &&
      !studentsLoading
    ) {
      setStudentsLoading(true);
      teacherReportsService
        .getStudents()
        .then((data) => setStudents(data))
        .catch((e) => {
          console.error('Failed to load students:', e);
          setStudents([]);
        })
        .finally(() => setStudentsLoading(false));
    }
  }, [selectModalOpen, searchQuery, students, studentsLoading]);

  const openStudentSelector = (type: 'performance' | 'progress') => {
    setReportType(type);
    setSearchQuery('');
    setSelectModalOpen(true);
  };

  const selectStudent = async (student: Student) => {
    setSelectModalOpen(false);
    if (reportType === 'progress') {
      // Need to pick an exam first.
      setPendingStudent(student);
      setExamMappingsLoading(true);
      setExamPickerOpen(true);
      try {
        const list = await teacherReportsService.getExamMappings(student.class_section_id);
        setExamMappings(list);
      } catch (e: any) {
        setExamMappings([]);
      } finally {
        setExamMappingsLoading(false);
      }
      return;
    }

    // Performance report path
    setSelectedStudent(student);
    setReportOpen(true);
    setReportLoading(true);
    setReportData(null);
    try {
      const data = await teacherReportsService.getPerformanceReport(student.id);
      setReportData(data);
    } catch (e: any) {
      setReportData({ error: e?.response?.data?.detail || 'Failed to load report.' });
    } finally {
      setReportLoading(false);
    }
  };

  const selectExam = async (mapping: ExamMapping) => {
    if (!pendingStudent) return;
    setExamPickerOpen(false);
    setSelectedExam(mapping);
    setSelectedStudent(pendingStudent);
    setReportOpen(true);
    setReportLoading(true);
    setReportData(null);
    try {
      const card = await teacherReportsService.getProgressReportCard(
        pendingStudent.id,
        mapping.class_section_id,
        mapping.exam_type_id,
        mapping.academic_year_id,
      );
      if (!card) {
        setReportData({ error: 'No report card found for this student in the selected exam.' });
      } else {
        setReportData(card);
      }
    } catch (e: any) {
      setReportData({ error: e?.response?.data?.detail || 'Failed to load report.' });
    } finally {
      setReportLoading(false);
    }
  };

  const closeReport = () => {
    setReportOpen(false);
    setSelectedStudent(null);
    setReportType(null);
    setReportData(null);
    setPendingStudent(null);
    setSelectedExam(null);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Student Reports</Text>
        <Text style={styles.heroSub}>Generate performance and progress reports</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        {true && (
          <>
            <Card>
              <Text style={styles.sectionLabel}>Select Report Type</Text>
              <Pressable
                onPress={() => openStudentSelector('performance')}
                style={styles.reportRow}
              >
                <View style={[styles.iconBubble, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="stats-chart" size={22} color="#1d4ed8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>Student Performance Report</Text>
                  <Text style={styles.reportSub}>Attendance + exam marks summary</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>

              <Pressable
                onPress={() => openStudentSelector('progress')}
                style={styles.reportRow}
              >
                <View style={[styles.iconBubble, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="document-text" size={22} color="#92400e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTitle}>Student Progress Report</Text>
                  <Text style={styles.reportSub}>Comprehensive annual progress report</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            </Card>

            <Card>
              <Text style={styles.infoText}>
                💡 Tap on a report type above, then select a student to generate their report.
              </Text>
            </Card>
          </>
        )}
      </View>

      {/* Student Selection Modal */}
      <Modal
        visible={selectModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Select Student</Text>
              <Pressable onPress={() => setSelectModalOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>

            <View style={{ padding: spacing.md }}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or admission number"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <FlatList
              data={filteredStudents}
              keyExtractor={(item) => item.id.toString()}
              style={{ maxHeight: 400 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => selectStudent(item)}
                  style={styles.studentItem}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{item.name}</Text>
                    <Text style={styles.studentMeta}>
                      Adm. # {item.admission_number}
                      {item.class_name ? ` • ${item.class_name}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  {studentsLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : searchQuery.trim() === '' ? (
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                      Type a name or admission number to search.
                    </Text>
                  ) : (
                    <Text style={{ color: colors.textMuted }}>No students found</Text>
                  )}
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report Display Modal */}
      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={closeReport}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderText}>
                  {reportType === 'performance' ? 'Performance Report' : 'Progress Report'}
                </Text>
                {selectedStudent && (
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }}>
                    {selectedStudent.name}
                  </Text>
                )}
              </View>
              <Pressable onPress={closeReport}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: Dimensions.get('window').height * 0.65 }}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
            >
              {reportLoading && <ActivityIndicator color={colors.primary} />}
              {reportData?.error && <Text style={{ color: colors.danger }}>{reportData.error}</Text>}

              {/* Performance Report (multi-exam summary from /students/{id}/performance-report) */}
              {reportData && !reportData.error && reportType === 'performance' && (
                <View style={{ gap: spacing.md }}>
                  {reportData.student && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Student Details</Text>
                      <Text style={styles.modalLine}>
                        {(reportData.student.first_name || '') + ' ' + (reportData.student.surname || '')}
                      </Text>
                      <Text style={styles.modalMuted}>
                        Adm. # {reportData.student.admission_number || '—'}
                        {reportData.student.class_name ? ` • ${reportData.student.class_name}` : ''}
                      </Text>
                    </View>
                  )}

                  {reportData.attendance && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Attendance ({new Date().getFullYear()})</Text>
                      <View style={styles.statsGrid}>
                        <Stat label="Working Days" value={reportData.attendance.total_working_days} />
                        <Stat label="Present" value={reportData.attendance.days_present} color={colors.success} />
                        <Stat label="Absent" value={reportData.attendance.days_absent} color={colors.danger} />
                        <Stat label="Late" value={reportData.attendance.days_late} color={colors.warning} />
                      </View>
                      <Text style={[styles.modalLine, { marginTop: spacing.sm }]}>
                        Attendance: <Text style={{ fontWeight: '800', color: colors.primary }}>
                          {reportData.attendance.attendance_percentage}%
                        </Text>
                      </Text>
                    </View>
                  )}

                  <View>
                    <Text style={styles.modalSectionTitle}>Exam Marks</Text>
                    {Array.isArray(reportData.exams) && reportData.exams.length > 0 ? (
                      reportData.exams.map((ex: any, i: number) => (
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

                  {reportData.grade_scale && (
                    <View>
                      <Text style={styles.modalSectionTitle}>Grade Scale</Text>
                      {Object.entries(reportData.grade_scale).map(([g, range]) => (
                        <Text key={g} style={styles.modalLine}>
                          <Text style={{ fontWeight: '700' }}>{g}</Text> — {String(range)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Progress Report (single-exam report card from /results/report-cards/...) */}
              {reportData && !reportData.error && reportType === 'progress' && selectedExam && (
                <ProgressReportCard data={reportData} examName={selectedExam.exam_type_name} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exam Picker Modal (Progress Report) */}
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
                  No exams with marks found for this student.
                </Text>
              </View>
            ) : (
              <FlatList
                data={examMappings}
                keyExtractor={(m) => m.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable onPress={() => selectExam(item)} style={styles.studentItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{item.exam_type_name}</Text>
                      <Text style={styles.studentMeta}>
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
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4 },
  sectionLabel: { fontWeight: '800', color: colors.text, marginBottom: spacing.sm, fontSize: 14 },
  reportRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  iconBubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { fontWeight: '700', color: colors.text },
  reportSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  infoText: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, maxHeight: '85%', overflow: 'hidden' },
  modalHeader: {
    backgroundColor: colors.primary, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalHeaderText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg,
    borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  studentItem: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md,
  },
  studentName: { fontWeight: '700', color: colors.text, fontSize: 14 },
  studentMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modalSectionTitle: { fontWeight: '800', color: colors.text, fontSize: 15, marginBottom: spacing.sm },
  modalLine: { color: colors.text, lineHeight: 20, marginBottom: 4 },
  modalMuted: { color: colors.textMuted, fontSize: 13 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statBox: {
    flex: 1, minWidth: '45%', backgroundColor: colors.bg, padding: spacing.md,
    borderRadius: 8, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  examBlock: {
    backgroundColor: colors.bg, padding: spacing.md, borderRadius: 8,
    marginBottom: spacing.sm, gap: 4,
  },
  subjectRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
});

export default TeacherReportsScreen;
