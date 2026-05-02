import api from './api';

export interface GradeCriteria {
  id: number;
  min_percentage: number;
  max_percentage: number;
  grade: string;
  teacher_remarks?: string;
  grade_point?: number;
  general_remarks?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface GradeCriteriaCreate {
  min_percentage: number;
  max_percentage: number;
  grade: string;
  teacher_remarks?: string;
  grade_point?: number;
  general_remarks?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface GradeCriteriaUpdate {
  min_percentage?: number;
  max_percentage?: number;
  grade?: string;
  teacher_remarks?: string;
  grade_point?: number;
  general_remarks?: string;
  is_active?: boolean;
  display_order?: number;
}

export interface GradeCalculation {
  percentage: number;
  grade: string;
  grade_point: number;
  teacher_remarks: string;
  general_remarks: string;
}

const gradeService = {
  listGrades: async (includeInactive: boolean = false): Promise<GradeCriteria[]> => {
    const response = await api.get<GradeCriteria[]>(`/grades/?include_inactive=${includeInactive}`);
    return response.data;
  },

  getGrade: async (gradeId: number): Promise<GradeCriteria> => {
    const response = await api.get<GradeCriteria>(`/grades/${gradeId}`);
    return response.data;
  },

  createGrade: async (data: GradeCriteriaCreate): Promise<GradeCriteria> => {
    const response = await api.post<GradeCriteria>('/grades/', data);
    return response.data;
  },

  updateGrade: async (gradeId: number, data: GradeCriteriaUpdate): Promise<GradeCriteria> => {
    const response = await api.put<GradeCriteria>(`/grades/${gradeId}`, data);
    return response.data;
  },

  deleteGrade: async (gradeId: number): Promise<void> => {
    await api.delete(`/grades/${gradeId}`);
  },

  bulkUpdate: async (criteria: GradeCriteriaCreate[]): Promise<GradeCriteria[]> => {
    const response = await api.post<GradeCriteria[]>('/grades/bulk-update', { criteria });
    return response.data;
  },

  seedDefaults: async (): Promise<GradeCriteria[]> => {
    const response = await api.post<GradeCriteria[]>('/grades/seed-defaults');
    return response.data;
  },

  calculateGrade: async (percentage: number): Promise<GradeCalculation> => {
    const response = await api.get<GradeCalculation>(`/grades/calculate/${percentage}`);
    return response.data;
  },
};

export default gradeService;
