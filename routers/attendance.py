from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, case
from database import get_db
from models import AttendanceLog, AttendanceDevice, Student, Class, User, SMSConfig, SMSLog, SMSTemplate
from schemas import (
    AttendanceLogCreate, AttendanceLogUpdate, AttendanceLogResponse,
    RFIDScanRequest, RFIDScanResponse, DailyAttendanceReport,
    StudentAttendanceSummary, ManualAttendanceCreate
)
from auth import get_current_user, require_role, require_page_access
from typing import List, Optional
from datetime import datetime, date, time, timedelta
import httpx
import logging
import pandas as pd
import numpy as np
from utils.performance import calculate_working_days_vectorized, calculate_attendance_summary_per_student

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance", tags=["Attendance Management"])


def build_attendance_response(log: AttendanceLog) -> dict:
    """Build attendance log response with related data."""
    return {
        "id": log.id,
        "student_id": log.student_id,
        "student_name": f"{log.student.first_name} {log.student.surname or ''}" if log.student else None,
        "admission_number": log.student.admission_number if log.student else None,
        "class_name": log.student.class_info.class_name if log.student and log.student.class_info else None,
        "section_name": log.student.class_info.section_name if log.student and log.student.class_info else None,
        "device_id": log.device_id,
        "device_name": log.device.device_name if log.device else None,
        "rfid_scanned": log.rfid_scanned,
        "attendance_date": log.attendance_date,
        "check_in_time": log.check_in_time,
        "check_out_time": log.check_out_time,
        "status": log.status,
        "is_manual_entry": log.is_manual_entry,
        "remarks": log.remarks,
        "sms_sent": log.sms_sent if hasattr(log, 'sms_sent') else False,
        "whatsapp_sent": log.whatsapp_sent if hasattr(log, 'whatsapp_sent') else False,
        "created_at": log.created_at
    }


