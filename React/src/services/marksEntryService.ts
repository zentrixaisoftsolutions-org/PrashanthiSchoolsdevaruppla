import api from './api';

export interface SubjectColumnInfo {
  subject_id: number;
  subject_name: string;
  max_marks: number;
  min_marks: number;
}

export interface StudentWithMarks {
  student_id: number;
  student_name: string;
  admission_number: string;
  marks: { [subjectId: string]: number | string | null };  // number, "AB", or null
}

export interface MarksEntryGridResponse {
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_section_id: number;
  class_name: string;
  section_name: string;
  subjects: SubjectColumnInfo[];
  students: StudentWithMarks[];
}

export interface StudentMarkEntry {
  student_id: number;
  marks_obtained: number | null;
  is_absent: boolean;
}

export interface SubjectMarkEntry {
  subject_id: number;
  subject_name: string;
  max_marks: number;
  min_marks: number;
  marks: StudentMarkEntry[];
}

export interface MarksEntryRequest {
  exam_type_id: number;
  academic_year_id: number | null;
  class_section_id: number;
  subjects: SubjectMarkEntry[];
}

export interface ClassSectionOption {
  id: number;
  section_name: string;
}

export interface ExamOption {
  id: number;
  name: string;
  academic_year_id: number | null;
}

export interface AttendanceMonthInfo {
  month: number;
  year: number;
  month_name: string;
  total_working_days: number;
}

export interface StudentAttendanceEntry {
  student_id: number;
  month: number;
  year: number;
  total_working_days: number;
  present_days: number;
}

export interface StudentAttendanceBulkRequest {
  exam_type_id: number;
  academic_year_id: number | null;
  class_section_id: number;
  entries: StudentAttendanceEntry[];
}

export interface SavedAttendanceMap {
  [key: string]: {  // key: "studentId_month_year"
    id: number;
    student_id: number;
    month: number;
    year: number;
    total_working_days: number;
    present_days: number;
  };
}

const marksEntryService = {
  getMarksEntryGrid: async (
    examTypeId: number,
    classSectionId: number,
    academicYearId?: number
  ): Promise<MarksEntryGridResponse> => {
    const params = new URLSearchParams();
    params.append('exam_type_id', examTypeId.toString());
    params.append('class_section_id', classSectionId.toString());
    if (academicYearId) {
      params.append('academic_year_id', academicYearId.toString());
    }
    const response = await api.get<MarksEntryGridResponse>(`/marks-entry/grid?${params.toString()}`);
    return response.data;
  },

  updateMarks: async (data: MarksEntryRequest): Promise<{ message: string; created: number; updated: number }> => {
    const response = await api.post<{ message: string; created: number; updated: number }>('/marks-entry/update', data);
    return response.data;
  },

  getClassSectionsByClass: async (classNameId: number): Promise<ClassSectionOption[]> => {
    const response = await api.get<ClassSectionOption[]>(`/marks-entry/class-sections-by-class?class_name_id=${classNameId}`);
    return response.data;
  },

  getExamsByAcademicYear: async (academicYearId: number): Promise<ExamOption[]> => {
    const response = await api.get<ExamOption[]>(`/marks-entry/exams-by-academic-year?academic_year_id=${academicYearId}`);
    return response.data;
  },

  getAttendanceMonths: async (academicYearId: number, classSectionId: number): Promise<AttendanceMonthInfo[]> => {
    const params = new URLSearchParams();
    params.append('academic_year_id', academicYearId.toString());
    params.append('class_section_id', classSectionId.toString());
    const response = await api.get<AttendanceMonthInfo[]>(`/marks-entry/attendance-months?${params.toString()}`);
    return response.data;
  },

  getAttendance: async (
    examTypeId: number,
    classSectionId: number,
    academicYearId?: number
  ): Promise<SavedAttendanceMap> => {
    const params = new URLSearchParams();
    params.append('exam_type_id', examTypeId.toString());
    params.append('class_section_id', classSectionId.toString());
    if (academicYearId) {
      params.append('academic_year_id', academicYearId.toString());
    }
    const response = await api.get<SavedAttendanceMap>(`/marks-entry/attendance?${params.toString()}`);
    return response.data;
  },

  saveAttendance: async (data: StudentAttendanceBulkRequest): Promise<{ message: string; created: number; updated: number }> => {
    const response = await api.post<{ message: string; created: number; updated: number }>('/marks-entry/attendance', data);
    return response.data;
  },
};

export default marksEntryService;
