/** Teacher screen: pick class, write title/description/due_date, attach images, upload. */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Alert, Pressable, Image,
  ActivityIndicator, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Pill } from '../components/Pill';
import { colors, spacing, radius } from '../theme';

interface ClassRow { id: number; class_name: string; section_name: string; display_name: string; }
interface SubjectRow { id: number; name: string; }

interface Attachment {
  uri: string;
  name: string;
  mimeType: string;
}

const TeacherHomeworkScreen: React.FC = () => {
  const nav = useNavigation<any>();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMeta = async () => {
    try {
      const [c, s, r] = await Promise.all([
        api.get('/students/classes'),
        api.get('/subjects/'),
        api.get('/homework/'),
      ]);
      setClasses(c.data || []);
      setSubjects(s.data || []);
      setRecent((r.data || []).slice(0, 10));
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { loadMeta(); }, []);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!res.canceled) {
      const next = (res.assets || []).map(a => ({
        uri: a.uri,
        name: a.fileName || `photo_${Date.now()}.jpg`,
        mimeType: a.mimeType || 'image/jpeg',
      }));
      setFiles([...files, ...next]);
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      setFiles([...files, {
        uri: a.uri, name: a.fileName || `cam_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg',
      }]);
    }
  };

  const pickPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets) {
      const next = res.assets.map(a => ({
        uri: a.uri,
        name: a.name || `file_${Date.now()}`,
        mimeType: a.mimeType || 'application/pdf',
      }));
      setFiles([...files, ...next]);
    }
  };

  const removeFile = (uri: string) => setFiles(files.filter(f => f.uri !== uri));

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Validation', 'Please enter a title.'); return; }
    if (!classId) { Alert.alert('Validation', 'Please pick a class.'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('class_id', String(classId));
      if (description.trim()) fd.append('description', description.trim());
      if (subjectId) fd.append('subject_id', String(subjectId));
      if (dueDate) fd.append('due_date', dueDate);
      files.forEach(f => {
        // RN FormData accepts {uri, name, type}
        fd.append('files', {
          uri: f.uri,
          name: f.name,
          type: f.mimeType,
        } as any);
      });
      await api.post('/homework/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('Posted', 'Homework has been published to parents.');
      setTitle(''); setDescription(''); setFiles([]); setSubjectId(null);
      loadMeta();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Upload failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.heroTitle}>Upload Homework</Text>
        <Text style={styles.heroSub}>Share worksheets &amp; instructions with parents</Text>
      </LinearGradient>

      <View style={{ padding: spacing.lg, marginTop: -spacing.xl, gap: spacing.md }}>
        {loading && <ActivityIndicator color={colors.primary} />}

        <Card>
          <Text style={styles.label}>Class *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {classes.map(c => (
                <Pressable
                  key={c.id}
                  onPress={() => setClassId(c.id)}
                  style={[styles.chip, classId === c.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, classId === c.id && { color: '#fff' }]}>
                    {c.display_name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Subject (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setSubjectId(null)}
                style={[styles.chip, subjectId === null && styles.chipActive]}
              >
                <Text style={[styles.chipText, subjectId === null && { color: '#fff' }]}>None</Text>
              </Pressable>
              {subjects.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => setSubjectId(s.id)}
                  style={[styles.chip, subjectId === s.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, subjectId === s.id && { color: '#fff' }]}>{s.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Chapter 3 — Worksheet"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Description / Instructions</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Notes for parents and students…"
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="2025-12-31"
            placeholderTextColor={colors.textMuted}
          />
        </Card>

        <Card>
          <Text style={styles.label}>Attachments</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <Pressable onPress={takePhoto} style={styles.iconBtn}>
              <Ionicons name="camera" size={18} color={colors.primary} />
              <Text style={styles.iconBtnText}>Camera</Text>
            </Pressable>
            <Pressable onPress={pickPhotos} style={styles.iconBtn}>
              <Ionicons name="images" size={18} color={colors.primary} />
              <Text style={styles.iconBtnText}>Photos</Text>
            </Pressable>
            <Pressable onPress={pickPdf} style={styles.iconBtn}>
              <Ionicons name="document" size={18} color={colors.primary} />
              <Text style={styles.iconBtnText}>PDF / File</Text>
            </Pressable>
          </View>
          {files.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.md, flexWrap: 'wrap' }}>
              {files.map(f => (
                <View key={f.uri} style={styles.thumbWrap}>
                  {f.mimeType.startsWith('image/') ? (
                    <Image source={{ uri: f.uri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
                      <Ionicons name="document" size={28} color={colors.primary} />
                    </View>
                  )}
                  <Pressable onPress={() => removeFile(f.uri)} style={styles.removeBtn}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Button title="Publish Homework" onPress={submit} loading={submitting} />

        {recent.length > 0 && (
          <Card>
            <Text style={[styles.label, { marginBottom: spacing.sm }]}>Recently Posted</Text>
            {recent.map((r) => (
              <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{r.title}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                  {r.class_label && <Pill label={r.class_label} tone="info" />}
                  {r.subject_name && <Pill label={r.subject_name} tone="neutral" />}
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  back: { position: 'absolute', top: 50, left: 12, padding: 8 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  heroSub: { color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: 6, color: colors.text, fontSize: 15,
  },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600' },
  iconBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md,
  },
  iconBtnText: { color: colors.primary, fontWeight: '700' },
  thumbWrap: { position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: radius.sm },
  removeBtn: {
    position: 'absolute', top: -4, right: -4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
});

export default TeacherHomeworkScreen;
