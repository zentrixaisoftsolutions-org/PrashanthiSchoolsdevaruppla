import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface Device {
  id: number;
  device_name: string;
  device_id: string;
  location: string | null;
  ip_address: string | null;
  is_active: boolean;
}

const DevicesScreen = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDeviceId, setFormDeviceId] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formIp, setFormIp] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  const fetchDevices = async () => {
    try {
      const data = await apiClient.get<Device[]>(API_ENDPOINTS.DEVICES);
      setDevices(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchDevices(); }, []);

  const handleSave = async () => {
    if (!formName.trim() || !formDeviceId.trim()) {
      Alert.alert('Error', 'Device name and ID are required'); return;
    }
    setSaving(true);
    try {
      const body = {
        device_name: formName, device_id: formDeviceId,
        location: formLocation || null, ip_address: formIp || null,
      };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.DEVICES}/${editId}`, body);
      } else {
        await apiClient.post(API_ENDPOINTS.DEVICES, body);
      }
      setShowForm(false); resetForm(); fetchDevices();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setFormName(''); setFormDeviceId(''); setFormLocation(''); setFormIp(''); setEditId(null);
  };

  const handleEdit = (d: Device) => {
    setFormName(d.device_name); setFormDeviceId(d.device_id);
    setFormLocation(d.location || ''); setFormIp(d.ip_address || '');
    setEditId(d.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.DEVICES}/${id}`); fetchDevices(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }},
    ]);
  };

  const handleTestConnection = async (id: number) => {
    setTesting(id);
    try {
      const result = await apiClient.post(`${API_ENDPOINTS.DEVICES}/${id}/test-connection`, {});
      Alert.alert('Success', 'Device is connected and responding');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.response?.data?.detail || 'Could not reach device');
    } finally { setTesting(null); }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={styles.addBtnText}>+ Add Device</Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDevices(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.device_name}</Text>
              <Text style={styles.sub}>ID: {item.device_id}</Text>
              {item.location && <Text style={styles.sub}>📍 {item.location}</Text>}
              {item.ip_address && <Text style={styles.sub}>🌐 {item.ip_address}</Text>}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.is_active ? COLORS.success : COLORS.error }]}>
              <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
            <View style={{ flexDirection: 'column', gap: 4, marginLeft: 8 }}>
              <TouchableOpacity onPress={() => handleEdit(item)}><Text style={styles.actionIcon}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleTestConnection(item.id)} disabled={testing === item.id}>
                <Text style={styles.actionIcon}>{testing === item.id ? '⏳' : '🔌'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={styles.actionIcon}>🗑️</Text></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No devices configured</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Device' : 'Add Device'}</Text>
            <Text style={styles.label}>Device Name *</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="e.g. Main Gate Reader" />
            <Text style={styles.label}>Device ID *</Text>
            <TextInput style={styles.input} value={formDeviceId} onChangeText={setFormDeviceId} placeholder="Unique device identifier" />
            <Text style={styles.label}>Location</Text>
            <TextInput style={styles.input} value={formLocation} onChangeText={setFormLocation} placeholder="e.g. Main Entrance" />
            <Text style={styles.label}>IP Address</Text>
            <TextInput style={styles.input} value={formIp} onChangeText={setFormIp} placeholder="e.g. 192.168.1.100" keyboardType="numeric" />
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
  actionIcon: { fontSize: 18, padding: 2 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default DevicesScreen;
