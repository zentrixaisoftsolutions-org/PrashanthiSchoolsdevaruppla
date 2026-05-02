"""Mobile-app login statistics for the web dashboard.

Endpoints:
  GET /api/mobile-stats/login-summary
       -> Counts of currently-active vs ever-logged-in users, split by role.
  GET /api/mobile-stats/login-details?role=parent|teacher&active=true|false
       -> Per-user list with last_login / last_seen / active flag.
"""
from __future__ import annotations
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from database import get_db
from models import MobileLoginLog, User
from auth import require_role

router = APIRouter(prefix="/api/mobile-stats", tags=["Mobile Stats"])

# A user is "currently active" if they have a non-expired login row whose
# last_seen_at was within this many minutes.
ACTIVE_WINDOW_MIN = 2


class RoleSummary(BaseModel):
    currently_active: int
    ever_logged_in: int


class LoginSummaryOut(BaseModel):
    parents: RoleSummary
    teachers: RoleSummary
    active_window_minutes: int


class LoginDetailRow(BaseModel):
    user_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: str
    last_login_at: Optional[datetime]
    last_seen_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_currently_active: bool
    total_logins: int


class LoginDetailsOut(BaseModel):
    role: str
    active_only: bool
    rows: List[LoginDetailRow]


def _is_active_clause(now: datetime):
    cutoff = now - timedelta(minutes=ACTIVE_WINDOW_MIN)
    return (
        (MobileLoginLog.expires_at > now)
        & (MobileLoginLog.logout_at.is_(None))
        & (MobileLoginLog.last_seen_at >= cutoff)
    )


@router.get("/login-summary", response_model=LoginSummaryOut)
def login_summary(
    db: Session = Depends(get_db),
    _user=Depends(require_role(["super_admin", "admin", "principal"])),
):
    now = datetime.utcnow()

    def _counts(role_name: str) -> RoleSummary:
        ever = (
            db.query(func.count(func.distinct(MobileLoginLog.user_id)))
            .filter(MobileLoginLog.role == role_name)
            .scalar() or 0
        )
        active = (
            db.query(func.count(func.distinct(MobileLoginLog.user_id)))
            .filter(MobileLoginLog.role == role_name, _is_active_clause(now))
            .scalar() or 0
        )
        return RoleSummary(currently_active=int(active), ever_logged_in=int(ever))

    return LoginSummaryOut(
        parents=_counts("parent"),
        teachers=_counts("teacher"),
        active_window_minutes=ACTIVE_WINDOW_MIN,
    )


@router.get("/login-details", response_model=LoginDetailsOut)
def login_details(
    role: str = Query(..., pattern="^(parent|teacher)$"),
    active: Optional[bool] = Query(None, description="If set, filter by current active state"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(["super_admin", "admin", "principal"])),
):
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=ACTIVE_WINDOW_MIN)

    # Aggregate per user: latest login, latest seen, count, max expires
    agg = (
        db.query(
            MobileLoginLog.user_id.label("user_id"),
            func.max(MobileLoginLog.login_at).label("last_login_at"),
            func.max(MobileLoginLog.last_seen_at).label("last_seen_at"),
            func.max(MobileLoginLog.expires_at).label("expires_at"),
            func.count(MobileLoginLog.id).label("total_logins"),
        )
        .filter(MobileLoginLog.role == role)
        .group_by(MobileLoginLog.user_id)
        .subquery()
    )

    rows = (
        db.query(
            User.id,
            User.full_name,
            User.email,
            User.phone,
            agg.c.last_login_at,
            agg.c.last_seen_at,
            agg.c.expires_at,
            agg.c.total_logins,
        )
        .join(agg, agg.c.user_id == User.id)
        .order_by(agg.c.last_seen_at.desc())
        .all()
    )

    out: List[LoginDetailRow] = []
    for r in rows:
        is_active = bool(
            r.expires_at and r.expires_at > now
            and r.last_seen_at and r.last_seen_at >= cutoff
        )
        if active is True and not is_active:
            continue
        if active is False and is_active:
            continue
        out.append(LoginDetailRow(
            user_id=r.id,
            full_name=r.full_name or "",
            email=r.email,
            phone=r.phone,
            role=role,
            last_login_at=r.last_login_at,
            last_seen_at=r.last_seen_at,
            expires_at=r.expires_at,
            is_currently_active=is_active,
            total_logins=int(r.total_logins or 0),
        ))

    return LoginDetailsOut(role=role, active_only=bool(active), rows=out)
