import api from './api';

export interface ClassName {
  id: number;
  name: string;
  display_order: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassNameCreateRequest {
  name: string;
  display_order?: number;
  description?: string;
}

export interface ClassNameUpdateRequest {
  name?: string;
  display_order?: number;
  description?: string;
  is_active?: boolean;
}

const classNameService = {
  listClassNames: async (includeInactive: boolean = false): Promise<ClassName[]> => {
    const response = await api.get<ClassName[]>('/class-names/', {
      params: { include_inactive: includeInactive }
    });
    return response.data;
  },

  getClassName: async (classNameId: number): Promise<ClassName> => {
    const response = await api.get<ClassName>(`/class-names/${classNameId}`);
    return response.data;
  },

  createClassName: async (data: ClassNameCreateRequest): Promise<ClassName> => {
    const response = await api.post<ClassName>('/class-names/', data);
    return response.data;
  },

  updateClassName: async (classNameId: number, data: ClassNameUpdateRequest): Promise<ClassName> => {
    const response = await api.put<ClassName>(`/class-names/${classNameId}`, data);
    return response.data;
  },

  deleteClassName: async (classNameId: number): Promise<void> => {
    await api.delete(`/class-names/${classNameId}`);
  },
};

export default classNameService;
