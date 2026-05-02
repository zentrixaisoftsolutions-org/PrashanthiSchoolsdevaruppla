import api from './api';

export interface DashboardStats {
  students: {
    total: number;
    male: number;
    female: number;
    new_this_month: number;
  };
  staff: {
    teachers: number;
    total_staff: number;
  };
  academics: {
    classes: number;
    sections: number;
    class_sections: number;
    subjects: number;
    exams: number;
    academic_year: {
      id: number;
      name: string;
      start_date: string | null;
      end_date: string | null;
    } | null;
  };
  attendance: {
    today: {
      present: number;
      absent: number;
      late: number;
      not_marked: number;
      total_students: number;
      percentage: number;
    };
    trend: {
      date: string;
      day: string;
      present: number;
      absent: number;
      late: number;
      total: number;
    }[];
  };
  fees: {
    collected_today: number;
    collected_this_year: number;
    pending_this_year: number;
    total_expected: number;
  };
  charts: {
    class_wise_students: { class_name: string; count: number; class_teachers: string[] }[];
    gender_distribution: { label: string; value: number; color: string }[];
  };
  recent_students: {
    id: number;
    name: string;
    admission_number: string;
    created_at: string | null;
  }[];
  generated_at: string;
}

export interface ClassTopperInfo {
  class_section: string;
  student_name: string;
  cgpa: number | null;
  cg: string | null;
  attendance_percentage: number;
}

export interface TopperExam {
  id: number;
  name: string;
}

const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get<DashboardStats>('/dashboard/stats');
    return response.data;
  },

  getTopperExams: async (): Promise<TopperExam[]> => {
    const response = await api.get<TopperExam[]>('/dashboard/class-topper-exams');
    return response.data;
  },

  getClassToppers: async (examTypeId?: number): Promise<ClassTopperInfo[]> => {
    const params = examTypeId ? `?exam_type_id=${examTypeId}` : '';
    const response = await api.get<ClassTopperInfo[]>(`/dashboard/class-toppers${params}`);
    return response.data;
  },
};

export default dashboardService;
