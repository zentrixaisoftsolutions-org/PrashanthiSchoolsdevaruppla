import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, ScrollView,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface FeeBreakdown {
  fee_type: string;
  amount: number;
  frequency: string;
  paid: number;
  due: number;
}

interface StudentFeeSummary {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  total_fee: number;
  total_paid: number;
  total_due: number;
  last_payment_date: string | null;
  fee_breakdown: FeeBreakdown[];
}

interface FeePayment {
  id: number;
  fee_type: string | null;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  receipt_number: string | null;
  status: string;
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

const formatDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '-';

const PAGE_SIZE = 10;

const FeeSummaryScreen = () => {
  const [summaries, setSummaries] = useState<StudentFeeSummary[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Aggregate totals
  const [totalFee, setTotalFee] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalDue, setTotalDue] = useState(0);

  // Detail modal
  const [detailStudent, setDetailStudent] = useState<StudentFeeSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<FeePayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const loadSummaries = useCallback(async (pageOverride?: number) => {
    if (!selectedAYId) return;
    setLoading(true);
    try {
      const pg = pageOverride ?? currentPage;
      const params: string[] = [`academic_year_id=${selectedAYId}`, `page=${pg}`, `page_size=${PAGE_SIZE}`];
      if (selectedClassId) params.push(`class_name_id=${selectedClassId}`);
      if (searchText) params.push(`search=${encodeURIComponent(searchText)}`);
      const data = await apiClient.get<any>(`${API_ENDPOINTS.FEE_SUMMARY}?${params.join('&')}`);
      setSummaries(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalRecords(data.total || 0);
      setTotalFee(data.total_fee || 0);
      setTotalPaid(data.total_paid || 0);
      setTotalDue(data.total_due || 0);
      if (pageOverride) setCurrentPage(pageOverride);
    } catch (error) { console.error(error); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedAYId, selectedClassId, searchText, currentPage]);

  useEffect(() => {
    if (selectedAYId) loadSummaries();
  }, [selectedAYId, selectedClassId, currentPage]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (selectedAYId) { setCurrentPage(1); loadSummaries(1); }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchText]);

  const openStudentDetail = async (student: StudentFeeSummary) => {
    setDetailStudent(student);
    setHistoryLoading(true);
    try {
      const params = selectedAYId ? `?academic_year_id=${selectedAYId}` : '';
      const history = await apiClient.get<FeePayment[]>(
        `${API_ENDPOINTS.FEE_PAYMENT}/history/${student.student_id}${params}`
      );
      setPaymentHistory(history);
    } catch { setPaymentHistory([]); }
    finally { setHistoryLoading(false); }
  };

  const closeDetail = () => { setDetailStudent(null); setPaymentHistory([]); };

  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPicker({ visible: true, title, data, onSelect });
  };

  const ayName = academicYears.find(y => y.id === selectedAYId)?.name || 'Select Year';
  const classLabel = selectedClassId ? (classNames.find(c => c.id === selectedClassId)?.name || '') : 'All Classes';

  return (
    <View style={s.container}>
      {/* Filters */}
      <View style={s.filterRow}>
        <TouchableOpacity style={[s.filterBtn, { flex: 1, marginRight: 8 }]}
          onPress={() => openPicker('Academic Year', academicYears.map(y => ({ label: y.name, value: y.id })),
            v => { setSelectedAYId(v); setCurrentPage(1); })}>
          <Text style={s.filterLabel}>Year</Text>
          <Text style={s.filterValue} numberOfLines={1}>{ayName}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.filterBtn, { flex: 1 }]}
          onPress={() => openPicker('Class', [{ label: 'All Classes', value: null }, ...classNames.map(c => ({ label: c.name, value: c.id }))],
            v => { setSelectedClassId(v); setCurrentPage(1); })}>
          <Text style={s.filterLabel}>Class</Text>
          <Text style={s.filterValue} numberOfLines={1}>{classLabel}</Text>
        </TouchableOpacity>
      </View>

      <TextInput style={s.searchInput} value={searchText} onChangeText={setSearchText}
        placeholder="Search by name or admission no..." placeholderTextColor={COLORS.textSecondary} />