@router.post("/scan", response_model=RFIDScanResponse)
async def process_rfid_scan(
    scan_data: RFIDScanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Process an RFID scan event from a device.
    This endpoint is called when a student swipes their RFID card.
    """
    # Verify device exists and is connected
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == scan_data.device_id).first()
    if not device:
        return RFIDScanResponse(
            success=False,
            message="Device not found"
        )
    
    if device.status != "connected":
        return RFIDScanResponse(
            success=False,
            message="Device is not connected"
        )
    
    # Find student by RFID
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.rfid_id == scan_data.rfid_id).first()
    
    if not student:
        return RFIDScanResponse(
            success=False,
            message=f"No student found with RFID: {scan_data.rfid_id}"
        )
    
    # Check if already marked attendance for today
    scan_time = scan_data.scan_time or datetime.utcnow()
    today = scan_time.date()
    
    existing_log = db.query(AttendanceLog).filter(
        AttendanceLog.student_id == student.id,
        AttendanceLog.attendance_date == today
    ).first()
    
    if existing_log:
        # Any scan after check-in updates check-out time (allow re-checkout)
        if existing_log.check_in_time:
            was_checked_out = existing_log.check_out_time is not None
            existing_log.check_out_time = scan_time
            db.commit()
            # Send check-out notification in background
            background_tasks.add_task(
                send_attendance_notification_bg,
                student_id=student.id,
                attendance_log_id=existing_log.id,
                event_type="check_out",
                check_in_time=existing_log.check_in_time,
                check_out_time=scan_time
            )
            action_msg = "Check-out updated" if was_checked_out else "Check-out recorded"
            return RFIDScanResponse(
                success=True,
                message=f"{action_msg} for {student.first_name}",
                student_id=student.id,
                student_name=f"{student.first_name} {student.surname or ''}",
                attendance_id=existing_log.id,
                status="checked_out"
            )
        else:
            return RFIDScanResponse(
                success=True,
                message=f"{student.first_name} already marked present today",
                student_id=student.id,
                student_name=f"{student.first_name} {student.surname or ''}",
                attendance_id=existing_log.id,
                status=existing_log.status
            )
    
    # Determine if late (after 9:00 AM school time)
    school_start_time = time(9, 0, 0)  # 9:00 AM
    check_in_time_only = scan_time.time()
    status_val = "late" if check_in_time_only > school_start_time else "present"
    
    # Create new attendance log
    new_log = AttendanceLog(
        student_id=student.id,
        device_id=device.id,
        rfid_scanned=scan_data.rfid_id,
        attendance_date=today,
        check_in_time=scan_time,
        status=status_val,
        is_manual_entry=False
    )
    
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    
    # Send check-in notification in background
    background_tasks.add_task(
        send_attendance_notification_bg,
        student_id=student.id,
        attendance_log_id=new_log.id,
        event_type="check_in",
        check_in_time=scan_time,
        check_out_time=None
    )
    
    return RFIDScanResponse(
        success=True,
        message=f"Attendance marked for {student.first_name}" + (" (Late)" if status_val == "late" else ""),
        student_id=student.id,
        student_name=f"{student.first_name} {student.surname or ''}",
        attendance_id=new_log.id,
        status=status_val
    )


@router.post("/manual", response_model=dict)
async def create_manual_attendance(
    attendance_data: AttendanceLogCreate,
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """Create manual attendance entry."""
    # Verify student exists
    student = db.query(Student).filter(Student.id == attendance_data.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    # Check for existing entry
    existing = db.query(AttendanceLog).filter(
        AttendanceLog.student_id == attendance_data.student_id,
        AttendanceLog.attendance_date == attendance_data.attendance_date
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance already exists for this date"
        )
    
    log = AttendanceLog(
        student_id=attendance_data.student_id,
        device_id=attendance_data.device_id,
        rfid_scanned=attendance_data.rfid_scanned,
        attendance_date=attendance_data.attendance_date,
        check_in_time=attendance_data.check_in_time or datetime.utcnow(),
        check_out_time=attendance_data.check_out_time,
        status=attendance_data.status,
        is_manual_entry=True,
        remarks=attendance_data.remarks
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    return build_attendance_response(log)


@router.post("/manual-entry", response_model=dict)
async def create_manual_attendance_entry(
    data: ManualAttendanceCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """
    Enhanced manual attendance entry with check-in/check-out times
    and optional SMS/WhatsApp notifications to parents.
    """
    # Verify student exists
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )

    # Parse check-in / check-out times into full datetime objects
    att_date = data.attendance_date
    check_in_dt = None
    check_out_dt = None
    if data.check_in_time:
        try:
            h, m = map(int, data.check_in_time.split(":"))
            check_in_dt = datetime(att_date.year, att_date.month, att_date.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_in_time format. Use HH:MM")
    if data.check_out_time:
        try:
            h, m = map(int, data.check_out_time.split(":"))
            check_out_dt = datetime(att_date.year, att_date.month, att_date.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_out_time format. Use HH:MM")

    # Determine status automatically if check_in provided and status is "present"
    if check_in_dt and data.status == "present":
        school_start_time = time(9, 0, 0)
        if check_in_dt.time() > school_start_time:
            final_status = "late"
        else:
            final_status = "present"
    else:
        final_status = data.status

    # Check for existing entry
    existing = db.query(AttendanceLog).filter(
        AttendanceLog.student_id == data.student_id,
        AttendanceLog.attendance_date == att_date
    ).first()

    if existing and not data.update_existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Attendance already exists for this student on this date. Enable 'Update Existing' to overwrite."
        )

    if existing and data.update_existing:
        # Update existing record
        existing.check_in_time = check_in_dt or existing.check_in_time
        existing.check_out_time = check_out_dt or existing.check_out_time
        existing.status = final_status
        existing.is_manual_entry = True
        existing.remarks = data.remarks or existing.remarks
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        log = existing
        action = "updated"
    else:
        # Create new record
        log = AttendanceLog(
            student_id=data.student_id,
            attendance_date=att_date,
            check_in_time=check_in_dt or datetime(att_date.year, att_date.month, att_date.day, 9, 0),
            check_out_time=check_out_dt,
            status=final_status,
            is_manual_entry=True,
            remarks=data.remarks or "Manual entry"
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        action = "created"

    # Send notifications if requested
    sms_sent = False
    whatsapp_sent = False
    if data.send_sms or data.send_whatsapp:
        # Determine notification type
        if final_status == "absent":
            template_type = "attendance_absent"
        elif check_out_dt:
            template_type = "check_out"
        else:
            template_type = "check_in"

        config, template = await _get_sms_config_and_template(db, template_type)
        template_text = template.message_template if template else _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])
        try:
            message = _format_notification_message(
                template_text, student, template_type,
                att_date, log.check_in_time, log.check_out_time
            )
        except (KeyError, ValueError, IndexError) as fmt_err:
            logger.warning(f"SMS template formatting failed for '{template_type}': {fmt_err}. Using default.")
            fallback = _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])
            try:
                message = _format_notification_message(
                    fallback, student, template_type,
                    att_date, log.check_in_time, log.check_out_time
                )
            except Exception:
                message = f"Attendance update for {student.first_name} {student.surname or ''}".strip()

        if data.send_sms and config and student.mobile_number:
            sms_ok = await _send_sms_for_log(db, config, student, message, f"attendance_{template_type}")
            if sms_ok:
                log.sms_sent = True
                sms_sent = True

        if data.send_whatsapp and student.mobile_number:
            wa_ok = await _send_whatsapp_for_log(db, student.mobile_number, message)
            if wa_ok:
                log.whatsapp_sent = True
                whatsapp_sent = True

        db.commit()

    # Reload with relationships for response
    log = db.query(AttendanceLog).options(
        joinedload(AttendanceLog.student).joinedload(Student.class_info),
        joinedload(AttendanceLog.device)
    ).filter(AttendanceLog.id == log.id).first()

    response = build_attendance_response(log)
    response["action"] = action
    response["sms_sent"] = sms_sent
    response["whatsapp_sent"] = whatsapp_sent
    response["message"] = (
        f"Attendance {action} for {student.first_name} {student.surname or ''}".strip() +
        (f". SMS sent." if sms_sent else "") +
        (f" WhatsApp sent." if whatsapp_sent else "")
    )
    return response


@router.get("/my-children", response_model=dict)
async def get_my_children_attendance(
    attendance_date: date = Query(default=None, description="Date (defaults to today)"),
    month: int = Query(default=None, ge=1, le=12, description="Month (1-12)"),
    year: int = Query(default=None, ge=2000, le=2100, description="Year"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get attendance for parent's children. Supports single date or month/year view."""
    students = db.query(Student).filter(
        Student.is_active == 1,
        Student.mobile_number == current_user.phone
    ).all() if current_user.phone else []

    student_ids = [s.id for s in students]
    if not student_ids:
        return {"date": date.today().isoformat(), "students": []}

    # Month-wise view
    if month and year:
        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, days_in_month)

        logs = db.query(AttendanceLog).filter(
            AttendanceLog.student_id.in_(student_ids),
            AttendanceLog.attendance_date >= start_date,
            AttendanceLog.attendance_date <= end_date
        ).all()

        # Build log_map: {student_id: {date_str: log}}
        log_map = {}
        for log in logs:
            if log.student_id not in log_map:
                log_map[log.student_id] = {}
            log_map[log.student_id][log.attendance_date.isoformat()] = log

        result = []
        for s in students:
            student_logs = log_map.get(s.id, {})
            present = sum(1 for l in student_logs.values() if l.status == "present")
            absent = sum(1 for l in student_logs.values() if l.status == "absent")
            late = sum(1 for l in student_logs.values() if l.status == "late")

            days = []
            for day_num in range(1, days_in_month + 1):
                d = date(year, month, day_num)
                day_str = d.isoformat()
                log = student_logs.get(day_str)
                days.append({
                    "date": day_str,
                    "day": day_num,
                    "weekday": d.strftime("%a"),
                    "status": log.status if log else "not_marked",
                    "scan_time": log.check_in_time.isoformat() if log and log.check_in_time else None,
                    "check_out_time": log.check_out_time.isoformat() if log and log.check_out_time else None,
                })

            result.append({
                "student_id": s.id,
                "student_name": f"{s.first_name} {s.surname or ''}".strip(),
                "admission_number": s.admission_number,
                "class_name": s.class_info.class_name if s.class_info else None,
                "summary": {"present": present, "absent": absent, "late": late, "total_days": days_in_month},
                "days": days,
            })

        return {"month": month, "year": year, "students": result}

    # Single-date view (original behavior)
    if not attendance_date:
        attendance_date = date.today()

    logs = db.query(AttendanceLog).filter(
        AttendanceLog.student_id.in_(student_ids),
        AttendanceLog.attendance_date == attendance_date
    ).all()

    log_map = {log.student_id: log for log in logs}

    result = []
    for s in students:
        log = log_map.get(s.id)
        result.append({
            "student_id": s.id,
            "student_name": f"{s.first_name} {s.surname or ''}".strip(),
            "admission_number": s.admission_number,
            "class_name": s.class_info.class_name if s.class_info else None,
            "status": log.status if log else "not_marked",
            "scan_time": log.check_in_time.isoformat() if log and log.check_in_time else None,
            "check_out_time": log.check_out_time.isoformat() if log and log.check_out_time else None,
        })

    return {"date": attendance_date.isoformat(), "students": result}


