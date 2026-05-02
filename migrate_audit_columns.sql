-- ============================================================
-- Migration: Add audit columns (created_by, modified_by) to all tables
-- Also adds missing updated_at / created_at, and renames FK columns
-- Run this ONCE against your SQL Server database.
-- ============================================================

-- ── Rename FK columns that conflict with the new audit created_by ──
-- FeePayments: created_by (int FK) → created_by_user_id
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='fee_payments' AND COLUMN_NAME='created_by')
BEGIN
    EXEC sp_rename 'fee_payments.created_by', 'created_by_user_id', 'COLUMN';
END
GO

-- AppNotifications: created_by (int FK) → created_by_user_id
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='app_notifications' AND COLUMN_NAME='created_by')
BEGIN
    EXEC sp_rename 'app_notifications.created_by', 'created_by_user_id', 'COLUMN';
END
GO


-- ── Helper: add a column if it doesn't already exist ──
-- We'll repeat the pattern for each table.

-- ==================== AUDIT COLUMNS (created_by, modified_by) ====================

DECLARE @tables TABLE (tbl NVARCHAR(128));
INSERT INTO @tables VALUES
  ('roles'),('users'),('class_names'),('sections'),('class_sections'),
  ('subjects'),('subject_class_sections'),('classes'),('parents'),('students'),
  ('grade_criteria'),('academic_years'),('exam_types'),('examination_schedules'),
  ('examination_schedule_class_sections'),('examination_schedule_subjects'),
  ('student_exam_marks'),('attendance_devices'),('attendance_logs'),
  ('sms_configurations'),('sms_logs'),('sms_templates'),('user_menu_access'),
  ('fee_structures'),('fee_payments'),('school_settings'),('payment_gateway_configs'),
  ('helpdesk_tickets'),('app_notifications'),('notification_reads'),
  ('departments'),('staff'),('staff_class_sections'),('staff_subjects'),
  ('staff_attendance'),('staff_salary_records'),('academic_calendar'),
  ('academic_calendar_holidays'),('student_exam_attendance'),
  ('scholastic_categories'),('scholastic_parameters'),('student_scholastic_grades'),
  ('mobile_push_tokens'),('term_due_dates');

DECLARE @tbl NVARCHAR(128), @sql NVARCHAR(MAX);
DECLARE cur CURSOR FOR SELECT tbl FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @tbl;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Add created_by (VARCHAR 100)
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl AND COLUMN_NAME='created_by')
    BEGIN
        SET @sql = 'ALTER TABLE [' + @tbl + '] ADD [created_by] NVARCHAR(100) NULL';
        EXEC sp_executesql @sql;
    END

    -- Add modified_by (VARCHAR 100)
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl AND COLUMN_NAME='modified_by')
    BEGIN
        SET @sql = 'ALTER TABLE [' + @tbl + '] ADD [modified_by] NVARCHAR(100) NULL';
        EXEC sp_executesql @sql;
    END

    -- Add updated_at if missing
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl AND COLUMN_NAME='updated_at')
    BEGIN
        SET @sql = 'ALTER TABLE [' + @tbl + '] ADD [updated_at] DATETIME2 NULL';
        EXEC sp_executesql @sql;
    END

    -- Add created_at if missing
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@tbl AND COLUMN_NAME='created_at')
    BEGIN
        SET @sql = 'ALTER TABLE [' + @tbl + '] ADD [created_at] DATETIME2 NULL';
        EXEC sp_executesql @sql;
    END

    FETCH NEXT FROM cur INTO @tbl;
END
CLOSE cur;
DEALLOCATE cur;
GO

PRINT 'Audit columns migration completed successfully.';
GO
