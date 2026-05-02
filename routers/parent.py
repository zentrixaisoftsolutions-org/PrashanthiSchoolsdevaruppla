"""Parent-scoped endpoints used by the mobile app.

Most data (fees, attendance, results) is already exposed via existing
`/api/{module}/my-children` endpoints which filter by
`Student.user_id == current_user.id OR Student.mobile_number == current_user.phone`.
This router adds the bits not yet covered: children listing & homework feed.
"""
from __future__ import annotations
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import (
    User, Student, Class, HomeworkAssignment,
)
from routers.homework import HomeworkOut, _serialize as _serialize_homework

router = APIRouter(prefix="/api/parent", tags=["Parent (Mobile)"])


class ChildOut(BaseModel):
    id: int
    admission_number: str
    first_name: str
    surname: Optional[str] = None
    full_name: str
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    photo_thumbnail: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    father_guardian_name: Optional[str] = None
    mother_name: Optional[str] = None


def _children_for(db: Session, current_user: User) -> List[Student]:
    if not current_user.phone:
        return []
    rows = (
        db.query(Student)
        .filter(
            Student.is_active == 1,
            Student.mobile_number == current_user.phone,
        )
        .all()
    )
    return rows


@router.get("/children", response_model=List[ChildOut])
def list_children(db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    out: List[ChildOut] = []
    for s in _children_for(db, current_user):
        out.append(ChildOut(
            id=s.id,
            admission_number=s.admission_number,
            first_name=s.first_name,
            surname=s.surname,
            full_name=f"{s.first_name} {s.surname or ''}".strip(),
            class_id=s.class_id,
            class_name=(s.class_info.class_name if s.class_info else None),
            section=(s.class_info.section_name if s.class_info else None),
            photo_thumbnail=s.photo_thumbnail,
            date_of_birth=s.date_of_birth,
            gender=s.gender,
            blood_group=s.blood_group,
            father_guardian_name=s.father_guardian_name,
            mother_name=s.mother_name,
        ))
    return out


@router.get("/homework", response_model=List[HomeworkOut])
def my_children_homework(
    student_id: Optional[int] = None,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recent homework across all of the parent's children, optionally
    narrowed to a specific student. Returns last `days` of assignments."""
    children = _children_for(db, current_user)
    if not children:
        return []

    if student_id is not None:
        children = [c for c in children if c.id == student_id]
        if not children:
            raise HTTPException(403, "Not your child")

    class_ids = [c.class_id for c in children if c.class_id]
    if not class_ids:
        return []

    cutoff = datetime.utcnow().date()
    from datetime import timedelta as _td
    earliest = cutoff - _td(days=max(1, min(days, 180)))

    rows = (
        db.query(HomeworkAssignment)
        .filter(
            HomeworkAssignment.is_active == 1,
            HomeworkAssignment.class_id.in_(class_ids),
            HomeworkAssignment.created_at >= datetime.combine(earliest, datetime.min.time()),
        )
        .order_by(HomeworkAssignment.created_at.desc())
        .limit(200)
        .all()
    )
    return [_serialize_homework(r) for r in rows]


@router.get("/performance-report")
async def parent_performance_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Performance report (attendance + marks summary) for a specific child of the parent."""
    children = _children_for(db, current_user)
    if not any(c.id == student_id for c in children):
        raise HTTPException(403, "Not your child")
    from routers.students import get_student_performance_report  # type: ignore
    return await get_student_performance_report(student_id=student_id, current_user=current_user, db=db)


@router.get("/annual-report")
def parent_annual_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Annual report for a child if it has been generated/published.
    Returns {available: false} when no annual report data is available yet."""
    children = _children_for(db, current_user)
    child = next((c for c in children if c.id == student_id), None)
    if not child:
        raise HTTPException(403, "Not your child")
    # Annual reports require admin-defined level configuration; not auto-generated.
    # Return availability flag so the mobile app can show an appropriate message.
    return {"available": False, "message": "Annual report has not been generated for this student yet."}

