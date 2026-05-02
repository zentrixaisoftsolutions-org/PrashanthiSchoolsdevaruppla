import api from './api';

export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface UserRecord {
  id: number;
  email: string;
  username: string;
  full_name: string;
  phone: string | null;
  role_id: number;
  role_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  email: string;
  username: string;
  full_name: string;
  phone?: string;
  role_id: number;
  password: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  phone?: string;
  is_active?: boolean;
  role_id?: number;
  email?: string;
  password?: string;
}

const userManagementService = {
  listUsers: async (): Promise<UserRecord[]> => {
    const response = await api.get<UserRecord[]>('/auth/users');
    return response.data;
  },

  getUser: async (id: number): Promise<UserRecord> => {
    const response = await api.get<UserRecord>(`/auth/users/${id}`);
    return response.data;
  },

  createUser: async (data: CreateUserPayload): Promise<UserRecord> => {
    const response = await api.post<UserRecord>('/auth/register', data);
    return response.data;
  },

  updateUser: async (id: number, data: UpdateUserPayload): Promise<UserRecord> => {
    const response = await api.put<UserRecord>(`/auth/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/auth/users/${id}`);
  },

  listRoles: async (): Promise<Role[]> => {
    const response = await api.get<Role[]>('/auth/roles');
    return response.data;
  },
};

export default userManagementService;
