import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface Subject {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
}

const SubjectsScreen = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSubjects = async () => {
    try {
      const data = await apiClient.get<Subject[]>(API_ENDPOINTS.SUBJECTS);
      setSubjects(data);
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchSubjects(); }, []);

  const handleSave = async () => {
    if (!formName.trim()) { Alert.alert('Error', 'Subject name is required'); return; }
    setSaving(true);
    try {
      const body: any = { name: formName, code: formCode || null };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.SUBJECTS}/${editId}`, body);
      } else {
        await apiClient.post(API_ENDPOINTS.SUBJECTS, body);
      }
      setShowForm(false); resetForm(); fetchSubjects();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormName(''); setFormCode(''); setEditId(null); };

  const handleEdit = (s: Subject) => {
    setFormName(s.name); setFormCode(s.code || ''); setEditId(s.id); setShowForm(true);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Subject</Text>
      </TouchableOpacity>

      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSubjects(); }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleEdit(item)}>
            <View style={[styles.dot, { backgroundColor: item.is_active ? COLORS.success : COLORS.error }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.code ? <Text style={styles.sub}>Code: {item.code}</Text> : null}
            </View>
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No subjects found</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Subject' : 'Add Subject'}</Text>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Subject name" />
            <Text style={styles.label}>Code</Text>
            <TextInput style={styles.input} value={formCode} onChangeText={setFormCode} placeholder="Subject code" />
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
  addBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  editIcon: { fontSize: 18 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default SubjectsScreen;
