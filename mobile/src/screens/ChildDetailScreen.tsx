import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../components/Card';
import { colors, spacing, radius } from '../theme';

interface Tile {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  fg: string;
  route: string;
}

const TILES: Tile[] = [
  { key: 'attendance', label: 'Attendance', icon: 'calendar', bg: '#dcfce7', fg: '#166534', route: 'Attendance' },
  { key: 'fees',       label: 'Fees',       icon: 'card',     bg: '#fef3c7', fg: '#92400e', route: 'Fees' },
  { key: 'results',    label: 'Results',    icon: 'trophy',   bg: '#e0e7ff', fg: '#3730a3', route: 'Results' },
  { key: 'homework',   label: 'Homework',   icon: 'book',     bg: '#cffafe', fg: '#155e75', route: 'Homework' },
];

const ChildDetailScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const { studentId, name } = route.params as { studentId: number; name: string };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>{name}</Text>
        <Text style={styles.heroSub}>Tap any card to view details</Text>
      </LinearGradient>

      <View style={styles.grid}>
        {TILES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => nav.navigate(t.route, { studentId, name })}
            style={styles.tileWrap}
          >
            <Card style={styles.tile}>
              <View style={[styles.iconBubble, { backgroundColor: t.bg }]}>
                <Ionicons name={t.icon} size={28} color={t.fg} />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', padding: spacing.lg,
    marginTop: -spacing.xl,
  },
  tileWrap: { width: '50%', padding: spacing.sm },
  tile: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  iconBubble: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontWeight: '700', color: colors.text, fontSize: 15 },
});

export default ChildDetailScreen;
