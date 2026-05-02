from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from database import get_db
from models import AcademicCalendar, AcademicCalendarHoliday, AcademicYear, ClassName, User
from schemas import (
    AcademicCalendarCreate, AcademicCalendarBulkCreate, AcademicCalendarUpdate,
    AcademicCalendarResponse, AcademicCalendarHolidayCreate, AcademicCalendarHolidayResponse,
    AcademicCalendarSummaryResponse,
)
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/academic-calendar", tags=["Academic Calendar"])


def _enrich(cal: AcademicCalendar) -> dict:
    """Convert a calendar ORM object to a response-friendly dict."""
    holidays = cal.holidays or []
    return {
        "id": cal.id,
        "academic_year_id": cal.academic_year_id,
        "class_name_id": cal.class_name_id,
        "month": cal.month,
        "year": cal.year,
        "total_working_days": cal.total_working_days,
        "is_active": cal.is_active,
        "created_at": cal.created_at,
        "updated_at": cal.updated_at,
        "class_name": cal.class_name.name if cal.class_name else None,
        "academic_year_name": cal.academic_year.name if cal.academic_year else None,
        "holidays": holidays,
        "holiday_count": len(holidays),
        "effective_working_days": max(0, cal.total_working_days - len(holidays)),
    }


# ==================== CALENDAR CRUD ====================

