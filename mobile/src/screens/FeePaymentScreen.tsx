import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface FeePayment {
  id: number;
  student_id: number;
  student_name: string;
  admission_number: string;
  academic_year_name: string;
  fee_type: string | null;
  term: number | null;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  receipt_number: string | null;
  status: string;
  remarks: string | null;
}

interface FeeStructure {
  id: number;
  class_name: string;
  class_name_id: number;
  fee_type: string;
  term: number;
  amount: number;
}

interface StudentOption {
  id: number;
  name: string;
  admission_number: string;
  class_name: string | null;
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

const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const FeePaymentScreen = () => {
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [formClassId, setFormClassId] = useState<number | null>(null);
  const [formTerm, setFormTerm] = useState(1);
  const [formFeeStructureId, setFormFeeStructureId] = useState<string>('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('cash');
  const [formDiscountType, setFormDiscountType] = useState<'amount' | 'percent'>('amount');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formTaxPercent, setFormTaxPercent] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (current) setSelectedAYId(current.id);
      } catch (error) { console.error(error); }
    })();
  }, []);

  const fetchPayments = useCallback(async () => {
    try {
      const params: string[] = [];
      if (selectedAYId) params.push(`academic_year_id=${selectedAYId}`);
      const url = params.length ? `${API_ENDPOINTS.FEE_PAYMENT}?${params.join('&')}` : API_ENDPOINTS.FEE_PAYMENT;
      const data = await apiClient.get<FeePayment[]>(url);
      setPayments(data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedAYId]);

  const loadFeeStructures = useCallback(async () => {
    if (!selectedAYId) return;
    try {
      const data = await apiClient.get<FeeStructure[]>(`${API_ENDPOINTS.FEE_STRUCTURE}?academic_year_id=${selectedAYId}`);
      setFeeStructures(data);
    } catch { /* ignore */ }
  }, [selectedAYId]);

  useEffect(() => {
    if (selectedAYId) { fetchPayments(); loadFeeStructures(); }
  }, [selectedAYId, fetchPayments, loadFeeStructures]);

  const searchStudents = (query: string) => {
    setStudentSearch(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.length < 2) { setStudentResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await apiClient.get<any>(`${API_ENDPOINTS.STUDENTS}?search=${encodeURIComponent(query)}&limit=10`);
        const students = (data?.students || data || []).map((s: any) => ({
          id: s.id,
          name: `${s.first_name} ${s.surname || ''}`.trim(),
          admission_number: s.admission_number,
          class_name: s.class_name || null,
        }));
        setStudentResults(students);
      } catch { setStudentResults([]); }
    }, 300);
  };

  const selectStudent = (s: StudentOption) => {
    setSelectedStudent(s);
    setStudentSearch(s.name);
    setStudentResults([]);
    setFormFeeStructureId('');
    if (s.class_name) {
      const matched = classNames.find(c => c.name.toLowerCase() === s.class_name!.toLowerCase());
      if (matched) setFormClassId(matched.id);
    }
  };

  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPicker({ visible: true, title, data, onSelect });
  };

  // Discount/Tax calculation
  const calcSummary = () => {
    const gross = parseFloat(formAmount) || 0;
    const discVal = parseFloat(formDiscountValue) || 0;
    const taxPct = parseFloat(formTaxPercent) || 0;
    const discAmt = formDiscountType === 'percent'
      ? Math.round(gross * discVal / 100 * 100) / 100
      : Math.min(discVal, gross);
    const afterDiscount = gross - discAmt;
    const taxAmt = Math.round(afterDiscount * taxPct / 100 * 100) / 100;
    const netAmt = Math.round((afterDiscount + taxAmt) * 100) / 100;
    return { gross, discAmt, taxAmt, netAmt };
  };

  const handleSubmit = async () => {
    if (!selectedStudent || !formAmount) {
      Alert.alert('Error', 'Please select a student and enter amount'); return;
    }
    setSaving(true);
    try {
      await apiClient.post(API_ENDPOINTS.FEE_PAYMENT, {
        student_id: selectedStudent.id,
        academic_year_id: selectedAYId || 0,
        fee_structure_id: formFeeStructureId ? parseInt(formFeeStructureId) : undefined,
        term: formTerm,
        amount_paid: parseFloat(formAmount),
        payment_method: formMethod,
        discount_type: formDiscountValue ? formDiscountType : undefined,
        discount_value: formDiscountValue ? parseFloat(formDiscountValue) : undefined,
        tax_percent: formTaxPercent ? parseFloat(formTaxPercent) : undefined,
        remarks: formRemarks || undefined,
      });
      Alert.alert('Success', 'Payment recorded successfully');
      setShowForm(false); resetForm(); fetchPayments();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to record payment');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setStudentSearch(''); setStudentResults([]); setSelectedStudent(null);
    setFormClassId(null); setFormTerm(1); setFormFeeStructureId('');
    setFormAmount(''); setFormMethod('cash'); setFormDiscountType('amount');
    setFormDiscountValue(''); setFormTaxPercent(''); setFormRemarks('');
  };

  const getMethodBadge = (method: string): { bg: string; text: string } => {
    const map: Record<string, { bg: string; text: string }> = {
      cash: { bg: '#dcfce7', text: '#15803d' },
      bank_transfer: { bg: '#f3e8ff', text: '#7c3aed' },
      cheque: { bg: '#fef3c7', text: '#b45309' },
      razorpay: { bg: '#dbeafe', text: '#1d4ed8' },
      online: { bg: '#dbeafe', text: '#1d4ed8' },
      upi: { bg: '#dbeafe', text: '#1d4ed8' },
    };
    return map[method] || { bg: '#f3f4f6', text: '#6b7280' };
  };

  const getStatusBadge = (status: string): { bg: string; text: string } => {
    const map: Record<string, { bg: string; text: string }> = {
      completed: { bg: '#dcfce7', text: '#15803d' },
      pending: { bg: '#fef3c7', text: '#b45309' },
      failed: { bg: '#fee2e2', text: '#dc2626' },
    };
    return map[status] || { bg: '#f3f4f6', text: '#6b7280' };
  };

  const methodOptions = [
    { label: 'Cash', value: 'cash' }, { label: 'Bank Transfer', value: 'bank_transfer' },
    { label: 'Cheque', value: 'cheque' }, { label: 'UPI', value: 'upi' },
  ];
  const termOptions = [{ label: 'Term 1', value: 1 }, { label: 'Term 2', value: 2 }, { label: 'Term 3', value: 3 }];
  const discountTypeOptions = [{ label: 'Amount (₹)', value: 'amount' }, { label: 'Percentage (%)', value: 'percent' }];

  const filteredStructures = feeStructures.filter(f =>
    (!formClassId || f.class_name_id === formClassId) && f.term === formTerm
  );

  const ayName = academicYears.find(y => y.id === selectedAYId)?.name || 'Select Year';
  const showCalcSummary = formAmount && (parseFloat(formDiscountValue) > 0 || parseFloat(formTaxPercent) > 0);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={s.container}>
      {/* Year Filter */}
      <TouchableOpacity style={s.filterBtn}
        onPress={() => openPicker('Academic Year', academicYears.map(y => ({ label: y.name, value: y.id })), v => setSelectedAYId(v))}>
        <Text style={s.filterLabel}>Academic Year</Text>
        <Text style={s.filterValue}>{ayName}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.addBtn} onPress={() => { resetForm(); setShowForm(true); }}>
        <Text style={s.addBtnText}>+ Collect Fee</Text>
      </TouchableOpacity>

      {/* Payments List */}
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPayments(); }} />}
        renderItem={({ item }) => {
          const mb = getMethodBadge(item.payment_method);
          const sb = getStatusBadge(item.status);
          return (
            <View style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.student_name || '-'}</Text>
                <Text style={s.sub}>{item.admission_number || '-'} | {item.fee_type || 'General'}{item.term ? ` • Term ${item.term}` : ''}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
                  <Text style={s.amountText}>{formatCurrency(item.amount_paid)}</Text>
                  <View style={[s.badge, { backgroundColor: mb.bg }]}>
                    <Text style={[s.badgeText, { color: mb.text }]}>{item.payment_method.replace('_', ' ')}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: sb.bg }]}>
                    <Text style={[s.badgeText, { color: sb.text }]}>{item.status}</Text>
                  </View>
                </View>
                <Text style={[s.sub, { marginTop: 2 }]}>{item.receipt_number || ''} • {formatDate(item.payment_date)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>No payments found</Text>}
        ListHeaderComponent={
          <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>{payments.length} records</Text>
        }
      />

      {/* Payment Form Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={s.modalTitle}>Collect Fee Payment</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text style={{ fontSize: 22, color: COLORS.textSecondary }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Student Search */}
              <Text style={s.label}>Search Student *</Text>
              <TextInput style={s.input} value={studentSearch}
                onChangeText={searchStudents}
                placeholder="Type student name or admission number..." />
              {studentResults.length > 0 && (
                <View style={s.searchResults}>
                  {studentResults.map(st => (
                    <TouchableOpacity key={st.id} style={s.searchResultItem} onPress={() => selectStudent(st)}>
                      <Text style={{ fontSize: 14, fontWeight: '600' }}>{st.name}</Text>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary }}>({st.admission_number})</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {selectedStudent && (
                <Text style={s.selectedInfo}>Selected: {selectedStudent.name} ({selectedStudent.admission_number})</Text>
              )}

              {/* AY, Class, Term */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Class</Text>
                  <TouchableOpacity style={s.pickerBtn}
                    onPress={() => openPicker('Class', [{ label: 'Select Class', value: null }, ...classNames.map(c => ({ label: c.name, value: c.id }))],
                      v => { setFormClassId(v); setFormFeeStructureId(''); })}>
                    <Text style={s.pickerBtnText}>{classNames.find(c => c.id === formClassId)?.name || 'Select'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Term</Text>
                  <TouchableOpacity style={s.pickerBtn}
                    onPress={() => openPicker('Term', termOptions, v => { setFormTerm(v); setFormFeeStructureId(''); })}>
                    <Text style={s.pickerBtnText}>Term {formTerm}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Fee Component */}
              <Text style={s.label}>Fee Component</Text>
              <TouchableOpacity style={s.pickerBtn}
                onPress={() => openPicker('Fee Component',
                  [{ label: 'General Payment', value: '' },
                    ...filteredStructures.map(f => ({ label: `${f.fee_type} (${formatCurrency(f.amount)})`, value: String(f.id) }))],
                  v => {
                    setFormFeeStructureId(v);
                    if (v) {
                      const fs = feeStructures.find(f => f.id === parseInt(v));
                      if (fs) setFormAmount(String(fs.amount));
                    }
                  })}>
                <Text style={s.pickerBtnText}>
                  {formFeeStructureId
                    ? feeStructures.find(f => f.id === parseInt(formFeeStructureId))?.fee_type || 'Selected'
                    : 'General Payment'}
                </Text>
              </TouchableOpacity>

              {/* Amount + Method */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Amount (₹) *</Text>
                  <TextInput style={s.input} value={formAmount}
                    onChangeText={setFormAmount} keyboardType="numeric" placeholder="0.00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Payment Method</Text>
                  <TouchableOpacity style={s.pickerBtn}
                    onPress={() => openPicker('Payment Method', methodOptions, setFormMethod)}>
                    <Text style={s.pickerBtnText}>{methodOptions.find(m => m.value === formMethod)?.label || 'Cash'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Discount & Tax */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Discount Type</Text>
                  <TouchableOpacity style={s.pickerBtn}
                    onPress={() => openPicker('Discount Type', discountTypeOptions, setFormDiscountType)}>
                    <Text style={s.pickerBtnText}>{formDiscountType === 'percent' ? '%' : '₹'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Discount {formDiscountType === 'percent' ? '(%)' : '(₹)'}</Text>
                  <TextInput style={s.input} value={formDiscountValue}
                    onChangeText={setFormDiscountValue} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Tax (%)</Text>
                  <TextInput style={s.input} value={formTaxPercent}
                    onChangeText={setFormTaxPercent} keyboardType="numeric" placeholder="0" />
                </View>
              </View>

              {/* Calculated Summary */}
              {showCalcSummary && (() => {
                const { gross, discAmt, taxAmt, netAmt } = calcSummary();
                return (
                  <View style={s.calcBox}>
                    <View style={s.calcRow}>
                      <Text style={s.calcLabel}>Gross Amount</Text>
                      <Text style={s.calcValue}>{formatCurrency(gross)}</Text>
                    </View>
                    {discAmt > 0 && (
                      <View style={s.calcRow}>
                        <Text style={[s.calcLabel, { color: '#15803d' }]}>
                          Discount {formDiscountType === 'percent' ? `(${formDiscountValue}%)` : ''}
                        </Text>
                        <Text style={[s.calcValue, { color: '#15803d' }]}>- {formatCurrency(discAmt)}</Text>
                      </View>
                    )}
                    {taxAmt > 0 && (
                      <View style={s.calcRow}>
                        <Text style={[s.calcLabel, { color: '#ea580c' }]}>Tax ({formTaxPercent}%)</Text>
                        <Text style={[s.calcValue, { color: '#ea580c' }]}>+ {formatCurrency(taxAmt)}</Text>
                      </View>
                    )}
                    <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: '#c7d2fe', paddingTop: 6 }]}>
                      <Text style={[s.calcLabel, { fontWeight: 'bold', color: '#312e81' }]}>Net Payable</Text>
                      <Text style={[s.calcValue, { fontWeight: 'bold', color: '#312e81' }]}>{formatCurrency(netAmt)}</Text>
                    </View>
                  </View>
                );
              })()}

              <Text style={s.label}>Remarks</Text>
              <TextInput style={s.input} value={formRemarks}
                onChangeText={setFormRemarks} placeholder="Optional remarks" />

              <View style={s.modalActions}>
                <TouchableOpacity style={[s.addBtn, { flex: 1, marginRight: 8, backgroundColor: '#22c55e' }]}
                  onPress={handleSubmit} disabled={saving}>
                  <Text style={s.addBtnText}>{saving ? 'Processing...' : 'Record Payment'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.addBtn, { flex: 1, backgroundColor: COLORS.error }]}
                  onPress={() => setShowForm(false)}>
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
  filterBtn: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10, marginBottom: 12 },
  filterLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  filterValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  addBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, elevation: 1 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  amountText: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: COLORS.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  pickerBtn: { backgroundColor: COLORS.background, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  pickerBtnText: { fontSize: 14, color: COLORS.text },
  searchResults: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginTop: 4, maxHeight: 160 },
  searchResultItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', gap: 6, alignItems: 'center' },
  selectedInfo: { fontSize: 12, color: '#4338ca', marginTop: 4 },
  calcBox: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 10, padding: 12, marginTop: 10, gap: 4 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between' },
  calcLabel: { fontSize: 13, color: COLORS.textSecondary },
  calcValue: { fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', marginTop: 20 },
});

export default FeePaymentScreen;
