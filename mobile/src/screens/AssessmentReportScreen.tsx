import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Modal, FlatList, RefreshControl,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

// ── Types ──
interface FilterOption { id: number; name: string; }

interface BandStudent {
  student_id: number;
  student_name: string;
  admission_number: string;
  total_obtained: number;
  total_max: number;
  percentage: number;
  grade: string;
  cgpa: number;
  failed_subjects: string[];
}

interface GpaBand {
  label: string;
  gpa_floor: number;
  count: number;
  students: BandStudent[];
}

interface AssessmentReport {
  class_name: string;
  section_name: string;
  total_students: number;
  students_with_marks: number;
  bands: GpaBand[];
  failed_students: BandStudent[];
}

// ── Picker Modal ──
const PickerModal = ({ visible, onClose, title, data, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: any }[]; onSelect: (v: any) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={pm.sheet}>
        <Text style={pm.sheetTitle}>{title}</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={pm.sheetItem} onPress={() => { onSelect(item.value); onClose(); }}>
              <Text style={pm.sheetItemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
          <Text style={pm.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 20 },
  sheetTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetItemText: { fontSize: 15, color: COLORS.text },
  cancelBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
});

// Band color helpers
const bandBg = (floor: number) => {
  if (floor === 10) return '#f0fdf4';
  if (floor >= 8) return '#eff6ff';
  if (floor >= 6) return '#fefce8';
  if (floor >= 4) return '#fff7ed';
  return '#fef2f2';
};
const bandBorder = (floor: number) => {
  if (floor === 10) return '#86efac';
  if (floor >= 8) return '#93c5fd';
  if (floor >= 6) return '#fde047';
  if (floor >= 4) return '#fdba74';
  return '#fca5a5';
};
const bandHeaderBg = (floor: number) => {
  if (floor === 10) return '#dcfce7';
  if (floor >= 8) return '#dbeafe';
  if (floor >= 6) return '#fef9c3';
  if (floor >= 4) return '#ffedd5';
  return '#fee2e2';
};
const bandHeaderText = (floor: number) => {
  if (floor === 10) return '#166534';
  if (floor >= 8) return '#1e40af';
  if (floor >= 6) return '#854d0e';
  if (floor >= 4) return '#9a3412';
  return '#991b1b';
};

