import api from './api';

export interface AttendanceLog {
  id: number;
  student_id: number;
  student_name?: string;
  admission_number?: string;
  class_name?: string;
  section_name?: string;
  device_id?: number;
  device_name?: string;
  rfid_scanned?: string;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  is_manual_entry: boolean;
  remarks?: string;
  created_at: string;
}

export interface AttendanceCreate {
  student_id: number;
  attendance_date: string;
  status?: string;
  device_id?: number;
  rfid_scanned?: string;
  check_in_time?: string;
  is_manual_entry?: boolean;
  remarks?: string;
}

export interface AttendanceUpdate {
  status?: string;
  check_in_time?: string;
  check_out_time?: string;
  remarks?: string;
}

export interface RFIDScanRequest {
  device_id: number;
  rfid_id: string;
  scan_time?: string;
}

export interface RFIDScanResponse {
  success: boolean;
  message: string;
  student_id?: number;
  student_name?: string;
  attendance_id?: number;
  status?: string;
}

export interface DailyAttendanceRecord {
  student_id: number;
  student_name: string;
  admission_number: string;
  rfid_id?: string;
  class_name?: string;
  section_name?: string;
  parent_phone?: string;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  device_name?: string;
  is_manual_entry: boolean;
  attendance_id?: number;
  sms_sent: boolean;
  whatsapp_sent: boolean;
}

export interface StudentAttendanceSummary {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name?: string;
  section_name?: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  attendance_percentage: number;
}

export interface WeeklyAttendanceSummary extends StudentAttendanceSummary {
  week_start: string;
  week_end: string;
}

export interface MonthlyAttendanceSummary extends StudentAttendanceSummary {
  month: number;
  year: number;
  month_name: string;
}

export interface YearlyAttendanceSummary extends StudentAttendanceSummary {
  year: number;
}

export interface OverallAttendanceSummary extends StudentAttendanceSummary {
  first_attendance?: string;
  last_attendance?: string;
}

export interface StudentAttendanceHistory {
  student: {
    id: number;
    name: string;
    admission_number: string;
    class_name?: string;
    section_name?: string;
    rfid_id?: string;
    mobile_number?: string;
  };
  summary: {
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    attendance_percentage: number;
  };
  history: Array<{
    date: string;
    status: string;
    check_in_time?: string;
    check_out_time?: string;
    is_manual: boolean;
    remarks?: string;
  }>;
}

export interface AttendanceFilters {
  attendance_date?: string;
  class_name?: string;
  section_name?: string;
  status_filter?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary?: {
    present: number;
    absent: number;
    late: number;
    not_marked?: number;
    percentage: number;
    total_students?: number;
    working_days?: number;
    total_records?: number;
  };
}

export interface AttendanceReportFilters {
  from_date: string;
  to_date: string;
  class_name?: string;
  section_name?: string;
}

export interface ManualAttendanceEntry {
  student_id: number;
  attendance_date: string;
  check_in_time?: string;   // "HH:MM"
  check_out_time?: string;  // "HH:MM"
  status: string;
  remarks?: string;
  send_sms: boolean;
  send_whatsapp: boolean;
  update_existing: boolean;
}

