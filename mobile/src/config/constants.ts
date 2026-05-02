// API Base URL Configuration
// You can configure different URLs for different environments

// Development URL - Update with your local IP address
// For Android Emulator, use http://10.0.2.2:8000
const DEV_API_URL = 'http://178.156.251.34:8000';

// Production URL - Update with your production server URL
const PROD_API_URL = 'http://178.156.251.34:8000';

// Staging URL (optional)
const STAGING_API_URL = 'http://178.156.251.34:8000';

// Environment detection
// You can override by setting process.env.REACT_APP_ENV to 'development', 'staging', or 'production'
const getApiBaseUrl = (): string => {
  // Check for custom environment variable
  const customEnv = process.env.REACT_APP_ENV;
  
  if (customEnv === 'production') {
    return PROD_API_URL;
  } else if (customEnv === 'staging') {
    return STAGING_API_URL;
  } else if (customEnv === 'development') {
    return DEV_API_URL;
  }
  
  // Default: Use __DEV__ flag (true in development, false in production builds)
  return __DEV__ ? DEV_API_URL : PROD_API_URL;
};

export const API_BASE_URL = getApiBaseUrl();

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/api/auth/login',
  REGISTER: '/api/auth/register',
  USERS: '/api/auth/users',
  ROLES: '/api/auth/roles',
  CHANGE_PASSWORD: '/api/auth/change-password',
  
  // Students
  STUDENTS: '/api/students',
  STUDENT_DETAIL: (id: number) => `/api/students/${id}`,
  STUDENTS_SEARCH_OPTIONS: '/api/students/search-options',
  STUDENTS_CLASSES: '/api/students/classes',
  STUDENTS_IMPORT_CSV: '/api/students/import-csv',
  STUDENTS_EXPORT_CSV: '/api/students/export/csv',
  
  // Classes
  CLASS_NAMES: '/api/class-names',
  SECTIONS: '/api/sections',
  CLASS_SECTIONS: '/api/class-sections',
  
  // Attendance
  ATTENDANCE: '/api/attendance',
  ATTENDANCE_DAILY: '/api/attendance/daily',
  ATTENDANCE_SUMMARY: '/api/attendance/summary',
  ATTENDANCE_DEVICE: '/api/attendance/device',
  ATTENDANCE_STUDENT_HISTORY: (id: number) => `/api/attendance/student/${id}/history`,
  ATTENDANCE_SEND_NOTIFICATIONS: '/api/attendance/send-notifications',
  ATTENDANCE_MANUAL_ENTRY: '/api/attendance/manual-entry',
  ATTENDANCE_MARK_BULK_ABSENT: '/api/attendance/mark-bulk-absent',

  // Staff Attendance
  STAFF_ATTENDANCE_DAILY: '/api/staff-attendance/daily',
  STAFF_ATTENDANCE_SUMMARY: '/api/staff-attendance/summary',
  STAFF_ATTENDANCE_HISTORY: (id: number) => `/api/staff-attendance/staff/${id}/history`,
  STAFF_ATTENDANCE_MANUAL_ENTRY: '/api/staff-attendance/manual-entry',
  STAFF_ATTENDANCE_MARK_BULK_ABSENT: '/api/staff-attendance/mark-bulk-absent',
  
  // Subjects
  SUBJECTS: '/api/subjects',
  
  // Exams & Results
  EXAM_TYPES: '/api/exam-types',
  EXAMINATION_SCHEDULES: '/api/examination-schedules',
  MARKS_ENTRY: '/api/marks-entry',
  RESULTS: '/api/results',
  
  // Fees
  FEE_STRUCTURE: '/api/fees/structures',
  FEE_PAYMENT: '/api/fees/payments',
  FEE_SUMMARY: '/api/fees/summary',
  
  // Staff
  DEPARTMENTS: '/api/departments',
  STAFF: '/api/staff',
  STAFF_ATTENDANCE: '/api/staff-attendance',
  STAFF_SALARY: '/api/staff-salary',
  
  // Dashboard
  DASHBOARD: '/api/dashboard',
  DASHBOARD_STATS: '/api/dashboard/stats',
  DASHBOARD_PARENT: '/api/dashboard/parent',
  
  // Parent-specific
  MY_CHILDREN: '/api/students/my-children',
  MY_CHILDREN_ATTENDANCE: '/api/attendance/my-children',
  MY_CHILDREN_FEES: '/api/fees/my-children',
  MY_CHILDREN_RESULTS: '/api/results/my-children',
  
  // Academic
  ACADEMIC_YEARS: '/api/academic-years',
  ACADEMIC_CALENDAR: '/api/academic-calendar',
  
  // Reports
  REPORTS_ANNUAL: '/api/reports/annual-report',
  REPORTS_ASSESSMENT: '/api/reports/assessment-report',
  
  // Settings
  SCHOOL_SETTINGS: '/api/school-settings',
  ROLE_ACCESS: '/api/role-access',

  // Push Notifications
  REGISTER_PUSH_TOKEN: '/api/notifications/register-token',
  UNREGISTER_PUSH_TOKEN: '/api/notifications/unregister-token',

  // Staff
  STAFF_LIST: '/api/staff',

  // Class Management
  GRADES: '/api/grades',

  // Devices
  DEVICES: '/api/devices',

  // Payment Gateway
  PAYMENT_GATEWAY: '/api/payment-gateway/configs',

  // SMS / WhatsApp
  SMS_SETTINGS: '/api/sms',
  WHATSAPP_SETTINGS: '/api/whatsapp',

  // User Management
  USER_MANAGEMENT: '/api/auth/users',

  // Notifications (admin send)
  SEND_FEE_REMINDERS: '/api/notifications/send-fee-reminders',
  SEND_FEE_EMAILS: '/api/notifications/send-fee-emails',

  // Term Due Dates
  TERM_DUE_DATES: '/api/fees/term-due-dates',
};

// App Configuration
export const APP_CONFIG = {
  APP_NAME: 'KRISHNAVENI TALENT HIGH SCHOOL',
  VERSION: '1.0.0',
  TOKEN_KEY: 'access_token',
  USER_KEY: 'user_data',
  MENU_ACCESS_KEY: 'menu_access',
  DEMO_TOKEN_KEY: 'demo_access_token',
};

// Offline demo credentials used when API is unreachable
export const OFFLINE_DEMO_CREDENTIALS = {
  EMAIL: 'parent@kts.com',
  PASSWORD: '123456',
  ROLE: 'parent',
};

// Role Constants
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
  PARENT: 'parent',
};

// Colors
export const COLORS = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#1f2937',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
};
