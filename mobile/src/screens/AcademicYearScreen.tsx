import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface AcademicYear {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
}

const AcademicYearScreen = () => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchYears = async () => {
    try {
      const data = await apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS);
      setYears(data);
    } catch (error) {
      console.error('Failed to fetch academic years:', error);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchYears(); }, []);

  const handleSave = async () => {
    if (!formName.trim() || !formStart || !formEnd) {
      Alert.alert('Error', 'All fields are required'); return;
    }
    setSaving(true);
    try {
      const body = { name: formName, start_date: formStart, end_date: formEnd };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.ACADEMIC_YEARS}/${editId}`, body);
      } else {
        await apiClient.post(API_ENDPOINTS.ACADEMIC_YEARS, body);
      }
      setShowForm(false); resetForm(); fetchYears();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormName(''); setFormStart(''); setFormEnd(''); setEditId(null); };

  const handleEdit = (y: AcademicYear) => {
    setFormName(y.name);
    setFormStart(y.start_date?.split('T')[0] || '');
    setFormEnd(y.end_date?.split('T')[0] || '');
    setEditId(y.id);
    setShowForm(true);
  };

  const handleSetCurrent = async (id: number) => {
    try {
      await apiClient.post(`${API_ENDPOINTS.ACADEMIC_YEARS}/${id}/set-current`, {});
      fetchYears();
      Alert.alert('Success', 'Academic year set as current');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update');
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.ACADEMIC_YEARS}/${id}`); fetchYears(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed to delete'); }
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Academic Year</Text>
      </TouchableOpacity>

      <FlatList
        data={years}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchYears(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.is_current && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentText}>Current</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sub}>
                {item.start_date?.split('T')[0]} → {item.end_date?.split('T')[0]}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!item.is_current && (
                <TouchableOpacity onPress={() => handleSetCurrent(item.id)}>
                  <Text style={styles.actionIcon}>⭐</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleEdit(item)}>
                <Text style={styles.actionIcon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={styles.actionIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No academic years found</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Academic Year' : 'Add Academic Year'}</Text>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="e.g. 2024-2025" />
            <Text style={styles.label}>Start Date * (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={formStart} onChangeText={setFormStart} placeholder="2024-06-01" />
            <Text style={styles.label}>End Date * (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={formEnd} onChangeText={setFormEnd} placeholder="2025-03-31" />
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
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  currentBadge: { backgroundColor: COLORS.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 8 },
  currentText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  actionIcon: { fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default AcademicYearScreen;
