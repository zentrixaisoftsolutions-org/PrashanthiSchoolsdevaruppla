import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  role_id: number;
  is_active: boolean;
  phone: string | null;
}

const UserManagementScreen = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    try {
      const data = await apiClient.get<User[]>(API_ENDPOINTS.USER_MANAGEMENT);
      setUsers(data);
      setFiltered(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(users); return; }
    const q = search.toLowerCase();
    setFiltered(users.filter(u =>
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    ));
  }, [search, users]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return COLORS.error;
      case 'admin': return COLORS.warning;
      case 'teacher': return COLORS.info;
      case 'parent': return COLORS.success;
      case 'student': return COLORS.secondary;
      default: return COLORS.textSecondary;
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search users by name, email, role..."
        value={search}
        onChangeText={setSearch}
      />
      <Text style={styles.count}>Total: {filtered.length} users</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.full_name?.charAt(0) || item.username?.charAt(0) || 'U'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name || item.username}</Text>
              <Text style={styles.sub}>{item.email}</Text>
              {item.phone && <Text style={styles.sub}>📱 {item.phone}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
                <Text style={styles.roleText}>{item.role}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: item.is_active ? COLORS.success : COLORS.error }]} />
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No users found</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchInput: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15, marginBottom: 8 },
  count: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12, textAlign: 'right' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  roleText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40 },
});

export default UserManagementScreen;
