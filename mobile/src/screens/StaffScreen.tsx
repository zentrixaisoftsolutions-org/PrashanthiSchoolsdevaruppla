import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Modal, ScrollView,
  Alert, Platform, StatusBar, Image, Switch, KeyboardAvoidingView,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

// ── Types ──
interface StaffMember {
  id: number;
  rfid: string | null;
  employee_id: string | null;
  first_name: string;
  last_name: string | null;
  father_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  mobile: string | null;
  email: string | null;
  aadhar_number: string | null;
  address: string | null;
  qualification: string | null;
  designation: string | null;
  department_id: number | null;
  department_name: string | null;
  date_of_joining: string | null;
  salary: number | null;
  photo_data: string | null;
  is_active: boolean;
  class_sections: { id: number; class_name: string; section_name: string }[];
  subjects: { id: number; name: string; code: string }[];
  class_section_ids: number[];
  subject_ids: number[];
}

interface Department { id: number; name: string; }
interface ClassSectionItem { id: number; class_name: string; section_name: string; }
interface SubjectItem { id: number; name: string; code: string; }

interface StaffForm {
  first_name: string;
  last_name: string;
  father_name: string;
  gender: string;
  date_of_birth: string;
  mobile: string;
  email: string;
  aadhar_number: string;
  address: string;
  qualification: string;
  designation: string;
  department_id: number | undefined;
  date_of_joining: string;
  salary: string;
  rfid: string;
  employee_id: string;
  class_section_ids: number[];
  subject_ids: number[];
}

const emptyForm: StaffForm = {
  first_name: '', last_name: '', father_name: '', gender: 'Male',
  date_of_birth: '', mobile: '', email: '', aadhar_number: '',
  address: '', qualification: '', designation: '',
  department_id: undefined, date_of_joining: '', salary: '',
  rfid: '', employee_id: '', class_section_ids: [], subject_ids: [],
};

// ── Picker Modal ──
const PickerModal = ({ visible, onClose, title, data, onSelect }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: any }[]; onSelect: (v: any) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={pm.sheet}>
        <Text style={pm.sheetTitle}>{title}</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={pm.sheetItem} onPress={() => { onSelect(item.value); onClose(); }}>
              <Text style={pm.sheetItemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={pm.cancelBtn} onPress={onClose}>
          <Text style={pm.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', paddingBottom: 20 },
  sheetTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetItem: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetItemText: { fontSize: 15, color: COLORS.text },
  cancelBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
});

