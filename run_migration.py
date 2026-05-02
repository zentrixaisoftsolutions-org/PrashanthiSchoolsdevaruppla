import pyodbc

conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=.;DATABASE=SchoolERP;UID=erp_user;PWD=p@ssw0rd123!')
conn.autocommit = True
cursor = conn.cursor()

# Step 1: Rename FK columns that conflict with audit created_by
for tbl in ['fee_payments', 'app_notifications']:
    cursor.execute("SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME='created_by'", tbl)
    if cursor.fetchone():
        # Check if it's an integer column (FK), not varchar (audit)
        cursor.execute(
            "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME='created_by'", tbl
        )
        row = cursor.fetchone()
        if row and row[0] in ('int', 'bigint'):
            try:
                cursor.execute(f"EXEC sp_rename '{tbl}.created_by', 'created_by_user_id', 'COLUMN'")
                print(f"Renamed {tbl}.created_by -> created_by_user_id")
            except Exception as e:
                print(f"Skip rename {tbl}.created_by: {e}")

# Step 2: Add audit columns to all tables
tables = [
    'roles', 'users', 'class_names', 'sections', 'class_sections',
    'subjects', 'subject_class_sections', 'classes', 'parents', 'students',
    'grade_criteria', 'academic_years', 'exam_types', 'examination_schedules',
    'examination_schedule_class_sections', 'examination_schedule_subjects',
    'student_exam_marks', 'attendance_devices', 'attendance_logs',
    'sms_configurations', 'sms_logs', 'sms_templates', 'user_menu_access',
    'fee_structures', 'fee_payments', 'school_settings', 'payment_gateway_configs',
    'helpdesk_tickets', 'app_notifications', 'notification_reads',
    'departments', 'staff', 'staff_class_sections', 'staff_subjects',
    'staff_attendance', 'staff_salary_records', 'academic_calendar',
    'academic_calendar_holidays', 'student_exam_attendance',
    'scholastic_categories', 'scholastic_parameters', 'student_scholastic_grades',
    'mobile_push_tokens', 'term_due_dates'
]

for tbl in tables:
    for col, dtype in [
        ('created_by', 'NVARCHAR(100)'),
        ('modified_by', 'NVARCHAR(100)'),
        ('updated_at', 'DATETIME2'),
        ('created_at', 'DATETIME2'),
    ]:
        cursor.execute(
            "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=? AND COLUMN_NAME=?",
            tbl, col
        )
        if not cursor.fetchone():
            try:
                cursor.execute(f"ALTER TABLE [{tbl}] ADD [{col}] {dtype} NULL")
                print(f"Added {tbl}.{col}")
            except Exception as e:
                print(f"Skip {tbl}.{col}: {e}")

conn.close()
print("Migration complete!")
