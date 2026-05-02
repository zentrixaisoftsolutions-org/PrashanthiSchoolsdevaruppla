import api from './api';

export interface Department {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCreateRequest {
  name: string;
}

export interface DepartmentUpdateRequest {
  name?: string;
  is_active?: boolean;
}

const departmentService = {
  list: async (includeInactive = false): Promise<Department[]> => {
    const res = await api.get<Department[]>('/departments/', {
      params: { include_inactive: includeInactive },
    });
    return res.data;
  },

  get: async (id: number): Promise<Department> => {
    const res = await api.get<Department>(`/departments/${id}`);
    return res.data;
  },

  create: async (data: DepartmentCreateRequest): Promise<Department> => {
    const res = await api.post<Department>('/departments/', data);
    return res.data;
  },

  update: async (id: number, data: DepartmentUpdateRequest): Promise<Department> => {
    const res = await api.put<Department>(`/departments/${id}`, data);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/departments/${id}`);
  },
};

export default departmentService;
