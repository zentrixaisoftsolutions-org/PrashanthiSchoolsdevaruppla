import api from './api';

export interface ExaminationScheduleClassSection {
  id: number;
  class_name: string;
  section_name: string;
}

export interface ExaminationScheduleSubject {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  exam_date: string;
  start_time: string | null;
  end_time: string | null;
  max_marks: number;
  pass_marks: number;
  display_order: number;
}

export interface ExaminationScheduleSubjectInput {
  subject_id: number;
  exam_date: string;
  start_time?: string | null;
  end_time?: string | null;
  max_marks?: number;
  pass_marks?: number;
  display_order?: number;
}

export interface ExaminationSchedule {
  id: number;
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  from_date: string;
  to_date: string;
  is_active: boolean;
  class_sections: ExaminationScheduleClassSection[];
  subjects: ExaminationScheduleSubject[];
  created_at: string;
  updated_at: string;
}

export interface ExaminationScheduleCreate {
  exam_type_id: number;
  academic_year_id?: number | null;
  from_date: string;
  to_date: string;
  class_section_ids: number[];
  subjects?: ExaminationScheduleSubjectInput[];
}

export interface ExaminationScheduleUpdate {
  exam_type_id?: number;
  academic_year_id?: number | null;
  from_date?: string;
  to_date?: string;
  class_section_ids?: number[];
  subjects?: ExaminationScheduleSubjectInput[];
  is_active?: boolean;
}

export interface ExaminationScheduleListParams {
  academic_year_id?: number;
  exam_type_id?: number;
  include_inactive?: boolean;
  skip?: number;
  limit?: number;
}

const examinationScheduleService = {
  listExaminationSchedules: async (params: ExaminationScheduleListParams = {}): Promise<ExaminationSchedule[]> => {
    const queryParams = new URLSearchParams();
    if (params.academic_year_id !== undefined) {
      queryParams.append('academic_year_id', params.academic_year_id.toString());
    }
    if (params.exam_type_id !== undefined) {
      queryParams.append('exam_type_id', params.exam_type_id.toString());
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
    const response = await api.get<ExaminationSchedule[]>(`/examination-schedules/${query ? '?' + query : ''}`);
    return response.data;
  },

  countExaminationSchedules: async (params: { academic_year_id?: number; exam_type_id?: number; include_inactive?: boolean } = {}): Promise<number> => {
    const queryParams = new URLSearchParams();
    if (params.academic_year_id !== undefined) {
      queryParams.append('academic_year_id', params.academic_year_id.toString());
    }
    if (params.exam_type_id !== undefined) {
      queryParams.append('exam_type_id', params.exam_type_id.toString());
    }
    if (params.include_inactive) {
      queryParams.append('include_inactive', 'true');
    }
    const query = queryParams.toString();
    const response = await api.get<{ count: number }>(`/examination-schedules/count${query ? '?' + query : ''}`);
    return response.data.count;
  },

  getExaminationSchedule: async (scheduleId: number): Promise<ExaminationSchedule> => {
    const response = await api.get<ExaminationSchedule>(`/examination-schedules/${scheduleId}`);
    return response.data;
  },

  createExaminationSchedule: async (data: ExaminationScheduleCreate): Promise<ExaminationSchedule> => {
    const response = await api.post<ExaminationSchedule>('/examination-schedules/', data);
    return response.data;
  },

  updateExaminationSchedule: async (scheduleId: number, data: ExaminationScheduleUpdate): Promise<ExaminationSchedule> => {
    const response = await api.put<ExaminationSchedule>(`/examination-schedules/${scheduleId}`, data);
    return response.data;
  },

  deleteExaminationSchedule: async (scheduleId: number): Promise<void> => {
    await api.delete(`/examination-schedules/${scheduleId}`);
  },

  getScheduleClassSections: async (scheduleId: number): Promise<number[]> => {
    const response = await api.get<{ class_section_ids: number[] }>(`/examination-schedules/${scheduleId}/class-sections`);
    return response.data.class_section_ids;
  },
};

export default examinationScheduleService;
