import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Alert, Modal, FlatList,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

// ── Types ──
interface AcademicYear { id: number; name: string; is_current: boolean; }
interface ExamTypeSummary { id: number; name: string; }
interface ClassSectionOption { id: number; class_name: string; section_name: string; display?: string; }
interface StudentOption { id: number; name: string; admission_number: string; }
interface LevelConfig { level_name: string; exam_type_ids: number[]; weightage_pct: number; }

interface LevelRow { level_name: string; exam_names: string[]; average_value: number | null; grade: string | null; grade_point: number | null; weightage_pct: number; }
interface AttendanceMonth { month: number; year: number; month_name: string; total_working_days: number; present_days: number; }
interface SubjectPerformance { subject_name: string; student_marks: number | null; max_marks: number; pass_marks: number; class_topper: number; class_average: number; }
interface ReportStudent {
  student_id: number; student_name: string; admission_number: string; father_name: string;
  class_name: string; section_name: string; levels: LevelRow[];
  total_average: number | null; total_grade: string | null; total_grade_point: number | null;
  cg: string | null; cgpa: number | null;
  attendance_working_days: number; attendance_present_days: number; attendance_percentage: number;
  attendance_monthly?: AttendanceMonth[]; subject_performance?: SubjectPerformance[];
  class_rank?: number; total_students?: number; remarks: string;
}
interface ReportResponse { academic_year: string | null; class_name: string; section_name: string; grade_scale: any[]; students: ReportStudent[]; }

const DEFAULT_LEVELS: LevelConfig[] = [
  { level_name: 'Formative Tests (F I+F II+F III+F IV)', exam_type_ids: [], weightage_pct: 25 },
  { level_name: 'Summative (25%) (ST I + ST II)', exam_type_ids: [], weightage_pct: 25 },
  { level_name: 'Summative Test-II (50%)', exam_type_ids: [], weightage_pct: 50 },
];
const MAX_EXAMS_PER_LEVEL = [4, 2, 2];

// ── Picker Modal ──
const PickerModal = ({ visible, onClose, title, data, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: any }[]; onSelect: (v: any) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={pm.sheet}>
        <Text style={pm.title}>{title}</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={pm.item} onPress={() => { onSelect(item.value); onClose(); }}>
              <Text style={pm.itemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={pm.cancelBtn} onPress={onClose}><Text style={pm.cancelText}>Cancel</Text></TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);
const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 20 },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  item: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemText: { fontSize: 15, color: COLORS.text },
  cancelBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
});