@router.get("/daily", response_model=dict)
async def get_daily_attendance(
    attendance_date: date = Query(default=None, description="Date for attendance (defaults to today)"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    status_filter: Optional[str] = Query(None, description="Filter by status (present, absent, late)"),
    search: Optional[str] = Query(None, description="Search by student name, admission number or RFID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get daily attendance report with pagination."""
    if attendance_date is None:
        attendance_date = date.today()
    
    # Get all students with optional filters
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    if search:
        search_term = f"%{search}%"
        students_query = students_query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.surname.ilike(search_term),
                Student.admission_number.ilike(search_term),
                Student.rfid_id.ilike(search_term),
            )
        )
    
    # Get total count before pagination
    total_students = students_query.count()
    
    # ===== Compute summary across ALL students (subquery — no Python round-trip) =====
    student_id_subq = students_query.with_entities(Student.id).subquery()

    day_status_counts = db.query(
        AttendanceLog.status,
        func.count(func.distinct(AttendanceLog.student_id))
    ).filter(
        AttendanceLog.attendance_date == attendance_date,
        AttendanceLog.student_id.in_(student_id_subq)
    ).group_by(AttendanceLog.status).all()
    
    sc = dict(day_status_counts)
    summary_present_only = sc.get("present", 0)
    summary_late = sc.get("late", 0)
    summary_present = summary_present_only + summary_late  # late counts as present
    summary_absent_marked = sc.get("absent", 0)
    summary_total_marked = summary_present_only + summary_late + summary_absent_marked
    summary_not_marked = max(0, total_students - summary_total_marked)
    summary_total_absent = summary_absent_marked + summary_not_marked
    summary_percentage = round(summary_present / total_students * 100, 1) if total_students > 0 else 0

    # ===== Apply status filter at SQL level (BEFORE pagination) so the
    # paginated list, total count and "Total Records" all agree.
    # Bug previously: filter was applied in Python AFTER paging, so picking
    # "Present" on a page where everyone happened to be absent showed an
    # empty list. =====
    if status_filter:
        sf = status_filter.lower()
        if sf == "absent":
            # Absent = explicit absent log OR no log at all for the date.
            absent_logs = db.query(AttendanceLog.student_id).filter(
                AttendanceLog.attendance_date == attendance_date,
                AttendanceLog.status == "absent",
            )
            any_log = db.query(AttendanceLog.student_id).filter(
                AttendanceLog.attendance_date == attendance_date,
            )
            students_query = students_query.filter(
                or_(
                    Student.id.in_(absent_logs.subquery()),
                    ~Student.id.in_(any_log.subquery()),
                )
            )
        else:
            matching_logs = db.query(AttendanceLog.student_id).filter(
                AttendanceLog.attendance_date == attendance_date,
                AttendanceLog.status == sf,
            ).subquery()
            students_query = students_query.filter(Student.id.in_(matching_logs))
        # Recount AFTER status filter so pagination + total_records reflect it.
        total_students = students_query.count()

    # ===== Apply pagination =====
    students_query = students_query.order_by(Student.first_name)
    offset = (page - 1) * page_size
    students = students_query.offset(offset).limit(page_size).all()
    
    # Get attendance logs for the date
    student_ids = [s.id for s in students]
    logs_query = db.query(AttendanceLog).options(
        joinedload(AttendanceLog.device)
    ).filter(
        AttendanceLog.attendance_date == attendance_date,
        AttendanceLog.student_id.in_(student_ids) if student_ids else False
    )
    
    attendance_logs = logs_query.all()
    attendance_by_student = {log.student_id: log for log in attendance_logs}
    
    results = []
    for student in students:
        log = attendance_by_student.get(student.id)
        
        student_status = log.status if log else "absent"
        
        results.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "rfid_id": student.rfid_id,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "parent_phone": student.mobile_number,
            "attendance_date": attendance_date,
            "check_in_time": log.check_in_time if log else None,
            "check_out_time": log.check_out_time if log else None,
            "status": student_status,
            "device_name": log.device.device_name if log and log.device else None,
            "is_manual_entry": log.is_manual_entry if log else False,
            "attendance_id": log.id if log else None,
            "sms_sent": log.sms_sent if log and hasattr(log, 'sms_sent') else False,
            "whatsapp_sent": log.whatsapp_sent if log and hasattr(log, 'whatsapp_sent') else False,
        })
    
    total_pages = (total_students + page_size - 1) // page_size
    
    return {
        "data": results,
        "total": total_students,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "present": summary_present,
            "absent": summary_total_absent,
            "late": summary_late,
            "not_marked": summary_not_marked,
            "percentage": summary_percentage
        }
    }


