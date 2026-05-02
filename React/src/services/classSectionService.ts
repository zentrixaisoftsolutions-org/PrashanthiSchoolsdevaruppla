import api from './api';
import { Section } from './sectionService';

export interface ClassSection {
  id: number;
  class_name_id: number;
  class_name: string;
  section_id: number;
  section_name: string;
  capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface ClassWithSections {
  id: number;
  name: string;
  display_order: number;
  description?: string;
  is_active: boolean;
  sections: Section[];
}

export interface ClassSectionCreateRequest {
  class_name_id: number;
  section_id: number;
  capacity?: number;
}

export interface ClassSectionBulkAssignRequest {
  class_name_id: number;
  section_ids: number[];
  capacity?: number;
}

export interface ClassSectionUpdateRequest {
  capacity?: number;
  is_active?: boolean;
}

const classSectionService = {
  listClassSections: async (classNameId?: number, includeInactive: boolean = false): Promise<ClassSection[]> => {
    const params: any = { include_inactive: includeInactive };
    if (classNameId) params.class_name_id = classNameId;
    const response = await api.get<ClassSection[]>('/class-sections/', { params });
    return response.data;
  },

  createClassSection: async (data: ClassSectionCreateRequest): Promise<ClassSection> => {
    const response = await api.post<ClassSection>('/class-sections/', data);
    return response.data;
  },

  bulkAssignSections: async (data: ClassSectionBulkAssignRequest): Promise<ClassSection[]> => {
    const response = await api.post<ClassSection[]>('/class-sections/bulk', data);
    return response.data;
  },

  getClassWithSections: async (classNameId: number): Promise<ClassWithSections> => {
    const response = await api.get<ClassWithSections>(`/class-sections/by-class/${classNameId}`);
    return response.data;
  },

  listClassesWithSections: async (): Promise<ClassWithSections[]> => {
    const response = await api.get<ClassWithSections[]>('/class-sections/classes-with-sections');
    return response.data;
  },

  updateClassSection: async (mappingId: number, data: ClassSectionUpdateRequest): Promise<ClassSection> => {
    const response = await api.put<ClassSection>(`/class-sections/${mappingId}`, data);
    return response.data;
  },

  deleteClassSection: async (mappingId: number): Promise<void> => {
    await api.delete(`/class-sections/${mappingId}`);
  },
};

export default classSectionService;
