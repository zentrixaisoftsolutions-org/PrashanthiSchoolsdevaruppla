import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, FlatList, Platform,
  StatusBar, RefreshControl,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──
interface AcademicYear { id: number; name: string; is_current: boolean; }
interface ExamType { id: number; name: string; academic_year_id: number | null; }
interface ClassSection { id: number; class_name: string; section_name: string; }
interface Subject { id: number; name: string; code: string; }

interface SubjectScheduleEntry {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  max_marks: number;
  pass_marks: number;
  display_order: number;
}

interface ScheduleSubject {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
  max_marks: number;
  pass_marks: number;
  display_order: number;
}

interface ExaminationSchedule {
  id: number;
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  from_date: string;
  to_date: string;
  is_active: boolean;
  class_sections: { id: number; class_name: string; section_name: string }[];
  subjects: ScheduleSubject[];
  created_at: string;
  updated_at: string;
}

interface ClassGroup {
  class_name: string;
  sections: { id: number; section_name: string }[];
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

// ── Date Picker Helpers ──
const DatePickerButton = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState(value || new Date().toISOString().split('T')[0]);

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => { setTempDate(value || new Date().toISOString().split('T')[0]); setShow(true); }}>
        <Text style={value ? styles.dateBtnText : styles.dateBtnPlaceholder}>
          {value ? formatDate(value) : 'Select date'}
        </Text>
      </TouchableOpacity>
      <Modal visible={show} transparent animationType="fade">
        <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={() => setShow(false)}>
          <View style={[pm.sheet, { paddingHorizontal: 20 }]}>
            <Text style={pm.sheetTitle}>{label}</Text>
            <TextInput
              style={[styles.input, { marginTop: 16 }]}
              placeholder="YYYY-MM-DD"
              value={tempDate}
              onChangeText={setTempDate}
              keyboardType="default"
            />
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: 12 }]}
              onPress={() => { onChange(tempDate); setShow(false); }}
            >
              <Text style={styles.saveBtnText}>Set Date</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pm.cancelBtn} onPress={() => setShow(false)}>
              <Text style={pm.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
};

