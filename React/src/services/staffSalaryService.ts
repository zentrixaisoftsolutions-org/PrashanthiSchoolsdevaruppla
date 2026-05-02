import api from './api';

export interface StaffSalaryDetail {
  id?: number;
  staff_id: number;
  staff_name: string;
  employee_id?: string | null;
  designation?: string | null;
  department_name?: string | null;
  month: number;
  year: number;
  total_working_days: number;
  days_present: number;
  days_absent: number;
  days_late: number;
  days_half_day: number;
  days_leave: number;
  base_salary: number;
  deduction: number;
  net_salary: number;
  remarks?: string | null;
}

export interface StaffSalarySummary {
  total_base: number;
  total_deduction: number;
  total_net: number;
}

export interface StaffSalaryResponse {
  month: number;
  year: number;
  total_working_days: number;
  staff_salaries: StaffSalaryDetail[];
  summary: StaffSalarySummary;
}

export interface StaffSalaryCalculateRequest {
  month: number;
  year: number;
  total_working_days: number;
  staff_ids?: number[];
}

const staffSalaryService = {
  calculate: async (data: StaffSalaryCalculateRequest): Promise<StaffSalaryResponse> => {
    const res = await api.post<StaffSalaryResponse>('/staff-salary/calculate', data);
    return res.data;
  },

  save: async (data: StaffSalaryCalculateRequest): Promise<{ message: string; count: number }> => {
    const res = await api.post<{ message: string; count: number }>('/staff-salary/save', data);
    return res.data;
  },

  getRecords: async (month: number, year: number, departmentId?: number): Promise<StaffSalaryResponse> => {
    const res = await api.get<StaffSalaryResponse>('/staff-salary/records', {
      params: { month, year, department_id: departmentId },
    });
    return res.data;
  },

  deleteRecords: async (month: number, year: number): Promise<{ message: string; count: number }> => {
    const res = await api.delete<{ message: string; count: number }>('/staff-salary/records', {
      params: { month, year },
    });
    return res.data;
  },
};

export default staffSalaryService;
