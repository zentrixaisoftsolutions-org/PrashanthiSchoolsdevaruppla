from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_, case
from database import get_db
from models import StaffAttendance, AttendanceDevice, Staff, User, Department
from auth import get_current_user, require_page_access
from typing import List, Optional
from datetime import datetime, date, time, timedelta
import logging
import pandas as pd
import numpy as np
from utils.performance import calculate_working_days_vectorized

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/staff-attendance", tags=["Staff Attendance Management"])


def build_staff_attendance_response(record: StaffAttendance) -> dict:
    """Build staff attendance response with related data."""
    staff = record.staff
    return {
        "id": record.id,
        "staff_id": record.staff_id,
        "staff_name": f"{staff.first_name} {staff.last_name or ''}".strip() if staff else None,
        "employee_id": staff.employee_id if staff else None,
        "designation": staff.designation if staff else None,
        "department_name": staff.department.name if staff and staff.department else None,
        "mobile": staff.mobile if staff else None,
        "attendance_date": record.attendance_date,
        "check_in_time": record.check_in_time,
        "check_out_time": record.check_out_time,
        "status": record.status,
        "is_manual_entry": record.is_manual_entry,
        "remarks": record.remarks,
        "created_at": record.created_at,
    }


# ==================== RFID SCAN ====================