const MapExamsScreen = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Data
  const [schedules, setSchedules] = useState<ExaminationSchedule[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExaminationSchedule | null>(null);

  // Picker states
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({
    visible: false, title: '', data: [], onSelect: () => {},
  });

  // Form state
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedClassSections, setSelectedClassSections] = useState<number[]>([]);

  // Subject scheduling
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [subjectSchedules, setSubjectSchedules] = useState<SubjectScheduleEntry[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Expanded schedule cards
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => { fetchInitialData(); }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [years, types, sections, schedulesData] = await Promise.all([
        apiClient.get<AcademicYear[]>(`${API_ENDPOINTS.ACADEMIC_YEARS}?include_inactive=false`),
        apiClient.get<ExamType[]>(`${API_ENDPOINTS.EXAM_TYPES}?include_inactive=false`),
        apiClient.get<ClassSection[]>(API_ENDPOINTS.CLASS_SECTIONS),
        apiClient.get<ExaminationSchedule[]>(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}?include_inactive=true`),
      ]);
      setAcademicYears(years);
      setExamTypes(types);
      setClassSections(sections);
      setSchedules(schedulesData);
      const currentYear = years.find((y: AcademicYear) => y.is_current) || years[0];
      if (currentYear) setSelectedAcademicYearId(currentYear.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchInitialData();
    setRefreshing(false);
  };

  // Filtered exam types by academic year
  const filteredExamTypes = selectedAcademicYearId
    ? examTypes.filter(et => et.academic_year_id === selectedAcademicYearId || et.academic_year_id === null)
    : examTypes;

  // Group class sections
  const getGroupedClasses = (): ClassGroup[] => {
    const grouped: Record<string, { id: number; section_name: string }[]> = {};
    classSections.forEach(cs => {
      if (!grouped[cs.class_name]) grouped[cs.class_name] = [];
      grouped[cs.class_name].push({ id: cs.id, section_name: cs.section_name });
    });
    return Object.entries(grouped).map(([class_name, sections]) => ({ class_name, sections }));
  };

  const isClassFullySelected = (className: string) =>
    classSections.filter(cs => cs.class_name === className).every(cs => selectedClassSections.includes(cs.id));

  const toggleClass = (className: string) => {
    const ids = classSections.filter(cs => cs.class_name === className).map(cs => cs.id);
    if (isClassFullySelected(className)) {
      setSelectedClassSections(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedClassSections(prev => [...new Set([...prev, ...ids])]);
    }
  };

  const toggleSection = (csId: number) => {
    setSelectedClassSections(prev =>
      prev.includes(csId) ? prev.filter(id => id !== csId) : [...prev, csId]
    );
  };

  // Fetch subjects for selected class sections
  const fetchSubjects = async (csIds: number[]) => {
    if (csIds.length === 0) { setAvailableSubjects([]); return; }
    try {
      setLoadingSubjects(true);
      const subjects = await apiClient.post<Subject[]>(`${API_ENDPOINTS.SUBJECTS}/by-class-sections`, {
        class_section_ids: csIds,
      });
      setAvailableSubjects(subjects);
    } catch { setAvailableSubjects([]); }
    finally { setLoadingSubjects(false); }
  };

  useEffect(() => {
    if (showModal && selectedClassSections.length > 0) fetchSubjects(selectedClassSections);
    else if (!showModal) setAvailableSubjects([]);
  }, [selectedClassSections, showModal]);

  // Subject schedule functions
  const addSubject = (subject: Subject) => {
    if (subjectSchedules.some(s => s.subject_id === subject.id)) return;
    const nextOrder = subjectSchedules.length > 0 ? Math.max(...subjectSchedules.map(s => s.display_order)) + 1 : 1;
    setSubjectSchedules(prev => [...prev, {
      subject_id: subject.id, subject_name: subject.name, subject_code: subject.code,
      exam_date: fromDate || '', start_time: '', end_time: '',
      max_marks: 100, pass_marks: 35, display_order: nextOrder,
    }]);
  };

  const removeSubject = (subjectId: number) => {
    setSubjectSchedules(prev => prev.filter(s => s.subject_id !== subjectId));
  };

  const updateSubjectField = (subjectId: number, field: keyof SubjectScheduleEntry, value: string | number) => {
    setSubjectSchedules(prev => prev.map(s => s.subject_id === subjectId ? { ...s, [field]: value } : s));
  };

  // Open create/edit modal
  const openCreateModal = () => {
    resetForm();
    setEditingSchedule(null);
    setShowModal(true);
  };

  const openEditModal = (schedule: ExaminationSchedule) => {
    setEditingSchedule(schedule);
    setSelectedAcademicYearId(schedule.academic_year_id);
    setSelectedExamTypeId(schedule.exam_type_id);
    setFromDate(schedule.from_date);
    setToDate(schedule.to_date);
    setSelectedClassSections(schedule.class_sections.map(cs => cs.id));
    if (schedule.subjects?.length > 0) {
      setSubjectSchedules(schedule.subjects.map(s => ({
        subject_id: s.subject_id, subject_name: s.subject_name, subject_code: s.subject_code,
        exam_date: s.exam_date, start_time: s.start_time || '', end_time: s.end_time || '',
        max_marks: s.max_marks, pass_marks: s.pass_marks ?? 35, display_order: s.display_order || 0,
      })).sort((a, b) => a.display_order - b.display_order));
    } else {
      setSubjectSchedules([]);
    }
    setShowModal(true);
  };

  const resetForm = () => {
    const currentYear = academicYears.find(y => y.is_current) || academicYears[0];
    setSelectedAcademicYearId(currentYear?.id || null);
    setSelectedExamTypeId(null);
    setFromDate('');
    setToDate('');
    setSelectedClassSections([]);
    setSubjectSchedules([]);
    setAvailableSubjects([]);
  };

  // Submit
  const handleSubmit = async () => {
    if (!selectedExamTypeId) { Alert.alert('Error', 'Please select an exam'); return; }
    if (!fromDate || !toDate) { Alert.alert('Error', 'Please set from and to dates'); return; }
    if (selectedClassSections.length === 0) { Alert.alert('Error', 'Please select at least one class section'); return; }
    if (subjectSchedules.length > 0 && subjectSchedules.some(s => !s.exam_date)) {
      Alert.alert('Error', 'Please set exam date for all subjects'); return;
    }

    try {
      setSaving(true);
      const subjectsData = subjectSchedules.filter(s => s.exam_date).map(s => ({
        subject_id: s.subject_id, exam_date: s.exam_date,
        start_time: s.start_time || null, end_time: s.end_time || null,
        max_marks: s.max_marks, pass_marks: s.pass_marks, display_order: s.display_order,
      }));

      const payload = {
        exam_type_id: selectedExamTypeId,
        academic_year_id: selectedAcademicYearId,
        from_date: fromDate,
        to_date: toDate,
        class_section_ids: selectedClassSections,
        subjects: subjectsData,
      };

      if (editingSchedule) {
        await apiClient.put(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}/${editingSchedule.id}`, payload);
        Alert.alert('Success', 'Examination schedule updated');
      } else {
        await apiClient.post(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}/`, payload);
        Alert.alert('Success', 'Examination schedule created');
      }
      setShowModal(false);
      resetForm();
      const data = await apiClient.get<ExaminationSchedule[]>(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}?include_inactive=true`);
      setSchedules(data);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure you want to delete this examination schedule?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiClient.delete(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}/${id}`);
          setSchedules(prev => prev.filter(s => s.id !== id));
        } catch (err: any) {
          Alert.alert('Error', err?.response?.data?.detail || 'Failed to delete');
        }
      }},
    ]);
  };

  // Format helpers
  const formatClassSectionsText = (schedule: ExaminationSchedule) => {
    const grouped: Record<string, string[]> = {};
    schedule.class_sections.forEach(cs => {
      if (!grouped[cs.class_name]) grouped[cs.class_name] = [];
      grouped[cs.class_name].push(cs.section_name);
    });
    return Object.entries(grouped).map(([cls, secs]) => `${cls} (${secs.join(', ')})`).join(' | ');
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  // Get selected labels
  const selectedYearLabel = academicYears.find(y => y.id === selectedAcademicYearId)?.name || 'Select';
  const selectedExamLabel = filteredExamTypes.find(e => e.id === selectedExamTypeId)?.name || 'Select Exam';

  return (
    <View style={styles.container}>
      {/* List View */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {schedules.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No examination schedules found</Text>
            <Text style={styles.emptySub}>Tap + to create one</Text>
          </View>
        ) : (
          schedules.map(schedule => (
            <TouchableOpacity
              key={schedule.id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => setExpandedId(expandedId === schedule.id ? null : schedule.id)}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{schedule.exam_type_name}</Text>
                  {schedule.academic_year_name && (
                    <Text style={styles.cardSub}>{schedule.academic_year_name}</Text>
                  )}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(schedule)}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(schedule.id)}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Period:</Text>
                <Text style={styles.cardValue}>{formatDate(schedule.from_date)} → {formatDate(schedule.to_date)}</Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Classes:</Text>
                <Text style={[styles.cardValue, { flex: 1 }]} numberOfLines={expandedId === schedule.id ? undefined : 2}>
                  {formatClassSectionsText(schedule)}
                </Text>
              </View>

              {expandedId === schedule.id && schedule.subjects?.length > 0 && (
                <View style={styles.subjectsSection}>
                  <Text style={[styles.cardLabel, { marginBottom: 6 }]}>Subjects:</Text>
                  {schedule.subjects.sort((a, b) => a.display_order - b.display_order).map(sub => (
                    <View key={sub.id} style={styles.subjectRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subjectName}>{sub.subject_name} ({sub.subject_code})</Text>
                        <Text style={styles.subjectMeta}>
                          {formatDate(sub.exam_date)}
                          {sub.start_time ? ` · ${sub.start_time}` : ''}
                          {sub.end_time ? ` - ${sub.end_time}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.marksText}>Max: {sub.max_marks}</Text>
                        <Text style={styles.marksText}>Pass: {sub.pass_marks}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {schedule.subjects?.length > 0 && expandedId !== schedule.id && (
                <Text style={styles.subjectCount}>{schedule.subjects.length} subject(s) mapped</Text>
              )}

              <Text style={styles.chevronIndicator}>{expandedId === schedule.id ? '▾' : '▸'}</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* FAB */}
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openCreateModal}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.modalContainer}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 50 }]}>
            <TouchableOpacity onPress={() => { setShowModal(false); setEditingSchedule(null); }}>
              <Text style={styles.modalBackBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingSchedule ? 'Edit Examination' : 'Add Examination'}
            </Text>
            <TouchableOpacity onPress={handleSubmit} disabled={saving}>
              <Text style={[styles.modalSaveBtn, saving && { opacity: 0.5 }]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Academic Year */}
            <Text style={styles.fieldLabel}>Academic Year</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setPickerModal({
                visible: true, title: 'Select Academic Year',
                data: academicYears.map(y => ({ label: y.name, value: y.id })),
                onSelect: (v) => { setSelectedAcademicYearId(v); setSelectedExamTypeId(null); },
              })}
            >
              <Text style={styles.pickerBtnText}>{selectedYearLabel}</Text>
              <Text style={styles.pickerArrow}>▾</Text>
            </TouchableOpacity>

            {/* Exam Type */}
            <Text style={styles.fieldLabel}>Select Exam</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setPickerModal({
                visible: true, title: 'Select Exam',
                data: filteredExamTypes.map(e => ({ label: e.name, value: e.id })),
                onSelect: (v) => setSelectedExamTypeId(v),
              })}
            >
              <Text style={styles.pickerBtnText}>{selectedExamLabel}</Text>
              <Text style={styles.pickerArrow}>▾</Text>
            </TouchableOpacity>

            {/* Date Range */}
            <View style={styles.dateRow}>
              <DatePickerButton label="From Date" value={fromDate} onChange={setFromDate} />
              <View style={{ width: 12 }} />
              <DatePickerButton label="To Date" value={toDate} onChange={setToDate} />
            </View>

            {/* Class Section Selection */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Select Classes</Text>
            <View style={styles.classBox}>
              {getGroupedClasses().map(group => (
                <View key={group.class_name} style={styles.classGroup}>
                  {/* Class checkbox */}
                  <TouchableOpacity style={styles.checkRow} onPress={() => toggleClass(group.class_name)}>
                    <View style={[styles.checkbox, isClassFullySelected(group.class_name) && styles.checkboxChecked]}>
                      {isClassFullySelected(group.class_name) && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.classNameText}>{group.class_name}</Text>
                  </TouchableOpacity>
                  {/* Section checkboxes */}
                  <View style={styles.sectionsRow}>
                    {group.sections.map(sec => (
                      <TouchableOpacity key={sec.id} style={styles.checkRow} onPress={() => toggleSection(sec.id)}>
                        <View style={[styles.checkbox, styles.checkboxSmall,
                          selectedClassSections.includes(sec.id) && styles.checkboxChecked]}>
                          {selectedClassSections.includes(sec.id) && <Text style={[styles.checkmark, { fontSize: 10 }]}>✓</Text>}
                        </View>
                        <Text style={styles.sectionNameText}>{sec.section_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
              {getGroupedClasses().length === 0 && (
                <Text style={styles.noDataText}>No classes available</Text>
              )}
            </View>

            {/* Subject Scheduling */}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Subject Schedule</Text>
            {selectedClassSections.length === 0 ? (
              <Text style={styles.noDataText}>Select class sections above to add subjects</Text>
            ) : (
              <>
                {/* Add subject picker */}
                <TouchableOpacity
                  style={[styles.pickerBtn, { marginBottom: 10 }]}
                  onPress={() => {
                    const unaddedSubjects = availableSubjects.filter(s => !subjectSchedules.some(ss => ss.subject_id === s.id));
                    setPickerModal({
                      visible: true, title: 'Add Subject',
                      data: unaddedSubjects.map(s => ({ label: `${s.name} (${s.code})`, value: s })),
                      onSelect: (v: Subject) => addSubject(v),
                    });
                  }}
                  disabled={loadingSubjects}
                >
                  <Text style={styles.pickerBtnText}>
                    {loadingSubjects ? 'Loading subjects...' : '+ Add Subject'}
                  </Text>
                </TouchableOpacity>

                {/* Subject list */}
                {subjectSchedules.sort((a, b) => a.display_order - b.display_order).map(sub => (
                  <View key={sub.subject_id} style={styles.subjectCard}>
                    <View style={styles.subjectCardHeader}>
                      <Text style={styles.subjectCardTitle}>{sub.subject_name} ({sub.subject_code})</Text>
                      <TouchableOpacity onPress={() => removeSubject(sub.subject_id)}>
                        <Text style={{ color: COLORS.error, fontSize: 18 }}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Exam Date */}
                    <View style={styles.subFieldRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.subFieldLabel}>Exam Date</Text>
                        <TextInput
                          style={styles.subInput}
                          placeholder="YYYY-MM-DD"
                          value={sub.exam_date}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'exam_date', v)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subFieldLabel}>Seq #</Text>
                        <TextInput
                          style={styles.subInput}
                          keyboardType="numeric"
                          value={String(sub.display_order)}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'display_order', parseInt(v) || 1)}
                        />
                      </View>
                    </View>

                    {/* Time */}
                    <View style={styles.subFieldRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.subFieldLabel}>Start Time</Text>
                        <TextInput
                          style={styles.subInput}
                          placeholder="HH:MM"
                          value={sub.start_time}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'start_time', v)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subFieldLabel}>End Time</Text>
                        <TextInput
                          style={styles.subInput}
                          placeholder="HH:MM"
                          value={sub.end_time}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'end_time', v)}
                        />
                      </View>
                    </View>

                    {/* Marks */}
                    <View style={styles.subFieldRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.subFieldLabel}>Max Marks</Text>
                        <TextInput
                          style={styles.subInput}
                          keyboardType="numeric"
                          value={String(sub.max_marks)}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'max_marks', parseInt(v) || 0)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subFieldLabel}>Pass Marks</Text>
                        <TextInput
                          style={styles.subInput}
                          keyboardType="numeric"
                          value={String(sub.pass_marks)}
                          onChangeText={v => updateSubjectField(sub.subject_id, 'pass_marks', parseInt(v) || 0)}
                        />
                      </View>
                    </View>
                  </View>
                ))}

                {subjectSchedules.length === 0 && availableSubjects.length > 0 && !loadingSubjects && (
                  <Text style={styles.noDataText}>No subjects added. Tap "+ Add Subject" above.</Text>
                )}
                {availableSubjects.length === 0 && !loadingSubjects && (
                  <Text style={styles.noDataText}>No subjects mapped to selected classes.</Text>
                )}
              </>
            )}
          </ScrollView>

          {/* Picker Modal inside full-screen modal */}
          <PickerModal
            visible={pickerModal.visible}
            title={pickerModal.title}
            data={pickerModal.data}
            onSelect={pickerModal.onSelect}
            onClose={() => setPickerModal(prev => ({ ...prev, visible: false }))}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Empty
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  // Card list
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: COLORS.success, padding: 8, borderRadius: 8 },
  deleteBtn: { backgroundColor: COLORS.error, padding: 8, borderRadius: 8 },
  cardRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, width: 60 },
  cardValue: { fontSize: 13, color: COLORS.text },
  subjectCount: { fontSize: 12, color: COLORS.primary, marginTop: 4, fontStyle: 'italic' },
  chevronIndicator: { position: 'absolute', right: 14, bottom: 14, fontSize: 14, color: COLORS.textSecondary },

  // Expanded subjects
  subjectsSection: { marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  subjectRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' },
  subjectName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  subjectMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  marksText: { fontSize: 11, color: COLORS.textSecondary },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { fontSize: 28, color: '#fff', marginTop: -2 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingBottom: 14 },
  modalBackBtn: { color: '#fff', fontSize: 16, fontWeight: '500' },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  modalSaveBtn: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
  pickerBtnText: { flex: 1, fontSize: 14, color: COLORS.text },
  pickerArrow: { fontSize: 14, color: COLORS.textSecondary },
  dateRow: { flexDirection: 'row', marginTop: 4 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13 },
  dateBtnText: { fontSize: 14, color: COLORS.text },
  dateBtnPlaceholder: { fontSize: 14, color: COLORS.textSecondary },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text },

  // Class checkboxes
  classBox: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 12, maxHeight: 260 },
  classGroup: { marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  checkboxSmall: { width: 18, height: 18 },
  checkboxChecked: { backgroundColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  classNameText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  sectionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: 32, gap: 8, marginTop: 4 },
  sectionNameText: { fontSize: 13, color: '#f97316' },
  noDataText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 16, backgroundColor: '#fafafa', borderRadius: 8, marginTop: 4 },

  // Subject cards in form
  subjectCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 12, marginBottom: 10 },
  subjectCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subjectCardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  subFieldRow: { flexDirection: 'row', marginBottom: 6 },
  subFieldLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 3 },
  subInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.text },

  // Save button (used in date picker)
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default MapExamsScreen;
