from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import GradeCriteria, User
from schemas import (
    GradeCriteriaCreate, GradeCriteriaResponse, GradeCriteriaUpdate,
    GradeCriteriaBulkUpdate
)
from auth import get_current_user, require_role
from typing import List

router = APIRouter(prefix="/api/grades", tags=["Grade Criteria Management"])


@router.get("/", response_model=List[GradeCriteriaResponse], summary="List Grade Criteria")
async def list_grade_criteria(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all grade criteria sorted by display order and min_percentage."""
    query = db.query(GradeCriteria)
    
    if not include_inactive:
        query = query.filter(GradeCriteria.is_active == True)
    
    criteria = query.order_by(GradeCriteria.display_order.asc(), GradeCriteria.min_percentage.desc()).all()
    return criteria


@router.get("/{grade_id}", response_model=GradeCriteriaResponse, summary="Get Grade Criteria")
async def get_grade_criteria(
    grade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific grade criteria by ID."""
    criteria = db.query(GradeCriteria).filter(GradeCriteria.id == grade_id).first()
    if not criteria:
        raise HTTPException(status_code=404, detail="Grade criteria not found")
    return criteria


@router.post("/", response_model=GradeCriteriaResponse, summary="Create Grade Criteria")
async def create_grade_criteria(
    data: GradeCriteriaCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Create a new grade criteria."""
    # Validate percentage range
    if data.min_percentage > data.max_percentage:
        raise HTTPException(
            status_code=400, 
            detail="Min percentage cannot be greater than max percentage"
        )
    
    criteria = GradeCriteria(**data.model_dump())
    db.add(criteria)
    db.commit()
    db.refresh(criteria)
    return criteria


@router.put("/{grade_id}", response_model=GradeCriteriaResponse, summary="Update Grade Criteria")
async def update_grade_criteria(
    grade_id: int,
    data: GradeCriteriaUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Update an existing grade criteria."""
    criteria = db.query(GradeCriteria).filter(GradeCriteria.id == grade_id).first()
    if not criteria:
        raise HTTPException(status_code=404, detail="Grade criteria not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Validate percentage range if both are provided
    min_pct = update_data.get('min_percentage', criteria.min_percentage)
    max_pct = update_data.get('max_percentage', criteria.max_percentage)
    if min_pct > max_pct:
        raise HTTPException(
            status_code=400, 
            detail="Min percentage cannot be greater than max percentage"
        )
    
    for key, value in update_data.items():
        setattr(criteria, key, value)
    
    db.commit()
    db.refresh(criteria)
    return criteria


@router.delete("/{grade_id}", summary="Delete Grade Criteria")
async def delete_grade_criteria(
    grade_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Delete a grade criteria."""
    criteria = db.query(GradeCriteria).filter(GradeCriteria.id == grade_id).first()
    if not criteria:
        raise HTTPException(status_code=404, detail="Grade criteria not found")
    
    db.delete(criteria)
    db.commit()
    return {"message": "Grade criteria deleted successfully"}


@router.post("/bulk-update", response_model=List[GradeCriteriaResponse], summary="Bulk Update Grade Criteria")
async def bulk_update_grade_criteria(
    data: GradeCriteriaBulkUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """
    Replace all grade criteria with new ones.
    This deletes all existing criteria and inserts new ones.
    """
    # Validate all criteria
    for i, criteria in enumerate(data.criteria):
        if criteria.min_percentage > criteria.max_percentage:
            raise HTTPException(
                status_code=400,
                detail=f"Row {i+1}: Min percentage cannot be greater than max percentage"
            )
    
    # Delete all existing criteria
    db.query(GradeCriteria).delete()
    
    # Insert new criteria
    new_criteria = []
    for i, criteria_data in enumerate(data.criteria):
        criteria_dict = criteria_data.model_dump()
        criteria_dict['display_order'] = i  # Override with index
        criteria = GradeCriteria(**criteria_dict)
        db.add(criteria)
        new_criteria.append(criteria)
    
    db.commit()
    
    # Refresh all and return
    for criteria in new_criteria:
        db.refresh(criteria)
    
    return new_criteria


@router.post("/seed-defaults", response_model=List[GradeCriteriaResponse], summary="Seed Default Grade Criteria")
async def seed_default_grade_criteria(
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """
    Seed the database with default grade criteria.
    Only works if no criteria exist.
    """
    existing = db.query(GradeCriteria).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Grade criteria already exist. Use bulk-update to replace them."
        )
    
    default_criteria = [
        {"min_percentage": 0, "max_percentage": 0, "grade": "Absent", "teacher_remarks": "Absent", "grade_point": 0, "general_remarks": "Never miss the exam", "display_order": 0},
        {"min_percentage": 91, "max_percentage": 100, "grade": "A1", "teacher_remarks": "Excellent work", "grade_point": 10, "general_remarks": "Excellent work! Your hard work is paying off", "display_order": 1},
        {"min_percentage": 81, "max_percentage": 90.99, "grade": "A2", "teacher_remarks": "Well done", "grade_point": 9, "general_remarks": "Well done! Your performance is commendable", "display_order": 2},
        {"min_percentage": 71, "max_percentage": 80.99, "grade": "B1", "teacher_remarks": "Keep it up", "grade_point": 8, "general_remarks": "Well done! Your performance is improving", "display_order": 3},
        {"min_percentage": 61, "max_percentage": 70.99, "grade": "B2", "teacher_remarks": "Good job", "grade_point": 7, "general_remarks": "Good job! You are making progress", "display_order": 4},
        {"min_percentage": 51, "max_percentage": 60.99, "grade": "C1", "teacher_remarks": "Keep striving", "grade_point": 6, "general_remarks": "Keep striving! Your effort is noticed", "display_order": 5},
        {"min_percentage": 41, "max_percentage": 50.99, "grade": "C2", "teacher_remarks": "Keep pushing", "grade_point": 5, "general_remarks": "Keep pushing! Your hard work will pay off", "display_order": 6},
        {"min_percentage": 35, "max_percentage": 40.99, "grade": "D", "teacher_remarks": "Keep trying", "grade_point": 4, "general_remarks": "Keep trying! Your dedication will lead to success", "display_order": 7},
        {"min_percentage": 0, "max_percentage": 34.99, "grade": "FAIL", "teacher_remarks": "Stay determined", "grade_point": 0, "general_remarks": "Stay determined! Keep working hard", "display_order": 8},
    ]
    
    new_criteria = []
    for data in default_criteria:
        criteria = GradeCriteria(**data, is_active=True)
        db.add(criteria)
        new_criteria.append(criteria)
    
    db.commit()
    
    for criteria in new_criteria:
        db.refresh(criteria)
    
    return new_criteria


@router.get("/calculate/{percentage}", summary="Calculate Grade from Percentage")
async def calculate_grade(
    percentage: float,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Calculate grade for a given percentage based on stored criteria."""
    criteria = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True,
        GradeCriteria.min_percentage <= percentage,
        GradeCriteria.max_percentage >= percentage
    ).first()
    
    if not criteria:
        # Default fallback
        return {
            "percentage": percentage,
            "grade": "N/A",
            "grade_point": 0,
            "teacher_remarks": "Grade not defined",
            "general_remarks": "No grade criteria found for this percentage"
        }
    
    return {
        "percentage": percentage,
        "grade": criteria.grade,
        "grade_point": criteria.grade_point,
        "teacher_remarks": criteria.teacher_remarks,
        "general_remarks": criteria.general_remarks
    }
