import api from './api';

export interface ExamTypeSummary {
  id: number;
  name: string;
}

export interface ClassSectionOption {
  id: number;
  class_name: string;
  section_name: string;
  display: string;
}

export interface AnnualReportConfig {
  exam_types: ExamTypeSummary[];
  class_sections: ClassSectionOption[];
}

export interface StudentOption {
  id: number;
  name: string;
  admission_number: string;
}

export interface LevelConfig {
  level_name: string;
  exam_type_ids: number[];
  weightage_pct: number;
}

export interface AnnualReportRequest {
  academic_year_id: number;
  class_section_id: number;
  student_id?: number | null;
  levels: LevelConfig[];
}

export interface AnnualReportLevelRow {
  level_name: string;
  exam_names: string[];
  average_value: number | null;
  grade: string | null;
  grade_point: number | null;
  weightage_pct: number;
}

export interface AnnualAttendanceMonth {
  month: number;
  year: number;
  month_name: string;
  total_working_days: number;
  present_days: number;
}

export interface AnnualSubjectPerformance {
  subject_name: string;
  student_marks: number | null;
  max_marks: number;
  pass_marks: number;
  class_topper: number;
  class_average: number;
}

export interface AnnualSubjectWiseMark {
  subject_name: string;
  fa_marks: number | null;
  fa_max: number;
  sa1_marks: number | null;
  sa1_max: number;
  sa2_marks: number | null;
  sa2_max: number;
  total_marks: number | null;
  total_max: number;
  teacher_remarks?: string;
}

export interface AnnualReportStudent {
  student_id: number;
  student_name: string;
  admission_number: string;
  father_name: string;
  photo_thumbnail: string | null;
  photo_data: string | null;
  class_name: string;
  section_name: string;
  levels: AnnualReportLevelRow[];
  total_average: number | null;
  total_grade: string | null;
  total_grade_point: number | null;
  cg: string | null;
  cgpa: number | null;
  attendance_working_days: number;
  attendance_present_days: number;
  attendance_percentage: number;
  attendance_monthly?: AnnualAttendanceMonth[];
  subject_performance?: AnnualSubjectPerformance[];
  subject_wise_marks?: AnnualSubjectWiseMark[];
  class_rank?: number;
  total_students?: number;
  remarks: string;
}

export interface GradeScaleItem {
  grade: string;
  range: string;
  points: number;
  min_pct: number;
  max_pct: number;
}

export interface AnnualReportResponse {
  academic_year: string | null;
  class_name: string;
  section_name: string;
  grade_scale: GradeScaleItem[];
  students: AnnualReportStudent[];
}

const reportService = {
  getAnnualReportConfig: async (academicYearId: number): Promise<AnnualReportConfig> => {
    const response = await api.get<AnnualReportConfig>(`/reports/annual-report/config?academic_year_id=${academicYearId}`);
    return response.data;
  },

  getStudentsForReport: async (classSectionId: number): Promise<StudentOption[]> => {
    const response = await api.get<StudentOption[]>(`/reports/annual-report/students?class_section_id=${classSectionId}`);
    return response.data;
  },

  generateAnnualReport: async (data: AnnualReportRequest): Promise<AnnualReportResponse> => {
    const response = await api.post<AnnualReportResponse>('/reports/annual-report/generate', data);
    return response.data;
  },

  // ============ Assessment Report ============

  getAssessmentReportConfig: async (): Promise<AssessmentReportConfig> => {
    const response = await api.get<AssessmentReportConfig>('/reports/assessment-report/config');
    return response.data;
  },

  getAssessmentReport: async (
    classNameId: number,
    sectionId: number,
    examTypeId: number,
    subjectId?: number
  ): Promise<AssessmentReportData> => {
    let url = `/reports/assessment-report?class_name_id=${classNameId}&section_id=${sectionId}&exam_type_id=${examTypeId}`;
    if (subjectId) url += `&subject_id=${subjectId}`;
    const response = await api.get<AssessmentReportData>(url);
    return response.data;
  },
};

export default reportService;

// ============ Assessment Report Interfaces ============

export interface AssessmentReportConfig {
  class_names: { id: number; name: string }[];
  sections: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  exam_types: { id: number; name: string }[];
  academic_year_id: number | null;
}

export interface AssessmentSubjectDetail {
  subject_name: string;
  marks_obtained: number | null;
  max_marks: number;
  percentage: number;
  grade: string;
  gpa: number;
  is_absent: boolean;
  is_fail: boolean;
}

export interface AssessmentStudent {
  student_id: number;
  student_name: string;
  admission_number: string;
  total_obtained: number;
  total_max: number;
  percentage: number;
  grade: string;
  gpa: number;
  cgpa: number;
  failed_subjects: string[];
  subject_details: AssessmentSubjectDetail[];
}

export interface AssessmentGpaBand {
  label: string;
  gpa_floor: number;
  count: number;
  students: AssessmentStudent[];
}

export interface AssessmentReportData {
  class_name: string;
  section_name: string;
  total_students: number;
  students_with_marks: number;
  bands: AssessmentGpaBand[];
  failed_students: AssessmentStudent[];
}