const attendanceService = {
  // Process RFID scan
  processScan: async (data: RFIDScanRequest): Promise<RFIDScanResponse> => {
    const response = await api.post('/attendance/scan', data);
    return response.data;
  },

  // Create manual attendance entry (basic)
  createManualAttendance: async (data: AttendanceCreate): Promise<AttendanceLog> => {
    const response = await api.post('/attendance/manual', data);
    return response.data;
  },

  // Create manual attendance entry with notification support
  createManualAttendanceWithNotify: async (data: ManualAttendanceEntry): Promise<any> => {
    const response = await api.post('/attendance/manual-entry', data);
    return response.data;
  },

  // Get daily attendance
  getDailyAttendance: async (filters: AttendanceFilters): Promise<PaginatedResponse<DailyAttendanceRecord>> => {
    const response = await api.get('/attendance/daily', { params: filters });
    return response.data;
  },

  // Get attendance report
  getAttendanceReport: async (filters: AttendanceReportFilters): Promise<StudentAttendanceSummary[]> => {
    const response = await api.get('/attendance/report', { params: filters });
    return response.data;
  },

  // Update attendance record
  updateAttendance: async (id: number, data: AttendanceUpdate): Promise<AttendanceLog> => {
    const response = await api.put(`/attendance/${id}`, data);
    return response.data;
  },

  // Delete attendance record
  deleteAttendance: async (id: number): Promise<void> => {
    await api.delete(`/attendance/${id}`);
  },

  // Mark bulk absent
  markBulkAbsent: async (
    attendance_date?: string,
    class_name?: string,
    section_name?: string,
    send_sms?: boolean
  ): Promise<{message: string; absent_count: number; sms_sent: number; date: string}> => {
    const params: Record<string, any> = {};
    if (attendance_date) params.attendance_date = attendance_date;
    if (class_name) params.class_name = class_name;
    if (section_name) params.section_name = section_name;
    if (send_sms) params.send_sms = send_sms;
    
    const response = await api.post('/attendance/mark-bulk-absent', null, { params });
    return response.data;
  },

  // Get live attendance (recent entries)
  getLiveAttendance: async (limit?: number): Promise<AttendanceLog[]> => {
    const params = limit ? { limit } : {};
    const response = await api.get('/attendance/live', { params });
    return response.data;
  },

  // Send notifications (SMS/WhatsApp) to selected students
  sendNotifications: async (
    studentIds: number[],
    attendanceDate?: string,
    channels: 'sms' | 'whatsapp' | 'both' = 'both'
  ): Promise<{ message: string; sms_sent: number; whatsapp_sent: number; errors: string[] }> => {
    const params = new URLSearchParams();
    studentIds.forEach(id => params.append('student_ids', String(id)));
    if (attendanceDate) params.append('attendance_date', attendanceDate);
    params.append('channels', channels);
    const response = await api.post(`/attendance/send-notifications?${params}`);
    return response.data;
  },

  // Get weekly attendance summary
  getWeeklyAttendance: async (
    weekStartDate: string,
    className?: string,
    sectionName?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<WeeklyAttendanceSummary>> => {
    const params: Record<string, any> = { week_start_date: weekStartDate, page, page_size: pageSize };
    if (className) params.class_name = className;
    if (sectionName) params.section_name = sectionName;
    if (search) params.search = search;
    const response = await api.get('/attendance/summary/weekly', { params });
    return response.data;
  },

  // Get monthly attendance summary
  getMonthlyAttendance: async (
    year: number,
    month: number,
    className?: string,
    sectionName?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<MonthlyAttendanceSummary>> => {
    const params: Record<string, any> = { year, month, page, page_size: pageSize };
    if (className) params.class_name = className;
    if (sectionName) params.section_name = sectionName;
    if (search) params.search = search;
    const response = await api.get('/attendance/summary/monthly', { params });
    return response.data;
  },

  // Get yearly attendance summary
  getYearlyAttendance: async (
    year: number,
    className?: string,
    sectionName?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<YearlyAttendanceSummary>> => {
    const params: Record<string, any> = { year, page, page_size: pageSize };
    if (className) params.class_name = className;
    if (sectionName) params.section_name = sectionName;
    if (search) params.search = search;
    const response = await api.get('/attendance/summary/yearly', { params });
    return response.data;
  },

  // Get overall attendance summary
  getOverallAttendance: async (
    className?: string,
    sectionName?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<OverallAttendanceSummary>> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (className) params.class_name = className;
    if (sectionName) params.section_name = sectionName;
    if (search) params.search = search;
    const response = await api.get('/attendance/summary/overall', { params });
    return response.data;
  },

  // Get individual student attendance history
  getStudentHistory: async (
    studentId: number,
    year?: number,
    month?: number
  ): Promise<StudentAttendanceHistory> => {
    const params: Record<string, any> = {};
    if (year) params.year = year;
    if (month) params.month = month;
    const response = await api.get(`/attendance/student/${studentId}/history`, { params });
    return response.data;
  },
};

// ==================== STAFF ATTENDANCE TYPES ====================

export interface StaffAttendanceRecord {
  staff_id: number;
  staff_name: string;
  employee_id?: string;
  rfid?: string;
  designation?: string;
  department_name?: string;
  mobile?: string;
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: string;
  is_manual_entry: boolean;
  attendance_id?: number;
  remarks?: string;
}

export interface StaffAttendanceSummary {
  staff_id: number;
  staff_name: string;
  employee_id?: string;
  designation?: string;
  department_name?: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  attendance_percentage: number;
}

export interface StaffWeeklySummary extends StaffAttendanceSummary {
  week_start: string;
  week_end: string;
}

export interface StaffMonthlySummary extends StaffAttendanceSummary {
  month: number;
  year: number;
  month_name: string;
}

export interface StaffYearlySummary extends StaffAttendanceSummary {
  year: number;
}

export interface StaffOverallSummary extends StaffAttendanceSummary {
  first_attendance?: string;
  last_attendance?: string;
}

export interface StaffAttendanceHistory {
  staff: {
    id: number;
    name: string;
    employee_id?: string;
    designation?: string;
    department_name?: string;
    rfid?: string;
    mobile?: string;
  };
  summary: {
    total_days: number;
    present_days: number;
    absent_days: number;
    late_days: number;
    attendance_percentage: number;
  };
  history: Array<{
    date: string;
    status: string;
    check_in_time?: string;
    check_out_time?: string;
    is_manual: boolean;
    remarks?: string;
  }>;
}

export interface StaffAttendanceFilters {
  attendance_date?: string;
  department?: string;
  designation?: string;
  status_filter?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export const staffAttendanceService = {
  // Get staff daily attendance
  getStaffDailyAttendance: async (filters: StaffAttendanceFilters): Promise<PaginatedResponse<StaffAttendanceRecord>> => {
    const response = await api.get('/staff-attendance/daily', { params: filters });
    return response.data;
  },

  // Get staff live feed
  getStaffLiveAttendance: async (limit?: number): Promise<any[]> => {
    const params = limit ? { limit } : {};
    const response = await api.get('/staff-attendance/live', { params });
    return response.data;
  },

  // Admin manual entry for staff
  createStaffManualAttendance: async (data: {
    staff_id: number;
    attendance_date: string;
    check_in_time?: string;
    check_out_time?: string;
    status?: string;
    remarks?: string;
    update_existing?: boolean;
  }): Promise<any> => {
    const params: Record<string, any> = {
      staff_id: data.staff_id,
      attendance_date: data.attendance_date,
    };
    if (data.check_in_time) params.check_in_time = data.check_in_time;
    if (data.check_out_time) params.check_out_time = data.check_out_time;
    if (data.status) params.staff_status = data.status;
    if (data.remarks) params.remarks = data.remarks;
    if (data.update_existing) params.update_existing = data.update_existing;
    const response = await api.post('/staff-attendance/manual-entry', null, { params });
    return response.data;
  },

  // Staff self check-in
  staffSelfCheckin: async (checkInTime?: string, remarks?: string): Promise<any> => {
    const params: Record<string, any> = {};
    if (checkInTime) params.check_in_time = checkInTime;
    if (remarks) params.remarks = remarks;
    const response = await api.post('/staff-attendance/self-checkin', null, { params });
    return response.data;
  },

  // Staff self check-out
  staffSelfCheckout: async (checkOutTime?: string, remarks?: string): Promise<any> => {
    const params: Record<string, any> = {};
    if (checkOutTime) params.check_out_time = checkOutTime;
    if (remarks) params.remarks = remarks;
    const response = await api.post('/staff-attendance/self-checkout', null, { params });
    return response.data;
  },

  // Mark bulk absent
  markStaffBulkAbsent: async (
    attendanceDate?: string,
    department?: string
  ): Promise<{ message: string; absent_count: number; date: string }> => {
    const params: Record<string, any> = {};
    if (attendanceDate) params.attendance_date = attendanceDate;
    if (department) params.department = department;
    const response = await api.post('/staff-attendance/mark-bulk-absent', null, { params });
    return response.data;
  },

  // Weekly summary
  getStaffWeeklyAttendance: async (
    weekStartDate: string,
    department?: string,
    designation?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<StaffWeeklySummary>> => {
    const params: Record<string, any> = { week_start_date: weekStartDate, page, page_size: pageSize };
    if (department) params.department = department;
    if (designation) params.designation = designation;
    if (search) params.search = search;
    const response = await api.get('/staff-attendance/summary/weekly', { params });
    return response.data;
  },

  // Monthly summary
  getStaffMonthlyAttendance: async (
    year: number,
    month: number,
    department?: string,
    designation?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<StaffMonthlySummary>> => {
    const params: Record<string, any> = { year, month, page, page_size: pageSize };
    if (department) params.department = department;
    if (designation) params.designation = designation;
    if (search) params.search = search;
    const response = await api.get('/staff-attendance/summary/monthly', { params });
    return response.data;
  },

  // Yearly summary
  getStaffYearlyAttendance: async (
    year: number,
    department?: string,
    designation?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<StaffYearlySummary>> => {
    const params: Record<string, any> = { year, page, page_size: pageSize };
    if (department) params.department = department;
    if (designation) params.designation = designation;
    if (search) params.search = search;
    const response = await api.get('/staff-attendance/summary/yearly', { params });
    return response.data;
  },

  // Overall summary
  getStaffOverallAttendance: async (
    department?: string,
    designation?: string,
    page: number = 1,
    pageSize: number = 20,
    search?: string
  ): Promise<PaginatedResponse<StaffOverallSummary>> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (department) params.department = department;
    if (designation) params.designation = designation;
    if (search) params.search = search;
    const response = await api.get('/staff-attendance/summary/overall', { params });
    return response.data;
  },

  // Staff attendance history
  getStaffHistory: async (
    staffId: number,
    year?: number,
    month?: number
  ): Promise<StaffAttendanceHistory> => {
    const params: Record<string, any> = {};
    if (year) params.year = year;
    if (month) params.month = month;
    const response = await api.get(`/staff-attendance/staff/${staffId}/history`, { params });
    return response.data;
  },
};

export default attendanceService;
