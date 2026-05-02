from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import ClassName, User
from schemas import ClassNameCreate, ClassNameResponse, ClassNameUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/class-names", tags=["Class Names (Master Data)"])

@router.post("/", response_model=ClassNameResponse, summary="Create Class Name")
async def create_class_name(
    class_name_data: ClassNameCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create new class name (Admin/Super Admin only)."""
    # Check if class name already exists
    existing = db.query(ClassName).filter(ClassName.name == class_name_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Class name already exists"
        )
    
    new_class_name = ClassName(**class_name_data.model_dump())
    db.add(new_class_name)
    db.commit()
    db.refresh(new_class_name)
    return new_class_name

@router.get("/", response_model=List[ClassNameResponse], summary="List Class Names")
async def list_class_names(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of all class names."""
    query = db.query(ClassName)
    if not include_inactive:
        query = query.filter(ClassName.is_active == True)
    class_names = query.order_by(ClassName.display_order, ClassName.name).all()
    return class_names

@router.get("/{class_name_id}", response_model=ClassNameResponse, summary="Get Class Name")
async def get_class_name(
    class_name_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get class name by ID."""
    class_name = db.query(ClassName).filter(ClassName.id == class_name_id).first()
    if not class_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class name not found"
        )
    return class_name

@router.put("/{class_name_id}", response_model=ClassNameResponse, summary="Update Class Name")
async def update_class_name(
    class_name_id: int,
    class_name_data: ClassNameUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update class name (Admin/Super Admin only)."""
    class_name = db.query(ClassName).filter(ClassName.id == class_name_id).first()
    if not class_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class name not found"
        )
    
    # Check for duplicate name if updating name
    update_data = class_name_data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != class_name.name:
        existing = db.query(ClassName).filter(ClassName.name == update_data["name"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Class name already exists"
            )
    
    for field, value in update_data.items():
        setattr(class_name, field, value)
    
    db.commit()
    db.refresh(class_name)
    return class_name

@router.delete("/{class_name_id}", summary="Delete Class Name")
async def delete_class_name(
    class_name_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete class name (Admin/Super Admin only). Consider using soft delete via update instead."""
    class_name = db.query(ClassName).filter(ClassName.id == class_name_id).first()
    if not class_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class name not found"
        )
    
    db.delete(class_name)
    db.commit()
    return {"message": "Class name deleted successfully"}