@router.get("/report", response_model=List[StudentAttendanceSummary])
async def get_attendance_report(
    from_date: date = Query(..., description="Start date"),
    to_date: date = Query(..., description="End date"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get attendance report for a date range."""
    # Cap end date at today so future days are not counted as absent
    today = date.today()
    effective_end = min(to_date, today)
    
    # Calculate total working days up to today - OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(from_date, effective_end)
    
    # Get students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    students = students_query.all()
    
    results = []
    for student in students:
        # Get attendance counts
        attendance_counts = db.query(
            AttendanceLog.status,
            func.count(AttendanceLog.id)
        ).filter(
            AttendanceLog.student_id == student.id,
            AttendanceLog.attendance_date >= from_date,
            AttendanceLog.attendance_date <= to_date
        ).group_by(AttendanceLog.status).all()
        
        counts_dict = {status: count for status, count in attendance_counts}
        present_days = counts_dict.get("present", 0) + counts_dict.get("late", 0)
        late_days = counts_dict.get("late", 0)
        explicit_absent = counts_dict.get("absent", 0)
        absent_days = max(working_days - present_days, explicit_absent)
        
        percentage = (present_days / working_days * 100) if working_days > 0 else 0
        
        results.append(StudentAttendanceSummary(
            student_id=student.id,
            student_name=f"{student.first_name} {student.surname or ''}".strip(),
            admission_number=student.admission_number,
            class_name=student.class_info.class_name if student.class_info else None,
            section_name=student.class_info.section_name if student.class_info else None,
            total_days=working_days,
            present_days=present_days,
            absent_days=absent_days,
            late_days=late_days,
            attendance_percentage=round(percentage, 2)
        ))
    
    return results


@router.put("/{attendance_id}", response_model=dict)
async def update_attendance(
    attendance_id: int,
    update_data: AttendanceLogUpdate,
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """Update an attendance record."""
    log = db.query(AttendanceLog).filter(AttendanceLog.id == attendance_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )
    
    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(log, field, value)
    
    log.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(log)
    
    # Reload relationships
    db.refresh(log)
    log = db.query(AttendanceLog).options(
        joinedload(AttendanceLog.student).joinedload(Student.class_info),
        joinedload(AttendanceLog.device)
    ).filter(AttendanceLog.id == attendance_id).first()
    
    return build_attendance_response(log)


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attendance(
    attendance_id: int,
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """Delete an attendance record."""
    log = db.query(AttendanceLog).filter(AttendanceLog.id == attendance_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attendance record not found"
        )
    
    db.delete(log)
    db.commit()


@router.post("/mark-bulk-absent", response_model=dict)
async def mark_bulk_absent(
    attendance_date: date = Query(default=None, description="Date to mark absent"),
    class_name: Optional[str] = Query(None, description="Class name"),
    section_name: Optional[str] = Query(None, description="Section name"),
    send_sms: bool = Query(default=False, description="Send SMS to parents of absent students"),
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """
    Mark all students without attendance as absent for a given date.
    Optionally send SMS notifications to parents.
    """
    if attendance_date is None:
        attendance_date = date.today()
    
    # Get all active students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    students = students_query.all()
    
    # Get students who already have attendance
    existing_logs = db.query(AttendanceLog.student_id).filter(
        AttendanceLog.attendance_date == attendance_date
    ).all()
    existing_student_ids = {log[0] for log in existing_logs}
    
    # Mark absent for students without attendance
    absent_count = 0
    sms_count = 0
    absent_students = []
    
    for student in students:
        if student.id not in existing_student_ids:
            absent_log = AttendanceLog(
                student_id=student.id,
                attendance_date=attendance_date,
                status="absent",
                is_manual_entry=True,
                remarks="Auto-marked absent"
            )
            db.add(absent_log)
            absent_count += 1
            absent_students.append(student)
    
    db.commit()
    
    # Send SMS if requested
    if send_sms and absent_students:
        sms_count = await send_absence_sms(absent_students, attendance_date, db)
    
    return {
        "message": f"Marked {absent_count} students as absent",
        "absent_count": absent_count,
        "sms_sent": sms_count,
        "date": attendance_date
    }


async def send_absence_sms(students: List[Student], attendance_date: date, db: Session) -> int:
    """Send SMS to parents of absent students."""
    # Get default SMS config
    config = db.query(SMSConfig).filter(
        SMSConfig.is_active == True,
        SMSConfig.is_default == True
    ).first()
    
    if not config:
        return 0
    
    # Get absence template
    template = db.query(SMSTemplate).filter(
        SMSTemplate.template_type == "attendance_absent",
        SMSTemplate.is_active == True
    ).first()
    
    if not template:
        default_message = "Dear Parent, your ward {student_name} was absent from school on {date}. Please contact the school for more details."
    else:
        default_message = template.message_template
    
    sms_count = 0
    for student in students:
        phone = student.mobile_number
        if not phone:
            continue
        
        # Format message
        cls = f"{student.class_info.class_name} - {student.class_info.section_name}" if student.class_info else "N/A"
        message = default_message.format(
            student_name=f"{student.first_name} {student.surname or ''}".strip(),
            date=attendance_date.strftime("%d-%m-%Y"),
            admission_number=student.admission_number,
            class_name=cls,
            check_in_time="-",
            check_out_time="-",
        )
        
        # Create SMS log entry
        sms_log = SMSLog(
            config_id=config.id,
            student_id=student.id,
            phone_number=phone,
            message=message,
            message_type="attendance_absent",
            status="pending"
        )
        db.add(sms_log)
        
        # Try to send SMS
        try:
            success = await send_sms_via_provider(config, phone, message)
            if success:
                sms_log.status = "sent"
                sms_log.sent_at = datetime.utcnow()
                sms_count += 1
                # Update the attendance log sms_sent flag
                att_log = db.query(AttendanceLog).filter(
                    AttendanceLog.student_id == student.id,
                    AttendanceLog.attendance_date == attendance_date
                ).first()
                if att_log:
                    att_log.sms_sent = True
            else:
                sms_log.status = "failed"
        except Exception as e:
            sms_log.status = "failed"
            sms_log.provider_response = str(e)
    
    db.commit()
    return sms_count


async def send_sms_via_provider(config: SMSConfig, phone: str, message: str) -> tuple:
    """
    Send SMS via configured provider (Twilio, Fast2SMS, MSG91, or generic).
    Delegates to the provider-specific implementations in routers.sms.
    Returns (success: bool, response_text: str).
    """
    try:
        from routers.sms import send_sms_via_provider as _sms_send
        success, response_text = await _sms_send(config, phone, message)
        if not success:
            logger.warning(f"SMS send failed: {response_text[:200]}")
        return success, response_text
    except Exception as e:
        logger.error(f"SMS send error: {e}")
        return False, str(e)


# ==================== NOTIFICATION HELPERS ====================

async def _get_sms_config_and_template(db: Session, template_type: str):
    """Get active SMS config and template for a given type."""
    config = db.query(SMSConfig).filter(
        SMSConfig.is_active == True,
        SMSConfig.is_default == True
    ).first()
    template = db.query(SMSTemplate).filter(
        SMSTemplate.template_type == template_type,
        SMSTemplate.is_active == True
    ).first()
    return config, template


def _format_notification_message(template_text: str, student, event_type: str,
                                  attendance_date=None, check_in_time=None, check_out_time=None) -> str:
    """Format a notification message with student/attendance placeholders."""
    name = f"{student.first_name} {student.surname or ''}".strip()
    dt = attendance_date or date.today()
    date_str = dt.strftime("%d-%m-%Y") if hasattr(dt, 'strftime') else str(dt)
    cin = check_in_time.strftime("%I:%M %p") if check_in_time else "-"
    cout = check_out_time.strftime("%I:%M %p") if check_out_time else "-"
    cls = f"{student.class_info.class_name} - {student.class_info.section_name}" if student.class_info else "N/A"

    return template_text.format(
        student_name=name,
        date=date_str,
        admission_number=student.admission_number,
        check_in_time=cin,
        check_out_time=cout,
        class_name=cls,
    )


_DEFAULT_TEMPLATES = {
    "check_in": "Dear Parent, your ward {student_name} ({class_name}) has arrived at school on {date} at {check_in_time}.",
    "general": "Dear Parent, your ward {student_name} ({class_name}) has arrived at school on {date} at {check_in_time}.",
    "attendance_late": "Dear Parent, your ward {student_name} ({class_name}) was late to school on {date}. Check-in time: {check_in_time}.",
    "check_out": "Dear Parent, your ward {student_name} ({class_name}) has left school on {date}. Check-in: {check_in_time}, Check-out: {check_out_time}.",
    "attendance_absent": "Dear Parent, your ward {student_name} ({class_name}) was absent from school on {date}. Please contact the school for more details.",
}


async def _send_sms_for_log(db: Session, config: SMSConfig, student, message: str, msg_type: str) -> bool:
    """Send SMS and create log entry."""
    phone = student.mobile_number
    if not phone or not config:
        return False
    sms_log = SMSLog(
        config_id=config.id, student_id=student.id,
        phone_number=phone, message=message,
        message_type=msg_type, status="pending"
    )
    db.add(sms_log)
    try:
        success, response_text = await send_sms_via_provider(config, phone, message)
        if success:
            sms_log.status = "sent"
            sms_log.sent_at = datetime.utcnow()
            db.commit()
            return True
        sms_log.status = "failed"
        sms_log.provider_response = (response_text or "")[:500]
        db.commit()
    except Exception as e:
        sms_log.status = "failed"
        sms_log.provider_response = str(e)[:500]
        db.commit()
    return False


async def _send_whatsapp_for_log(db: Session, phone: str, message: str) -> bool:
    """
    Send WhatsApp message via configured provider.
    Uses WhatsApp Business API / generic WhatsApp gateway.
    Returns True if sent successfully.
    """
    if not phone:
        return False
    try:
        # Normalize phone number
        phone = phone.strip()
        if not phone.startswith("+"):
            if phone.startswith("0"):
                phone = phone[1:]
            if len(phone) == 10:
                phone = "+91" + phone

        # Try to find WhatsApp config (provider_name containing 'whatsapp')
        whatsapp_config = db.query(SMSConfig).filter(
            SMSConfig.is_active == True,
            SMSConfig.provider_name.ilike("%whatsapp%")
        ).first()

        if whatsapp_config and whatsapp_config.base_url:
            async with httpx.AsyncClient() as client:
                payload = {
                    "apikey": whatsapp_config.api_key,
                    "phone": phone,
                    "message": message,
                }
                headers = {"Authorization": f"Bearer {whatsapp_config.api_key}"}
                response = await client.post(
                    whatsapp_config.base_url, json=payload, headers=headers, timeout=30.0
                )
                return response.status_code in (200, 201)
        # Fallback: log that WhatsApp is not configured but mark as attempted
        logger.info(f"WhatsApp provider not configured. Message for {phone}: {message[:60]}...")
        return False
    except Exception as e:
        logger.error(f"WhatsApp send error: {e}")
        return False


async def send_attendance_notification_bg(student_id: int, attendance_log_id: int,
                                           event_type: str, check_in_time=None, check_out_time=None):
    """Background task: send SMS + WhatsApp for a single attendance event."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        student = db.query(Student).options(
            joinedload(Student.class_info)
        ).filter(Student.id == student_id).first()
        if not student:
            logger.warning(f"[Notification] Student id={student_id} not found, skipping")
            return

        # Resolve phone number: prefer mobile_number, fall back to phone_number
        phone = (student.mobile_number or "").strip() or (student.phone_number or "").strip()
        if not phone:
            logger.warning(
                f"[Notification] No phone number for student id={student_id} "
                f"({student.first_name} {student.surname or ''}), skipping SMS"
            )
            return

        log = db.query(AttendanceLog).filter(AttendanceLog.id == attendance_log_id).first()
        if not log:
            logger.warning(f"[Notification] AttendanceLog id={attendance_log_id} not found, skipping")
            return

        # Deduplicate: skip only if an SMS for this exact log+event was already sent within the last 5 minutes
        from datetime import timedelta
        dedup_cutoff = datetime.utcnow() - timedelta(minutes=5)
        sms_type_for_event = f"attendance_check_out" if event_type == "check_out" else f"attendance_check_in"
        # For late check-in, the message_type is "attendance_attendance_late" so we match with a prefix
        existing_sms = db.query(SMSLog).filter(
            SMSLog.student_id == student_id,
            SMSLog.status == "sent",
            SMSLog.created_at >= dedup_cutoff,
        ).filter(
            SMSLog.message_type.like(
                "attendance_check_out%" if event_type == "check_out" else "attendance_check_in%"
            ) if event_type in ("check_in", "check_out")
            else SMSLog.message_type.like("attendance_attendance_%")
        ).first()
        if existing_sms:
            logger.info(
                f"[Notification] Duplicate skipped — {event_type} SMS already sent "
                f"for student_id={student_id} within last 5 min"
            )
            return

        # Always read times from the log to ensure check_in_time is available during checkout
        check_in_time = check_in_time or log.check_in_time
        check_out_time = check_out_time or log.check_out_time

        # Determine template type based on event and time
        if event_type == "check_in":
            if log.status == "late":
                template_type = "attendance_late"
            else:
                template_type = "check_in"
        else:
            template_type = "check_out"

        config, template = await _get_sms_config_and_template(db, template_type)
        if not config:
            logger.warning(
                f"[Notification] No active default SMS config found — "
                f"cannot send {event_type} SMS for student_id={student_id}. "
                f"Please configure an SMS provider in Settings → SMS Configurations."
            )
        template_text = template.message_template if template else _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])

        # Safe formatting: fall back to default if DB template has unknown placeholders
        try:
            message = _format_notification_message(
                template_text, student, event_type,
                log.attendance_date, check_in_time, check_out_time
            )
        except (KeyError, ValueError, IndexError) as fmt_err:
            logger.warning(f"SMS template formatting failed for '{template_type}': {fmt_err}. Falling back to default.")
            fallback = _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])
            try:
                message = _format_notification_message(
                    fallback, student, event_type,
                    log.attendance_date, check_in_time, check_out_time
                )
            except Exception:
                message = f"Attendance update for {student.first_name} {student.surname or ''}".strip()

        logger.info(f"[Notification] Sending {event_type} SMS to {phone} for student {student.first_name}: {message[:80]}")

        # Send SMS using resolved phone (not just student.mobile_number)
        sms_ok = False
        if config:
            # Temporarily override student.mobile_number with resolved phone for _send_sms_for_log
            original_phone = student.mobile_number
            student.mobile_number = phone
            sms_ok = await _send_sms_for_log(db, config, student, message, f"attendance_{template_type}")
            student.mobile_number = original_phone
        if sms_ok:
            log.sms_sent = True

        # Send WhatsApp using resolved phone
        wa_ok = await _send_whatsapp_for_log(db, phone, message)
        if wa_ok:
            log.whatsapp_sent = True

        db.commit()
    except Exception as e:
        logger.error(f"Notification background task error: {e}")
    finally:
        db.close()


