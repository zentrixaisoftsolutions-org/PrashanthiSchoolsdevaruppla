import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface WhatsAppConfig {
  id: number;
  provider: string;
  api_key: string;
  phone_number_id: string | null;
  is_active: boolean;
}

const WhatsAppSettingsScreen = () => {
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formProvider, setFormProvider] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formPhoneId, setFormPhoneId] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = async () => {
    try {
      const data = await apiClient.get<WhatsAppConfig[]>(`${API_ENDPOINTS.WHATSAPP_SETTINGS}/config`);
      setConfigs(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleSave = async () => {
    if (!formProvider.trim() || !formApiKey.trim()) {
      Alert.alert('Error', 'Provider and API key are required'); return;
    }
    setSaving(true);
    try {
      const body = { provider: formProvider, api_key: formApiKey, phone_number_id: formPhoneId || null };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.WHATSAPP_SETTINGS}/config/${editId}`, body);
      } else {
        await apiClient.post(`${API_ENDPOINTS.WHATSAPP_SETTINGS}/config`, body);
      }
      setShowForm(false); resetForm(); fetchConfigs();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormProvider(''); setFormApiKey(''); setFormPhoneId(''); setEditId(null); };

  const handleEdit = (c: WhatsAppConfig) => {
    setFormProvider(c.provider); setFormApiKey(c.api_key); setFormPhoneId(c.phone_number_id || '');
    setEditId(c.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this config?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.WHATSAPP_SETTINGS}/config/${id}`); fetchConfigs(); }
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
        <Text style={styles.addBtnText}>+ Add WhatsApp Config</Text>
      </TouchableOpacity>

      <FlatList
        data={configs}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConfigs(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.provider}</Text>
              <Text style={styles.sub}>Phone ID: {item.phone_number_id || 'N/A'}</Text>
              <Text style={styles.sub}>API Key: {'•'.repeat(8)}{item.api_key?.slice(-4)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.is_active ? COLORS.success : COLORS.error }]}>
              <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
              <TouchableOpacity onPress={() => handleEdit(item)}><Text style={styles.actionIcon}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={styles.actionIcon}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No WhatsApp configs found</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit WhatsApp Config' : 'Add WhatsApp Config'}</Text>
            <Text style={styles.label}>Provider *</Text>
            <TextInput style={styles.input} value={formProvider} onChangeText={setFormProvider} placeholder="e.g. Meta Cloud API" />
            <Text style={styles.label}>API Key *</Text>
            <TextInput style={styles.input} value={formApiKey} onChangeText={setFormApiKey} placeholder="API key" secureTextEntry />
            <Text style={styles.label}>Phone Number ID</Text>
            <TextInput style={styles.input} value={formPhoneId} onChangeText={setFormPhoneId} placeholder="Phone number ID" />
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
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  actionIcon: { fontSize: 18, padding: 4 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default WhatsAppSettingsScreen;
