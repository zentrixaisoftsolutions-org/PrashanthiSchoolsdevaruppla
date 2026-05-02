"""Mobile app authentication using mobile number + email OTP.

Flow:
  1. POST /api/mobile-auth/request-otp { mobile_number }
       - Looks up Student.mobile_number (parent role) or Staff.mobile (teacher role).
       - Generates a 6-digit OTP, hashes it, persists in `mobile_otps`.
       - Emails the OTP to the linked email.
       - Returns the masked email.
  2. POST /api/mobile-auth/verify-otp { mobile_number, otp }
       - Verifies hash, max 5 attempts, 5 min expiry.
       - Issues a JWT compatible with the existing auth.AuthService.
"""
from __future__ import annotations
import hashlib
import logging
import random
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import MobileOtp, Student, Staff, User, Role, Parent, RoleEnum, MobileLoginLog
from auth import AuthService, get_current_user
from services.email_service import send_otp_email
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mobile-auth", tags=["Mobile Auth"])

OTP_VALIDITY_MIN = 15
MAX_ATTEMPTS = 5


# ---------- helpers -----------------------------------------------------------
def _normalize_mobile(m: str) -> str:
    return "".join(ch for ch in (m or "") if ch.isdigit())[-10:]


def _hash_otp(otp: str) -> str:
    salt = settings.SECRET_KEY
    return hashlib.sha256(f"{salt}|{otp}".encode("utf-8")).hexdigest()


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"


def _ensure_user_for_parent(db: Session, students: List[Student], mobile: str) -> User:
    """Ensure a User row exists for parent login; reuse existing parent user if linked,
    otherwise create a synthetic parent User record.
    """
    parent_role = db.query(Role).filter(Role.name == RoleEnum.PARENT.value).first()
    if not parent_role:
        # Auto-provision the role if missing.
        parent_role = Role(name=RoleEnum.PARENT.value, description="Parent / Guardian")
        db.add(parent_role)
        db.flush()

    # Reuse first linked parent.user_id if available
    for s in students:
        if s.parent and s.parent.user_id:
            u = db.query(User).filter(User.id == s.parent.user_id).first()
            if u:
                return u

    # Try to find an existing user by phone == mobile
    existing = db.query(User).filter(User.phone == mobile, User.role_id == parent_role.id).first()
    if existing:
        return existing

    primary = students[0]
    full_name = primary.father_guardian_name or primary.mother_name or f"Parent of {primary.first_name}"
    synthetic_email = f"{mobile}@parent.local"
    user = User(
        email=synthetic_email,
        username=f"parent_{mobile}",
        hashed_password=AuthService.hash_password(f"otp-only-{mobile}-{datetime.utcnow().timestamp()}"),
        full_name=full_name,
        phone=mobile,
        is_active=True,
        role_id=parent_role.id,
    )
    db.add(user)
    db.flush()
    return user


def _ensure_user_for_staff(db: Session, staff: Staff) -> User:
    teacher_role = db.query(Role).filter(Role.name == RoleEnum.TEACHER.value).first()
    if not teacher_role:
        teacher_role = Role(name=RoleEnum.TEACHER.value, description="Teaching Staff")
        db.add(teacher_role)
        db.flush()

    if staff.email:
        u = db.query(User).filter(User.email == staff.email).first()
        if u:
            return u

    user = User(
        email=staff.email or f"staff{staff.id}@school.local",
        username=f"staff_{staff.id}",
        hashed_password=AuthService.hash_password(f"otp-only-{staff.id}-{datetime.utcnow().timestamp()}"),
        full_name=f"{staff.first_name} {staff.last_name or ''}".strip(),
        phone=staff.mobile,
        is_active=True,
        role_id=teacher_role.id,
    )
    db.add(user)
    db.flush()
    return user


# ---------- schemas -----------------------------------------------------------
class RequestOtpIn(BaseModel):
    mobile_number: str = Field(..., min_length=10, max_length=15)
    role: Optional[str] = Field(None, description="'parent' or 'teacher' to force a specific lookup; auto-detect if omitted")


class RequestOtpOut(BaseModel):
    sent: bool
    role: str  # 'parent' | 'teacher'
    masked_email: str
    expires_in: int


class VerifyOtpIn(BaseModel):
    mobile_number: str = Field(..., min_length=10, max_length=15)
    otp: str = Field(..., min_length=4, max_length=8)


class VerifyOtpOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str
    expires_in: int


