"""Push notification token management and manual trigger endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models import MobilePushToken, User
from auth import get_current_user, require_role

router = APIRouter(prefix="/api/notifications", tags=["Push Notifications"])


class PushTokenRegister(BaseModel):
    token: str
    device_name: Optional[str] = None


class PushTokenResponse(BaseModel):
    id: int
    token: str
    device_name: Optional[str]
    is_active: bool


@router.post("/register-token", response_model=PushTokenResponse)
async def register_push_token(
    data: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register or update an Expo push token for the current user."""
    existing = db.query(MobilePushToken).filter(
        MobilePushToken.token == data.token
    ).first()

    if existing:
        existing.user_id = current_user.id
        existing.device_name = data.device_name
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing

    new_token = MobilePushToken(
        user_id=current_user.id,
        token=data.token,
        device_name=data.device_name,
    )
    db.add(new_token)
    db.commit()
    db.refresh(new_token)
    return new_token


@router.delete("/unregister-token")
async def unregister_push_token(
    data: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deactivate a push token (e.g., on logout)."""
    token = db.query(MobilePushToken).filter(
        MobilePushToken.token == data.token,
        MobilePushToken.user_id == current_user.id,
    ).first()
    if token:
        token.is_active = False
        db.commit()
    return {"detail": "Token unregistered"}


@router.post("/send-fee-reminders")
async def trigger_fee_reminders_push(
    phone: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
):
    """Manually send push notification fee reminders. Optional phone filter."""
    from services.notification_service import send_fee_reminders_push
    result = await send_fee_reminders_push(overdue_only=False, phone=phone)
    return {"detail": "Push notifications sent", **result}


@router.post("/send-fee-emails")
async def trigger_fee_reminders_email(
    phone: Optional[str] = None,
    current_user: User = Depends(require_role(["super_admin", "admin"])),
):
    """Manually send email fee reminders. Optional phone filter."""
    from services.notification_service import send_fee_reminders_email
    result = await send_fee_reminders_email(overdue_only=False, phone=phone)
    return {"detail": "Emails sent", **result}