# ==================== SEND NOTIFICATIONS ENDPOINT ====================

@router.post("/send-notifications", response_model=dict)
async def send_attendance_notifications(
    student_ids: List[int] = Query(..., description="Student IDs to notify"),
    attendance_date: date = Query(default=None, description="Attendance date"),
    channels: str = Query(default="both", description="sms, whatsapp, or both"),
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db)
):
    """
    Send SMS/WhatsApp notifications for selected students whose messages haven't been sent yet.
    This is used to manually trigger notifications for students with sms_sent=No or whatsapp_sent=No.
    """
    if attendance_date is None:
        attendance_date = date.today()

    send_sms_flag = channels in ("sms", "both")
    send_whatsapp_flag = channels in ("whatsapp", "both")

    config, _ = await _get_sms_config_and_template(db, "attendance_absent")

    sms_count = 0
    whatsapp_count = 0
    errors = []

    for sid in student_ids:
        student = db.query(Student).options(
            joinedload(Student.class_info)
        ).filter(Student.id == sid).first()
        if not student:
            continue

        log = db.query(AttendanceLog).filter(
            AttendanceLog.student_id == sid,
            AttendanceLog.attendance_date == attendance_date
        ).first()

        if not log:
            continue

        # Determine message type based on student status
        if log.status == "absent":
            template_type = "attendance_absent"
        elif log.check_out_time:
            template_type = "check_out"
        else:
            template_type = "check_in"

        _, template = await _get_sms_config_and_template(db, template_type)
        template_text = template.message_template if template else _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])
        try:
            message = _format_notification_message(
                template_text, student, template_type,
                log.attendance_date, log.check_in_time, log.check_out_time
            )
        except (KeyError, ValueError, IndexError) as fmt_err:
            logger.warning(f"SMS template formatting failed for '{template_type}': {fmt_err}. Using default.")
            fallback = _DEFAULT_TEMPLATES.get(template_type, _DEFAULT_TEMPLATES["check_in"])
            try:
                message = _format_notification_message(
                    fallback, student, template_type,
                    log.attendance_date, log.check_in_time, log.check_out_time
                )
            except Exception:
                message = f"Attendance update for {student.first_name} {student.surname or ''}".strip()

        phone = student.mobile_number
        if not phone:
            errors.append(f"{student.first_name}: No phone number")
            continue

        # Check if a checkout SMS was specifically sent for this log
        checkout_sms_sent = False
        if log.check_out_time and log.sms_sent:
            checkout_sms_sent = db.query(SMSLog).filter(
                SMSLog.student_id == sid,
                SMSLog.message_type == "attendance_check_out",
                SMSLog.status == "sent",
                SMSLog.created_at >= log.created_at
            ).first() is not None

        # Allow sending SMS if: never sent, OR it's a checkout and checkout SMS not yet sent
        sms_eligible = not log.sms_sent or (template_type == "check_out" and not checkout_sms_sent)

        # Send SMS if required and eligible
        if send_sms_flag and sms_eligible:
            if config:
                sms_ok = await _send_sms_for_log(db, config, student, message, f"attendance_{template_type}")
                if sms_ok:
                    log.sms_sent = True
                    sms_count += 1

        # Send WhatsApp if required and not already sent
        if send_whatsapp_flag and not log.whatsapp_sent:
            wa_ok = await _send_whatsapp_for_log(db, phone, message)
            if wa_ok:
                log.whatsapp_sent = True
                whatsapp_count += 1

    db.commit()

    return {
        "message": f"Notifications sent. SMS: {sms_count}, WhatsApp: {whatsapp_count}",
        "sms_sent": sms_count,
        "whatsapp_sent": whatsapp_count,
        "errors": errors,
    }


