import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS, ROLES } from '../config/constants';
import OfflineIndicator from '../components/OfflineIndicator';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ViewType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall';
type TabType = 'students' | 'staff';

interface ClassOption { class_name: string; section_name: string; }

interface DailyRecord {
  student_id: number;
  student_name: string;
  admission_number: string;
  rfid_id: string | null;
  class_name: string | null;
  section_name: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  device_name: string | null;
  is_manual_entry: boolean;
  attendance_id: number | null;
  sms_sent: boolean;
  whatsapp_sent: boolean;
}

interface StaffDailyRecord {
  staff_id: number;
  staff_name: string;
  employee_id: string;
  rfid: string | null;
  designation: string | null;
  department_name: string | null;
  mobile: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  is_manual_entry: boolean;
  attendance_id: number | null;
  remarks: string | null;
}

interface SummaryRecord {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  section_name: string | null;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  attendance_percentage: number;
}

interface StaffSummaryRecord {
  staff_id: number;
  staff_name: string;
  employee_id: string;
  designation: string | null;
  department_name: string | null;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  attendance_percentage: number;
}

interface SummaryStats {
  present: number;
  absent: number;
  late: number;
  not_marked?: number;
  percentage: number;
  total_students?: number;
  total_staff?: number;
  working_days?: number;
}

interface HistoryEntry {
  date: string;
  status: string;
  check_in_time: string | null;
  check_out_time: string | null;
  is_manual: boolean;
  remarks: string | null;
}

interface StudentHistory {
  student: {
    id: number; name: string; admission_number: string;
    class_name: string | null; section_name: string | null;
    rfid_id: string | null; mobile_number: string | null;
  };
  summary: { total_days: number; present_days: number; absent_days: number; late_days: number; attendance_percentage: number; };
  history: HistoryEntry[];
}

interface StaffHistory {
  staff: {
    id: number; name: string; employee_id: string;
    designation: string | null; department_name: string | null;
    rfid: string | null; mobile: string | null;
  };
  summary: { total_days: number; present_days: number; absent_days: number; late_days: number; attendance_percentage: number; };
  history: HistoryEntry[];
}

