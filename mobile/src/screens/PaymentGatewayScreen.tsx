import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, Switch,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface PaymentConfig {
  id: number;
  gateway_name: string;
  merchant_id: string | null;
  api_key: string;
  api_secret: string | null;
  is_active: boolean;
  is_test_mode: boolean;
}

const PaymentGatewayScreen = () => {
  const [configs, setConfigs] = useState<PaymentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formGateway, setFormGateway] = useState('');
  const [formMerchantId, setFormMerchantId] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formApiSecret, setFormApiSecret] = useState('');
  const [formTestMode, setFormTestMode] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = async () => {
    try {
      const data = await apiClient.get<PaymentConfig[]>(`${API_ENDPOINTS.PAYMENT_GATEWAY}`);
      setConfigs(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleSave = async () => {
    if (!formGateway.trim() || !formApiKey.trim()) {
      Alert.alert('Error', 'Gateway name and API key are required'); return;
    }
    setSaving(true);
    try {
      const body = {
        gateway_name: formGateway, merchant_id: formMerchantId || null,
        api_key: formApiKey, api_secret: formApiSecret || null,
        is_test_mode: formTestMode,
      };
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.PAYMENT_GATEWAY}/${editId}`, body);
      } else {
        await apiClient.post(`${API_ENDPOINTS.PAYMENT_GATEWAY}`, body);
      }
      setShowForm(false); resetForm(); fetchConfigs();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setFormGateway(''); setFormMerchantId(''); setFormApiKey('');
    setFormApiSecret(''); setFormTestMode(true); setEditId(null);
  };

  const handleEdit = (c: PaymentConfig) => {
    setFormGateway(c.gateway_name); setFormMerchantId(c.merchant_id || '');
    setFormApiKey(c.api_key); setFormApiSecret(c.api_secret || '');
    setFormTestMode(c.is_test_mode); setEditId(c.id); setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this config?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.PAYMENT_GATEWAY}/${id}`); fetchConfigs(); }
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
        <Text style={styles.addBtnText}>+ Add Payment Gateway</Text>
      </TouchableOpacity>

      <FlatList
        data={configs}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConfigs(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.gateway_name}</Text>
              {item.merchant_id && <Text style={styles.sub}>Merchant: {item.merchant_id}</Text>}
              <Text style={styles.sub}>Mode: {item.is_test_mode ? 'Test' : 'Live'}</Text>
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
        ListEmptyComponent={<Text style={styles.empty}>No payment gateways configured</Text>}
      />

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Gateway' : 'Add Gateway'}</Text>
            <Text style={styles.label}>Gateway Name *</Text>
            <TextInput style={styles.input} value={formGateway} onChangeText={setFormGateway} placeholder="e.g. Razorpay" />
            <Text style={styles.label}>Merchant ID</Text>
            <TextInput style={styles.input} value={formMerchantId} onChangeText={setFormMerchantId} placeholder="Merchant ID" />
            <Text style={styles.label}>API Key *</Text>
            <TextInput style={styles.input} value={formApiKey} onChangeText={setFormApiKey} placeholder="API key" secureTextEntry />
            <Text style={styles.label}>API Secret</Text>
            <TextInput style={styles.input} value={formApiSecret} onChangeText={setFormApiSecret} placeholder="API secret" secureTextEntry />
            <View style={styles.switchRow}>
              <Text style={styles.label}>Test Mode</Text>
              <Switch value={formTestMode} onValueChange={setFormTestMode} trackColor={{ false: COLORS.border, true: COLORS.warning }} />
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
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default PaymentGatewayScreen;
