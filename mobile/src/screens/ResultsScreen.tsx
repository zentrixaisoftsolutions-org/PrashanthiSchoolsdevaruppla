import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, FlatList, Dimensions, Platform, StatusBar,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Types ──
interface AcademicYear { id: number; name: string; is_current: boolean; }
interface ExamType { id: number; name: string; }
interface ClassSection { id: number; class_name: string; section_name: string; }

interface ExamMapping {
  id: string;
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  class_section_id: number;
  class_name: string;
  section_name: string;
  grade_type: string;
  status: string;
  students_count: number;
  marks_count: number;
  created_at: string | null;
}

interface SubjectMark {
  subject_id: number; subject_name: string;
  marks_obtained: number | null; max_marks: number; min_marks: number;
  grade: string; grade_point: number; teacher_remarks: string;
  is_absent: boolean; class_topper: number; class_average: number;
}

interface ReportCard {
  student_id: number; student_name: string; admission_number: string;
  father_name: string; class_name: string; section_name: string;
  subject_marks: SubjectMark[]; total_marks: number; total_max_marks: number;
  percentage: number; grade: string; gpa: number; total_gpa: number;
  general_remarks: string; class_rank: number; total_students: number;
}

interface GradeScale { grade: string; range: string; points: number; min_pct: number; max_pct: number; }

interface ReportCardsResponse {
  exam_name: string; academic_year: string | null;
  class_name: string; section_name: string;
  grade_scale: GradeScale[]; report_cards: ReportCard[];
}

// ── Picker Modal ──
const PickerModal = ({ visible, onClose, title, data, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: any }[]; onSelect: (v: any) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
      <View style={ms.sheet}>
        <Text style={ms.sheetTitle}>{title}</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={ms.sheetItem} onPress={() => { onSelect(item.value); onClose(); }}>
              <Text style={ms.sheetItemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={ms.cancelBtn} onPress={onClose}>
          <Text style={ms.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 20 },
  sheetTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetItemText: { fontSize: 15, color: COLORS.text },
  cancelBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
});

