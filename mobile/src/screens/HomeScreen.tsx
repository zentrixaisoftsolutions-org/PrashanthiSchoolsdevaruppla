import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { useAuth } from '../contexts/AuthContext';
import { parentService, Child } from '../services/dataService';
import { colors, spacing, radius } from '../theme';

const HomeScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const nav = useNavigation<any>();
  const [children, setChildren] = useState<Child[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await parentService.getChildren();
      setChildren(data);
    } catch (e) {
      console.warn('children load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const isTeacher = user?.role === 'teacher';
  // For parents, show the father/guardian name from the student record
  // (mapped via mobile number) instead of the user's stored full_name.
  const parentDisplayName =
    !isTeacher && children.length > 0 && children[0].father_guardian_name
      ? children[0].father_guardian_name
      : user?.full_name;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.heroBg}>
        <View style={styles.hero}>
          <View>
            <Text style={styles.greeting}>Welcome,</Text>
            <Text style={styles.name}>{parentDisplayName || (isTeacher ? 'Teacher' : 'Parent')}</Text>
            <Pill label={isTeacher ? 'Teacher' : 'Parent'} tone={isTeacher ? 'info' : 'success'} />
          </View>
          <Pressable onPress={signOut} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl }}>
        {isTeacher ? (
          <Card>
            <Text style={styles.sectionHeader}>Quick Actions</Text>
            <Pressable
              onPress={() => nav.navigate('TeacherHomework')}
              style={styles.actionRow}
            >
              <View style={[styles.iconBubble, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="book" size={22} color="#1d4ed8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Upload Homework</Text>
                <Text style={styles.actionSub}>Share worksheets, photos and instructions with parents</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => nav.navigate('TeacherMarks')}
              style={styles.actionRow}
            >
              <View style={[styles.iconBubble, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="create" size={22} color="#15803d" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Enter Marks</Text>
                <Text style={styles.actionSub}>Pick a class &amp; exam, then enter marks per subject</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => nav.navigate('TeacherReports')}
              style={styles.actionRow}
            >
              <View style={[styles.iconBubble, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="stats-chart-outline" size={22} color="#92400e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Reports</Text>
                <Text style={styles.actionSub}>Generate performance and progress reports for students</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
            </Pressable>
          </Card>
        ) : (
          <>
            <Text style={[styles.sectionHeader, { marginBottom: spacing.sm, marginLeft: 4 }]}>
              {children.length === 1 ? 'Your Child' : 'Your Children'}
            </Text>

            {loading && (
              <Card><Text style={{ color: colors.textMuted }}>Loading…</Text></Card>
            )}

            {!loading && children.length === 0 && (
              <Card>
                <Text style={{ color: colors.textMuted }}>
                  No children linked to this account. Please contact the school office.
                </Text>
              </Card>
            )}

            <View style={{ gap: spacing.md }}>
              {children.map((c) => (
                <Pressable key={c.id} onPress={() => nav.navigate('ChildDetail', { studentId: c.id, name: c.full_name })}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      {c.photo_thumbnail ? (
                        <Image
                          source={{ uri: `data:image/jpeg;base64,${c.photo_thumbnail}` }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="person" size={28} color={colors.primary} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.childName}>{c.full_name}</Text>
                        <Text style={styles.childMeta}>
                          {c.class_name || '—'}
                          {c.section ? ` • Section ${c.section}` : ''}
                        </Text>
                        <Text style={styles.adm}>Adm. # {c.admission_number}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  heroBg: { paddingTop: 60, paddingBottom: spacing.xxl },
  hero: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: spacing.md,
  },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)', padding: 10,
    borderRadius: radius.pill,
  },
  sectionHeader: { fontWeight: '800', fontSize: 16, color: colors.text },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  childName: { fontSize: 16, fontWeight: '700', color: colors.text },
  childMeta: { color: colors.textMuted, marginTop: 2 },
  adm: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  iconBubble: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontWeight: '700', color: colors.text, fontSize: 15 },
  actionSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});

export default HomeScreen;
