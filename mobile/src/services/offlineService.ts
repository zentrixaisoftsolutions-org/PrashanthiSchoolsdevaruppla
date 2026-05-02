import NetInfo from '@react-native-community/netinfo';
import { executeQuery, executeUpdate } from '../database/database';
import {
  Student,
  Attendance,
  Exam,
  FeePayment,
  DashboardStats,
} from '../types';

// Network status
let isOnline = true;
let networkStatusCallbacks: ((status: boolean) => void)[] = [];

// Initialize network listener
export const initNetworkListener = () => {
  NetInfo.addEventListener((state) => {
    const newStatus = state.isConnected ?? false;
    if (newStatus !== isOnline) {
      isOnline = newStatus;
      networkStatusCallbacks.forEach((callback) => callback(isOnline));
    }
  });
};

// Subscribe to network status changes
export const subscribeToNetworkStatus = (
  callback: (status: boolean) => void
) => {
  networkStatusCallbacks.push(callback);
  return () => {
    networkStatusCallbacks = networkStatusCallbacks.filter(
      (cb) => cb !== callback
    );
  };
};

// Get current network status
export const getNetworkStatus = (): boolean => isOnline;

// Offline Students Service
export const offlineStudentsService = {
  getAll: async (): Promise<Student[]> => {
    return executeQuery<Student>('SELECT * FROM students WHERE is_active = 1');
  },

  getById: async (id: number): Promise<Student | null> => {
    const results = await executeQuery<Student>(
      'SELECT * FROM students WHERE id = ?',
      [id]
    );
    return results[0] || null;
  },

  save: async (students: Student[]): Promise<void> => {
    for (const student of students) {
      await executeUpdate(
        `INSERT OR REPLACE INTO students 
        (id, first_name, middle_name, last_name, date_of_birth, gender, 
         blood_group, admission_number, admission_date, class_section_id, 
         parent_id, is_active, photo_url, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          student.id,
          student.first_name,
          student.middle_name || null,
          student.last_name,
          student.date_of_birth,
          student.gender,
          student.blood_group || null,
          student.admission_number,
          student.admission_date,
          student.class_section_id,
          student.parent_id || null,
          student.is_active ? 1 : 0,
          student.photo_url || null,
        ]
      );
    }
  },
};

// Offline Attendance Service
export const offlineAttendanceService = {
  getByDate: async (date: string): Promise<Attendance[]> => {
    return executeQuery<Attendance>(
      'SELECT * FROM attendance WHERE attendance_date = ?',
      [date]
    );
  },

  save: async (attendanceRecords: Attendance[]): Promise<void> => {
    for (const record of attendanceRecords) {
      await executeUpdate(
        `INSERT OR REPLACE INTO attendance 
        (id, student_id, class_section_id, attendance_date, status, remarks, synced)
        VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          record.id,
          record.student_id,
          record.class_section_id,
          record.attendance_date,
          record.status,
          record.remarks || null,
        ]
      );
    }
  },
};

// Offline Exams Service
export const offlineExamsService = {
  getAll: async (): Promise<Exam[]> => {
    return executeQuery<Exam>('SELECT * FROM exams');
  },

  save: async (exams: Exam[]): Promise<void> => {
    for (const exam of exams) {
      await executeUpdate(
        `INSERT OR REPLACE INTO exams 
        (id, exam_type_id, class_section_id, subject_id, exam_date, 
         total_marks, passing_marks)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          exam.id,
          exam.exam_type_id,
          exam.class_section_id,
          exam.subject_id,
          exam.exam_date,
          exam.total_marks,
          exam.passing_marks,
        ]
      );
    }
  },
};

// Offline Fees Service
export const offlineFeesService = {
  getAllPayments: async (): Promise<FeePayment[]> => {
    return executeQuery<FeePayment>('SELECT * FROM fee_payments');
  },

  getStudentPayments: async (studentId: number): Promise<FeePayment[]> => {
    return executeQuery<FeePayment>(
      'SELECT * FROM fee_payments WHERE student_id = ?',
      [studentId]
    );
  },

  save: async (payments: FeePayment[]): Promise<void> => {
    for (const payment of payments) {
      await executeUpdate(
        `INSERT OR REPLACE INTO fee_payments 
        (id, student_id, fee_structure_id, amount_paid, payment_date, 
         payment_mode, transaction_id, remarks, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          payment.id,
          payment.student_id,
          payment.fee_structure_id,
          payment.amount_paid,
          payment.payment_date,
          payment.payment_mode,
          payment.transaction_id || null,
          payment.remarks || null,
        ]
      );
    }
  },
};

// Offline Dashboard Service
export const offlineDashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const results = await executeQuery<DashboardStats>(
      'SELECT * FROM dashboard_stats WHERE id = 1'
    );
    return (
      results[0] || {
        total_students: 0,
        total_teachers: 0,
        total_classes: 0,
        present_today: 0,
        absent_today: 0,
        pending_fees: 0,
      }
    );
  },

  saveStats: async (stats: DashboardStats): Promise<void> => {
    await executeUpdate(
      `UPDATE dashboard_stats SET 
       total_students = ?, total_teachers = ?, total_classes = ?,
       present_today = ?, absent_today = ?, pending_fees = ?,
       last_updated = datetime('now')
       WHERE id = 1`,
      [
        stats.total_students,
        stats.total_teachers,
        stats.total_classes,
        stats.present_today,
        stats.absent_today,
        stats.pending_fees,
      ]
    );
  },
};
