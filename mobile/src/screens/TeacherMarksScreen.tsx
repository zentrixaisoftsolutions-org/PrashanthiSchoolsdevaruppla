/** Teacher screen: pick a class section + exam, enter marks for each subject/student, then save. */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import {
  teacherMarksService, MarksOptionSection, MarksOptionExam,
  MarksGrid, MarksGridSubject,
} from '../services/dataService';
import { colors, spacing, radius } from '../theme';

type Picker = 'section' | 'exam' | 'subject' | null;

const TeacherMarksScreen: React.FC = () => {
  const nav = useNavigation<any>();

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [academicYearName, setAcademicYearName] = useState<string | null>(null);
  const [sections, setSections] = useState<MarksOptionSection[]>([]);
  const [exams, setExams] = useState<MarksOptionExam[]>([]);

  const [section, setSection] = useState<MarksOptionSection | null>(null);
  const [exam, setExam] = useState<MarksOptionExam | null>(null);

  const [grid, setGrid] = useState<MarksGrid | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [activeSubject, setActiveSubject] = useState<MarksGridSubject | null>(null);

  // marks[subject_id][student_id] = { value: string, absent: boolean }
  const [marks, setMarks] = useState<Record<string, Record<number, { value: string; absent: boolean }>>>({});
  const [saving, setSaving] = useState(false);

  const [picker, setPicker] = useState<Picker>(null);

  useEffect(() => {
    (async () => {
      try {
        const opts = await teacherMarksService.getOptions();
        setAcademicYearId(opts.academic_year_id);
        setAcademicYearName(opts.academic_year_name);
        setSections(opts.class_sections);
        setExams(opts.exam_types);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load options');
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  const loadGrid = async (s: MarksOptionSection, e: MarksOptionExam) => {
    setLoadingGrid(true);
    setGrid(null);
    setActiveSubject(null);
    try {
      const g = await teacherMarksService.getGrid({
        exam_type_id: e.id,
        class_section_id: s.id,
        academic_year_id: academicYearId ?? undefined,
      });
      setGrid(g);
      // seed marks state from existing values
      const seed: Record<string, Record<number, { value: string; absent: boolean }>> = {};
      g.subjects.forEach((sub) => {
        seed[String(sub.subject_id)] = {};
        g.students.forEach((st) => {
          const v = st.marks[String(sub.subject_id)];
          if (v === 'AB') {
            seed[String(sub.subject_id)][st.student_id] = { value: '', absent: true };
          } else if (v === null || v === undefined) {
            seed[String(sub.subject_id)][st.student_id] = { value: '', absent: false };
          } else {
            seed[String(sub.subject_id)][st.student_id] = { value: String(v), absent: false };
          }
        });
      });
      setMarks(seed);
      if (g.subjects.length > 0) setActiveSubject(g.subjects[0]);
      if (g.subjects.length === 0) {
        Alert.alert('No subjects', 'No subjects are mapped for this class/exam yet.');
      } else if (g.students.length === 0) {
        Alert.alert('No students', 'No active students found in this class section.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to load grid');
    } finally {
      setLoadingGrid(false);
    }
  };

  const onSelectSection = (s: MarksOptionSection) => {
    setSection(s);
    setPicker(null);
    if (exam) loadGrid(s, exam);
  };
  const onSelectExam = (e: MarksOptionExam) => {
    setExam(e);
    setPicker(null);
    if (section) loadGrid(section, e);
  };

  const setStudentMark = (subjectId: number, studentId: number, value: string) => {
    setMarks((prev) => ({
      ...prev,
      [String(subjectId)]: {
        ...(prev[String(subjectId)] || {}),
        [studentId]: { value: value.replace(/[^\d.]/g, ''), absent: false },
      },
    }));
  };
  const toggleAbsent = (subjectId: number, studentId: number) => {
    setMarks((prev) => {
      const cur = prev[String(subjectId)]?.[studentId] || { value: '', absent: false };
      return {
        ...prev,
        [String(subjectId)]: {
          ...(prev[String(subjectId)] || {}),
          [studentId]: { value: '', absent: !cur.absent },
        },
      };
    });
  };

  const onSave = async () => {
    if (!grid) return;
    // Build payload only including students with a value or absent flag
    const payloadSubjects = grid.subjects.map((sub) => {
      const subMap = marks[String(sub.subject_id)] || {};
      const entries = grid.students
        .map((st) => {
          const cell = subMap[st.student_id];
          if (!cell) return null;
          if (cell.absent) {
            return { student_id: st.student_id, marks_obtained: null, is_absent: true };
          }
          if (cell.value === '' || cell.value === null) return null;
          const num = Number(cell.value);
          if (Number.isNaN(num)) return null;
          if (num < 0 || num > sub.max_marks) {
            throw new Error(`${st.student_name} - ${sub.subject_name}: marks must be 0..${sub.max_marks}`);
          }
          return { student_id: st.student_id, marks_obtained: num, is_absent: false };
        })
        .filter(Boolean) as Array<{ student_id: number; marks_obtained: number | null; is_absent: boolean }>;
      return {
        subject_id: sub.subject_id,
        subject_name: sub.subject_name,
        max_marks: sub.max_marks,
        min_marks: sub.min_marks,
        marks: entries,
      };
    }).filter((s) => s.marks.length > 0);

    if (payloadSubjects.length === 0) {
      Alert.alert('Nothing to save', 'Enter at least one mark or mark a student absent.');
      return;
    }

    setSaving(true);
    try {
      const res = await teacherMarksService.saveMarks({
        exam_type_id: grid.exam_type_id,
        class_section_id: grid.class_section_id,
        academic_year_id: academicYearId ?? undefined,
        subjects: payloadSubjects,
      });
      Alert.alert('Saved', `Created ${res.created}, updated ${res.updated} mark(s).`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || err?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = useMemo(() => grid?.students || [], [grid]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Enter Marks</Text>
        <Text style={styles.heroSub}>{academicYearName ? `Academic Year ${academicYearName}` : 'Select class & exam'}</Text>
      </LinearGradient>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, marginTop: -spacing.xl }}>
        {loadingOptions ? (
          <Card><ActivityIndicator color={colors.primary} /></Card>
        ) : (
          <Card>
            <Text style={styles.sectionLabel}>Class & Exam</Text>
            <Pressable style={styles.pickerRow} onPress={() => setPicker('section')}>
              <Ionicons name="layers-outline" size={20} color={colors.primary} />
              <Text style={styles.pickerText}>{section ? section.label : 'Select Class Section'}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
            <Pressable style={styles.pickerRow} onPress={() => setPicker('exam')}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              <Text style={styles.pickerText}>{exam ? exam.name : 'Select Exam'}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          </Card>
        )}

        {loadingGrid && <Card><ActivityIndicator color={colors.primary} /></Card>}

        {grid && grid.subjects.length > 0 && (
          <Card>
            <Text style={styles.sectionLabel}>Subject</Text>
            <Pressable style={styles.pickerRow} onPress={() => setPicker('subject')}>
              <Ionicons name="book-outline" size={20} color={colors.primary} />
              <Text style={styles.pickerText}>
                {activeSubject ? `${activeSubject.subject_name}  (max ${activeSubject.max_marks})` : 'Select Subject'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          </Card>
        )}

        {grid && activeSubject && (
          <Card>
            <View style={styles.gridHeader}>
              <Text style={[styles.gridHeaderText, { flex: 1 }]}>Student</Text>
              <Text style={[styles.gridHeaderText, { width: 90, textAlign: 'center' }]}>Marks / {activeSubject.max_marks}</Text>
              <Text style={[styles.gridHeaderText, { width: 60, textAlign: 'center' }]}>AB</Text>
            </View>
            {filteredStudents.map((st) => {
              const cell = marks[String(activeSubject.subject_id)]?.[st.student_id] || { value: '', absent: false };
              return (
                <View key={st.student_id} style={styles.gridRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>{st.student_name}</Text>
                    <Text style={styles.adm}>Adm. # {st.admission_number}</Text>
                  </View>
                  <TextInput
                    value={cell.value}
                    onChangeText={(t) => setStudentMark(activeSubject.subject_id, st.student_id, t)}
                    keyboardType="numeric"
                    editable={!cell.absent}
                    placeholder="-"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.markInput, cell.absent && { backgroundColor: '#f1f5f9', color: colors.textMuted }]}
                  />
                  <Pressable
                    onPress={() => toggleAbsent(activeSubject.subject_id, st.student_id)}
                    style={[styles.absChip, cell.absent && styles.absChipOn]}
                  >
                    <Text style={[styles.absChipText, cell.absent && styles.absChipTextOn]}>
                      {cell.absent ? 'AB' : '–'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            {filteredStudents.length === 0 && (
              <Text style={{ color: colors.textMuted, paddingVertical: spacing.md }}>No students.</Text>
            )}
          </Card>
        )}

        {grid && (
          <Button title={saving ? 'Saving…' : 'Save Marks'} onPress={onSave} loading={saving} />
        )}
      </ScrollView>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>
                {picker === 'section' ? 'Select Class Section' : picker === 'exam' ? 'Select Exam' : 'Select Subject'}
              </Text>
              <Pressable onPress={() => setPicker(null)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {picker === 'section' && sections.map((s) => (
                <Pressable key={s.id} style={styles.modalItem} onPress={() => onSelectSection(s)}>
                  <Text style={styles.modalItemText}>{s.label}</Text>
                </Pressable>
              ))}
              {picker === 'exam' && exams.map((e) => (
                <Pressable key={e.id} style={styles.modalItem} onPress={() => onSelectExam(e)}>
                  <Text style={styles.modalItemText}>{e.name}</Text>
                </Pressable>
              ))}
              {picker === 'subject' && grid?.subjects.map((s) => (
                <Pressable
                  key={s.subject_id}
                  style={styles.modalItem}
                  onPress={() => { setActiveSubject(s); setPicker(null); }}
                >
                  <Text style={styles.modalItemText}>{s.subject_name}  (max {s.max_marks})</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4 },
  sectionLabel: { fontWeight: '800', color: colors.text, marginBottom: spacing.sm, fontSize: 14 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    marginBottom: spacing.sm, backgroundColor: '#fff',
  },
  pickerText: { flex: 1, color: colors.text, fontWeight: '600' },
  gridHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  gridHeaderText: { fontWeight: '800', color: colors.text, fontSize: 12, textTransform: 'uppercase' },
  gridRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  studentName: { color: colors.text, fontWeight: '700' },
  adm: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  markInput: {
    width: 90, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    textAlign: 'center', color: colors.text, fontWeight: '700',
  },
  absChip: {
    width: 60, paddingVertical: 8, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#fff',
  },
  absChipOn: { backgroundColor: colors.danger, borderColor: colors.danger },
  absChipText: { fontWeight: '800', color: colors.textMuted },
  absChipTextOn: { color: '#fff' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: radius.md, overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.primary,
  },
  modalHeaderText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  modalItem: {
    paddingVertical: 14, paddingHorizontal: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalItemText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});

export default TeacherMarksScreen;
