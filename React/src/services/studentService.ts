import api from './api';

export interface Student {
  id: number;
  admission_number: string;
  rfid_id?: string;
  first_name: string;
  surname?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  caste?: string;
  aadhaar_number?: string;
  pen?: string;
  photo_data?: string;
  photo_thumbnail?: string;
  mobile_number?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  father_guardian_name?: string;
  mother_name?: string;
  parent_login_username?: string;
  class_id?: number;
  session_timings?: string;
  admission_date?: string;
  user_id?: number;
  parent_id?: number;
  roll_number?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  class_name?: string;
  section_name?: string;
}

export interface StudentCreate {
  admission_number: string;
  rfid_id?: string;
  first_name: string;
  surname?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  caste?: string;
  aadhaar_number?: string;
  pen?: string;
  photo_data?: string;
  photo_thumbnail?: string;
  mobile_number?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  father_guardian_name?: string;
  mother_name?: string;
  parent_login_username?: string;
  parent_login_password?: string;
  class_id?: number;
  session_timings?: string;
  admission_date?: string;
}

export interface StudentUpdate {
  first_name?: string;
  surname?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;
  caste?: string;
  aadhaar_number?: string;
  pen?: string;
  rfid_id?: string;
  photo_data?: string;
  photo_thumbnail?: string;
  mobile_number?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  father_guardian_name?: string;
  mother_name?: string;
  class_id?: number;
  session_timings?: string;
  is_active?: boolean;
}

export interface StudentFilters {
  page?: number;
  page_size?: number;
  class_name?: string;
  section?: string;
  aadhaar_number?: string;
  admission_number?: string;
  mobile_number?: string;
  search?: string;
  is_active?: boolean;
}

export interface StudentListResponse {
  students: Student[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SearchOptions {
  class_names: string[];
  sections: string[];
}

export interface ClassInfo {
  id: number;
  class_name: string;
  section_name: string;
  display_name: string;
}

const studentService = {
  // Get students with filters and pagination
  getStudents: async (filters: StudentFilters = {}): Promise<StudentListResponse> => {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.page_size) params.append('page_size', filters.page_size.toString());
    if (filters.class_name) params.append('class_name', filters.class_name);
    if (filters.section) params.append('section', filters.section);
    if (filters.aadhaar_number) params.append('aadhaar_number', filters.aadhaar_number);
    if (filters.admission_number) params.append('admission_number', filters.admission_number);
    if (filters.mobile_number) params.append('mobile_number', filters.mobile_number);
    if (filters.search) params.append('search', filters.search);
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    
    const response = await api.get(`/students/?${params.toString()}`);
    return response.data;
  },

  // Get search filter options (class names and sections)
  getSearchOptions: async (): Promise<SearchOptions> => {
    const response = await api.get('/students/search-options');
    return response.data;
  },

  // Get all classes for enrollment dropdown
  getClasses: async (): Promise<ClassInfo[]> => {
    const response = await api.get('/students/classes');
    return response.data;
  },

  // Get student by ID
  getStudent: async (id: number): Promise<Student> => {
    const response = await api.get(`/students/${id}`);
    return response.data;
  },

  // Create a new student
  createStudent: async (data: StudentCreate): Promise<Student> => {
    const response = await api.post('/students/', data);
    return response.data;
  },

  // Update a student
  updateStudent: async (id: number, data: StudentUpdate): Promise<Student> => {
    const response = await api.put(`/students/${id}`, data);
    return response.data;
  },

  // Delete (deactivate) a student
  deleteStudent: async (id: number): Promise<void> => {
    await api.delete(`/students/${id}`);
  },

  // Import students from CSV
  importCSV: async (file: File): Promise<{ 
    message: string; 
    imported_count: number; 
    skipped_count: number;
    total_rows: number;
    created_classes: string[];
    created_sections: string[];
    errors: string[] 
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/students/import-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Export students to CSV
  exportCSV: async (filters: { class_name?: string; section?: string; is_active?: boolean } = {}): Promise<Blob> => {
    const params = new URLSearchParams();
    if (filters.class_name) params.append('class_name', filters.class_name);
    if (filters.section) params.append('section', filters.section);
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active.toString());
    
    const response = await api.get(`/students/export/csv?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Get performance report for a student
  getPerformanceReport: async (
    studentId: number, 
    fromDate?: string, 
    toDate?: string
  ): Promise<PerformanceReport> => {
    const params = new URLSearchParams();
    if (fromDate) params.append('from_date', fromDate);
    if (toDate) params.append('to_date', toDate);
    
    const response = await api.get<PerformanceReport>(
      `/students/${studentId}/performance-report?${params.toString()}`
    );
    return response.data;
  },
};

export interface PerformanceReport {
  student: {
    id: number;
    admission_number: string;
    full_name: string;
    first_name: string;
    surname?: string;
    date_of_birth?: string;
    gender?: string;
    class_name?: string;
    section_name?: string;
    father_guardian_name?: string;
    mother_name?: string;
    mobile_number?: string;
    address?: string;
    admission_date?: string;
    photo_thumbnail?: string;
    photo_data?: string;
  };
  attendance?: {
    from_date: string;
    to_date: string;
    total_working_days: number;
    days_present: number;
    days_absent: number;
    days_late?: number;
    attendance_percentage: number;
  };
  fees?: {
    total_fee_amount: number;
    total_paid: number;
    total_pending: number;
    total_partial: number;
    fee_records: {
      month: string;
      amount: number;
      status: string;
      due_date?: string;
      payment_date?: string;
    }[];
  };
  exams?: {
    exam_name: string;
    exam_date?: string;
    subjects: {
      subject_name: string;
      marks_obtained: number | string;
      total_marks: number;
      grade?: string;
      grade_point: number;
      is_absent?: boolean;
    }[];
    total_marks_obtained: number;
    total_max_marks: number;
    average_gpa: number;
    overall_grade: string;
  }[];
  grade_scale: Record<string, string>;
}

export default studentService;
