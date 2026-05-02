import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface SMSConfig {
  id: number;
  provider: string;
  api_key: string;
  sender_id: string;
  is_active: boolean;
}

const SMSSettingsScreen = () => {
  const [configs, setConfigs] = useState<SMSConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formProvider, setFormProvider] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formSenderId, setFormSenderId] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [showTest, setShowTest] = useState(false);

  const fetchConfigs = async () => {
    try {
      const data = await apiClient.get<SMSConfig[]>(`${API_ENDPOINTS.SMS_SETTINGS}/config`);
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
      const body = { provider: formProvider, api_key: formApiKey, sender_id: formSenderId || null };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.SMS_SETTINGS}/config/${editId}`, body);
      } else {
        await apiClient.post(`${API_ENDPOINTS.SMS_SETTINGS}/config`, body);
      }
      setShowForm(false); resetForm(); fetchConfigs();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => { setFormProvider(''); setFormApiKey(''); setFormSenderId(''); setEditId(null); };

  const handleEdit = (c: SMSConfig) => {
    setFormProvider(c.provider); setFormApiKey(c.api_key); setFormSenderId(c.sender_id || '');
    setEditId(c.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this config?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.SMS_SETTINGS}/config/${id}`); fetchConfigs(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }},
    ]);
  };

  const handleTestSMS = async () => {
    if (!testPhone.trim()) { Alert.alert('Error', 'Enter phone number'); return; }
    try {
      await apiClient.post(`${API_ENDPOINTS.SMS_SETTINGS}/test`, { phone: testPhone, message: 'Test SMS from School ERP' });
      Alert.alert('Success', 'Test SMS sent');
      setShowTest(false); setTestPhone('');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send test SMS');
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={() => { resetForm(); setShowForm(true); }}>
          <Text style={styles.btnText}>+ Add Config</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.info }]} onPress={() => setShowTest(true)}>
          <Text style={styles.btnText}>Test SMS</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={configs}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConfigs(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.provider}</Text>
              <Text style={styles.sub}>Sender: {item.sender_id || 'N/A'}</Text>
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
        ListEmptyComponent={<Text style={styles.empty}>No SMS configs found</Text>}
      />

      {/* Add/Edit Form */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit SMS Config' : 'Add SMS Config'}</Text>
            <Text style={styles.label}>Provider *</Text>
            <TextInput style={styles.input} value={formProvider} onChangeText={setFormProvider} placeholder="e.g. Twilio" />
            <Text style={styles.label}>API Key *</Text>
            <TextInput style={styles.input} value={formApiKey} onChangeText={setFormApiKey} placeholder="API key" secureTextEntry />
            <Text style={styles.label}>Sender ID</Text>
            <TextInput style={styles.input} value={formSenderId} onChangeText={setFormSenderId} placeholder="Sender ID" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={handleSave} disabled={saving}>
                <Text style={styles.btnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowForm(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Test SMS Modal */}
      <Modal visible={showTest} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Test SMS</Text>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput style={styles.input} value={testPhone} onChangeText={setTestPhone} keyboardType="phone-pad" placeholder="9876543210" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, { flex: 1, marginRight: 8 }]} onPress={handleTestSMS}>
                <Text style={styles.btnText}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: COLORS.textSecondary }]} onPress={() => setShowTest(false)}>
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
  btn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
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

export default SMSSettingsScreen;
