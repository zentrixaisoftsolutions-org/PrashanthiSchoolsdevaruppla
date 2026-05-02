from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from auth import get_current_user, require_role
from models import User, UserMenuAccess
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/role-access", tags=["Role Access"])


# ==================== SCHEMAS ====================
class MenuAccessItem(BaseModel):
    menu_path: str
    is_allowed: bool

class UserMenuAccessUpdate(BaseModel):
    user_id: int
    access: List[MenuAccessItem]

class UserMenuAccessResponse(BaseModel):
    user_id: int
    user_name: str
    email: str
    role: str
    access: List[MenuAccessItem]

class UserListItem(BaseModel):
    id: int
    email: str
    full_name: str
    username: str
    role: str
    is_active: bool

# All available menu paths in the system
ALL_MENU_PATHS = [
    {"path": "/dashboard", "label": "Dashboard", "parent": None},
    {"path": "/chat", "label": "AI Chat Assistant", "parent": None},
    {"path": "/students", "label": "Student List", "parent": "Students"},
    {"path": "/students/performance-report", "label": "Performance Report", "parent": "Students"},
    {"path": "/attendance/daily", "label": "Manual Attendance", "parent": "Attendance"},
    {"path": "/attendance/summary", "label": "Attendance Summary", "parent": "Attendance"},
    {"path": "/attendance/devices", "label": "Devices", "parent": "Attendance"},
    {"path": "/attendance/academic-calendar", "label": "Academic Calendar", "parent": "Attendance"},
    {"path": "/examination/subjects", "label": "Subjects", "parent": "Examination"},
    {"path": "/examination/academic-year", "label": "Academic Year", "parent": "Examination"},
    {"path": "/examination/manage-exams", "label": "Manage Exams", "parent": "Examination"},
    {"path": "/examination/map-exams", "label": "Map Exams", "parent": "Examination"},
    {"path": "/examination/marks-entry", "label": "Marks Entry", "parent": "Examination"},
    {"path": "/examination/results", "label": "Results", "parent": "Examination"},
    {"path": "/fees/structure", "label": "Fee Structure", "parent": "Fee Management"},
    {"path": "/fees/payment", "label": "Fee Payment", "parent": "Fee Management"},
    {"path": "/fees/summary", "label": "Fee Summary", "parent": "Fee Management"},
    {"path": "/fees/settings", "label": "Fee Settings", "parent": "Fee Management"},
    {"path": "/staff/departments", "label": "Departments", "parent": "Staff"},
    {"path": "/staff/list", "label": "Staff List", "parent": "Staff"},
    {"path": "/staff/salary", "label": "Salary", "parent": "Staff"},
    {"path": "/settings/classes", "label": "Classes & Sections", "parent": "Settings"},
    {"path": "/settings/grades", "label": "Grades", "parent": "Settings"},
    {"path": "/settings/role-access", "label": "Role Access", "parent": "Settings"},
    {"path": "/settings/payment-gateway", "label": "Payment Gateway", "parent": "Settings"},
    {"path": "/settings/sms", "label": "SMS Settings", "parent": "Settings"},
    {"path": "/settings/whatsapp", "label": "WhatsApp Settings", "parent": "Settings"},
    {"path": "/settings/school", "label": "School Settings", "parent": "Settings"},
    {"path": "/settings/users", "label": "User Management", "parent": "Settings"},
    {"path": "/reports/annual", "label": "Annual Report", "parent": "Reports"},
    {"path": "/reports/assessment", "label": "Exam-wise Analysis", "parent": "Reports"},
]


@router.get("/menu-structure", summary="Get all available menu paths")
async def get_menu_structure(
    current_user: User = Depends(require_role("super_admin", "admin"))
):
    """Return the full menu structure for the role access page."""
    return ALL_MENU_PATHS


@router.get("/users", response_model=List[UserListItem], summary="Get users for role access")
async def get_users_for_access(
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Get list of users that can have menu access configured."""
    users = db.query(User).filter(User.is_active == True).all()
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            username=u.username,
            role=u.role.name if u.role else "unknown",
            is_active=u.is_active
        )
        for u in users
    ]


@router.get("/user/{user_id}", summary="Get menu access for a specific user")
async def get_user_menu_access(
    user_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """
    Get menu access configuration for a specific user.
    If no records exist, returns all menus as allowed (default).
    """
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    existing = db.query(UserMenuAccess).filter(
        UserMenuAccess.user_id == user_id
    ).all()
    
    access_map = {item.menu_path: item.is_allowed for item in existing}
    
    # Build response: if records exist use them, otherwise all allowed
    has_custom_access = len(existing) > 0
    access_list = []
    for menu in ALL_MENU_PATHS:
        path = menu["path"]
        if has_custom_access:
            is_allowed = access_map.get(path, True)  # Default to allowed if not in records
        else:
            is_allowed = True  # No custom config = all allowed
        access_list.append(MenuAccessItem(menu_path=path, is_allowed=is_allowed))
    
    return {
        "user_id": target_user.id,
        "user_name": target_user.full_name,
        "email": target_user.email,
        "role": target_user.role.name if target_user.role else "unknown",
        "has_custom_access": has_custom_access,
        "access": access_list
    }


@router.put("/user/{user_id}", summary="Update menu access for a user")
async def update_user_menu_access(
    user_id: int,
    data: UserMenuAccessUpdate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Save menu access configuration for a user."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete existing access records for this user
    db.query(UserMenuAccess).filter(UserMenuAccess.user_id == user_id).delete()
    
    # Insert new records
    for item in data.access:
        record = UserMenuAccess(
            user_id=user_id,
            menu_path=item.menu_path,
            is_allowed=item.is_allowed
        )
        db.add(record)
    
    db.commit()
    
    return {"message": "Menu access updated successfully", "user_id": user_id}


@router.delete("/user/{user_id}", summary="Reset user access to defaults")
async def reset_user_menu_access(
    user_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db)
):
    """Remove all custom access records for a user, reverting to role-based defaults."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    deleted = db.query(UserMenuAccess).filter(UserMenuAccess.user_id == user_id).delete()
    db.commit()
    
    return {"message": f"Access reset to defaults. {deleted} custom records removed.", "user_id": user_id}


@router.get("/my-access", summary="Get current user's allowed menu paths")
async def get_my_access(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get allowed menu paths for the currently logged-in user.
    Returns null if no custom access configured (use role defaults).
    Returns list of allowed paths if custom access exists.
    """
    existing = db.query(UserMenuAccess).filter(
        UserMenuAccess.user_id == current_user.id
    ).all()
    
    if not existing:
        return {"allowed_paths": None}  # null = no restrictions, use role defaults
    
    allowed = [item.menu_path for item in existing if item.is_allowed]
    return {"allowed_paths": allowed}
