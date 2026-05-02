import api from './api';

export interface ScholasticParameterInfo {
  id: number;
  name: string;
  display_order: number;
}

export interface ScholasticCategoryInfo {
  id: number;
  name: string;
  group_name: string | null;
  display_order: number;
  parameters: ScholasticParameterInfo[];
}

export interface ScholasticCategoriesResponse {
  categories: ScholasticCategoryInfo[];
}

export interface ScholasticGridStudent {
  student_id: number;
  student_name: string;
  admission_number: string;
  grades: { [parameterId: string]: string | number | null };
}

export interface ScholasticGridResponse {
  term_number: number;
  term_label: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_section_id: number;
  class_name: string;
  section_name: string;
  categories: ScholasticCategoryInfo[];
  students: ScholasticGridStudent[];
}

export interface StudentScholasticGradeEntry {
  student_id: number;
  parameter_id: number;
  grade: string | null;
  numeric_value: number | null;
}

export interface ScholasticGradesBulkRequest {
  term_number: number;
  academic_year_id: number | null;
  class_section_id: number;
  entries: StudentScholasticGradeEntry[];
}

export interface ScholasticReportTerm {
  id: number;
  name: string;
  label: string;
}

export interface ScholasticReportParam {
  id: number;
  name: string;
}

export interface ScholasticReportCategory {
  id: number;
  name: string;
  group_name: string | null;
  parameters: ScholasticReportParam[];
}

export interface ScholasticReportStudent {
  student_id: number;
  student_name: string;
  admission_number: string;
  father_name: string;
  term_grades: { [termId: string]: { [paramId: string]: string | number | null } };
}

export interface ScholasticStudentReport {
  class_name: string;
  section_name: string;
  categories: ScholasticReportCategory[];
  terms: ScholasticReportTerm[];
  students: ScholasticReportStudent[];
}

const scholasticService = {
  getCategories: async (): Promise<ScholasticCategoriesResponse> => {
    const response = await api.get<ScholasticCategoriesResponse>('/scholastic/categories');
    return response.data;
  },

  seedDefaults: async (): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/scholastic/seed-defaults');
    return response.data;
  },

  getGrid: async (
    termNumber: number,
    classSectionId: number,
    academicYearId?: number
  ): Promise<ScholasticGridResponse> => {
    const params = new URLSearchParams();
    params.append('term_number', termNumber.toString());
    params.append('class_section_id', classSectionId.toString());
    if (academicYearId) params.append('academic_year_id', academicYearId.toString());
    const response = await api.get<ScholasticGridResponse>(`/scholastic/grid?${params.toString()}`);
    return response.data;
  },

  saveGrades: async (data: ScholasticGradesBulkRequest): Promise<{ message: string; created: number; updated: number }> => {
    const response = await api.post<{ message: string; created: number; updated: number }>('/scholastic/grades', data);
    return response.data;
  },

  createCategory: async (data: { name: string; group_name?: string; display_order?: number }): Promise<{ id: number; message: string }> => {
    const response = await api.post<{ id: number; message: string }>('/scholastic/categories', data);
    return response.data;
  },

  updateCategory: async (id: number, data: { name: string; group_name?: string; display_order?: number }): Promise<{ message: string }> => {
    const response = await api.put<{ message: string }>(`/scholastic/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/scholastic/categories/${id}`);
    return response.data;
  },

  createParameter: async (data: { category_id: number; name: string; display_order?: number }): Promise<{ id: number; message: string }> => {
    const response = await api.post<{ id: number; message: string }>('/scholastic/parameters', data);
    return response.data;
  },

  updateParameter: async (id: number, data: { category_id: number; name: string; display_order?: number }): Promise<{ message: string }> => {
    const response = await api.put<{ message: string }>(`/scholastic/parameters/${id}`, data);
    return response.data;
  },

  deleteParameter: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/scholastic/parameters/${id}`);
    return response.data;
  },

  getStudentReport: async (
    classSectionId: number,
    academicYearId?: number,
    studentId?: number
  ): Promise<ScholasticStudentReport> => {
    const params = new URLSearchParams();
    params.append('class_section_id', classSectionId.toString());
    if (academicYearId) params.append('academic_year_id', academicYearId.toString());
    if (studentId) params.append('student_id', studentId.toString());
    const response = await api.get<ScholasticStudentReport>(`/scholastic/student-report?${params.toString()}`);
    return response.data;
  },
};

export default scholasticService;
