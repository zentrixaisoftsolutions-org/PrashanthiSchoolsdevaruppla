import { useState, useEffect, useCallback } from 'react';
import attendanceService, {
  StudentAttendanceSummary,
  WeeklyAttendanceSummary,
  MonthlyAttendanceSummary,
  YearlyAttendanceSummary,
  OverallAttendanceSummary,
  StudentAttendanceHistory,
  DailyAttendanceRecord,
  StaffAttendanceRecord,
  StaffAttendanceSummary,
  StaffWeeklySummary,
  StaffMonthlySummary,
  StaffYearlySummary,
  StaffOverallSummary,
  StaffAttendanceHistory,
} from '../../services/attendanceService';
import { staffAttendanceService } from '../../services/attendanceService';
import classSectionService from '../../services/classSectionService';
import deviceService, { AttendanceDevice, EasyTimeProStatus } from '../../services/deviceService';
import SmsRulesInfo from '../../components/SmsRulesInfo';

interface ClassOption {
  class_name: string;
  section_name: string;
}

type ViewType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall';
type ActiveTab = 'students' | 'staff';

const AttendanceSummary = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('students');
  const [viewType, setViewType] = useState<ViewType>('daily');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const pageSize = 10;

  // Filter states
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff)).toISOString().split('T')[0];
  });
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  // Daily-view status filter: '' | 'present' | 'absent' | 'late'
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
  const [filteredSections, setFilteredSections] = useState<string[]>([]);

  // Data states
  const [dailyData, setDailyData] = useState<DailyAttendanceRecord[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyAttendanceSummary[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyAttendanceSummary[]>([]);
  const [yearlyData, setYearlyData] = useState<YearlyAttendanceSummary[]>([]);
  const [overallData, setOverallData] = useState<OverallAttendanceSummary[]>([]);
  const [summaryStats, setSummaryStats] = useState<{
    present: number; absent: number; late: number;
    not_marked?: number; percentage: number;
    total_students?: number; working_days?: number;
  } | null>(null);
  
  // Student detail modal
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [studentHistory, setStudentHistory] = useState<StudentAttendanceHistory | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);

  // Notification states
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set());
  const [sendingNotifications, setSendingNotifications] = useState(false);
  const [success, setSuccess] = useState('');

  // Staff data states
  const [staffDailyData, setStaffDailyData] = useState<StaffAttendanceRecord[]>([]);
  const [staffWeeklyData, setStaffWeeklyData] = useState<StaffWeeklySummary[]>([]);
  const [staffMonthlyData, setStaffMonthlyData] = useState<StaffMonthlySummary[]>([]);
  const [staffYearlyData, setStaffYearlySummary] = useState<StaffYearlySummary[]>([]);
  const [staffOverallData, setStaffOverallData] = useState<StaffOverallSummary[]>([]);
  const [staffSummaryStats, setStaffSummaryStats] = useState<{
    present: number; absent: number; late: number; percentage: number;
    total_staff?: number; working_days?: number;
  } | null>(null);

  // Staff detail modal
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [staffHistory, setStaffHistory] = useState<StaffAttendanceHistory | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);

  // EasyTimePro & Device status
  const [etpStatus, setEtpStatus] = useState<EasyTimeProStatus | null>(null);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);

  const fetchEtpStatus = useCallback(async () => {
    try {
      const status = await deviceService.getEasyTimeProStatus();
      setEtpStatus(status);
    } catch {
      setEtpStatus(null);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await deviceService.getDevices(true);
      setDevices(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchEtpStatus();
    fetchDevices();
  }, [fetchEtpStatus, fetchDevices]);

  useEffect(() => {
    const interval = setInterval(fetchEtpStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchEtpStatus]);

  const connectedDevices = devices.filter(d => d.status === 'connected');

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    { value: 1, name: 'January' }, { value: 2, name: 'February' }, { value: 3, name: 'March' },
    { value: 4, name: 'April' }, { value: 5, name: 'May' }, { value: 6, name: 'June' },
    { value: 7, name: 'July' }, { value: 8, name: 'August' }, { value: 9, name: 'September' },
    { value: 10, name: 'October' }, { value: 11, name: 'November' }, { value: 12, name: 'December' }
  ];

  // Load classes on mount
  useEffect(() => {
    loadClasses();
  }, []);

  // Update filtered sections when class changes
  useEffect(() => {
    if (selectedClass) {
      const sections = classes
        .filter(c => c.class_name === selectedClass)
        .map(c => c.section_name)
        .filter((v, i, a) => a.indexOf(v) === i);
      setFilteredSections(sections);
      setSelectedSection('');
    } else {
      setFilteredSections([]);
      setSelectedSection('');
    }
  }, [selectedClass, classes]);

  // Reset page when view or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [viewType, selectedDate, selectedWeekStart, selectedMonth, selectedYear, selectedClass, selectedSection, statusFilter, debouncedSearch, activeTab]);

  // Load data when view, filters, or page change
  useEffect(() => {
    if (activeTab === 'students') {
      loadData();
    } else {
      loadStaffData();
    }
  }, [viewType, selectedDate, selectedWeekStart, selectedMonth, selectedYear, selectedClass, selectedSection, statusFilter, debouncedSearch, currentPage, activeTab]);

  const loadClasses = async () => {
    try {
      const data = await classSectionService.listClassSections();
      const classOptions = data.map(cs => ({ class_name: cs.class_name, section_name: cs.section_name }));
      setClasses(classOptions);
      const unique = [...new Set(classOptions.map(c => c.class_name))];
      setUniqueClasses(unique);
    } catch (err) {
      console.error('Error loading classes:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      switch (viewType) {
        case 'daily':
          const daily = await attendanceService.getDailyAttendance({
            attendance_date: selectedDate,
            class_name: selectedClass || undefined,
            section_name: selectedSection || undefined,
            status_filter: statusFilter || undefined,
            search: debouncedSearch || undefined,
            page: currentPage,
            page_size: pageSize
          });
          setDailyData(daily.data);
          setTotalPages(daily.total_pages);
          setTotalRecords(daily.total);
          if (daily.summary) setSummaryStats(daily.summary);
          break;
        case 'weekly':
          const weekly = await attendanceService.getWeeklyAttendance(
            selectedWeekStart,
            selectedClass || undefined,
            selectedSection || undefined,
            currentPage,
            pageSize,
            debouncedSearch || undefined
          );
          setWeeklyData(weekly.data);
          setTotalPages(weekly.total_pages);
          setTotalRecords(weekly.total);
          if (weekly.summary) setSummaryStats(weekly.summary);
          break;
        case 'monthly':
          const monthly = await attendanceService.getMonthlyAttendance(
            selectedYear,
            selectedMonth,
            selectedClass || undefined,
            selectedSection || undefined,
            currentPage,
            pageSize,
            debouncedSearch || undefined
          );
          setMonthlyData(monthly.data);
          setTotalPages(monthly.total_pages);
          setTotalRecords(monthly.total);
          if (monthly.summary) setSummaryStats(monthly.summary);
          break;
        case 'yearly':
          const yearly = await attendanceService.getYearlyAttendance(
            selectedYear,
            selectedClass || undefined,
            selectedSection || undefined,
            currentPage,
            pageSize,
            debouncedSearch || undefined
          );
          setYearlyData(yearly.data);
          setTotalPages(yearly.total_pages);
          setTotalRecords(yearly.total);
          if (yearly.summary) setSummaryStats(yearly.summary);
          break;
        case 'overall':
          const overall = await attendanceService.getOverallAttendance(
            selectedClass || undefined,
            selectedSection || undefined,
            currentPage,
            pageSize,
            debouncedSearch || undefined
          );
          setOverallData(overall.data);
          setTotalPages(overall.total_pages);
          setTotalRecords(overall.total);
          if (overall.summary) setSummaryStats(overall.summary);
          break;
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  const viewStudentHistory = async (studentId: number) => {
    setSelectedStudent(studentId);
    setLoading(true);
    try {
      const history = await attendanceService.getStudentHistory(
        studentId,
        selectedYear,
        viewType === 'monthly' ? selectedMonth : undefined
      );
      setStudentHistory(history);
      setShowStudentModal(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load student history');
    } finally {
      setLoading(false);
    }
  };

  // Staff data loading
  const loadStaffData = async () => {
    setLoading(true);
    setError('');
    try {
      switch (viewType) {
        case 'daily': {
          const daily = await staffAttendanceService.getStaffDailyAttendance({
            attendance_date: selectedDate,
            status_filter: statusFilter || undefined,
            search: debouncedSearch || undefined,
            page: currentPage,
            page_size: pageSize
          });
          setStaffDailyData(daily.data);
          setTotalPages(daily.total_pages);
          setTotalRecords(daily.total);
          if (daily.summary) setStaffSummaryStats(daily.summary);
          break;
        }
        case 'weekly': {
          const weekly = await staffAttendanceService.getStaffWeeklyAttendance(
            selectedWeekStart,
            undefined, undefined,
            currentPage, pageSize,
            debouncedSearch || undefined
          );
          setStaffWeeklyData(weekly.data);
          setTotalPages(weekly.total_pages);
          setTotalRecords(weekly.total);
          if (weekly.summary) setStaffSummaryStats(weekly.summary);
          break;
        }
        case 'monthly': {
          const monthly = await staffAttendanceService.getStaffMonthlyAttendance(
            selectedYear, selectedMonth,
            undefined, undefined,
            currentPage, pageSize,
            debouncedSearch || undefined
          );
          setStaffMonthlyData(monthly.data);
          setTotalPages(monthly.total_pages);
          setTotalRecords(monthly.total);
          if (monthly.summary) setStaffSummaryStats(monthly.summary);
          break;
        }
        case 'yearly': {
          const yearly = await staffAttendanceService.getStaffYearlyAttendance(
            selectedYear,
            undefined, undefined,
            currentPage, pageSize,
            debouncedSearch || undefined
          );
          setStaffYearlySummary(yearly.data);
          setTotalPages(yearly.total_pages);
          setTotalRecords(yearly.total);
          if (yearly.summary) setStaffSummaryStats(yearly.summary);
          break;
        }
        case 'overall': {
          const overall = await staffAttendanceService.getStaffOverallAttendance(
            undefined, undefined,
            currentPage, pageSize,
            debouncedSearch || undefined
          );
          setStaffOverallData(overall.data);
          setTotalPages(overall.total_pages);
          setTotalRecords(overall.total);
          if (overall.summary) setStaffSummaryStats(overall.summary);
          break;
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load staff attendance data');
    } finally {
      setLoading(false);
    }
  };

  const viewStaffHistory = async (staffId: number) => {
    setSelectedStaffId(staffId);
    setLoading(true);
    try {
      const history = await staffAttendanceService.getStaffHistory(
        staffId,
        selectedYear,
        viewType === 'monthly' ? selectedMonth : undefined
      );
      setStaffHistory(history);
      setShowStaffModal(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load staff history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'present': return 'bg-green-100 text-green-800';
      case 'absent': return 'bg-red-100 text-red-800';
      case 'late': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Clear selection when data changes
  useEffect(() => {
    setSelectedStudentIds(new Set());
  }, [dailyData]);

  // Notification helpers
  const eligibleForNotify = dailyData.filter(r => !r.sms_sent || !r.whatsapp_sent);

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === eligibleForNotify.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(eligibleForNotify.map(r => r.student_id)));
    }
  };

  const handleSendNotifications = async (channel: 'sms' | 'whatsapp' | 'both') => {
    if (selectedStudentIds.size === 0) return;
    setSendingNotifications(true);
    setError('');
    setSuccess('');
    try {
      const result = await attendanceService.sendNotifications(
        Array.from(selectedStudentIds),
        selectedDate,
        channel
      );
      setSuccess(result.message || `Notifications sent successfully!`);
      setSelectedStudentIds(new Set());
      // Reload data to refresh sent status
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send notifications');
    } finally {
      setSendingNotifications(false);
    }
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 75) return 'text-blue-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPercentageBgColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  // Calculate stats from backend summary
  const calculateStats = () => {
    if (activeTab === 'staff') {
      if (staffSummaryStats) {
        return {
          total: totalRecords,
          present: staffSummaryStats.present,
          absent: staffSummaryStats.absent,
          late: staffSummaryStats.late,
          percentage: Math.round(staffSummaryStats.percentage)
        };
      }
      return { total: totalRecords, present: 0, absent: 0, late: 0, percentage: 0 };
    }
    if (summaryStats) {
      return {
        total: totalRecords,
        present: summaryStats.present,
        absent: summaryStats.absent,
        late: summaryStats.late,
        percentage: Math.round(summaryStats.percentage)
      };
    }
    return { total: totalRecords, present: 0, absent: 0, late: 0, percentage: 0 };
  };

  const stats = calculateStats();

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Summary</h1>
        <p className="text-gray-600 mt-1">View and analyze attendance across different time periods</p>
      </div>

      {/* EasyTimePro & Device Status Banner */}
      <div className="mb-6 bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm">Connected Devices:</span>
            {connectedDevices.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {connectedDevices.map(device => (
                  <span key={device.id} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                    {device.device_name} ✓
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-orange-600 text-sm">No devices connected</span>
            )}
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

      {/* Students / Staff Toggle */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('students')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'students'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Students
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'staff'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Staff
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900 text-xl">&times;</button>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-700 hover:text-green-900 text-xl">&times;</button>
        </div>
      )}

      {/* SMS rules quick reference (collapsible) */}
      <SmsRulesInfo />

      {/* View Type Selector & Filters */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {/* View Type Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Attendance Type</label>
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value as ViewType)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
            >
              <option value="daily">Daily Attendance</option>
              <option value="weekly">Weekly Attendance</option>
              <option value="monthly">Monthly Attendance</option>
              <option value="yearly">Yearly Attendance</option>
              <option value="overall">Overall Attendance</option>
            </select>
          </div>

          {/* Status Filter (daily view only) */}
          {viewType === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
              >
                <option value="">All Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="late">Late</option>
              </select>
            </div>
          )}

          {/* Conditional Date/Period Filters */}
          {viewType === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
            </div>
          )}

          {viewType === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Week Starting</label>
              <input
                type="date"
                value={selectedWeekStart}
                onChange={(e) => setSelectedWeekStart(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
            </div>
          )}

          {(viewType === 'monthly' || viewType === 'yearly') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {viewType === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
              >
                {months.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Class Filter */}
          {activeTab === 'students' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Class</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
            >
              <option value="">All Classes</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          )}

          {/* Section Filter */}
          {activeTab === 'students' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Section</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              disabled={!selectedClass}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">All Sections</option>
              {filteredSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          )}

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {activeTab === 'students' ? 'Search Student' : 'Search Staff'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={activeTab === 'students' ? "Name, Adm No, RFID..." : "Name, Employee ID..."}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={activeTab === 'students' ? loadData : loadStaffData}
              disabled={loading}
              className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Send Notification Buttons (Daily view only, students tab) */}
      {activeTab === 'students' && viewType === 'daily' && selectedStudentIds.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {selectedStudentIds.size} student{selectedStudentIds.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => handleSendNotifications('sms')}
            disabled={sendingNotifications}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Send SMS ({selectedStudentIds.size})
          </button>
          <button
            onClick={() => handleSendNotifications('whatsapp')}
            disabled={sendingNotifications}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            </svg>
            Send WhatsApp ({selectedStudentIds.size})
          </button>
          <button
            onClick={() => handleSendNotifications('both')}
            disabled={sendingNotifications}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            Send Both ({selectedStudentIds.size})
          </button>
          {sendingNotifications && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
          )}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-indigo-500">
          <div className="text-3xl font-bold text-indigo-600">{stats.total}</div>
          <div className="text-sm text-gray-500 mt-1">{activeTab === 'students' ? 'Total Students' : 'Total Staff'}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500">
          <div className="text-3xl font-bold text-green-600">{stats.present}</div>
          <div className="text-sm text-gray-500 mt-1">Present</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-500">
          <div className="text-3xl font-bold text-red-600">{stats.absent}</div>
          <div className="text-sm text-gray-500 mt-1">Absent</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-yellow-500">
          <div className="text-3xl font-bold text-yellow-600">{stats.late}</div>
          <div className="text-sm text-gray-500 mt-1">Late</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
          <div className="text-3xl font-bold text-blue-600">{stats.percentage}%</div>
          <div className="text-sm text-gray-500 mt-1">Attendance Rate</div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* ===== STUDENT TABLES ===== */}
            {activeTab === 'students' && (
            <>
            {viewType === 'daily' && (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={eligibleForNotify.length > 0 && selectedStudentIds.size === eligibleForNotify.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        title="Select all for notifications"
                      />
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Admission No</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Check In</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Check Out</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">SMS Sent</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">WhatsApp Sent</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailyData.length === 0 ? (
                    <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-500">No attendance records found</td></tr>
                  ) : (
                    dailyData.map((record) => {
                      const canSelect = !record.sms_sent || !record.whatsapp_sent;
                      return (
                      <tr key={record.student_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4 text-center">
                          {canSelect ? (
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.has(record.student_id)}
                              onChange={() => toggleStudentSelection(record.student_id)}
                              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                          ) : (
                            <span className="text-green-500" title="All notifications sent">✓</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                              {record.student_name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{record.student_name}</div>
                              {record.rfid_id && <div className="text-xs text-gray-500">RFID: {record.rfid_id}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.admission_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.class_name} - {record.section_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                          {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                          {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${record.sms_sent ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {record.sms_sent ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${record.whatsapp_sent ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {record.whatsapp_sent ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => viewStudentHistory(record.student_id)}
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {(viewType === 'weekly' || viewType === 'monthly' || viewType === 'yearly' || viewType === 'overall') && (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Admission No</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Class</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Days</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Present</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Absent</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Late</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance %</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    let data: StudentAttendanceSummary[] = [];
                    switch (viewType) {
                      case 'weekly': data = weeklyData; break;
                      case 'monthly': data = monthlyData; break;
                      case 'yearly': data = yearlyData; break;
                      case 'overall': data = overallData; break;
                    }
                    if (data.length === 0) {
                      return <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">No attendance records found</td></tr>;
                    }
                    return data.map((record) => (
                      <tr key={record.student_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                              {record.student_name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{record.student_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.admission_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.class_name} - {record.section_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{record.total_days}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">{record.present_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">{record.absent_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{record.late_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2.5">
                              <div className={`h-2.5 rounded-full ${getPercentageBgColor(record.attendance_percentage)}`} style={{ width: `${record.attendance_percentage}%` }}></div>
                            </div>
                            <span className={`text-sm font-semibold ${getPercentageColor(record.attendance_percentage)}`}>
                              {record.attendance_percentage}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => viewStudentHistory(record.student_id)}
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            )}
            </>
            )}

            {/* ===== STAFF TABLES ===== */}
            {activeTab === 'staff' && (
            <>
            {viewType === 'daily' && (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee ID</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Check In</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Check Out</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {staffDailyData.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500">No staff attendance records found</td></tr>
                  ) : (
                    staffDailyData.map((record) => (
                      <tr key={record.staff_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-medium">
                              {record.staff_name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{record.staff_name}</div>
                              {record.designation && <div className="text-xs text-gray-500">{record.designation}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.employee_id || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.department_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                          {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                          {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${record.is_manual_entry ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                            {record.is_manual_entry ? 'Manual' : 'RFID'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => viewStaffHistory(record.staff_id)}
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {(viewType === 'weekly' || viewType === 'monthly' || viewType === 'yearly' || viewType === 'overall') && (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff Member</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee ID</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Days</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Present</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Absent</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Late</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance %</th>
                    <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(() => {
                    let data: StaffAttendanceSummary[] = [];
                    switch (viewType) {
                      case 'weekly': data = staffWeeklyData; break;
                      case 'monthly': data = staffMonthlyData; break;
                      case 'yearly': data = staffYearlyData; break;
                      case 'overall': data = staffOverallData; break;
                    }
                    if (data.length === 0) {
                      return <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500">No staff attendance records found</td></tr>;
                    }
                    return data.map((record) => (
                      <tr key={record.staff_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-medium">
                              {record.staff_name.charAt(0)}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{record.staff_name}</div>
                              {record.designation && <div className="text-xs text-gray-500">{record.designation}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.employee_id || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{record.department_name || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">{record.total_days}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">{record.present_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">{record.absent_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{record.late_days}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2.5">
                              <div className={`h-2.5 rounded-full ${getPercentageBgColor(record.attendance_percentage)}`} style={{ width: `${record.attendance_percentage}%` }}></div>
                            </div>
                            <span className={`text-sm font-semibold ${getPercentageColor(record.attendance_percentage)}`}>
                              {record.attendance_percentage}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => viewStaffHistory(record.staff_id)}
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            )}
            </>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !loading && (
          <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRecords)} of {totalRecords} {activeTab === 'students' ? 'students' : 'staff'}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student History Modal */}
      {showStudentModal && studentHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                    {studentHistory.student.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{studentHistory.student.name}</h2>
                    <p className="text-white/80 text-sm">
                      {studentHistory.student.admission_number} • {studentHistory.student.class_name} - {studentHistory.student.section_name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStudentModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{studentHistory.summary.total_days}</div>
                  <div className="text-xs text-indigo-500 mt-1">Total Days</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{studentHistory.summary.present_days}</div>
                  <div className="text-xs text-green-500 mt-1">Present</div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{studentHistory.summary.absent_days}</div>
                  <div className="text-xs text-red-500 mt-1">Absent</div>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{studentHistory.summary.late_days}</div>
                  <div className="text-xs text-yellow-500 mt-1">Late</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${getPercentageColor(studentHistory.summary.attendance_percentage)}`}>
                    {studentHistory.summary.attendance_percentage}%
                  </div>
                  <div className="text-xs text-blue-500 mt-1">Attendance</div>
                </div>
              </div>

              {/* Attendance Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Attendance Progress</span>
                  <span className={`font-medium ${getPercentageColor(studentHistory.summary.attendance_percentage)}`}>
                    {studentHistory.summary.attendance_percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${getPercentageBgColor(studentHistory.summary.attendance_percentage)}`}
                    style={{ width: `${studentHistory.summary.attendance_percentage}%` }}
                  />
                </div>
              </div>

              {/* Attendance History Table */}
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b">
                  <h3 className="font-semibold text-gray-700">Attendance History</h3>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Check In</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Check Out</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {studentHistory.history.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No records found</td></tr>
                      ) : (
                        studentHistory.history.map((record, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-gray-500">
                              {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-gray-500">
                              {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {record.remarks || '-'}
                              {record.is_manual && <span className="ml-1 text-xs text-blue-500">(Manual)</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff History Modal */}
      {showStaffModal && staffHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 text-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold">
                    {staffHistory.staff.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{staffHistory.staff.name}</h2>
                    <p className="text-white/80 text-sm">
                      {staffHistory.staff.employee_id || 'N/A'} {staffHistory.staff.designation ? `• ${staffHistory.staff.designation}` : ''} {staffHistory.staff.department_name ? `• ${staffHistory.staff.department_name}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStaffModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{staffHistory.summary.total_days}</div>
                  <div className="text-xs text-indigo-500 mt-1">Total Days</div>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{staffHistory.summary.present_days}</div>
                  <div className="text-xs text-green-500 mt-1">Present</div>
                </div>
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{staffHistory.summary.absent_days}</div>
                  <div className="text-xs text-red-500 mt-1">Absent</div>
                </div>
                <div className="bg-yellow-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{staffHistory.summary.late_days}</div>
                  <div className="text-xs text-yellow-500 mt-1">Late</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${getPercentageColor(staffHistory.summary.attendance_percentage)}`}>
                    {staffHistory.summary.attendance_percentage}%
                  </div>
                  <div className="text-xs text-blue-500 mt-1">Attendance</div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Attendance Progress</span>
                  <span className={`font-medium ${getPercentageColor(staffHistory.summary.attendance_percentage)}`}>
                    {staffHistory.summary.attendance_percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${getPercentageBgColor(staffHistory.summary.attendance_percentage)}`}
                    style={{ width: `${staffHistory.summary.attendance_percentage}%` }}
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 border-b">
                  <h3 className="font-semibold text-gray-700">Attendance History</h3>
                </div>
                <div className="overflow-x-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Check In</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Check Out</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {staffHistory.history.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No records found</td></tr>
                      ) : (
                        staffHistory.history.map((record, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {new Date(record.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-gray-500">
                              {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-4 py-2 text-center text-sm text-gray-500">
                              {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {record.remarks || '-'}
                              {record.is_manual && <span className="ml-1 text-xs text-blue-500">(Manual)</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowStaffModal(false)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceSummary;
