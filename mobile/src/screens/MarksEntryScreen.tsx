import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, FlatList,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──
interface SubjectColumnInfo { subject_id: number; subject_name: string; max_marks: number; min_marks: number; }
interface StudentWithMarks { student_id: number; student_name: string; admission_number: string; marks: { [subjectId: string]: number | string | null }; }
interface MarksGridResponse { exam_type_id: number; academic_year_id: number | null; class_section_id: number; class_name: string; section_name: string; subjects: SubjectColumnInfo[]; students: StudentWithMarks[]; }
interface ClassSectionOption { id: number; section_name: string; }
interface ExamOption { id: number; name: string; }
interface AcademicYear { id: number; name: string; is_current: boolean; }
interface ClassName { id: number; name: string; }
interface AttendanceMonthInfo { month: number; year: number; month_name: string; total_working_days: number; }

const academicMonthOrder = (month: number) => month >= 6 ? month - 6 : month + 6;

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

const MarksEntryScreen = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Filters
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [sections, setSections] = useState<ClassSectionOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);

  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [selectedClassNameId, setSelectedClassNameId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  // Grid
  const [gridData, setGridData] = useState<MarksGridResponse | null>(null);
  const [marksInput, setMarksInput] = useState<{ [key: string]: string }>({});
  const [searchText, setSearchText] = useState('');

  // Attendance
  const [attendanceMonths, setAttendanceMonths] = useState<AttendanceMonthInfo[]>([]);
  const [selectedAttMonths, setSelectedAttMonths] = useState<AttendanceMonthInfo[]>([]);
  const [attendanceInput, setAttendanceInput] = useState<{ [key: string]: string }>({});

  // UI
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Picker modals
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({ visible: false, title: '', data: [], onSelect: () => {} });

  useEffect(() => {
    (async () => {
      try {
        const [years, classes] = await Promise.all([
          apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS),
          apiClient.get<ClassName[]>(API_ENDPOINTS.CLASS_NAMES),
        ]);
        setAcademicYears(years);
        setClassNames(classes);
        const current = years.find((y: AcademicYear) => y.is_current) || years[0];
        if (current) setSelectedYearId(current.id);
      } catch { setError('Failed to load data'); }
      finally { setInitialLoading(false); }
    })();
  }, []);

  // Fetch sections when class changes
  useEffect(() => {
    if (selectedClassNameId) {
      apiClient.get<ClassSectionOption[]>(`${API_ENDPOINTS.MARKS_ENTRY}/class-sections-by-class?class_name_id=${selectedClassNameId}`)
        .then(setSections).catch(() => setSections([]));
    } else { setSections([]); setSelectedSectionId(null); }
  }, [selectedClassNameId]);

  // Fetch exams when year changes
  useEffect(() => {
    if (selectedYearId) {
      apiClient.get<ExamOption[]>(`${API_ENDPOINTS.MARKS_ENTRY}/exams-by-academic-year?academic_year_id=${selectedYearId}`)
        .then(setExams).catch(() => setExams([]));
    } else { setExams([]); setSelectedExamId(null); }
  }, [selectedYearId]);

  const handleSearch = async () => {
    if (!selectedExamId || !selectedSectionId) {
      Alert.alert('Error', 'Please select Exam and Section'); return;
    }
    setLoading(true); setError(''); setGridData(null);
    try {
      let url = `${API_ENDPOINTS.MARKS_ENTRY}/grid?exam_type_id=${selectedExamId}&class_section_id=${selectedSectionId}`;
      if (selectedYearId) url += `&academic_year_id=${selectedYearId}`;
      const data = await apiClient.get<MarksGridResponse>(url);
      setGridData(data);

      // Init marks
      const init: { [key: string]: string } = {};
      data.students.forEach(s => {
        data.subjects.forEach(sub => {
          const key = `${s.student_id}_${sub.subject_id}`;
          const mark = s.marks[sub.subject_id.toString()];
          init[key] = mark === 'AB' ? 'AB' : mark != null ? mark.toString() : '';
        });
      });
      setMarksInput(init);

      // Fetch attendance months
      if (selectedYearId && selectedSectionId) {
        try {
          const [months, saved] = await Promise.all([
            apiClient.get<AttendanceMonthInfo[]>(`${API_ENDPOINTS.MARKS_ENTRY}/attendance-months?academic_year_id=${selectedYearId}&class_section_id=${selectedSectionId}`),
            apiClient.get<any>(`${API_ENDPOINTS.MARKS_ENTRY}/attendance?exam_type_id=${selectedExamId}&class_section_id=${selectedSectionId}${selectedYearId ? `&academic_year_id=${selectedYearId}` : ''}`),
          ]);
          const sorted = months.filter((m: AttendanceMonthInfo) => m.month !== 5)
            .sort((a: AttendanceMonthInfo, b: AttendanceMonthInfo) => a.year !== b.year ? a.year - b.year : academicMonthOrder(a.month) - academicMonthOrder(b.month));
          setAttendanceMonths(sorted);
          const initAtt: { [key: string]: string } = {};
          const savedKeys = new Set<string>();
          data.students.forEach(s => {
            months.forEach((m: AttendanceMonthInfo) => {
              const k = `${s.student_id}_${m.month}_${m.year}`;
              if (saved[k]) { initAtt[k] = saved[k].present_days.toString(); savedKeys.add(`${m.month}_${m.year}`); }
              else { initAtt[k] = ''; }
            });
          });
          setAttendanceInput(initAtt);
          setSelectedAttMonths(sorted.filter((m: AttendanceMonthInfo) => savedKeys.has(`${m.month}_${m.year}`)));
        } catch { setAttendanceMonths([]); setSelectedAttMonths([]); }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch marks data');
    } finally { setLoading(false); }
  };

  const handleReset = () => {
    setSelectedExamId(null); setSelectedClassNameId(null); setSelectedSectionId(null);
    setGridData(null); setMarksInput({}); setAttendanceMonths([]); setSelectedAttMonths([]);
    setAttendanceInput({}); setSearchText(''); setError(''); setSuccess('');
  };

  const handleMarkChange = (studentId: number, subjectId: number, value: string) => {
    const key = `${studentId}_${subjectId}`;
    if (value === '' || value.toUpperCase() === 'AB' || /^\d*\.?\d*$/.test(value)) {
      setMarksInput(prev => ({ ...prev, [key]: value.toUpperCase() === 'AB' ? 'AB' : value }));
    }
  };

  const handleSaveAll = async () => {
    if (!gridData) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const subjects = gridData.subjects.map(sub => ({
        subject_id: sub.subject_id, subject_name: sub.subject_name, max_marks: sub.max_marks, min_marks: sub.min_marks,
        marks: gridData.students.map(s => {
          const key = `${s.student_id}_${sub.subject_id}`;
          const v = marksInput[key] || '';
          return { student_id: s.student_id, marks_obtained: v === 'AB' || v === '' ? null : parseFloat(v), is_absent: v === 'AB' };
        }),
      }));
      const result = await apiClient.post<any>(`${API_ENDPOINTS.MARKS_ENTRY}/update`, {
        exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id,
        class_section_id: gridData.class_section_id, subjects,
      });
      let attMsg = '';
      if (selectedAttMonths.length > 0) {
        const entries: any[] = [];
        gridData.students.forEach(s => {
          selectedAttMonths.forEach(m => {
            const v = attendanceInput[`${s.student_id}_${m.month}_${m.year}`];
            if (v) entries.push({ student_id: s.student_id, month: m.month, year: m.year, total_working_days: m.total_working_days, present_days: parseInt(v) });
          });
        });
        if (entries.length > 0) {
          const ar = await apiClient.post<any>(`${API_ENDPOINTS.MARKS_ENTRY}/attendance`, {
            exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id,
            class_section_id: gridData.class_section_id, entries,
          });
          attMsg = ` | Att: ${ar.created}+${ar.updated}`;
        }
      }
      setSuccess(`Saved! Marks: ${result.created} created, ${result.updated} updated${attMsg}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleSaveStudent = async (student: StudentWithMarks) => {
    if (!gridData) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const subjects = gridData.subjects.map(sub => {
        const key = `${student.student_id}_${sub.subject_id}`;
        const v = marksInput[key] || '';
        return { subject_id: sub.subject_id, subject_name: sub.subject_name, max_marks: sub.max_marks, min_marks: sub.min_marks,
          marks: [{ student_id: student.student_id, marks_obtained: v === 'AB' || v === '' ? null : parseFloat(v), is_absent: v === 'AB' }],
        };
      });
      const result = await apiClient.post<any>(`${API_ENDPOINTS.MARKS_ENTRY}/update`, {
        exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id,
        class_section_id: gridData.class_section_id, subjects,
      });
      let attMsg = '';
      if (selectedAttMonths.length > 0) {
        const entries: any[] = [];
        selectedAttMonths.forEach(m => {
          const v = attendanceInput[`${student.student_id}_${m.month}_${m.year}`];
          if (v) entries.push({ student_id: student.student_id, month: m.month, year: m.year, total_working_days: m.total_working_days, present_days: parseInt(v) });
        });
        if (entries.length > 0) {
          const ar = await apiClient.post<any>(`${API_ENDPOINTS.MARKS_ENTRY}/attendance`, {
            exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id,
            class_section_id: gridData.class_section_id, entries,
          });
          attMsg = ` | Att: ${ar.created}+${ar.updated}`;
        }
      }
      setSuccess(`Updated ${student.student_name}! ${result.created}+${result.updated}${attMsg}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update');
    } finally { setSaving(false); }
  };

  const fillAll = (mode: 'present' | 'absent' | 'clear') => {
    if (!gridData) return;
    const updated = { ...marksInput };
    gridData.students.forEach(s => {
      gridData.subjects.forEach(sub => {
        const key = `${s.student_id}_${sub.subject_id}`;
        if (mode === 'absent') updated[key] = 'AB';
        else if (mode === 'clear') updated[key] = '';
        else if (updated[key] === 'AB') updated[key] = '';
      });
    });
    setMarksInput(updated);
  };

  const selectedYearName = academicYears.find(y => y.id === selectedYearId)?.name || 'Select Year';
  const selectedClassName = classNames.find(c => c.id === selectedClassNameId)?.name || 'Select Class';
  const selectedSectionName = sections.find(s => s.id === selectedSectionId)?.section_name || 'Select Section';
  const selectedExamName = exams.find(e => e.id === selectedExamId)?.name || 'Select Exam';

  const searchTerm = searchText.toLowerCase().trim();
  const filteredStudents = gridData ? (searchTerm
    ? gridData.students.filter(s => s.student_name.toLowerCase().includes(searchTerm) || s.admission_number.toLowerCase().includes(searchTerm))
    : gridData.students) : [];

  const sortedAttMonths = [...selectedAttMonths].sort((a, b) => a.year !== b.year ? a.year - b.year : academicMonthOrder(a.month) - academicMonthOrder(b.month));

  if (initialLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <PickerModal {...pickerModal} onClose={() => setPickerModal(p => ({ ...p, visible: false }))} />

      {/* Filters */}
      <View style={styles.card}>
        <View style={styles.cardHeader}><Text style={styles.cardTitle}>MARKS ENTRY</Text></View>
        <View style={styles.cardBody}>
          <Text style={styles.label}>Academic Year</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
            visible: true, title: 'Academic Year',
            data: academicYears.map(y => ({ label: y.name, value: y.id })),
            onSelect: (v) => { setSelectedYearId(v); setSelectedExamId(null); },
          })}>
            <Text style={styles.dropdownText}>{selectedYearName}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Select Exam</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
            visible: true, title: 'Select Exam',
            data: exams.map(e => ({ label: e.name, value: e.id })),
            onSelect: setSelectedExamId,
          })}>
            <Text style={styles.dropdownText}>{selectedExamName}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Class Name</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
            visible: true, title: 'Class Name',
            data: classNames.map(c => ({ label: c.name, value: c.id })),
            onSelect: (v) => { setSelectedClassNameId(v); setSelectedSectionId(null); },
          })}>
            <Text style={styles.dropdownText}>{selectedClassName}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Section</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setPickerModal({
            visible: true, title: 'Section',
            data: sections.map(s => ({ label: s.section_name, value: s.id })),
            onSelect: setSelectedSectionId,
          })} disabled={!selectedClassNameId}>
            <Text style={[styles.dropdownText, !selectedClassNameId && { color: COLORS.textSecondary }]}>{selectedSectionName}</Text>
            <Text style={styles.dropdownArrow}>▼</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#14b8a6' }]} onPress={handleSearch} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'Searching...' : 'Search'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#14b8a6' }]} onPress={handleReset}>
              <Text style={styles.btnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Messages */}
      {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => setError('')}><Text style={{ color: COLORS.error, fontSize: 12 }}>Dismiss</Text></TouchableOpacity></View> : null}
      {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text>
        <TouchableOpacity onPress={() => setSuccess('')}><Text style={{ color: COLORS.success, fontSize: 12 }}>Dismiss</Text></TouchableOpacity></View> : null}

      {/* Grid */}
      {gridData && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{gridData.class_name} - {gridData.section_name}</Text>
          </View>

          {/* Quick Fill + Search */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <TouchableOpacity style={[styles.chipBtn, { backgroundColor: COLORS.success }]} onPress={() => fillAll('present')}>
              <Text style={styles.chipBtnText}>All Present</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chipBtn, { backgroundColor: COLORS.error }]} onPress={() => fillAll('absent')}>
              <Text style={styles.chipBtnText}>All Absent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chipBtn, { backgroundColor: '#9ca3af' }]} onPress={() => fillAll('clear')}>
              <Text style={styles.chipBtnText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chipBtn, { backgroundColor: '#ea580c' }]} onPress={handleSaveAll} disabled={saving}>
              <Text style={styles.chipBtnText}>{saving ? 'Saving...' : 'Save All'}</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <TextInput style={styles.searchInput} placeholder="Filter by name or admission no..."
              value={searchText} onChangeText={setSearchText} />
            {searchTerm ? <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 4 }}>{filteredStudents.length}/{gridData.students.length} students</Text> : null}
          </View>

          {/* Attendance Month Selector */}
          {attendanceMonths.length > 0 && (
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff7ed' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#c2410c', marginBottom: 6 }}>📋 Attendance Months (max 5):</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {attendanceMonths.map(m => {
                  const sel = selectedAttMonths.some(sm => sm.month === m.month && sm.year === m.year);
                  return (
                    <TouchableOpacity key={`${m.month}_${m.year}`}
                      style={[styles.monthChip, sel && styles.monthChipSel]}
                      onPress={() => {
                        if (sel) setSelectedAttMonths(prev => prev.filter(sm => !(sm.month === m.month && sm.year === m.year)));
                        else if (selectedAttMonths.length < 5) setSelectedAttMonths(prev => [...prev, m]);
                      }}>
                      <Text style={[styles.monthChipText, sel && { color: '#fff' }]}>
                        {m.month_name.substring(0, 3)} ({m.total_working_days}d)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Students */}
          {filteredStudents.length === 0 ? (
            <Text style={{ textAlign: 'center', padding: 30, color: COLORS.textSecondary }}>
              {searchTerm ? 'No students match search.' : 'No students found.'}
            </Text>
          ) : (
            filteredStudents.map((student, sIdx) => (
              <View key={student.student_id} style={[styles.studentSection, sIdx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.primary }}>{student.student_name}</Text>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>{student.admission_number}</Text>
                  </View>
                  <TouchableOpacity style={[styles.chipBtn, { backgroundColor: '#ea580c' }]} onPress={() => handleSaveStudent(student)} disabled={saving}>
                    <Text style={styles.chipBtnText}>{saving ? '...' : 'Update'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Attendance inputs for this student */}
                {sortedAttMonths.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    {sortedAttMonths.map(m => {
                      const attKey = `${student.student_id}_${m.month}_${m.year}`;
                      return (
                        <View key={attKey} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, color: '#c2410c', width: 60 }}>{m.month_name.substring(0, 3)}:</Text>
                          <Text style={{ fontSize: 11, color: COLORS.info, width: 40 }}>WD:{m.total_working_days}</Text>
                          <TextInput style={[styles.markInput, { width: 55, borderColor: '#fb923c' }]}
                            value={attendanceInput[attKey] || ''} keyboardType="numeric" placeholder="PD"
                            onChangeText={v => setAttendanceInput(prev => ({ ...prev, [attKey]: v }))} />
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Subject marks */}
                {gridData.subjects.map(sub => {
                  const key = `${student.student_id}_${sub.subject_id}`;
                  const val = marksInput[key] || '';
                  const isInvalid = val !== '' && val !== 'AB' && (parseFloat(val) < sub.min_marks || parseFloat(val) > sub.max_marks);
                  return (
                    <View key={sub.subject_id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: COLORS.text }}>{sub.subject_name}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>Min:{sub.min_marks} Max:{sub.max_marks}</Text>
                      </View>
                      <TextInput style={[styles.markInput, isInvalid && { borderColor: COLORS.error, backgroundColor: '#fef2f2' }, val === 'AB' && { color: COLORS.error }]}
                        value={val} placeholder="--"
                        onChangeText={v => handleMarkChange(student.student_id, sub.subject_id, v)}
                        autoCapitalize="characters"
                      />
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  cardHeader: { backgroundColor: '#14b8a6', paddingVertical: 10, paddingHorizontal: 14 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#fff', letterSpacing: 1 },
  cardBody: { padding: 14 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 10 },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12 },
  dropdownText: { fontSize: 14, color: COLORS.text },
  dropdownArrow: { fontSize: 10, color: COLORS.textSecondary },
  btn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  chipBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  chipBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  searchInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  monthChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  monthChipSel: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  monthChipText: { fontSize: 11, color: COLORS.text },
  studentSection: { padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  markInput: { width: 70, textAlign: 'center', padding: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, fontSize: 14, backgroundColor: '#fff' },
  errorBox: { backgroundColor: '#fef2f2', borderLeftWidth: 4, borderLeftColor: COLORS.error, padding: 12, borderRadius: 6, marginBottom: 12 },
  errorText: { color: COLORS.error, fontSize: 13 },
  successBox: { backgroundColor: '#f0fdf4', borderLeftWidth: 4, borderLeftColor: COLORS.success, padding: 12, borderRadius: 6, marginBottom: 12 },
  successText: { color: COLORS.success, fontSize: 13 },
});

export default MarksEntryScreen;
