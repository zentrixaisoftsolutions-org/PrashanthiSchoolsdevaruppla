from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import ClassSection, ClassName, Section, User
from schemas import (
    ClassSectionCreate, ClassSectionResponse, ClassSectionUpdate,
    ClassSectionBulkAssign, ClassWithSectionsResponse, SectionResponse
)
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/class-sections", tags=["Class-Section Mapping"])

@router.post("/", response_model=ClassSectionResponse, summary="Map Section to Class")
async def create_class_section(
    data: ClassSectionCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Map a section to a class (Admin/Super Admin only)."""
    # Validate class exists
    class_name = db.query(ClassName).filter(ClassName.id == data.class_name_id).first()
    if not class_name:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Validate section exists
    section = db.query(Section).filter(Section.id == data.section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Check if mapping already exists
    existing = db.query(ClassSection).filter(
        ClassSection.class_name_id == data.class_name_id,
        ClassSection.section_id == data.section_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This section is already mapped to this class")
    
    new_mapping = ClassSection(**data.model_dump())
    db.add(new_mapping)
    db.commit()
    db.refresh(new_mapping)
    
    return ClassSectionResponse(
        id=new_mapping.id,
        class_name_id=new_mapping.class_name_id,
        class_name=class_name.name,
        section_id=new_mapping.section_id,
        section_name=section.name,
        capacity=new_mapping.capacity,
        is_active=new_mapping.is_active,
        created_at=new_mapping.created_at
    )

@router.post("/bulk", response_model=List[ClassSectionResponse], summary="Bulk Assign Sections to Class")
async def bulk_assign_sections(
    data: ClassSectionBulkAssign,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Assign multiple sections to a class at once (Admin/Super Admin only)."""
    # Validate class exists
    class_name = db.query(ClassName).filter(ClassName.id == data.class_name_id).first()
    if not class_name:
        raise HTTPException(status_code=404, detail="Class not found")
    
    results = []
    for section_id in data.section_ids:
        # Validate section exists
        section = db.query(Section).filter(Section.id == section_id).first()
        if not section:
            continue  # Skip invalid sections
        
        # Check if mapping already exists
        existing = db.query(ClassSection).filter(
            ClassSection.class_name_id == data.class_name_id,
            ClassSection.section_id == section_id
        ).first()
        if existing:
            continue  # Skip existing mappings
        
        new_mapping = ClassSection(
            class_name_id=data.class_name_id,
            section_id=section_id,
            capacity=data.capacity
        )
        db.add(new_mapping)
        db.commit()
        db.refresh(new_mapping)
        
        results.append(ClassSectionResponse(
            id=new_mapping.id,
            class_name_id=new_mapping.class_name_id,
            class_name=class_name.name,
            section_id=new_mapping.section_id,
            section_name=section.name,
            capacity=new_mapping.capacity,
            is_active=new_mapping.is_active,
            created_at=new_mapping.created_at
        ))
    
    return results

@router.get("/", response_model=List[ClassSectionResponse], summary="List All Class-Section Mappings")
async def list_class_sections(
    class_name_id: int = None,
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all class-section mappings, optionally filtered by class."""
    query = db.query(ClassSection).join(ClassName).join(Section)
    
    if class_name_id:
        query = query.filter(ClassSection.class_name_id == class_name_id)
    
    if not include_inactive:
        query = query.filter(ClassSection.is_active == True)
    
    mappings = query.order_by(ClassName.display_order, Section.display_order).all()
    
    results = []
    for m in mappings:
        results.append(ClassSectionResponse(
            id=m.id,
            class_name_id=m.class_name_id,
            class_name=m.class_name.name,
            section_id=m.section_id,
            section_name=m.section.name,
            capacity=m.capacity,
            is_active=m.is_active,
            created_at=m.created_at
        ))
    return results

@router.get("/by-class/{class_name_id}", response_model=ClassWithSectionsResponse, summary="Get Class with Sections")
async def get_class_with_sections(
    class_name_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a class with all its assigned sections."""
    class_name = db.query(ClassName).filter(ClassName.id == class_name_id).first()
    if not class_name:
        raise HTTPException(status_code=404, detail="Class not found")
    
    # Get all active sections for this class
    mappings = db.query(ClassSection).filter(
        ClassSection.class_name_id == class_name_id,
        ClassSection.is_active == True
    ).all()
    
    sections = [
        SectionResponse(
            id=m.section.id,
            name=m.section.name,
            display_order=m.section.display_order,
            description=m.section.description,
            is_active=m.section.is_active,
            created_at=m.section.created_at,
            updated_at=m.section.updated_at
        )
        for m in mappings
    ]
    
    return ClassWithSectionsResponse(
        id=class_name.id,
        name=class_name.name,
        display_order=class_name.display_order,
        description=class_name.description,
        is_active=class_name.is_active,
        sections=sections
    )

@router.get("/classes-with-sections", response_model=List[ClassWithSectionsResponse], summary="Get All Classes with Sections")
async def list_classes_with_sections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all classes with their assigned sections."""
    classes = db.query(ClassName).filter(ClassName.is_active == True).order_by(ClassName.display_order).all()
    
    results = []
    for class_name in classes:
        mappings = db.query(ClassSection).filter(
            ClassSection.class_name_id == class_name.id,
            ClassSection.is_active == True
        ).all()
        
        sections = [
            SectionResponse(
                id=m.section.id,
                name=m.section.name,
                display_order=m.section.display_order,
                description=m.section.description,
                is_active=m.section.is_active,
                created_at=m.section.created_at,
                updated_at=m.section.updated_at
            )
            for m in mappings
            if m.section.name != ''
        ]
        
        results.append(ClassWithSectionsResponse(
            id=class_name.id,
            name=class_name.name,
            display_order=class_name.display_order,
            description=class_name.description,
            is_active=class_name.is_active,
            sections=sections
        ))
    
    return results

@router.put("/{mapping_id}", response_model=ClassSectionResponse, summary="Update Class-Section Mapping")
async def update_class_section(
    mapping_id: int,
    data: ClassSectionUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update a class-section mapping (Admin/Super Admin only)."""
    mapping = db.query(ClassSection).filter(ClassSection.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(mapping, field, value)
    
    db.commit()
    db.refresh(mapping)
    
    return ClassSectionResponse(
        id=mapping.id,
        class_name_id=mapping.class_name_id,
        class_name=mapping.class_name.name,
        section_id=mapping.section_id,
        section_name=mapping.section.name,
        capacity=mapping.capacity,
        is_active=mapping.is_active,
        created_at=mapping.created_at
    )

@router.delete("/{mapping_id}", summary="Remove Section from Class")
async def delete_class_section(
    mapping_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Remove a section from a class (Admin/Super Admin only)."""
    mapping = db.query(ClassSection).filter(ClassSection.id == mapping_id).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(mapping)
    db.commit()
    return {"message": "Section removed from class successfully"}
