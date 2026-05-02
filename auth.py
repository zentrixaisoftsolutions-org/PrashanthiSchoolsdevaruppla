from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from config import settings
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserMenuAccess
from database import current_user_name as _audit_user_name

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer for token authentication
security = HTTPBearer(auto_error=False)

class AuthService:
    """Service for authentication operations."""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt."""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against hashed password."""
        return pwd_context.verify(plain_password, hashed_password)
    
    @staticmethod
    def create_access_token(user_id: int, role: str, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token."""
        if expires_delta is None:
            expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
        expire = datetime.utcnow() + expires_delta
        to_encode = {
            "sub": str(user_id),
            "user_id": user_id,
            "role": role,
            "exp": expire
        }
        
        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM
        )
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str) -> dict:
        """Verify and decode JWT token."""
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            user_id: int = payload.get("user_id")
            role: str = payload.get("role")
            
            if user_id is None or role is None:
                print(f"[AUTH DEBUG] Token decoded but missing user_id or role: {payload}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token"
                )
            print(f"[AUTH DEBUG] Token valid - user_id={user_id}, role={role}")
            return {"user_id": user_id, "role": role}
        except JWTError as e:
            print(f"[AUTH DEBUG] Token decode failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

    @staticmethod
    def verify_token_allow_expired(token: str) -> dict:
        """Verify token but allow expired tokens (for refresh within grace period)."""
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False}
            )
            user_id: int = payload.get("user_id")
            role: str = payload.get("role")
            exp = payload.get("exp")
            
            if user_id is None or role is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token"
                )
            # Allow refresh within 90 days of expiry
            if exp:
                expired_at = datetime.utcfromtimestamp(exp)
                grace_limit = expired_at + timedelta(days=90)
                if datetime.utcnow() > grace_limit:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Token expired beyond refresh window"
                    )
            return {"user_id": user_id, "role": role}
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

# Dependency to get current user
async def get_current_user(
    credentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user from token."""
    if credentials is None:
        print(f"[AUTH DEBUG] No credentials provided - returning 401")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    print(f"[AUTH DEBUG] Token received: {token[:30]}...")
    token_data = AuthService.verify_token(token)
    
    user = db.query(User).filter(User.id == token_data["user_id"]).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    # Set audit context so created_by / modified_by are populated automatically
    _audit_user_name.set(user.full_name or user.username)

    # Touch the most-recent active MobileLoginLog row so the dashboard can show
    # 'currently active' status. Best-effort; never blocks the request.
    try:
        role_name = user.role.name if user.role else None
        if role_name in ("parent", "teacher"):
            from models import MobileLoginLog
            from datetime import datetime as _dt
            now = _dt.utcnow()
            log = (
                db.query(MobileLoginLog)
                .filter(
                    MobileLoginLog.user_id == user.id,
                    MobileLoginLog.expires_at > now,
                    MobileLoginLog.logout_at.is_(None),
                )
                .order_by(MobileLoginLog.id.desc())
                .first()
            )
            if log:
                log.last_seen_at = now
                db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass

    return user

# Dependency to verify role-based access
def require_role(*allowed_roles):
    """Dependency to check if user has required role.
    Accepts either positional strings: require_role("admin", "teacher")
    or a single list/tuple:          require_role(["admin", "teacher"])
    """
    # Flatten if caller passed a single list/tuple instead of separate strings
    if len(allowed_roles) == 1 and isinstance(allowed_roles[0], (list, tuple)):
        allowed_roles = tuple(allowed_roles[0])

    async def verify_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied"
            )
        return current_user
    return verify_role


def require_page_access(menu_path: str):
    """
    Dependency that checks if the current user has access to a specific page
    based on UserMenuAccess records configured in Settings > Role Access.
    If no custom access records exist for the user, access is granted (role defaults).
    """
    async def verify_page_access(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        existing = db.query(UserMenuAccess).filter(
            UserMenuAccess.user_id == current_user.id
        ).all()

        # No custom access configured → allow (role defaults apply)
        if not existing:
            return current_user

        # Custom access exists → check if this page is allowed
        access_map = {item.menu_path: item.is_allowed for item in existing}
        if not access_map.get(menu_path, True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied – you do not have access to this page"
            )
        return current_user
    return verify_page_access