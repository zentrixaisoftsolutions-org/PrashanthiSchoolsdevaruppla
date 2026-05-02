// Additional services for other API endpoints with offline fallback

import apiClient from './apiClient';
import { API_ENDPOINTS } from '../config/constants';
import {
  Student,
  ClassSection,
  Subject,
  Attendance,
  Exam,
  FeePayment,
  DashboardStats,
} from '../types';
import {
  offlineStudentsService,
  offlineAttendanceService,
  offlineExamsService,
  offlineFeesService,
  offlineDashboardService,
} from './offlineService';

export const studentsService = {
  getAll: async () => {
    try {
      const response = await apiClient.get<any>(API_ENDPOINTS.STUDENTS);
      const list: Student[] = Array.isArray(response) ? response : (response.students || []);
      // Cache to local DB
      await offlineStudentsService.save(list);
      return list;
    } catch (error) {
      // Fallback to offline data
      console.log('Using offline students data');
      const data = await offlineStudentsService.getAll();
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  getById: async (id: number) => {
    try {
      return await apiClient.get<Student>(API_ENDPOINTS.STUDENT_DETAIL(id));
    } catch (error) {
      console.log('Using offline student data');
      const data = await offlineStudentsService.getById(id);
      return { data: data!, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  create: (data: Partial<Student>) => apiClient.post<Student>(API_ENDPOINTS.STUDENTS, data),
  update: (id: number, data: Partial<Student>) => 
    apiClient.put<Student>(API_ENDPOINTS.STUDENT_DETAIL(id), data),
  delete: (id: number) => apiClient.delete(API_ENDPOINTS.STUDENT_DETAIL(id)),
};

export const attendanceService = {
  getByDate: async (date: string) => {
    try {
      const response = await apiClient.get<Attendance[]>(`${API_ENDPOINTS.ATTENDANCE}?date=${date}`);
      // Cache to local DB
      await offlineAttendanceService.save(response.data);
      return response;
    } catch (error) {
      console.log('Using offline attendance data');
      const data = await offlineAttendanceService.getByDate(date);
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  getSummary: (classId: number, startDate: string, endDate: string) =>
    apiClient.get(`${API_ENDPOINTS.ATTENDANCE_SUMMARY}?class_id=${classId}&start_date=${startDate}&end_date=${endDate}`),
  markAttendance: (data: Partial<Attendance>) =>
    apiClient.post<Attendance>(API_ENDPOINTS.ATTENDANCE, data),
};

export const examsService = {
  getAll: async () => {
    try {
      const response = await apiClient.get<Exam[]>(API_ENDPOINTS.EXAMINATION_SCHEDULES);
      // Cache to local DB
      await offlineExamsService.save(response.data);
      return response;
    } catch (error) {
      console.log('Using offline exams data');
      const data = await offlineExamsService.getAll();
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  getById: (id: number) => apiClient.get<Exam>(`${API_ENDPOINTS.EXAMINATION_SCHEDULES}/${id}`),
  getResults: (studentId: number) =>
    apiClient.get(`${API_ENDPOINTS.RESULTS}?student_id=${studentId}`),
};

export const feesService = {
  getAllPayments: async () => {
    try {
      const response = await apiClient.get<FeePayment[]>(API_ENDPOINTS.FEE_PAYMENT);
      // Cache to local DB
      await offlineFeesService.save(response.data);
      return response;
    } catch (error) {
      console.log('Using offline fees data');
      const data = await offlineFeesService.getAllPayments();
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  getStudentPayments: async (studentId: number) => {
    try {
      const response = await apiClient.get<FeePayment[]>(`${API_ENDPOINTS.FEE_PAYMENT}?student_id=${studentId}`);
      await offlineFeesService.save(response.data);
      return response;
    } catch (error) {
      console.log('Using offline student fees data');
      const data = await offlineFeesService.getStudentPayments(studentId);
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
  
  getSummary: (studentId?: number) =>
    apiClient.get(`${API_ENDPOINTS.FEE_SUMMARY}${studentId ? `?student_id=${studentId}` : ''}`),
  makePayment: (data: Partial<FeePayment>) =>
    apiClient.post<FeePayment>(API_ENDPOINTS.FEE_PAYMENT, data),
};

export const dashboardService = {
  getStats: async () => {
    try {
      const response = await apiClient.get<DashboardStats>(API_ENDPOINTS.DASHBOARD);
      // Cache to local DB
      await offlineDashboardService.saveStats(response.data);
      return response;
    } catch (error) {
      console.log('Using offline dashboard data');
      const data = await offlineDashboardService.getStats();
      return { data, status: 200, statusText: 'OK (Offline)', headers: {}, config: {} as any };
    }
  },
};

export const classService = {
  getAllClasses: () => apiClient.get<ClassSection[]>(API_ENDPOINTS.CLASS_SECTIONS),
  getClassNames: () => apiClient.get(API_ENDPOINTS.CLASS_NAMES),
  getSections: () => apiClient.get(API_ENDPOINTS.SECTIONS),
};

export const subjectsService = {
  getAll: () => apiClient.get<Subject[]>(API_ENDPOINTS.SUBJECTS),
  getById: (id: number) => apiClient.get<Subject>(`${API_ENDPOINTS.SUBJECTS}/${id}`),
};
