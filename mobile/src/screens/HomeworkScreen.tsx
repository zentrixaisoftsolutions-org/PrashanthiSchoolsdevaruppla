import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, RefreshControl, Pressable, Image, Linking } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { parentService, Homework } from '../services/dataService';
import { API_BASE_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY } from '../services/api';
import { colors, spacing, radius } from '../theme';

const HomeworkScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { studentId, name } = route.params as { studentId: number; name: string };
  const [items, setItems] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string>('');

  const load = async () => {
    try {
      const t = (await AsyncStorage.getItem(TOKEN_KEY)) || '';
      setToken(t);
      const data = await parentService.getHomework(studentId, 60);
      setItems(data);
    } finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const fullUrl = (path: string) => {
    const base = API_BASE_URL.replace(/\/+$/, '');
    return `${base}${path}`;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Homework</Text>
        <Text style={styles.heroSub}>{name}</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {!loading && items.length === 0 && (
          <Card><Text style={{ color: colors.textMuted }}>No homework posted in the last 60 days.</Text></Card>
        )}

        {items.map(hw => (
          <Card key={hw.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{hw.title}</Text>
                {hw.subject_name && <Text style={styles.muted}>{hw.subject_name}</Text>}
              </View>
              {hw.due_date && (
                <Pill label={`Due ${hw.due_date}`} tone="warning" />
              )}
            </View>

            {hw.description ? (
              <Text style={styles.desc}>{hw.description}</Text>
            ) : null}

            {hw.attachments.length > 0 && (
              <View style={styles.attachWrap}>
                {hw.attachments.map(a => {
                  const isImg = (a.mime_type || '').startsWith('image/');
                  const url = fullUrl(a.url);
                  // Note: image fetch requires Authorization header; expo-image supports `headers`.
                  // Using built-in <Image> here would not work for protected routes.
                  return isImg ? (
                    <Pressable key={a.id} onPress={() => open(`${url}?token=${token}`)}>
                      <Image
                        source={{ uri: url, headers: { Authorization: `Bearer ${token}` } } as any}
                        style={styles.thumb}
                      />
                    </Pressable>
                  ) : (
                    <Pressable key={a.id} onPress={() => open(url)} style={styles.fileChip}>
                      <Ionicons name="document-attach" size={16} color={colors.primary} />
                      <Text numberOfLines={1} style={{ color: colors.primary, maxWidth: 160 }}>{a.file_name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.foot}>
              Posted {new Date(hw.created_at).toLocaleString()}
              {hw.assigned_by_name ? ` • ${hw.assigned_by_name}` : ''}
            </Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  title: { fontWeight: '800', color: colors.text, fontSize: 15 },
  muted: { color: colors.textMuted, fontSize: 12 },
  desc: { color: colors.text, marginTop: spacing.sm, lineHeight: 20 },
  attachWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  thumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: '#f1f5f9' },
  fileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e0f2fe', paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  foot: { color: colors.textMuted, fontSize: 11, marginTop: spacing.md },
});

export default HomeworkScreen;
