import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface GradeCriteria {
  id: number;
  grade: string;
  min_marks: number;
  max_marks: number;
  grade_point: number | null;
  description: string | null;
  is_active: boolean;
}

const GradesScreen = () => {
  const [grades, setGrades] = useState<GradeCriteria[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formGrade, setFormGrade] = useState('');
  const [formMin, setFormMin] = useState('');
  const [formMax, setFormMax] = useState('');
  const [formGP, setFormGP] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchGrades = async () => {
    try {
      const data = await apiClient.get<GradeCriteria[]>(API_ENDPOINTS.GRADES);
      setGrades(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchGrades(); }, []);

  const handleSave = async () => {
    if (!formGrade.trim() || !formMin || !formMax) {
      Alert.alert('Error', 'Grade, min and max marks are required'); return;
    }
    setSaving(true);
    try {
      const body = {
        grade: formGrade, min_marks: parseFloat(formMin), max_marks: parseFloat(formMax),
        grade_point: formGP ? parseFloat(formGP) : null, description: formDesc || null,
      };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.GRADES}/${editId}`, body);
      } else {
        await apiClient.post(API_ENDPOINTS.GRADES, body);
      }
      setShowForm(false); resetForm(); fetchGrades();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormGrade(''); setFormMin(''); setFormMax(''); setFormGP(''); setFormDesc(''); setEditId(null); };

  const handleEdit = (g: GradeCriteria) => {
    setFormGrade(g.grade); setFormMin(g.min_marks.toString()); setFormMax(g.max_marks.toString());
    setFormGP(g.grade_point?.toString() || ''); setFormDesc(g.description || '');
    setEditId(g.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this grade?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.GRADES}/${id}`); fetchGrades(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Grade</Text>
      </TouchableOpacity>

      <FlatList
        data={grades}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGrades(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeText}>{item.grade}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>{item.min_marks} - {item.max_marks} marks</Text>
              {item.grade_point != null && <Text style={styles.sub}>GP: {item.grade_point}</Text>}
              {item.description && <Text style={styles.sub}>{item.description}</Text>}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => handleEdit(item)}><Text style={styles.actionIcon}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={styles.actionIcon}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No grades configured</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Grade' : 'Add Grade'}</Text>
            <Text style={styles.label}>Grade *</Text>
            <TextInput style={styles.input} value={formGrade} onChangeText={setFormGrade} placeholder="e.g. A+" />
            <Text style={styles.label}>Min Marks *</Text>
            <TextInput style={styles.input} value={formMin} onChangeText={setFormMin} keyboardType="numeric" placeholder="90" />
            <Text style={styles.label}>Max Marks *</Text>
            <TextInput style={styles.input} value={formMax} onChangeText={setFormMax} keyboardType="numeric" placeholder="100" />
            <Text style={styles.label}>Grade Point</Text>
            <TextInput style={styles.input} value={formGP} onChangeText={setFormGP} keyboardType="numeric" placeholder="10" />
            <Text style={styles.label}>Description</Text>
            <TextInput style={styles.input} value={formDesc} onChangeText={setFormDesc} placeholder="Outstanding" />
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
  gradeBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.warning, justifyContent: 'center', alignItems: 'center' },
  gradeText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  actionIcon: { fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default GradesScreen;
