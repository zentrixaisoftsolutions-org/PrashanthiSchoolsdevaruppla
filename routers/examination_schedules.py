from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models import (
    ExaminationSchedule, ExaminationScheduleClassSection, ExaminationScheduleSubject,
    ExamType, AcademicYear, ClassSection, ClassName, Section, User, Subject
)
from schemas import (
    ExaminationScheduleCreate, ExaminationScheduleResponse, 
    ExaminationScheduleUpdate, ExaminationScheduleClassSectionInfo,
    ExaminationScheduleSubjectInfo
)
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/examination-schedules", tags=["Examination Schedule Management"])


def serialize_examination_schedule(schedule: ExaminationSchedule) -> dict:
    """Convert ExaminationSchedule model to response dict."""
    class_sections = []
    for escs in schedule.class_sections:
        if escs.class_section:
            cs = escs.class_section
            class_sections.append(ExaminationScheduleClassSectionInfo(
                id=cs.id,
                class_name=cs.class_name.name if cs.class_name else "",
                section_name=cs.section.name if cs.section else ""
            ))
    
    subjects = []
    # Sort subjects by display_order
    sorted_subjects = sorted(schedule.subjects, key=lambda x: x.display_order)
    for ess in sorted_subjects:
        if ess.subject:
            subjects.append(ExaminationScheduleSubjectInfo(
                id=ess.id,
                subject_id=ess.subject_id,
                subject_name=ess.subject.name,
                subject_code=ess.subject.code,
                exam_date=ess.exam_date,
                start_time=ess.start_time,
                end_time=ess.end_time,
                max_marks=ess.max_marks,
                pass_marks=ess.pass_marks if ess.pass_marks is not None else 35,
                display_order=ess.display_order
            ))
    
    return {
        "id": schedule.id,
        "exam_type_id": schedule.exam_type_id,
        "exam_type_name": schedule.exam_type.name if schedule.exam_type else "",
        "academic_year_id": schedule.academic_year_id,
        "academic_year_name": schedule.academic_year.name if schedule.academic_year else None,
        "from_date": schedule.from_date,
        "to_date": schedule.to_date,
        "is_active": schedule.is_active,
        "class_sections": class_sections,
        "subjects": subjects,
        "created_at": schedule.created_at,
        "updated_at": schedule.updated_at,
    }


@router.post("/", response_model=ExaminationScheduleResponse, summary="Create Examination Schedule")
async def create_examination_schedule(
    data: ExaminationScheduleCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create a new examination schedule with class-section mappings (Admin/Super Admin only)."""
    # Validate exam type exists
    exam_type = db.query(ExamType).filter(ExamType.id == data.exam_type_id).first()
    if not exam_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam type not found"
        )
    
    # Validate academic year if provided
    if data.academic_year_id:
        academic_year = db.query(AcademicYear).filter(AcademicYear.id == data.academic_year_id).first()
        if not academic_year:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Academic year not found"
            )
    
    # Create schedule
    schedule_data = data.model_dump(exclude={"class_section_ids", "subjects"})
    new_schedule = ExaminationSchedule(**schedule_data)
    db.add(new_schedule)
    db.flush()  # Get the ID
    
    # Add class-section mappings
    for cs_id in data.class_section_ids:
        cs = db.query(ClassSection).filter(ClassSection.id == cs_id).first()
        if cs:
            mapping = ExaminationScheduleClassSection(
                examination_schedule_id=new_schedule.id,
                class_section_id=cs_id
            )
            db.add(mapping)
    
    # Add subject mappings with dates
    if data.subjects:
        for subj_data in data.subjects:
            subject = db.query(Subject).filter(Subject.id == subj_data.subject_id).first()
            if subject:
                subject_mapping = ExaminationScheduleSubject(
                    examination_schedule_id=new_schedule.id,
                    subject_id=subj_data.subject_id,
                    exam_date=subj_data.exam_date,
                    start_time=subj_data.start_time,
                    end_time=subj_data.end_time,
                    max_marks=subj_data.max_marks,
                    pass_marks=subj_data.pass_marks,
                    display_order=subj_data.display_order
                )
                db.add(subject_mapping)
    
    db.commit()
    
    # Reload with relationships
    schedule = db.query(ExaminationSchedule).options(
        joinedload(ExaminationSchedule.exam_type),
        joinedload(ExaminationSchedule.academic_year),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.section),
        joinedload(ExaminationSchedule.subjects).joinedload(ExaminationScheduleSubject.subject)
    ).filter(ExaminationSchedule.id == new_schedule.id).first()
    
    return serialize_examination_schedule(schedule)


@router.get("/", response_model=List[ExaminationScheduleResponse], summary="List Examination Schedules")
async def list_examination_schedules(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    exam_type_id: Optional[int] = Query(None, description="Filter by exam type"),
    include_inactive: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all examination schedules with optional filtering."""
    query = db.query(ExaminationSchedule).options(
        joinedload(ExaminationSchedule.exam_type),
        joinedload(ExaminationSchedule.academic_year),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.section),
        joinedload(ExaminationSchedule.subjects).joinedload(ExaminationScheduleSubject.subject)
    )
    
    if academic_year_id is not None:
        query = query.filter(ExaminationSchedule.academic_year_id == academic_year_id)
    
    if exam_type_id is not None:
        query = query.filter(ExaminationSchedule.exam_type_id == exam_type_id)
    
    if not include_inactive:
        query = query.filter(ExaminationSchedule.is_active == True)
    
    schedules = query.order_by(ExaminationSchedule.id.desc()).offset(skip).limit(limit).all()
    
    return [serialize_examination_schedule(s) for s in schedules]


