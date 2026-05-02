import api from './api';

export interface ExamMapping {
  id: string;
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_section_id: number;
  class_name: string;
  section_name: string;
  grade_type: string;
  status: string;
  students_count: number;
  marks_count: number;
  created_at: string | null;
}

export interface SubjectMark {
  subject_id: number;
  subject_name: string;
  marks_obtained: number | null;
  max_marks: number;
  min_marks: number;
  grade: string;
  grade_point: number;
  teacher_remarks: string;
  is_absent: boolean;
  class_topper: number;
  class_average: number;
}

export interface ReportCard {
  student_id: number;
  student_name: string;
  admission_number: string;
  father_name: string;
  photo_thumbnail: string | null;
  photo_data: string | null;
  class_name: string;
  section_name: string;
  subject_marks: SubjectMark[];
  total_marks: number;
  total_max_marks: number;
  percentage: number;
  grade: string;
  gpa: number;
  total_gpa: number;
  general_remarks: string;
  class_rank: number;
  total_students: number;
}

export interface GradeScale {
  grade: string;
  range: string;
  points: number;
  min_pct: number;
  max_pct: number;
}

export interface SubjectInfo {
  id: number;
  name: string;
}

export interface ReportCardsResponse {
  exam_name: string;
  academic_year: string | null;
  class_name: string;
  section_name: string;
  subjects: SubjectInfo[];
  grade_scale: GradeScale[];
  report_cards: ReportCard[];
  generated_at: string;
}

export interface ExamMappingFilters {
  academic_year_id?: number;
  exam_type_id?: number;
  class_name?: string;
  section_name?: string;
}

const resultsService = {
  getExamMappings: async (filters: ExamMappingFilters = {}): Promise<ExamMapping[]> => {
    const params = new URLSearchParams();
    if (filters.academic_year_id) {
      params.append('academic_year_id', filters.academic_year_id.toString());
    }
    if (filters.exam_type_id) {
      params.append('exam_type_id', filters.exam_type_id.toString());
    }
    if (filters.class_name) {
      params.append('class_name', filters.class_name);
    }
    if (filters.section_name) {
      params.append('section_name', filters.section_name);
    }
    const query = params.toString();
    const response = await api.get<ExamMapping[]>(`/results/exam-mappings${query ? '?' + query : ''}`);
    return response.data;
  },

  getReportCards: async (
    examTypeId: number,
    classSectionId: number,
    academicYearId?: number
  ): Promise<ReportCardsResponse> => {
    const params = new URLSearchParams();
    if (academicYearId) {
      params.append('academic_year_id', academicYearId.toString());
    }
    const query = params.toString();
    const response = await api.get<ReportCardsResponse>(
      `/results/report-cards/${examTypeId}/${classSectionId}${query ? '?' + query : ''}`
    );
    return response.data;
  },
};

export default resultsService;
