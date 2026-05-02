import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface ClassSection { id: number; class_name: string; section_name: string; class_name_id: number; section_id: number; }
interface ClassName { id: number; name: string; }
interface Section { id: number; name: string; }

const ClassSectionsScreen = () => {
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formClassId, setFormClassId] = useState<number | null>(null);
  const [formSectionId, setFormSectionId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newSectionName, setNewSectionName] = useState('');

  const fetchData = async () => {
    try {
      const [csData, cnData, sData] = await Promise.all([
        apiClient.get<ClassSection[]>(API_ENDPOINTS.CLASS_SECTIONS),
        apiClient.get<ClassName[]>(API_ENDPOINTS.CLASS_NAMES),
        apiClient.get<Section[]>(API_ENDPOINTS.SECTIONS),
      ]);
      setClassSections(csData);
      setClassNames(cnData);
      setSections(sData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleMapSection = async () => {
    if (!formClassId || !formSectionId) {
      Alert.alert('Error', 'Select both class and section'); return;
    }
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.CLASS_SECTIONS, {
        class_name_id: formClassId, section_id: formSectionId,
      });
      setShowForm(false); setFormClassId(null); setFormSectionId(null);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to map');
    } finally { setSaving(false); }
  };

  const handleDeleteMapping = (id: number) => {
    Alert.alert('Delete', 'Remove this class-section mapping?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.CLASS_SECTIONS}/${id}`); fetchData(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }},
    ]);
  };

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      await apiClient.post(API_ENDPOINTS.CLASS_NAMES, { name: newClassName });
      setNewClassName(''); setShowAddClass(false); fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await apiClient.post(API_ENDPOINTS.SECTIONS, { name: newSectionName });
      setNewSectionName(''); setShowAddSection(false); fetchData();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 6 }]} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>+ Map Section</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 6, backgroundColor: COLORS.info }]} onPress={() => setShowAddClass(true)}>
          <Text style={styles.btnText}>+ Class</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.secondary }]} onPress={() => setShowAddSection(true)}>
          <Text style={styles.btnText}>+ Section</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.count}>Classes: {classNames.length} | Sections: {sections.length} | Mappings: {classSections.length}</Text>

      <FlatList
        data={classSections}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.class_name} - {item.section_name}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteMapping(item.id)}>
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No class-section mappings</Text>}
      />

      {/* Map Section Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Map Section to Class</Text>
            <Text style={styles.label}>Class</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={formClassId} onValueChange={setFormClassId} style={{ height: 44 }}>
                <Picker.Item label="Select Class" value={null} />
                {classNames.map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}
              </Picker>
            </View>
            <Text style={styles.label}>Section</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={formSectionId} onValueChange={setFormSectionId} style={{ height: 44 }}>
                <Picker.Item label="Select Section" value={null} />
                {sections.map(s => <Picker.Item key={s.id} label={s.name} value={s.id} />)}
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={handleMapSection} disabled={saving}>
                <Text style={styles.btnText}>{saving ? 'Saving...' : 'Map'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowForm(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Class Modal */}
      <Modal visible={showAddClass} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Class</Text>
            <TextInput style={styles.input} value={newClassName} onChangeText={setNewClassName} placeholder="Class name (e.g. Class 10)" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={handleAddClass}>
                <Text style={styles.btnText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowAddClass(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Section Modal */}
      <Modal visible={showAddSection} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Section</Text>
            <TextInput style={styles.input} value={newSectionName} onChangeText={setNewSectionName} placeholder="Section name (e.g. A)" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={handleAddSection}>
                <Text style={styles.btnText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowAddSection(false)}>
                <Text style={styles.btnText}>Cancel</Text>
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
  btnRow: { flexDirection: 'row', marginBottom: 12 },
  btn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  count: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  deleteIcon: { fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  pickerWrap: { backgroundColor: COLORS.background, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15, marginTop: 8 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default ClassSectionsScreen;
