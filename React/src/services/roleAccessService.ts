import api from './api';

export interface MenuStructureItem {
  path: string;
  label: string;
  parent: string | null;
}

export interface MenuAccessItem {
  menu_path: string;
  is_allowed: boolean;
}

export interface UserListItem {
  id: number;
  email: string;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
}

export interface UserAccessResponse {
  user_id: number;
  user_name: string;
  email: string;
  role: string;
  has_custom_access: boolean;
  access: MenuAccessItem[];
}

export interface MyAccessResponse {
  allowed_paths: string[] | null;
}

const roleAccessService = {
  getMenuStructure: async (): Promise<MenuStructureItem[]> => {
    const response = await api.get<MenuStructureItem[]>('/role-access/menu-structure');
    return response.data;
  },

  getUsers: async (): Promise<UserListItem[]> => {
    const response = await api.get<UserListItem[]>('/role-access/users');
    return response.data;
  },

  getUserAccess: async (userId: number): Promise<UserAccessResponse> => {
    const response = await api.get<UserAccessResponse>(`/role-access/user/${userId}`);
    return response.data;
  },

  updateUserAccess: async (userId: number, access: MenuAccessItem[]): Promise<void> => {
    await api.put(`/role-access/user/${userId}`, {
      user_id: userId,
      access,
    });
  },

  resetUserAccess: async (userId: number): Promise<void> => {
    await api.delete(`/role-access/user/${userId}`);
  },

  getMyAccess: async (): Promise<MyAccessResponse> => {
    const response = await api.get<MyAccessResponse>('/role-access/my-access');
    return response.data;
  },
};

export default roleAccessService;
