from sqlalchemy.orm import Session
from models import User, Role, Student
from schemas import UserCreate
from auth import AuthService
from fastapi import HTTPException, status

class UserAuthService:
    """Service for user authentication and registration."""
    
    @staticmethod
    def authenticate_user(email: str, password: str, db: Session) -> User:
        """Authenticate user by email, phone, or student mobile number and password."""
        # Try email first
        user = db.query(User).filter(User.email == email).first()
        
        # If not found by email, try User.phone
        if not user:
            user = db.query(User).filter(User.phone == email).first()
        
        # If still not found, try Student.mobile_number
        if not user:
            student = db.query(Student).filter(Student.mobile_number == email).first()
            if student:
                if student.user_id:
                    user = db.query(User).filter(User.id == student.user_id).first()
                else:
                    # Auto-create user for this student (default password = mobile number)
                    user = UserAuthService._create_user_for_student(student, db)
        
        if not user or not AuthService.verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive"
            )
        
        return user
    
    @staticmethod
    def _create_user_for_student(student: Student, db: Session) -> User:
        """Auto-create a user account for a student logging in via mobile number."""
        # Get parent role
        parent_role = db.query(Role).filter(Role.name == "parent").first()
        if not parent_role:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Parent role not configured"
            )
        
        mobile = student.mobile_number
        # Use mobile number as default password
        new_user = User(
            email=f"{mobile}@parent.local",
            username=f"parent_{mobile}",
            full_name=student.father_guardian_name or student.first_name,
            phone=mobile,
            role_id=parent_role.id,
            hashed_password=AuthService.hash_password(mobile),
            is_active=True,
        )
        db.add(new_user)
        db.flush()
        
        # Link student to user
        student.user_id = new_user.id
        db.commit()
        db.refresh(new_user)
        return new_user
    
    @staticmethod
    def change_password(user: User, current_password: str, new_password: str, db: Session) -> None:
        """Change user password."""
        if not AuthService.verify_password(current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        if len(new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be at least 6 characters"
            )
        
        user.hashed_password = AuthService.hash_password(new_password)
        db.commit()
    
    @staticmethod
    def create_user(user_data: UserCreate, db: Session) -> User:
        """Create new user with hashed password."""
        # Check if user already exists
        existing_user = db.query(User).filter(
            (User.email == user_data.email) | (User.username == user_data.username)
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email or username already registered"
            )
        
        # Get role
        role = db.query(Role).filter(Role.id == user_data.role_id).first()
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role"
            )
        
        # Create user
        new_user = User(
            email=user_data.email,
            username=user_data.username,
            full_name=user_data.full_name,
            phone=user_data.phone,
            role_id=user_data.role_id,
            hashed_password=AuthService.hash_password(user_data.password)
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user