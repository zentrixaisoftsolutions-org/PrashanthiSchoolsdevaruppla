import api from './api';

export interface ExamType {
  id: number;
  name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExamTypeCreate {
  name: string;
  academic_year_id?: number | null;
  description?: string;
}

export interface ExamTypeUpdate {
  name?: string;
  academic_year_id?: number | null;
  description?: string;
  is_active?: boolean;
}

export interface ExamTypeListParams {
  academic_year_id?: number;
  include_inactive?: boolean;
  skip?: number;
  limit?: number;
}

const examTypeService = {
  listExamTypes: async (params: ExamTypeListParams = {}): Promise<ExamType[]> => {
    const queryParams = new URLSearchParams();
    if (params.academic_year_id !== undefined) {
      queryParams.append('academic_year_id', params.academic_year_id.toString());
    }
    if (params.include_inactive) {
      queryParams.append('include_inactive', 'true');
    }
    if (params.skip !== undefined) {
      queryParams.append('skip', params.skip.toString());
    }
    if (params.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    const query = queryParams.toString();
    const response = await api.get<ExamType[]>(`/exam-types/${query ? '?' + query : ''}`);
    return response.data;
  },

  countExamTypes: async (params: { academic_year_id?: number; include_inactive?: boolean } = {}): Promise<number> => {
    const queryParams = new URLSearchParams();
    if (params.academic_year_id !== undefined) {
      queryParams.append('academic_year_id', params.academic_year_id.toString());
    }
    if (params.include_inactive) {
      queryParams.append('include_inactive', 'true');
    }
    const query = queryParams.toString();
    const response = await api.get<{ count: number }>(`/exam-types/count${query ? '?' + query : ''}`);
    return response.data.count;
  },

  getExamType: async (examTypeId: number): Promise<ExamType> => {
    const response = await api.get<ExamType>(`/exam-types/${examTypeId}`);
    return response.data;
  },

  createExamType: async (data: ExamTypeCreate): Promise<ExamType> => {
    const response = await api.post<ExamType>('/exam-types/', data);
    return response.data;
  },

  updateExamType: async (examTypeId: number, data: ExamTypeUpdate): Promise<ExamType> => {
    const response = await api.put<ExamType>(`/exam-types/${examTypeId}`, data);
    return response.data;
  },

  deleteExamType: async (examTypeId: number): Promise<void> => {
    await api.delete(`/exam-types/${examTypeId}`);
  },
};

export default examTypeService;
