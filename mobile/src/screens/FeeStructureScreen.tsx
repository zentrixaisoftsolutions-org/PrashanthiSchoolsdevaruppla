import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface FeeStructure {
  id: number;
  class_name: string;
  class_name_id: number;
  academic_year_name: string;
  academic_year_id: number;
  fee_type: string;
  term: number | null;
  amount: number;
  due_date: string | null;
  is_active: boolean;
}

interface FeeRow {
  fee_type: string;
  term1: FeeStructure | null;
  term2: FeeStructure | null;
  term3: FeeStructure | null;
}

interface ClassTable {
  className: string;
  rows: FeeRow[];
  totalT1: number;
  totalT2: number;
  totalT3: number;
  grandTotal: number;
}

interface ClassName { id: number; name: string; }
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

const formatCurrency = (amt: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amt);

const FeeStructureScreen = () => {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [filterAYId, setFilterAYId] = useState<number | null>(null);
  const [filterClassId, setFilterClassId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ academic_year_id: 0, class_name_id: 0, fee_type: '', amount: '', term: 1 });
  const [saving, setSaving] = useState(false);

  // Picker
  const [picker, setPicker] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({
    visible: false, title: '', data: [], onSelect: () => {},
  });

  useEffect(() => {
    (async () => {
      try {
        const [cnData, ayData] = await Promise.all([
          apiClient.get<ClassName[]>(API_ENDPOINTS.CLASS_NAMES),
          apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS),
        ]);
        setClassNames(cnData);
        setAcademicYears(ayData);
        const current = ayData.find((y: AcademicYear) => y.is_current) || ayData[0];
        if (current) {
          setFilterAYId(current.id);
          setFormData(prev => ({ ...prev, academic_year_id: current.id }));
        }
      } catch (error) { console.error(error); }
    })();
  }, []);

  const fetchStructures = useCallback(async () => {
    if (!filterAYId) return;
    try {
      const params: string[] = [`academic_year_id=${filterAYId}`];
      if (filterClassId) params.push(`class_name_id=${filterClassId}`);
      const data = await apiClient.get<FeeStructure[]>(`${API_ENDPOINTS.FEE_STRUCTURE}?${params.join('&')}`);
      setStructures(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterAYId, filterClassId]);

  useEffect(() => { if (filterAYId) fetchStructures(); }, [fetchStructures]);

  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPicker({ visible: true, title, data, onSelect });
  };

  // Group by class, pivot fee types across terms
  const classTables: ClassTable[] = (() => {
    const grouped: Record<string, FeeStructure[]> = {};
    structures.forEach(s => {
      const key = s.class_name || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });
    return Object.entries(grouped).map(([className, items]) => {
      const feeMap: Record<string, FeeRow> = {};
      for (const s of items) {
        if (!feeMap[s.fee_type]) feeMap[s.fee_type] = { fee_type: s.fee_type, term1: null, term2: null, term3: null };
        if (s.term === 1) feeMap[s.fee_type].term1 = s;
        else if (s.term === 2) feeMap[s.fee_type].term2 = s;
        else if (s.term === 3) feeMap[s.fee_type].term3 = s;
      }
      const rows = Object.values(feeMap);
      const totalT1 = rows.reduce((sum, r) => sum + (r.term1?.amount || 0), 0);
      const totalT2 = rows.reduce((sum, r) => sum + (r.term2?.amount || 0), 0);
      const totalT3 = rows.reduce((sum, r) => sum + (r.term3?.amount || 0), 0);
      return { className, rows, totalT1, totalT2, totalT3, grandTotal: totalT1 + totalT2 + totalT3 };
    });
  })();

  const handleSubmit = async () => {
    if (!formData.fee_type.trim() || !formData.amount) {
      Alert.alert('Error', 'Fee type and amount are required'); return;
    }
    if (!editId && (!formData.class_name_id || !formData.academic_year_id)) {
      Alert.alert('Error', 'Academic year and class are required'); return;
    }
    setSaving(true);
    try {
      if (editId) {
        await apiClient.put(`${API_ENDPOINTS.FEE_STRUCTURE}/${editId}`, {
          fee_type: formData.fee_type, amount: parseFloat(formData.amount), term: formData.term,
        });
      } else {
        await apiClient.post(API_ENDPOINTS.FEE_STRUCTURE, {
          academic_year_id: formData.academic_year_id, class_name_id: formData.class_name_id,
          fee_type: formData.fee_type, amount: parseFloat(formData.amount), term: formData.term,
        });
      }
      setShowForm(false); resetForm(); fetchStructures();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setEditId(null);
    setFormData({ academic_year_id: filterAYId || 0, class_name_id: 0, fee_type: '', amount: '', term: 1 });
  };

  const handleEdit = (s: FeeStructure) => {
    setEditId(s.id);
    setFormData({
      academic_year_id: s.academic_year_id, class_name_id: s.class_name_id,
      fee_type: s.fee_type, amount: String(s.amount), term: s.term || 1,
    });
    setShowForm(true);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Deactivate this fee structure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await apiClient.delete(`${API_ENDPOINTS.FEE_STRUCTURE}/${id}`); fetchStructures(); }
        catch (e: any) { Alert.alert('Error', e.response?.data?.detail || 'Failed'); }
      }},
    ]);
  };

  const ayName = academicYears.find(y => y.id === filterAYId)?.name || 'Select Year';
  const className = filterClassId ? (classNames.find(c => c.id === filterClassId)?.name || '') : 'All Classes';
  const termOptions = [{ label: 'Term 1', value: 1 }, { label: 'Term 2', value: 2 }, { label: 'Term 3', value: 3 }];

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={s.container}>
      {/* Filters */}
      <View style={s.filterRow}>
        <TouchableOpacity style={[s.filterBtn, { flex: 1, marginRight: 8 }]}
          onPress={() => openPicker('Academic Year', academicYears.map(y => ({ label: y.name, value: y.id })), v => setFilterAYId(v))}>
          <Text style={s.filterLabel}>Year</Text>
          <Text style={s.filterValue} numberOfLines={1}>{ayName}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.filterBtn, { flex: 1 }]}
          onPress={() => openPicker('Class', [{ label: 'All Classes', value: null }, ...classNames.map(c => ({ label: c.name, value: c.id }))], v => setFilterClassId(v))}>
          <Text style={s.filterLabel}>Class</Text>
          <Text style={s.filterValue} numberOfLines={1}>{className}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={s.addBtnText}>+ Add Fee Component</Text>
      </TouchableOpacity>

      {/* Pivot Table per Class */}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStructures(); }} />}>
        {classTables.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.empty}>No fee structures found</Text>
            <Text style={[s.empty, { fontSize: 13, marginTop: 4 }]}>Click "Add Fee Component" to create one</Text>
          </View>
        ) : (
          classTables.map(ct => (
            <View key={ct.className} style={s.classCard}>
              {/* Class Header */}
              <View style={s.classHeader}>
                <Text style={s.classTitle}>{ct.className}</Text>
                <Text style={s.classTotalText}>Total: {formatCurrency(ct.grandTotal)}</Text>
              </View>

              {/* Table Header */}
              <View style={s.tableRow}>
                <Text style={[s.tableCell, s.tableCellHeader, { flex: 2 }]}>Fee Type</Text>
                <Text style={[s.tableCell, s.tableCellHeader, s.tableCellRight]}>Term 1</Text>
                <Text style={[s.tableCell, s.tableCellHeader, s.tableCellRight]}>Term 2</Text>
                <Text style={[s.tableCell, s.tableCellHeader, s.tableCellRight]}>Term 3</Text>
                <Text style={[s.tableCell, s.tableCellHeader, s.tableCellRight]}>Total</Text>
              </View>

              {/* Rows */}
              {ct.rows.map((row, i) => {
                const rowTotal = (row.term1?.amount || 0) + (row.term2?.amount || 0) + (row.term3?.amount || 0);
                return (
                  <View key={row.fee_type}>
                    <View style={[s.tableRow, i % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                      <Text style={[s.tableCell, { flex: 2, fontWeight: '600' }]}>{row.fee_type}</Text>
                      <Text style={[s.tableCell, s.tableCellRight]}>{row.term1 ? formatCurrency(row.term1.amount) : '—'}</Text>
                      <Text style={[s.tableCell, s.tableCellRight]}>{row.term2 ? formatCurrency(row.term2.amount) : '—'}</Text>
                      <Text style={[s.tableCell, s.tableCellRight]}>{row.term3 ? formatCurrency(row.term3.amount) : '—'}</Text>
                      <Text style={[s.tableCell, s.tableCellRight, { fontWeight: 'bold', color: '#4338ca' }]}>{formatCurrency(rowTotal)}</Text>
                    </View>
                    {/* Term action buttons */}
                    <View style={s.termActions}>
                      {[row.term1, row.term2, row.term3].map((t, ti) => t ? (
                        <View key={t.id} style={s.termActionGroup}>
                          <TouchableOpacity onPress={() => handleEdit(t)} style={s.termActionBtn}>
                            <Text style={s.termActionText}>T{ti + 1}✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDelete(t.id)} style={s.termActionBtn}>
                            <Text style={[s.termActionText, { color: COLORS.error }]}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null)}
                    </View>
                  </View>
                );
              })}

              {/* Footer Totals */}
              <View style={[s.tableRow, s.tableFooter]}>
                <Text style={[s.tableCell, { flex: 2, fontWeight: 'bold', color: '#4338ca' }]}>Total</Text>
                <Text style={[s.tableCell, s.tableCellRight, { fontWeight: 'bold', color: '#4338ca' }]}>{formatCurrency(ct.totalT1)}</Text>
                <Text style={[s.tableCell, s.tableCellRight, { fontWeight: 'bold', color: '#4338ca' }]}>{formatCurrency(ct.totalT2)}</Text>
                <Text style={[s.tableCell, s.tableCellRight, { fontWeight: 'bold', color: '#4338ca' }]}>{formatCurrency(ct.totalT3)}</Text>
                <Text style={[s.tableCell, s.tableCellRight, { fontWeight: 'bold', color: '#312e81' }]}>{formatCurrency(ct.grandTotal)}</Text>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add/Edit Form Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView>
              <Text style={s.modalTitle}>{editId ? 'Edit Fee Component' : 'Add Fee Component'}</Text>

              <Text style={s.label}>Academic Year {!editId ? '*' : ''}</Text>
              <TouchableOpacity style={s.pickerBtn} disabled={!!editId}
                onPress={() => openPicker('Academic Year', academicYears.map(y => ({ label: y.name, value: y.id })),
                  v => setFormData(p => ({ ...p, academic_year_id: v })))}>
                <Text style={[s.pickerBtnText, editId && { color: COLORS.textSecondary }]}>
                  {academicYears.find(y => y.id === formData.academic_year_id)?.name || 'Select'}
                </Text>
              </TouchableOpacity>

              <Text style={s.label}>Class {!editId ? '*' : ''}</Text>
              <TouchableOpacity style={s.pickerBtn} disabled={!!editId}
                onPress={() => openPicker('Class', classNames.map(c => ({ label: c.name, value: c.id })),
                  v => setFormData(p => ({ ...p, class_name_id: v })))}>
                <Text style={[s.pickerBtnText, editId && { color: COLORS.textSecondary }]}>
                  {classNames.find(c => c.id === formData.class_name_id)?.name || 'Select Class'}
                </Text>
              </TouchableOpacity>

              <Text style={s.label}>Fee Type *</Text>
              <TextInput style={s.input} value={formData.fee_type}
                onChangeText={v => setFormData(p => ({ ...p, fee_type: v }))}
                placeholder="e.g., Tuition Fee" />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Term *</Text>
                  <TouchableOpacity style={s.pickerBtn}
                    onPress={() => openPicker('Term', termOptions, v => setFormData(p => ({ ...p, term: v })))}>
                    <Text style={s.pickerBtnText}>Term {formData.term}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Amount (₹) *</Text>
                  <TextInput style={s.input} value={formData.amount}
                    onChangeText={v => setFormData(p => ({ ...p, amount: v }))}
                    keyboardType="numeric" placeholder="0.00" />
                </View>
              </View>

              <View style={s.modalActions}>
                <TouchableOpacity style={[s.addBtn, { flex: 1, marginRight: 8 }]} onPress={handleSubmit} disabled={saving}>
                  <Text style={s.addBtnText}>{saving ? 'Saving...' : editId ? 'Update' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.addBtn, { flex: 1, backgroundColor: COLORS.error }]}
                  onPress={() => { setShowForm(false); resetForm(); }}>
                  <Text style={s.addBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PickerModal visible={picker.visible} title={picker.title} data={picker.data}
        onSelect={picker.onSelect} onClose={() => setPicker(p => ({ ...p, visible: false }))} />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', marginBottom: 12 },
  filterBtn: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  filterLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  filterValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  classCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, elevation: 2, overflow: 'hidden' },
  classHeader: { backgroundColor: '#eef2ff', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  classTitle: { fontSize: 15, fontWeight: '700', color: '#4338ca' },
  classTotalText: { fontSize: 13, fontWeight: 'bold', color: '#4338ca' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tableCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 12, color: COLORS.text },
  tableCellHeader: { fontWeight: '700', fontSize: 11, color: COLORS.textSecondary, textTransform: 'uppercase', backgroundColor: '#f9fafb' },
  tableCellRight: { textAlign: 'right' },
  tableFooter: { backgroundColor: '#eef2ff', borderBottomWidth: 0 },
  termActions: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 4, gap: 8 },
  termActionGroup: { flexDirection: 'row', gap: 2 },
  termActionBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  termActionText: { fontSize: 12, color: '#4338ca' },
  emptyWrap: { padding: 40, alignItems: 'center' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 15 },
  pickerBtn: { backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  pickerBtnText: { fontSize: 15, color: COLORS.text },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default FeeStructureScreen;