const AnnualReportScreen = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [examTypes, setExamTypes] = useState<ExamTypeSummary[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [levels, setLevels] = useState<LevelConfig[]>(DEFAULT_LEVELS);

  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [viewStudentId, setViewStudentId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({ visible: false, title: '', data: [], onSelect: () => {} });

  useEffect(() => {
    (async () => {
      try {
        const years = await apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS);
        setAcademicYears(years);
        const current = years.find((y: AcademicYear) => y.is_current);
        if (current) setSelectedYearId(current.id);
      } catch { setError('Failed to load academic years'); }
      finally { setInitialLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedYearId) return;
    (async () => {
      setConfigLoading(true);
      try {
        const config = await apiClient.get<any>(`${API_ENDPOINTS.REPORTS_ANNUAL}/config?academic_year_id=${selectedYearId}`);
        setExamTypes(config.exam_types || []);
        setClassSections(config.class_sections || []);
      } catch { setError('Failed to load config'); }
      finally { setConfigLoading(false); }
    })();
  }, [selectedYearId]);

  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    (async () => {
      try {
        const sts = await apiClient.get<StudentOption[]>(`${API_ENDPOINTS.REPORTS_ANNUAL}/students?class_section_id=${selectedClassId}`);
        setStudents(sts);
      } catch { setStudents([]); }
    })();
  }, [selectedClassId]);

  const handleExamToggle = (levelIdx: number, examId: number) => {
    setLevels(prev => {
      const updated = [...prev];
      const ids = [...updated[levelIdx].exam_type_ids];
      const i = ids.indexOf(examId);
      if (i >= 0) { ids.splice(i, 1); }
      else {
        const max = MAX_EXAMS_PER_LEVEL[levelIdx] || 99;
        if (ids.length >= max) return prev;
        ids.push(examId);
      }
      updated[levelIdx] = { ...updated[levelIdx], exam_type_ids: ids };
      return updated;
    });
  };

  const handleGenerate = async () => {
    if (!selectedYearId || !selectedClassId) { setError('Select Academic Year and Class'); return; }
    const hasExams = levels.some(l => l.exam_type_ids.length > 0);
    if (!hasExams) { setError('Assign at least one exam type to a level'); return; }
    setLoading(true); setError(''); setReportData(null);
    try {
      const payload: any = {
        academic_year_id: selectedYearId,
        class_section_id: selectedClassId,
        levels,
      };
      if (selectedStudentId) payload.student_id = selectedStudentId;
      const data = await apiClient.post<ReportResponse>(`${API_ENDPOINTS.REPORTS_ANNUAL}/generate`, payload);
      setReportData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally { setLoading(false); }
  };

  const selectedYearName = academicYears.find(y => y.id === selectedYearId)?.name || 'Select Year';
  const selectedClassName = selectedClassId
    ? classSections.find(cs => cs.id === selectedClassId)
      ? `${classSections.find(cs => cs.id === selectedClassId)!.class_name} - ${classSections.find(cs => cs.id === selectedClassId)!.section_name}`
      : 'Selected'
    : 'Select Class';
  const selectedStudentName = selectedStudentId ? students.find(s => s.id === selectedStudentId)?.name || 'Selected' : 'All Students';

  const displayStudents = reportData ? (viewStudentId ? reportData.students.filter(s => s.student_id === viewStudentId) : reportData.students) : [];

  const ACADEMIC_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
  const SHORT_MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

  if (initialLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <PickerModal {...pickerModal} onClose={() => setPickerModal(p => ({ ...p, visible: false }))} />

      <ScrollView style={styles.container}>
        {/* Config Card */}
        <View style={styles.card}>
          <View style={[styles.cardHeader, { backgroundColor: '#7c3aed' }]}><Text style={styles.cardTitle}>ANNUAL REPORT</Text></View>
          <View style={styles.cardBody}>
            {/* Selectors */}
            <Text style={styles.label}>Academic Year</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
              visible: true, title: 'Academic Year',
              data: academicYears.map(y => ({ label: y.name, value: y.id })),
              onSelect: (v) => { setSelectedYearId(v); setSelectedClassId(null); setSelectedStudentId(null); setReportData(null); },
            })}>
              <Text style={styles.dropdownText}>{selectedYearName}</Text><Text style={styles.arrow}>▼</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Class - Section</Text>
            <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
              visible: true, title: 'Class - Section',
              data: classSections.map(cs => ({ label: `${cs.class_name} - ${cs.section_name}`, value: cs.id })),
              onSelect: (v) => { setSelectedClassId(v); setSelectedStudentId(null); setReportData(null); },
            })} disabled={configLoading}>
              <Text style={styles.dropdownText}>{configLoading ? 'Loading...' : selectedClassName}</Text><Text style={styles.arrow}>▼</Text>
            </TouchableOpacity>

            {selectedClassId && students.length > 0 && (
              <>
                <Text style={styles.label}>Student (optional)</Text>
                <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
                  visible: true, title: 'Select Student',
                  data: [{ label: 'All Students', value: null }, ...students.map(s => ({ label: `${s.name} (${s.admission_number})`, value: s.id }))],
                  onSelect: (v) => { setSelectedStudentId(v); setReportData(null); },
                })}>
                  <Text style={styles.dropdownText}>{selectedStudentName}</Text><Text style={styles.arrow}>▼</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Level Configuration */}
            <Text style={[styles.label, { marginTop: 16 }]}>Test Levels & Exam Mapping</Text>
            {levels.map((level, idx) => (
              <View key={idx} style={styles.levelBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, flex: 1 }} numberOfLines={2}>{level.level_name}</Text>
                  <View style={{ backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#7c3aed' }}>{level.weightage_pct}%</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 10, color: COLORS.textSecondary, marginBottom: 6 }}>
                  {level.exam_type_ids.length} / {MAX_EXAMS_PER_LEVEL[idx] || '∞'} selected
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {examTypes.map(et => {
                    const selected = level.exam_type_ids.includes(et.id);
                    const usedElsewhere = levels.some((l, li) => li !== idx && l.exam_type_ids.includes(et.id));
                    const maxReached = !selected && level.exam_type_ids.length >= (MAX_EXAMS_PER_LEVEL[idx] || 99);
                    const disabled = (usedElsewhere && !selected) || maxReached;
                    return (
                      <TouchableOpacity key={et.id} disabled={disabled}
                        onPress={() => handleExamToggle(idx, et.id)}
                        style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>
                        <Text style={[styles.chipText, selected && { color: '#fff' }, disabled && { color: '#9ca3af' }]}>{et.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {examTypes.length === 0 && <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' }}>No exam types available</Text>}
                </View>
              </View>
            ))}

            {/* Generate Button */}
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#7c3aed', marginTop: 16 }]} onPress={handleGenerate} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'Generating...' : 'Generate Annual Report'}</Text>
            </TouchableOpacity>

            {reportData && reportData.students.length > 0 && (
              <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.success, marginTop: 8 }]} onPress={() => { setViewStudentId(null); setShowReport(true); }}>
                <Text style={styles.btnText}>View Report ({reportData.students.length} students)</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

        {/* Summary Cards */}
        {reportData && reportData.students.length > 0 && (
          <View style={styles.card}>
            <View style={[styles.cardHeader, { backgroundColor: '#7c3aed' }]}>
              <Text style={styles.cardTitle}>RESULTS SUMMARY</Text>
            </View>
            {reportData.students.map((s, idx) => (
              <TouchableOpacity key={s.student_id} style={[styles.summaryRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}
                onPress={() => { setViewStudentId(s.student_id); setShowReport(true); }}>
                <View style={styles.rankCircle}>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>#{s.class_rank || '-'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text }}>{s.student_name}</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{s.admission_number}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {s.total_average != null && <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>{s.total_average}%</Text>}
                  {s.total_grade && <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>{s.total_grade}</Text>}
                  {s.cgpa != null && <Text style={{ fontSize: 10, color: COLORS.success }}>CGPA: {s.cgpa}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {reportData && reportData.students.length === 0 && (
          <Text style={{ textAlign: 'center', color: COLORS.textSecondary, marginTop: 20 }}>No data found for the selected criteria.</Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Report Card Modal */}
      <Modal visible={showReport} animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={{ backgroundColor: '#7c3aed', paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Annual Report</Text>
              {reportData && <Text style={{ color: '#e0e7ff', fontSize: 12 }}>{reportData.academic_year} • {reportData.class_name}-{reportData.section_name}</Text>}
            </View>
            <TouchableOpacity onPress={() => setShowReport(false)} style={{ padding: 6 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Student filter */}
          {reportData && (
            <TouchableOpacity style={{ backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              onPress={() => setPickerModal({
                visible: true, title: 'Select Student',
                data: [{ label: `All Students (${reportData.students.length})`, value: null },
                  ...reportData.students.map(s => ({ label: `${s.student_name} (${s.admission_number})`, value: s.student_id }))],
                onSelect: setViewStudentId,
              })}>
              <Text style={{ fontSize: 13, color: '#7c3aed', fontWeight: '600' }}>
                {viewStudentId ? reportData.students.find(s => s.student_id === viewStudentId)?.student_name || 'Selected' : `All Students (${reportData.students.length})`} ▼
              </Text>
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={{ padding: 12 }}>
            {displayStudents.map(student => {
              const monthMap: Record<number, AttendanceMonth> = {};
              (student.attendance_monthly || []).forEach(m => { monthMap[m.month] = m; });
              const totalWorking = ACADEMIC_MONTHS.reduce((s, m) => s + (monthMap[m]?.total_working_days || 0), 0);
              const totalPresent = ACADEMIC_MONTHS.reduce((s, m) => s + (monthMap[m]?.present_days || 0), 0);
              const attPct = totalWorking > 0 ? ((totalPresent / totalWorking) * 100).toFixed(1) : '0.0';

              return (
                <View key={student.student_id} style={styles.reportCard}>
                  {/* Student Info Header */}
                  <View style={[styles.rcHeader, { backgroundColor: '#7c3aed' }]}>
                    <View style={styles.rcAvatar}><Text style={styles.rcAvatarText}>{student.student_name.charAt(0)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#fff' }}>{student.student_name}</Text>
                      <Text style={{ fontSize: 12, color: '#e0e7ff' }}>{student.admission_number} • {student.class_name}-{student.section_name}</Text>
                      {student.father_name ? <Text style={{ fontSize: 11, color: '#c4b5fd' }}>Father: {student.father_name}</Text> : null}
                    </View>
                    {student.class_rank != null && (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Rank {student.class_rank}/{student.total_students}</Text>
                      </View>
                    )}
                  </View>

                  {/* Levels Table */}
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', Color: COLORS.text, marginBottom: 8 }}>Scholastic Areas</Text>
                    {/* Table header */}
                    <View style={[styles.tRow, { backgroundColor: '#eff6ff' }]}>
                      <Text style={[styles.tCell, { flex: 3, fontWeight: '600', fontSize: 10 }]}>Level of Tests</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: '600', fontSize: 10 }]}>Avg</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: '600', fontSize: 10 }]}>Grade</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: '600', fontSize: 10 }]}>GP</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: '600', fontSize: 10 }]}>Wt%</Text>
                    </View>
                    {student.levels.map((lvl, i) => (
                      <View key={i} style={[styles.tRow, i % 2 === 0 && { backgroundColor: '#fffbeb' }]}>
                        <View style={[styles.tCell, { flex: 3 }]}>
                          <Text style={{ fontSize: 11, color: COLORS.text }}>{lvl.level_name}</Text>
                          {lvl.exam_names.length > 0 && <Text style={{ fontSize: 8, color: COLORS.textSecondary }}>({lvl.exam_names.join(' + ')})</Text>}
                        </View>
                        <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', color: '#dc2626', fontSize: 12 }]}>{lvl.average_value ?? '-'}</Text>
                        <Text style={[styles.tCell, { flex: 1, fontWeight: '600', color: '#7c3aed', fontSize: 12 }]}>{lvl.grade || '-'}</Text>
                        <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', color: '#1d4ed8', fontSize: 12 }]}>{lvl.grade_point != null ? String(lvl.grade_point).padStart(2, '0') : '-'}</Text>
                        <Text style={[styles.tCell, { flex: 1, fontSize: 11, color: COLORS.text }]}>{lvl.weightage_pct}%</Text>
                      </View>
                    ))}
                    {/* Total row */}
                    <View style={[styles.tRow, { backgroundColor: '#fef9c3' }]}>
                      <Text style={[styles.tCell, { flex: 3, fontWeight: 'bold', fontSize: 11 }]}>TOTAL VALUE</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', color: '#dc2626', fontSize: 12 }]}>{student.total_average ?? '-'}</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', color: '#7c3aed', fontSize: 12 }]}>{student.total_grade || '-'}</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', color: '#1d4ed8', fontSize: 12 }]}>{student.total_grade_point != null ? String(student.total_grade_point).padStart(2, '0') : '-'}</Text>
                      <Text style={[styles.tCell, { flex: 1, fontWeight: 'bold', fontSize: 11 }]}>100%</Text>
                    </View>

                    {/* CG / CGPA */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ backgroundColor: '#fce7f3', borderWidth: 1, borderColor: '#f9a8d4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold' }}>CG</Text>
                        </View>
                        <View style={{ backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#f9a8d4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#7c3aed' }}>{student.cg || '-'}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: COLORS.text }}>Final Result</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold' }}>CGPA</Text>
                        </View>
                        <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 }}>
                          <Text style={{ fontSize: 12, fontWeight: 'bold', color: COLORS.success }}>{student.cgpa != null ? student.cgpa : '-'}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Monthly Attendance */}
                    {student.attendance_monthly && student.attendance_monthly.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 6 }}>📅 Attendance</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View>
                            {/* Month headers */}
                            <View style={{ flexDirection: 'row' }}>
                              <View style={[styles.attCell, { width: 80, backgroundColor: '#fef9c3' }]}><Text style={styles.attHead}></Text></View>
                              {SHORT_MONTHS.map((m, i) => (
                                <View key={i} style={[styles.attCell, { backgroundColor: '#fef9c3' }]}><Text style={styles.attHead}>{m}</Text></View>
                              ))}
                              <View style={[styles.attCell, { backgroundColor: '#fef9c3' }]}><Text style={styles.attHead}>Total</Text></View>
                              <View style={[styles.attCell, { backgroundColor: '#fef9c3' }]}><Text style={styles.attHead}>%</Text></View>
                            </View>
                            {/* Working days */}
                            <View style={{ flexDirection: 'row' }}>
                              <View style={[styles.attCell, { width: 80 }]}><Text style={{ fontSize: 9, fontWeight: '500' }}>Working</Text></View>
                              {ACADEMIC_MONTHS.map(m => (
                                <View key={`wd${m}`} style={styles.attCell}><Text style={[styles.attVal, { color: '#1d4ed8' }]}>{monthMap[m]?.total_working_days ?? 0}</Text></View>
                              ))}
                              <View style={styles.attCell}><Text style={[styles.attVal, { fontWeight: 'bold', color: '#1d4ed8' }]}>{totalWorking}</Text></View>
                              <View style={styles.attCell}><Text style={[styles.attVal, { fontWeight: 'bold', color: '#ea580c' }]}>{attPct}%</Text></View>
                            </View>
                            {/* Present days */}
                            <View style={{ flexDirection: 'row' }}>
                              <View style={[styles.attCell, { width: 80 }]}><Text style={{ fontSize: 9, fontWeight: '500' }}>Present</Text></View>
                              {ACADEMIC_MONTHS.map(m => (
                                <View key={`pd${m}`} style={styles.attCell}><Text style={[styles.attVal, { color: COLORS.success }]}>{monthMap[m]?.present_days ?? 0}</Text></View>
                              ))}
                              <View style={styles.attCell}><Text style={[styles.attVal, { fontWeight: 'bold', color: COLORS.success }]}>{totalPresent}</Text></View>
                              <View style={styles.attCell} />
                            </View>
                          </View>
                        </ScrollView>
                      </View>
                    )}

                    {/* Performance Comparison */}
                    {student.subject_performance && student.subject_performance.length > 0 && (
                      <View style={{ marginTop: 12, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 8 }}>📊 Performance Comparison</Text>
                        {student.subject_performance.map(sp => {
                          const topperPct = sp.max_marks > 0 ? (sp.class_topper / sp.max_marks) * 100 : 0;
                          const avgPct = sp.max_marks > 0 ? (sp.class_average / sp.max_marks) * 100 : 0;
                          const stuPct = sp.student_marks !== null && sp.max_marks > 0 ? (sp.student_marks / sp.max_marks) * 100 : 0;
                          const isFail = sp.student_marks !== null && sp.pass_marks != null && sp.student_marks < sp.pass_marks;
                          return (
                            <View key={sp.subject_name} style={{ marginBottom: 8 }}>
                              <Text style={{ fontSize: 10, color: isFail ? COLORS.error : COLORS.text, fontWeight: '500', marginBottom: 3 }}>{sp.subject_name}</Text>
                              <View style={{ flexDirection: 'row', gap: 3 }}>
                                <View style={{ flex: 1 }}>
                                  <View style={{ height: 12, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                    <View style={{ height: '100%', width: `${Math.min(topperPct, 100)}%`, backgroundColor: COLORS.success, borderRadius: 6 }} />
                                  </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ height: 12, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                    <View style={{ height: '100%', width: `${Math.min(avgPct, 100)}%`, backgroundColor: '#f59e0b', borderRadius: 6 }} />
                                  </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ height: 12, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                                    <View style={{ height: '100%', width: `${Math.min(stuPct, 100)}%`, backgroundColor: isFail ? COLORS.error : '#6366f1', borderRadius: 6 }} />
                                  </View>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.success }} />
                            <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Topper</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#f59e0b' }} />
                            <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Average</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#6366f1' }} />
                            <Text style={{ fontSize: 9, color: COLORS.textSecondary }}>Student</Text>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Remarks */}
                    {student.remarks ? (
                      <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#166534' }}>Remarks</Text>
                        <Text style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>{student.remarks}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {displayStudents.length === 0 && (
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
  arrow: { fontSize: 10, color: COLORS.textSecondary },
  btn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorBox: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: COLORS.error, padding: 12, borderRadius: 6, marginBottom: 12 },
  errorText: { color: COLORS.error, fontSize: 13 },
  levelBox: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff' },
  chipSelected: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipDisabled: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  chipText: { fontSize: 11, color: COLORS.text },
  summaryRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center' },
  rankCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#7c3aed', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  // Report card
  reportCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden', elevation: 3 },
  rcHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rcAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  rcAvatarText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tCell: { paddingVertical: 6, paddingHorizontal: 4, textAlign: 'center', fontSize: 11 },
  attCell: { width: 38, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#d1d5db' },
  attHead: { fontSize: 9, fontWeight: '600', color: COLORS.text },
  attVal: { fontSize: 9, fontWeight: '600' },
});

export default AnnualReportScreen;
