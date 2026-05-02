import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal, FlatList,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface AcademicYear { id: number; name: string; is_current: boolean; }

// ── PickerModal ──
const PickerModal = ({ visible, onClose, title, data, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: any }[]; onSelect: (v: any) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={pk.overlay} activeOpacity={1} onPress={onClose}>
      <View style={pk.sheet}>
        <Text style={pk.title}>{title}</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={pk.item} onPress={() => { onSelect(item.value); onClose(); }}>
              <Text style={pk.itemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={pk.cancelBtn} onPress={onClose}>
          <Text style={pk.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);
const pk = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 20 },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  item: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemText: { fontSize: 15, color: COLORS.text },
  cancelBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
});

const TERM_COLORS: { bg: string; accent: string; label: string }[] = [
  { bg: '#dbeafe', accent: '#2563eb', label: 'Term 1' },
  { bg: '#dcfce7', accent: '#16a34a', label: 'Term 2' },
  { bg: '#f3e8ff', accent: '#7c3aed', label: 'Term 3' },
];

const formatDisplayDate = (d: string) => {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T00:00:00');
    return `📅 ${dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  } catch { return d; }
};

const FeeSettingsScreen = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [dueDates, setDueDates] = useState<string[]>(['', '', '']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingPush, setSendingPush] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [ayPickerVisible, setAyPickerVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ayData = await apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS);
        setAcademicYears(ayData);
        const current = ayData.find((y: AcademicYear) => y.is_current) || ayData[0];
        if (current) setSelectedAYId(current.id);
      } catch (error) { console.error(error); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAYId) return;
    const fetchDueDates = async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<any[]>(`${API_ENDPOINTS.TERM_DUE_DATES}?academic_year_id=${selectedAYId}`);
        const dates = ['', '', ''];
        if (Array.isArray(data)) {
          data.forEach((d: any) => {
            const idx = (d.term || 0) - 1;
            if (idx >= 0 && idx < 3) dates[idx] = (d.due_date || '').split('T')[0];
          });
        }
        setDueDates(dates);
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetchDueDates();
  }, [selectedAYId]);

  const handleSave = async () => {
    if (!selectedAYId) return;
    setSaving(true);
    try {
      const terms = dueDates.map((dd, i) => ({ term: i + 1, due_date: dd }));
      await apiClient.post(API_ENDPOINTS.TERM_DUE_DATES, { academic_year_id: selectedAYId, terms });
      Alert.alert('Success', 'Due dates saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleSendPush = async () => {
    setSendingPush(true);
    try {
      const result = await apiClient.post(API_ENDPOINTS.SEND_FEE_REMINDERS, {});
      Alert.alert('Success', `Push notifications sent: ${result.sent || 0}, skipped: ${result.skipped || 0}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send');
    } finally { setSendingPush(false); }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const result = await apiClient.post(API_ENDPOINTS.SEND_FEE_EMAILS, {});
      Alert.alert('Success', `Emails sent: ${result.sent || 0}, skipped: ${result.skipped || 0}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send');
    } finally { setSendingEmail(false); }
  };

  const ayName = academicYears.find(y => y.id === selectedAYId)?.name || 'Select Year';

  return (
    <ScrollView style={s.container}>
      {/* Academic Year Selector */}
      <TouchableOpacity style={s.ayBtn} onPress={() => setAyPickerVisible(true)}>
        <Text style={s.ayLabel}>Academic Year</Text>
        <Text style={s.ayValue}>{ayName} ▾</Text>
      </TouchableOpacity>

      {/* Term Due Dates */}
      <Text style={s.sectionTitle}>Term Due Dates</Text>
      <Text style={s.hint}>Set the due dates for each term. Students will be notified when fees are overdue.</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 30 }} />
      ) : (
        <>
          {TERM_COLORS.map((tc, index) => (
            <View key={index} style={[s.termCard, { backgroundColor: tc.bg, borderColor: tc.accent }]}>
              <View style={s.termHeader}>
                <View style={[s.termBadge, { backgroundColor: tc.accent }]}>
                  <Text style={s.termBadgeText}>{index + 1}</Text>
                </View>
                <Text style={[s.termTitle, { color: tc.accent }]}>{tc.label}</Text>
              </View>
              <TextInput
                style={[s.dateInput, { borderColor: tc.accent }]}
                value={dueDates[index]}
                onChangeText={(v) => {
                  const updated = [...dueDates];
                  updated[index] = v;
                  setDueDates(updated);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSecondary}
              />
              {dueDates[index] ? (
                <Text style={[s.dateDisplay, { color: tc.accent }]}>
                  {formatDisplayDate(dueDates[index])}
                </Text>
              ) : null}
            </View>
          ))}

          <TouchableOpacity
            style={[s.btn, { backgroundColor: COLORS.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave} disabled={saving}>
            {saving ? (
              <View style={s.btnRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={s.btnText}> Saving...</Text>
              </View>
            ) : (
              <Text style={s.btnText}>💾 Save Due Dates</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      <View style={s.separator} />

      {/* Send Reminders */}
      <Text style={s.sectionTitle}>Send Fee Reminders</Text>
      <Text style={s.hint}>Manually send fee reminders to parents with pending fees.</Text>

      <TouchableOpacity
        style={[s.btn, { backgroundColor: '#4f46e5', opacity: sendingPush ? 0.7 : 1 }]}
        onPress={handleSendPush} disabled={sendingPush}>
        {sendingPush ? (
          <View style={s.btnRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.btnText}> Sending...</Text>
          </View>
        ) : (
          <Text style={s.btnText}>🔔 Send Push Notifications</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btn, { backgroundColor: '#ea580c', opacity: sendingEmail ? 0.7 : 1 }]}
        onPress={handleSendEmail} disabled={sendingEmail}>
        {sendingEmail ? (
          <View style={s.btnRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.btnText}> Sending...</Text>
          </View>
        ) : (
          <Text style={s.btnText}>📧 Send Fee Emails</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      <PickerModal visible={ayPickerVisible} title="Academic Year"
        data={academicYears.map(y => ({ label: y.name, value: y.id }))}
        onSelect={(v) => setSelectedAYId(v)}
        onClose={() => setAyPickerVisible(false)} />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  ayBtn: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 16 },
  ayLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  ayValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 8, marginTop: 8 },
  hint: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 },
  termCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1.5, elevation: 1 },
  termHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  termBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  termBadgeText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  termTitle: { fontSize: 16, fontWeight: '700' },
  dateInput: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, fontSize: 15, color: COLORS.text },
  dateDisplay: { marginTop: 6, fontSize: 13, fontWeight: '500' },
  btn: { padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 12, elevation: 1 },
  btnRow: { flexDirection: 'row', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  separator: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
});

export default FeeSettingsScreen;
