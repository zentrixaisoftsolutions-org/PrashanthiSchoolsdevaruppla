import api from './api';

export interface Section {
  id: number;
  name: string;
  display_order: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SectionCreateRequest {
  name: string;
  display_order?: number;
  description?: string;
}

export interface SectionUpdateRequest {
  name?: string;
  display_order?: number;
  description?: string;
  is_active?: boolean;
}

const sectionService = {
  listSections: async (includeInactive: boolean = false): Promise<Section[]> => {
    const response = await api.get<Section[]>('/sections/', {
      params: { include_inactive: includeInactive }
    });
    return response.data;
  },

  getSection: async (sectionId: number): Promise<Section> => {
    const response = await api.get<Section>(`/sections/${sectionId}`);
    return response.data;
  },

  createSection: async (data: SectionCreateRequest): Promise<Section> => {
    const response = await api.post<Section>('/sections/', data);
    return response.data;
  },

  updateSection: async (sectionId: number, data: SectionUpdateRequest): Promise<Section> => {
    const response = await api.put<Section>(`/sections/${sectionId}`, data);
    return response.data;
  },

  deleteSection: async (sectionId: number): Promise<void> => {
    await api.delete(`/sections/${sectionId}`);
  },
};

export default sectionService;
