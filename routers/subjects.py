from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from database import get_db
from models import Subject, User, SubjectClassSection, ClassSection, ClassName, Section
from schemas import (
    SubjectCreate, SubjectResponse, SubjectUpdate, 
    SubjectWithClassSectionsResponse, ClassSectionInfo, SubjectClassSectionAssign
)
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/subjects", tags=["Subjects"])


def get_subject_with_class_sections(subject: Subject, db: Session) -> dict:
    """Helper to build subject response with class sections."""
    class_sections = []
    for scs in subject.class_section_subjects:
        if scs.class_section:
            cs = scs.class_section
            class_sections.append(ClassSectionInfo(
                id=cs.id,
                class_name=cs.class_name.name if cs.class_name else "",
                section_name=cs.section.name if cs.section else ""
            ))
    
    return {
        "id": subject.id,
        "name": subject.name,
        "code": subject.code,
        "description": subject.description,
        "is_active": subject.is_active,
        "created_at": subject.created_at,
        "updated_at": subject.updated_at,
        "class_sections": class_sections
    }


@router.post("/", response_model=SubjectResponse, summary="Create Subject")
async def create_subject(
    subject_data: SubjectCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create new subject (Admin/Super Admin only)."""
    # Check if subject already exists
    existing = db.query(Subject).filter(Subject.code == subject_data.code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject code already exists"
        )
    
    new_subject = Subject(**subject_data.model_dump())
    db.add(new_subject)
    db.commit()
    db.refresh(new_subject)
    return new_subject


@router.get("/", response_model=List[SubjectWithClassSectionsResponse], summary="List Subjects")
async def list_subjects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all subjects with their class-section mappings."""
    subjects = db.query(Subject).options(
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.section)
    ).filter(Subject.is_active == True).order_by(Subject.name).all()
    
    result = []
    for subject in subjects:
        result.append(get_subject_with_class_sections(subject, db))
    
    return result


@router.get("/{subject_id}", response_model=SubjectWithClassSectionsResponse, summary="Get Subject")
async def get_subject(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get subject by ID with class-section mappings."""
    subject = db.query(Subject).options(
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.section)
    ).filter(Subject.id == subject_id).first()
    
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    return get_subject_with_class_sections(subject, db)


@router.put("/{subject_id}", response_model=SubjectWithClassSectionsResponse, summary="Update Subject")
async def update_subject(
    subject_id: int,
    subject_data: SubjectUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update subject (Admin/Super Admin only)."""
    subject = db.query(Subject).options(
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.section)
    ).filter(Subject.id == subject_id).first()
    
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    update_data = subject_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(subject, field, value)
    
    db.commit()
    db.refresh(subject)
    return get_subject_with_class_sections(subject, db)


@router.delete("/{subject_id}", summary="Delete Subject")
async def delete_subject(
    subject_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete subject (Admin/Super Admin only)."""
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    db.delete(subject)
    db.commit()
    return {"message": "Subject deleted successfully"}


@router.post("/{subject_id}/class-sections", response_model=SubjectWithClassSectionsResponse, summary="Assign Class Sections to Subject")
async def assign_class_sections(
    subject_id: int,
    data: SubjectClassSectionAssign,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Assign class-sections to a subject. Replaces existing assignments."""
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    # Delete existing class-section mappings
    db.query(SubjectClassSection).filter(
        SubjectClassSection.subject_id == subject_id
    ).delete()
    
    # Add new mappings
    for cs_id in data.class_section_ids:
        # Validate class-section exists
        cs = db.query(ClassSection).filter(ClassSection.id == cs_id).first()
        if cs:
            new_mapping = SubjectClassSection(
                subject_id=subject_id,
                class_section_id=cs_id
            )
            db.add(new_mapping)
    
    db.commit()
    
    # Reload subject with relationships
    subject = db.query(Subject).options(
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.section)
    ).filter(Subject.id == subject_id).first()
    
    return get_subject_with_class_sections(subject, db)


@router.get("/{subject_id}/class-sections", summary="Get Subject's Class Sections")
async def get_subject_class_sections(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of class-section IDs assigned to a subject."""
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    mappings = db.query(SubjectClassSection).filter(
        SubjectClassSection.subject_id == subject_id
    ).all()
    
    return {"class_section_ids": [m.class_section_id for m in mappings]}


@router.post("/by-class-sections", summary="Get Subjects by Class Section IDs")
async def get_subjects_by_class_sections(
    data: SubjectClassSectionAssign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of subjects that are assigned to any of the given class section IDs."""
    if not data.class_section_ids:
        return []
    
    # Get unique subject IDs linked to these class sections
    mappings = db.query(SubjectClassSection).filter(
        SubjectClassSection.class_section_id.in_(data.class_section_ids),
        SubjectClassSection.is_active == True
    ).all()
    
    subject_ids = list(set([m.subject_id for m in mappings]))
    
    # Get subjects
    subjects = db.query(Subject).options(
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Subject.class_section_subjects).joinedload(SubjectClassSection.class_section).joinedload(ClassSection.section)
    ).filter(
        Subject.id.in_(subject_ids),
        Subject.is_active == True
    ).order_by(Subject.name).all()
    
    return [get_subject_with_class_sections(s, db) for s in subjects]