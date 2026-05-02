"""School settings router – manage school name, address, logo etc."""

import os
import uuid
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from auth import get_current_user, require_role
from models import User, SchoolSettings

router = APIRouter(prefix="/api/school-settings", tags=["School Settings"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "logos")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ==================== SCHEMAS ====================

class SchoolSettingsResponse(BaseModel):
    id: int
    school_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    affiliation: Optional[str] = None
    logo_url: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SchoolSettingsUpdate(BaseModel):
    school_name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    affiliation: Optional[str] = None


# ==================== HELPERS ====================

def _get_or_create(db: Session) -> SchoolSettings:
    """Return the single school settings row, creating it if missing."""
    settings = db.query(SchoolSettings).first()
    if not settings:
        settings = SchoolSettings(school_name="My School")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _to_response(s: SchoolSettings) -> SchoolSettingsResponse:
    logo_url = f"/api/school-settings/logo/{s.logo_path}" if s.logo_path else None
    return SchoolSettingsResponse(
        id=s.id,
        school_name=s.school_name,
        address=s.address,
        phone=s.phone,
        email=s.email,
        website=s.website,
        affiliation=s.affiliation,
        logo_url=logo_url,
        updated_at=s.updated_at,
    )


# ==================== ENDPOINTS ====================

@router.get("", response_model=SchoolSettingsResponse)
async def get_school_settings(db: Session = Depends(get_db)):
    """Get school settings (public – used on receipts, headers, etc.)."""
    return _to_response(_get_or_create(db))


@router.put("", response_model=SchoolSettingsResponse)
async def update_school_settings(
    data: SchoolSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
):
    """Update school text settings."""
    settings = _get_or_create(db)
    for field, value in data.dict(exclude_unset=True).items():
        setattr(settings, field, value)
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return _to_response(settings)


@router.post("/logo", response_model=SchoolSettingsResponse)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
):
    """Upload school logo image."""
    # Validate file type
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/svg+xml", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only image files (png, jpg, gif, svg, webp) are allowed")

    # Generate unique filename
    ext = os.path.splitext(file.filename or "logo.png")[1] or ".png"
    filename = f"school_logo_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    # Remove old logo file if exists
    settings = _get_or_create(db)
    if settings.logo_path:
        old_path = os.path.join(UPLOAD_DIR, settings.logo_path)
        if os.path.exists(old_path):
            os.remove(old_path)

    # Save new file
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    settings.logo_path = filename
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return _to_response(settings)


@router.delete("/logo", response_model=SchoolSettingsResponse)
async def delete_logo(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("super_admin", "admin")),
):
    """Remove the school logo."""
    settings = _get_or_create(db)
    if settings.logo_path:
        old_path = os.path.join(UPLOAD_DIR, settings.logo_path)
        if os.path.exists(old_path):
            os.remove(old_path)
        settings.logo_path = None
        settings.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(settings)
    return _to_response(settings)


@router.get("/logo/{filename}")
async def serve_logo(filename: str):
    """Serve the logo image file."""
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(filepath)
