import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView,
  Platform, StatusBar,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

// ── Types ──
interface StaffMember {
  id: number;
  name: string;
  basic_salary?: number;
  department_id?: number;
}

interface Department { id: number; name: string; }

interface StaffSalaryDetail {
  id: number | null;
  staff_id: number;
  staff_name: string;
  employee_id: string | null;
  designation: string | null;
  department_name: string | null;
  month: number;
  year: number;
  total_working_days: number;
  days_present: number;
  days_absent: number;
  days_late: number;
  days_half_day: number;
  days_leave: number;
  base_salary: number;
  deduction: number;
  net_salary: number;
  remarks: string | null;
}

interface SalarySummary {
  total_base: number;
  total_deduction: number;
  total_net: number;
}

interface SalaryResponse {
  month: number;
  year: number;
  total_working_days: number;
  staff_salaries: StaffSalaryDetail[];
  summary: SalarySummary;
}

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const StaffSalaryScreen = () => {
  const now = new Date();

  // Data
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Salary controls
  const [salaryMonth, setSalaryMonth] = useState(now.getMonth() + 1);
  const [salaryYear, setSalaryYear] = useState(now.getFullYear());
  const [workingDays, setWorkingDays] = useState('26');
  const [filterDept, setFilterDept] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  // Results
  const [salaryResult, setSalaryResult] = useState<SalaryResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<number | null>(null);

  // Picker
  const [pickerModal, setPickerModal] = useState<{ visible: boolean; title: string; data: { label: string; value: any }[]; onSelect: (v: any) => void }>({
    visible: false, title: '', data: [], onSelect: () => {},
  });

  const fetchData = useCallback(async () => {
    try {
      const [staffData, deptData] = await Promise.all([
        apiClient.get<StaffMember[]>(API_ENDPOINTS.STAFF_LIST),
        apiClient.get<Department[]>(API_ENDPOINTS.DEPARTMENTS),
      ]);
      setStaff(staffData);
      setDepartments(deptData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, []);

  const handleCalculate = async () => {
    setCalculating(true);
    setSalaryResult(null);
    try {
      const wd = Math.max(1, Math.min(31, parseInt(workingDays) || 26));
      if (showSaved) {
        let url = `${API_ENDPOINTS.STAFF_SALARY}/records?month=${salaryMonth}&year=${salaryYear}`;
        if (filterDept) url += `&department_id=${filterDept}`;
        const data = await apiClient.get<SalaryResponse>(url);
        setSalaryResult(data);
      } else {
        const data = await apiClient.post<SalaryResponse>(`${API_ENDPOINTS.STAFF_SALARY}/calculate`, {
          month: salaryMonth, year: salaryYear, total_working_days: wd,
        });
        // Client-side dept filter
        if (filterDept) {
          const filtered = data.staff_salaries.filter(s => {
            const obj = staff.find(st => st.id === s.staff_id);
            return obj?.department_id === filterDept;
          });
          const tb = filtered.reduce((a, b) => a + b.base_salary, 0);
          const td = filtered.reduce((a, b) => a + b.deduction, 0);
          const tn = filtered.reduce((a, b) => a + b.net_salary, 0);
          setSalaryResult({
            ...data, staff_salaries: filtered,
            summary: { total_base: Math.round(tb * 100) / 100, total_deduction: Math.round(td * 100) / 100, total_net: Math.round(tn * 100) / 100 },
          });
        } else {
          setSalaryResult(data);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Calculation failed');
    } finally { setCalculating(false); }
  };

  const handleSave = async () => {
    const wd = Math.max(1, Math.min(31, parseInt(workingDays) || 26));
    setSaving(true);
    try {
      const res = await apiClient.post<{ message: string; count: number }>(`${API_ENDPOINTS.STAFF_SALARY}/save`, {
        month: salaryMonth, year: salaryYear, total_working_days: wd,
      });
      Alert.alert('Success', res.message || 'Salary records saved');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const openPicker = (title: string, data: { label: string; value: any }[], onSelect: (v: any) => void) => {
    setPickerModal({ visible: true, title, data, onSelect });
  };

  // Labels
  const monthLabel = MONTHS[salaryMonth - 1];
  const deptLabel = filterDept ? departments.find(d => d.id === filterDept)?.name || 'Dept' : 'All Departments';
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
      >
        {/* Header */}
        <Text style={styles.pageTitle}>💰 Staff Salary</Text>
        <Text style={styles.pageSubtitle}>Calculate and manage staff salary based on attendance</Text>

        {/* Controls Card */}
        <View style={styles.controlsCard}>
          <Text style={styles.sectionTitle}>Salary Calculation</Text>
          <Text style={styles.ruleHint}>
            Salary is deducted for absent days beyond 1. Half-days count as 0.5 day deduction.
          </Text>

          {/* Row 1: Month & Year */}
          <View style={styles.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>Month</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Month',
                  MONTHS.map((m, i) => ({ label: m, value: i + 1 })),
                  v => setSalaryMonth(v)
                )}
              >
                <Text style={styles.filterBtnText}>{monthLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Year</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Year',
                  yearOptions.map(y => ({ label: String(y), value: y })),
                  v => setSalaryYear(v)
                )}
              >
                <Text style={styles.filterBtnText}>{salaryYear}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Row 2: Working Days & Department */}
          <View style={styles.filterRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.fieldLabel}>Working Days</Text>
              <TextInput
                style={styles.input}
                value={workingDays}
                onChangeText={setWorkingDays}
                keyboardType="numeric"
                maxLength={2}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Department</Text>
              <TouchableOpacity
                style={styles.filterBtn}
                onPress={() => openPicker('Select Department',
                  [{ label: 'All Departments', value: null }, ...departments.map(d => ({ label: d.name, value: d.id }))],
                  v => setFilterDept(v)
                )}
              >
                <Text style={styles.filterBtnText} numberOfLines={1}>{deptLabel}</Text>
                <Text style={styles.arrow}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Toggle: View Saved */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => { setShowSaved(!showSaved); setSalaryResult(null); }}
          >
            <View style={[styles.toggleBox, showSaved && styles.toggleBoxActive]}>
              {showSaved && <Text style={styles.toggleCheck}>✓</Text>}
            </View>
            <Text style={styles.toggleLabel}>View saved salary records</Text>
          </TouchableOpacity>

          {/* Calculate Button */}
          <TouchableOpacity
            style={[styles.calculateBtn, calculating && { opacity: 0.6 }]}
            onPress={handleCalculate}
            disabled={calculating}
          >
            <Text style={styles.calculateBtnText}>
              {calculating ? 'Calculating...' : showSaved ? '📂 Load Saved' : '💲 Calculate'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Results */}
        {calculating && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />}

        {!calculating && salaryResult && salaryResult.staff_salaries.length > 0 && (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: '#3b82f6' }]}>
                <Text style={styles.summaryLabel}>Total Base</Text>
                <Text style={styles.summaryValue}>{fmt(salaryResult.summary.total_base)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.error }]}>
                <Text style={styles.summaryLabel}>Deductions</Text>
                <Text style={styles.summaryValue}>{fmt(salaryResult.summary.total_deduction)}</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: COLORS.success }]}>
                <Text style={styles.summaryLabel}>Net Salary</Text>
                <Text style={styles.summaryValue}>{fmt(salaryResult.summary.total_net)}</Text>
              </View>
            </View>

            {/* Staff info */}
            <Text style={styles.resultInfo}>
              {salaryResult.staff_salaries.length} staff · {MONTHS[salaryResult.month - 1]} {salaryResult.year} · {salaryResult.total_working_days} working days
            </Text>

            {/* Staff Salary Cards */}
            {salaryResult.staff_salaries.map((s, idx) => (
              <TouchableOpacity
                key={s.staff_id}
                style={styles.salaryCard}
                activeOpacity={0.7}
                onPress={() => setExpandedStaff(expandedStaff === s.staff_id ? null : s.staff_id)}
              >
                {/* Header */}
                <View style={styles.salaryCardHeader}>
                  <View style={styles.salaryAvatar}>
                    <Text style={styles.salaryAvatarText}>{s.staff_name?.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.salaryName}>{s.staff_name}</Text>
                    {s.designation && <Text style={styles.salaryDesignation}>{s.designation}</Text>}
                    {s.department_name && <Text style={styles.salaryDept}>{s.department_name}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.netSalaryAmount}>{fmt(s.net_salary)}</Text>
                    {s.deduction > 0 && (
                      <Text style={styles.deductionText}>-{fmt(s.deduction)}</Text>
                    )}
                  </View>
                </View>

                {/* Attendance Badges */}
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                    <Text style={[styles.badgeNum, { color: '#166534' }]}>{s.days_present}</Text>
                    <Text style={[styles.badgeLabel, { color: '#166534' }]}>Present</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: s.days_absent > 1 ? '#fee2e2' : '#f3f4f6' }]}>
                    <Text style={[styles.badgeNum, { color: s.days_absent > 1 ? '#991b1b' : '#6b7280' }]}>{s.days_absent}</Text>
                    <Text style={[styles.badgeLabel, { color: s.days_absent > 1 ? '#991b1b' : '#6b7280' }]}>Absent</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: '#fef9c3' }]}>
                    <Text style={[styles.badgeNum, { color: '#854d0e' }]}>{s.days_late}</Text>
                    <Text style={[styles.badgeLabel, { color: '#854d0e' }]}>Late</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: '#ffedd5' }]}>
                    <Text style={[styles.badgeNum, { color: '#9a3412' }]}>{s.days_half_day}</Text>
                    <Text style={[styles.badgeLabel, { color: '#9a3412' }]}>Half</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: '#dbeafe' }]}>
                    <Text style={[styles.badgeNum, { color: '#1e40af' }]}>{s.days_leave}</Text>
                    <Text style={[styles.badgeLabel, { color: '#1e40af' }]}>Leave</Text>
                  </View>
                </View>

                {/* Expanded Details */}
                {expandedStaff === s.staff_id && (
                  <View style={styles.expandedSection}>
                    {s.employee_id && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Employee ID</Text>
                        <Text style={styles.detailValue}>{s.employee_id}</Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Base Salary</Text>
                      <Text style={styles.detailValue}>{fmt(s.base_salary)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Deduction</Text>
                      <Text style={[styles.detailValue, s.deduction > 0 && { color: COLORS.error }]}>
                        {s.deduction > 0 ? `-${fmt(s.deduction)}` : '₹0'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Net Salary</Text>
                      <Text style={[styles.detailValue, { color: COLORS.success, fontWeight: 'bold' }]}>{fmt(s.net_salary)}</Text>
                    </View>
                    {s.remarks ? (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Remarks</Text>
                        <Text style={[styles.detailValue, { flex: 1 }]}>{s.remarks}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

                <Text style={styles.expandHint}>{expandedStaff === s.staff_id ? '▾' : '▸'}</Text>
              </TouchableOpacity>
            ))}

            {/* Save Button */}
            {!showSaved && (
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : '💾 Save Salary Records'}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* No results */}
        {!calculating && salaryResult && salaryResult.staff_salaries.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>💰</Text>
            <Text style={styles.emptyText}>
              {showSaved ? 'No saved salary records found for this period' : 'No salary data. Make sure staff have their salary set.'}
            </Text>
          </View>
        )}

        {/* Rules Info Card */}
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Salary Calculation Rules</Text>
          <Text style={styles.ruleItem}>• Per-day salary = Base Salary ÷ Total Working Days</Text>
          <Text style={styles.ruleItem}>• 1 absent day is allowed without deduction</Text>
          <Text style={styles.ruleItem}>• Absent days beyond 1 are deducted at per-day rate</Text>
          <Text style={styles.ruleItem}>• Each half-day counts as 0.5 day deduction</Text>
          <Text style={styles.ruleItem}>• Days with no attendance record are counted as absent</Text>
          <Text style={styles.ruleItem}>• Late arrivals are flagged but not deducted</Text>
          <Text style={styles.ruleItem}>• Leave days are shown but not deducted</Text>
        </View>
      </ScrollView>

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

  // Header
  pageTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 16 },

  // Controls
  controlsCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  ruleHint: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 12, lineHeight: 16 },
  filterRow: { flexDirection: 'row', marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  filterBtnText: { flex: 1, fontSize: 14, color: COLORS.text },
  arrow: { fontSize: 12, color: COLORS.textSecondary },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.text },

  // Toggle
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 12 },
  toggleBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  toggleBoxActive: { backgroundColor: COLORS.primary },
  toggleCheck: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  toggleLabel: { fontSize: 13, color: COLORS.textSecondary },

  // Calculate
  calculateBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  calculateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  summaryValue: { fontSize: 15, fontWeight: 'bold', color: '#fff', marginTop: 2 },

  // Result info
  resultInfo: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, textAlign: 'center' },

  // Salary card
  salaryCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  salaryCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  salaryAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  salaryAvatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  salaryName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  salaryDesignation: { fontSize: 11, color: COLORS.textSecondary },
  salaryDept: { fontSize: 11, color: COLORS.primary },
  netSalaryAmount: { fontSize: 16, fontWeight: 'bold', color: COLORS.success },
  deductionText: { fontSize: 11, color: COLORS.error, fontWeight: '500' },

  // Attendance badges
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { flex: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  badgeNum: { fontSize: 15, fontWeight: 'bold' },
  badgeLabel: { fontSize: 9, fontWeight: '500', marginTop: 1 },

  // Expanded
  expandedSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  detailLabel: { fontSize: 12, color: COLORS.textSecondary },
  detailValue: { fontSize: 12, fontWeight: '500', color: COLORS.text },
  expandHint: { position: 'absolute', right: 14, bottom: 14, fontSize: 12, color: COLORS.textSecondary },

  // Save
  saveBtn: { backgroundColor: COLORS.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty
  emptyBox: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },

  // Rules
  rulesCard: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bfdbfe', marginTop: 8 },
  rulesTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af', marginBottom: 8 },
  ruleItem: { fontSize: 11, color: '#1d4ed8', lineHeight: 18 },
});

export default StaffSalaryScreen;
