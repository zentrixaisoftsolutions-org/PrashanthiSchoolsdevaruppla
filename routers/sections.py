from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Section, User
from schemas import SectionCreate, SectionResponse, SectionUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/sections", tags=["Sections (Master Data)"])

@router.post("/", response_model=SectionResponse, summary="Create Section")
async def create_section(
    section_data: SectionCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create new section (Admin/Super Admin only)."""
    # Check if section already exists
    existing = db.query(Section).filter(Section.name == section_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Section name already exists"
        )
    
    new_section = Section(**section_data.model_dump())
    db.add(new_section)
    db.commit()
    db.refresh(new_section)
    return new_section

@router.get("/", response_model=List[SectionResponse], summary="List Sections")
async def list_sections(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all sections."""
    query = db.query(Section).filter(Section.name != '')
    if not include_inactive:
        query = query.filter(Section.is_active == True)
    sections = query.order_by(Section.display_order, Section.name).all()
    return sections

@router.get("/{section_id}", response_model=SectionResponse, summary="Get Section")
async def get_section(
    section_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get section by ID."""
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Section not found"
        )
    return section

@router.put("/{section_id}", response_model=SectionResponse, summary="Update Section")
async def update_section(
    section_id: int,
    section_data: SectionUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update section (Admin/Super Admin only)."""
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Section not found"
        )
    
    # Check for duplicate name if updating name
    update_data = section_data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != section.name:
        existing = db.query(Section).filter(Section.name == update_data["name"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Section name already exists"
            )
    
    for field, value in update_data.items():
        setattr(section, field, value)
    
    db.commit()
    db.refresh(section)
    return section

@router.delete("/{section_id}", summary="Delete Section")
async def delete_section(
    section_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete section (Admin/Super Admin only). Consider using soft delete via update instead."""
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Section not found"
        )
    
    db.delete(section)
    db.commit()
    return {"message": "Section deleted successfully"}
