from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models import Staff, Department, User, StaffClassSection, StaffSubject, ClassSection, Subject, ClassTeacherMapping
from schemas import StaffCreate, StaffResponse, StaffUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/staff", tags=["Staff"])


def _sync_mappings(db: Session, staff_id: int, class_section_ids: Optional[List[int]], subject_ids: Optional[List[int]], class_teacher_of_ids: Optional[List[int]] = None):
    """Replace staff class-section, subject, and class-teacher mappings."""
    if class_section_ids is not None:
        db.query(StaffClassSection).filter(StaffClassSection.staff_id == staff_id).delete()
        for cs_id in set(class_section_ids):
            if db.query(ClassSection).filter(ClassSection.id == cs_id).first():
                db.add(StaffClassSection(staff_id=staff_id, class_section_id=cs_id))
    if subject_ids is not None:
        db.query(StaffSubject).filter(StaffSubject.staff_id == staff_id).delete()
        for sub_id in set(subject_ids):
            if db.query(Subject).filter(Subject.id == sub_id).first():
                db.add(StaffSubject(staff_id=staff_id, subject_id=sub_id))
    if class_teacher_of_ids is not None:
        # Remove existing class-teacher mappings for this staff
        db.query(ClassTeacherMapping).filter(ClassTeacherMapping.staff_id == staff_id).delete()
        for cs_id in set(class_teacher_of_ids):
            if db.query(ClassSection).filter(ClassSection.id == cs_id).first():
                # Remove any existing mapping for this class_section (only one teacher per section)
                db.query(ClassTeacherMapping).filter(ClassTeacherMapping.class_section_id == cs_id).delete()
                db.add(ClassTeacherMapping(staff_id=staff_id, class_section_id=cs_id))


def _staff_to_response(s: Staff) -> dict:
    """Convert Staff ORM object to response dict with department_name and mappings."""
    cs_list = []
    cs_ids = []
    for sc in (s.class_sections or []):
        cs = sc.class_section
        if cs:
            cs_ids.append(cs.id)
            cs_list.append({
                "id": cs.id,
                "class_name": cs.class_name.name if cs.class_name else "",
                "section_name": cs.section.name if cs.section else "",
            })
    sub_list = []
    sub_ids = []
    for ss in (s.subjects or []):
        subj = ss.subject
        if subj:
            sub_ids.append(subj.id)
            sub_list.append({
                "id": subj.id,
                "name": subj.name,
                "code": subj.code,
            })
    data = {
        "id": s.id,
        "rfid": s.rfid,
        "employee_id": s.employee_id,
        "first_name": s.first_name,
        "last_name": s.last_name,
        "father_name": s.father_name,
        "gender": s.gender,
        "date_of_birth": s.date_of_birth,
        "mobile": s.mobile,
        "email": s.email,
        "aadhar_number": s.aadhar_number,
        "address": s.address,
        "qualification": s.qualification,
        "designation": s.designation,
        "department_id": s.department_id,
        "department_name": s.department.name if s.department else None,
        "date_of_joining": s.date_of_joining,
        "salary": s.salary,
        "photo_data": s.photo_data,
        "is_active": s.is_active,
        "class_sections": cs_list,
        "subjects": sub_list,
        "class_section_ids": cs_ids,
        "subject_ids": sub_ids,
        "class_teacher_of_ids": [ct.class_section_id for ct in (s.class_teacher_of or [])],
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }
    return data