@router.get("/count", summary="Count Examination Schedules")
async def count_examination_schedules(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    exam_type_id: Optional[int] = Query(None, description="Filter by exam type"),
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total count of examination schedules."""
    query = db.query(ExaminationSchedule)
    
    if academic_year_id is not None:
        query = query.filter(ExaminationSchedule.academic_year_id == academic_year_id)
    
    if exam_type_id is not None:
        query = query.filter(ExaminationSchedule.exam_type_id == exam_type_id)
    
    if not include_inactive:
        query = query.filter(ExaminationSchedule.is_active == True)
    
    return {"count": query.count()}


@router.get("/{schedule_id}", response_model=ExaminationScheduleResponse, summary="Get Examination Schedule")
async def get_examination_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get examination schedule by ID."""
    schedule = db.query(ExaminationSchedule).options(
        joinedload(ExaminationSchedule.exam_type),
        joinedload(ExaminationSchedule.academic_year),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.section),
        joinedload(ExaminationSchedule.subjects).joinedload(ExaminationScheduleSubject.subject)
    ).filter(ExaminationSchedule.id == schedule_id).first()
    
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination schedule not found"
        )
    return serialize_examination_schedule(schedule)


@router.put("/{schedule_id}", response_model=ExaminationScheduleResponse, summary="Update Examination Schedule")
async def update_examination_schedule(
    schedule_id: int,
    data: ExaminationScheduleUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update an examination schedule (Admin/Super Admin only)."""
    schedule = db.query(ExaminationSchedule).filter(ExaminationSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination schedule not found"
        )
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Handle class_section_ids separately
    class_section_ids = update_data.pop("class_section_ids", None)
    
    # Handle subjects separately
    subjects_data = update_data.pop("subjects", None)
    
    # Update other fields
    for key, value in update_data.items():
        setattr(schedule, key, value)
    
    # Update class-section mappings if provided
    if class_section_ids is not None:
        # Delete existing mappings
        db.query(ExaminationScheduleClassSection).filter(
            ExaminationScheduleClassSection.examination_schedule_id == schedule_id
        ).delete()
        
        # Add new mappings
        for cs_id in class_section_ids:
            cs = db.query(ClassSection).filter(ClassSection.id == cs_id).first()
            if cs:
                mapping = ExaminationScheduleClassSection(
                    examination_schedule_id=schedule_id,
                    class_section_id=cs_id
                )
                db.add(mapping)
    
    # Update subject mappings if provided
    if subjects_data is not None:
        # Delete existing subject mappings
        db.query(ExaminationScheduleSubject).filter(
            ExaminationScheduleSubject.examination_schedule_id == schedule_id
        ).delete()
        
        # Add new subject mappings
        for subj_data in subjects_data:
            # subj_data is a dict from model_dump()
            subject = db.query(Subject).filter(Subject.id == subj_data["subject_id"]).first()
            if subject:
                subject_mapping = ExaminationScheduleSubject(
                    examination_schedule_id=schedule_id,
                    subject_id=subj_data["subject_id"],
                    exam_date=subj_data["exam_date"],
                    start_time=subj_data.get("start_time"),
                    end_time=subj_data.get("end_time"),
                    max_marks=subj_data.get("max_marks", 100),
                    pass_marks=subj_data.get("pass_marks", 35),
                    display_order=subj_data.get("display_order", 0)
                )
                db.add(subject_mapping)
    
    db.commit()
    
    # Reload with relationships
    schedule = db.query(ExaminationSchedule).options(
        joinedload(ExaminationSchedule.exam_type),
        joinedload(ExaminationSchedule.academic_year),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(ExaminationSchedule.class_sections).joinedload(ExaminationScheduleClassSection.class_section).joinedload(ClassSection.section),
        joinedload(ExaminationSchedule.subjects).joinedload(ExaminationScheduleSubject.subject)
    ).filter(ExaminationSchedule.id == schedule_id).first()
    
    return serialize_examination_schedule(schedule)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete Examination Schedule")
async def delete_examination_schedule(
    schedule_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete an examination schedule (Admin/Super Admin only)."""
    schedule = db.query(ExaminationSchedule).filter(ExaminationSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination schedule not found"
        )
    
    db.delete(schedule)
    db.commit()
    return None


@router.get("/{schedule_id}/class-sections", summary="Get Examination Schedule's Class Sections")
async def get_examination_schedule_class_sections(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of class-section IDs assigned to an examination schedule."""
    schedule = db.query(ExaminationSchedule).filter(ExaminationSchedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Examination schedule not found"
        )
    
    mappings = db.query(ExaminationScheduleClassSection).filter(
        ExaminationScheduleClassSection.examination_schedule_id == schedule_id
    ).all()
    
    return {"class_section_ids": [m.class_section_id for m in mappings]}
