"""
Push notification and email service for fee reminders.
Sends term-wise fee reminders to parents with overdue pending fees.
"""
import httpx
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import SessionLocal
from config import settings as app_settings
from models import (
    MobilePushToken, User, Student, FeeStructure, FeePayment,
    AcademicYear, ClassName, TermDueDate,
)

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_expo_push(tokens: List[str], title: str, body: str, data: Optional[dict] = None):
    """Send push notification via Expo Push API."""
    messages = []
    for token in tokens:
        if not token.startswith("ExponentPushToken["):
            continue
        msg = {"to": token, "sound": "default", "title": title, "body": body}
        if data:
            msg["data"] = data
        messages.append(msg)

    if not messages:
        return

    async with httpx.AsyncClient(timeout=30) as client:
        for i in range(0, len(messages), 100):
            batch = messages[i:i + 100]
            try:
                resp = await client.post(
                    EXPO_PUSH_URL,
                    json=batch,
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code != 200:
                    logger.error(f"Expo push failed: {resp.status_code} {resp.text}")
                else:
                    logger.info(f"Sent {len(batch)} push notifications")
            except Exception as e:
                logger.error(f"Expo push error: {e}")


def _get_overdue_terms(db: Session) -> List[int]:
    """Get list of terms whose due date has passed for the current academic year."""
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        return []
    now = datetime.now()
    overdue = db.query(TermDueDate.term).filter(
        TermDueDate.academic_year_id == current_ay.id,
        TermDueDate.due_date <= now,
    ).all()
    return [t[0] for t in overdue]


def _get_term_due_dates_map(db: Session) -> dict:
    """Get {term: due_date_str} for current academic year."""
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        return {}
    dues = db.query(TermDueDate).filter(TermDueDate.academic_year_id == current_ay.id).all()
    return {d.term: d.due_date.strftime("%d %b %Y") for d in dues}


def _get_parent_fee_reminders(db: Session, overdue_terms: Optional[List[int]] = None, phone: Optional[str] = None) -> List[dict]:
    """
    Build list of parents with pending fees.
    If overdue_terms is provided, only check those terms.
    If phone is provided, only send to that parent.
    Returns [{"user_id", "email", "phone", "token", "title", "body", "details"}]
    """
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        return []

    # Get active parent users (role_id=5), optionally filtered by phone
    q = db.query(User).filter(
        User.is_active == True,
        User.role_id == 5,
    )
    if phone:
        q = q.filter(User.phone == phone)
    parents = q.all()

    # Get push tokens for all parents
    token_map = {}
    tokens = db.query(MobilePushToken).filter(MobilePushToken.is_active == True).all()
    for t in tokens:
        token_map[t.user_id] = t.token

    due_dates_map = _get_term_due_dates_map(db)

    reminders = []
    for user in parents:
        students_list = db.query(Student).filter(
            Student.is_active == True,
            (Student.user_id == user.id) | (Student.mobile_number == user.phone),
        ).all()

        child_details = []
        for student in students_list:
            if not student.class_info:
                continue
            class_name_obj = db.query(ClassName).filter(
                ClassName.name.ilike(f"%{student.class_info.class_name}%")
            ).first()
            if not class_name_obj:
                continue

            # Get fee structures, optionally filtered by overdue terms
            q = db.query(FeeStructure).filter(
                FeeStructure.academic_year_id == current_ay.id,
                FeeStructure.class_name_id == class_name_obj.id,
                FeeStructure.is_active == True,
            )
            if overdue_terms:
                q = q.filter(FeeStructure.term.in_(overdue_terms))
            structures = q.all()

            # Group by term
            term_pending = {}
            for fs in structures:
                paid = db.query(
                    func.coalesce(func.sum(FeePayment.amount_paid), 0)
                ).filter(
                    FeePayment.student_id == student.id,
                    FeePayment.academic_year_id == current_ay.id,
                    FeePayment.fee_structure_id == fs.id,
                    FeePayment.status == "completed",
                ).scalar() or 0
                pending = max(0, fs.amount - float(paid))
                if pending > 0:
                    if fs.term not in term_pending:
                        term_pending[fs.term] = 0
                    term_pending[fs.term] += pending

            if term_pending:
                name = f"{student.first_name} {student.surname or ''}".strip()
                for term, amount in sorted(term_pending.items()):
                    due_str = due_dates_map.get(term, "")
                    child_details.append({
                        "student_name": name,
                        "term": term,
                        "amount": amount,
                        "due_date": due_str,
                    })

        if child_details:
            # Build notification body
            lines = []
            for d in child_details:
                line = f"{d['student_name']} - Term {d['term']}: ₹{int(d['amount']):,}"
                if d['due_date']:
                    line += f" (due {d['due_date']})"
                lines.append(line)

            reminders.append({
                "user_id": user.id,
                "email": user.email,
                "phone": user.phone,
                "full_name": user.full_name or "Parent",
                "token": token_map.get(user.id),
                "title": "Fee Reminder",
                "body": "Pending fees - " + ", ".join(
                    f"{d['student_name']} Term {d['term']}: ₹{int(d['amount']):,}"
                    for d in child_details
                ),
                "details": child_details,
            })

    return reminders


def _send_email(to_email: str, subject: str, html_body: str):
    """Send an email via SMTP."""
    if not app_settings.SMTP_USER:
        logger.warning("SMTP not configured, skipping email")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = app_settings.SMTP_FROM_EMAIL or app_settings.SMTP_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(app_settings.SMTP_HOST, app_settings.SMTP_PORT) as server:
            server.starttls()
            server.login(app_settings.SMTP_USER, app_settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def _build_fee_reminder_email_html(reminder: dict) -> str:
    """Build HTML email body for a fee reminder."""
    rows = ""
    total = 0
    for d in reminder["details"]:
        total += d["amount"]
        rows += f"""
        <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">{d['student_name']}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">Term {d['term']}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #dc2626;">₹{int(d['amount']):,}</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{d['due_date'] or '-'}</td>
        </tr>"""

    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; background: #f9fafb; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: #0891b2; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 20px;">📋 Fee Payment Reminder</h1>
            </div>
            <div style="padding: 24px;">
                <p style="font-size: 15px;">Dear <strong>{reminder['full_name']}</strong>,</p>
                <p style="font-size: 14px; color: #555;">This is a reminder that the following fee payments are pending:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 10px 12px; text-align: left; font-size: 13px; color: #6b7280;">Student</th>
                            <th style="padding: 10px 12px; text-align: center; font-size: 13px; color: #6b7280;">Term</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 13px; color: #6b7280;">Pending (₹)</th>
                            <th style="padding: 10px 12px; text-align: center; font-size: 13px; color: #6b7280;">Due Date</th>
                        </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                    <tfoot>
                        <tr style="background: #fef2f2;">
                            <td colspan="2" style="padding: 10px 12px; font-weight: bold;">Total Pending</td>
                            <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #dc2626; font-size: 16px;">₹{int(total):,}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
                <p style="font-size: 13px; color: #6b7280;">Please make the payment at the earliest. Contact the school office for any queries.</p>
            </div>
            <div style="background: #f1f5f9; padding: 12px; text-align: center;">
                <p style="font-size: 11px; color: #9ca3af; margin: 0;">This is an automated reminder from the school fee management system.</p>
            </div>
        </div>
    </body>
    </html>"""


async def send_fee_reminders_push(overdue_only: bool = True, phone: str = None):
    """Send push notifications for pending fees. Returns count sent."""
    db: Session = SessionLocal()
    try:
        overdue_terms = _get_overdue_terms(db) if overdue_only else None
        reminders = _get_parent_fee_reminders(db, overdue_terms, phone=phone)
        sent = 0
        for r in reminders:
            if r.get("token"):
                await send_expo_push(
                    [r["token"]], r["title"], r["body"],
                    data={"type": "fee_reminder"},
                )
                sent += 1
        logger.info(f"Push notifications sent to {sent} parents")
        return {"sent": sent, "total_parents": len(reminders)}
    except Exception as e:
        logger.error(f"Push fee reminders failed: {e}")
        raise
    finally:
        db.close()


async def send_fee_reminders_email(overdue_only: bool = True, phone: str = None):
    """Send email reminders for pending fees. Returns count sent."""
    db: Session = SessionLocal()
    try:
        overdue_terms = _get_overdue_terms(db) if overdue_only else None
        reminders = _get_parent_fee_reminders(db, overdue_terms, phone=phone)
        sent = 0
        skipped = 0
        for r in reminders:
            if r.get("email"):
                html = _build_fee_reminder_email_html(r)
                if _send_email(r["email"], "Fee Payment Reminder", html):
                    sent += 1
            else:
                skipped += 1
        logger.info(f"Emails sent to {sent} parents, {skipped} skipped (no email)")
        return {"sent": sent, "skipped": skipped, "total_parents": len(reminders)}
    except Exception as e:
        logger.error(f"Email fee reminders failed: {e}")
        raise
    finally:
        db.close()
