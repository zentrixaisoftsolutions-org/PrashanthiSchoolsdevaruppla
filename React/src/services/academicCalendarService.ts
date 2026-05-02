import api from './api';

export interface AcademicCalendarHoliday {
  id: number;
  calendar_id: number;
  holiday_date: string;
  name: string;
  remarks?: string;
  created_at: string;
}

export interface AcademicCalendarEntry {
  id: number;
  academic_year_id: number;
  class_name_id: number;
  month: number;
  year: number;
  total_working_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  class_name?: string;
  academic_year_name?: string;
  holidays: AcademicCalendarHoliday[];
  holiday_count: number;
  effective_working_days: number;
}

export interface AcademicCalendarCreate {
  academic_year_id: number;
  class_name_id: number;
  month: number;
  year: number;
  total_working_days: number;
}

export interface AcademicCalendarBulkCreate {
  academic_year_id: number;
  class_name_ids: number[];
  months: number[];
  year: number;
  total_working_days: number;
}

export interface AcademicCalendarUpdate {
  total_working_days?: number;
  is_active?: boolean;
}

export interface HolidayCreate {
  holiday_date: string;
  name: string;
  remarks?: string;
}

export interface MonthSummary {
  id: number;
  month: number;
  year: number;
  total_working_days: number;
  holiday_count: number;
  effective_working_days: number;
}

export interface CalendarSummary {
  academic_year_id: number;
  academic_year_name: string;
  class_name_id: number;
  class_name: string;
  months: MonthSummary[];
  total_working_days: number;
  total_holidays: number;
  total_effective_days: number;
}

const academicCalendarService = {
  list: async (params?: { academic_year_id?: number; class_name_id?: number; month?: number; year?: number }): Promise<AcademicCalendarEntry[]> => {
    const response = await api.get<AcademicCalendarEntry[]>('/academic-calendar/', { params });
    return response.data;
  },

  get: async (id: number): Promise<AcademicCalendarEntry> => {
    const response = await api.get<AcademicCalendarEntry>(`/academic-calendar/${id}`);
    return response.data;
  },

  create: async (data: AcademicCalendarCreate): Promise<AcademicCalendarEntry> => {
    const response = await api.post<AcademicCalendarEntry>('/academic-calendar/', data);
    return response.data;
  },

  bulkCreate: async (data: AcademicCalendarBulkCreate): Promise<AcademicCalendarEntry[]> => {
    const response = await api.post<AcademicCalendarEntry[]>('/academic-calendar/bulk', data);
    return response.data;
  },

  update: async (id: number, data: AcademicCalendarUpdate): Promise<AcademicCalendarEntry> => {
    const response = await api.put<AcademicCalendarEntry>(`/academic-calendar/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/academic-calendar/${id}`);
  },

  summary: async (academicYearId: number): Promise<CalendarSummary[]> => {
    const response = await api.get<CalendarSummary[]>('/academic-calendar/summary', { params: { academic_year_id: academicYearId } });
    return response.data;
  },

  addHoliday: async (entryId: number, data: HolidayCreate): Promise<AcademicCalendarHoliday> => {
    const response = await api.post<AcademicCalendarHoliday>(`/academic-calendar/${entryId}/holidays`, data);
    return response.data;
  },

  bulkAddHoliday: async (data: {
    academic_year_id: number;
    class_name_ids?: number[];
    holiday_date: string;
    name: string;
    remarks?: string;
  }): Promise<{ added_count: number; skipped_count: number }> => {
    const response = await api.post<{ added_count: number; skipped_count: number }>('/academic-calendar/bulk-holiday', data);
    return response.data;
  },

  removeHoliday: async (holidayId: number): Promise<void> => {
    await api.delete(`/academic-calendar/holidays/${holidayId}`);
  },
};

export default academicCalendarService;
