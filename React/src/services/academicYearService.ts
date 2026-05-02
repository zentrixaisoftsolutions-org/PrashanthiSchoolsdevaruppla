import api from './api';

export interface AcademicYear {
  id: number;
  name: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicYearCreate {
  name: string;
}

export interface AcademicYearUpdate {
  name?: string;
  is_current?: boolean;
  is_active?: boolean;
}

const academicYearService = {
  listAcademicYears: async (includeInactive: boolean = false): Promise<AcademicYear[]> => {
    const response = await api.get<AcademicYear[]>(`/academic-years/?include_inactive=${includeInactive}`);
    return response.data;
  },

  getAcademicYear: async (yearId: number): Promise<AcademicYear> => {
    const response = await api.get<AcademicYear>(`/academic-years/${yearId}`);
    return response.data;
  },

  getCurrentAcademicYear: async (): Promise<AcademicYear> => {
    const response = await api.get<AcademicYear>('/academic-years/current');
    return response.data;
  },

  createAcademicYear: async (data: AcademicYearCreate): Promise<AcademicYear> => {
    const response = await api.post<AcademicYear>('/academic-years/', data);
    return response.data;
  },

  updateAcademicYear: async (yearId: number, data: AcademicYearUpdate): Promise<AcademicYear> => {
    const response = await api.put<AcademicYear>(`/academic-years/${yearId}`, data);
    return response.data;
  },

  deleteAcademicYear: async (yearId: number): Promise<void> => {
    await api.delete(`/academic-years/${yearId}`);
  },

  setCurrentYear: async (yearId: number): Promise<AcademicYear> => {
    const response = await api.post<AcademicYear>(`/academic-years/${yearId}/set-current`);
    return response.data;
  },
};

export default academicYearService;
