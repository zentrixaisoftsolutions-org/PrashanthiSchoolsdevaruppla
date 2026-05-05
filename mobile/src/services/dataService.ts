import api from './api';

export interface Child {
  id: number;
  admission_number: string;
  first_name: string;
  surname?: string | null;
  full_name: string;
  class_id?: number | null;
  class_name?: string | null;
  section?: string | null;
  photo_thumbnail?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  father_guardian_name?: string | null;
  mother_name?: string | null;
}

export interface HomeworkAttachment {
  id: number;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  url: string;
}

export interface Homework {
  id: number;
  class_id: number;
  class_label?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  assigned_by_name?: string | null;
  created_at: string;
  attachments: HomeworkAttachment[];
}

export const parentService = {
  getChildren: async (): Promise<Child[]> => {
    const res = await api.get('/parent/children');
    return res.data;
  },
  getHomework: async (studentId?: number, days = 30): Promise<Homework[]> => {
    const res = await api.get('/parent/homework', {
      params: { student_id: studentId, days },
    });
    return res.data;
  },
  getPerformanceReport: async (studentId: number): Promise<any> => {
    const res = await api.get('/parent/performance-report', { params: { student_id: studentId } });
    return res.data;
  },
  getAnnualReport: async (studentId: number): Promise<any> => {
    const res = await api.get('/parent/annual-report', { params: { student_id: studentId } });
    return res.data;
  },
  // Use exam-mappings filtered by the child's class+section to enumerate available exams.
  getProgressExamOptions: async (className?: string | null, sectionName?: string | null): Promise<ExamMapping[]> => {
    const params: any = {};
    if (className) params.class_name = className;
    if (sectionName) params.section_name = sectionName;
    return fetchExamMappings(params);
  },
  getProgressReportCard: fetchProgressReportCard,
};

// Existing /my-children endpoints reused for fees/attendance/results
export const feesService = {
  getMyChildren: async (): Promise<any> => {
    const res = await api.get('/fees/my-children');
    return res.data;
  },
};

export const attendanceService = {
  getMyChildren: async (params: { from_date?: string; to_date?: string } = {}): Promise<any> => {
    const res = await api.get('/attendance/my-children', { params });
    return res.data;
  },
};

export const resultsService = {
  getMyChildren: async (): Promise<any> => {
    const res = await api.get('/results/my-children');
    return res.data;
  },
};

export interface MarksOptionSection { id: number; class_name: string; section_name: string; label: string; }
export interface MarksOptionExam { id: number; name: string; academic_year_id: number | null; }
export interface MarksOptions {
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_sections: MarksOptionSection[];
  exam_types: MarksOptionExam[];
}
export interface MarksGridSubject { subject_id: number; subject_name: string; max_marks: number; min_marks: number; }
export interface MarksGridStudent { student_id: number; student_name: string; admission_number: string; marks: Record<string, number | string | null>; }
export interface MarksGrid {
  exam_type_id: number; exam_type_name: string;
  academic_year_id: number | null; academic_year_name: string | null;
  class_section_id: number; class_name: string; section_name: string;
  subjects: MarksGridSubject[];
  students: MarksGridStudent[];
}

export const teacherMarksService = {
  getOptions: async (): Promise<MarksOptions> => {
    const res = await api.get('/marks-entry/teacher-options');
    return res.data;
  },
  getGrid: async (params: { exam_type_id: number; class_section_id: number; academic_year_id?: number | null }): Promise<MarksGrid> => {
    const res = await api.get('/marks-entry/grid', { params });
    return res.data;
  },
  saveMarks: async (payload: {
    exam_type_id: number;
    class_section_id: number;
    academic_year_id?: number | null;
    subjects: Array<{
      subject_id: number;
      subject_name: string;
      max_marks: number;
      min_marks: number;
      marks: Array<{ student_id: number; marks_obtained: number | null; is_absent: boolean }>;
    }>;
  }): Promise<{ message: string; created: number; updated: number }> => {
    const res = await api.post('/marks-entry/update', payload);
    return res.data;
  },
};

export interface TeacherReportStudent {
  id: number;
  name: string;
  admission_number: string;
  class_name?: string;
  class_section_id?: number;
}

export interface ExamMapping {
  id: string;
  exam_type_id: number;
  exam_type_name: string;
  academic_year_id: number | null;
  academic_year_name: string | null;
  class_section_id: number;
  class_name: string;
  section_name: string;
}

async function fetchExamMappings(params: { class_name?: string; section_name?: string } = {}): Promise<ExamMapping[]> {
  const res = await api.get('/results/exam-mappings', { params });
  return Array.isArray(res.data) ? res.data : [];
}

async function fetchProgressReportCard(
  studentId: number,
  classSectionId: number,
  examTypeId: number,
  academicYearId?: number | null,
): Promise<any> {
  const res = await api.get(
    `/results/report-cards/${examTypeId}/${classSectionId}`,
    { params: academicYearId ? { academic_year_id: academicYearId } : {} },
  );
  const cards: any[] = Array.isArray(res.data) ? res.data : (res.data?.report_cards || []);
  return cards.find((c: any) => c.student_id === studentId) || null;
}

export const teacherReportsService = {
  getStudents: async (): Promise<TeacherReportStudent[]> => {
    // Build the student list from /marks-entry/teacher-options + /marks-entry/grid
    // (teachers always have access to their own class sections).
    const opts = await api.get('/marks-entry/teacher-options');
    const sections = opts.data?.class_sections || [];
    const examTypeId = opts.data?.exam_types?.[0]?.id;
    if (!examTypeId) return [];
    const seen = new Map<number, TeacherReportStudent>();
    for (const sec of sections) {
      try {
        const grid = await api.get('/marks-entry/grid', {
          params: { class_section_id: sec.id, exam_type_id: examTypeId },
        });
        const students = grid.data?.students || [];
        for (const s of students) {
          if (!seen.has(s.student_id)) {
            seen.set(s.student_id, {
              id: s.student_id,
              name: s.student_name || '',
              admission_number: s.admission_number || '',
              class_name: sec.label || `${sec.class_name || ''} - ${sec.section_name || ''}`,
              class_section_id: sec.id,
            });
          }
        }
      } catch {}
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  },
  getPerformanceReport: async (studentId: number): Promise<any> => {
    const res = await api.get(`/students/${studentId}/performance-report`);
    return res.data;
  },
  getExamMappings: async (classSectionId?: number): Promise<ExamMapping[]> => {
    const all = await fetchExamMappings();
    return classSectionId == null ? all : all.filter((m) => m.class_section_id === classSectionId);
  },
  getProgressReportCard: fetchProgressReportCard,
};

