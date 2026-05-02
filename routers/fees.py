"""Fee Management Router - Fee Structure, Payments, Summary, History."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
from typing import List, Optional
from datetime import datetime, date
from database import get_db
from models import (
    FeeStructure, FeePayment, PaymentGatewayConfig,
    Student, Class, AcademicYear, ClassName, User, TermDueDate,
    Staff, SchoolSettings
)
from schemas import (
    FeeStructureCreate, FeeStructureUpdate, FeeStructureResponse,
    FeeStructureBulkCreate, FeePaymentCreate, FeePaymentResponse,
    StudentFeeSummary, PaginatedFeeSummaryResponse,
    RazorpayOrderCreate, RazorpayOrderResponse,
    RazorpayVerifyPayment
)
import math
from auth import get_current_user
import hashlib
import hmac
import uuid
import pandas as pd
import numpy as np
from utils.performance import calculate_fee_aggregations

router = APIRouter(prefix="/api/fees", tags=["Fee Management"])


# ==================== FEE STRUCTURE ENDPOINTS ====================

@router.get("/structures", response_model=List[FeeStructureResponse], summary="List Fee Structures")
async def list_fee_structures(
    academic_year_id: Optional[int] = None,
    class_name_id: Optional[int] = None,
    term: Optional[int] = None,
    active_only: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all fee structures, optionally filtered by academic year, class, and term."""
    query = db.query(FeeStructure)
    if active_only:
        query = query.filter(FeeStructure.is_active == True)
    if academic_year_id:
        query = query.filter(FeeStructure.academic_year_id == academic_year_id)
    if class_name_id:
        query = query.filter(FeeStructure.class_name_id == class_name_id)
    if term is not None:
        query = query.filter(FeeStructure.term == term)

    structures = query.order_by(FeeStructure.class_name_id, FeeStructure.term, FeeStructure.fee_type).all()

    result = []
    for s in structures:
        ay = db.query(AcademicYear.name).filter(AcademicYear.id == s.academic_year_id).scalar()
        cn = db.query(ClassName.name).filter(ClassName.id == s.class_name_id).scalar()
        result.append(FeeStructureResponse(
            id=s.id,
            academic_year_id=s.academic_year_id,
            class_name_id=s.class_name_id,
            term=s.term,
            fee_type=s.fee_type,
            amount=s.amount,
            frequency=s.frequency,
            description=s.description,
            is_mandatory=s.is_mandatory,
            is_active=s.is_active,
            academic_year_name=ay,
            class_name=cn,
            created_at=s.created_at,
            updated_at=s.updated_at,
        ))
    return result


