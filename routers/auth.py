from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from database import get_db
from schemas import LoginRequest, TokenResponse, UserCreate, UserResponse, UserUpdate
from auth import AuthService, require_role, get_current_user
from services.auth_service import UserAuthService
from models import User, Role
from config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse, summary="User Login")
async def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login endpoint for all user roles.
    
    Returns JWT token on successful authentication.
    """
    user = UserAuthService.authenticate_user(
        email=credentials.email,
        password=credentials.password,
        db=db
    )
    
    access_token = AuthService.create_access_token(
        user_id=user.id,
        role=user.role.name
    )
    
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        role=user.role.name,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh Token")
async def refresh_token(
    current_user: User = Depends(get_current_user),
):
    """
    Issue a new token for an authenticated user.
    Call this before the current token expires to keep the session alive.
    """
    new_token = AuthService.create_access_token(
        user_id=current_user.id,
        role=current_user.role.name
    )
    return TokenResponse(
        access_token=new_token,
        user_id=current_user.id,
        role=current_user.role.name,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    
    return TokenResponse(
        access_token=new_token,
        user_id=user.id,
        role=user.role.name,
        full_name=user.full_name or ""
    )

@router.post("/register", response_model=UserResponse, summary="Register New User")
async def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    Register new user (Super Admin only).
    """
    user = UserAuthService.create_user(user_data, db)
    role_name = user.role.name if user.role else None
    resp = UserResponse.from_orm(user)
    resp.role_name = role_name
    return resp

@router.get("/users", response_model=List[UserResponse], summary="List All Users")
async def list_users(
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """
    Get list of all users in the system (Super Admin only).
    """
    users = db.query(User).all()
    result = []
    for user in users:
        resp = UserResponse.from_orm(user)
        resp.role_name = user.role.name if user.role else None
        result.append(resp)
    return result


@router.get("/roles", summary="List All Roles")
async def list_roles(
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """Get all available roles."""
    roles = db.query(Role).all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in roles]


@router.get("/users/{user_id}", response_model=UserResponse, summary="Get User by ID")
async def get_user(
    user_id: int,
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """Get a single user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    resp = UserResponse.from_orm(user)
    resp.role_name = user.role.name if user.role else None
    return resp


@router.put("/users/{user_id}", response_model=UserResponse, summary="Update User")
async def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """Update user details (Super Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role_id is not None:
        role = db.query(Role).filter(Role.id == data.role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role_id = data.role_id
    if data.email is not None:
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    if data.password is not None and data.password.strip():
        if len(data.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        user.hashed_password = AuthService.hash_password(data.password)

    db.commit()
    db.refresh(user)
    resp = UserResponse.from_orm(user)
    resp.role_name = user.role.name if user.role else None
    return resp


@router.delete("/users/{user_id}", summary="Delete User")
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """Delete a user (Super Admin only). Cannot delete yourself."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": f"User '{user.username}' deleted successfully"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password", summary="Change Password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change password for the currently logged-in user."""
    UserAuthService.change_password(
        user=current_user,
        current_password=data.current_password,
        new_password=data.new_password,
        db=db
    )
    return {"message": "Password changed successfully"}