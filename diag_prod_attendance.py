"""Run on the PRODUCTION server. Verifies the actual production DB state
and whether the poller has processed any EasyTimePro transactions."""
from datetime import date
from database import SessionLocal
from models import Student, AttendanceLog

TARGET_RFID = "3250871"

db = SessionLocal()
try:
    # 1. Confirm production DB really has the rfid set
    s = db.query(Student).filter(Student.rfid_id == TARGET_RFID).first()
    if s:
        print(f"[OK] Student with rfid_id={TARGET_RFID!r}: id={s.id} {s.first_name} {s.surname or ''} class_id={s.class_id} active={s.is_active}")
    else:
        print(f"[FAIL] No Student in production DB has rfid_id={TARGET_RFID!r}")
        # Show what student id=2689 actually has
        s2689 = db.query(Student).filter(Student.id == 2689).first()
        if s2689:
            print(f"       Student id=2689 currently has rfid_id={s2689.rfid_id!r}")

    # 2. Any AttendanceLog rows from EasyTimePro at all?
    etp_logs = db.query(AttendanceLog).filter(AttendanceLog.remarks.like("etp:%")).order_by(AttendanceLog.id.desc()).limit(10).all()
    print(f"\nAttendanceLog rows with etp:* remarks: {len(etp_logs)}")
    for l in etp_logs:
        print(f"  id={l.id} student_id={l.student_id} date={l.attendance_date} status={l.status} check_in={l.check_in_time} check_out={l.check_out_time} remarks={l.remarks}")

    # 3. Today's logs for the matched student
    if s:
        today_logs = db.query(AttendanceLog).filter(
            AttendanceLog.student_id == s.id,
            AttendanceLog.attendance_date == date.today(),
        ).all()
        print(f"\nToday's logs for student {s.id}: {len(today_logs)}")
        for l in today_logs:
            print(f"  id={l.id} status={l.status} check_in={l.check_in_time} check_out={l.check_out_time} remarks={l.remarks}")
finally:
    db.close()
