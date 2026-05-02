from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from database import get_db
from models import Staff, StaffAttendance, StaffSalaryRecord, Department
from schemas import StaffSalaryCalculateRequest, StaffSalaryDetail, StaffSalaryResponse
from auth import get_current_user, require_page_access
from typing import List, Optional
from datetime import date
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/staff-salary", tags=["Staff Salary"])


def _build_salary_detail(staff: Staff, month: int, year: int,
                         total_working_days: int, attendance_map: dict,
                         record_id: int = None) -> StaffSalaryDetail:
    """Calculate salary for a single staff member based on attendance."""
    att = attendance_map.get(staff.id, {
        "present": 0, "absent": 0, "late": 0, "half_day": 0, "leave": 0
    })

    days_present = att["present"]
    days_absent = att["absent"]
    days_late = att["late"]
    days_half_day = att["half_day"]
    days_leave = att["leave"]

    # Days with no attendance record count as absent
    recorded_days = days_present + days_absent + days_late + days_half_day + days_leave
    if recorded_days < total_working_days:
        days_absent += (total_working_days - recorded_days)

    base_salary = staff.salary or 0.0
    per_day_salary = base_salary / total_working_days if total_working_days > 0 else 0.0

    # Deduction: absent > 1 day → deduct for days beyond the first allowed absent day
    # half_day counts as 0.5 deduction
    deductible_absent = max(0, days_absent - 1)
    deductible_half = days_half_day * 0.5
    deduction = round((deductible_absent + deductible_half) * per_day_salary, 2)

    net_salary = round(max(0, base_salary - deduction), 2)

    remarks_parts = []
    if days_absent > 1:
        remarks_parts.append(f"Absent {days_absent} days (1 allowed, {deductible_absent} deducted)")
    if days_half_day > 0:
        remarks_parts.append(f"{days_half_day} half-day(s)")
    if days_late > 0:
        remarks_parts.append(f"{days_late} late arrival(s)")

    staff_name = f"{staff.first_name} {staff.last_name or ''}".strip()
    dept_name = staff.department.name if staff.department else None

    return StaffSalaryDetail(
        id=record_id,
        staff_id=staff.id,
        staff_name=staff_name,
        employee_id=staff.employee_id,
        designation=staff.designation,
        department_name=dept_name,
        month=month,
        year=year,
        total_working_days=total_working_days,
        days_present=days_present,
        days_absent=days_absent,
        days_late=days_late,
        days_half_day=days_half_day,
        days_leave=days_leave,
        base_salary=base_salary,
        deduction=deduction,
        net_salary=net_salary,
        remarks="; ".join(remarks_parts) if remarks_parts else None,
    )


def _get_attendance_map(db: Session, staff_ids: list, month: int, year: int) -> dict:
    """Query attendance and return {staff_id: {present:X, absent:X, ...}}."""
    rows = (
        db.query(
            StaffAttendance.staff_id,
            StaffAttendance.status,
            func.count(StaffAttendance.id).label("cnt"),
        )
        .filter(
            StaffAttendance.staff_id.in_(staff_ids),
            func.month(StaffAttendance.attendance_date) == month,
            func.year(StaffAttendance.attendance_date) == year,
        )
        .group_by(StaffAttendance.staff_id, StaffAttendance.status)
        .all()
    )
    att_map: dict = {}
    for sid, st, cnt in rows:
        if sid not in att_map:
            att_map[sid] = {"present": 0, "absent": 0, "late": 0, "half_day": 0, "leave": 0}
        att_map[sid][st] = cnt
    return att_map


# ==================== CALCULATE / PREVIEW ====================

@router.post("/calculate", response_model=StaffSalaryResponse)
async def calculate_salary(
    payload: StaffSalaryCalculateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_page_access("staff")),
):
    """
    Calculate salary for staff for a given month/year and total working days.
    Deduction rule: absent days > 1 → per-day salary deducted for extra days.
    Half-day counts as 0.5 day deduction.
    Returns preview (not saved yet).
    """
    if payload.total_working_days <= 0:
        raise HTTPException(status_code=400, detail="Total working days must be > 0")
    if payload.month < 1 or payload.month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")

    query = db.query(Staff).options(joinedload(Staff.department)).filter(Staff.is_active == True)
    if payload.staff_ids:
        query = query.filter(Staff.id.in_(payload.staff_ids))
    staff_list = query.all()

    if not staff_list:
        raise HTTPException(status_code=404, detail="No active staff found")

    staff_ids = [s.id for s in staff_list]
    att_map = _get_attendance_map(db, staff_ids, payload.month, payload.year)

    salaries = [
        _build_salary_detail(s, payload.month, payload.year, payload.total_working_days, att_map)
        for s in staff_list
    ]

    total_base = round(sum(s.base_salary for s in salaries), 2)
    total_deduction = round(sum(s.deduction for s in salaries), 2)
    total_net = round(sum(s.net_salary for s in salaries), 2)

    return StaffSalaryResponse(
        month=payload.month,
        year=payload.year,
        total_working_days=payload.total_working_days,
        staff_salaries=salaries,
        summary={"total_base": total_base, "total_deduction": total_deduction, "total_net": total_net},
    )