const AssessmentReportScreen = () => {
  const [classNames, setClassNames] = useState<FilterOption[]>([]);
  const [sections, setSections] = useState<FilterOption[]>([]);
  const [examTypes, setExamTypes] = useState<FilterOption[]>([]);
  const [subjects, setSubjects] = useState<FilterOption[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedExam, setSelectedExam] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [expandedBands, setExpandedBands] = useState<Set<number>>(new Set());
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({
    visible: false, title: '', data: [], onSelect: () => {},
  });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await apiClient.get<any>(`${API_ENDPOINTS.REPORTS_ASSESSMENT}/config`);
        setClassNames(config.class_names || []);
        setSections(config.sections || []);
        setExamTypes(config.exam_types || []);
        setSubjects(config.subjects || []);
      } catch (e) { console.error(e); }
      finally { setInitLoading(false); }
    };
    loadConfig();
  }, []);

  const fetchReport = async () => {
    if (!selectedClass || !selectedSection || !selectedExam) return;
    setLoading(true);
    try {
      let url = `${API_ENDPOINTS.REPORTS_ASSESSMENT}?class_name_id=${selectedClass}&section_id=${selectedSection}&exam_type_id=${selectedExam}`;
      if (selectedSubject) url += `&subject_id=${selectedSubject}`;
      const data = await apiClient.get<AssessmentReport>(url);
      setReport(data);
      setExpandedBands(new Set(data.bands.map((b: GpaBand) => b.gpa_floor)));
    } catch (error: any) {
      setReport(null);
      console.error(error);
    } finally { setLoading(false); }
  };

  const handleGenerate = () => {
    if (!selectedClass || !selectedSection || !selectedExam) return;
    setReport(null);
    fetchReport();
  };

  const toggleBand = (gpaFloor: number) => {
    setExpandedBands(prev => {
      const next = new Set(prev);
      if (next.has(gpaFloor)) next.delete(gpaFloor);
      else next.add(gpaFloor);
      return next;
    });
  };

  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPickerModal({ visible: true, title, data, onSelect });
  };

  // Selected labels
  const classLabel = classNames.find(c => c.id === selectedClass)?.name || 'Select Class';
  const sectionLabel = sections.find(s => s.id === selectedSection)?.name || 'Select Section';
  const examLabel = examTypes.find(e => e.id === selectedExam)?.name || 'Select Exam';
  const subjectLabel = selectedSubject ? (subjects.find(s => s.id === selectedSubject)?.name || 'Subject') : 'All Subjects';

  if (initLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.screenTitle}>Exam-wise Analysis</Text>

        {/* Filters */}
        <View style={styles.filterCard}>
          <View style={styles.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Class *</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Class',
                  classNames.map(c => ({ label: c.name, value: c.id })),
                  v => { setSelectedClass(v); setReport(null); }
                )}
              >
                <Text style={selectedClass ? styles.filterBtnText : styles.filterBtnPlaceholder}>{classLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Section *</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Section',
                  sections.map(s => ({ label: s.name, value: s.id })),
                  v => { setSelectedSection(v); setReport(null); }
                )}
              >
                <Text style={selectedSection ? styles.filterBtnText : styles.filterBtnPlaceholder}>{sectionLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Exam Type *</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Exam',
                  examTypes.map(e => ({ label: e.name, value: e.id })),
                  v => { setSelectedExam(v); setReport(null); }
                )}
              >
                <Text style={selectedExam ? styles.filterBtnText : styles.filterBtnPlaceholder}>{examLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Subject</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Subject',
                  [{ label: 'All Subjects (Overall)', value: null }, ...subjects.map(s => ({ label: s.name, value: s.id }))],
                  v => { setSelectedSubject(v); setReport(null); }
                )}
              >
                <Text style={styles.filterBtnText}>{subjectLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, (!selectedClass || !selectedSection || !selectedExam) && { opacity: 0.5 }]}
            onPress={handleGenerate}
            disabled={loading || !selectedClass || !selectedSection || !selectedExam}
          >
            <Text style={styles.generateBtnText}>{loading ? 'Loading...' : 'Generate'}</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />}

        {/* Report */}
        {!loading && report && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.primary }]}>
                <Text style={styles.summaryValue}>{report.total_students}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.success }]}>
                <Text style={styles.summaryValue}>{report.students_with_marks}</Text>
                <Text style={styles.summaryLabel}>With Marks</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.error }]}>
                <Text style={styles.summaryValue}>{report.failed_students?.length || 0}</Text>
                <Text style={styles.summaryLabel}>Failed</Text>
              </View>
            </View>

            {/* Info bar */}
            <View style={styles.infoBar}>
              <Text style={styles.infoText}>
                <Text style={{ fontWeight: '700' }}>Class:</Text> {report.class_name} - {report.section_name}
              </Text>
            </View>

            {/* GPA Bands */}
            {report.bands.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No data available for the selected filters</Text>
              </View>
            ) : (
              report.bands.map((band) => (
                <View
                  key={band.gpa_floor}
                  style={[styles.bandCard, { borderColor: bandBorder(band.gpa_floor), backgroundColor: bandBg(band.gpa_floor) }]}
                >
                  <TouchableOpacity
                    style={[styles.bandHeader, { backgroundColor: bandHeaderBg(band.gpa_floor) }]}
                    onPress={() => toggleBand(band.gpa_floor)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.bandLabel, { color: bandHeaderText(band.gpa_floor) }]}>
                      {band.label} — {band.count} student{band.count !== 1 ? 's' : ''}
                    </Text>
                    <Text style={{ fontSize: 16, color: bandHeaderText(band.gpa_floor) }}>
                      {expandedBands.has(band.gpa_floor) ? '▾' : '▸'}
                    </Text>
                  </TouchableOpacity>

                  {expandedBands.has(band.gpa_floor) && band.students.map((s, idx) => (
                    <View key={s.student_id} style={[styles.studentRow, idx === 0 && { borderTopWidth: 0 }]}>
                      <Text style={styles.studentIndex}>{idx + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName}>{s.student_name}</Text>
                        <Text style={styles.studentAdm}>{s.admission_number}</Text>
                      </View>
                      <View style={styles.studentStats}>
                        <Text style={styles.statMarks}>{s.total_obtained}/{s.total_max}</Text>
                        <Text style={styles.statPct}>{s.percentage}%</Text>
                        <Text style={styles.statGrade}>{s.grade}</Text>
                        <Text style={styles.statCgpa}>CGPA {s.cgpa}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}

            {/* Failed Students */}
            {report.failed_students && report.failed_students.length > 0 && (
              <View style={[styles.bandCard, { borderColor: '#fca5a5', backgroundColor: '#fef2f2', marginTop: 12 }]}>
                <View style={[styles.bandHeader, { backgroundColor: '#fee2e2' }]}>
                  <Text style={[styles.bandLabel, { color: '#991b1b' }]}>
                    Failed Students — {report.failed_students.length} student{report.failed_students.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {report.failed_students.map((s, idx) => (
                  <View key={s.student_id} style={[styles.studentRow, idx === 0 && { borderTopWidth: 0 }]}>
                    <Text style={styles.studentIndex}>{idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{s.student_name}</Text>
                      <Text style={styles.studentAdm}>{s.admission_number}</Text>
                      <Text style={styles.failedSubjects}>Failed: {s.failed_subjects.join(', ')}</Text>
                    </View>
                    <View style={styles.studentStats}>
                      <Text style={styles.statMarks}>{s.total_obtained}/{s.total_max}</Text>
                      <Text style={styles.statPct}>{s.percentage}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {!loading && !report && selectedClass && selectedSection && selectedExam && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Tap "Generate" to view the report</Text>
          </View>
        )}

        {(!selectedClass || !selectedSection || !selectedExam) && !loading && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>Select class, section and exam type to view report</Text>
          </View>
        )}
      </ScrollView>

      <PickerModal
        visible={pickerModal.visible}
        title={pickerModal.title}
        data={pickerModal.data}
        onSelect={pickerModal.onSelect}
        onClose={() => setPickerModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },

  // Filters
  filterCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  filterRow: { flexDirection: 'row', marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  filterBtnText: { flex: 1, fontSize: 13, color: COLORS.text },
  filterBtnPlaceholder: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  arrow: { fontSize: 12, color: COLORS.textSecondary },
  generateBtn: { backgroundColor: COLORS.info, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  generateBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  summaryLabel: { fontSize: 11, color: '#fff', marginTop: 2, opacity: 0.9 },

  // Info bar
  infoBar: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, elevation: 1 },
  infoText: { fontSize: 13, color: COLORS.text },

  // Bands
  bandCard: { borderRadius: 12, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  bandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  bandLabel: { fontSize: 14, fontWeight: '600', flex: 1 },

  // Student rows
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.06)' },
  studentIndex: { width: 24, fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  studentName: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  studentAdm: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  failedSubjects: { fontSize: 12, color: COLORS.error, fontWeight: '500', marginTop: 2 },
  studentStats: { alignItems: 'flex-end' },
  statMarks: { fontSize: 12, color: COLORS.text, fontWeight: '500' },
  statPct: { fontSize: 12, color: COLORS.textSecondary },
  statGrade: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  statCgpa: { fontSize: 11, fontWeight: '700', color: COLORS.text },

  // Empty
  emptyBox: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});

export default AssessmentReportScreen;
