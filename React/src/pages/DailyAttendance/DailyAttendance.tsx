import React, { useState, useEffect, useCallback } from 'react';
import attendanceService, { DailyAttendanceRecord, AttendanceLog, PaginatedResponse, ManualAttendanceEntry, StaffAttendanceRecord } from '../../services/attendanceService';
import { staffAttendanceService } from '../../services/attendanceService';
import deviceService, { AttendanceDevice, EasyTimeProStatus } from '../../services/deviceService';
import classSectionService, { ClassSection } from '../../services/classSectionService';
import api from '../../services/api';
import SmsRulesInfo from '../../components/SmsRulesInfo';

interface ClassOption {
  class_name: string;
  section_name: string;
}

interface StudentOption {
  id: number;
  first_name: string;
  surname: string | null;
  admission_number: string;
  class_name?: string;
  section_name?: string;
  mobile_number?: string;
  rfid_id?: string;
}

interface StaffOption {
  id: number;
  first_name: string;
  last_name: string | null;
  employee_id?: string;
  designation?: string;
  department_name?: string;
  mobile?: string;
}

type ActiveTab = 'students' | 'staff';

const DailyAttendance: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('students');
  const [attendanceRecords, setAttendanceRecords] = useState<DailyAttendanceRecord[]>([]);
  const [liveScans, setLiveScans] = useState<AttendanceLog[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);
  
  // Available classes from class-sections API
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [allClassSections, setAllClassSections] = useState<ClassSection[]>([]);
  
  // Mark absent modal
  const [showMarkAbsentModal, setShowMarkAbsentModal] = useState(false);
  const [sendSMS, setSendSMS] = useState(false);
  const [markingAbsent, setMarkingAbsent] = useState(false);

  // Inline status editing
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Checkbox selection for notifications
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [sendingNotifications, setSendingNotifications] = useState(false);

  // Manual Attendance Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualStudentSearch, setManualStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<StudentOption[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [manualForm, setManualForm] = useState({
    student_id: 0,
    student_display: '',
    attendance_date: new Date().toISOString().split('T')[0],
    check_in_time: '',
    check_out_time: '',
    status: 'present',
    remarks: '',
    send_sms: false,
    send_whatsapp: false,
    update_existing: false,
  });
  const [submittingManual, setSubmittingManual] = useState(false);

  // ===== Staff Attendance State =====
  const [staffRecords, setStaffRecords] = useState<StaffAttendanceRecord[]>([]);
  const [staffLiveScans, setStaffLiveScans] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSearchText, setStaffSearchText] = useState('');
  const [debouncedStaffSearch, setDebouncedStaffSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedStaffSearch(staffSearchText), 400);
    return () => clearTimeout(t);
  }, [staffSearchText]);
  const [staffStatusFilter, setStaffStatusFilter] = useState('');

  // Staff Manual Attendance Modal
  const [showStaffManualModal, setShowStaffManualModal] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [staffResults, setStaffResults] = useState<StaffOption[]>([]);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [staffManualForm, setStaffManualForm] = useState({
    staff_id: 0,
    staff_display: '',
    attendance_date: new Date().toISOString().split('T')[0],
    check_in_time: '',
    check_out_time: '',
    status: 'present',
    remarks: '',
    update_existing: false,
  });
  const [submittingStaffManual, setSubmittingStaffManual] = useState(false);

  // Staff Mark Absent Modal
  const [showStaffMarkAbsentModal, setShowStaffMarkAbsentModal] = useState(false);
  const [markingStaffAbsent, setMarkingStaffAbsent] = useState(false);

  // Summary stats from API (covers all students, not just current page)
  const [attendanceSummary, setAttendanceSummary] = useState<{
    present: number; absent: number; late: number; not_marked?: number; percentage: number;
  } | null>(null);

  // Staff Stats
  const staffStats = {
    total: staffRecords.length,
    present: staffRecords.filter(r => r.status === 'present' || r.status === 'late').length,
    absent: staffRecords.filter(r => r.status === 'absent').length,
    late: staffRecords.filter(r => r.status === 'late').length,
  };

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      const response = await attendanceService.getDailyAttendance({
        attendance_date: selectedDate,
        class_name: selectedClass || undefined,
        section_name: selectedSection || undefined,
        status_filter: statusFilter || undefined,
        search: debouncedSearch || undefined,
      });
      setAttendanceRecords(response.data);
      if (response.summary) setAttendanceSummary(response.summary);
      setError(null);
    } catch (err) {
      setError('Failed to fetch attendance data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedClass, selectedSection, statusFilter, debouncedSearch]);

  const fetchClassSections = useCallback(async () => {
    try {
      const sections = await classSectionService.listClassSections();
      setAllClassSections(sections);
      // Build unique sorted class options
      const uniqueClasses = new Map<string, ClassOption>();
      sections.forEach((cs: ClassSection) => {
        const key = `${cs.class_name}-${cs.section_name || ''}`;
        if (!uniqueClasses.has(key)) {
          uniqueClasses.set(key, {
            class_name: cs.class_name,
            section_name: cs.section_name || '',
          });
        }
      });
      setClassOptions(Array.from(uniqueClasses.values()));
    } catch (err) {
      console.error('Failed to fetch class sections', err);
    }
  }, []);

  const fetchLiveScans = useCallback(async () => {
    try {
      const data = await attendanceService.getLiveAttendance(10);
      setLiveScans(data);
    } catch (err) {
      console.error('Failed to fetch live scans', err);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await deviceService.getDevices(true);
      setDevices(data);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  }, []);

  // EasyTimePro server status
  const [etpStatus, setEtpStatus] = useState<EasyTimeProStatus | null>(null);

  const fetchEtpStatus = useCallback(async () => {
    try {
      const status = await deviceService.getEasyTimeProStatus();
      setEtpStatus(status);
    } catch {
      setEtpStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
    fetchDevices();
    fetchClassSections();
    fetchEtpStatus();
  }, [fetchAttendance, fetchDevices, fetchClassSections, fetchEtpStatus]);

  // Refresh ETP status periodically
  useEffect(() => {
    const interval = setInterval(fetchEtpStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchEtpStatus]);

  // Poll for live scans every 5 seconds
  useEffect(() => {
    fetchLiveScans();
    const interval = setInterval(fetchLiveScans, 5000);
    return () => clearInterval(interval);
  }, [fetchLiveScans]);

  // ===== Staff Attendance Fetchers =====
  const fetchStaffAttendance = useCallback(async () => {
    try {
      setStaffLoading(true);
      const response = await staffAttendanceService.getStaffDailyAttendance({
        attendance_date: selectedDate,
        status_filter: staffStatusFilter || undefined,
        search: debouncedStaffSearch || undefined,
      });
      setStaffRecords(response.data);
    } catch (err) {
      console.error('Failed to fetch staff attendance', err);
    } finally {
      setStaffLoading(false);
    }
  }, [selectedDate, staffStatusFilter, debouncedStaffSearch]);

  const fetchStaffLiveScans = useCallback(async () => {
    try {
      const data = await staffAttendanceService.getStaffLiveAttendance(10);
      setStaffLiveScans(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaffAttendance();
    }
  }, [activeTab, fetchStaffAttendance]);

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaffLiveScans();
      const interval = setInterval(fetchStaffLiveScans, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchStaffLiveScans]);

  const handleMarkBulkAbsent = async () => {
    try {
      setMarkingAbsent(true);
      const result = await attendanceService.markBulkAbsent(
        selectedDate,
        selectedClass || undefined,
        selectedSection || undefined,
        sendSMS
      );
      setSuccess(`${result.message}. SMS sent: ${result.sms_sent}`);
      setShowMarkAbsentModal(false);
      fetchAttendance();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to mark absent');
    } finally {
      setMarkingAbsent(false);
    }
  };

  // Checkbox helpers
  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  // Students eligible to receive SMS: either no SMS sent, OR checked-out (checkout SMS may not have been sent yet)
  const eligibleForNotify = attendanceRecords.filter(r =>
    !r.sms_sent || !r.whatsapp_sent || (r.check_out_time && r.sms_sent)
  );

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === eligibleForNotify.length && eligibleForNotify.length > 0) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(eligibleForNotify.map(r => r.student_id)));
    }
  };

  const handleSendNotifications = async (channel: 'sms' | 'whatsapp' | 'both') => {
    if (selectedStudentIds.size === 0) return;
    try {
      setSendingNotifications(true);
      setError(null);
      const result = await attendanceService.sendNotifications(
        Array.from(selectedStudentIds),
        selectedDate,
        channel
      );
      setSuccess(result.message);
      setSelectedStudentIds(new Set());
      fetchAttendance();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send notifications');
    } finally {
      setSendingNotifications(false);
    }
  };

  // ===== Manual Attendance Helpers =====
  const searchStudents = useCallback(async (query: string) => {
    if (query.length < 2) {
      setStudentResults([]);
      return;
    }
    try {
      setSearchingStudents(true);
      const response = await api.get('/students/', { params: { search: query, page_size: 15 } });
      const students = (response.data.students || []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        surname: s.surname,
        admission_number: s.admission_number,
        class_name: s.class_name,
        section_name: s.section_name,
        mobile_number: s.mobile_number,
        rfid_id: s.rfid_id,
      }));
      setStudentResults(students);
    } catch {
      setStudentResults([]);
    } finally {
      setSearchingStudents(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchStudents(manualStudentSearch), 300);
    return () => clearTimeout(timer);
  }, [manualStudentSearch, searchStudents]);

  const selectStudentForManual = (student: StudentOption) => {
    setManualForm(prev => ({
      ...prev,
      student_id: student.id,
      student_display: `${student.surname ? student.surname + ' ' : ''}${student.first_name} (${student.admission_number})`,
    }));
    setManualStudentSearch('');
    setStudentResults([]);
  };

  const resetManualForm = () => {
    setManualForm({
      student_id: 0,
      student_display: '',
      attendance_date: selectedDate,
      check_in_time: '',
      check_out_time: '',
      status: 'present',
      remarks: '',
      send_sms: false,
      send_whatsapp: false,
      update_existing: false,
    });
    setManualStudentSearch('');
    setStudentResults([]);
  };

  const handleManualSubmit = async () => {
    if (!manualForm.student_id) {
      setError('Please select a student');
      return;
    }
    try {
      setSubmittingManual(true);
      setError(null);
      const payload: ManualAttendanceEntry = {
        student_id: manualForm.student_id,
        attendance_date: manualForm.attendance_date,
        check_in_time: manualForm.check_in_time || undefined,
        check_out_time: manualForm.check_out_time || undefined,
        status: manualForm.status,
        remarks: manualForm.remarks || undefined,
        send_sms: manualForm.send_sms,
        send_whatsapp: manualForm.send_whatsapp,
        update_existing: manualForm.update_existing,
      };
      const result = await attendanceService.createManualAttendanceWithNotify(payload);
      setSuccess(result.message || 'Manual attendance recorded successfully');
      setShowManualModal(false);
      resetManualForm();
      fetchAttendance();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add manual attendance');
    } finally {
      setSubmittingManual(false);
    }
  };

  // ===== Staff Manual Attendance Helpers =====
  const searchStaffMembers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setStaffResults([]);
      return;
    }
    try {
      setSearchingStaff(true);
      const response = await api.get('/staff/', { params: { search: query, page_size: 15 } });
      const staff = (response.data.staff || response.data || []).map((s: any) => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        employee_id: s.employee_id,
        designation: s.designation,
        department_name: s.department_name,
        mobile: s.mobile,
      }));
      setStaffResults(staff);
    } catch {
      setStaffResults([]);
    } finally {
      setSearchingStaff(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchStaffMembers(staffSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [staffSearchQuery, searchStaffMembers]);

  const selectStaffForManual = (staff: StaffOption) => {
    setStaffManualForm(prev => ({
      ...prev,
      staff_id: staff.id,
      staff_display: `${staff.first_name} ${staff.last_name || ''} (${staff.employee_id || 'N/A'})`.trim(),
    }));
    setStaffSearchQuery('');
    setStaffResults([]);
  };

  const resetStaffManualForm = () => {
    setStaffManualForm({
      staff_id: 0,
      staff_display: '',
      attendance_date: selectedDate,
      check_in_time: '',
      check_out_time: '',
      status: 'present',
      remarks: '',
      update_existing: false,
    });
    setStaffSearchQuery('');
    setStaffResults([]);
  };

  const handleStaffManualSubmit = async () => {
    if (!staffManualForm.staff_id) {
      setError('Please select a staff member');
      return;
    }
    try {
      setSubmittingStaffManual(true);
      setError(null);
      const result = await staffAttendanceService.createStaffManualAttendance({
        staff_id: staffManualForm.staff_id,
        attendance_date: staffManualForm.attendance_date,
        check_in_time: staffManualForm.check_in_time || undefined,
        check_out_time: staffManualForm.check_out_time || undefined,
        status: staffManualForm.status,
        remarks: staffManualForm.remarks || undefined,
        update_existing: staffManualForm.update_existing,
      });
      setSuccess(result.message || 'Staff attendance recorded successfully');
      setShowStaffManualModal(false);
      resetStaffManualForm();
      fetchStaffAttendance();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add staff attendance');
    } finally {
      setSubmittingStaffManual(false);
    }
  };

  const handleStaffBulkAbsent = async () => {
    try {
      setMarkingStaffAbsent(true);
      const result = await staffAttendanceService.markStaffBulkAbsent(selectedDate);
      setSuccess(result.message);
      setShowStaffMarkAbsentModal(false);
      fetchStaffAttendance();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to mark staff absent');
    } finally {
      setMarkingStaffAbsent(false);
    }
  };

  const handleInlineStatusUpdate = async (record: DailyAttendanceRecord, newStatus: string) => {
    if (newStatus === record.status) {
      setEditingStudentId(null);
      return;
    }
    try {
      setUpdatingStatus(true);
      if (record.attendance_id) {
        // Update existing record
        await attendanceService.updateAttendance(record.attendance_id, { status: newStatus });
      } else {
        // No log exists (absent by default) — create via manual entry
        await attendanceService.createManualAttendanceWithNotify({
          student_id: record.student_id,
          attendance_date: record.attendance_date,
          status: newStatus,
          send_sms: false,
          send_whatsapp: false,
          update_existing: true,
        });
      }
      setSuccess(`Status updated to ${newStatus} for ${record.student_name}`);
      setEditingStudentId(null);
      fetchAttendance();
    } catch (err) {
      setError('Failed to update attendance status');
      console.error(err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      half_day: 'bg-orange-100 text-orange-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.absent}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Calculate summary stats — use backend summary (covers all students) when available
  const stats = attendanceSummary ? {
    total: attendanceSummary.present + attendanceSummary.absent, // present(incl.late) + absent(incl.not_marked) = total students
    present: attendanceSummary.present,
    absent: attendanceSummary.absent,
    late: attendanceSummary.late,
  } : {
    total: attendanceRecords.length,
    present: attendanceRecords.filter(r => r.status === 'present' || r.status === 'late').length,
    absent: attendanceRecords.filter(r => r.status === 'absent').length,
    late: attendanceRecords.filter(r => r.status === 'late').length,
  };

  const connectedDevices = devices.filter(d => d.status === 'connected');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manual Attendance</h1>
          <p className="text-gray-500">Track and manage attendance</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {activeTab === 'students' && selectedStudentIds.size > 0 && (
            <>
              <button
                onClick={() => handleSendNotifications('sms')}
                disabled={sendingNotifications}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {sendingNotifications ? 'Sending...' : `Send SMS (${selectedStudentIds.size})`}
              </button>
              <button
                onClick={() => handleSendNotifications('whatsapp')}
                disabled={sendingNotifications}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {sendingNotifications ? 'Sending...' : `Send WhatsApp (${selectedStudentIds.size})`}
              </button>
              <button
                onClick={() => handleSendNotifications('both')}
                disabled={sendingNotifications}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
              >
                {sendingNotifications ? 'Sending...' : `Send Both (${selectedStudentIds.size})`}
              </button>
            </>
          )}
          {activeTab === 'students' ? (
            <>
              <button
                onClick={() => { resetManualForm(); setShowManualModal(true); }}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Manual Attendance
              </button>
              <button
                onClick={() => setShowMarkAbsentModal(true)}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
              >
                Mark Absent & Notify
              </button>
              <button onClick={fetchAttendance} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Refresh</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { resetStaffManualForm(); setShowStaffManualModal(true); }}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Staff Attendance
              </button>
              <button
                onClick={() => setShowStaffMarkAbsentModal(true)}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700"
              >
                Mark Staff Absent
              </button>
              <button onClick={fetchStaffAttendance} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Refresh</button>
            </>
          )}
        </div>
      </div>

      {/* Students / Staff Toggle Tabs */}
      <div className="bg-white rounded-lg shadow-sm p-1 inline-flex">
        <button
          onClick={() => setActiveTab('students')}
          className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'students'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Students
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`px-6 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'staff'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Staff
        </button>
      </div>

      {/* SMS rules quick reference (collapsible) */}
      <SmsRulesInfo />

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">×</button>
        </div>
      )}

      {/* ==================== STUDENTS TAB ==================== */}
      {activeTab === 'students' && (
      <>
      {/* Device Status Bar */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Connected Devices:</span>
              {connectedDevices.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {connectedDevices.map(device => (
                    <span key={device.id} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      {device.device_name} ✓
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-orange-600">No devices connected</span>
              )}
            </div>
          </div>
          {etpStatus && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  {etpStatus.server_online && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${etpStatus.server_online ? 'bg-green-500' : 'bg-red-500'}`}></span>
                </span>
                <span className={`text-sm font-medium ${etpStatus.server_online ? 'text-green-700' : 'text-red-700'}`}>
                  EasyTimePro: {etpStatus.server_online ? 'Online' : 'Offline'}
                </span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${etpStatus.poller_running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                Log Capture: {etpStatus.poller_running ? 'Active' : 'Stopped'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live Scans Panel */}
      {liveScans.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg shadow-lg p-4 text-white">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="animate-pulse">●</span> Live Attendance Feed
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {liveScans.slice(0, 5).map((scan) => (
              <div key={scan.id} className="flex-shrink-0 bg-white/20 rounded-lg p-3 min-w-[200px]">
                <div className="font-medium">{scan.student_name}</div>
                <div className="text-sm opacity-80">{scan.class_name} - {scan.section_name}</div>
                <div className="text-xs mt-1">
                  {formatTime(scan.check_in_time)} 
                  {scan.status === 'late' && <span className="ml-2 bg-yellow-500 px-2 rounded">Late</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-gray-500">Total Students</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-green-600">{stats.present}</div>
          <div className="text-gray-500">Present</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-red-600">{stats.absent}</div>
          <div className="text-gray-500">Absent</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-yellow-600">{stats.late}</div>
          <div className="text-gray-500">Late</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                setSelectedSection('');
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Classes</option>
              {[...new Set(classOptions.map(c => c.class_name))]
                .sort((a, b) => {
                  const numA = parseInt(a.replace(/\D/g, ''), 10);
                  const numB = parseInt(b.replace(/\D/g, ''), 10);
                  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                  return a.localeCompare(b);
                })
                .map(className => (
                <option key={className} value={className}>{className}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              disabled={!selectedClass}
            >
              <option value="">All Sections</option>
              {classOptions
                .filter(c => c.class_name === selectedClass)
                .map(c => (
                  <option key={c.section_name} value={c.section_name}>{c.section_name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
            <div className="relative">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Name, Admission #, RFID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pl-9"
              />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.size > 0 && selectedStudentIds.size === eligibleForNotify.length && eligibleForNotify.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 text-indigo-600 rounded"
                    title="Select all students with unsent notifications"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">SMS Sent</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">WhatsApp Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent Phone</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendanceRecords.map((record) => {
                const canSelect = !record.sms_sent || !record.whatsapp_sent;
                return (
                <tr key={record.student_id} className={record.status === 'absent' ? 'bg-red-50' : ''}>
                  <td className="px-3 py-3 text-center">
                    {canSelect ? (
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(record.student_id)}
                        onChange={() => toggleStudentSelection(record.student_id)}
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    ) : (
                      <span className="text-green-500 text-sm">✓</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{record.student_name}</div>
                    <div className="text-sm text-gray-500">{record.admission_number}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.class_name} - {record.section_name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(record.check_in_time)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(record.check_out_time)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {editingStudentId === record.student_id ? (
                      <select
                        value={editingStatus}
                        onChange={(e) => {
                          setEditingStatus(e.target.value);
                          handleInlineStatusUpdate(record, e.target.value);
                        }}
                        onBlur={() => !updatingStatus && setEditingStudentId(null)}
                        autoFocus
                        disabled={updatingStatus}
                        className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="half_day">Half Day</option>
                      </select>
                    ) : (
                      <span
                        onClick={() => { setEditingStudentId(record.student_id); setEditingStatus(record.status); }}
                        className="cursor-pointer hover:opacity-70"
                        title="Click to change status"
                      >
                        {getStatusBadge(record.status)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {record.sms_sent ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Yes</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {record.whatsapp_sent ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Yes</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {record.device_name || (record.is_manual_entry ? 'Manual' : '-')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {record.parent_phone || '-'}
                  </td>
                </tr>
                );
              })}
              {attendanceRecords.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    No attendance records found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* ==================== STAFF TAB ==================== */}
      {activeTab === 'staff' && (
      <>
      {/* Staff Live Scans */}
      {staffLiveScans.length > 0 && (
        <div className="bg-gradient-to-r from-teal-500 to-emerald-600 rounded-lg shadow-lg p-4 text-white">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="animate-pulse">●</span> Staff Live Attendance Feed
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {staffLiveScans.slice(0, 5).map((scan: any) => (
              <div key={scan.id} className="flex-shrink-0 bg-white/20 rounded-lg p-3 min-w-[200px]">
                <div className="font-medium">{scan.staff_name}</div>
                <div className="text-sm opacity-80">{scan.designation || 'Staff'} {scan.department_name ? `- ${scan.department_name}` : ''}</div>
                <div className="text-xs mt-1">
                  {scan.check_in_time ? new Date(scan.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                  {scan.status === 'late' && <span className="ml-2 bg-yellow-500 px-2 rounded">Late</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-gray-900">{staffStats.total}</div>
          <div className="text-gray-500">Total Staff</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-green-600">{staffStats.present}</div>
          <div className="text-gray-500">Present</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-red-600">{staffStats.absent}</div>
          <div className="text-gray-500">Absent</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="text-3xl font-bold text-yellow-600">{staffStats.late}</div>
          <div className="text-gray-500">Late</div>
        </div>
      </div>

      {/* Staff Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={staffStatusFilter}
              onChange={(e) => setStaffStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Staff</label>
            <div className="relative">
              <input
                type="text"
                value={staffSearchText}
                onChange={(e) => setStaffSearchText(e.target.value)}
                placeholder="Name, Employee ID, RFID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pl-9"
              />
              <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Staff Attendance Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {staffLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Member</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {staffRecords.map((record) => (
                <tr key={record.staff_id} className={record.status === 'absent' ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{record.staff_name}</div>
                    {record.remarks && <div className="text-xs text-gray-500">{record.remarks}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.employee_id || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.designation || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.department_name || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getStatusBadge(record.status)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {record.is_manual_entry ? 'Manual' : 'RFID'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {record.mobile || '-'}
                  </td>
                </tr>
              ))}
              {staffRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No staff attendance records found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Manual Attendance Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Add Manual Attendance</h2>
                <p className="text-white/80 text-sm">Log attendance manually for a student</p>
              </div>
              <button onClick={() => setShowManualModal(false)} className="text-white/80 hover:text-white p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Student Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
                {manualForm.student_id ? (
                  <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                    <div>
                      <span className="font-medium text-teal-800">{manualForm.student_display}</span>
                    </div>
                    <button
                      onClick={() => setManualForm(prev => ({ ...prev, student_id: 0, student_display: '' }))}
                      className="text-teal-600 hover:text-teal-800 text-sm underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={manualStudentSearch}
                      onChange={(e) => setManualStudentSearch(e.target.value)}
                      placeholder="Search by name or admission number..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    {searchingStudents && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin h-5 w-5 border-2 border-teal-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                    {studentResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {studentResults.map(s => (
                          <button
                            key={s.id}
                            onClick={() => selectStudentForManual(s)}
                            className="w-full text-left px-4 py-2.5 hover:bg-teal-50 border-b border-gray-100 last:border-0"
                          >
                            <div className="font-medium text-gray-900">
                              {s.surname ? `${s.surname} ${s.first_name}` : s.first_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {s.admission_number} • {s.class_name || 'N/A'} - {s.section_name || 'N/A'}
                              {s.mobile_number ? ` • ${s.mobile_number}` : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={manualForm.attendance_date}
                  onChange={(e) => setManualForm(prev => ({ ...prev, attendance_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              {/* Check-in / Check-out Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                  <input
                    type="time"
                    value={manualForm.check_in_time}
                    onChange={(e) => setManualForm(prev => ({ ...prev, check_in_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                  <input
                    type="time"
                    value={manualForm.check_out_time}
                    onChange={(e) => setManualForm(prev => ({ ...prev, check_out_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={manualForm.status}
                  onChange={(e) => setManualForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <textarea
                  value={manualForm.remarks}
                  onChange={(e) => setManualForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. RFID card not working, student forgot card..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              {/* Notification Options */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-blue-800">Notify Parent</p>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="manualSMS"
                    checked={manualForm.send_sms}
                    onChange={(e) => setManualForm(prev => ({ ...prev, send_sms: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor="manualSMS" className="text-sm text-gray-700">Send SMS</label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="manualWhatsApp"
                    checked={manualForm.send_whatsapp}
                    onChange={(e) => setManualForm(prev => ({ ...prev, send_whatsapp: e.target.checked }))}
                    className="h-4 w-4 text-green-600 rounded"
                  />
                  <label htmlFor="manualWhatsApp" className="text-sm text-gray-700">Send WhatsApp</label>
                </div>
              </div>

              {/* Update Existing */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <input
                  type="checkbox"
                  id="updateExisting"
                  checked={manualForm.update_existing}
                  onChange={(e) => setManualForm(prev => ({ ...prev, update_existing: e.target.checked }))}
                  className="h-4 w-4 text-amber-600 rounded"
                />
                <label htmlFor="updateExisting" className="text-sm text-gray-700">
                  Update if attendance already exists for this date
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSubmit}
                  disabled={submittingManual || !manualForm.student_id}
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                >
                  {submittingManual ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Attendance'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark Absent Modal */}
      {showMarkAbsentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Mark Absent Students</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                This will mark all students who haven't checked in today as absent.
              </p>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="sendSMS"
                    checked={sendSMS}
                    onChange={(e) => setSendSMS(e.target.checked)}
                    className="h-5 w-5 text-indigo-600 rounded"
                  />
                  <label htmlFor="sendSMS" className="text-sm font-medium text-gray-700">
                    Send SMS notification to parents of absent students
                  </label>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <strong>Filters Applied:</strong>
                <ul className="mt-2 space-y-1">
                  <li>Date: {selectedDate}</li>
                  <li>Class: {selectedClass || 'All'}</li>
                  <li>Section: {selectedSection || 'All'}</li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowMarkAbsentModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkBulkAbsent}
                  disabled={markingAbsent}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {markingAbsent ? 'Processing...' : 'Mark Absent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Manual Attendance Modal */}
      {showStaffManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4 text-white flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Add Staff Attendance</h2>
                <p className="text-white/80 text-sm">Log attendance manually for a staff member</p>
              </div>
              <button onClick={() => setShowStaffManualModal(false)} className="text-white/80 hover:text-white p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Staff Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
                {staffManualForm.staff_id ? (
                  <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
                    <span className="font-medium text-teal-800">{staffManualForm.staff_display}</span>
                    <button
                      onClick={() => setStaffManualForm(prev => ({ ...prev, staff_id: 0, staff_display: '' }))}
                      className="text-teal-600 hover:text-teal-800 text-sm underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      placeholder="Search by name or employee ID..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    {searchingStaff && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin h-5 w-5 border-2 border-teal-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                    {staffResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {staffResults.map(s => (
                          <button
                            key={s.id}
                            onClick={() => selectStaffForManual(s)}
                            className="w-full text-left px-4 py-2.5 hover:bg-teal-50 border-b border-gray-100 last:border-0"
                          >
                            <div className="font-medium text-gray-900">
                              {s.first_name} {s.last_name || ''}
                            </div>
                            <div className="text-xs text-gray-500">
                              {s.employee_id || 'N/A'} • {s.designation || 'N/A'} {s.department_name ? `• ${s.department_name}` : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={staffManualForm.attendance_date}
                  onChange={(e) => setStaffManualForm(prev => ({ ...prev, attendance_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              {/* Check-in / Check-out Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                  <input
                    type="time"
                    value={staffManualForm.check_in_time}
                    onChange={(e) => setStaffManualForm(prev => ({ ...prev, check_in_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                  <input
                    type="time"
                    value={staffManualForm.check_out_time}
                    onChange={(e) => setStaffManualForm(prev => ({ ...prev, check_out_time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={staffManualForm.status}
                  onChange={(e) => setStaffManualForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="half_day">Half Day</option>
                  <option value="leave">Leave</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <textarea
                  value={staffManualForm.remarks}
                  onChange={(e) => setStaffManualForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. RFID card not working..."
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              {/* Update Existing */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <input
                  type="checkbox"
                  id="staffUpdateExisting"
                  checked={staffManualForm.update_existing}
                  onChange={(e) => setStaffManualForm(prev => ({ ...prev, update_existing: e.target.checked }))}
                  className="h-4 w-4 text-amber-600 rounded"
                />
                <label htmlFor="staffUpdateExisting" className="text-sm text-gray-700">
                  Update if attendance already exists for this date
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowStaffManualModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStaffManualSubmit}
                  disabled={submittingStaffManual || !staffManualForm.staff_id}
                  className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                >
                  {submittingStaffManual ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Attendance'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Mark Absent Modal */}
      {showStaffMarkAbsentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Mark Staff Absent</h2>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-600">
                This will mark all staff members who haven't checked in today as absent.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <strong>Date:</strong> {selectedDate}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowStaffMarkAbsentModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStaffBulkAbsent}
                  disabled={markingStaffAbsent}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {markingStaffAbsent ? 'Processing...' : 'Mark Absent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyAttendance;