@router.post("/scan", response_model=dict)
async def process_staff_rfid_scan(
    device_id: int = Query(...),
    rfid_id: str = Query(...),
    scan_time: Optional[datetime] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Process RFID scan for staff members."""
    device = db.query(AttendanceDevice).filter(AttendanceDevice.id == device_id).first()
    if not device:
        return {"success": False, "message": "Device not found"}
    if device.status != "connected":
        return {"success": False, "message": "Device is not connected"}

    staff = db.query(Staff).options(
        joinedload(Staff.department)
    ).filter(Staff.rfid == rfid_id).first()
    if not staff:
        return {"success": False, "message": f"No staff found with RFID: {rfid_id}"}

    now = scan_time or datetime.utcnow()
    today = now.date()

    existing = db.query(StaffAttendance).filter(
        StaffAttendance.staff_id == staff.id,
        StaffAttendance.attendance_date == today,
    ).first()

    if existing:
        if existing.check_in_time and not existing.check_out_time:
            existing.check_out_time = now
            existing.updated_at = datetime.utcnow()
            db.commit()
            return {
                "success": True,
                "message": f"Check-out recorded for {staff.first_name}",
                "staff_id": staff.id,
                "staff_name": f"{staff.first_name} {staff.last_name or ''}".strip(),
                "attendance_id": existing.id,
                "status": "checked_out",
            }
        return {
            "success": True,
            "message": f"{staff.first_name} already marked present today",
            "staff_id": staff.id,
            "staff_name": f"{staff.first_name} {staff.last_name or ''}".strip(),
            "attendance_id": existing.id,
            "status": existing.status,
        }

    school_start_time = time(9, 0, 0)
    status_val = "late" if now.time() > school_start_time else "present"

    new_record = StaffAttendance(
        staff_id=staff.id,
        attendance_date=today,
        check_in_time=now,
        status=status_val,
        is_manual_entry=False,
    )
    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return {
        "success": True,
        "message": f"Attendance marked for {staff.first_name}" + (" (Late)" if status_val == "late" else ""),
        "staff_id": staff.id,
        "staff_name": f"{staff.first_name} {staff.last_name or ''}".strip(),
        "attendance_id": new_record.id,
        "status": status_val,
    }


# ==================== MANUAL ENTRY (Admin) ====================

@router.post("/manual-entry", response_model=dict)
async def create_staff_manual_attendance(
    staff_id: int = Query(...),
    attendance_date: date = Query(...),
    check_in_time: Optional[str] = Query(None, description="HH:MM"),
    check_out_time: Optional[str] = Query(None, description="HH:MM"),
    staff_status: str = Query(default="present"),
    remarks: Optional[str] = Query(None),
    update_existing: bool = Query(default=False),
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db),
):
    """Admin-created manual attendance for a staff member."""
    staff = db.query(Staff).options(joinedload(Staff.department)).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    check_in_dt = None
    check_out_dt = None
    if check_in_time:
        try:
            h, m = map(int, check_in_time.split(":"))
            check_in_dt = datetime(attendance_date.year, attendance_date.month, attendance_date.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_in_time. Use HH:MM")
    if check_out_time:
        try:
            h, m = map(int, check_out_time.split(":"))
            check_out_dt = datetime(attendance_date.year, attendance_date.month, attendance_date.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_out_time. Use HH:MM")

    final_status = staff_status
    if check_in_dt and staff_status == "present":
        school_start = time(9, 0, 0)
        if check_in_dt.time() > school_start:
            final_status = "late"

    existing = db.query(StaffAttendance).filter(
        StaffAttendance.staff_id == staff_id,
        StaffAttendance.attendance_date == attendance_date,
    ).first()

    if existing and not update_existing:
        raise HTTPException(status_code=409, detail="Attendance already exists for this staff on this date.")

    if existing and update_existing:
        existing.check_in_time = check_in_dt or existing.check_in_time
        existing.check_out_time = check_out_dt or existing.check_out_time
        existing.status = final_status
        existing.is_manual_entry = True
        existing.remarks = remarks or existing.remarks
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        record = existing
        action = "updated"
    else:
        record = StaffAttendance(
            staff_id=staff_id,
            attendance_date=attendance_date,
            check_in_time=check_in_dt or datetime(attendance_date.year, attendance_date.month, attendance_date.day, 9, 0),
            check_out_time=check_out_dt,
            status=final_status,
            is_manual_entry=True,
            remarks=remarks or "Manual entry",
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        action = "created"

    record = db.query(StaffAttendance).options(
        joinedload(StaffAttendance.staff).joinedload(Staff.department)
    ).filter(StaffAttendance.id == record.id).first()

    response = build_staff_attendance_response(record)
    response["action"] = action
    response["message"] = f"Attendance {action} for {staff.first_name} {staff.last_name or ''}".strip()
    return response


# ==================== SELF-SERVICE MANUAL ENTRY (Staff) ====================

@router.post("/self-checkin", response_model=dict)
async def staff_self_checkin(
    check_in_time: Optional[str] = Query(None, description="HH:MM, defaults to now"),
    remarks: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Staff self-service check-in. The logged-in user's email is matched to staff record.
    """
    staff = db.query(Staff).filter(Staff.email == current_user.email, Staff.is_active == True).first()
    if not staff:
        raise HTTPException(status_code=404, detail="No active staff record found for your account")

    today = date.today()
    now = datetime.utcnow()

    check_in_dt = now
    if check_in_time:
        try:
            h, m = map(int, check_in_time.split(":"))
            check_in_dt = datetime(today.year, today.month, today.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_in_time. Use HH:MM")

    existing = db.query(StaffAttendance).filter(
        StaffAttendance.staff_id == staff.id,
        StaffAttendance.attendance_date == today,
    ).first()

    if existing:
        raise HTTPException(status_code=409, detail="You have already checked in today")

    school_start = time(9, 0, 0)
    status_val = "late" if check_in_dt.time() > school_start else "present"

    record = StaffAttendance(
        staff_id=staff.id,
        attendance_date=today,
        check_in_time=check_in_dt,
        status=status_val,
        is_manual_entry=True,
        remarks=remarks or "Self check-in",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "success": True,
        "message": f"Check-in recorded at {check_in_dt.strftime('%I:%M %p')}" + (" (Late)" if status_val == "late" else ""),
        "attendance_id": record.id,
        "status": status_val,
    }


@router.post("/self-checkout", response_model=dict)
async def staff_self_checkout(
    check_out_time: Optional[str] = Query(None, description="HH:MM, defaults to now"),
    remarks: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Staff self-service check-out."""
    staff = db.query(Staff).filter(Staff.email == current_user.email, Staff.is_active == True).first()
    if not staff:
        raise HTTPException(status_code=404, detail="No active staff record found for your account")

    today = date.today()
    now = datetime.utcnow()

    existing = db.query(StaffAttendance).filter(
        StaffAttendance.staff_id == staff.id,
        StaffAttendance.attendance_date == today,
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="No check-in found for today. Please check in first.")
    if existing.check_out_time:
        raise HTTPException(status_code=409, detail="You have already checked out today")

    check_out_dt = now
    if check_out_time:
        try:
            h, m = map(int, check_out_time.split(":"))
            check_out_dt = datetime(today.year, today.month, today.day, h, m)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid check_out_time. Use HH:MM")

    existing.check_out_time = check_out_dt
    existing.remarks = remarks or existing.remarks
    existing.updated_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "message": f"Check-out recorded at {check_out_dt.strftime('%I:%M %p')}",
        "attendance_id": existing.id,
    }


# ==================== DAILY ATTENDANCE LIST ====================

@router.get("/daily", response_model=dict)
async def get_staff_daily_attendance(
    attendance_date: date = Query(default=None),
    department: Optional[str] = Query(None),
    designation: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get daily staff attendance with filters and pagination."""
    if attendance_date is None:
        attendance_date = date.today()

    staff_query = db.query(Staff).options(
        joinedload(Staff.department)
    ).filter(Staff.is_active == True)

    if department:
        staff_query = staff_query.join(Department).filter(Department.name == department)

    if designation:
        staff_query = staff_query.filter(Staff.designation == designation)

    if search:
        term = f"%{search}%"
        staff_query = staff_query.filter(
            or_(
                Staff.first_name.ilike(term),
                Staff.last_name.ilike(term),
                Staff.employee_id.ilike(term),
                Staff.rfid.ilike(term),
            )
        )

    total_staff = staff_query.count()

    # Summary across ALL staff (before pagination)
    all_staff_ids = [r[0] for r in staff_query.with_entities(Staff.id).all()]

    if all_staff_ids:
        day_status_counts = db.query(
            StaffAttendance.status,
            func.count(func.distinct(StaffAttendance.staff_id)),
        ).filter(
            StaffAttendance.attendance_date == attendance_date,
            StaffAttendance.staff_id.in_(all_staff_ids),
        ).group_by(StaffAttendance.status).all()
    else:
        day_status_counts = []

    sc = dict(day_status_counts)
    summary_present_only = sc.get("present", 0)
    summary_late = sc.get("late", 0)
    summary_present = summary_present_only + summary_late  # late counts as present
    summary_absent_marked = sc.get("absent", 0)
    summary_total_marked = summary_present_only + summary_late + summary_absent_marked
    summary_not_marked = max(0, total_staff - summary_total_marked)
    summary_total_absent = summary_absent_marked + summary_not_marked
    summary_percentage = round(summary_present / total_staff * 100, 1) if total_staff > 0 else 0

    # ===== Apply status filter at SQL level (BEFORE pagination) so the
    # paginated list, total count and "Total Records" all agree.
    # Bug previously: filter was applied in Python AFTER paging, so picking
    # "Present" on a page where everyone happened to be absent showed an
    # empty list. =====
    if status_filter:
        sf = status_filter.lower()
        if sf == "absent":
            absent_logs = db.query(StaffAttendance.staff_id).filter(
                StaffAttendance.attendance_date == attendance_date,
                StaffAttendance.status == "absent",
            )
            any_log = db.query(StaffAttendance.staff_id).filter(
                StaffAttendance.attendance_date == attendance_date,
            )
            staff_query = staff_query.filter(
                or_(
                    Staff.id.in_(absent_logs.subquery()),
                    ~Staff.id.in_(any_log.subquery()),
                )
            )
        else:
            matching_logs = db.query(StaffAttendance.staff_id).filter(
                StaffAttendance.attendance_date == attendance_date,
                StaffAttendance.status == sf,
            ).subquery()
            staff_query = staff_query.filter(Staff.id.in_(matching_logs))
        total_staff = staff_query.count()

    # Pagination
    staff_query = staff_query.order_by(Staff.first_name)
    offset = (page - 1) * page_size
    staff_list = staff_query.offset(offset).limit(page_size).all()

    staff_ids = [s.id for s in staff_list]
    logs = db.query(StaffAttendance).filter(
        StaffAttendance.attendance_date == attendance_date,
        StaffAttendance.staff_id.in_(staff_ids) if staff_ids else False,
    ).all()
    attendance_by_staff = {log.staff_id: log for log in logs}

    results = []
    for s in staff_list:
        log = attendance_by_staff.get(s.id)
        staff_status = log.status if log else "absent"

        results.append({
            "staff_id": s.id,
            "staff_name": f"{s.first_name} {s.last_name or ''}".strip(),
            "employee_id": s.employee_id,
            "rfid": s.rfid,
            "designation": s.designation,
            "department_name": s.department.name if s.department else None,
            "mobile": s.mobile,
            "attendance_date": attendance_date,
            "check_in_time": log.check_in_time if log else None,
            "check_out_time": log.check_out_time if log else None,
            "status": staff_status,
            "is_manual_entry": log.is_manual_entry if log else False,
            "attendance_id": log.id if log else None,
            "remarks": log.remarks if log else None,
        })

    total_pages = (total_staff + page_size - 1) // page_size

    return {
        "data": results,
        "total": total_staff,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "present": summary_present,
            "absent": summary_total_absent,
            "late": summary_late,
            "not_marked": summary_not_marked,
            "percentage": summary_percentage,
        },
    }


# ==================== LIVE FEED ====================

@router.get("/live", response_model=List[dict])
async def get_staff_live_attendance(
    limit: int = Query(default=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get recent staff attendance entries for today."""
    today = date.today()
    records = (
        db.query(StaffAttendance)
        .options(joinedload(StaffAttendance.staff).joinedload(Staff.department))
        .filter(StaffAttendance.attendance_date == today)
        .order_by(StaffAttendance.created_at.desc())
        .limit(limit)
        .all()
    )
    return [build_staff_attendance_response(r) for r in records]


# ==================== MARK BULK ABSENT ====================

@router.post("/mark-bulk-absent", response_model=dict)
async def mark_staff_bulk_absent(
    attendance_date: date = Query(default=None),
    department: Optional[str] = Query(None),
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db),
):
    """Mark all staff without attendance as absent for a given date."""
    if attendance_date is None:
        attendance_date = date.today()

    staff_query = db.query(Staff).filter(Staff.is_active == True)
    if department:
        staff_query = staff_query.join(Department).filter(Department.name == department)

    all_staff = staff_query.all()

    existing_ids = {
        r[0]
        for r in db.query(StaffAttendance.staff_id)
        .filter(StaffAttendance.attendance_date == attendance_date)
        .all()
    }

    absent_count = 0
    for s in all_staff:
        if s.id not in existing_ids:
            db.add(
                StaffAttendance(
                    staff_id=s.id,
                    attendance_date=attendance_date,
                    status="absent",
                    is_manual_entry=True,
                    remarks="Auto-marked absent",
                )
            )
            absent_count += 1
    db.commit()

    return {
        "message": f"Marked {absent_count} staff members as absent",
        "absent_count": absent_count,
        "date": attendance_date,
    }


# ==================== UPDATE / DELETE ====================

@router.put("/{attendance_id}", response_model=dict)
async def update_staff_attendance(
    attendance_id: int,
    staff_status: Optional[str] = Query(None),
    check_in_time: Optional[str] = Query(None, description="ISO datetime or HH:MM"),
    check_out_time: Optional[str] = Query(None, description="ISO datetime or HH:MM"),
    remarks: Optional[str] = Query(None),
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db),
):
    """Update a staff attendance record."""
    record = db.query(StaffAttendance).filter(StaffAttendance.id == attendance_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Staff attendance record not found")

    if staff_status is not None:
        record.status = staff_status
    if check_in_time is not None:
        record.check_in_time = datetime.fromisoformat(check_in_time)
    if check_out_time is not None:
        record.check_out_time = datetime.fromisoformat(check_out_time)
    if remarks is not None:
        record.remarks = remarks

    record.updated_at = datetime.utcnow()
    db.commit()

    record = db.query(StaffAttendance).options(
        joinedload(StaffAttendance.staff).joinedload(Staff.department)
    ).filter(StaffAttendance.id == attendance_id).first()

    return build_staff_attendance_response(record)


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_attendance(
    attendance_id: int,
    current_user: User = Depends(require_page_access("/attendance/daily")),
    db: Session = Depends(get_db),
):
    """Delete a staff attendance record."""
    record = db.query(StaffAttendance).filter(StaffAttendance.id == attendance_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Staff attendance record not found")
    db.delete(record)
    db.commit()


# ==================== SUMMARY ENDPOINTS ====================

def _build_staff_summary_query(db: Session, department: Optional[str], designation: Optional[str], search: Optional[str]):
    """Build base staff query with optional filters."""
    q = db.query(Staff).options(joinedload(Staff.department)).filter(Staff.is_active == True)
    if department:
        q = q.join(Department).filter(Department.name == department)
    if designation:
        q = q.filter(Staff.designation == designation)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Staff.first_name.ilike(term),
                Staff.last_name.ilike(term),
                Staff.employee_id.ilike(term),
                Staff.rfid.ilike(term),
            )
        )
    return q


def _staff_attendance_stats(db: Session, staff_ids: List[int], start_date: date, end_date: date):
    """Aggregate attendance stats for given staff in date range."""
    if not staff_ids:
        return 0, 0, 0, 0
    agg = db.query(
        func.sum(case((StaffAttendance.status == "present", 1), else_=0)).label("present"),
        func.sum(case((StaffAttendance.status == "late", 1), else_=0)).label("late"),
        func.sum(case((StaffAttendance.status == "absent", 1), else_=0)).label("absent"),
        func.count(StaffAttendance.id).label("total"),
    ).filter(
        StaffAttendance.staff_id.in_(staff_ids),
        StaffAttendance.attendance_date >= start_date,
        StaffAttendance.attendance_date <= end_date,
    ).first()
    return int(agg.present or 0), int(agg.late or 0), int(agg.absent or 0), int(agg.total or 0)


def _per_staff_counts(db: Session, staff_id: int, start_date: date, end_date: date, working_days: int):
    """Get per-staff attendance breakdown."""
    rows = db.query(
        StaffAttendance.status, func.count(StaffAttendance.id)
    ).filter(
        StaffAttendance.staff_id == staff_id,
        StaffAttendance.attendance_date >= start_date,
        StaffAttendance.attendance_date <= end_date,
    ).group_by(StaffAttendance.status).all()
    counts = {s: c for s, c in rows}
    present = counts.get("present", 0) + counts.get("late", 0)
    late = counts.get("late", 0)
    total_logged = sum(counts.values())
    not_marked = max(0, working_days - total_logged)
    absent = counts.get("absent", 0) + not_marked
    pct = round(present / working_days * 100, 2) if working_days > 0 else 0
    return present, absent, late, pct


@router.get("/summary/weekly", response_model=dict)
async def get_staff_weekly_summary(
    week_start_date: date = Query(...),
    department: Optional[str] = Query(None),
    designation: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Weekly staff attendance summary (Mon-Sat)."""
    week_end = week_start_date + timedelta(days=5)
    today = date.today()
    effective_end = min(week_end, today)

    staff_query = _build_staff_summary_query(db, department, designation, search)
    total = staff_query.count()

    # OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(week_start_date, effective_end)

    all_ids = [r[0] for r in staff_query.with_entities(Staff.id).all()]
    s_present, s_late, s_absent_logged, s_total_records = _staff_attendance_stats(db, all_ids, week_start_date, effective_end)

    if working_days > 0 and total > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total - avg_present
        s_pct = round((s_present + s_late) / (working_days * total) * 100, 1)
    else:
        avg_present = avg_late = avg_absent = 0
        s_pct = 0

    staff_list = staff_query.order_by(Staff.first_name).offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for s in staff_list:
        present, absent, late, pct = _per_staff_counts(db, s.id, week_start_date, effective_end, working_days)
        results.append({
            "staff_id": s.id,
            "staff_name": f"{s.first_name} {s.last_name or ''}".strip(),
            "employee_id": s.employee_id,
            "designation": s.designation,
            "department_name": s.department.name if s.department else None,
            "total_days": working_days,
            "present_days": present,
            "absent_days": absent,
            "late_days": late,
            "attendance_percentage": pct,
            "week_start": week_start_date,
            "week_end": week_end,
        })

    return {
        "data": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {"total_staff": total, "working_days": working_days, "present": avg_present, "absent": avg_absent, "late": avg_late, "percentage": s_pct},
    }


@router.get("/summary/monthly", response_model=dict)
async def get_staff_monthly_summary(
    year: int = Query(...),
    month: int = Query(...),
    department: Optional[str] = Query(None),
    designation: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Monthly staff attendance summary."""
    import calendar
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    today = date.today()
    effective_end = min(month_end, today)

    staff_query = _build_staff_summary_query(db, department, designation, search)
    total = staff_query.count()

    # OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(month_start, effective_end)

    all_ids = [r[0] for r in staff_query.with_entities(Staff.id).all()]
    s_present, s_late, s_absent, s_total = _staff_attendance_stats(db, all_ids, month_start, effective_end)

    if working_days > 0 and total > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total - avg_present
        s_pct = round((s_present + s_late) / (working_days * total) * 100, 1)
    else:
        avg_present = avg_late = avg_absent = 0
        s_pct = 0

    staff_list = staff_query.order_by(Staff.first_name).offset((page - 1) * page_size).limit(page_size).all()
    month_name = calendar.month_name[month]

    results = []
    for s in staff_list:
        present, absent, late, pct = _per_staff_counts(db, s.id, month_start, effective_end, working_days)
        results.append({
            "staff_id": s.id,
            "staff_name": f"{s.first_name} {s.last_name or ''}".strip(),
            "employee_id": s.employee_id,
            "designation": s.designation,
            "department_name": s.department.name if s.department else None,
            "total_days": working_days,
            "present_days": present,
            "absent_days": absent,
            "late_days": late,
            "attendance_percentage": pct,
            "month": month,
            "year": year,
            "month_name": month_name,
        })

    return {
        "data": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {"total_staff": total, "working_days": working_days, "present": avg_present, "absent": avg_absent, "late": avg_late, "percentage": s_pct},
    }


@router.get("/summary/yearly", response_model=dict)
async def get_staff_yearly_summary(
    year: int = Query(...),
    department: Optional[str] = Query(None),
    designation: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Yearly staff attendance summary."""
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    today = date.today()
    effective_end = min(year_end, today)

    staff_query = _build_staff_summary_query(db, department, designation, search)
    total = staff_query.count()

    # OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(year_start, effective_end)

    all_ids = [r[0] for r in staff_query.with_entities(Staff.id).all()]
    s_present, s_late, s_absent, s_total = _staff_attendance_stats(db, all_ids, year_start, effective_end)

    if working_days > 0 and total > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total - avg_present
        s_pct = round((s_present + s_late) / (working_days * total) * 100, 1)
    else:
        avg_present = avg_late = avg_absent = 0
        s_pct = 0

    staff_list = staff_query.order_by(Staff.first_name).offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for s in staff_list:
        present, absent, late, pct = _per_staff_counts(db, s.id, year_start, effective_end, working_days)
        results.append({
            "staff_id": s.id,
            "staff_name": f"{s.first_name} {s.last_name or ''}".strip(),
            "employee_id": s.employee_id,
            "designation": s.designation,
            "department_name": s.department.name if s.department else None,
            "total_days": working_days,
            "present_days": present,
            "absent_days": absent,
            "late_days": late,
            "attendance_percentage": pct,
            "year": year,
        })

    return {
        "data": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {"total_staff": total, "working_days": working_days, "present": avg_present, "absent": avg_absent, "late": avg_late, "percentage": s_pct},
    }


@router.get("/summary/overall", response_model=dict)
async def get_staff_overall_summary(
    department: Optional[str] = Query(None),
    designation: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Overall staff attendance summary across all time."""
    staff_query = _build_staff_summary_query(db, department, designation, search)
    total = staff_query.count()

    # Find date range from actual data
    date_range = db.query(
        func.min(StaffAttendance.attendance_date),
        func.max(StaffAttendance.attendance_date),
    ).first()
    if date_range and date_range[0]:
        start_d, end_d = date_range
        today = date.today()
        effective_end = min(end_d, today)
        # OPTIMIZED with NumPy/Pandas
        working_days = calculate_working_days_vectorized(start_d, effective_end)
    else:
        start_d = end_d = date.today()
        effective_end = date.today()
        working_days = 0

    all_ids = [r[0] for r in staff_query.with_entities(Staff.id).all()]
    s_present, s_late, s_absent, s_total = _staff_attendance_stats(db, all_ids, start_d, effective_end) if working_days > 0 else (0, 0, 0, 0)

    if working_days > 0 and total > 0:
        avg_present = round((s_present + s_late) / working_days)
        avg_late = round(s_late / working_days)
        avg_absent = total - avg_present
        s_pct = round((s_present + s_late) / (working_days * total) * 100, 1)
    else:
        avg_present = avg_late = avg_absent = 0
        s_pct = 0

    staff_list = staff_query.order_by(Staff.first_name).offset((page - 1) * page_size).limit(page_size).all()

    results = []
    for s in staff_list:
        present, absent, late, pct = _per_staff_counts(db, s.id, start_d, effective_end, working_days) if working_days > 0 else (0, 0, 0, 0)
        first_att = db.query(func.min(StaffAttendance.attendance_date)).filter(StaffAttendance.staff_id == s.id).scalar()
        last_att = db.query(func.max(StaffAttendance.attendance_date)).filter(StaffAttendance.staff_id == s.id).scalar()
        results.append({
            "staff_id": s.id,
            "staff_name": f"{s.first_name} {s.last_name or ''}".strip(),
            "employee_id": s.employee_id,
            "designation": s.designation,
            "department_name": s.department.name if s.department else None,
            "total_days": working_days,
            "present_days": present,
            "absent_days": absent,
            "late_days": late,
            "attendance_percentage": pct,
            "first_attendance": first_att,
            "last_attendance": last_att,
        })

    return {
        "data": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {"total_staff": total, "working_days": working_days, "present": avg_present, "absent": avg_absent, "late": avg_late, "percentage": s_pct},
    }


# ==================== STAFF HISTORY ====================

@router.get("/staff/{staff_id}/history", response_model=dict)
async def get_staff_attendance_history(
    staff_id: int,
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get individual staff member's attendance history."""
    staff = db.query(Staff).options(joinedload(Staff.department)).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    query = db.query(StaffAttendance).filter(StaffAttendance.staff_id == staff_id)
    if year:
        query = query.filter(func.extract("year", StaffAttendance.attendance_date) == year)
    if month:
        query = query.filter(func.extract("month", StaffAttendance.attendance_date) == month)

    records = query.order_by(StaffAttendance.attendance_date.desc()).all()

    today = date.today()
    if year:
        start_d = date(year, month or 1, 1)
        if month:
            import calendar
            end_d = date(year, month, calendar.monthrange(year, month)[1])
        else:
            end_d = date(year, 12, 31)
        effective_end = min(end_d, today)
    else:
        start_d = date(today.year, 1, 1)
        effective_end = today

    # OPTIMIZED with NumPy/Pandas
    working_days = calculate_working_days_vectorized(start_d, effective_end)

    present, absent, late, pct = _per_staff_counts(db, staff_id, start_d, effective_end, working_days)

    return {
        "staff": {
            "id": staff.id,
            "name": f"{staff.first_name} {staff.last_name or ''}".strip(),
            "employee_id": staff.employee_id,
            "designation": staff.designation,
            "department_name": staff.department.name if staff.department else None,
            "rfid": staff.rfid,
            "mobile": staff.mobile,
        },
        "summary": {
            "total_days": working_days,
            "present_days": present,
            "absent_days": absent,
            "late_days": late,
            "attendance_percentage": pct,
        },
        "history": [
            {
                "date": r.attendance_date,
                "status": r.status,
                "check_in_time": r.check_in_time,
                "check_out_time": r.check_out_time,
                "is_manual": r.is_manual_entry,
                "remarks": r.remarks,
            }
            for r in records
        ],
    }
