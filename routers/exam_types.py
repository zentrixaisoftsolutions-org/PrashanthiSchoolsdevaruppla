from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from database import get_db
from models import ExamType, AcademicYear, User
from schemas import ExamTypeCreate, ExamTypeResponse, ExamTypeUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/exam-types", tags=["Exam Type Management"])


def serialize_exam_type(exam_type: ExamType) -> dict:
    """Convert ExamType model to response dict with academic_year_name."""
    return {
        "id": exam_type.id,
        "name": exam_type.name,
        "academic_year_id": exam_type.academic_year_id,
        "academic_year_name": exam_type.academic_year.name if exam_type.academic_year else None,
        "description": exam_type.description,
        "is_active": exam_type.is_active,
        "created_at": exam_type.created_at,
        "updated_at": exam_type.updated_at,
    }


@router.post("/", response_model=ExamTypeResponse, summary="Create Exam Type")
async def create_exam_type(
    data: ExamTypeCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create a new exam type (Admin/Super Admin only)."""
    # Validate academic year if provided
    if data.academic_year_id:
        academic_year = db.query(AcademicYear).filter(AcademicYear.id == data.academic_year_id).first()
        if not academic_year:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Academic year not found"
            )
    
    # Check if exam type with same name exists for the same academic year
    existing = db.query(ExamType).filter(
        ExamType.name == data.name,
        ExamType.academic_year_id == data.academic_year_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exam type with this name already exists for the selected academic year"
        )
    
    # Get max display order
    max_order = db.query(ExamType).count()
    
    new_exam_type = ExamType(**data.model_dump(), display_order=max_order)
    db.add(new_exam_type)
    db.commit()
    db.refresh(new_exam_type)
    
    # Load relationship for response
    db.refresh(new_exam_type)
    new_exam_type = db.query(ExamType).options(
        joinedload(ExamType.academic_year)
    ).filter(ExamType.id == new_exam_type.id).first()
    
    return serialize_exam_type(new_exam_type)


@router.get("/", response_model=List[ExamTypeResponse], summary="List Exam Types")
async def list_exam_types(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    include_inactive: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all exam types with optional filtering."""
    query = db.query(ExamType).options(joinedload(ExamType.academic_year))
    
    if academic_year_id is not None:
        query = query.filter(ExamType.academic_year_id == academic_year_id)
    
    if not include_inactive:
        query = query.filter(ExamType.is_active == True)
    
    exam_types = query.order_by(ExamType.display_order, ExamType.id).offset(skip).limit(limit).all()
    
    return [serialize_exam_type(et) for et in exam_types]


@router.get("/count", summary="Count Exam Types")
async def count_exam_types(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total count of exam types."""
    query = db.query(ExamType)
    
    if academic_year_id is not None:
        query = query.filter(ExamType.academic_year_id == academic_year_id)
    
    if not include_inactive:
        query = query.filter(ExamType.is_active == True)
    
    return {"count": query.count()}


@router.get("/{exam_type_id}", response_model=ExamTypeResponse, summary="Get Exam Type")
async def get_exam_type(
    exam_type_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get exam type by ID."""
    exam_type = db.query(ExamType).options(
        joinedload(ExamType.academic_year)
    ).filter(ExamType.id == exam_type_id).first()
    
    if not exam_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam type not found"
        )
    return serialize_exam_type(exam_type)


@router.put("/{exam_type_id}", response_model=ExamTypeResponse, summary="Update Exam Type")
async def update_exam_type(
    exam_type_id: int,
    data: ExamTypeUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update an exam type (Admin/Super Admin only)."""
    exam_type = db.query(ExamType).filter(ExamType.id == exam_type_id).first()
    if not exam_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam type not found"
        )
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate academic year if provided
    if "academic_year_id" in update_data and update_data["academic_year_id"] is not None:
        academic_year = db.query(AcademicYear).filter(
            AcademicYear.id == update_data["academic_year_id"]
        ).first()
        if not academic_year:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Academic year not found"
            )
    
    # Check for name conflicts if name is being updated
    if "name" in update_data:
        new_academic_year_id = update_data.get("academic_year_id", exam_type.academic_year_id)
        existing = db.query(ExamType).filter(
            ExamType.name == update_data["name"],
            ExamType.academic_year_id == new_academic_year_id,
            ExamType.id != exam_type_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exam type with this name already exists for the selected academic year"
            )
    
    for key, value in update_data.items():
        setattr(exam_type, key, value)
    
    db.commit()
    db.refresh(exam_type)
    
    # Reload with relationship
    exam_type = db.query(ExamType).options(
        joinedload(ExamType.academic_year)
    ).filter(ExamType.id == exam_type.id).first()
    
    return serialize_exam_type(exam_type)


@router.delete("/{exam_type_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete Exam Type")
async def delete_exam_type(
    exam_type_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete an exam type (Admin/Super Admin only)."""
    exam_type = db.query(ExamType).filter(ExamType.id == exam_type_id).first()
    if not exam_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam type not found"
        )
    
    db.delete(exam_type)
    db.commit()
    return None