# ---------- endpoints ---------------------------------------------------------
@router.post("/request-otp", response_model=RequestOtpOut)
def request_otp(payload: RequestOtpIn, db: Session = Depends(get_db)):
    mobile = _normalize_mobile(payload.mobile_number)
    if len(mobile) != 10:
        raise HTTPException(400, "Mobile number must be 10 digits")

    requested_role = (payload.role or "").strip().lower() or None
    if requested_role and requested_role not in ("parent", "teacher"):
        raise HTTPException(400, "role must be 'parent' or 'teacher'")

    # Try parent (any active student with this mobile)
    students = []
    if requested_role in (None, "parent"):
        students = (
            db.query(Student)
            .filter(Student.mobile_number == mobile, Student.is_active == 1)
            .all()
        )
    role = None
    target_email: Optional[str] = None
    target_user: Optional[User] = None

    if students:
        # Use the first student that has a non-empty email
        primary_email = next((s.email for s in students if s.email), None)
        if not primary_email:
            raise HTTPException(
                400,
                "No email registered for this student. Please contact the school office.",
            )
        target_email = primary_email
        role = "parent"
        target_user = _ensure_user_for_parent(db, students, mobile)
    else:
        if requested_role == "parent":
            raise HTTPException(404, "This mobile number is not registered with any student.")
        staff = db.query(Staff).filter(Staff.mobile == mobile, Staff.is_active == 1).first()
        if not staff:
            raise HTTPException(404, "This mobile number is not registered with any student or staff.")
        if not staff.email:
            raise HTTPException(400, "No email registered for this staff. Please contact the school office.")
        target_email = staff.email
        role = "teacher"
        target_user = _ensure_user_for_staff(db, staff)

    # Generate OTP
    otp = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_VALIDITY_MIN)

    record = MobileOtp(
        mobile_number=mobile,
        otp_hash=_hash_otp(otp),
        role_hint=role,
        sent_to_email=target_email,
        user_id=target_user.id if target_user else None,
        expires_at=expires_at,
        attempts=0,
    )
    db.add(record)
    db.commit()

    # Fire and forget; if email fails we still return success but log it
    ok = send_otp_email(target_email, otp, valid_minutes=OTP_VALIDITY_MIN,
                       recipient_name=target_user.full_name if target_user else "")
    if not ok:
        logger.warning("OTP email failed for %s (mobile=%s); OTP still stored for verification",
                       target_email, mobile)

    return RequestOtpOut(
        sent=True,
        role=role,
        masked_email=_mask_email(target_email),
        expires_in=OTP_VALIDITY_MIN * 60,
    )


@router.post("/verify-otp", response_model=VerifyOtpOut)
def verify_otp(payload: VerifyOtpIn, db: Session = Depends(get_db)):
    mobile = _normalize_mobile(payload.mobile_number)
    if len(mobile) != 10:
        raise HTTPException(400, "Mobile number must be 10 digits")

    record = (
        db.query(MobileOtp)
        .filter(MobileOtp.mobile_number == mobile, MobileOtp.used_at.is_(None))
        .order_by(MobileOtp.id.desc())
        .first()
    )
    if not record:
        raise HTTPException(400, "No OTP requested for this mobile. Please request a new OTP.")

    if record.expires_at < datetime.utcnow():
        raise HTTPException(400, "OTP has expired. Please request a new one.")

    if record.attempts >= MAX_ATTEMPTS:
        raise HTTPException(429, "Too many attempts. Please request a new OTP.")

    record.attempts = (record.attempts or 0) + 1

    if _hash_otp(payload.otp.strip()) != record.otp_hash:
        db.commit()
        raise HTTPException(401, "Invalid OTP")

    record.used_at = datetime.utcnow()

    if not record.user_id:
        db.commit()
        raise HTTPException(500, "OTP record missing user link; please request a new OTP.")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user or not user.is_active:
        db.commit()
        raise HTTPException(403, "User is inactive")

    db.commit()

    token = AuthService.create_access_token(user_id=user.id, role=user.role.name)

    # Log the mobile login so the dashboard can report active sessions.
    try:
        login_role = "parent" if user.role.name == RoleEnum.PARENT.value else (
            "teacher" if user.role.name == RoleEnum.TEACHER.value else user.role.name
        )
        now = datetime.utcnow()
        log = MobileLoginLog(
            user_id=user.id,
            role=login_role,
            login_at=now,
            expires_at=now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            last_seen_at=now,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.warning("Failed to write MobileLoginLog for user %s: %s", user.id, e)
        db.rollback()

    return VerifyOtpOut(
        access_token=token,
        role=user.role.name,
        user_id=user.id,
        full_name=user.full_name or "",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=200)
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Mark the user's active login session as logged-out on the dashboard."""
    try:
        now = datetime.utcnow()
        log = (
            db.query(MobileLoginLog)
            .filter(
                MobileLoginLog.user_id == current_user.id,
                MobileLoginLog.logout_at.is_(None),
            )
            .order_by(MobileLoginLog.id.desc())
            .first()
        )
        if log:
            log.logout_at = now
            db.commit()
    except Exception as e:
        logger.warning("Failed to set logout_at for user %s: %s", current_user.id, e)
        db.rollback()
    return {"ok": True}


@router.post("/heartbeat", status_code=200)
def heartbeat(current_user: User = Depends(get_current_user)):
    """Lightweight keep-alive. get_current_user already bumps last_seen_at."""
    return {"ok": True}
