import { Student, Attendance, Exam, FeePayment, DashboardStats } from '../types';

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

const classSection = {
  id: 1,
  class_name_id: 5,
  section_id: 1,
  academic_year_id: 1,
  class_teacher_id: 3,
  capacity: 40,
  is_active: true,
  class_name: { id: 5, name: 'Class 5', display_order: 5, is_active: true },
  section: { id: 1, name: 'A', display_order: 1, is_active: true },
};

export const demoStudents: Student[] = [
  {
    id: 1,
    first_name: 'Aarav',
    middle_name: '',
    last_name: 'Sharma',
    date_of_birth: '2015-04-12',
    gender: 'Male',
    blood_group: 'B+',
    admission_number: 'KTS-2024-001',
    admission_date: '2024-04-01',
    class_section_id: 1,
    parent_id: 1,
    is_active: true,
    class_section: classSection,
  },
];

function generateAttendanceForMonth(): Attendance[] {
  const records: Attendance[] = [];
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentDay = today.getDate();

  for (let day = 1; day <= currentDay; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) continue; // skip Sundays

    let status: 'present' | 'absent' | 'late' | 'leave';
    if (day === 7) status = 'absent';
    else if (day === 14) status = 'leave';
    else if (day % 5 === 0) status = 'late';
    else status = 'present';

    records.push({
      id: day,
      student_id: 1,
      class_section_id: 1,
      attendance_date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      status,
      remarks: status === 'leave' ? 'Family function' : status === 'absent' ? 'Sick' : undefined,
      student: demoStudents[0],
    });
  }
  return records;
}

export const demoAttendance: Attendance[] = generateAttendanceForMonth();

export const demoExams: Exam[] = [
  {
    id: 1,
    exam_type_id: 1,
    class_section_id: 1,
    subject_id: 1,
    exam_date: '2026-02-15',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 1, name: 'Unit Test 1', weightage: 20, is_active: true },
    subject: { id: 1, name: 'Mathematics', code: 'MATH', is_active: true },
    class_section: classSection,
  },
  {
    id: 2,
    exam_type_id: 1,
    class_section_id: 1,
    subject_id: 2,
    exam_date: '2026-02-17',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 1, name: 'Unit Test 1', weightage: 20, is_active: true },
    subject: { id: 2, name: 'Science', code: 'SCI', is_active: true },
    class_section: classSection,
  },
  {
    id: 3,
    exam_type_id: 1,
    class_section_id: 1,
    subject_id: 3,
    exam_date: '2026-02-19',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 1, name: 'Unit Test 1', weightage: 20, is_active: true },
    subject: { id: 3, name: 'English', code: 'ENG', is_active: true },
    class_section: classSection,
  },
  {
    id: 4,
    exam_type_id: 2,
    class_section_id: 1,
    subject_id: 1,
    exam_date: '2026-04-10',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 2, name: 'Half Yearly', weightage: 30, is_active: true },
    subject: { id: 1, name: 'Mathematics', code: 'MATH', is_active: true },
    class_section: classSection,
  },
  {
    id: 5,
    exam_type_id: 2,
    class_section_id: 1,
    subject_id: 2,
    exam_date: '2026-04-12',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 2, name: 'Half Yearly', weightage: 30, is_active: true },
    subject: { id: 2, name: 'Science', code: 'SCI', is_active: true },
    class_section: classSection,
  },
  {
    id: 6,
    exam_type_id: 2,
    class_section_id: 1,
    subject_id: 3,
    exam_date: '2026-04-14',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 2, name: 'Half Yearly', weightage: 30, is_active: true },
    subject: { id: 3, name: 'English', code: 'ENG', is_active: true },
    class_section: classSection,
  },
  {
    id: 7,
    exam_type_id: 2,
    class_section_id: 1,
    subject_id: 4,
    exam_date: '2026-04-16',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 2, name: 'Half Yearly', weightage: 30, is_active: true },
    subject: { id: 4, name: 'Hindi', code: 'HIN', is_active: true },
    class_section: classSection,
  },
  {
    id: 8,
    exam_type_id: 2,
    class_section_id: 1,
    subject_id: 5,
    exam_date: '2026-04-18',
    total_marks: 100,
    passing_marks: 35,
    exam_type: { id: 2, name: 'Half Yearly', weightage: 30, is_active: true },
    subject: { id: 5, name: 'Social Studies', code: 'SST', is_active: true },
    class_section: classSection,
  },
];

export const demoFeePayments: FeePayment[] = [
  {
    id: 1,
    student_id: 1,
    fee_structure_id: 1,
    amount_paid: 15000,
    payment_date: '2025-04-10',
    payment_mode: 'online',
    transaction_id: 'TXN20250410001',
    remarks: 'Term 1 - Tuition Fee',
  },
  {
    id: 2,
    student_id: 1,
    fee_structure_id: 2,
    amount_paid: 5000,
    payment_date: '2025-04-10',
    payment_mode: 'online',
    transaction_id: 'TXN20250410002',
    remarks: 'Term 1 - Transport Fee',
  },
  {
    id: 3,
    student_id: 1,
    fee_structure_id: 3,
    amount_paid: 3000,
    payment_date: '2025-07-05',
    payment_mode: 'cash',
    remarks: 'Activity Fee',
  },
  {
    id: 4,
    student_id: 1,
    fee_structure_id: 1,
    amount_paid: 15000,
    payment_date: '2025-10-08',
    payment_mode: 'online',
    transaction_id: 'TXN20251008001',
    remarks: 'Term 2 - Tuition Fee',
  },
  {
    id: 5,
    student_id: 1,
    fee_structure_id: 2,
    amount_paid: 5000,
    payment_date: '2025-10-08',
    payment_mode: 'online',
    transaction_id: 'TXN20251008002',
    remarks: 'Term 2 - Transport Fee',
  },
  {
    id: 6,
    student_id: 1,
    fee_structure_id: 1,
    amount_paid: 15000,
    payment_date: '2026-01-12',
    payment_mode: 'online',
    transaction_id: 'TXN20260112001',
    remarks: 'Term 3 - Tuition Fee',
  },
  {
    id: 7,
    student_id: 1,
    fee_structure_id: 2,
    amount_paid: 5000,
    payment_date: '2026-01-12',
    payment_mode: 'cash',
    remarks: 'Term 3 - Transport Fee',
  },
];

export const demoDashboardStats: DashboardStats = {
  total_students: 1,
  total_teachers: 8,
  total_classes: 1,
  present_today: demoAttendance.filter(
    (a) => a.attendance_date === todayStr && a.status === 'present'
  ).length > 0
    ? 1
    : 0,
  absent_today: demoAttendance.filter(
    (a) => a.attendance_date === todayStr && a.status === 'absent'
  ).length > 0
    ? 1
    : 0,
  pending_fees: 8000,
};