@router.post("/", response_model=AcademicCalendarResponse, summary="Create Calendar Entry")
async def create_calendar_entry(
    data: AcademicCalendarCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    existing = db.query(AcademicCalendar).filter(
        AcademicCalendar.academic_year_id == data.academic_year_id,
        AcademicCalendar.class_name_id == data.class_name_id,
        AcademicCalendar.month == data.month,
        AcademicCalendar.year == data.year,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Calendar entry already exists for this class/month")

    entry = AcademicCalendar(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _enrich(entry)


@router.post("/bulk", response_model=List[AcademicCalendarResponse], summary="Bulk Create Calendar Entries")
async def bulk_create_calendar(
    data: AcademicCalendarBulkCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    """Create working-day entries for multiple classes × multiple months at once."""
    created = []
    skipped = 0
    for class_id in data.class_name_ids:
        for month in data.months:
            exists = db.query(AcademicCalendar).filter(
                AcademicCalendar.academic_year_id == data.academic_year_id,
                AcademicCalendar.class_name_id == class_id,
                AcademicCalendar.month == month,
                AcademicCalendar.year == data.year,
            ).first()
            if exists:
                skipped += 1
                continue
            entry = AcademicCalendar(
                academic_year_id=data.academic_year_id,
                class_name_id=class_id,
                month=month,
                year=data.year,
                total_working_days=data.total_working_days,
            )
            db.add(entry)
            created.append(entry)
    db.commit()
    for e in created:
        db.refresh(e)
    return [_enrich(e) for e in created]


@router.get("/", response_model=List[AcademicCalendarResponse], summary="List Calendar Entries")
async def list_calendar(
    academic_year_id: int = None,
    class_name_id: int = None,
    month: int = None,
    year: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(AcademicCalendar).filter(AcademicCalendar.is_active == True)
    if academic_year_id:
        query = query.filter(AcademicCalendar.academic_year_id == academic_year_id)
    if class_name_id:
        query = query.filter(AcademicCalendar.class_name_id == class_name_id)
    if month:
        query = query.filter(AcademicCalendar.month == month)
    if year:
        query = query.filter(AcademicCalendar.year == year)
    entries = query.order_by(AcademicCalendar.class_name_id, AcademicCalendar.year, AcademicCalendar.month).all()
    return [_enrich(e) for e in entries]


@router.get("/summary", response_model=List[AcademicCalendarSummaryResponse], summary="Calendar Summary")
async def calendar_summary(
    academic_year_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a summary grouped by class, showing all months."""
    ay = db.query(AcademicYear).filter(AcademicYear.id == academic_year_id).first()
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")

    entries = (
        db.query(AcademicCalendar)
        .filter(AcademicCalendar.academic_year_id == academic_year_id, AcademicCalendar.is_active == True)
        .order_by(AcademicCalendar.class_name_id, AcademicCalendar.month)
        .all()
    )

    grouped: dict = {}
    for e in entries:
        key = e.class_name_id
        if key not in grouped:
            grouped[key] = {
                "academic_year_id": academic_year_id,
                "academic_year_name": ay.name,
                "class_name_id": key,
                "class_name": e.class_name.name if e.class_name else str(key),
                "months": [],
                "total_working_days": 0,
                "total_holidays": 0,
                "total_effective_days": 0,
            }
        h_count = len(e.holidays or [])
        eff = max(0, e.total_working_days - h_count)
        grouped[key]["months"].append({
            "id": e.id,
            "month": e.month,
            "year": e.year,
            "total_working_days": e.total_working_days,
            "holiday_count": h_count,
            "effective_working_days": eff,
        })
        grouped[key]["total_working_days"] += e.total_working_days
        grouped[key]["total_holidays"] += h_count
        grouped[key]["total_effective_days"] += eff

    return list(grouped.values())


@router.get("/{entry_id}", response_model=AcademicCalendarResponse, summary="Get Calendar Entry")
async def get_calendar_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.query(AcademicCalendar).filter(AcademicCalendar.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    return _enrich(entry)


@router.put("/{entry_id}", response_model=AcademicCalendarResponse, summary="Update Calendar Entry")
async def update_calendar_entry(
    entry_id: int,
    data: AcademicCalendarUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    entry = db.query(AcademicCalendar).filter(AcademicCalendar.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(entry, k, v)
    db.commit()
    db.refresh(entry)
    return _enrich(entry)


@router.delete("/{entry_id}", summary="Delete Calendar Entry")
async def delete_calendar_entry(
    entry_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    entry = db.query(AcademicCalendar).filter(AcademicCalendar.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    db.delete(entry)
    db.commit()
    return {"message": "Calendar entry deleted"}


# ==================== HOLIDAY CRUD ====================

@router.post("/bulk-holiday", summary="Bulk Add Holiday")
async def bulk_add_holiday(
    data: dict,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    """Add a holiday to all matching calendar entries for the given date's month."""
    from datetime import date as date_type, datetime
    academic_year_id = data.get("academic_year_id")
    class_name_ids = data.get("class_name_ids")  # Optional: list or None for all
    holiday_date_str = data.get("holiday_date")
    name = data.get("name")
    remarks = data.get("remarks", "")

    if not academic_year_id or not holiday_date_str or not name:
        raise HTTPException(status_code=400, detail="academic_year_id, holiday_date, and name are required")

    holiday_date = datetime.strptime(holiday_date_str, "%Y-%m-%d").date()
    month = holiday_date.month
    year = holiday_date.year

    query = db.query(AcademicCalendar).filter(
        AcademicCalendar.academic_year_id == academic_year_id,
        AcademicCalendar.month == month,
        AcademicCalendar.year == year,
        AcademicCalendar.is_active == True,
    )
    if class_name_ids:
        query = query.filter(AcademicCalendar.class_name_id.in_(class_name_ids))

    entries = query.all()
    added = 0
    skipped = 0
    for entry in entries:
        dup = db.query(AcademicCalendarHoliday).filter(
            AcademicCalendarHoliday.calendar_id == entry.id,
            AcademicCalendarHoliday.holiday_date == holiday_date,
        ).first()
        if dup:
            skipped += 1
            continue
        holiday = AcademicCalendarHoliday(
            calendar_id=entry.id,
            holiday_date=holiday_date,
            name=name,
            remarks=remarks,
        )
        db.add(holiday)
        added += 1
    db.commit()
    return {"added_count": added, "skipped_count": skipped}


@router.post("/{entry_id}/holidays", response_model=AcademicCalendarHolidayResponse, summary="Add Holiday")
async def add_holiday(
    entry_id: int,
    data: AcademicCalendarHolidayCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    entry = db.query(AcademicCalendar).filter(AcademicCalendar.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Calendar entry not found")

    # Validate holiday date falls within the calendar month
    if data.holiday_date.month != entry.month or data.holiday_date.year != entry.year:
        raise HTTPException(status_code=400, detail="Holiday date must be within the calendar month")

    # Check for duplicate date
    dup = db.query(AcademicCalendarHoliday).filter(
        AcademicCalendarHoliday.calendar_id == entry_id,
        AcademicCalendarHoliday.holiday_date == data.holiday_date,
    ).first()
    if dup:
        raise HTTPException(status_code=400, detail="Holiday already exists for this date")

    holiday = AcademicCalendarHoliday(calendar_id=entry_id, **data.model_dump())
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_id}", summary="Remove Holiday")
async def remove_holiday(
    holiday_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    holiday = db.query(AcademicCalendarHoliday).filter(AcademicCalendarHoliday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    db.delete(holiday)
    db.commit()
    return {"message": "Holiday removed"}