// Parent types
interface DayAttendance { date: string; day: number; weekday: string; status: string; scan_time: string | null; }
interface ChildSummary { present: number; absent: number; late: number; total_days: number; }
interface ChildMonthAttendance {
  student_id: number; student_name: string; admission_number: string;
  class_name: string | null; summary: ChildSummary; days: DayAttendance[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const VIEW_TYPES: { key: ViewType; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'overall', label: 'Overall' },
];
const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Present', value: 'present' },
  { label: 'Absent', value: 'absent' },
  { label: 'Late', value: 'late' },
];
const PAGE_SIZE = 20;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmtDate = (d: Date) => d.toISOString().split('T')[0];
const getMonday = (d: Date) => {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day + (day === 0 ? -6 : 1));
  return copy;
};
const formatTime = (t: string | null) => {
  if (!t) return '-';
  try { const d = new Date(t); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return t; }
};
const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'present': return COLORS.success;
    case 'absent': return COLORS.error;
    case 'late': return COLORS.warning;
    default: return COLORS.textSecondary;
  }
};
const getPercentageColor = (p: number) => {
  if (p >= 90) return COLORS.success;
  if (p >= 75) return COLORS.info;
  if (p >= 60) return COLORS.warning;
  return COLORS.error;
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AttendanceScreen = () => {
  const { user } = useAuth();
  const isParent = user?.role === ROLES.PARENT;

  // â”€â”€ Admin state â”€â”€
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [viewType, setViewType] = useState<ViewType>('daily');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedDate, setSelectedDate] = useState(fmtDate(new Date()));
  const [weekStart, setWeekStart] = useState(fmtDate(getMonday(new Date())));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
  const [filteredSections, setFilteredSections] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Pickers
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPickerAdmin, setShowMonthPickerAdmin] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Student data
  const [dailyData, setDailyData] = useState<DailyRecord[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryRecord[]>([]);
  // Staff data
  const [staffDailyData, setStaffDailyData] = useState<StaffDailyRecord[]>([]);
  const [staffSummaryData, setStaffSummaryData] = useState<StaffSummaryRecord[]>([]);

  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Notifications (daily student view only)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [sendingNotif, setSendingNotif] = useState(false);

  // History modal
  const [historyModal, setHistoryModal] = useState(false);
  const [studentHistory, setStudentHistory] = useState<StudentHistory | null>(null);
  const [staffHistoryData, setStaffHistoryData] = useState<StaffHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manual attendance modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSearchText, setManualSearchText] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualForm, setManualForm] = useState({
    person_id: 0,
    person_display: '',
    attendance_date: fmtDate(new Date()),
    check_in_time: '',
    check_out_time: '',
    status: 'present',
    remarks: '',
    send_sms: false,
    send_whatsapp: false,
    update_existing: false,
  });
  const [savingManual, setSavingManual] = useState(false);

  // Mark bulk absent modal
  const [showBulkAbsentModal, setShowBulkAbsentModal] = useState(false);
  const [bulkAbsentSendSms, setBulkAbsentSendSms] = useState(false);
  const [markingAbsent, setMarkingAbsent] = useState(false);

  // Parent state
  const [monthData, setMonthData] = useState<ChildMonthAttendance[]>([]);
  const [parentMonth, setParentMonth] = useState(new Date().getMonth() + 1);
  const [parentYear, setParentYear] = useState(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Load classes & departments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!isParent) {
      loadClasses();
      loadDepartments();
    }
  }, [isParent]);

  const loadClasses = async () => {
    try {
      const data = await apiClient.get<any>(API_ENDPOINTS.CLASS_SECTIONS);
      const list = Array.isArray(data) ? data : (data.class_sections || []);
      const opts: ClassOption[] = list.map((cs: any) => ({ class_name: cs.class_name, section_name: cs.section_name }));
      setClasses(opts);
      setUniqueClasses([...new Set(opts.map((c) => c.class_name))]);
    } catch (err) { console.error('Error loading classes:', err); }
  };

  const loadDepartments = async () => {
    try {
      const data = await apiClient.get<any>(API_ENDPOINTS.DEPARTMENTS);
      const list = Array.isArray(data) ? data : (data.departments || data.data || []);
      setDepartments(list.map((d: any) => d.name || d));
    } catch (err) { console.error('Error loading departments:', err); }
  };

  useEffect(() => {
    if (selectedClass) {
      const secs = classes.filter((c) => c.class_name === selectedClass).map((c) => c.section_name).filter((v, i, a) => a.indexOf(v) === i);
      setFilteredSections(secs);
      setSelectedSection('');
    } else { setFilteredSections([]); setSelectedSection(''); }
  }, [selectedClass]);

  // Reset page on filter/tab change
  useEffect(() => { setPage(1); setSelectedStudentIds(new Set()); }, [activeTab, viewType, selectedDate, weekStart, selectedMonth, selectedYear, selectedClass, selectedSection, selectedDepartment, statusFilter, searchText]);

  // Load data
  useEffect(() => {
    if (isParent) fetchParentAttendance();
    else if (activeTab === 'students') loadStudentData();
    else loadStaffData();
  }, [
    isParent,
    isParent ? `${parentMonth}-${parentYear}` : null,
    !isParent ? activeTab : null,
    !isParent ? viewType : null,
    !isParent ? page : null,
    !isParent ? selectedDate : null,
    !isParent ? weekStart : null,
    !isParent ? selectedMonth : null,
    !isParent ? selectedYear : null,
    !isParent ? selectedClass : null,
    !isParent ? selectedSection : null,
    !isParent ? selectedDepartment : null,
    !isParent ? statusFilter : null,
    !isParent ? searchText : null,
  ]);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Student data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadStudentData = async () => {
    if (page === 1) setLoading(true); else setLoadingMore(true);
    try {
      const cp = selectedClass ? `&class_name=${encodeURIComponent(selectedClass)}` : '';
      const sp = selectedSection ? `&section_name=${encodeURIComponent(selectedSection)}` : '';
      const srch = searchText ? `&search=${encodeURIComponent(searchText)}` : '';
      const sf = statusFilter ? `&status_filter=${statusFilter}` : '';
      const pg = `&page=${page}&page_size=${PAGE_SIZE}`;

      let url = '';
      switch (viewType) {
        case 'daily':
          url = `${API_ENDPOINTS.ATTENDANCE_DAILY}?attendance_date=${selectedDate}${cp}${sp}${srch}${sf}${pg}`;
          break;
        case 'weekly':
          url = `${API_ENDPOINTS.ATTENDANCE_SUMMARY}/weekly?week_start_date=${weekStart}${cp}${sp}${srch}${pg}`;
          break;
        case 'monthly':
          url = `${API_ENDPOINTS.ATTENDANCE_SUMMARY}/monthly?year=${selectedYear}&month=${selectedMonth}${cp}${sp}${srch}${pg}`;
          break;
        case 'yearly':
          url = `${API_ENDPOINTS.ATTENDANCE_SUMMARY}/yearly?year=${selectedYear}${cp}${sp}${srch}${pg}`;
          break;
        case 'overall':
          url = `${API_ENDPOINTS.ATTENDANCE_SUMMARY}/overall?x=1${cp}${sp}${srch}${pg}`;
          break;
      }
      const resp = await apiClient.get<any>(url);
      if (viewType === 'daily') setDailyData(prev => page === 1 ? (resp.data || []) : [...prev, ...(resp.data || [])]);
      else setSummaryData(prev => page === 1 ? (resp.data || []) : [...prev, ...(resp.data || [])]);
      setSummaryStats(resp.summary || null);
      setTotalPages(resp.total_pages || 1);
      setTotalRecords(resp.total || 0);
    } catch (error) { console.error('Failed to load student attendance:', error); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Staff data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const loadStaffData = async () => {
    if (page === 1) setLoading(true); else setLoadingMore(true);
    try {
      const dept = selectedDepartment ? `&department=${encodeURIComponent(selectedDepartment)}` : '';
      const srch = searchText ? `&search=${encodeURIComponent(searchText)}` : '';
      const sf = statusFilter ? `&status_filter=${statusFilter}` : '';
      const pg = `&page=${page}&page_size=${PAGE_SIZE}`;

      let url = '';
      switch (viewType) {
        case 'daily':
          url = `${API_ENDPOINTS.STAFF_ATTENDANCE_DAILY}?attendance_date=${selectedDate}${dept}${srch}${sf}${pg}`;
          break;
        case 'weekly':
          url = `${API_ENDPOINTS.STAFF_ATTENDANCE_SUMMARY}/weekly?week_start_date=${weekStart}${dept}${srch}${pg}`;
          break;
        case 'monthly':
          url = `${API_ENDPOINTS.STAFF_ATTENDANCE_SUMMARY}/monthly?year=${selectedYear}&month=${selectedMonth}${dept}${srch}${pg}`;
          break;
        case 'yearly':
          url = `${API_ENDPOINTS.STAFF_ATTENDANCE_SUMMARY}/yearly?year=${selectedYear}${dept}${srch}${pg}`;
          break;
        case 'overall':
          url = `${API_ENDPOINTS.STAFF_ATTENDANCE_SUMMARY}/overall?x=1${dept}${srch}${pg}`;
          break;
      }
      const resp = await apiClient.get<any>(url);
      if (viewType === 'daily') setStaffDailyData(prev => page === 1 ? (resp.data || []) : [...prev, ...(resp.data || [])]);
      else setStaffSummaryData(prev => page === 1 ? (resp.data || []) : [...prev, ...(resp.data || [])]);
      setSummaryStats(resp.summary || null);
      setTotalPages(resp.total_pages || 1);
      setTotalRecords(resp.total || 0);
    } catch (error) { console.error('Failed to load staff attendance:', error); }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Student history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const viewStudentHistoryFn = async (studentId: number) => {
    setHistoryLoading(true);
    setHistoryModal(true);
    setStaffHistoryData(null);
    try {
      const yp = `?year=${selectedYear}`;
      const mp = viewType === 'monthly' ? `&month=${selectedMonth}` : '';
      const data = await apiClient.get<StudentHistory>(
        `${API_ENDPOINTS.ATTENDANCE_STUDENT_HISTORY(studentId)}${yp}${mp}`
      );
      setStudentHistory(data);
    } catch (err) { console.error('Failed to load student history:', err); }
    finally { setHistoryLoading(false); }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Staff history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const viewStaffHistoryFn = async (staffId: number) => {
    setHistoryLoading(true);
    setHistoryModal(true);
    setStudentHistory(null);
    try {
      const yp = `?year=${selectedYear}`;
      const mp = viewType === 'monthly' ? `&month=${selectedMonth}` : '';
      const data = await apiClient.get<StaffHistory>(
        `${API_ENDPOINTS.STAFF_ATTENDANCE_HISTORY(staffId)}${yp}${mp}`
      );
      setStaffHistoryData(data);
    } catch (err) { console.error('Failed to load staff history:', err); }
    finally { setHistoryLoading(false); }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const toggleStudentSelect = (id: number) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const eligible = dailyData.filter((d) => !d.sms_sent || !d.whatsapp_sent);
    if (selectedStudentIds.size === eligible.length && eligible.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(eligible.map((d) => d.student_id)));
    }
  };

  const sendNotifications = async (channel: 'sms' | 'whatsapp' | 'both') => {
    if (selectedStudentIds.size === 0) return;
    setSendingNotif(true);
    try {
      const resp = await apiClient.post<any>(API_ENDPOINTS.ATTENDANCE_SEND_NOTIFICATIONS, {
        student_ids: Array.from(selectedStudentIds),
        attendance_date: selectedDate,
        channels: channel,
      });
      Alert.alert('Success', resp.message || `Sent to ${selectedStudentIds.size} students`);
      setSelectedStudentIds(new Set());
      loadStudentData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send notifications');
    } finally { setSendingNotif(false); }
  };

  // ────────────────── Manual attendance ──────────────────

  const openManualModal = () => {
    setManualForm({
      person_id: 0, person_display: '', attendance_date: selectedDate,
      check_in_time: '', check_out_time: '', status: 'present',
      remarks: '', send_sms: false, send_whatsapp: false, update_existing: false,
    });
    setManualSearchText('');
    setManualSearchResults([]);
    setShowManualModal(true);
  };

  const searchPersonForManual = async (text: string) => {
    setManualSearchText(text);
    if (text.length < 2) { setManualSearchResults([]); return; }
    setManualSearching(true);
    try {
      if (activeTab === 'students') {
        const resp = await apiClient.get<any>(`${API_ENDPOINTS.STUDENTS}?search=${encodeURIComponent(text)}&page=1&page_size=10`);
        const list = resp.students || resp.data || [];
        setManualSearchResults(list.map((s: any) => ({
          id: s.id || s.student_id,
          name: s.name || s.student_name || `${s.first_name || ''} ${s.surname || ''}`.trim() || s.admission_number,
          sub: `${s.admission_number || s.roll_number || ''} | ${s.class_name || ''}${s.section_name ? ' - ' + s.section_name : ''}`,
          mobile: s.mobile_number || s.mobile || '',
        })));
      } else {
        const resp = await apiClient.get<any>(`${API_ENDPOINTS.STAFF}?search=${encodeURIComponent(text)}`);
        const list = Array.isArray(resp) ? resp : (resp.staff || resp.data || []);
        setManualSearchResults(list.slice(0, 10).map((s: any) => ({
          id: s.id || s.staff_id,
          name: s.name || s.staff_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.employee_id,
          sub: `${s.employee_id || ''} | ${s.designation || ''}${s.department_name ? ' | ' + s.department_name : ''}`,
          mobile: s.mobile || '',
        })));
      }
    } catch (err) { console.error('Search error:', err); }
    finally { setManualSearching(false); }
  };

  const selectPersonForManual = (person: any) => {
    setManualForm((f) => ({ ...f, person_id: person.id, person_display: `${person.name} (${person.sub})` }));
    setManualSearchText('');
    setManualSearchResults([]);
  };

  const saveManualAttendance = async () => {
    if (!manualForm.person_id) { Alert.alert('Error', `Please select a ${activeTab === 'students' ? 'student' : 'staff member'}`); return; }
    setSavingManual(true);
    try {
      if (activeTab === 'students') {
        await apiClient.post<any>(API_ENDPOINTS.ATTENDANCE_MANUAL_ENTRY, {
          student_id: manualForm.person_id,
          attendance_date: manualForm.attendance_date,
          check_in_time: manualForm.check_in_time || undefined,
          check_out_time: manualForm.check_out_time || undefined,
          status: manualForm.status,
          remarks: manualForm.remarks || undefined,
          send_sms: manualForm.send_sms,
          send_whatsapp: manualForm.send_whatsapp,
          update_existing: manualForm.update_existing,
        });
      } else {
        const params = new URLSearchParams();
        params.append('staff_id', String(manualForm.person_id));
        params.append('attendance_date', manualForm.attendance_date);
        if (manualForm.check_in_time) params.append('check_in_time', manualForm.check_in_time);
        if (manualForm.check_out_time) params.append('check_out_time', manualForm.check_out_time);
        params.append('staff_status', manualForm.status);
        if (manualForm.remarks) params.append('remarks', manualForm.remarks);
        params.append('update_existing', String(manualForm.update_existing));
        await apiClient.post<any>(`${API_ENDPOINTS.STAFF_ATTENDANCE_MANUAL_ENTRY}?${params.toString()}`, {});
      }
      Alert.alert('Success', 'Attendance saved successfully');
      setShowManualModal(false);
      if (activeTab === 'students') loadStudentData(); else loadStaffData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to save attendance');
    } finally { setSavingManual(false); }
  };

  // ────────────────── Bulk absent ──────────────────

  const markBulkAbsent = async () => {
    setMarkingAbsent(true);
    try {
      let url = '';
      if (activeTab === 'students') {
        const params = [`attendance_date=${selectedDate}`];
        if (selectedClass) params.push(`class_name=${encodeURIComponent(selectedClass)}`);
        if (selectedSection) params.push(`section_name=${encodeURIComponent(selectedSection)}`);
        if (bulkAbsentSendSms) params.push('send_sms=true');
        url = `${API_ENDPOINTS.ATTENDANCE_MARK_BULK_ABSENT}?${params.join('&')}`;
      } else {
        const params = [`attendance_date=${selectedDate}`];
        if (selectedDepartment) params.push(`department=${encodeURIComponent(selectedDepartment)}`);
        url = `${API_ENDPOINTS.STAFF_ATTENDANCE_MARK_BULK_ABSENT}?${params.join('&')}`;
      }
      const resp = await apiClient.post<any>(url, {});
      Alert.alert('Success', resp.message || `Marked ${resp.absent_count || 0} as absent`);
      setShowBulkAbsentModal(false);
      if (activeTab === 'students') loadStudentData(); else loadStaffData();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to mark absent');
    } finally { setMarkingAbsent(false); }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Parent data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const fetchParentAttendance = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<any>(`${API_ENDPOINTS.MY_CHILDREN_ATTENDANCE}?month=${parentMonth}&year=${parentYear}`);
      setMonthData(data.students || []);
    } catch (error) { console.error('Failed to fetch attendance:', error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const changeParentMonth = (delta: number) => {
    let m = parentMonth + delta; let y = parentYear;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    setParentMonth(m); setParentYear(y);
  };

  const changeDate = (delta: number) => { const d = new Date(selectedDate); d.setDate(d.getDate() + delta); setSelectedDate(fmtDate(d)); };
  const changeWeek = (delta: number) => { const d = new Date(weekStart); d.setDate(d.getDate() + delta * 7); setWeekStart(fmtDate(d)); };
  const onRefresh = () => {
    setRefreshing(true);
    if (isParent) { fetchParentAttendance(); return; }
    if (page !== 1) { setPage(1); return; }
    if (activeTab === 'students') loadStudentData(); else loadStaffData();
  };

  const stats = summaryStats
    ? { total: totalRecords, present: summaryStats.present, absent: summaryStats.absent, late: summaryStats.late, percentage: Math.round(summaryStats.percentage) }
    : { total: totalRecords, present: 0, absent: 0, late: 0, percentage: 0 };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• PARENT VIEW â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  if (isParent) {
    const getDayColor = (status: string) => {
      switch (status) {
        case 'present': return COLORS.success;
        case 'absent': return COLORS.error;
        case 'late': return COLORS.warning;
        default: return '#e5e7eb';
      }
    };
    return (
      <View style={{ flex: 1 }}>
        <OfflineIndicator />
        <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={() => changeParentMonth(-1)} style={styles.arrowBtn}><Text style={styles.arrowText}>{'\u25C0'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMonthPicker(!showMonthPicker)}><Text style={styles.monthYearText}>{MONTHS[parentMonth - 1]} {parentYear}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => changeParentMonth(1)} style={styles.arrowBtn}><Text style={styles.arrowText}>{'\u25B6'}</Text></TouchableOpacity>
          </View>
          {showMonthPicker && (
            <View style={styles.monthPickerContainer}>
              <View style={styles.yearRow}>
                <TouchableOpacity onPress={() => setParentYear(parentYear - 1)}><Text style={styles.yearArrow}>{'\u25C0'}</Text></TouchableOpacity>
                <Text style={styles.yearText}>{parentYear}</Text>
                <TouchableOpacity onPress={() => setParentYear(parentYear + 1)}><Text style={styles.yearArrow}>{'\u25B6'}</Text></TouchableOpacity>
              </View>
              <View style={styles.monthGrid}>
                {MONTHS.map((m, idx) => (
                  <TouchableOpacity key={m} style={[styles.monthCell, idx + 1 === parentMonth && styles.monthCellActive]}
                    onPress={() => { setParentMonth(idx + 1); setShowMonthPicker(false); }}>
                    <Text style={[styles.monthCellText, idx + 1 === parentMonth && styles.monthCellTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {monthData.map((child) => (
            <View key={child.student_id} style={styles.childCard}>
              <View style={styles.childHeader}>
                <Text style={styles.childName}>{child.student_name}</Text>
                <Text style={styles.childClass}>{child.class_name} | {child.admission_number}</Text>
              </View>
              <View style={styles.pillRow}>
                <View style={[styles.pill, { backgroundColor: COLORS.success }]}><Text style={styles.pillText}>P: {child.summary.present}</Text></View>
                <View style={[styles.pill, { backgroundColor: COLORS.error }]}><Text style={styles.pillText}>A: {child.summary.absent}</Text></View>
                <View style={[styles.pill, { backgroundColor: COLORS.warning }]}><Text style={styles.pillText}>L: {child.summary.late}</Text></View>
                <View style={[styles.pill, { backgroundColor: COLORS.info }]}><Text style={styles.pillText}>{child.summary.total_days > 0 ? Math.round(((child.summary.present + child.summary.late) / child.summary.total_days) * 100) : 0}%</Text></View>
              </View>
              <View style={styles.dayGrid}>
                {child.days.map((day) => (
                  <View key={day.day} style={styles.dayCell}>
                    <Text style={styles.dayWeekday}>{day.weekday}</Text>
                    <View style={[styles.dayCircle, { backgroundColor: getDayColor(day.status) }]}>
                      <Text style={[styles.dayNumber, { color: day.status === 'not_marked' ? COLORS.textSecondary : '#fff' }]}>{day.day}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.legendRow}>
                {[{ l: 'Present', c: COLORS.success }, { l: 'Absent', c: COLORS.error }, { l: 'Late', c: COLORS.warning }, { l: 'N/A', c: '#e5e7eb' }].map((x) => (
                  <View key={x.l} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: x.c }]} /><Text style={styles.legendText}>{x.l}</Text></View>
                ))}
              </View>
            </View>
          ))}
          {monthData.length === 0 && !loading && (
            <View style={styles.emptyContainer}><Text style={styles.emptyText}>No children linked to your account</Text></View>
          )}
        </ScrollView>
        {loading && <View style={styles.loadingOverlay}><ActivityIndicator size="large" color={COLORS.primary} /></View>}
      </View>
    );
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ADMIN VIEW â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // â”€â”€ Students/Staff tabs â”€â”€
  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={[styles.tabBtn, activeTab === 'students' && styles.tabBtnActive]} onPress={() => setActiveTab('students')}>
        <Text style={[styles.tabBtnText, activeTab === 'students' && styles.tabBtnTextActive]}>Students</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tabBtn, activeTab === 'staff' && styles.tabBtnActive]} onPress={() => setActiveTab('staff')}>
        <Text style={[styles.tabBtnText, activeTab === 'staff' && styles.tabBtnTextActive]}>Staff</Text>
      </TouchableOpacity>
    </View>
  );

  // â”€â”€ View type tabs â”€â”€
  const renderViewTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.viewTabs}>
      {VIEW_TYPES.map((v) => (
        <TouchableOpacity key={v.key} style={[styles.viewTab, viewType === v.key && styles.viewTabActive]} onPress={() => setViewType(v.key)}>
          <Text style={[styles.viewTabText, viewType === v.key && styles.viewTabTextActive]}>{v.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // â”€â”€ Date / Period selector â”€â”€
  const renderDateSelector = () => {
    if (viewType === 'daily') {
      const d = new Date(selectedDate);
      return (
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>{'\u25C0'}</Text></TouchableOpacity>
          <Text style={styles.dateLabel}>{d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>{'\u25B6'}</Text></TouchableOpacity>
        </View>
      );
    }
    if (viewType === 'weekly') {
      const ws = new Date(weekStart); const we = new Date(ws); we.setDate(ws.getDate() + 5);
      return (
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={() => changeWeek(-1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>{'\u25C0'}</Text></TouchableOpacity>
          <Text style={styles.dateLabel}>{ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => changeWeek(1)} style={styles.dateArrow}><Text style={styles.dateArrowText}>{'\u25B6'}</Text></TouchableOpacity>
        </View>
      );
    }
    if (viewType === 'monthly') {
      return (
        <View style={styles.periodRow}>
          <TouchableOpacity style={styles.periodButton} onPress={() => setShowYearPicker(true)}>
            <Text style={styles.periodButtonText}>{selectedYear}</Text><Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodButton} onPress={() => setShowMonthPickerAdmin(true)}>
            <Text style={styles.periodButtonText}>{FULL_MONTHS[selectedMonth - 1]}</Text><Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (viewType === 'yearly') {
      return (
        <View style={styles.periodRow}>
          <TouchableOpacity style={[styles.periodButton, { flex: 1 }]} onPress={() => setShowYearPicker(true)}>
            <Text style={styles.periodButtonText}>Year: {selectedYear}</Text><Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  // â”€â”€ Filters â”€â”€
  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <View style={styles.filterRow}>
        {activeTab === 'students' ? (
          <>
            <TouchableOpacity style={[styles.filterButton, selectedClass ? styles.filterButtonActive : null]} onPress={() => setShowClassPicker(true)}>
              <Text style={[styles.filterBtnText, selectedClass ? styles.filterBtnTextActive : null]}>{selectedClass || 'All Classes'}</Text>
              <Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.filterButton, selectedSection ? styles.filterButtonActive : null, !selectedClass && styles.filterDisabled]}
              onPress={() => selectedClass && setShowSectionPicker(true)} disabled={!selectedClass}>
              <Text style={[styles.filterBtnText, selectedSection ? styles.filterBtnTextActive : null]}>{selectedSection || 'All Sections'}</Text>
              <Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.filterButton, { flex: 1 }, selectedDepartment ? styles.filterButtonActive : null]} onPress={() => setShowDeptPicker(true)}>
            <Text style={[styles.filterBtnText, selectedDepartment ? styles.filterBtnTextActive : null]}>{selectedDepartment || 'All Departments'}</Text>
            <Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.filterRow}>
        <View style={[styles.searchWrap, { flex: 1 }]}>
          <TextInput style={styles.searchInput} placeholder={activeTab === 'students' ? 'Search name, admission no, RFID...' : 'Search name, employee ID...'}
            placeholderTextColor={COLORS.textSecondary} value={searchText} onChangeText={setSearchText} />
          {searchText.length > 0 && <TouchableOpacity style={styles.clearSearch} onPress={() => setSearchText('')}><Text style={styles.clearSearchText}>X</Text></TouchableOpacity>}
        </View>
        {viewType === 'daily' && (
          <TouchableOpacity style={[styles.filterButton, { flex: 0.5, marginLeft: 8 }, statusFilter ? styles.filterButtonActive : null]}
            onPress={() => setShowStatusPicker(true)}>
            <Text style={[styles.filterBtnText, statusFilter ? styles.filterBtnTextActive : null]}>{statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'Status'}</Text>
            <Text style={styles.dropdownIcon}>{'\u25BC'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // â”€â”€ Summary stat cards â”€â”€
  const renderStats = () => (
    <View style={styles.statsRow}>
      <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}><Text style={[styles.statValue, { color: COLORS.primary }]}>{stats.total}</Text><Text style={styles.statLabel}>Total</Text></View>
      <View style={[styles.statCard, { backgroundColor: '#ECFDF5' }]}><Text style={[styles.statValue, { color: COLORS.success }]}>{stats.present}</Text><Text style={styles.statLabel}>Present</Text></View>
      <View style={[styles.statCard, { backgroundColor: '#FEF2F2' }]}><Text style={[styles.statValue, { color: COLORS.error }]}>{stats.absent}</Text><Text style={styles.statLabel}>Absent</Text></View>
      <View style={[styles.statCard, { backgroundColor: '#FFFBEB' }]}><Text style={[styles.statValue, { color: COLORS.warning }]}>{stats.late}</Text><Text style={styles.statLabel}>Late</Text></View>
      <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}><Text style={[styles.statValue, { color: COLORS.info }]}>{stats.percentage}%</Text><Text style={styles.statLabel}>Rate</Text></View>
    </View>
  );

  // â”€â”€ Notification bar (daily student view) â”€â”€
  const renderNotificationBar = () => {
    if (activeTab !== 'students' || viewType !== 'daily' || selectedStudentIds.size === 0) return null;
    return (
      <View style={styles.notifBar}>
        <Text style={styles.notifBarText}>{selectedStudentIds.size} student{selectedStudentIds.size > 1 ? 's' : ''} selected</Text>
        <View style={styles.notifBtnRow}>
          <TouchableOpacity style={[styles.notifSendBtn, { backgroundColor: '#2563eb' }]} onPress={() => sendNotifications('sms')} disabled={sendingNotif}>
            <Text style={styles.notifSendBtnText}>SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.notifSendBtn, { backgroundColor: '#16a34a' }]} onPress={() => sendNotifications('whatsapp')} disabled={sendingNotif}>
            <Text style={styles.notifSendBtnText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.notifSendBtn, { backgroundColor: '#7c3aed' }]} onPress={() => sendNotifications('both')} disabled={sendingNotif}>
            <Text style={styles.notifSendBtnText}>Both</Text>
          </TouchableOpacity>
        </View>
        {sendingNotif && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />}
      </View>
    );
  };

  // â”€â”€ Select all header for daily student view â”€â”€
  // Action buttons (Manual + Mark Absent) - daily view only
  const renderActionButtons = () => {
    if (viewType !== 'daily') return null;
    return (
      <View style={styles.actionBtnRow}>
        <TouchableOpacity style={styles.actionBtnManual} onPress={openManualModal}>
          <Text style={styles.actionBtnText}>+ {activeTab === 'students' ? 'Manual Attendance' : 'Staff Attendance'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnAbsent} onPress={() => { setBulkAbsentSendSms(false); setShowBulkAbsentModal(true); }}>
          <Text style={styles.actionBtnText}>{activeTab === 'students' ? 'Mark Absent & Notify' : 'Mark Staff Absent'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSelectAllHeader = () => {
    if (activeTab !== 'students' || viewType !== 'daily') return null;
    const eligible = dailyData.filter((d) => !d.sms_sent || !d.whatsapp_sent);
    if (eligible.length === 0) return null;
    const allSelected = selectedStudentIds.size === eligible.length && eligible.length > 0;
    return (
      <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll}>
        <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
          {allSelected && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
        </View>
        <Text style={styles.selectAllText}>Select All ({eligible.length})</Text>
      </TouchableOpacity>
    );
  };

  // â”€â”€ Daily student card â”€â”€
  const renderDailyItem = ({ item }: { item: DailyRecord }) => {
    const canSelect = !item.sms_sent || !item.whatsapp_sent;
    const isSelected = selectedStudentIds.has(item.student_id);
    return (
      <TouchableOpacity style={styles.card} onPress={() => viewStudentHistoryFn(item.student_id)}>
        <View style={styles.cardTop}>
          {canSelect && (
            <TouchableOpacity style={{ marginRight: 10 }} onPress={(e) => { e.stopPropagation(); toggleStudentSelect(item.student_id); }}>
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
              </View>
            </TouchableOpacity>
          )}
          {!canSelect && <View style={styles.sentIndicator}><Text style={styles.sentIndicatorText}>{'\u2714'}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.student_name}</Text>
            <Text style={styles.cardSub}>{item.admission_number} | {item.class_name}{item.section_name ? ` - ${item.section_name}` : ''}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.timeBlock}><Text style={styles.timeLabel}>In</Text><Text style={styles.timeValue}>{formatTime(item.check_in_time)}</Text></View>
          <View style={styles.timeBlock}><Text style={styles.timeLabel}>Out</Text><Text style={styles.timeValue}>{formatTime(item.check_out_time)}</Text></View>
          {item.is_manual_entry && <View style={styles.manualBadge}><Text style={styles.manualBadgeText}>Manual</Text></View>}
          {item.sms_sent && <View style={styles.sentBadge}><Text style={styles.sentBadgeText}>SMS Sent</Text></View>}
          {item.whatsapp_sent && <View style={[styles.sentBadge, { backgroundColor: '#dcfce7' }]}><Text style={[styles.sentBadgeText, { color: '#166534' }]}>WA Sent</Text></View>}
          {!item.sms_sent && <View style={[styles.sentBadge, { backgroundColor: '#fef2f2' }]}><Text style={[styles.sentBadgeText, { color: COLORS.error }]}>SMS</Text></View>}
          {!item.whatsapp_sent && <View style={[styles.sentBadge, { backgroundColor: '#fef2f2' }]}><Text style={[styles.sentBadgeText, { color: COLORS.error }]}>WA</Text></View>}
        </View>
      </TouchableOpacity>
    );
  };

  // â”€â”€ Daily staff card â”€â”€
  const renderStaffDailyItem = ({ item }: { item: StaffDailyRecord }) => (
    <TouchableOpacity style={styles.card} onPress={() => viewStaffHistoryFn(item.staff_id)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.staff_name}</Text>
          <Text style={styles.cardSub}>{item.employee_id}{item.designation ? ` | ${item.designation}` : ''}{item.department_name ? ` | ${item.department_name}` : ''}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.timeBlock}><Text style={styles.timeLabel}>In</Text><Text style={styles.timeValue}>{formatTime(item.check_in_time)}</Text></View>
        <View style={styles.timeBlock}><Text style={styles.timeLabel}>Out</Text><Text style={styles.timeValue}>{formatTime(item.check_out_time)}</Text></View>
        {item.is_manual_entry && <View style={styles.manualBadge}><Text style={styles.manualBadgeText}>Manual</Text></View>}
      </View>
    </TouchableOpacity>
  );

  // â”€â”€ Summary student card â”€â”€
  const renderSummaryItem = ({ item }: { item: SummaryRecord }) => (
    <TouchableOpacity style={styles.card} onPress={() => viewStudentHistoryFn(item.student_id)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.student_name}</Text>
          <Text style={styles.cardSub}>{item.admission_number} | {item.class_name}{item.section_name ? ` - ${item.section_name}` : ''}</Text>
        </View>
      </View>
      <View style={styles.summaryStatsRow}>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Days</Text><Text style={styles.summaryStatVal}>{item.total_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Present</Text><Text style={[styles.summaryStatVal, { color: COLORS.success }]}>{item.present_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Absent</Text><Text style={[styles.summaryStatVal, { color: COLORS.error }]}>{item.absent_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Late</Text><Text style={[styles.summaryStatVal, { color: COLORS.warning }]}>{item.late_days}</Text></View>
      </View>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${Math.min(item.attendance_percentage, 100)}%`, backgroundColor: getPercentageColor(item.attendance_percentage) }]} /></View>
        <Text style={[styles.percentText, { color: getPercentageColor(item.attendance_percentage) }]}>{item.attendance_percentage.toFixed(1)}%</Text>
      </View>
    </TouchableOpacity>
  );

  // â”€â”€ Summary staff card â”€â”€
  const renderStaffSummaryItem = ({ item }: { item: StaffSummaryRecord }) => (
    <TouchableOpacity style={styles.card} onPress={() => viewStaffHistoryFn(item.staff_id)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{item.staff_name}</Text>
          <Text style={styles.cardSub}>{item.employee_id}{item.designation ? ` | ${item.designation}` : ''}{item.department_name ? ` | ${item.department_name}` : ''}</Text>
        </View>
      </View>
      <View style={styles.summaryStatsRow}>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Days</Text><Text style={styles.summaryStatVal}>{item.total_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Present</Text><Text style={[styles.summaryStatVal, { color: COLORS.success }]}>{item.present_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Absent</Text><Text style={[styles.summaryStatVal, { color: COLORS.error }]}>{item.absent_days}</Text></View>
        <View style={styles.summaryStatItem}><Text style={styles.summaryStatLabel}>Late</Text><Text style={[styles.summaryStatVal, { color: COLORS.warning }]}>{item.late_days}</Text></View>
      </View>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${Math.min(item.attendance_percentage, 100)}%`, backgroundColor: getPercentageColor(item.attendance_percentage) }]} /></View>
        <Text style={[styles.percentText, { color: getPercentageColor(item.attendance_percentage) }]}>{item.attendance_percentage.toFixed(1)}%</Text>
      </View>
    </TouchableOpacity>
  );

  // â”€â”€ Pagination â”€â”€
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <View style={styles.paginationRow}>
        <TouchableOpacity style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]} onPress={() => page > 1 && setPage(page - 1)} disabled={page <= 1}>
          <Text style={styles.pageBtnText}>{'◀'} Prev</Text>
        </TouchableOpacity>
        <Text style={styles.pageInfo}>Page {page} / {totalPages} ({totalRecords})</Text>
        <TouchableOpacity style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]} onPress={() => page < totalPages && setPage(page + 1)} disabled={page >= totalPages}>
          <Text style={styles.pageBtnText}>Next {'▶'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // â”€â”€ Picker modal â”€â”€
  const renderPickerModal = (visible: boolean, onClose: () => void, title: string, options: { label: string; value: string }[], onSelect: (v: string) => void, current: string) => (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModal}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.pickerClose}>X</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.pickerList}>
            <TouchableOpacity style={[styles.pickerItem, !current && styles.pickerItemActive]} onPress={() => { onSelect(''); onClose(); }}>
              <Text style={[styles.pickerItemText, !current && styles.pickerItemTextActive]}>All {title}</Text>
            </TouchableOpacity>
            {options.map((opt) => (
              <TouchableOpacity key={opt.value} style={[styles.pickerItem, current === opt.value && styles.pickerItemActive]} onPress={() => { onSelect(opt.value); onClose(); }}>
                <Text style={[styles.pickerItemText, current === opt.value && styles.pickerItemTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // â”€â”€ History modal â”€â”€
  const histData = studentHistory || staffHistoryData;
  const histPerson = studentHistory?.student || staffHistoryData?.staff;
  const histSummary = histData?.summary;
  const histRecords = histData?.history || [];
  const histSubtitle = studentHistory
    ? `${studentHistory.student.admission_number} | ${studentHistory.student.class_name}${studentHistory.student.section_name ? ` - ${studentHistory.student.section_name}` : ''}`
    : staffHistoryData
      ? `${staffHistoryData.staff.employee_id}${staffHistoryData.staff.designation ? ` | ${staffHistoryData.staff.designation}` : ''}${staffHistoryData.staff.department_name ? ` | ${staffHistoryData.staff.department_name}` : ''}`
      : '';

  const renderHistoryModal = () => (
    <Modal visible={historyModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.pickerModal, { maxHeight: '85%' }]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{activeTab === 'students' ? 'Student' : 'Staff'} Attendance History</Text>
            <TouchableOpacity onPress={() => { setHistoryModal(false); setStudentHistory(null); setStaffHistoryData(null); }}><Text style={styles.pickerClose}>X</Text></TouchableOpacity>
          </View>
          {historyLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ padding: 40 }} />
          ) : histPerson ? (
            <ScrollView style={{ padding: 16 }}>
              <View style={styles.historyStudentInfo}>
                <Text style={styles.historyName}>{(histPerson as any).name}</Text>
                <Text style={styles.historySub}>{histSubtitle}</Text>
              </View>
              <View style={styles.historySummaryRow}>
                <View style={[styles.historyStat, { backgroundColor: '#ECFDF5' }]}><Text style={[styles.historyStatVal, { color: COLORS.success }]}>{histSummary!.present_days}</Text><Text style={styles.historyStatLabel}>Present</Text></View>
                <View style={[styles.historyStat, { backgroundColor: '#FEF2F2' }]}><Text style={[styles.historyStatVal, { color: COLORS.error }]}>{histSummary!.absent_days}</Text><Text style={styles.historyStatLabel}>Absent</Text></View>
                <View style={[styles.historyStat, { backgroundColor: '#FFFBEB' }]}><Text style={[styles.historyStatVal, { color: COLORS.warning }]}>{histSummary!.late_days}</Text><Text style={styles.historyStatLabel}>Late</Text></View>
                <View style={[styles.historyStat, { backgroundColor: '#EFF6FF' }]}><Text style={[styles.historyStatVal, { color: COLORS.info }]}>{histSummary!.attendance_percentage.toFixed(1)}%</Text><Text style={styles.historyStatLabel}>Rate</Text></View>
              </View>
              <Text style={styles.historyListTitle}>Records ({histRecords.length})</Text>
              {histRecords.map((h, idx) => (
                <View key={idx} style={styles.historyItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>{new Date(h.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                    <Text style={styles.historyTime}>In: {formatTime(h.check_in_time)} | Out: {formatTime(h.check_out_time)}{h.is_manual ? ' (Manual)' : ''}</Text>
                    {h.remarks && <Text style={styles.historyRemarks}>{h.remarks}</Text>}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(h.status) }]}><Text style={styles.statusText}>{h.status.toUpperCase()}</Text></View>
                </View>
              ))}
              {histRecords.length === 0 && <Text style={styles.emptyText}>No records found</Text>}
              <View style={{ height: 20 }} />
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // â”€â”€ Determine list data & renderer â”€â”€
  const isDaily = viewType === 'daily';
  const isStudents = activeTab === 'students';

  const listData = isStudents
    ? (isDaily ? dailyData : summaryData)
    : (isDaily ? staffDailyData : staffSummaryData);

  const renderItem = isStudents
    ? (isDaily ? renderDailyItem : renderSummaryItem)
    : (isDaily ? renderStaffDailyItem : renderStaffSummaryItem);

  const keyExtractor = isStudents
    ? (isDaily ? (item: any) => `${item.id || item.student_id}-${item.attendance_date}` : (item: any) => `${item.student_id}`)
    : (isDaily ? (item: any) => `${item.id || item.staff_id}-${item.attendance_date}` : (item: any) => `${item.staff_id}`);

  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <View style={styles.container}>
        {renderTabBar()}
        {renderViewTabs()}
        {renderDateSelector()}
        {renderFilters()}
        {renderStats()}
        {renderActionButtons()}
        {renderNotificationBar()}
        {renderSelectAllHeader()}

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : (
          <FlatList
            data={listData}
            renderItem={renderItem as any}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyText}>No attendance records found</Text></View>}
            onEndReached={() => { if (!loading && !loadingMore && page < totalPages) setPage(p => p + 1); }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={COLORS.primary} style={{ paddingVertical: 16 }} /> : null}
          />
        )}
      </View>

      {renderPickerModal(showClassPicker, () => setShowClassPicker(false), 'Classes', uniqueClasses.map((c) => ({ label: c, value: c })), setSelectedClass, selectedClass)}
      {renderPickerModal(showSectionPicker, () => setShowSectionPicker(false), 'Sections', filteredSections.map((s) => ({ label: s, value: s })), setSelectedSection, selectedSection)}
      {renderPickerModal(showDeptPicker, () => setShowDeptPicker(false), 'Departments', departments.map((d) => ({ label: d, value: d })), setSelectedDepartment, selectedDepartment)}
      {renderPickerModal(showYearPicker, () => setShowYearPicker(false), 'Year', years.map((y) => ({ label: String(y), value: String(y) })), (v) => setSelectedYear(Number(v) || new Date().getFullYear()), String(selectedYear))}
      {renderPickerModal(showMonthPickerAdmin, () => setShowMonthPickerAdmin(false), 'Month', FULL_MONTHS.map((m, i) => ({ label: m, value: String(i + 1) })), (v) => setSelectedMonth(Number(v) || 1), String(selectedMonth))}
      {renderPickerModal(showStatusPicker, () => setShowStatusPicker(false), 'Status', STATUS_FILTERS.filter(s => s.value).map((s) => ({ label: s.label, value: s.value })), setStatusFilter, statusFilter)}
      {renderHistoryModal()}

      {/* Manual Attendance Modal */}
      <Modal visible={showManualModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, { maxHeight: '90%' }]}>
            <View style={[styles.pickerHeader, { backgroundColor: '#0d9488' }]}>
              <Text style={[styles.pickerTitle, { color: '#fff' }]}>
                {activeTab === 'students' ? 'Add Manual Attendance' : 'Add Staff Attendance'}
              </Text>
              <TouchableOpacity onPress={() => setShowManualModal(false)}>
                <Text style={[styles.pickerClose, { color: '#fff' }]}>X</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {/* Person search */}
              {!manualForm.person_id ? (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.formLabel}>{activeTab === 'students' ? 'Select Student *' : 'Select Staff *'}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={activeTab === 'students' ? 'Search by name or admission no...' : 'Search by name or employee ID...'}
                    placeholderTextColor={COLORS.textSecondary}
                    value={manualSearchText}
                    onChangeText={searchPersonForManual}
                  />
                  {manualSearching && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 8 }} />}
                  {manualSearchResults.map((p) => (
                    <TouchableOpacity key={p.id} style={styles.searchResultItem} onPress={() => selectPersonForManual(p)}>
                      <Text style={styles.searchResultName}>{p.name}</Text>
                      <Text style={styles.searchResultSub}>{p.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.selectedPersonBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedPersonText}>{manualForm.person_display}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setManualForm((f) => ({ ...f, person_id: 0, person_display: '' }))}>
                    <Text style={styles.changePersonText}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Date */}
              <Text style={styles.formLabel}>Date</Text>
              <TextInput style={styles.formInput} value={manualForm.attendance_date}
                onChangeText={(t) => setManualForm((f) => ({ ...f, attendance_date: t }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.textSecondary} />

              {/* Times row */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Check-in Time</Text>
                  <TextInput style={styles.formInput} value={manualForm.check_in_time}
                    onChangeText={(t) => setManualForm((f) => ({ ...f, check_in_time: t }))}
                    placeholder="HH:MM" placeholderTextColor={COLORS.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Check-out Time</Text>
                  <TextInput style={styles.formInput} value={manualForm.check_out_time}
                    onChangeText={(t) => setManualForm((f) => ({ ...f, check_out_time: t }))}
                    placeholder="HH:MM" placeholderTextColor={COLORS.textSecondary} />
                </View>
              </View>

              {/* Status */}
              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.statusPickerRow}>
                {['present', 'absent', 'late'].map((s) => (
                  <TouchableOpacity key={s} style={[styles.statusPickerBtn, manualForm.status === s && { backgroundColor: getStatusColor(s) }]}
                    onPress={() => setManualForm((f) => ({ ...f, status: s }))}>
                    <Text style={[styles.statusPickerText, manualForm.status === s && { color: '#fff' }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Remarks */}
              <Text style={styles.formLabel}>Remarks</Text>
              <TextInput style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                value={manualForm.remarks} onChangeText={(t) => setManualForm((f) => ({ ...f, remarks: t }))}
                placeholder="e.g. RFID card not working..." placeholderTextColor={COLORS.textSecondary}
                multiline numberOfLines={2} />

              {/* SMS/WhatsApp checkboxes (student only) */}
              {activeTab === 'students' && (
                <View style={styles.notifySection}>
                  <Text style={styles.notifySectionTitle}>Notify Parent</Text>
                  <TouchableOpacity style={styles.checkboxRow} onPress={() => setManualForm((f) => ({ ...f, send_sms: !f.send_sms }))}>
                    <View style={[styles.checkbox, manualForm.send_sms && styles.checkboxChecked]}>
                      {manualForm.send_sms && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Send SMS</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.checkboxRow} onPress={() => setManualForm((f) => ({ ...f, send_whatsapp: !f.send_whatsapp }))}>
                    <View style={[styles.checkbox, manualForm.send_whatsapp && styles.checkboxChecked]}>
                      {manualForm.send_whatsapp && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Send WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Update existing checkbox */}
              <View style={styles.updateExistingBox}>
                <TouchableOpacity style={styles.checkboxRow} onPress={() => setManualForm((f) => ({ ...f, update_existing: !f.update_existing }))}>
                  <View style={[styles.checkbox, manualForm.update_existing && styles.checkboxChecked]}>
                    {manualForm.update_existing && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Update if attendance already exists</Text>
                </TouchableOpacity>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 20 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowManualModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, !manualForm.person_id && { opacity: 0.5 }]}
                  onPress={saveManualAttendance} disabled={!manualForm.person_id || savingManual}>
                  {savingManual ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Attendance</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Mark Bulk Absent Modal */}
      <Modal visible={showBulkAbsentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, { maxHeight: '50%' }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {activeTab === 'students' ? 'Mark Absent Students' : 'Mark Absent Staff'}
              </Text>
              <TouchableOpacity onPress={() => setShowBulkAbsentModal(false)}>
                <Text style={styles.pickerClose}>X</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 }}>
                {activeTab === 'students'
                  ? "This will mark all students who haven't checked in today as absent."
                  : "This will mark all staff who haven't checked in today as absent."}
              </Text>

              {activeTab === 'students' && (
                <View style={styles.notifySection}>
                  <TouchableOpacity style={styles.checkboxRow} onPress={() => setBulkAbsentSendSms(!bulkAbsentSendSms)}>
                    <View style={[styles.checkbox, bulkAbsentSendSms && styles.checkboxChecked]}>
                      {bulkAbsentSendSms && <Text style={styles.checkboxTick}>{'\u2714'}</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Send SMS notification to parents</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.filterInfoBox}>
                <Text style={styles.filterInfoText}>Date: {selectedDate}</Text>
                {activeTab === 'students' && (
                  <>
                    <Text style={styles.filterInfoText}>Class: {selectedClass || 'All'}</Text>
                    <Text style={styles.filterInfoText}>Section: {selectedSection || 'All'}</Text>
                  </>
                )}
                {activeTab === 'staff' && (
                  <Text style={styles.filterInfoText}>Department: {selectedDepartment || 'All'}</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBulkAbsentModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#ea580c' }]}
                  onPress={markBulkAbsent} disabled={markingAbsent}>
                  {markingAbsent ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Mark Absent</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• STYLES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center' },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: COLORS.primary },
  tabBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  tabBtnTextActive: { color: COLORS.primary },

  // View tabs
  viewTabs: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8, paddingHorizontal: 8, flexGrow: 0 },
  viewTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginHorizontal: 4, backgroundColor: COLORS.background },
  viewTabActive: { backgroundColor: COLORS.primary },
  viewTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  viewTabTextActive: { color: '#fff' },

  // Date nav
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dateArrow: { padding: 8 },
  dateArrowText: { fontSize: 16, color: COLORS.primary, fontWeight: 'bold' },
  dateLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginHorizontal: 12 },

  // Period row
  periodRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  periodButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  periodButtonText: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  dropdownIcon: { fontSize: 10, color: COLORS.textSecondary, marginLeft: 6 },

  // Filters
  filtersContainer: { backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  filterButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  filterButtonActive: { borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },
  filterDisabled: { opacity: 0.5 },
  filterBtnText: { fontSize: 13, color: COLORS.textSecondary },
  filterBtnTextActive: { color: COLORS.primary, fontWeight: '600' },
  searchWrap: { position: 'relative' as const },
  searchInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: 10, paddingRight: 36, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  clearSearch: { position: 'absolute' as const, right: 10, top: 10, padding: 2 },
  clearSearchText: { fontSize: 16, color: COLORS.textSecondary },

  // Stats
  statsRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 10, gap: 6 },
  statCard: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500', marginTop: 2 },

  // Notification bar
  notifBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexWrap: 'wrap' },
  notifBarText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  notifBtnRow: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  notifSendBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  notifSendBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Select all
  selectAllRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  selectAllText: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxTick: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  sentIndicator: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  sentIndicatorText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  // Cards
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  timeBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  timeValue: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  manualBadge: { backgroundColor: '#e0e7ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  manualBadgeText: { fontSize: 10, color: '#3730a3', fontWeight: '600' },
  sentBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sentBadgeText: { fontSize: 10, color: '#1e40af', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  statusText: { fontSize: 11, fontWeight: 'bold', color: '#ffffff' },

  // Summary stats row
  summaryStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryStatItem: { alignItems: 'center' },
  summaryStatLabel: { fontSize: 10, color: COLORS.textSecondary },
  summaryStatVal: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  percentText: { fontSize: 13, fontWeight: '700', width: 52, textAlign: 'right' },

  // Pagination
  paginationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  pageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pageInfo: { fontSize: 12, color: COLORS.textSecondary },

  // List
  listContainer: { padding: 12 },
  emptyContainer: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary },

  // Picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerModal: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  pickerClose: { fontSize: 20, color: COLORS.textSecondary, padding: 4 },
  pickerList: { paddingHorizontal: 16, paddingBottom: 20 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerItemActive: { backgroundColor: '#EEF2FF', marginHorizontal: -16, paddingHorizontal: 16 },
  pickerItemText: { fontSize: 15, color: COLORS.text },
  pickerItemTextActive: { color: COLORS.primary, fontWeight: '700' },

  // History modal
  historyStudentInfo: { marginBottom: 16 },
  historyName: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  historySub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  historySummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  historyStat: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  historyStatVal: { fontSize: 18, fontWeight: '700' },
  historyStatLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  historyListTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  historyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyDate: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  historyTime: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  historyRemarks: { fontSize: 12, color: COLORS.warning, marginTop: 2, fontStyle: 'italic' },

  // Parent month-wise
  monthSelector: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 20 },
  arrowBtn: { padding: 8 },
  arrowText: { fontSize: 18, color: '#fff', fontWeight: 'bold' },
  monthYearText: { fontSize: 18, fontWeight: '700', color: '#fff', marginHorizontal: 20 },
  monthPickerContainer: { backgroundColor: COLORS.surface, margin: 12, borderRadius: 12, padding: 12, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  yearRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  yearArrow: { fontSize: 16, color: COLORS.primary, paddingHorizontal: 16 },
  yearText: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  monthCell: { width: '25%', paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  monthCellActive: { backgroundColor: COLORS.primary },
  monthCellText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  monthCellTextActive: { color: '#fff', fontWeight: '700' },
  childCard: { backgroundColor: COLORS.surface, margin: 12, marginTop: 0, borderRadius: 12, padding: 16, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  childHeader: { marginBottom: 12 },
  childName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  childClass: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  pillRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  pill: { flex: 1, borderRadius: 20, paddingVertical: 6, alignItems: 'center' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-start' },
  dayCell: { width: 40, alignItems: 'center', marginBottom: 6 },
  dayWeekday: { fontSize: 9, color: COLORS.textSecondary, marginBottom: 2 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  dayNumber: { fontSize: 12, fontWeight: '600' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: COLORS.textSecondary },

  // Action buttons
  actionBtnRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  actionBtnManual: { flex: 1, backgroundColor: '#0d9488', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  actionBtnAbsent: { flex: 1, backgroundColor: '#ea580c', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Manual form
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4, marginTop: 12 },
  formInput: { backgroundColor: COLORS.background, borderRadius: 8, padding: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  searchResultItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  searchResultName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  searchResultSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  selectedPersonBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#0d9488', borderRadius: 8, padding: 12, marginBottom: 8 },
  selectedPersonText: { fontSize: 14, fontWeight: '600', color: '#0d9488' },
  changePersonText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
  statusPickerRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusPickerBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  statusPickerText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  notifySection: { backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, marginTop: 12 },
  notifySectionTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af', marginBottom: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, gap: 10 },
  checkboxLabel: { fontSize: 14, color: COLORS.text },
  updateExistingBox: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 12, marginTop: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#0d9488' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  filterInfoBox: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginTop: 8 },
  filterInfoText: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 2 },
});

export default AttendanceScreen;