@router.post("/structures", response_model=FeeStructureResponse, summary="Create Fee Structure")
async def create_fee_structure(
    data: FeeStructureCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new fee structure entry."""
    structure = FeeStructure(
        academic_year_id=data.academic_year_id,
        class_name_id=data.class_name_id,
        term=data.term,
        fee_type=data.fee_type,
        amount=data.amount,
        frequency=data.frequency,
        description=data.description,
        is_mandatory=data.is_mandatory,
    )
    db.add(structure)
    db.commit()
    db.refresh(structure)

    ay = db.query(AcademicYear.name).filter(AcademicYear.id == structure.academic_year_id).scalar()
    cn = db.query(ClassName.name).filter(ClassName.id == structure.class_name_id).scalar()
    return FeeStructureResponse(
        id=structure.id,
        academic_year_id=structure.academic_year_id,
        class_name_id=structure.class_name_id,
        term=structure.term,
        fee_type=structure.fee_type,
        amount=structure.amount,
        frequency=structure.frequency,
        description=structure.description,
        is_mandatory=structure.is_mandatory,
        is_active=structure.is_active,
        academic_year_name=ay,
        class_name=cn,
        created_at=structure.created_at,
        updated_at=structure.updated_at,
    )


@router.post("/structures/bulk", summary="Bulk Create Fee Structures")
async def bulk_create_fee_structures(
    data: FeeStructureBulkCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create multiple fee structure entries for a class at once."""
    created = 0
    for item in data.items:
        structure = FeeStructure(
            academic_year_id=data.academic_year_id,
            class_name_id=data.class_name_id,
            term=item.get("term", 1),
            fee_type=item.get("fee_type", ""),
            amount=item.get("amount", 0),
            frequency=item.get("frequency", "term"),
            description=item.get("description"),
            is_mandatory=item.get("is_mandatory", True),
        )
        db.add(structure)
        created += 1
    db.commit()
    return {"message": f"{created} fee structures created", "created": created}


@router.put("/structures/{structure_id}", response_model=FeeStructureResponse, summary="Update Fee Structure")
async def update_fee_structure(
    structure_id: int,
    data: FeeStructureUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing fee structure."""
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(structure, key, value)
    structure.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(structure)

    ay = db.query(AcademicYear.name).filter(AcademicYear.id == structure.academic_year_id).scalar()
    cn = db.query(ClassName.name).filter(ClassName.id == structure.class_name_id).scalar()
    return FeeStructureResponse(
        id=structure.id,
        academic_year_id=structure.academic_year_id,
        class_name_id=structure.class_name_id,
        term=structure.term,
        fee_type=structure.fee_type,
        amount=structure.amount,
        frequency=structure.frequency,
        description=structure.description,
        is_mandatory=structure.is_mandatory,
        is_active=structure.is_active,
        academic_year_name=ay,
        class_name=cn,
        created_at=structure.created_at,
        updated_at=structure.updated_at,
    )


@router.delete("/structures/{structure_id}", summary="Delete Fee Structure")
async def delete_fee_structure(
    structure_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Soft-delete a fee structure."""
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Fee structure not found")
    structure.is_active = False
    structure.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Fee structure deactivated"}


# ==================== FEE PAYMENT ENDPOINTS ====================

def _generate_receipt_number(db: Session) -> str:
    """Generate a unique receipt number."""
    today = date.today()
    prefix = f"RCP-{today.strftime('%Y%m%d')}"
    last = db.query(FeePayment).filter(
        FeePayment.receipt_number.like(f"{prefix}%")
    ).order_by(desc(FeePayment.id)).first()
    if last and last.receipt_number:
        try:
            seq = int(last.receipt_number.split("-")[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}-{seq:04d}"


@router.post("/payments", response_model=FeePaymentResponse, summary="Record Fee Payment (Cash/Manual)")
async def create_fee_payment(
    data: FeePaymentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a manual/cash fee payment."""
    student = db.query(Student).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    receipt = data.receipt_number or _generate_receipt_number(db)

    # --- Compute discount / tax ---
    gross = data.amount_paid
    discount_type = data.discount_type or None
    discount_value = data.discount_value or 0
    tax_percent = data.tax_percent or 0

    if discount_type == 'percent':
        discount_amount = round(gross * discount_value / 100, 2)
    elif discount_type == 'amount':
        discount_amount = round(min(discount_value, gross), 2)
    else:
        discount_amount = 0

    after_discount = gross - discount_amount
    tax_amount = round(after_discount * tax_percent / 100, 2)
    net_amount = round(after_discount + tax_amount, 2)

    payment = FeePayment(
        student_id=data.student_id,
        academic_year_id=data.academic_year_id,
        fee_structure_id=data.fee_structure_id,
        term=data.term,
        gross_amount=gross,
        discount_type=discount_type,
        discount_value=discount_value,
        discount_amount=discount_amount,
        tax_percent=tax_percent,
        tax_amount=tax_amount,
        net_amount=net_amount,
        amount_paid=net_amount,
        payment_method=data.payment_method,
        transaction_id=data.transaction_id,
        receipt_number=receipt,
        status="completed",
        remarks=data.remarks,
        created_by_user_id=current_user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return _payment_to_response(payment, db)


@router.get("/my-children", summary="Fee Summary for Parent's Children")
async def get_my_children_fees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get fee summary for parent's children with term-wise breakdown."""
    students = db.query(Student).filter(
        Student.is_active == 1,
        Student.mobile_number == current_user.phone
    ).all() if current_user.phone else []

    if not students:
        return {"students": [], "total_paid": 0, "total_pending": 0}

    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    result = []
    grand_paid = 0
    grand_pending = 0

    for student in students:
        terms_data = []
        student_total = 0
        student_paid = 0

        if current_ay and student.class_info:
            class_name_obj = db.query(ClassName).filter(
                ClassName.name.ilike(f"%{student.class_info.class_name}%")
            ).first()

            for term_num in range(1, 4):
                term_fee = 0
                term_paid = 0
                fee_items = []

                if class_name_obj:
                    structures = db.query(FeeStructure).filter(
                        FeeStructure.academic_year_id == current_ay.id,
                        FeeStructure.class_name_id == class_name_obj.id,
                        FeeStructure.term == term_num,
                        FeeStructure.is_active == True
                    ).all()

                    for fs in structures:
                        paid_for = db.query(
                            func.coalesce(func.sum(FeePayment.amount_paid), 0)
                        ).filter(
                            FeePayment.student_id == student.id,
                            FeePayment.academic_year_id == current_ay.id,
                            FeePayment.fee_structure_id == fs.id,
                            FeePayment.status == "completed"
                        ).scalar() or 0

                        fee_items.append({
                            "fee_type": fs.fee_type,
                            "amount": fs.amount,
                            "paid": float(paid_for),
                            "due": max(0, fs.amount - float(paid_for)),
                        })
                        term_fee += fs.amount
                        term_paid += float(paid_for)

                # Also count payments with term=term_num but no fee_structure_id
                extra_paid = db.query(
                    func.coalesce(func.sum(FeePayment.amount_paid), 0)
                ).filter(
                    FeePayment.student_id == student.id,
                    FeePayment.academic_year_id == current_ay.id,
                    FeePayment.term == term_num,
                    FeePayment.fee_structure_id == None,
                    FeePayment.status == "completed"
                ).scalar() or 0
                term_paid += float(extra_paid)

                terms_data.append({
                    "term": term_num,
                    "total": term_fee,
                    "paid": term_paid,
                    "pending": max(0, term_fee - term_paid),
                    "items": fee_items,
                })
                student_total += term_fee
                student_paid += term_paid

        pending = max(0, student_total - student_paid)
        grand_paid += student_paid
        grand_pending += pending

        # Recent payments
        recent_payments = []
        if current_ay:
            recent = db.query(FeePayment).filter(
                FeePayment.student_id == student.id,
                FeePayment.academic_year_id == current_ay.id,
                FeePayment.status == "completed"
            ).order_by(desc(FeePayment.payment_date)).limit(10).all()
            recent_payments = [
                {
                    "id": p.id,
                    "amount": float(p.amount_paid),
                    "term": p.term,
                    "date": p.payment_date.isoformat() if p.payment_date else None,
                    "mode": p.payment_method or "cash",
                    "receipt_number": p.receipt_number,
                }
                for p in recent
            ]

        result.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "fees_total": student_total,
            "fees_paid": student_paid,
            "fees_pending": pending,
            "terms": terms_data,
            "payments": recent_payments,
        })

    return {
        "students": result,
        "total_paid": grand_paid,
        "total_pending": grand_pending,
    }


@router.get("/payments", response_model=List[FeePaymentResponse], summary="List Fee Payments")
async def list_fee_payments(
    student_id: Optional[int] = None,
    academic_year_id: Optional[int] = None,
    payment_method: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List fee payments with optional filters."""
    query = db.query(FeePayment)
    if student_id:
        query = query.filter(FeePayment.student_id == student_id)
    if academic_year_id:
        query = query.filter(FeePayment.academic_year_id == academic_year_id)
    if payment_method:
        query = query.filter(FeePayment.payment_method == payment_method)
    if status:
        query = query.filter(FeePayment.status == status)
    if from_date:
        query = query.filter(FeePayment.payment_date >= from_date)
    if to_date:
        query = query.filter(FeePayment.payment_date <= to_date)

    payments = query.order_by(desc(FeePayment.payment_date)).limit(limit).all()
    return [_payment_to_response(p, db) for p in payments]


@router.post("/payments/email-director-daily", summary="Email daily fee collections to Director/Principal")
async def email_director_daily(
    target_date: Optional[str] = Query(None, description="YYYY-MM-DD; defaults to today"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Build and send a daily fee-collection summary email to the Director / Principal.

    Recipients are identified as active Staff records whose `designation`
    contains "director" or "principal" (case-insensitive) and who have an
    email on file. All matching staff are emailed.
    """
    from datetime import date as _date, datetime as _dt, timedelta
    from services.email_service import send_email

    # Determine the target day
    if target_date:
        try:
            day = _dt.strptime(target_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")
    else:
        day = _date.today()
    start = _dt.combine(day, _dt.min.time())
    end = start + timedelta(days=1)

    # Locate Director and/or Principal recipients
    recipients = (
        db.query(Staff)
        .filter(
            Staff.is_active == 1,
            (Staff.designation.ilike("%director%") | Staff.designation.ilike("%principal%")),
            Staff.email.isnot(None),
            Staff.email != "",
        )
        .order_by(Staff.id)
        .all()
    )
    if not recipients:
        raise HTTPException(
            status_code=404,
            detail="No active Staff with designation 'Director' or 'Principal' and a valid email was found.",
        )

    # Pull all completed payments for the day
    payments = (
        db.query(FeePayment)
        .filter(
            FeePayment.payment_date >= start,
            FeePayment.payment_date < end,
            FeePayment.status == "completed",
        )
        .order_by(FeePayment.payment_date)
        .all()
    )

    rows = []
    total = 0.0
    for p in payments:
        student = db.query(Student).filter(Student.id == p.student_id).first()
        cls = None
        if student and student.class_id:
            cls = db.query(Class).filter(Class.id == student.class_id).first()
        fee_type = None
        if p.fee_structure_id:
            fee_type = db.query(FeeStructure.fee_type).filter(FeeStructure.id == p.fee_structure_id).scalar()
        amt = float(p.amount_paid or 0)
        rows.append({
            "receipt": p.receipt_number or "-",
            "student": (f"{student.first_name} {student.surname or ''}".strip() if student else "-"),
            "admission": (student.admission_number if student else "-"),
            "class": (cls.class_name if cls else "-"),
            "fee_type": fee_type or "-",
            "term": (p.term if p.term is not None else "-"),
            "amount": amt,
            "method": p.payment_method or "-",
            "time": (p.payment_date.strftime("%H:%M") if p.payment_date else "-"),
        })
        total += amt

    school = db.query(SchoolSettings).first()
    school_name = school.school_name if school else "School"
    recipient_emails = [r.email for r in recipients]
    recipient_descs = [
        f"{r.first_name} {r.last_name or ''}".strip()
        + (f" ({r.designation})" if r.designation else "")
        for r in recipients
    ]
    greeting_name = "/ ".join(
        f"{r.first_name} {r.last_name or ''}".strip() for r in recipients
    ) or "Sir/Madam"
    day_str = day.strftime("%d %b %Y")

    if not rows:
        text = (
            f"Hi {greeting_name},\n\n"
            f"No fee payments were recorded on {day_str}.\n\n"
            f"Regards,\n{school_name}"
        )
        html = (
            f"<html><body style='font-family:Arial,sans-serif'>"
            f"<p>Hi {greeting_name},</p>"
            f"<p>No fee payments were recorded on <b>{day_str}</b>.</p>"
            f"<p style='color:#6b7280;font-size:12px'>Regards,<br/>{school_name}</p>"
            f"</body></html>"
        )
    else:
        tr = "".join(
            f"<tr>"
            f"<td style='padding:6px 8px;text-align:center'>{i + 1}</td>"
            f"<td style='padding:6px 8px'>{r['receipt']}</td>"
            f"<td style='padding:6px 8px'>{r['student']}</td>"
            f"<td style='padding:6px 8px'>{r['admission']}</td>"
            f"<td style='padding:6px 8px'>{r['class']}</td>"
            f"<td style='padding:6px 8px'>{r['fee_type']}</td>"
            f"<td style='padding:6px 8px;text-align:center'>{r['term']}</td>"
            f"<td style='padding:6px 8px;text-align:right'>&#8377; {r['amount']:.2f}</td>"
            f"<td style='padding:6px 8px'>{r['method']}</td>"
            f"<td style='padding:6px 8px'>{r['time']}</td>"
            f"</tr>"
            for i, r in enumerate(rows)
        )
        html = (
            "<html><body style='font-family:Arial,sans-serif;color:#111827'>"
            f"<p>Hi {greeting_name},</p>"
            f"<p>Below is the summary of fee payments collected on <b>{day_str}</b>.</p>"
            "<table cellspacing='0' cellpadding='0' "
            "style='border-collapse:collapse;font-size:13px;border:1px solid #d1d5db'>"
            "<thead style='background:#f3f4f6'>"
            "<tr>"
            "<th style='padding:8px;border:1px solid #d1d5db'>#</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Receipt</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Student</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Admission #</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Class</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Fee Type</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Term</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Amount</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Method</th>"
            "<th style='padding:8px;border:1px solid #d1d5db'>Time</th>"
            "</tr></thead>"
            f"<tbody style='border:1px solid #d1d5db'>{tr}</tbody>"
            "<tfoot><tr style='background:#fef3c7;font-weight:bold'>"
            "<td colspan='7' style='padding:8px;text-align:right;border:1px solid #d1d5db'>Total</td>"
            f"<td style='padding:8px;text-align:right;border:1px solid #d1d5db'>&#8377; {total:.2f}</td>"
            f"<td colspan='2' style='padding:8px;border:1px solid #d1d5db'>{len(rows)} payment(s)</td>"
            "</tr></tfoot>"
            "</table>"
            f"<p style='margin-top:18px;color:#6b7280;font-size:12px'>"
            f"Generated automatically by {school_name} School ERP."
            "</p>"
            "</body></html>"
        )
        text_lines = [f"Daily Fee Collections - {day_str}", ""]
        for i, r in enumerate(rows):
            text_lines.append(
                f"{i + 1}. {r['receipt']} | {r['student']} ({r['admission']}, {r['class']}) "
                f"| {r['fee_type']} Term {r['term']} | Rs.{r['amount']:.2f} via {r['method']} at {r['time']}"
            )
        text_lines += ["", f"Total: Rs.{total:.2f} ({len(rows)} payments)"]
        text = "\n".join(text_lines)

    subject = f"Daily Fee Collections - {day_str} ({len(rows)} payments, Rs.{total:.2f})"
    sent = send_email(recipient_emails, subject, text, html, from_name=school_name)
    if not sent:
        raise HTTPException(
            status_code=500,
            detail="Failed to send email - check SMTP configuration in server logs.",
        )

    return {
        "sent": True,
        "director_email": ", ".join(recipient_emails),
        "director_name": ", ".join(recipient_descs),
        "recipients": [
            {"name": d, "email": e}
            for d, e in zip(recipient_descs, recipient_emails)
        ],
        "date": day.isoformat(),
        "count": len(rows),
        "total_amount": round(total, 2),
    }


@router.get("/payments/history/{student_id}", response_model=List[FeePaymentResponse], summary="Student Payment History")
async def get_student_payment_history(
    student_id: int,
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get complete payment history for a student."""
    query = db.query(FeePayment).filter(FeePayment.student_id == student_id)
    if academic_year_id:
        query = query.filter(FeePayment.academic_year_id == academic_year_id)
    payments = query.order_by(desc(FeePayment.payment_date)).all()
    return [_payment_to_response(p, db) for p in payments]


# ==================== FEE SUMMARY ENDPOINTS ====================

@router.get("/summary", response_model=PaginatedFeeSummaryResponse, summary="Fee Summary for All Students")
async def get_fee_summary(
    academic_year_id: Optional[int] = None,
    class_name_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Rows per page"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get fee paid/due summary for all students in a class or all classes.
    Returns paginated results with 10 rows per page.
    """
    # Determine academic year
    if not academic_year_id:
        current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
        if current_ay:
            academic_year_id = current_ay.id

    # Get students query
    student_query = db.query(Student).filter(Student.is_active == True)
    if class_name_id:
        # Join through Class table to filter by class_name
        cn_name = db.query(ClassName.name).filter(ClassName.id == class_name_id).scalar() or ''
        student_query = student_query.join(Class, Student.class_id == Class.id).filter(
            Class.class_name.ilike(f"%{cn_name}%")
        )
    if search:
        student_query = student_query.filter(
            (Student.first_name + ' ' + func.coalesce(Student.surname, '')).ilike(f"%{search}%") |
            Student.admission_number.ilike(f"%{search}%")
        )

    # Total count for pagination
    total_students = student_query.count()
    total_pages = math.ceil(total_students / page_size) if total_students > 0 else 1

    # ---- Efficient aggregate totals (avoid N+1 queries) ----
    # Build a mapping: Class.id -> ClassName.id (precompute once)
    all_classes = db.query(Class.id, Class.class_name).all()
    all_class_names = db.query(ClassName.id, ClassName.name).all()
    class_to_cn: dict = {}
    for cls_id, cls_name in all_classes:
        for cn_id, cn_name in all_class_names:
            if cn_name and cls_name and cn_name.lower() == cls_name.lower():
                class_to_cn[cls_id] = cn_id
                break
            # Fallback: ilike-style partial match
            if cn_name and cls_name and cn_name.lower() in cls_name.lower():
                class_to_cn[cls_id] = cn_id
                break

    # Student IDs subquery for aggregates
    student_ids_subq = student_query.with_entities(Student.id).subquery()

    # Aggregate total_paid: single query
    paid_q = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
        FeePayment.student_id.in_(db.query(student_ids_subq.c.id)),
        FeePayment.status == "completed",
    )
    if academic_year_id:
        paid_q = paid_q.filter(FeePayment.academic_year_id == academic_year_id)
    agg_total_paid = float(paid_q.scalar() or 0)

    # Aggregate total_fee: count students per class, multiply by fee structure totals
    agg_total_fee = 0.0
    if academic_year_id:
        # Fee structure totals per class_name_id
        fs_totals: dict = {}
        fee_structs = db.query(
            FeeStructure.class_name_id,
            func.sum(FeeStructure.amount).label('total')
        ).filter(
            FeeStructure.academic_year_id == academic_year_id,
            FeeStructure.is_active == True,
        ).group_by(FeeStructure.class_name_id).all()
        for cn_id, total in fee_structs:
            fs_totals[cn_id] = float(total or 0)

        # Count students per class in the filtered set
        student_class_counts = db.query(
            Student.class_id, func.count(Student.id)
        ).filter(
            Student.id.in_(db.query(student_ids_subq.c.id))
        ).group_by(Student.class_id).all()

        for cls_id, count in student_class_counts:
            cn_id = class_to_cn.get(cls_id)
            if cn_id and cn_id in fs_totals:
                agg_total_fee += fs_totals[cn_id] * count

    agg_total_due = max(0, agg_total_fee - agg_total_paid)

    # ---- Paginated results (MSSQL requires ORDER BY for OFFSET/LIMIT) ----
    skip = (page - 1) * page_size
    paginated_students = student_query.order_by(Student.first_name, Student.id).offset(skip).limit(page_size).all()

    result = []
    for student in paginated_students:
        summary = _compute_student_fee_summary(db, student, academic_year_id)
        result.append(summary)

    return PaginatedFeeSummaryResponse(
        items=result,
        total=total_students,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_fee=agg_total_fee,
        total_paid=agg_total_paid,
        total_due=agg_total_due,
    )


@router.get("/summary/{student_id}", response_model=StudentFeeSummary, summary="Fee Summary for One Student")
async def get_student_fee_summary(
    student_id: int,
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed fee summary for a specific student."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if not academic_year_id:
        current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
        if current_ay:
            academic_year_id = current_ay.id

    return _compute_student_fee_summary(db, student, academic_year_id)


# ==================== RAZORPAY PAYMENT ENDPOINTS ====================

@router.post("/razorpay/create-order", response_model=RazorpayOrderResponse, summary="Create Razorpay Order")
async def create_razorpay_order(
    data: RazorpayOrderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a Razorpay order for online fee payment."""
    # Get active gateway config
    config = db.query(PaymentGatewayConfig).filter(
        PaymentGatewayConfig.is_active == True,
        PaymentGatewayConfig.provider == "razorpay"
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="Razorpay is not configured. Please set up payment gateway in Settings.")

    student = db.query(Student).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    amount_paise = int(data.amount * 100)
    receipt = f"fee_{data.student_id}_{uuid.uuid4().hex[:8]}"

    try:
        import razorpay
        client = razorpay.Client(auth=(config.key_id, config.key_secret))
        order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": {
                "student_id": str(data.student_id),
                "academic_year_id": str(data.academic_year_id),
                "fee_structure_id": str(data.fee_structure_id or ""),
            }
        })
    except ImportError:
        raise HTTPException(status_code=500, detail="Razorpay SDK not installed. Run: pip install razorpay")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create Razorpay order: {str(e)}")

    return RazorpayOrderResponse(
        order_id=order["id"],
        amount=amount_paise,
        currency="INR",
        key_id=config.key_id,
        student_name=f"{student.first_name} {student.surname or ''}".strip(),
        student_email=student.email,
        student_phone=student.mobile_number,
        receipt=receipt,
    )


@router.post("/razorpay/verify-payment", summary="Verify Razorpay Payment")
async def verify_razorpay_payment(
    data: RazorpayVerifyPayment,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify Razorpay payment signature and record the payment."""
    config = db.query(PaymentGatewayConfig).filter(
        PaymentGatewayConfig.is_active == True,
        PaymentGatewayConfig.provider == "razorpay"
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="Razorpay not configured")

    # Verify signature
    message = f"{data.razorpay_order_id}|{data.razorpay_payment_id}"
    expected_signature = hmac.new(
        config.key_secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    if expected_signature != data.razorpay_signature:
        raise HTTPException(status_code=400, detail="Payment verification failed: Invalid signature")

    # Record the payment
    receipt = _generate_receipt_number(db)
    payment = FeePayment(
        student_id=data.student_id,
        academic_year_id=data.academic_year_id,
        fee_structure_id=data.fee_structure_id,
        amount_paid=data.amount,
        payment_method="razorpay",
        transaction_id=data.razorpay_payment_id,
        razorpay_order_id=data.razorpay_order_id,
        razorpay_signature=data.razorpay_signature,
        receipt_number=receipt,
        status="completed",
        remarks=data.remarks,
        created_by_user_id=current_user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return {
        "success": True,
        "message": "Payment verified and recorded successfully",
        "payment_id": payment.id,
        "receipt_number": receipt,
    }


# ==================== DASHBOARD FEE STATS ====================

@router.get("/dashboard-stats", summary="Fee Dashboard Statistics")
async def get_fee_dashboard_stats(
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get fee stats for the dashboard."""
    if not academic_year_id:
        current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
        if current_ay:
            academic_year_id = current_ay.id

    today = date.today()

    # Fee collected today
    collected_today = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
        FeePayment.status == "completed",
        func.cast(FeePayment.payment_date, db.bind.dialect.type_descriptor(type(today))) == today
    ).scalar() if academic_year_id else 0

    # Fallback: query on date part
    try:
        collected_today = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
            FeePayment.status == "completed",
            func.convert(type(""), FeePayment.payment_date, 23) == today.isoformat()
        ).scalar()
    except Exception:
        collected_today = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
            FeePayment.status == "completed",
            FeePayment.payment_date >= datetime.combine(today, datetime.min.time()),
            FeePayment.payment_date < datetime.combine(today, datetime.max.time()),
        ).scalar() or 0

    # Fee collected this academic year
    collected_this_year = 0
    if academic_year_id:
        collected_this_year = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
            FeePayment.status == "completed",
            FeePayment.academic_year_id == academic_year_id,
        ).scalar() or 0

    # Total expected fees this year
    total_expected = 0
    if academic_year_id:
        # Sum of (fee amount * number of active students in that class) for all active fee structures
        structures = db.query(FeeStructure).filter(
            FeeStructure.academic_year_id == academic_year_id,
            FeeStructure.is_active == True,
        ).all()
        for s in structures:
            # Count students in classes matching this class_name
            cn = db.query(ClassName.name).filter(ClassName.id == s.class_name_id).scalar()
            if cn:
                student_count = db.query(func.count(Student.id)).join(
                    Class, Student.class_id == Class.id
                ).filter(
                    Student.is_active == True,
                    Class.class_name.ilike(f"%{cn}%")
                ).scalar() or 0
                total_expected += s.amount * student_count

    pending_this_year = max(0, total_expected - collected_this_year)

    return {
        "collected_today": float(collected_today),
        "collected_this_year": float(collected_this_year),
        "pending_this_year": float(pending_this_year),
        "total_expected": float(total_expected),
    }


# ==================== TERM DUE DATES ====================

@router.get("/term-due-dates", summary="Get Term Due Dates")
async def get_term_due_dates(
    academic_year_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get term due dates for the given (or current) academic year."""
    if not academic_year_id:
        ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
        if ay:
            academic_year_id = ay.id

    if not academic_year_id:
        return []

    dues = db.query(TermDueDate).filter(
        TermDueDate.academic_year_id == academic_year_id
    ).order_by(TermDueDate.term).all()

    ay_name = db.query(AcademicYear.name).filter(AcademicYear.id == academic_year_id).scalar()
    return [
        {
            "id": d.id,
            "academic_year_id": d.academic_year_id,
            "academic_year_name": ay_name,
            "term": d.term,
            "due_date": d.due_date.isoformat() if d.due_date else None,
        }
        for d in dues
    ]


@router.post("/term-due-dates", summary="Set Term Due Dates (Admin)")
async def set_term_due_dates(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set/update term due dates for an academic year.
    Body: { academic_year_id: int, terms: [{ term: 1, due_date: "2026-06-15" }, ...] }
    """
    if current_user.role_id not in (1, 2):  # super_admin or admin
        raise HTTPException(status_code=403, detail="Admin access required")

    ay_id = data.get("academic_year_id")
    terms = data.get("terms", [])

    if not ay_id or not terms:
        raise HTTPException(status_code=400, detail="academic_year_id and terms are required")

    ay = db.query(AcademicYear).filter(AcademicYear.id == ay_id).first()
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")

    results = []
    for t in terms:
        term_num = t.get("term")
        due_date_str = t.get("due_date")
        if term_num not in (1, 2, 3) or not due_date_str:
            continue

        due_dt = datetime.strptime(due_date_str, "%Y-%m-%d")

        existing = db.query(TermDueDate).filter(
            TermDueDate.academic_year_id == ay_id,
            TermDueDate.term == term_num,
        ).first()

        if existing:
            existing.due_date = due_dt
            existing.updated_at = datetime.utcnow()
            db.flush()
            results.append(existing)
        else:
            new_due = TermDueDate(
                academic_year_id=ay_id,
                term=term_num,
                due_date=due_dt,
            )
            db.add(new_due)
            db.flush()
            results.append(new_due)

    db.commit()
    return {
        "message": f"Term due dates saved for {ay.name}",
        "dates": [
            {"term": r.term, "due_date": r.due_date.isoformat()}
            for r in results
        ]
    }


# ==================== HELPERS ====================

def _payment_to_response(payment: FeePayment, db: Session) -> FeePaymentResponse:
    """Convert FeePayment model to response schema."""
    student = db.query(Student).filter(Student.id == payment.student_id).first()
    ay = db.query(AcademicYear.name).filter(AcademicYear.id == payment.academic_year_id).scalar()
    fee_type = None
    if payment.fee_structure_id:
        fee_type = db.query(FeeStructure.fee_type).filter(FeeStructure.id == payment.fee_structure_id).scalar()

    return FeePaymentResponse(
        id=payment.id,
        student_id=payment.student_id,
        student_name=f"{student.first_name} {student.surname or ''}".strip() if student else None,
        admission_number=student.admission_number if student else None,
        academic_year_id=payment.academic_year_id,
        academic_year_name=ay,
        fee_structure_id=payment.fee_structure_id,
        term=payment.term,
        fee_type=fee_type,
        gross_amount=payment.gross_amount,
        discount_type=payment.discount_type,
        discount_value=payment.discount_value or 0,
        discount_amount=payment.discount_amount or 0,
        tax_percent=payment.tax_percent or 0,
        tax_amount=payment.tax_amount or 0,
        net_amount=payment.net_amount,
        amount_paid=payment.amount_paid,
        payment_date=payment.payment_date,
        payment_method=payment.payment_method,
        transaction_id=payment.transaction_id,
        razorpay_order_id=payment.razorpay_order_id,
        receipt_number=payment.receipt_number,
        status=payment.status,
        remarks=payment.remarks,
        created_at=payment.created_at,
    )


def _compute_student_fee_summary(db: Session, student: Student, academic_year_id: Optional[int]) -> StudentFeeSummary:
    """Compute fee summary for a student."""
    # Determine class name from student
    class_name_str = None
    class_name_id = None
    if student.class_id:
        cls = db.query(Class).filter(Class.id == student.class_id).first()
        if cls:
            class_name_str = cls.class_name
            # Try to find matching ClassName
            cn = db.query(ClassName).filter(ClassName.name.ilike(f"%{cls.class_name}%")).first()
            if cn:
                class_name_id = cn.id

    # Get fee structures for this class
    total_fee = 0.0
    fee_breakdown = []
    if class_name_id and academic_year_id:
        structures = db.query(FeeStructure).filter(
            FeeStructure.academic_year_id == academic_year_id,
            FeeStructure.class_name_id == class_name_id,
            FeeStructure.is_active == True,
        ).all()
        for s in structures:
            paid_for_type = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
                FeePayment.student_id == student.id,
                FeePayment.academic_year_id == academic_year_id,
                FeePayment.fee_structure_id == s.id,
                FeePayment.status == "completed",
            ).scalar() or 0.0
            due = max(0, s.amount - paid_for_type)
            total_fee += s.amount
            fee_breakdown.append({
                "fee_type": s.fee_type,
                "amount": s.amount,
                "frequency": s.frequency,
                "paid": float(paid_for_type),
                "due": float(due),
            })

    # Total paid (including payments not tied to a specific fee structure)
    total_paid_query = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
        FeePayment.student_id == student.id,
        FeePayment.status == "completed",
    )
    if academic_year_id:
        total_paid_query = total_paid_query.filter(FeePayment.academic_year_id == academic_year_id)
    total_paid = float(total_paid_query.scalar() or 0)

    # Last payment date
    last_payment = db.query(FeePayment.payment_date).filter(
        FeePayment.student_id == student.id,
        FeePayment.status == "completed",
    ).order_by(desc(FeePayment.payment_date)).first()

    return StudentFeeSummary(
        student_id=student.id,
        student_name=f"{student.first_name} {student.surname or ''}".strip(),
        admission_number=student.admission_number,
        class_name=class_name_str,
        total_fee=total_fee,
        total_paid=total_paid,
        total_due=max(0, total_fee - total_paid),
        last_payment_date=last_payment[0] if last_payment else None,
        fee_breakdown=fee_breakdown,
    )
