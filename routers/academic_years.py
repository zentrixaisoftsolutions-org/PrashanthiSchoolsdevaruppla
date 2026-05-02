from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import AcademicYear, User
from schemas import AcademicYearCreate, AcademicYearResponse, AcademicYearUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/academic-years", tags=["Academic Year Management"])


@router.post("/", response_model=AcademicYearResponse, summary="Create Academic Year")
async def create_academic_year(
    data: AcademicYearCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create a new academic year (Admin/Super Admin only)."""
    # Check if academic year already exists
    existing = db.query(AcademicYear).filter(AcademicYear.name == data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Academic year already exists"
        )
    
    new_year = AcademicYear(**data.model_dump())
    db.add(new_year)
    db.commit()
    db.refresh(new_year)
    return new_year


@router.get("/", response_model=List[AcademicYearResponse], summary="List Academic Years")
async def list_academic_years(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all academic years."""
    query = db.query(AcademicYear)
    
    if not include_inactive:
        query = query.filter(AcademicYear.is_active == True)
    
    years = query.order_by(AcademicYear.name.desc()).all()
    return years


@router.get("/current", response_model=AcademicYearResponse, summary="Get Current Academic Year")
async def get_current_academic_year(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the current academic year."""
    year = db.query(AcademicYear).filter(
        AcademicYear.is_current == True,
        AcademicYear.is_active == True
    ).first()
    
    if not year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No current academic year set"
        )
    return year


@router.get("/{year_id}", response_model=AcademicYearResponse, summary="Get Academic Year")
async def get_academic_year(
    year_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get academic year by ID."""
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Academic year not found"
        )
    return year


@router.put("/{year_id}", response_model=AcademicYearResponse, summary="Update Academic Year")
async def update_academic_year(
    year_id: int,
    data: AcademicYearUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update an academic year (Admin/Super Admin only)."""
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Academic year not found"
        )
    
    update_data = data.model_dump(exclude_unset=True)
    
    # If updating name, check for duplicates
    if 'name' in update_data and update_data['name'] != year.name:
        existing = db.query(AcademicYear).filter(
            AcademicYear.name == update_data['name'],
            AcademicYear.id != year_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Academic year with this name already exists"
            )
    
    # If setting as current, unset other current years
    if update_data.get('is_current'):
        db.query(AcademicYear).filter(AcademicYear.is_current == True).update(
            {"is_current": False}
        )
    
    for key, value in update_data.items():
        setattr(year, key, value)
    
    db.commit()
    db.refresh(year)
    return year


@router.delete("/{year_id}", summary="Delete Academic Year")
async def delete_academic_year(
    year_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete an academic year (Admin/Super Admin only)."""
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Academic year not found"
        )
    
    db.delete(year)
    db.commit()
    return {"message": "Academic year deleted successfully"}


@router.post("/{year_id}/set-current", response_model=AcademicYearResponse, summary="Set as Current Year")
async def set_current_academic_year(
    year_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Set an academic year as the current year (Admin/Super Admin only)."""
    year = db.query(AcademicYear).filter(AcademicYear.id == year_id).first()
    if not year:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Academic year not found"
        )
    
    # Unset other current years
    db.query(AcademicYear).filter(AcademicYear.is_current == True).update(
        {"is_current": False}
    )
    
    year.is_current = True
    db.commit()
    db.refresh(year)
    return year
