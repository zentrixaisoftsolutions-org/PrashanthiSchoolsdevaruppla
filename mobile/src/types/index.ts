export interface User {
  id: number;
  email: string;
  username: string;
  full_name: string;
  phone?: string;
  role_id: number;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user_id: number;
  role: string;
  full_name?: string;
}

export interface Student {
  id: number;
  first_name: string;
  middle_name?: string;
  last_name?: string;
  surname?: string;
  date_of_birth: string;
  gender: string;
  blood_group?: string;
  caste?: string;
  aadhaar_number?: string;
  pen?: string;
  admission_number: string;
  admission_date?: string;
  class_section_id?: number;
  class_id?: number;
  parent_id?: number;
  is_active: boolean;
  photo_url?: string;
  photo_data?: string;
  photo_thumbnail?: string;
  mobile_number?: string;
  phone_number?: string;
  email?: string;
  address?: string;
  father_guardian_name?: string;
  mother_name?: string;
  session_timings?: string;
  rfid_id?: string;
  roll_number?: string;
  class_name?: string;
  section_name?: string;
  class_section?: ClassSection;
}

export interface ClassSection {
  id: number;
  class_name_id: number;
  section_id: number;
  academic_year_id: number;
  class_teacher_id?: number;
  capacity?: number;
  is_active: boolean;
  class_name?: ClassName;
  section?: Section;
}

export interface ClassName {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface Section {
  id: number;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface Attendance {
  id: number;
  student_id: number;
  class_section_id: number;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'leave';
  remarks?: string;
  student?: Student;
}

export interface Subject {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
}

export interface ExamType {
  id: number;
  name: string;
  description?: string;
  weightage: number;
  is_active: boolean;
}

export interface Exam {
  id: number;
  exam_type_id: number;
  class_section_id: number;
  subject_id: number;
  exam_date: string;
  total_marks: number;
  passing_marks: number;
  exam_type?: ExamType;
  subject?: Subject;
  class_section?: ClassSection;
}

export interface MarksEntry {
  id: number;
  exam_id: number;
  student_id: number;
  marks_obtained: number;
  is_absent: boolean;
  remarks?: string;
}

export interface FeeStructure {
  id: number;
  class_section_id: number;
  fee_type: string;
  amount: number;
  due_date?: string;
  academic_year_id: number;
  is_active: boolean;
}

export interface FeePayment {
  id: number;
  student_id: number;
  fee_structure_id: number;
  amount_paid: number;
  payment_date: string;
  payment_mode: string;
  transaction_id?: string;
  remarks?: string;
}

export interface DashboardStats {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  present_today: number;
  absent_today: number;
  pending_fees: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
