import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase;

// Initialize database with schema
export const initDatabase = async (): Promise<void> => {
  db = await SQLite.openDatabaseAsync('schoolerp.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      middle_name TEXT,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      blood_group TEXT,
      admission_number TEXT NOT NULL,
      admission_date TEXT NOT NULL,
      class_section_id INTEGER,
      parent_id INTEGER,
      is_active INTEGER DEFAULT 1,
      photo_url TEXT,
      synced INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS class_names (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      display_order INTEGER,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      display_order INTEGER,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS class_sections (
      id INTEGER PRIMARY KEY,
      class_name_id INTEGER,
      section_id INTEGER,
      academic_year_id INTEGER,
      class_teacher_id INTEGER,
      capacity INTEGER,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL,
      class_section_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL,
      remarks TEXT,
      synced INTEGER DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exam_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      weightage REAL NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY,
      exam_type_id INTEGER NOT NULL,
      class_section_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      exam_date TEXT NOT NULL,
      total_marks REAL NOT NULL,
      passing_marks REAL NOT NULL,
      FOREIGN KEY(exam_type_id) REFERENCES exam_types(id),
      FOREIGN KEY(subject_id) REFERENCES subjects(id),
      FOREIGN KEY(class_section_id) REFERENCES class_sections(id)
    );

    CREATE TABLE IF NOT EXISTS marks_entry (
      id INTEGER PRIMARY KEY,
      exam_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      marks_obtained REAL NOT NULL,
      is_absent INTEGER DEFAULT 0,
      remarks TEXT,
      synced INTEGER DEFAULT 1,
      FOREIGN KEY(exam_id) REFERENCES exams(id),
      FOREIGN KEY(student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS fee_structure (
      id INTEGER PRIMARY KEY,
      class_section_id INTEGER NOT NULL,
      fee_type TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT,
      academic_year_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL,
      fee_structure_id INTEGER NOT NULL,
      amount_paid REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_mode TEXT NOT NULL,
      transaction_id TEXT,
      remarks TEXT,
      synced INTEGER DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(fee_structure_id) REFERENCES fee_structure(id)
    );

    CREATE TABLE IF NOT EXISTS dashboard_stats (
      id INTEGER PRIMARY KEY DEFAULT 1,
      total_students INTEGER DEFAULT 0,
      total_teachers INTEGER DEFAULT 0,
      total_classes INTEGER DEFAULT 0,
      present_today INTEGER DEFAULT 0,
      absent_today INTEGER DEFAULT 0,
      pending_fees REAL DEFAULT 0,
      last_updated TEXT
    );

    INSERT OR IGNORE INTO dashboard_stats (id) VALUES (1);
  `);

  console.log('Database initialized successfully');
};

// Database operations helper
export const executeQuery = async <T>(
  query: string,
  params: any[] = []
): Promise<T[]> => {
  const results = await db.getAllAsync<T>(query, params);
  return results;
};

export const executeUpdate = async (
  query: string,
  params: any[] = []
): Promise<number> => {
  const result = await db.runAsync(query, params);
  return result.changes;
};

export const getDatabase = () => db;
