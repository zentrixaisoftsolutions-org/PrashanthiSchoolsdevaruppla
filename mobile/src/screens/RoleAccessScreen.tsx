import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Switch,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface RoleUser {
  id: number;
  username: string;
  full_name: string | null;
  role: string;
}

interface MenuAccess {
  menu_path: string;
  has_access: boolean;
}

const RoleAccessScreen = () => {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<RoleUser | null>(null);
  const [menuAccess, setMenuAccess] = useState<MenuAccess[]>([]);
  const [menuStructure, setMenuStructure] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await apiClient.get<RoleUser[]>(`${API_ENDPOINTS.ROLE_ACCESS}/users`);
      setUsers(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const fetchMenuStructure = async () => {
    try {
      const data = await apiClient.get<any>(`${API_ENDPOINTS.ROLE_ACCESS}/menu-structure`);
      setMenuStructure(Array.isArray(data) ? data : data.menus || []);
    } catch (error) { console.error(error); }
  };

  useEffect(() => { fetchUsers(); fetchMenuStructure(); }, []);

  const handleSelectUser = async (user: RoleUser) => {
    setSelectedUser(user);
    try {
      const data = await apiClient.get<any>(`${API_ENDPOINTS.ROLE_ACCESS}/user/${user.id}`);
      const access = Array.isArray(data) ? data : data.access || [];
      setMenuAccess(access);
    } catch (error) { console.error(error); }
  };

  const toggleAccess = (menuPath: string) => {
    setMenuAccess(prev => prev.map(m =>
      m.menu_path === menuPath ? { ...m, has_access: !m.has_access } : m
    ));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiClient.post(`${API_ENDPOINTS.ROLE_ACCESS}/user/${selectedUser.id}`, {
        access: menuAccess,
      });
      Alert.alert('Success', 'Access updated');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  if (selectedUser) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelectedUser(null)}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedUser.full_name || selectedUser.username}</Text>
        </View>

        <FlatList
          data={menuAccess}
          keyExtractor={(item) => item.menu_path}
          renderItem={({ item }) => (
            <View style={styles.accessRow}>
              <Text style={styles.menuPath}>{item.menu_path}</Text>
              <Switch
                value={item.has_access}
                onValueChange={() => toggleAccess(item.menu_path)}
                trackColor={{ false: COLORS.border, true: COLORS.success }}
              />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No menu access data</Text>}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Access'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Select User to Manage Access</Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => handleSelectUser(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name?.charAt(0) || item.username?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name || item.username}</Text>
              <Text style={styles.sub}>{item.role}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No users found</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { fontSize: 16, color: COLORS.primary, fontWeight: '600', marginRight: 12 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  arrow: { fontSize: 20, color: COLORS.textSecondary },
  accessRow: { backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuPath: { fontSize: 14, color: COLORS.text, flex: 1 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
});

export default RoleAccessScreen;
