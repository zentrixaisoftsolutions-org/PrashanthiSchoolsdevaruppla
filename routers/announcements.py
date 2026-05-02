"""Principal/Admin announcements: stored in DB and pushed to mobile app."""
from __future__ import annotations
from datetime import datetime
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Announcement, MobilePushToken, User, Role
from auth import get_current_user, require_role
from services.notification_service import send_expo_push

router = APIRouter(prefix="/api/announcements", tags=["Announcements"])

ALLOWED_SENDER_ROLES = ["super_admin", "admin", "principal"]
AudienceType = Literal["all", "parents", "teachers"]


class AnnouncementIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    audience: AudienceType = "all"


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    audience: str
    push_sent_count: int
    created_at: datetime
    sender_name: Optional[str] = None

    class Config:
        from_attributes = True


def _resolve_target_role_names(audience: str) -> List[str]:
    if audience == "parents":
        return ["parent"]
    if audience == "teachers":
        return ["teacher"]
    return ["parent", "teacher"]


@router.post("/", response_model=AnnouncementOut)
async def create_announcement(
    payload: AnnouncementIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ALLOWED_SENDER_ROLES)),
):
    ann = Announcement(
        sender_user_id=current_user.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        audience=payload.audience,
        push_sent_count=0,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    # Look up active push tokens for the target audience
    role_names = _resolve_target_role_names(payload.audience)
    tokens_q = (
        db.query(MobilePushToken.token)
        .join(User, User.id == MobilePushToken.user_id)
        .join(Role, Role.id == User.role_id)
        .filter(
            MobilePushToken.is_active == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
            Role.name.in_(role_names),
        )
        .all()
    )
    tokens = [t[0] for t in tokens_q if t[0]]

    if tokens:
        try:
            await send_expo_push(
                tokens=tokens,
                title=ann.title,
                body=ann.body,
                data={"type": "announcement", "announcement_id": ann.id},
            )
            ann.push_sent_count = len(tokens)
            db.commit()
            db.refresh(ann)
        except Exception as e:  # send_expo_push already logs internally
            import logging
            logging.getLogger(__name__).warning("Push send failed for announcement %s: %s", ann.id, e)

    return AnnouncementOut(
        id=ann.id,
        title=ann.title,
        body=ann.body,
        audience=ann.audience,
        push_sent_count=ann.push_sent_count or 0,
        created_at=ann.created_at,
        sender_name=current_user.full_name,
    )


@router.get("/", response_model=List[AnnouncementOut])
def list_announcements(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recent announcements. Visible to staff and (via mobile) to parents/teachers."""
    rows = (
        db.query(Announcement, User.full_name)
        .outerjoin(User, User.id == Announcement.sender_user_id)
        .order_by(Announcement.created_at.desc())
        .limit(limit)
        .all()
    )
    out: List[AnnouncementOut] = []
    for ann, sender_name in rows:
        out.append(AnnouncementOut(
            id=ann.id,
            title=ann.title,
            body=ann.body,
            audience=ann.audience,
            push_sent_count=ann.push_sent_count or 0,
            created_at=ann.created_at,
            sender_name=sender_name,
        ))
    return out


@router.delete("/{ann_id}")
def delete_announcement(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ALLOWED_SENDER_ROLES)),
):
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(404, "Announcement not found")
    db.delete(ann)
    db.commit()
    return {"detail": "deleted"}