@router.get("/live", response_model=List[dict])
async def get_live_attendance(
    limit: int = Query(default=20, description="Number of recent entries"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get live/recent attendance entries for today."""
    today = date.today()
    
    logs = db.query(AttendanceLog).options(
        joinedload(AttendanceLog.student).joinedload(Student.class_info),
        joinedload(AttendanceLog.device)
    ).filter(
        AttendanceLog.attendance_date == today
    ).order_by(AttendanceLog.created_at.desc()).limit(limit).all()
    
    return [build_attendance_response(log) for log in logs]


@router.get("/summary/weekly", response_model=dict)
async def get_weekly_attendance_summary(
    week_start_date: date = Query(..., description="Monday of the week"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    search: Optional[str] = Query(None, description="Search by student name, admission number or RFID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get weekly attendance summary (Monday to Saturday) with pagination."""
    week_end_date = week_start_date + timedelta(days=5)  # Saturday
    
    # Cap end date at today so future days are not counted as absent
    today = date.today()
    effective_end = min(week_end_date, today)
    
    # Get students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    if search:
        search_term = f"%{search}%"
        students_query = students_query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.surname.ilike(search_term),
                Student.admission_number.ilike(search_term),
                Student.rfid_id.ilike(search_term),
            )
        )
    
    # Get total count
    total_students = students_query.count()
    
    # Calculate working days only up to today (Mon-Sat) - OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(week_start_date, effective_end)
    
    # ===== Compute summary across ALL students (subquery — no Python round-trip) =====
    student_id_subq = students_query.with_entities(Student.id).subquery()

    if total_students > 0:
        agg = db.query(
            func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label('present'),
            func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label('late'),
            func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label('absent'),
            func.count(AttendanceLog.id).label('total_records')
        ).filter(
            AttendanceLog.student_id.in_(student_id_subq),
            AttendanceLog.attendance_date >= week_start_date,
            AttendanceLog.attendance_date <= effective_end
        ).first()
        s_present = int(agg.present or 0)
        s_late = int(agg.late or 0)
        s_absent_logged = int(agg.absent or 0)
        s_total_records = int(agg.total_records or 0)
    else:
        s_present = s_late = s_absent_logged = s_total_records = 0
    
    # Compute average daily student counts for the summary cards
    if working_days > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total_students - avg_present
        s_percentage = round((s_present + s_late) / (working_days * total_students) * 100, 1) if total_students > 0 else 0
    else:
        avg_present = avg_late = avg_absent = 0
        s_percentage = 0
    
    # ===== Apply pagination =====
    students_query = students_query.order_by(Student.first_name)
    offset = (page - 1) * page_size
    students = students_query.offset(offset).limit(page_size).all()
    
    # ===== Bulk per-page attendance query (eliminates N+1) =====
    page_student_ids = [s.id for s in students]
    if page_student_ids:
        bulk_rows = db.query(
            AttendanceLog.student_id,
            AttendanceLog.status,
            func.count(AttendanceLog.id).label('cnt')
        ).filter(
            AttendanceLog.student_id.in_(page_student_ids),
            AttendanceLog.attendance_date >= week_start_date,
            AttendanceLog.attendance_date <= effective_end
        ).group_by(AttendanceLog.student_id, AttendanceLog.status).all()
        counts_by_sid = {}
        for sid, status, cnt in bulk_rows:
            counts_by_sid.setdefault(sid, {})[status] = cnt
    else:
        counts_by_sid = {}

    results = []
    for student in students:
        counts_dict = counts_by_sid.get(student.id, {})
        present_days = counts_dict.get("present", 0) + counts_dict.get("late", 0)
        late_days = counts_dict.get("late", 0)
        total_logged = sum(counts_dict.values())
        not_marked_days = max(0, working_days - total_logged)
        absent_days = counts_dict.get("absent", 0) + not_marked_days
        
        percentage = (present_days / working_days * 100) if working_days > 0 else 0
        
        results.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "total_days": working_days,
            "present_days": present_days,
            "absent_days": absent_days,
            "late_days": late_days,
            "attendance_percentage": round(percentage, 2),
            "week_start": week_start_date,
            "week_end": week_end_date
        })
    
    total_pages = (total_students + page_size - 1) // page_size
    
    return {
        "data": results,
        "total": total_students,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_students": total_students,
            "working_days": working_days,
            "present": avg_present,
            "absent": avg_absent,
            "late": avg_late,
            "percentage": s_percentage
        }
    }


