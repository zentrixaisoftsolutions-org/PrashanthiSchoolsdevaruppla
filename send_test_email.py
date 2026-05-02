"""One-time script: send fee reminder email to parent 9533555661"""
from database import SessionLocal
from models import User, Student, FeeStructure, FeePayment, AcademicYear, ClassName
from sqlalchemy import func
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

db = SessionLocal()
parent = db.query(User).filter(User.phone == "9533555661").first()
ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
students = db.query(Student).filter(
    Student.is_active == True,
    (Student.user_id == parent.id) | (Student.mobile_number == parent.phone),
).all()

rows = ""
total = 0
for s in students:
    cn = s.class_info.class_name if s.class_info else None
    if not cn:
        continue
    cno = db.query(ClassName).filter(ClassName.name.ilike(f"%{cn}%")).first()
    if not cno:
        continue
    structs = db.query(FeeStructure).filter(
        FeeStructure.academic_year_id == ay.id,
        FeeStructure.class_name_id == cno.id,
        FeeStructure.is_active == True,
    ).all()
    term_pending = {}
    for fs in structs:
        paid = db.query(
            func.coalesce(func.sum(FeePayment.amount_paid), 0)
        ).filter(
            FeePayment.student_id == s.id,
            FeePayment.academic_year_id == ay.id,
            FeePayment.fee_structure_id == fs.id,
            FeePayment.status == "completed",
        ).scalar() or 0
        pending = max(0, fs.amount - float(paid))
        if pending > 0:
            term_pending.setdefault(fs.term, 0)
            term_pending[fs.term] += pending

    name = f"{s.first_name} {s.surname or ''}".strip()
    for term, amt in sorted(term_pending.items()):
        total += amt
        rows += f"""
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">{name}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">Term {term}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#dc2626;">₹{int(amt):,}</td>
        </tr>"""
        print(f"  {name} - Term {term}: ₹{int(amt):,} pending")

html = f"""
<html>
<body style="font-family:Arial;color:#333;background:#f9fafb;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#0891b2;padding:20px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:20px;">📋 Fee Payment Reminder</h1>
    </div>
    <div style="padding:24px;">
        <p>Dear <strong>{parent.full_name}</strong>,</p>
        <p style="font-size:14px;color:#555;">This is a reminder that the following fee payments are pending:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:10px 12px;text-align:left;font-size:13px;">Student</th>
                    <th style="padding:10px 12px;text-align:center;font-size:13px;">Term</th>
                    <th style="padding:10px 12px;text-align:right;font-size:13px;">Pending (₹)</th>
                </tr>
            </thead>
            <tbody>{rows}</tbody>
            <tfoot>
                <tr style="background:#fef2f2;">
                    <td colspan="2" style="padding:10px 12px;font-weight:bold;">Total Pending</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#dc2626;font-size:16px;">₹{int(total):,}</td>
                </tr>
            </tfoot>
        </table>
        <p style="font-size:13px;color:#6b7280;">Please make the payment at the earliest. Contact the school office for any queries.</p>
    </div>
    <div style="background:#f1f5f9;padding:12px;text-align:center;">
        <p style="font-size:11px;color:#9ca3af;margin:0;">This is an automated reminder from the school fee management system.</p>
    </div>
</div>
</body>
</html>"""

msg = MIMEMultipart("alternative")
msg["From"] = "ram.sirapurapu@gmail.com"
msg["To"] = parent.email
msg["Subject"] = "Fee Payment Reminder"
msg.attach(MIMEText(html, "html"))

with smtplib.SMTP("smtp.gmail.com", 587) as server:
    server.starttls()
    server.login("ram.sirapurapu@gmail.com", "agqn dkob humu srfv")
    server.send_message(msg)

print(f"\nEmail sent to {parent.full_name} ({parent.email})")
db.close()
