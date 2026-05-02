from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Department, User
from schemas import DepartmentCreate, DepartmentResponse, DepartmentUpdate
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/departments", tags=["Departments"])


@router.post("/", response_model=DepartmentResponse, summary="Create Department")
async def create_department(
    data: DepartmentCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    existing = db.query(Department).filter(Department.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Department name already exists")
    dept = Department(**data.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.get("/", response_model=List[DepartmentResponse], summary="List Departments")
async def list_departments(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Department)
    if not include_inactive:
        query = query.filter(Department.is_active == True)
    return query.order_by(Department.name).all()


@router.get("/{department_id}", response_model=DepartmentResponse, summary="Get Department")
async def get_department(
    department_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.put("/{department_id}", response_model=DepartmentResponse, summary="Update Department")
async def update_department(
    department_id: int,
    data: DepartmentUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        existing = db.query(Department).filter(
            Department.name == update_data["name"], Department.id != department_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Department name already exists")
    for key, val in update_data.items():
        setattr(dept, key, val)
    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/{department_id}", status_code=204, summary="Delete Department")
async def delete_department(
    department_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    # Soft delete
    dept.is_active = False
    db.commit()
    return None