const ResultsScreen = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Filters
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
  const [filteredSections, setFilteredSections] = useState<string[]>([]);

  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');

  // Data
  const [examMappings, setExamMappings] = useState<ExamMapping[]>([]);
  const [reportData, setReportData] = useState<ReportCardsResponse | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // UI
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState('');
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({ visible: false, title: '', data: [], onSelect: () => {} });
  const [reportPickerModal, setReportPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({ visible: false, title: '', data: [], onSelect: () => {} });

  useEffect(() => {
    (async () => {
      try {
        const [years, classes] = await Promise.all([
          apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS),
          apiClient.get<ClassSection[]>(API_ENDPOINTS.CLASS_SECTIONS),
        ]);
        setAcademicYears(years);
        setClassSections(classes);
        const unique = [...new Set(classes.map((cs: ClassSection) => cs.class_name))];
        setUniqueClasses(unique);
        const current = years.find((y: AcademicYear) => y.is_current);
        if (current) setSelectedYearId(current.id);
      } catch { setError('Failed to load data'); }
      finally { setInitialLoading(false); }
    })();
  }, []);

  // Load exam types when year changes
  useEffect(() => {
    if (selectedYearId) {
      apiClient.get<ExamType[]>(`${API_ENDPOINTS.EXAM_TYPES}?academic_year_id=${selectedYearId}`)
        .then(setExamTypes).catch(() => setExamTypes([]));
    } else { setExamTypes([]); }
  }, [selectedYearId]);

  // Filter sections when class changes
  useEffect(() => {
    if (selectedClass) {
      const sects = classSections
        .filter(cs => cs.class_name === selectedClass)
        .map(cs => cs.section_name)
        .filter((v, i, a) => a.indexOf(v) === i);
      setFilteredSections(sects);
      setSelectedSection('');
    } else { setFilteredSections([]); setSelectedSection(''); }
  }, [selectedClass, classSections]);

  const handleSearch = async () => {
    setLoading(true); setError('');
    try {
      let url = `${API_ENDPOINTS.RESULTS}/exam-mappings?`;
      const params: string[] = [];
      if (selectedYearId) params.push(`academic_year_id=${selectedYearId}`);
      if (selectedExamId) params.push(`exam_type_id=${selectedExamId}`);
      if (selectedClass) params.push(`class_name=${encodeURIComponent(selectedClass)}`);
      if (selectedSection) params.push(`section_name=${encodeURIComponent(selectedSection)}`);
      url += params.join('&');
      const data = await apiClient.get<ExamMapping[]>(url);
      setExamMappings(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load results');
    } finally { setLoading(false); }
  };

  const handleReset = () => {
    setSelectedExamId(null); setSelectedClass(''); setSelectedSection('');
    setExamMappings([]); setError('');
  };

  const handleViewReport = async (mapping: ExamMapping) => {
    setReportLoading(true); setError('');
    try {
      let url = `${API_ENDPOINTS.RESULTS}/report-cards/${mapping.exam_type_id}/${mapping.class_section_id}`;
      if (mapping.academic_year_id) url += `?academic_year_id=${mapping.academic_year_id}`;
      const data = await apiClient.get<ReportCardsResponse>(url);
      setReportData(data);
      setSelectedStudentId(null);
      setShowReport(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load report cards');
    } finally { setReportLoading(false); }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return COLORS.success;
    if (grade.startsWith('B')) return COLORS.info;
    if (grade.startsWith('C')) return COLORS.warning;
    return COLORS.error;
  };

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  const selectedYearName = academicYears.find(y => y.id === selectedYearId)?.name || 'Select Year';
  const selectedExamName = examTypes.find(e => e.id === selectedExamId)?.name || 'Select Exam';

  const reportCards = reportData ? (selectedStudentId ? reportData.report_cards.filter(c => c.student_id === selectedStudentId) : reportData.report_cards) : [];

  if (initialLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <PickerModal {...pickerModal} onClose={() => setPickerModal(p => ({ ...p, visible: false }))} />

      <ScrollView style={styles.container}>
        {/* Filter Card */}
        <View style={styles.card}>
          <View style={[styles.cardHeader, { backgroundColor: COLORS.primary }]}><Text style={styles.cardTitle}>RESULTS</Text></View>
          <View style={styles.cardBody}>
            <Text style={styles.label}>Academic Year</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
              visible: true, title: 'Academic Year',
              data: academicYears.map(y => ({ label: y.name, value: y.id })),
              onSelect: setSelectedYearId,
            })}>
              <Text style={styles.dropdownText}>{selectedYearName}</Text><Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Select Exam</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
              visible: true, title: 'Select Exam',
              data: [{ label: '-- All Exams --', value: null }, ...examTypes.map(e => ({ label: e.name, value: e.id }))],
              onSelect: setSelectedExamId,
            })}>
              <Text style={styles.dropdownText}>{selectedExamName}</Text><Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Class</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
              visible: true, title: 'Class',
              data: [{ label: '-- All Classes --', value: '' }, ...uniqueClasses.map(c => ({ label: c, value: c }))],
              onSelect: setSelectedClass,
            })}>
              <Text style={styles.dropdownText}>{selectedClass || 'Select Class'}</Text><Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>

            {selectedClass ? (
              <>
                <Text style={styles.label}>Section</Text>
                <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
                  visible: true, title: 'Section',
                  data: [{ label: '-- All Sections --', value: '' }, ...filteredSections.map(s => ({ label: s, value: s }))],
                  onSelect: setSelectedSection,
                })}>
                  <Text style={styles.dropdownText}>{selectedSection || 'Select Section'}</Text><Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.primary }]} onPress={handleSearch} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'Searching...' : 'Search'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#ea580c' }]} onPress={handleReset}>
                <Text style={styles.btnText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* Exam Mappings */}
        {examMappings.length > 0 && (
          <View style={styles.card}>
            <View style={[styles.cardHeader, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.cardTitle}>EXAM RESULTS ({examMappings.length})</Text>
            </View>
            {examMappings.map((mapping, idx) => (
              <View key={mapping.id} style={[styles.mappingRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.primary }}>{mapping.exam_type_name}</Text>
                  <Text style={{ fontSize: 12, color: COLORS.text, marginTop: 2 }}>{mapping.class_name} - {mapping.section_name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <View style={[styles.badge, { backgroundColor: mapping.status === 'Complete' ? '#dcfce7' : '#fef9c3' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: mapping.status === 'Complete' ? '#166534' : '#854d0e' }}>{mapping.status}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>{formatDate(mapping.created_at)}</Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.viewBtn]} onPress={() => handleViewReport(mapping)}
                  disabled={reportLoading}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>
                    {reportLoading ? '...' : 'View'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {!loading && examMappings.length === 0 && (
          <Text style={{ textAlign: 'center', color: COLORS.textSecondary, marginTop: 30, fontSize: 14 }}>
            Use filters above to search for exam results.
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Report Cards Modal */}
      <Modal visible={showReport} animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <PickerModal {...reportPickerModal} onClose={() => setReportPickerModal(p => ({ ...p, visible: false }))} />
          {/* Header */}
          <View style={{ backgroundColor: COLORS.primary, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 50, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setShowReport(false)} style={{ paddingRight: 12, paddingVertical: 4 }}>
              <Text style={{ color: '#fff', fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Report Cards</Text>
              {reportData && <Text style={{ color: '#e0e7ff', fontSize: 12 }}>{reportData.exam_name} • {reportData.class_name} - {reportData.section_name}</Text>}
            </View>
            <TouchableOpacity onPress={() => setShowReport(false)} style={{ padding: 8 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Student selector */}
          {reportData && (
            <TouchableOpacity style={{ backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => setReportPickerModal({
                visible: true, title: 'Select Student',
                data: [{ label: `All Students (${reportData.report_cards.length})`, value: null },
                  ...reportData.report_cards.map(c => ({ label: `${c.student_name} (${c.admission_number})`, value: c.student_id }))],
                onSelect: setSelectedStudentId,
              })}>
              <Text style={{ fontSize: 13, color: COLORS.primary, fontWeight: '600' }}>
                {selectedStudentId ? reportData.report_cards.find(c => c.student_id === selectedStudentId)?.student_name || 'Selected' : `All Students (${reportData.report_cards.length})`} ▼
              </Text>
            </TouchableOpacity>
          )}

          {/* Report Cards */}
          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {reportCards.map(card => (
              <View key={card.student_id} style={styles.reportCard}>
                {/* Student Info */}
                <View style={styles.rcHeader}>
                  <View style={styles.rcAvatar}>
                    <Text style={styles.rcAvatarText}>{card.student_name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#fff' }}>{card.student_name}</Text>
                    <Text style={{ fontSize: 12, color: '#e0e7ff' }}>{card.admission_number} • {card.class_name}-{card.section_name}</Text>
                    {card.father_name ? <Text style={{ fontSize: 11, color: '#c7d2fe' }}>Father: {card.father_name}</Text> : null}
                  </View>
                </View>

                {/* Summary Stats */}
                <View style={{ flexDirection: 'row', padding: 12, gap: 6 }}>
                  <View style={[styles.statBox, { backgroundColor: '#f0f9ff' }]}>
                    <Text style={[styles.statValue, { color: '#1e40af' }]}>{card.total_marks}/{card.total_max_marks}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#faf5ff' }]}>
                    <Text style={[styles.statValue, { color: '#7e22ce' }]}>{card.percentage}%</Text>
                    <Text style={styles.statLabel}>Percentage</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[styles.statValue, { color: COLORS.success }]}>{card.grade}</Text>
                    <Text style={styles.statLabel}>Grade</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#fffbeb' }]}>
                    <Text style={[styles.statValue, { color: '#d97706' }]}>{card.gpa}/{card.total_gpa}</Text>
                    <Text style={styles.statLabel}>GPA</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#fef2f2' }]}>
                    <Text style={[styles.statValue, { color: '#dc2626' }]}>{card.class_rank}{getOrdinalSuffix(card.class_rank)}</Text>
                    <Text style={styles.statLabel}>Rank</Text>
                  </View>
                </View>

                {/* Subject Marks */}
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 }}>Subject-wise Performance</Text>
                  {card.subject_marks.map((mark, idx) => {
                    const isFail = !mark.is_absent && mark.marks_obtained !== null && mark.marks_obtained < mark.min_marks;
                    const pct = mark.marks_obtained !== null && mark.max_marks > 0 ? (mark.marks_obtained / mark.max_marks) * 100 : 0;
                    return (
                      <View key={mark.subject_id} style={[styles.subjectRow, isFail && { backgroundColor: '#fef2f2' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.subjectName, isFail && { color: COLORS.error }]}>{mark.subject_name}</Text>
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: isFail ? COLORS.error : COLORS.primary }]} />
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', minWidth: 70 }}>
                          <Text style={[styles.markText, isFail && { color: COLORS.error }]}>
                            {mark.is_absent ? 'AB' : mark.marks_obtained !== null ? `${mark.marks_obtained}/${mark.max_marks}` : '-'}
                          </Text>
                          <View style={[styles.gradePill, { backgroundColor: getGradeColor(mark.grade) + '20' }]}>
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: getGradeColor(mark.grade) }}>{mark.grade}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* Comparison bars */}
                  {card.subject_marks.length > 0 && (
                    <View style={{ marginTop: 12, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: COLORS.text, marginBottom: 6 }}>📊 Performance Comparison</Text>
                      {card.subject_marks.map(mark => {
                        const topperPct = mark.max_marks > 0 ? (mark.class_topper / mark.max_marks) * 100 : 0;
                        const avgPct = mark.max_marks > 0 ? (mark.class_average / mark.max_marks) * 100 : 0;
                        const studentPct = mark.marks_obtained !== null && mark.max_marks > 0 ? (mark.marks_obtained / mark.max_marks) * 100 : 0;
                        return (
                          <View key={`cmp-${mark.subject_id}`} style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 10, color: COLORS.text, marginBottom: 3 }}>{mark.subject_name}</Text>
                            <View style={{ flexDirection: 'row', gap: 3 }}>
                              <View style={{ flex: 1 }}>
                                <View style={{ height: 10, backgroundColor: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                                  <View style={{ height: '100%', width: `${Math.min(topperPct, 100)}%`, backgroundColor: COLORS.success, borderRadius: 5 }} />
                                </View>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ height: 10, backgroundColor: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                                  <View style={{ height: '100%', width: `${Math.min(avgPct, 100)}%`, backgroundColor: COLORS.warning, borderRadius: 5 }} />
                                </View>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ height: 10, backgroundColor: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                                  <View style={{ height: '100%', width: `${Math.min(studentPct, 100)}%`, backgroundColor: COLORS.primary, borderRadius: 5 }} />
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.success }} />
                          <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Topper</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.warning }} />
                          <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Average</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.primary }} />
                          <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Student</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Remarks */}
                  {card.general_remarks ? (
                    <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>Remarks</Text>
                      <Text style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>{card.general_remarks}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

            {reportCards.length === 0 && (
              <Text style={{ textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 }}>No report cards found.</Text>
            )}

            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  cardHeader: { paddingVertical: 10, paddingHorizontal: 14 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#fff', letterSpacing: 1 },
  cardBody: { padding: 14 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 10 },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12 },
  dropdownText: { fontSize: 14, color: COLORS.text },
  dropdownArrow: { fontSize: 10, color: COLORS.textSecondary },
  btn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorBox: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: COLORS.error, padding: 12, borderRadius: 6, marginBottom: 12 },
  errorText: { color: COLORS.error, fontSize: 13 },
  mappingRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  viewBtn: { padding: 8, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 6 },
  // Report Card styles
  reportCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden', elevation: 3 },
  rcHeader: { backgroundColor: COLORS.primary, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rcAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  rcAvatarText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  statBox: { flex: 1, padding: 8, borderRadius: 8, alignItems: 'center' },
  statValue: { fontSize: 12, fontWeight: 'bold' },
  statLabel: { fontSize: 8, color: COLORS.textSecondary, marginTop: 2 },
  subjectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  subjectName: { fontSize: 13, fontWeight: '500', color: COLORS.text, marginBottom: 4 },
  barTrack: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  markText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  gradePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
});

export default ResultsScreen;
