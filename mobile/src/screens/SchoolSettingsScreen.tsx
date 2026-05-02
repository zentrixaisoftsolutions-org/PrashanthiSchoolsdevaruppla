import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Image,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface SchoolSettings {
  school_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  principal_name: string;
  established_year: string;
  affiliation_no: string;
  board: string;
  logo_url: string | null;
}

const SchoolSettingsScreen = () => {
  const [settings, setSettings] = useState<SchoolSettings>({
    school_name: '', address: '', city: '', state: '', pincode: '',
    phone: '', email: '', website: '', principal_name: '',
    established_year: '', affiliation_no: '', board: '', logo_url: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await apiClient.get<SchoolSettings>(API_ENDPOINTS.SCHOOL_SETTINGS);
        if (data) setSettings(data);
      } catch (error) { console.error(error); }
      finally { setLoading(false); }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.SCHOOL_SETTINGS, settings);
      Alert.alert('Success', 'Settings saved');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  const update = (key: keyof SchoolSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  const fields: { key: keyof SchoolSettings; label: string; placeholder: string }[] = [
    { key: 'school_name', label: 'School Name', placeholder: 'Enter school name' },
    { key: 'address', label: 'Address', placeholder: 'Enter address' },
    { key: 'city', label: 'City', placeholder: 'Enter city' },
    { key: 'state', label: 'State', placeholder: 'Enter state' },
    { key: 'pincode', label: 'Pincode', placeholder: 'Enter pincode' },
    { key: 'phone', label: 'Phone', placeholder: 'Enter phone' },
    { key: 'email', label: 'Email', placeholder: 'Enter email' },
    { key: 'website', label: 'Website', placeholder: 'Enter website' },
    { key: 'principal_name', label: 'Principal Name', placeholder: 'Enter principal name' },
    { key: 'established_year', label: 'Established Year', placeholder: 'e.g. 2010' },
    { key: 'affiliation_no', label: 'Affiliation No', placeholder: 'Enter affiliation number' },
    { key: 'board', label: 'Board', placeholder: 'e.g. CBSE, ICSE, State Board' },
  ];

  return (
    <ScrollView style={styles.container}>
      {settings.logo_url && (
        <View style={styles.logoContainer}>
          <Image source={{ uri: settings.logo_url }} style={styles.logo} resizeMode="contain" />
        </View>
      )}

      {fields.map(f => (
        <View key={f.key}>
          <Text style={styles.label}>{f.label}</Text>
          <TextInput
            style={styles.input}
            value={(settings[f.key] as string) || ''}
            onChangeText={(v) => update(f.key, v)}
            placeholder={f.placeholder}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving...' : '💾 Save Settings'}</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 100, height: 100, borderRadius: 12 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

export default SchoolSettingsScreen;
