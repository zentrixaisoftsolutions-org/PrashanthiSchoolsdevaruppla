import api from './api';

export interface ClassSectionBrief {
  id: number;
  class_name: string;
  section_name: string;
}

export interface SubjectBrief {
  id: number;
  name: string;
  code: string;
}

export interface StaffMember {
  id: number;
  rfid?: string | null;
  employee_id?: string | null;
  first_name: string;
  last_name?: string | null;
  father_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  mobile?: string | null;
  email?: string | null;
  aadhar_number?: string | null;
  address?: string | null;
  qualification?: string | null;
  designation?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  date_of_joining?: string | null;
  salary?: number | null;
  photo_data?: string | null;
  is_active: boolean;
  class_sections: ClassSectionBrief[];
  subjects: SubjectBrief[];
  class_section_ids: number[];
  subject_ids: number[];
  class_teacher_of_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface StaffCreateRequest {
  first_name: string;
  last_name?: string;
  father_name?: string;
  gender?: string;
  date_of_birth?: string;
  mobile?: string;
  email?: string;
  aadhar_number?: string;
  address?: string;
  qualification?: string;
  designation?: string;
  department_id?: number;
  date_of_joining?: string;
  salary?: number;
  rfid?: string;
  employee_id?: string;
  photo_data?: string;
  class_section_ids?: number[];
  subject_ids?: number[];
  class_teacher_of_ids?: number[];
}

export type StaffUpdateRequest = Partial<StaffCreateRequest> & { is_active?: boolean };

const staffService = {
  list: async (params?: {
    department_id?: number;
    search?: string;
    include_inactive?: boolean;
  }): Promise<StaffMember[]> => {
    const res = await api.get<StaffMember[]>('/staff/', { params });
    return res.data;
  },

  get: async (id: number): Promise<StaffMember> => {
    const res = await api.get<StaffMember>(`/staff/${id}`);
    return res.data;
  },

  create: async (data: StaffCreateRequest): Promise<StaffMember> => {
    const res = await api.post<StaffMember>('/staff/', data);
    return res.data;
  },

  update: async (id: number, data: StaffUpdateRequest): Promise<StaffMember> => {
    const res = await api.put<StaffMember>(`/staff/${id}`, data);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/staff/${id}`);
  },

  permanentDelete: async (id: number): Promise<void> => {
    await api.delete(`/staff/${id}/permanent`);
  },

  listClassTeachers: async (): Promise<{
    class_section_id: number;
    class_name: string;
    section_name: string;
    staff_id: number;
    teacher_name: string;
    designation?: string | null;
  }[]> => {
    const res = await api.get('/staff/class-teachers/all');
    return res.data;
  },
};

export default staffService;