# ==================== SAVE ====================

@router.post("/save", response_model=dict)
async def save_salary(
    payload: StaffSalaryCalculateRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_page_access("staff")),
):
    """Calculate and save salary records for the given month/year."""
    if payload.total_working_days <= 0:
        raise HTTPException(status_code=400, detail="Total working days must be > 0")

    query = db.query(Staff).options(joinedload(Staff.department)).filter(Staff.is_active == True)
    if payload.staff_ids:
        query = query.filter(Staff.id.in_(payload.staff_ids))
    staff_list = query.all()

    if not staff_list:
        raise HTTPException(status_code=404, detail="No active staff found")

    staff_ids = [s.id for s in staff_list]
    att_map = _get_attendance_map(db, staff_ids, payload.month, payload.year)

    # Delete existing records for this month/year + staff_ids
    db.query(StaffSalaryRecord).filter(
        StaffSalaryRecord.staff_id.in_(staff_ids),
        StaffSalaryRecord.month == payload.month,
        StaffSalaryRecord.year == payload.year,
    ).delete(synchronize_session=False)

    saved = 0
    for s in staff_list:
        detail = _build_salary_detail(s, payload.month, payload.year, payload.total_working_days, att_map)
        rec = StaffSalaryRecord(
            staff_id=s.id,
            month=payload.month,
            year=payload.year,
            total_working_days=payload.total_working_days,
            days_present=detail.days_present,
            days_absent=detail.days_absent,
            days_late=detail.days_late,
            days_half_day=detail.days_half_day,
            days_leave=detail.days_leave,
            base_salary=detail.base_salary,
            deduction=detail.deduction,
            net_salary=detail.net_salary,
            remarks=detail.remarks,
        )
        db.add(rec)
        saved += 1

    db.commit()
    return {"message": f"Salary saved for {saved} staff member(s)", "count": saved}


# ==================== GET SAVED RECORDS ====================

@router.get("/records", response_model=StaffSalaryResponse)
async def get_salary_records(
    month: int = Query(...),
    year: int = Query(...),
    department_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(require_page_access("staff")),
):
    """Retrieve saved salary records for a month/year."""
    query = (
        db.query(StaffSalaryRecord)
        .join(Staff, Staff.id == StaffSalaryRecord.staff_id)
        .options(joinedload(StaffSalaryRecord.staff).joinedload(Staff.department))
        .filter(
            StaffSalaryRecord.month == month,
            StaffSalaryRecord.year == year,
        )
    )
    if department_id:
        query = query.filter(Staff.department_id == department_id)

    records = query.all()

    salaries = []
    for rec in records:
        staff = rec.staff
        staff_name = f"{staff.first_name} {staff.last_name or ''}".strip() if staff else "Unknown"
        dept_name = staff.department.name if staff and staff.department else None
        salaries.append(StaffSalaryDetail(
            id=rec.id,
            staff_id=rec.staff_id,
            staff_name=staff_name,
            employee_id=staff.employee_id if staff else None,
            designation=staff.designation if staff else None,
            department_name=dept_name,
            month=rec.month,
            year=rec.year,
            total_working_days=rec.total_working_days,
            days_present=rec.days_present,
            days_absent=rec.days_absent,
            days_late=rec.days_late,
            days_half_day=rec.days_half_day,
            days_leave=rec.days_leave,
            base_salary=rec.base_salary,
            deduction=rec.deduction,
            net_salary=rec.net_salary,
            remarks=rec.remarks,
        ))

    total_base = round(sum(s.base_salary for s in salaries), 2)
    total_deduction = round(sum(s.deduction for s in salaries), 2)
    total_net = round(sum(s.net_salary for s in salaries), 2)

    working_days = records[0].total_working_days if records else 0

    return StaffSalaryResponse(
        month=month,
        year=year,
        total_working_days=working_days,
        staff_salaries=salaries,
        summary={"total_base": total_base, "total_deduction": total_deduction, "total_net": total_net},
    )


# ==================== DELETE RECORDS ====================

@router.delete("/records", response_model=dict)
async def delete_salary_records(
    month: int = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_page_access("staff")),
):
    """Delete saved salary records for a month/year."""
    count = db.query(StaffSalaryRecord).filter(
        StaffSalaryRecord.month == month,
        StaffSalaryRecord.year == year,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {count} salary record(s)", "count": count}
