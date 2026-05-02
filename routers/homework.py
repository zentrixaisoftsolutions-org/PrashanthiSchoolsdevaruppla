"""Homework module — teachers upload worksheets/images for a class; parents read.

Storage layout: uploads/homework/<homework_id>/<filename>
"""
from __future__ import annotations
import os
import uuid
import mimetypes
from datetime import datetime, date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import (
    HomeworkAssignment, HomeworkAttachment, Class, Subject,
    Staff, User, Student, RoleEnum,
)

router = APIRouter(prefix="/api/homework", tags=["Homework"])

UPLOAD_ROOT = Path(os.environ.get("HOMEWORK_UPLOAD_DIR", "uploads/homework"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB per file
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf")


# ---------- schemas -----------------------------------------------------------
class AttachmentOut(BaseModel):
    id: int
    file_name: str
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    url: str  # convenience for clients

    class Config:
        from_attributes = True


class HomeworkOut(BaseModel):
    id: int
    class_id: int
    class_label: Optional[str] = None
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    assigned_by_staff_id: Optional[int] = None
    assigned_by_name: Optional[str] = None
    created_at: datetime
    attachments: List[AttachmentOut] = []


def _serialize(hw: HomeworkAssignment) -> HomeworkOut:
    return HomeworkOut(
        id=hw.id,
        class_id=hw.class_id,
        class_label=(hw.class_info.name if hw.class_info else None),
        subject_id=hw.subject_id,
        subject_name=(hw.subject.name if hw.subject else None),
        title=hw.title,
        description=hw.description,
        due_date=hw.due_date,
        assigned_by_staff_id=hw.assigned_by_staff_id,
        assigned_by_name=(
            f"{hw.assigned_by_staff.first_name} {hw.assigned_by_staff.last_name or ''}".strip()
            if hw.assigned_by_staff else None
        ),
        created_at=hw.created_at,
        attachments=[
            AttachmentOut(
                id=a.id,
                file_name=a.file_name,
                mime_type=a.mime_type,
                file_size=a.file_size,
                url=f"/api/homework/{hw.id}/attachments/{a.id}",
            )
            for a in hw.attachments
        ],
    )


def _require_teacher(current: User) -> Staff:
    role_name = (current.role.name or "").lower() if current.role else ""
    if role_name not in (RoleEnum.TEACHER.value, RoleEnum.ADMIN.value, RoleEnum.SUPER_ADMIN.value):
        raise HTTPException(403, "Only teachers/admins can post homework")
    # Try to resolve associated Staff row by email or phone (best-effort)
    return current  # type: ignore[return-value]


# ---------- endpoints ---------------------------------------------------------
@router.post("/", response_model=HomeworkOut)
def create_homework(
    title: str = Form(...),
    class_id: int = Form(...),
    description: Optional[str] = Form(None),
    subject_id: Optional[int] = Form(None),
    due_date: Optional[str] = Form(None),  # YYYY-MM-DD
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_teacher(current_user)

    klass = db.query(Class).filter(Class.id == class_id).first()
    if not klass:
        raise HTTPException(404, "Class not found")

    parsed_due: Optional[date] = None
    if due_date:
        try:
            parsed_due = datetime.strptime(due_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "due_date must be YYYY-MM-DD")

    # Resolve teacher Staff row by user email/phone (best-effort)
    staff_row: Optional[Staff] = None
    if current_user.email:
        staff_row = db.query(Staff).filter(Staff.email == current_user.email).first()
    if not staff_row and current_user.phone:
        staff_row = db.query(Staff).filter(Staff.mobile == current_user.phone).first()

    hw = HomeworkAssignment(
        class_id=class_id,
        subject_id=subject_id,
        title=title.strip(),
        description=(description or "").strip() or None,
        due_date=parsed_due,
        assigned_by_staff_id=staff_row.id if staff_row else None,
        assigned_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(hw)
    db.flush()  # to get hw.id

    # Persist attachments
    if files:
        target_dir = UPLOAD_ROOT / str(hw.id)
        target_dir.mkdir(parents=True, exist_ok=True)
        for upload in files:
            if not upload or not upload.filename:
                continue
            mime = upload.content_type or mimetypes.guess_type(upload.filename)[0] or ""
            if not any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES):
                raise HTTPException(415, f"Unsupported file type: {mime}")
            data = upload.file.read()
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(413, f"File too large: {upload.filename}")
            ext = Path(upload.filename).suffix
            safe_name = f"{uuid.uuid4().hex}{ext}"
            dest = target_dir / safe_name
            dest.write_bytes(data)
            db.add(HomeworkAttachment(
                homework_id=hw.id,
                file_name=upload.filename,
                file_path=str(dest.relative_to(UPLOAD_ROOT.parent)) if UPLOAD_ROOT.parent.exists() else str(dest),
                mime_type=mime,
                file_size=len(data),
            ))

    db.commit()
    db.refresh(hw)
    return _serialize(hw)


@router.get("/", response_model=List[HomeworkOut])
def list_homework(
    class_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List homework. Teachers/admins see everything (optionally filtered by class)."""
    q = db.query(HomeworkAssignment).filter(HomeworkAssignment.is_active == 1)
    if class_id:
        q = q.filter(HomeworkAssignment.class_id == class_id)
    rows = q.order_by(HomeworkAssignment.created_at.desc()).limit(200).all()
    return [_serialize(r) for r in rows]


@router.get("/{homework_id}", response_model=HomeworkOut)
def get_homework(homework_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    hw = db.query(HomeworkAssignment).filter(HomeworkAssignment.id == homework_id).first()
    if not hw:
        raise HTTPException(404, "Not found")
    return _serialize(hw)


@router.delete("/{homework_id}")
def delete_homework(homework_id: int, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    _require_teacher(current_user)
    hw = db.query(HomeworkAssignment).filter(HomeworkAssignment.id == homework_id).first()
    if not hw:
        raise HTTPException(404, "Not found")
    hw.is_active = False
    db.commit()
    return {"deleted": True}


@router.get("/{homework_id}/attachments/{attachment_id}")
def get_attachment(homework_id: int, attachment_id: int,
                   db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    att = (
        db.query(HomeworkAttachment)
        .filter(HomeworkAttachment.id == attachment_id,
                HomeworkAttachment.homework_id == homework_id)
        .first()
    )
    if not att:
        raise HTTPException(404, "Attachment not found")
    # file_path may be relative to project root or absolute
    p = Path(att.file_path)
    if not p.is_absolute():
        # Try a few candidates
        for candidate in (Path.cwd() / att.file_path,
                          UPLOAD_ROOT.parent / att.file_path,
                          UPLOAD_ROOT / str(homework_id) / Path(att.file_path).name):
            if candidate.exists():
                p = candidate
                break
    if not p.exists():
        raise HTTPException(410, "Stored file is missing")
    return FileResponse(str(p), media_type=att.mime_type or "application/octet-stream",
                        filename=att.file_name)
