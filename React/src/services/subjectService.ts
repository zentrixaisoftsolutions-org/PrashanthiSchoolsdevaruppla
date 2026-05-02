import api from './api';

export interface ClassSectionInfo {
  id: number;
  class_name: string;
  section_name: string;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  class_sections?: ClassSectionInfo[];
}

export interface SubjectCreateRequest {
  name: string;
  code: string;
  description?: string;
}

const subjectService = {
  listSubjects: async (): Promise<Subject[]> => {
    const response = await api.get<Subject[]>('/subjects/');
    return response.data;
  },

  getSubject: async (subjectId: number): Promise<Subject> => {
    const response = await api.get<Subject>(`/subjects/${subjectId}`);
    return response.data;
  },

  createSubject: async (data: SubjectCreateRequest): Promise<Subject> => {
    const response = await api.post<Subject>('/subjects/', data);
    return response.data;
  },

  updateSubject: async (subjectId: number, data: Partial<Subject>): Promise<Subject> => {
    const response = await api.put<Subject>(`/subjects/${subjectId}`, data);
    return response.data;
  },

  deleteSubject: async (subjectId: number): Promise<void> => {
    await api.delete(`/subjects/${subjectId}`);
  },

  assignClassSections: async (subjectId: number, classSectionIds: number[]): Promise<Subject> => {
    const response = await api.post<Subject>(`/subjects/${subjectId}/class-sections`, {
      class_section_ids: classSectionIds
    });
    return response.data;
  },

  getSubjectClassSections: async (subjectId: number): Promise<number[]> => {
    const response = await api.get<{ class_section_ids: number[] }>(`/subjects/${subjectId}/class-sections`);
    return response.data.class_section_ids;
  },

  getSubjectsByClassSections: async (classSectionIds: number[]): Promise<Subject[]> => {
    const response = await api.post<Subject[]>('/subjects/by-class-sections', {
      class_section_ids: classSectionIds
    });
    return response.data;
  },
};

export default subjectService;