@router.post("/", response_model=StaffResponse, summary="Add Staff Member")
async def create_staff(
    data: StaffCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    # Validate department if provided
    if data.department_id:
        dept = db.query(Department).filter(Department.id == data.department_id).first()
        if not dept:
            raise HTTPException(status_code=400, detail="Department not found")

    # Check RFID uniqueness
    if data.rfid:
        existing = db.query(Staff).filter(Staff.rfid == data.rfid).first()
        if existing:
            raise HTTPException(status_code=400, detail="RFID already assigned to another staff member")

    # Check employee_id uniqueness
    if data.employee_id:
        existing = db.query(Staff).filter(Staff.employee_id == data.employee_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Employee ID already exists")

    staff_data = data.model_dump(exclude={"class_section_ids", "subject_ids", "class_teacher_of_ids"})
    staff = Staff(**staff_data)
    db.add(staff)
    db.flush()  # get staff.id

    _sync_mappings(db, staff.id, data.class_section_ids, data.subject_ids, data.class_teacher_of_ids)
    db.commit()
    db.refresh(staff)
    return _staff_to_response(staff)


@router.get("/", response_model=List[StaffResponse], summary="List Staff")
async def list_staff(
    department_id: Optional[int] = Query(None, description="Filter by department"),
    search: Optional[str] = Query(None, description="Search by name, RFID, mobile"),
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Staff)

    if not include_inactive:
        query = query.filter(Staff.is_active == True)

    if department_id:
        query = query.filter(Staff.department_id == department_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Staff.first_name.ilike(search_term))
            | (Staff.last_name.ilike(search_term))
            | (Staff.rfid.ilike(search_term))
            | (Staff.mobile.ilike(search_term))
            | (Staff.employee_id.ilike(search_term))
        )

    staff_list = query.order_by(Staff.first_name, Staff.id).all()
    return [_staff_to_response(s) for s in staff_list]


@router.get("/{staff_id}", response_model=StaffResponse, summary="Get Staff Member")
async def get_staff(
    staff_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return _staff_to_response(staff)


@router.put("/{staff_id}", response_model=StaffResponse, summary="Update Staff Member")
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate department if being updated
    if "department_id" in update_data and update_data["department_id"]:
        dept = db.query(Department).filter(Department.id == update_data["department_id"]).first()
        if not dept:
            raise HTTPException(status_code=400, detail="Department not found")

    # Check RFID uniqueness
    if "rfid" in update_data and update_data["rfid"]:
        existing = db.query(Staff).filter(
            Staff.rfid == update_data["rfid"], Staff.id != staff_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="RFID already assigned to another staff member")

    # Check employee_id uniqueness
    if "employee_id" in update_data and update_data["employee_id"]:
        existing = db.query(Staff).filter(
            Staff.employee_id == update_data["employee_id"], Staff.id != staff_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Employee ID already exists")

    # Extract mapping fields before setattr loop
    cs_ids = update_data.pop("class_section_ids", None)
    sub_ids = update_data.pop("subject_ids", None)
    ct_ids = update_data.pop("class_teacher_of_ids", None)

    for key, val in update_data.items():
        setattr(staff, key, val)

    _sync_mappings(db, staff_id, cs_ids, sub_ids, ct_ids)
    db.commit()
    db.refresh(staff)
    return _staff_to_response(staff)


@router.delete("/{staff_id}", status_code=204, summary="Delete Staff Member (soft)")
async def delete_staff(
    staff_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    staff.is_active = False
    db.commit()
    return None


@router.delete("/{staff_id}/permanent", status_code=204, summary="Permanently Delete Staff")
async def permanent_delete_staff(
    staff_id: int,
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db),
):
    staff = db.query(Staff).filter(Staff.id == staff_id).first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")
    db.delete(staff)
    db.commit()


@router.get("/class-teachers/all", summary="List all class-teacher mappings")
async def list_class_teachers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a mapping of class_section_id -> teacher info for all class-teacher assignments."""
    from models import ClassTeacherMapping
    mappings = db.query(ClassTeacherMapping).all()
    result = []
    for m in mappings:
        cs = m.class_section
        s = m.staff
        if cs and s:
            result.append({
                "class_section_id": cs.id,
                "class_name": cs.class_name.name if cs.class_name else "",
                "section_name": cs.section.name if cs.section else "",
                "staff_id": s.id,
                "teacher_name": f"{s.first_name} {s.last_name or ''}".strip(),
                "designation": s.designation,
            })
    return result
    return None