// ── Multi-Select Modal ──
const MultiSelectModal = ({ visible, onClose, title, data, selected, onToggle }: {
  visible: boolean; onClose: () => void; title: string;
  data: { label: string; value: number }[]; selected: number[]; onToggle: (v: number) => void;
}) => (
  <Modal visible={visible} transparent animationType="slide">
    <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
      <View style={pm.sheet}>
        <Text style={pm.sheetTitle}>{title} ({selected.length} selected)</Text>
        <FlatList data={data} keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => {
            const checked = selected.includes(item.value);
            return (
              <TouchableOpacity
                style={[pm.sheetItem, checked && { backgroundColor: '#eef2ff' }]}
                onPress={() => onToggle(item.value)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[ms.box, checked && ms.boxChecked]}>
                    {checked && <Text style={ms.check}>✓</Text>}
                  </View>
                  <Text style={[pm.sheetItemText, { flex: 1 }]}>{item.label}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity style={[pm.cancelBtn, { backgroundColor: COLORS.primary, marginHorizontal: 20, borderRadius: 10, paddingVertical: 14 }]} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Done</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  </Modal>
);

const ms = StyleSheet.create({
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  boxChecked: { backgroundColor: COLORS.primary },
  check: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});

const StaffScreen = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Data
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState<number | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StaffForm>({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);

  // View Detail
  const [viewStaff, setViewStaff] = useState<StaffMember | null>(null);

  // Pickers
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({
    visible: false, title: '', data: [], onSelect: () => {},
  });
  const [csMultiVisible, setCsMultiVisible] = useState(false);
  const [subMultiVisible, setSubMultiVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterDept) params.append('department_id', String(filterDept));
      if (includeInactive) params.append('include_inactive', 'true');
      const qStr = params.toString() ? `?${params.toString()}` : '';

      const [staffData, deptData] = await Promise.all([
        apiClient.get<StaffMember[]>(`${API_ENDPOINTS.STAFF}${qStr}`),
        apiClient.get<Department[]>(API_ENDPOINTS.DEPARTMENTS),
      ]);
      setStaff(staffData);
      setDepartments(deptData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterDept, includeInactive]);

  const fetchFormData = async () => {
    try {
      const [csData, subData] = await Promise.all([
        apiClient.get<ClassSectionItem[]>(API_ENDPOINTS.CLASS_SECTIONS),
        apiClient.get<SubjectItem[]>(API_ENDPOINTS.SUBJECTS),
      ]);
      setClassSections(csData);
      setSubjects(subData);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filtered list
  const filtered = staff.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      (s.last_name || '').toLowerCase().includes(q) ||
      (s.rfid || '').toLowerCase().includes(q) ||
      (s.mobile || '').includes(q) ||
      (s.employee_id || '').toLowerCase().includes(q) ||
      (s.department_name || '').toLowerCase().includes(q)
    );
  });

  // Stats
  const active = staff.filter(s => s.is_active);
  const totalMale = active.filter(s => s.gender === 'Male').length;
  const totalFemale = active.filter(s => s.gender === 'Female').length;

  // Form helpers
  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPickerModal({ visible: true, title, data, onSelect });
  };

  const handleFormChange = (field: keyof StaffForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const toggleCS = (id: number) => {
    setForm(prev => ({
      ...prev,
      class_section_ids: prev.class_section_ids.includes(id)
        ? prev.class_section_ids.filter(x => x !== id)
        : [...prev.class_section_ids, id],
    }));
  };

  const toggleSub = (id: number) => {
    setForm(prev => ({
      ...prev,
      subject_ids: prev.subject_ids.includes(id)
        ? prev.subject_ids.filter(x => x !== id)
        : [...prev.subject_ids, id],
    }));
  };

  const openAddForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
    fetchFormData();
  };

  const openEditForm = (s: StaffMember) => {
    setForm({
      first_name: s.first_name,
      last_name: s.last_name || '',
      father_name: s.father_name || '',
      gender: s.gender || 'Male',
      date_of_birth: s.date_of_birth || '',
      mobile: s.mobile || '',
      email: s.email || '',
      aadhar_number: s.aadhar_number || '',
      address: s.address || '',
      qualification: s.qualification || '',
      designation: s.designation || '',
      department_id: s.department_id || undefined,
      date_of_joining: s.date_of_joining || '',
      salary: s.salary ? String(s.salary) : '',
      rfid: s.rfid || '',
      employee_id: s.employee_id || '',
      class_section_ids: s.class_section_ids || [],
      subject_ids: s.subject_ids || [],
    });
    setEditingId(s.id);
    setShowForm(true);
    fetchFormData();
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim()) {
      Alert.alert('Error', 'First name is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = { ...form };
      if (!payload.last_name) delete payload.last_name;
      if (!payload.rfid) delete payload.rfid;
      if (!payload.employee_id) delete payload.employee_id;
      if (!payload.email) delete payload.email;
      if (!payload.date_of_birth) delete payload.date_of_birth;
      if (!payload.date_of_joining) delete payload.date_of_joining;
      if (!payload.department_id) delete payload.department_id;
      if (payload.salary) {
        payload.salary = Number(payload.salary);
      } else {
        delete payload.salary;
      }

      if (editingId) {
        await apiClient.put(`${API_ENDPOINTS.STAFF}/${editingId}`, payload);
        Alert.alert('Success', 'Staff member updated');
      } else {
        await apiClient.post(API_ENDPOINTS.STAFF, payload);
        Alert.alert('Success', 'Staff member added');
      }
      setShowForm(false);
      setRefreshing(true);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Operation failed');
    } finally { setSubmitting(false); }
  };

  const handleDeactivate = (s: StaffMember) => {
    Alert.alert('Deactivate Staff', `Deactivate ${s.first_name} ${s.last_name || ''}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`${API_ENDPOINTS.STAFF}/${s.id}`);
            Alert.alert('Success', 'Staff deactivated');
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.detail || 'Failed to deactivate');
          }
        },
      },
    ]);
  };

  const handlePermanentDelete = (s: StaffMember) => {
    Alert.alert(
      '⚠️ Permanent Delete',
      `This will permanently delete ${s.first_name} ${s.last_name || ''}. This cannot be undone!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'DELETE', style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.delete(`${API_ENDPOINTS.STAFF}/${s.id}/permanent`);
              Alert.alert('Deleted', 'Staff permanently removed');
              fetchData();
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || 'Delete failed');
            }
          },
        },
      ]
    );
  };

  const deptLabel = filterDept ? departments.find(d => d.id === filterDept)?.name || 'Dept' : 'All Depts';
  const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
        ListHeaderComponent={
          <>
            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: '#6366f1' }]}>
                <Text style={styles.statLabel}>Total</Text>
                <Text style={styles.statValue}>{active.length}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
                <Text style={styles.statLabel}>Male</Text>
                <Text style={styles.statValue}>{totalMale}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#ec4899' }]}>
                <Text style={styles.statLabel}>Female</Text>
                <Text style={styles.statValue}>{totalFemale}</Text>
              </View>
            </View>

            {/* Search + Filter */}
            <View style={styles.filterRow}>
              <TextInput
                style={[styles.searchInput, { flex: 1, marginRight: 8 }]}
                placeholder="Search name, RFID, mobile..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={COLORS.textSecondary}
              />
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Department',
                  [{ label: 'All Departments', value: null }, ...departments.map(d => ({ label: d.name, value: d.id }))],
                  v => setFilterDept(v)
                )}
              >
                <Text style={styles.filterBtnText} numberOfLines={1}>{deptLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.count}>{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}</Text>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, !item.is_active && { opacity: 0.6 }]}
            activeOpacity={0.7}
            onPress={() => setViewStaff(item)}
          >
            <View style={styles.cardRow}>
              {item.photo_data ? (
                <Image source={{ uri: item.photo_data }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: item.gender === 'Female' ? '#ec4899' : COLORS.primary }]}>
                  <Text style={styles.avatarText}>{item.first_name?.charAt(0)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.first_name} {item.last_name || ''}</Text>
                {item.designation ? <Text style={styles.sub}>{item.designation}</Text> : null}
                <View style={styles.chipRow}>
                  {item.department_name ? (
                    <View style={styles.deptChip}>
                      <Text style={styles.deptChipText}>{item.department_name}</Text>
                    </View>
                  ) : null}
                  {item.employee_id ? (
                    <View style={[styles.deptChip, { backgroundColor: '#f3f4f6' }]}>
                      <Text style={[styles.deptChipText, { color: COLORS.textSecondary }]}>{item.employee_id}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.infoRow}>
                  {item.mobile ? <Text style={styles.infoText}>📱 {item.mobile}</Text> : null}
                  {item.gender ? <Text style={styles.infoText}>• {item.gender}</Text> : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={[styles.statusBadge, { backgroundColor: item.is_active ? '#dcfce7' : '#fee2e2' }]}>
                  <Text style={[styles.statusText, { color: item.is_active ? '#166534' : '#991b1b' }]}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                {item.rfid ? (
                  <Text style={styles.rfidText}>{item.rfid}</Text>
                ) : null}
              </View>
            </View>

            {/* Action buttons */}
            {isAdmin && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEditForm(item)}>
                  <Text style={[styles.actionBtnText, { color: '#3b82f6' }]}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeactivate(item)}>
                  <Text style={[styles.actionBtnText, { color: '#f59e0b' }]}>🚫 Deactivate</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handlePermanentDelete(item)}>
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>🗑️ Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>👨‍🏫</Text>
            <Text style={styles.emptyText}>
              {search || filterDept ? 'No matching staff found' : 'No staff yet. Tap + to add.'}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      {isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openAddForm}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* ── View Staff Detail Modal ── */}
      <Modal visible={!!viewStaff} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setViewStaff(null)}>
              <Text style={styles.modalBack}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Staff Details</Text>
            {isAdmin && viewStaff && (
              <TouchableOpacity onPress={() => { setViewStaff(null); openEditForm(viewStaff); }}>
                <Text style={styles.editBtn}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {viewStaff && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {/* Profile Header */}
              <View style={styles.profileHeader}>
                {viewStaff.photo_data ? (
                  <Image source={{ uri: viewStaff.photo_data }} style={styles.profilePhoto} />
                ) : (
                  <View style={[styles.profilePhoto, { backgroundColor: viewStaff.gender === 'Female' ? '#ec4899' : COLORS.primary, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: '#fff', fontSize: 36, fontWeight: 'bold' }}>{viewStaff.first_name?.charAt(0)}</Text>
                  </View>
                )}
                <Text style={styles.profileName}>{viewStaff.first_name} {viewStaff.last_name || ''}</Text>
                {viewStaff.designation && <Text style={styles.profileDesignation}>{viewStaff.designation}</Text>}
                <View style={[styles.statusBadge, { backgroundColor: viewStaff.is_active ? '#dcfce7' : '#fee2e2', marginTop: 6 }]}>
                  <Text style={[styles.statusText, { color: viewStaff.is_active ? '#166534' : '#991b1b' }]}>
                    {viewStaff.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>

              {/* Key Info Chips */}
              <View style={styles.keyInfoRow}>
                {viewStaff.employee_id ? (
                  <View style={styles.keyChip}>
                    <Text style={styles.keyChipLabel}>EMP ID</Text>
                    <Text style={styles.keyChipValue}>{viewStaff.employee_id}</Text>
                  </View>
                ) : null}
                {viewStaff.rfid ? (
                  <View style={styles.keyChip}>
                    <Text style={styles.keyChipLabel}>RFID</Text>
                    <Text style={styles.keyChipValue}>{viewStaff.rfid}</Text>
                  </View>
                ) : null}
                {viewStaff.department_name ? (
                  <View style={[styles.keyChip, { backgroundColor: '#eef2ff' }]}>
                    <Text style={[styles.keyChipLabel, { color: '#6366f1' }]}>Dept</Text>
                    <Text style={[styles.keyChipValue, { color: '#4338ca' }]}>{viewStaff.department_name}</Text>
                  </View>
                ) : null}
                {viewStaff.gender ? (
                  <View style={styles.keyChip}>
                    <Text style={styles.keyChipLabel}>Gender</Text>
                    <Text style={styles.keyChipValue}>{viewStaff.gender}</Text>
                  </View>
                ) : null}
              </View>

              {/* Personal Info */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Personal Information</Text>
                <View style={styles.detailGrid}>
                  {[
                    { l: "Father's Name", v: viewStaff.father_name },
                    { l: 'Mobile', v: viewStaff.mobile },
                    { l: 'Email', v: viewStaff.email },
                    { l: 'Aadhar', v: viewStaff.aadhar_number },
                    { l: 'Date of Birth', v: viewStaff.date_of_birth },
                    { l: 'Date of Joining', v: viewStaff.date_of_joining },
                    { l: 'Qualification', v: viewStaff.qualification },
                    { l: 'Salary', v: viewStaff.salary ? fmt(viewStaff.salary) : null },
                    { l: 'Address', v: viewStaff.address },
                  ].map((item, idx) => (
                    <View key={idx} style={styles.detailItem}>
                      <Text style={styles.detailLabel}>{item.l}</Text>
                      <Text style={styles.detailValue}>{item.v || '—'}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Class/Section assignments */}
              <View style={[styles.detailSection, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                <Text style={[styles.detailSectionTitle, { color: '#1e40af' }]}>Assigned Classes & Sections</Text>
                {viewStaff.class_sections && viewStaff.class_sections.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {viewStaff.class_sections.map((cs, i) => (
                      <View key={i} style={[styles.assignChip, { backgroundColor: '#fff', borderColor: '#bfdbfe' }]}>
                        <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '500' }}>{cs.class_name} — {cs.section_name}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: '#93c5fd', fontStyle: 'italic' }}>No classes assigned</Text>
                )}
              </View>

              {/* Subject assignments */}
              <View style={[styles.detailSection, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                <Text style={[styles.detailSectionTitle, { color: '#7c3aed' }]}>Assigned Subjects</Text>
                {viewStaff.subjects && viewStaff.subjects.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {viewStaff.subjects.map((sub, i) => (
                      <View key={i} style={[styles.assignChip, { backgroundColor: '#fff', borderColor: '#e9d5ff' }]}>
                        <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '500' }}>{sub.name} <Text style={{ color: '#a78bfa' }}>({sub.code})</Text></Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: '#c4b5fd', fontStyle: 'italic' }}>No subjects assigned</Text>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Add/Edit Staff Form Modal ── */}
      <Modal visible={showForm} animationType="slide" transparent={false}>
        <KeyboardAvoidingView style={styles.modalContainer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Text style={styles.modalBack}>← Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Edit Staff' : 'Add Staff'}</Text>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
              <Text style={[styles.editBtn, submitting && { opacity: 0.5 }]}>
                {submitting ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* Names */}
            <Text style={styles.formSectionTitle}>Basic Information</Text>
            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>First Name *</Text>
                <TextInput style={styles.formInput} value={form.first_name} onChangeText={v => handleFormChange('first_name', v)} placeholder="First Name" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Last Name</Text>
                <TextInput style={styles.formInput} value={form.last_name} onChangeText={v => handleFormChange('last_name', v)} placeholder="Last Name" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Father's Name</Text>
            <TextInput style={styles.formInput} value={form.father_name} onChangeText={v => handleFormChange('father_name', v)} placeholder="Father's Name" />

            {/* Department, Designation, Gender */}
            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Department</Text>
                <TouchableOpacity
                  style={styles.formPicker}
                  onPress={() => openPicker('Department',
                    [{ label: '— Select —', value: undefined }, ...departments.map(d => ({ label: d.name, value: d.id }))],
                    v => handleFormChange('department_id', v)
                  )}
                >
                  <Text style={styles.formPickerText} numberOfLines={1}>
                    {form.department_id ? departments.find(d => d.id === form.department_id)?.name : '— Select —'}
                  </Text>
                  <Text style={styles.arrow}>▾</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Designation</Text>
                <TextInput style={styles.formInput} value={form.designation} onChangeText={v => handleFormChange('designation', v)} placeholder="e.g. Teacher" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Gender</Text>
            <View style={styles.genderRow}>
              {['Male', 'Female', 'Other'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, form.gender === g && styles.genderBtnActive]}
                  onPress={() => handleFormChange('gender', g)}
                >
                  <Text style={[styles.genderBtnText, form.gender === g && { color: '#fff' }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Contact */}
            <Text style={[styles.formSectionTitle, { marginTop: 16 }]}>Contact & Identity</Text>
            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Mobile</Text>
                <TextInput style={styles.formInput} value={form.mobile} onChangeText={v => handleFormChange('mobile', v)} placeholder="Mobile" keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput style={styles.formInput} value={form.email} onChangeText={v => handleFormChange('email', v)} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Aadhar Number</Text>
            <TextInput style={styles.formInput} value={form.aadhar_number} onChangeText={v => handleFormChange('aadhar_number', v)} placeholder="Aadhar Number" keyboardType="numeric" maxLength={12} />

            {/* Dates & Qualification */}
            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Date of Birth</Text>
                <TextInput style={styles.formInput} value={form.date_of_birth} onChangeText={v => handleFormChange('date_of_birth', v)} placeholder="YYYY-MM-DD" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Date of Joining</Text>
                <TextInput style={styles.formInput} value={form.date_of_joining} onChangeText={v => handleFormChange('date_of_joining', v)} placeholder="YYYY-MM-DD" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Qualification</Text>
            <TextInput style={styles.formInput} value={form.qualification} onChangeText={v => handleFormChange('qualification', v)} placeholder="e.g. M.Ed, B.Tech" />

            {/* RFID, Employee ID, Salary */}
            <Text style={[styles.formSectionTitle, { marginTop: 16 }]}>Employment Details</Text>
            <View style={styles.formRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>RFID</Text>
                <TextInput style={styles.formInput} value={form.rfid} onChangeText={v => handleFormChange('rfid', v)} placeholder="RFID" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Employee ID</Text>
                <TextInput style={styles.formInput} value={form.employee_id} onChangeText={v => handleFormChange('employee_id', v)} placeholder="Emp ID" />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Salary (₹)</Text>
            <TextInput style={styles.formInput} value={form.salary} onChangeText={v => handleFormChange('salary', v)} placeholder="Salary" keyboardType="numeric" />

            {/* Address */}
            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput style={[styles.formInput, { minHeight: 60, textAlignVertical: 'top' }]} value={form.address} onChangeText={v => handleFormChange('address', v)} placeholder="Address" multiline />

            {/* Class-Section Assignment */}
            <Text style={[styles.formSectionTitle, { marginTop: 16 }]}>Assignments</Text>
            <Text style={styles.fieldLabel}>Classes & Sections</Text>
            <TouchableOpacity style={styles.formPicker} onPress={() => setCsMultiVisible(true)}>
              <Text style={styles.formPickerText}>
                {form.class_section_ids.length > 0 ? `${form.class_section_ids.length} selected` : 'Select classes...'}
              </Text>
              <Text style={styles.arrow}>▾</Text>
            </TouchableOpacity>
            {form.class_section_ids.length > 0 && (
              <View style={styles.chipWrap}>
                {form.class_section_ids.map(id => {
                  const cs = classSections.find(c => c.id === id);
                  return cs ? (
                    <View key={id} style={[styles.assignChip, { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' }]}>
                      <Text style={{ fontSize: 11, color: '#4338ca' }}>{cs.class_name} — {cs.section_name}</Text>
                    </View>
                  ) : null;
                })}
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Subjects</Text>
            <TouchableOpacity style={styles.formPicker} onPress={() => setSubMultiVisible(true)}>
              <Text style={styles.formPickerText}>
                {form.subject_ids.length > 0 ? `${form.subject_ids.length} selected` : 'Select subjects...'}
              </Text>
              <Text style={styles.arrow}>▾</Text>
            </TouchableOpacity>
            {form.subject_ids.length > 0 && (
              <View style={styles.chipWrap}>
                {form.subject_ids.map(id => {
                  const sub = subjects.find(s => s.id === id);
                  return sub ? (
                    <View key={id} style={[styles.assignChip, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
                      <Text style={{ fontSize: 11, color: '#7c3aed' }}>{sub.name} ({sub.code})</Text>
                    </View>
                  ) : null;
                })}
              </View>
            )}

            {/* Submit Button (duplicate for scrollability) */}
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              <Text style={styles.submitBtnText}>{submitting ? 'Saving...' : editingId ? 'Update Staff' : 'Add Staff'}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Multi-select modals */}
          <MultiSelectModal
            visible={csMultiVisible}
            onClose={() => setCsMultiVisible(false)}
            title="Classes & Sections"
            data={classSections.map(cs => ({ label: `${cs.class_name} — ${cs.section_name}`, value: cs.id }))}
            selected={form.class_section_ids}
            onToggle={toggleCS}
          />
          <MultiSelectModal
            visible={subMultiVisible}
            onClose={() => setSubMultiVisible(false)}
            title="Subjects"
            data={subjects.map(s => ({ label: `${s.name} (${s.code})`, value: s.id }))}
            selected={form.subject_ids}
            onToggle={toggleSub}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Picker Modal */}
      <PickerModal
        visible={pickerModal.visible}
        title={pickerModal.title}
        data={pickerModal.data}
        onSelect={pickerModal.onSelect}
        onClose={() => setPickerModal(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginTop: 2 },

  // Filter
  filterRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'center' },
  searchInput: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, fontSize: 14, color: COLORS.text },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, minWidth: 100 },
  filterBtnText: { flex: 1, fontSize: 13, color: COLORS.text },
  arrow: { fontSize: 12, color: COLORS.textSecondary, marginLeft: 4 },
  count: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, textAlign: 'right' },

  // Staff Card
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  deptChip: { backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  deptChipText: { fontSize: 10, color: '#6366f1', fontWeight: '600' },
  infoRow: { flexDirection: 'row', gap: 8, marginTop: 3 },
  infoText: { fontSize: 11, color: COLORS.textSecondary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '600' },
  rfidText: { fontSize: 9, color: COLORS.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 4 },

  // Actions
  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 10, paddingTop: 8, gap: 4 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: '#f9fafb' },
  actionBtnText: { fontSize: 11, fontWeight: '600' },

  // Empty
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  // FAB
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 30) : 50 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalBack: { fontSize: 15, color: COLORS.primary, fontWeight: '500' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  editBtn: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },

  // Profile (view)
  profileHeader: { alignItems: 'center', marginBottom: 16 },
  profilePhoto: { width: 96, height: 96, borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  profileName: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  profileDesignation: { fontSize: 14, color: COLORS.primary, fontWeight: '500', marginTop: 2 },

  // Key info chips
  keyInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, justifyContent: 'center' },
  keyChip: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  keyChipLabel: { fontSize: 9, color: COLORS.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  keyChipValue: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginTop: 1 },

  // Detail section
  detailSection: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  detailGrid: { gap: 8 },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 12, color: COLORS.textSecondary },
  detailValue: { fontSize: 12, fontWeight: '500', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },

  // Chip wrap
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  assignChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },

  // Form
  formSectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 6 },
  formRow: { flexDirection: 'row', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 6 },
  formInput: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.text, marginBottom: 4 },
  formPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4 },
  formPickerText: { flex: 1, fontSize: 14, color: COLORS.text },

  // Gender
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  genderBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#f9fafb' },
  genderBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  genderBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // Submit
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default StaffScreen;