      {/* Totals Bar */}
      <View style={s.totalsRow}>
        <View style={[s.totalCard, { backgroundColor: '#dbeafe' }]}>
          <Text style={[s.totalLabel, { color: '#1d4ed8' }]}>Total Fee</Text>
          <Text style={[s.totalValue, { color: '#1d4ed8' }]}>{formatCurrency(totalFee)}</Text>
        </View>
        <View style={[s.totalCard, { backgroundColor: '#dcfce7' }]}>
          <Text style={[s.totalLabel, { color: '#15803d' }]}>Paid</Text>
          <Text style={[s.totalValue, { color: '#15803d' }]}>{formatCurrency(totalPaid)}</Text>
        </View>
        <View style={[s.totalCard, { backgroundColor: '#fee2e2' }]}>
          <Text style={[s.totalLabel, { color: '#dc2626' }]}>Due</Text>
          <Text style={[s.totalValue, { color: '#dc2626' }]}>{formatCurrency(totalDue)}</Text>
        </View>
      </View>

      {loading && summaries.length === 0 ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <>
          <FlatList
            data={summaries}
            keyExtractor={(item) => item.student_id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSummaries(); }} />}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={s.card} onPress={() => openStudentDetail(item)}>
                <View style={s.cardRow}>
                  <View style={s.cardIndex}>
                    <Text style={s.cardIndexText}>{(currentPage - 1) * PAGE_SIZE + index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{item.student_name}</Text>
                    <Text style={s.sub}>{item.admission_number} | {item.class_name || '-'}</Text>
                  </View>
                </View>
                <View style={s.feeRow}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[s.feeLabel]}>Fee</Text>
                    <Text style={[s.feeAmount, { color: '#1d4ed8' }]}>{formatCurrency(item.total_fee)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={s.feeLabel}>Paid</Text>
                    <Text style={[s.feeAmount, { color: '#15803d' }]}>{formatCurrency(item.total_paid)}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={s.feeLabel}>Due</Text>
                    <Text style={[s.feeAmount, { color: item.total_due > 0 ? '#dc2626' : '#15803d' }]}>
                      {item.total_due > 0 ? formatCurrency(item.total_due) : 'Paid ✓'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={s.feeLabel}>Last Pay</Text>
                    <Text style={s.sub}>{formatDate(item.last_payment_date)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>No data found</Text>}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={s.pagination}>
              <Text style={s.pageInfo}>
                {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalRecords)} of {totalRecords}
              </Text>
              <View style={s.pageButtons}>
                <TouchableOpacity style={[s.pageBtn, currentPage === 1 && s.pageBtnDisabled]}
                  disabled={currentPage === 1} onPress={() => setCurrentPage(1)}>
                  <Text style={s.pageBtnText}>«</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pageBtn, currentPage === 1 && s.pageBtnDisabled]}
                  disabled={currentPage === 1} onPress={() => setCurrentPage(p => Math.max(1, p - 1))}>
                  <Text style={s.pageBtnText}>‹</Text>
                </TouchableOpacity>
                <View style={[s.pageBtn, { backgroundColor: '#4f46e5' }]}>
                  <Text style={[s.pageBtnText, { color: '#fff' }]}>{currentPage}</Text>
                </View>
                <TouchableOpacity style={[s.pageBtn, currentPage === totalPages && s.pageBtnDisabled]}
                  disabled={currentPage === totalPages} onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                  <Text style={s.pageBtnText}>›</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.pageBtn, currentPage === totalPages && s.pageBtnDisabled]}
                  disabled={currentPage === totalPages} onPress={() => setCurrentPage(totalPages)}>
                  <Text style={s.pageBtnText}>»</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* Student Detail Modal */}
      {detailStudent && (
        <Modal visible={true} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              {/* Header */}
              <View style={s.detailHeader}>
                <View>
                  <Text style={s.detailName}>{detailStudent.student_name}</Text>
                  <Text style={s.detailSub}>{detailStudent.admission_number} | {detailStudent.class_name || 'N/A'}</Text>
                </View>
                <TouchableOpacity onPress={closeDetail}>
                  <Text style={{ fontSize: 22, color: '#fff' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 16 }}>
                {/* Fee Breakdown */}
                <Text style={s.sectionTitle}>Fee Breakdown</Text>
                {detailStudent.fee_breakdown.length > 0 ? (
                  <View style={s.tableCard}>
                    <View style={[s.tRow, s.tHeaderRow]}>
                      <Text style={[s.tCell, { flex: 2, fontWeight: '700' }]}>Fee Type</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: '700' }]}>Amount</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: '700' }]}>Paid</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: '700' }]}>Due</Text>
                    </View>
                    {detailStudent.fee_breakdown.map((b, i) => (
                      <View key={i} style={[s.tRow, i % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                        <Text style={[s.tCell, { flex: 2 }]}>{b.fee_type}</Text>
                        <Text style={[s.tCell, s.tRight]}>{formatCurrency(b.amount)}</Text>
                        <Text style={[s.tCell, s.tRight, { color: '#15803d' }]}>{formatCurrency(b.paid)}</Text>
                        <Text style={[s.tCell, s.tRight, { color: b.due > 0 ? '#dc2626' : '#15803d' }]}>
                          {b.due > 0 ? formatCurrency(b.due) : '✓'}
                        </Text>
                      </View>
                    ))}
                    <View style={[s.tRow, { backgroundColor: '#eef2ff', borderTopWidth: 2, borderTopColor: '#c7d2fe' }]}>
                      <Text style={[s.tCell, { flex: 2, fontWeight: 'bold' }]}>Total</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: 'bold' }]}>{formatCurrency(detailStudent.total_fee)}</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: 'bold', color: '#15803d' }]}>{formatCurrency(detailStudent.total_paid)}</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: 'bold', color: '#dc2626' }]}>{formatCurrency(detailStudent.total_due)}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={s.sub}>No fee structure defined for this student's class</Text>
                )}

                {/* Payment History */}
                <Text style={[s.sectionTitle, { marginTop: 20 }]}>Payment History</Text>
                {historyLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />
                ) : paymentHistory.length === 0 ? (
                  <Text style={s.sub}>No payment records found</Text>
                ) : (
                  <View style={s.tableCard}>
                    <View style={[s.tRow, s.tHeaderRow]}>
                      <Text style={[s.tCell, { fontWeight: '700' }]}>Date</Text>
                      <Text style={[s.tCell, { fontWeight: '700' }]}>Receipt</Text>
                      <Text style={[s.tCell, { fontWeight: '700' }]}>Type</Text>
                      <Text style={[s.tCell, s.tRight, { fontWeight: '700' }]}>Amount</Text>
                      <Text style={[s.tCell, { fontWeight: '700' }]}>Status</Text>
                    </View>
                    {paymentHistory.map((p, i) => (
                      <View key={p.id} style={[s.tRow, i % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                        <Text style={s.tCell}>{formatDate(p.payment_date)}</Text>
                        <Text style={[s.tCell, { color: '#4338ca', fontSize: 10, fontFamily: 'monospace' }]}>{p.receipt_number || '-'}</Text>
                        <Text style={s.tCell}>{p.fee_type || 'General'}</Text>
                        <Text style={[s.tCell, s.tRight, { fontWeight: '600' }]}>{formatCurrency(p.amount_paid)}</Text>
                        <View style={s.tCell}>
                          <View style={[s.statusDot, {
                            backgroundColor: p.status === 'completed' ? '#dcfce7' : p.status === 'failed' ? '#fee2e2' : '#fef3c7'
                          }]}>
                            <Text style={{
                              fontSize: 9, fontWeight: '600', textTransform: 'capitalize',
                              color: p.status === 'completed' ? '#15803d' : p.status === 'failed' ? '#dc2626' : '#b45309'
                            }}>{p.status}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      <PickerModal visible={picker.visible} title={picker.title} data={picker.data}
        onSelect={picker.onSelect} onClose={() => setPicker(p => ({ ...p, visible: false }))} />
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', marginBottom: 8 },
  filterBtn: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  filterLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  filterValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  searchInput: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, padding: 10, fontSize: 14, marginBottom: 12 },
  totalsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  totalCard: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  totalLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  totalValue: { fontSize: 14, fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8, elevation: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardIndex: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  cardIndexText: { fontSize: 11, fontWeight: '700', color: '#4338ca' },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 2 },
  feeAmount: { fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 15 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  pageInfo: { fontSize: 12, color: COLORS.textSecondary },
  pageButtons: { flexDirection: 'row', gap: 4 },
  pageBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { flex: 1, backgroundColor: '#fff', marginTop: 50 },
  detailHeader: { backgroundColor: '#4f46e5', paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  detailSub: { fontSize: 12, color: '#c7d2fe', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  tableCard: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tHeaderRow: { backgroundColor: '#f9fafb' },
  tCell: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, fontSize: 11, color: COLORS.text },
  tRight: { textAlign: 'right' },
  statusDot: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start' },
});

export default FeeSummaryScreen;
