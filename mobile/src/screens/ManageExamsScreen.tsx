import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface ExamType {
  id: number;
  name: string;
  academic_year_id: number;
  academic_year_name?: string;
  description: string | null;
  is_active: boolean;
}

interface AcademicYear {
  id: number;
  name: string;
  is_current: boolean;
}

const ManageExamsScreen = () => {
  const [exams, setExams] = useState<ExamType[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formYearId, setFormYearId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAcademicYears = async () => {
    try {
      const data = await apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS);
      setAcademicYears(data);
      const current = data.find((y: AcademicYear) => y.is_current);
      if (current) { setSelectedYear(current.id); setFormYearId(current.id); }
      else if (data.length > 0) { setSelectedYear(data[0].id); setFormYearId(data[0].id); }
    } catch (error) {
      console.error('Failed to fetch academic years:', error);
    }
  };

  const fetchExams = async () => {
    try {
      let url = API_ENDPOINTS.EXAM_TYPES;
      if (selectedYear) url += `?academic_year_id=${selectedYear}`;
      const data = await apiClient.get<ExamType[]>(url);
      setExams(data);
    } catch (error) {
      console.error('Failed to fetch exam types:', error);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchAcademicYears(); }, []);
  useEffect(() => { if (selectedYear) fetchExams(); }, [selectedYear]);

  const handleSave = async () => {
    if (!formName.trim() || !formYearId) {
      Alert.alert('Error', 'Name and academic year are required'); return;
    }
    setSaving(true);
    try {
      const body = { name: formName, description: formDesc || null, academic_year_id: formYearId };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.EXAM_TYPES}/${editId}`, body);
      } else {
        await apiClient.post(API_ENDPOINTS.EXAM_TYPES, body);
      }
      setShowForm(false); resetForm(); fetchExams();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormName(''); setFormDesc(''); setEditId(null); };

  const handleEdit = (e: ExamType) => {
    setFormName(e.name); setFormDesc(e.description || ''); setFormYearId(e.academic_year_id); setEditId(e.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.EXAM_TYPES}/${id}`); fetchExams(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed to delete'); }
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Academic Year:</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={selectedYear}
            onValueChange={(v) => { setSelectedYear(v); setLoading(true); }}
            style={{ height: 44 }}
          >
            {academicYears.map(y => (
              <Picker.Item key={y.id} label={y.name} value={y.id} />
            ))}
          </Picker>
        </View>
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Exam Type</Text>
      </TouchableOpacity>

      <FlatList
        data={exams}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchExams(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? <Text style={styles.sub}>{item.description}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => handleEdit(item)}><Text style={styles.actionIcon}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={styles.actionIcon}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No exam types found</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Exam Type' : 'Add Exam Type'}</Text>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="e.g. Term 1 Exam" />
            <Text style={styles.label}>Description</Text>
            <TextInput style={styles.input} value={formDesc} onChangeText={setFormDesc} placeholder="Description" multiline />
            <Text style={styles.label}>Academic Year *</Text>
            <View style={[styles.input, { padding: 0 }]}>
              <Picker selectedValue={formYearId} onValueChange={setFormYearId} style={{ height: 44 }}>
                {academicYears.map(y => (<Picker.Item key={y.id} label={y.name} value={y.id} />))}
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.addBtn, { flex: 1, marginRight: 8 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.addBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addBtn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowForm(false)}>
                <Text style={styles.addBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginRight: 8 },
  pickerWrap: { flex: 1, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  addBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  actionIcon: { fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default ManageExamsScreen;
