import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Modal,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface Department {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const DepartmentsScreen = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDepartments = async () => {
    try {
      const data = await apiClient.get<Department[]>(API_ENDPOINTS.DEPARTMENTS);
      setDepartments(data);
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  const handleSave = async () => {
    if (!formName.trim()) { Alert.alert('Error', 'Department name is required'); return; }
    setSaving(true);
    try {
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.DEPARTMENTS}/${editId}`, { name: formName, description: formDesc });
      } else {
        await apiClient.post(API_ENDPOINTS.DEPARTMENTS, { name: formName, description: formDesc });
      }
      setShowForm(false);
      setFormName(''); setFormDesc(''); setEditId(null);
      fetchDepartments();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleEdit = (dept: Department) => {
    setFormName(dept.name);
    setFormDesc(dept.description || '');
    setEditId(dept.id);
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.DEPARTMENTS}/${id}`); fetchDepartments(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed to delete'); }
      }},
    ]);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => { setFormName(''); setFormDesc(''); setEditId(null); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Department</Text>
      </TouchableOpacity>

      <FlatList
        data={departments}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDepartments(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => handleEdit(item)} style={styles.editBtn}>
                <Text style={styles.editBtnText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No departments found</Text>}
      />

      <Modal visible={showForm} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit' : 'Add'} Department</Text>
            <TextInput style={styles.input} placeholder="Department Name" value={formName} onChangeText={setFormName} />
            <TextInput style={[styles.input, { height: 80 }]} placeholder="Description (optional)" value={formDesc} onChangeText={setFormDesc} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  addBtn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 8, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  name: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  desc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 8 },
  editBtnText: { fontSize: 18 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { padding: 12, borderRadius: 8, backgroundColor: COLORS.background },
  cancelBtnText: { color: COLORS.textSecondary, fontWeight: '600' },
  saveBtn: { padding: 12, borderRadius: 8, backgroundColor: COLORS.primary, paddingHorizontal: 24 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});

export default DepartmentsScreen;