@router.get("/summary/monthly", response_model=dict)
async def get_monthly_attendance_summary(
    year: int = Query(..., description="Year"),
    month: int = Query(..., description="Month (1-12)"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    search: Optional[str] = Query(None, description="Search by student name, admission number or RFID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get monthly attendance summary with pagination."""
    from calendar import monthrange
    
    month_start = date(year, month, 1)
    _, last_day = monthrange(year, month)
    month_end = date(year, month, last_day)
    
    # Cap end date at today so future days are not counted as absent
    today = date.today()
    effective_end = min(month_end, today)
    
    # Calculate working days only up to today (exclude Sundays) - OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(month_start, effective_end)
    
    # Get students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    if search:
        search_term = f"%{search}%"
        students_query = students_query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.surname.ilike(search_term),
                Student.admission_number.ilike(search_term),
                Student.rfid_id.ilike(search_term),
            )
        )
    
    # Get total count
    total_students = students_query.count()
    
    # ===== Compute summary across ALL students (subquery — no Python round-trip) =====
    student_id_subq = students_query.with_entities(Student.id).subquery()

    if total_students > 0:
        agg = db.query(
            func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label('present'),
            func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label('late'),
            func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label('absent'),
            func.count(AttendanceLog.id).label('total_records')
        ).filter(
            AttendanceLog.student_id.in_(student_id_subq),
            AttendanceLog.attendance_date >= month_start,
            AttendanceLog.attendance_date <= effective_end
        ).first()
        s_present = int(agg.present or 0)
        s_late = int(agg.late or 0)
        s_absent_logged = int(agg.absent or 0)
        s_total_records = int(agg.total_records or 0)
    else:
        s_present = s_late = s_absent_logged = s_total_records = 0
    
    # Compute average daily student counts for the summary cards
    if working_days > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total_students - avg_present
        s_percentage = round((s_present + s_late) / (working_days * total_students) * 100, 1) if total_students > 0 else 0
    else:
        avg_present = avg_late = avg_absent = 0
        s_percentage = 0
    
    # ===== Apply pagination =====
    students_query = students_query.order_by(Student.first_name)
    offset = (page - 1) * page_size
    students = students_query.offset(offset).limit(page_size).all()
    
    # ===== Bulk per-page attendance query (eliminates N+1) =====
    page_student_ids = [s.id for s in students]
    if page_student_ids:
        bulk_rows = db.query(
            AttendanceLog.student_id,
            AttendanceLog.status,
            func.count(AttendanceLog.id).label('cnt')
        ).filter(
            AttendanceLog.student_id.in_(page_student_ids),
            AttendanceLog.attendance_date >= month_start,
            AttendanceLog.attendance_date <= effective_end
        ).group_by(AttendanceLog.student_id, AttendanceLog.status).all()
        counts_by_sid = {}
        for sid, status, cnt in bulk_rows:
            counts_by_sid.setdefault(sid, {})[status] = cnt
    else:
        counts_by_sid = {}

    results = []
    for student in students:
        counts_dict = counts_by_sid.get(student.id, {})
        present_days = counts_dict.get("present", 0) + counts_dict.get("late", 0)
        late_days = counts_dict.get("late", 0)
        total_logged = sum(counts_dict.values())
        not_marked_days = max(0, working_days - total_logged)
        absent_days = counts_dict.get("absent", 0) + not_marked_days
        
        percentage = (present_days / working_days * 100) if working_days > 0 else 0
        
        results.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "total_days": working_days,
            "present_days": present_days,
            "absent_days": absent_days,
            "late_days": late_days,
            "attendance_percentage": round(percentage, 2),
            "month": month,
            "year": year,
            "month_name": month_start.strftime("%B")
        })
    
    total_pages = (total_students + page_size - 1) // page_size
    
    return {
        "data": results,
        "total": total_students,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_students": total_students,
            "working_days": working_days,
            "present": avg_present,
            "absent": avg_absent,
            "late": avg_late,
            "percentage": s_percentage
        }
    }


@router.get("/summary/yearly", response_model=dict)
async def get_yearly_attendance_summary(
    year: int = Query(..., description="Academic year"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    search: Optional[str] = Query(None, description="Search by student name, admission number or RFID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get yearly attendance summary with pagination."""
    from calendar import monthrange
    
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    
    # Cap end date at today so future days are not counted as absent
    today = date.today()
    effective_end = min(year_end, today)
    
    # Calculate working days only up to today (exclude Sundays) - OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(year_start, effective_end)
    
    # Get students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    if search:
        search_term = f"%{search}%"
        students_query = students_query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.surname.ilike(search_term),
                Student.admission_number.ilike(search_term),
                Student.rfid_id.ilike(search_term),
            )
        )
    
    # Get total count
    total_students = students_query.count()
    
    # ===== Compute summary across ALL students (subquery — no Python round-trip) =====
    student_id_subq = students_query.with_entities(Student.id).subquery()

    if total_students > 0:
        agg = db.query(
            func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label('present'),
            func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label('late'),
            func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label('absent'),
            func.count(AttendanceLog.id).label('total_records')
        ).filter(
            AttendanceLog.student_id.in_(student_id_subq),
            AttendanceLog.attendance_date >= year_start,
            AttendanceLog.attendance_date <= effective_end
        ).first()
        s_present = int(agg.present or 0)
        s_late = int(agg.late or 0)
        s_absent_logged = int(agg.absent or 0)
        s_total_records = int(agg.total_records or 0)
    else:
        s_present = s_late = s_absent_logged = s_total_records = 0
    
    # Compute average daily student counts for the summary cards
    if working_days > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total_students - avg_present
        s_percentage = round((s_present + s_late) / (working_days * total_students) * 100, 1) if total_students > 0 else 0
    else:
        avg_present = avg_late = avg_absent = 0
        s_percentage = 0
    
    # ===== Apply pagination =====
    students_query = students_query.order_by(Student.first_name)
    offset = (page - 1) * page_size
    students = students_query.offset(offset).limit(page_size).all()
    
    # ===== Bulk per-page attendance query (eliminates N+1) =====
    page_student_ids = [s.id for s in students]
    if page_student_ids:
        bulk_rows = db.query(
            AttendanceLog.student_id,
            AttendanceLog.status,
            func.count(AttendanceLog.id).label('cnt')
        ).filter(
            AttendanceLog.student_id.in_(page_student_ids),
            AttendanceLog.attendance_date >= year_start,
            AttendanceLog.attendance_date <= effective_end
        ).group_by(AttendanceLog.student_id, AttendanceLog.status).all()
        counts_by_sid = {}
        for sid, status, cnt in bulk_rows:
            counts_by_sid.setdefault(sid, {})[status] = cnt
    else:
        counts_by_sid = {}

    results = []
    for student in students:
        counts_dict = counts_by_sid.get(student.id, {})
        present_days = counts_dict.get("present", 0) + counts_dict.get("late", 0)
        late_days = counts_dict.get("late", 0)
        total_logged = sum(counts_dict.values())
        not_marked_days = max(0, working_days - total_logged)
        absent_days = counts_dict.get("absent", 0) + not_marked_days
        
        percentage = (present_days / working_days * 100) if working_days > 0 else 0
        
        results.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "total_days": working_days,
            "present_days": present_days,
            "absent_days": absent_days,
            "late_days": late_days,
            "attendance_percentage": round(percentage, 2),
            "year": year
        })
    
    total_pages = (total_students + page_size - 1) // page_size
    
    return {
        "data": results,
        "total": total_students,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_students": total_students,
            "working_days": working_days,
            "present": avg_present,
            "absent": avg_absent,
            "late": avg_late,
            "percentage": s_percentage
        }
    }


@router.get("/summary/overall", response_model=dict)
async def get_overall_attendance_summary(
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    search: Optional[str] = Query(None, description="Search by student name, admission number or RFID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall attendance percentage for all students with pagination."""
    # Get students
    students_query = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.is_active == True)
    
    if class_name:
        students_query = students_query.join(Class).filter(Class.class_name == class_name)
        if section_name:
            students_query = students_query.filter(Class.section_name == section_name)
    
    if search:
        search_term = f"%{search}%"
        students_query = students_query.filter(
            or_(
                Student.first_name.ilike(search_term),
                Student.surname.ilike(search_term),
                Student.admission_number.ilike(search_term),
                Student.rfid_id.ilike(search_term),
            )
        )
    
    # Get total count
    total_students = students_query.count()
    
    # ===== Compute summary across ALL students (subquery — no Python round-trip) =====
    student_id_subq = students_query.with_entities(Student.id).subquery()

    if total_students > 0:
        agg = db.query(
            func.sum(case((AttendanceLog.status.in_(["present", "late"]), 1), else_=0)).label('present'),
            func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label('late'),
            func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label('absent'),
            func.count(AttendanceLog.id).label('total_records'),
            func.count(func.distinct(AttendanceLog.attendance_date)).label('total_days')
        ).filter(
            AttendanceLog.student_id.in_(student_id_subq)
        ).first()
        s_present = int(agg.present or 0)
        s_late = int(agg.late or 0)
        s_absent_logged = int(agg.absent or 0)
        s_total_records = int(agg.total_records or 0)
        s_total_days = int(agg.total_days or 0)
    else:
        s_present = s_late = s_absent_logged = s_total_records = s_total_days = 0
    
    # Compute average daily student counts for the summary cards
    if s_total_days > 0 and total_students > 0:
        avg_present = round(s_present / s_total_days)
        avg_late = round(s_late / s_total_days)
        avg_absent = total_students - avg_present
        s_percentage = round(s_present / s_total_records * 100, 1) if s_total_records > 0 else 0
    else:
        avg_present = avg_late = avg_absent = 0
        s_percentage = 0
    
    # ===== Apply pagination =====
    students_query = students_query.order_by(Student.first_name)
    offset = (page - 1) * page_size
    students = students_query.offset(offset).limit(page_size).all()
    
    # ===== Bulk per-page queries (eliminates N+1 and per-student pandas overhead) =====
    page_student_ids = [s.id for s in students]
    today = date.today()
    if page_student_ids:
        bulk_status = db.query(
            AttendanceLog.student_id,
            AttendanceLog.status,
            func.count(AttendanceLog.id).label('cnt')
        ).filter(
            AttendanceLog.student_id.in_(page_student_ids)
        ).group_by(AttendanceLog.student_id, AttendanceLog.status).all()

        bulk_dates = db.query(
            AttendanceLog.student_id,
            func.min(AttendanceLog.attendance_date).label('first_date'),
            func.max(AttendanceLog.attendance_date).label('last_date'),
            func.count(AttendanceLog.id).label('total_logs')
        ).filter(
            AttendanceLog.student_id.in_(page_student_ids)
        ).group_by(AttendanceLog.student_id).all()

        counts_by_sid = {}
        for sid, status, cnt in bulk_status:
            counts_by_sid.setdefault(sid, {})[status] = cnt

        dates_by_sid = {sid: (first, last, total) for sid, first, last, total in bulk_dates}
    else:
        counts_by_sid = {}
        dates_by_sid = {}

    results = []
    for student in students:
        counts_dict = counts_by_sid.get(student.id, {})
        present_logs = counts_dict.get('present', 0) + counts_dict.get('late', 0)
        late_logs = counts_dict.get('late', 0)
        absent_logged = counts_dict.get('absent', 0)
        total_logs = sum(counts_dict.values())

        date_info = dates_by_sid.get(student.id)
        if date_info:
            first_attendance, last_attendance, _ = date_info
            effective_last = min(last_attendance, today)
            working_days = int(np.busday_count(
                first_attendance.isoformat(),
                (effective_last + timedelta(days=1)).isoformat(),
                weekmask='1111110'
            ))
        else:
            first_attendance = last_attendance = None
            working_days = 0

        not_marked_days = max(0, working_days - total_logs)
        absent_days = absent_logged + not_marked_days
        percentage = (present_logs / working_days * 100) if working_days > 0 else 0

        results.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "total_days": working_days,
            "present_days": present_logs,
            "absent_days": absent_days,
            "late_days": late_logs,
            "attendance_percentage": round(percentage, 2),
            "first_attendance": first_attendance,
            "last_attendance": last_attendance
        })
    
    total_pages = (total_students + page_size - 1) // page_size
    
    return {
        "data": results,
        "total": total_students,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_students": total_students,
            "present": avg_present,
            "absent": avg_absent,
            "late": avg_late,
            "percentage": s_percentage
        }
    }


@router.get("/student/{student_id}/history", response_model=dict)
async def get_student_attendance_history(
    student_id: int,
    year: int = Query(None, description="Filter by year"),
    month: int = Query(None, description="Filter by month"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed attendance history for a specific student."""
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(Student.id == student_id).first()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Build date filters
    logs_query = db.query(AttendanceLog).filter(
        AttendanceLog.student_id == student_id
    )
    
    if year:
        if month:
            from calendar import monthrange
            start_date = date(year, month, 1)
            _, last_day = monthrange(year, month)
            end_date = date(year, month, last_day)
        else:
            start_date = date(year, 1, 1)
            end_date = date(year, 12, 31)
        
        logs_query = logs_query.filter(
            AttendanceLog.attendance_date >= start_date,
            AttendanceLog.attendance_date <= end_date
        )
    
    logs = logs_query.order_by(AttendanceLog.attendance_date.desc()).all()
    
    # Calculate summary
    total_present = sum(1 for log in logs if log.status in ["present", "late"])
    total_late = sum(1 for log in logs if log.status == "late")
    total_absent = sum(1 for log in logs if log.status == "absent")
    total_days = len(logs)
    
    percentage = (total_present / total_days * 100) if total_days > 0 else 0
    
    return {
        "student": {
            "id": student.id,
            "name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "rfid_id": student.rfid_id,
            "mobile_number": student.mobile_number
        },
        "summary": {
            "total_days": total_days,
            "present_days": total_present,
            "absent_days": total_absent,
            "late_days": total_late,
            "attendance_percentage": round(percentage, 2)
        },
        "history": [
            {
                "date": log.attendance_date,
                "status": log.status,
                "check_in_time": log.check_in_time,
                "check_out_time": log.check_out_time,
                "is_manual": log.is_manual_entry,
                "remarks": log.remarks
            }
            for log in logs
        ]
    }
