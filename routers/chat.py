"""
Chat Assistant Router - MCP-inspired tool-based chat interface.

Provides a natural language interface to query:
1. Student details (by admission number or name)
2. Attendance history for a student
3. Assessment/marks details for a student

Uses a tool-calling pattern inspired by the Model Context Protocol (MCP),
where user messages are parsed for intent, matched to internal tools,
and executed against the database.
"""

import re
from datetime import date, datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, or_

from database import get_db
from auth import get_current_user
from models import (
    User, Student, Class, AttendanceLog, StudentExamMark,
    ExamType, Subject, AcademicYear, GradeCriteria,
    FeeStructure, FeePayment, ClassName,
    Staff, Department, StaffClassSection, StaffSubject,
    ClassSection, Section, StaffAttendance,
)

router = APIRouter(prefix="/api/chat", tags=["Chat Assistant"])


# ==================== SCHEMAS ====================

class ChatMessage(BaseModel):
    message: str


class ToolCall(BaseModel):
    tool: str
    params: Dict[str, Any]


class ChatResponse(BaseModel):
    reply: str
    tool_used: Optional[str] = None
    data: Optional[Any] = None
    suggestions: Optional[List[str]] = None


# ==================== INTENT DETECTION ====================

def detect_intent(message: str) -> ToolCall:
    """
    Parse the user's natural language message and determine which
    internal tool to call. Returns a ToolCall with the tool name
    and extracted parameters.
    """
    msg = message.strip().lower()

    # --- Fee Collection / Pending Aggregates ---
    # Examples that should trigger this branch:
    #   "how much fee collected today"
    #   "students list who paid fees today"
    #   "how much fee collected for this academic year"
    #   "how much fee pending for this academic year"
    #   "pending fees of students list for this month"
    #   "pending fees of students list for last 2 months"
    #   "pending fees of students list from past 6 months"
    fee_agg_kw = re.search(r'\b(fee|fees|payment|paid|collect|collected|collection|pending|due|outstanding|unpaid)\b', msg)
    if fee_agg_kw:
        # Aggregate phrases that signal "show me totals/list", not a per-student lookup.
        # Per-student queries like "pending fees of Ravi" should fall through to fee_details.
        agg_signal = bool(re.search(
            r'\b(today|yesterday|this\s+week|this\s+month|current\s+month|'
            r'last\s+\d*\s*month|past\s+\d+\s+months?|past\s+month|previous\s+month|'
            r'last\s+month|this\s+(academic\s+)?year|current\s+(academic\s+)?year|'
            r'academic\s+year|how\s+much|all\s+students?|list|total|overall|summary)\b', msg
        ))
        # PENDING flavour — totals or list of students with dues
        pending_match = bool(re.search(r'\b(pending|due|outstanding|unpaid)\b', msg)) and agg_signal
        # COLLECTED flavour — totals OR list of payers
        collected_match = (not pending_match) and agg_signal and bool(
            re.search(r'\b(collected|collection|paid|received|how\s+much)\b', msg)
        )
        if pending_match or collected_match:

            # Determine period
            period = "today"
            months_back = 0
            if re.search(r'\b(today|todays|today\'s)\b', msg):
                period = "today"
            elif re.search(r'\b(yesterday)\b', msg):
                period = "yesterday"
            elif re.search(r'\b(this\s+week|current\s+week|week)\b', msg) and not re.search(r'last\s+\d*\s*week', msg):
                period = "this_week"
            elif re.search(r'\b(this\s+month|current\s+month)\b', msg):
                period = "this_month"
            elif re.search(r'\b(this\s+(academic\s+)?year|current\s+(academic\s+)?year|academic\s+year)\b', msg):
                period = "academic_year"
            else:
                m = re.search(r'\b(?:last|past|previous)\s+(\d+)\s+months?\b', msg)
                if m:
                    months_back = max(1, min(int(m.group(1)), 24))
                    period = "last_n_months"
                elif re.search(r'\b(last\s+month|past\s+month|previous\s+month)\b', msg):
                    months_back = 1
                    period = "last_n_months"
                elif re.search(r'\bthis\s+month\b', msg):
                    period = "this_month"

            # List vs aggregate-only
            want_list = bool(re.search(r'\b(list|who|students|names|details|breakdown|each)\b', msg))

            if pending_match:
                return ToolCall(tool="fee_pending", params={
                    "period": period,
                    "months_back": months_back,
                    "want_list": want_list or True,  # pending requests are most useful as a list
                })
            return ToolCall(tool="fee_collected", params={
                "period": period,
                "months_back": months_back,
                "want_list": want_list,
            })

    # --- Daily Attendance Counts (how many present/absent/late today) ---
    # Examples:
    #   "how many students present today"
    #   "how many staff absent"
    #   "students late today"
    #   "present students count"
    #   "attendance summary today"
    #   "today attendance" / "today's attendance"
    count_status_map = [
        (r'\b(absent|missing|not\s+present|did\s+not\s+come)\b', 'absent'),
        (r'\b(late|tardy)\b', 'late'),
        (r'\b(present|here|came|attended)\b', 'present'),
    ]
    count_who_map = [
        (r'\b(staff|teacher|teachers|employee|employees|faculty)\b', 'staff'),
        (r'\b(student|students|kid|kids|pupil|pupils|children)\b', 'students'),
    ]
    if re.search(r'\b(how\s+many|count|number\s+of|total)\b', msg) or \
       re.search(r'\battendance\s+(summary|count|today|status)\b', msg) or \
       re.search(r"\btoday'?s?\s+attendance\b", msg):
        who = None
        for pat, val in count_who_map:
            if re.search(pat, msg):
                who = val
                break
        status = None
        for pat, val in count_status_map:
            if re.search(pat, msg):
                status = val
                break
        # If user mentions both attendance + a who/status keyword anywhere, treat as count query
        if who or status or re.search(r'\battendance\b', msg):
            return ToolCall(tool="attendance_count", params={
                "who": who or "both",         # students | staff | both
                "status": status or "all",     # present | absent | late | all
            })

    # --- Greetings / Small Talk ---
    greeting_patterns = [
        r'^(hi|hello|hey|hola|howdy|good\s*(morning|afternoon|evening|night)|what\'?s\s*up|sup|yo)\b',
        r'^(how\s+are\s+you|how\s+do\s+you\s+do|nice\s+to\s+meet)',
        r'^(thanks?|thank\s*you|thx|ty)\b',
        r'^(bye|goodbye|see\s+you|later|good\s*bye|cya)\b',
        r'^(ok|okay|cool|great|awesome|nice|👍|😊)$',
    ]
    for pattern in greeting_patterns:
        if re.search(pattern, msg):
            greeting_type = 'farewell' if re.search(r'^(bye|goodbye|see\s+you|later|good\s*bye|cya)', msg) else \
                            'thanks' if re.search(r'^(thanks?|thank\s*you|thx|ty)', msg) else 'greeting'
            return ToolCall(tool="small_talk", params={"type": greeting_type, "original": message.strip()})

    # --- Staff Details ---
    staff_patterns = [
        r'(?:staff|teacher|employee)\s+(?:details?|info|information|profile)\s+(?:of|for|about)\s+(.+)',
        r'(?:details?|info|profile)\s+(?:of|for)\s+(?:staff|teacher|employee)\s+(.+)',
        r'(?:show|get|fetch|find)\s+(?:staff|teacher|employee)\s+(?:details?\s+)?(?:of|for)?\s*(.+)',
        r'(?:who\s+is)\s+(?:staff|teacher|employee)\s+(.+)',
        r'(?:what|which)\s+(?:subjects?|classes?)\s+(?:does|do|is)\s+(.+?)\s+(?:teach|handle|take)',
        r'(?:subjects?|classes?)\s+(?:of|for|taught\s+by)\s+(?:staff|teacher)?\s*(.+)',
        r'(.+?)\s+(?:teaches?|handles?)\s+(?:which|what)\s+(?:subjects?|classes?)',
    ]
    for pattern in staff_patterns:
        m = re.search(pattern, msg)
        if m and any(kw in msg for kw in ['staff', 'teacher', 'employee', 'teach', 'subject', 'class']):
            identifier = m.group(1).strip().strip('"\'\n')
            identifier = re.sub(r'^(of|for|staff|teacher|employee)\s+', '', identifier).strip()
            if identifier and len(identifier) > 1:
                return ToolCall(tool="staff_details", params={"identifier": identifier})

    # --- Staff Attendance ---
    staff_att_patterns = [
        r'(?:staff|teacher|employee)\s+attendance\s+(?:of|for)\s+(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
        r'attendance\s+(?:of|for)\s+(?:staff|teacher|employee)\s+(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
        r'(?:show|get|fetch)\s+(?:staff|teacher)\s+attendance\s+(?:of|for)?\s*(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
    ]
    for pattern in staff_att_patterns:
        m = re.search(pattern, msg)
        if m and any(kw in msg for kw in ['staff', 'teacher', 'employee']) and 'attendance' in msg:
            identifier = m.group(1).strip().strip('"\'\n')
            days = int(m.group(2)) if m.group(2) else 30
            identifier = re.sub(r'^(of|for|staff|teacher|employee)\s+', '', identifier).strip()
            if identifier and len(identifier) > 1:
                return ToolCall(tool="staff_attendance", params={"identifier": identifier, "days": days})

    # --- Fee Details ---
    fee_patterns = [
        r'(?:fee|fees|payment|due|paid)\s+(?:of|for|details?\s+(?:of|for)?|summary\s+(?:of|for)?|status\s+(?:of|for)?)\s+(.+)',
        r'(?:show|get|fetch|find|check)\s+(?:fee|fees|payment|due)\s+(?:of|for)\s+(.+)',
        r'(.+?)\s+(?:fee|fees|fee\s*details|fee\s*summary|fee\s*status|payment\s*(?:details|history|status))',
        r'(?:how\s+much)\s+(?:fee|does)\s+(.+?)\s+(?:owe|due|paid|pay)',
        r'(?:fee|payment)\s+(?:history|details|summary|status)\s+(.+)',
        r'(?:pending|due|outstanding)\s+(?:fee|fees|amount)\s+(?:of|for)\s+(.+)',
    ]
    for pattern in fee_patterns:
        m = re.search(pattern, msg)
        if m and any(kw in msg for kw in ['fee', 'payment', 'due', 'paid', 'pending', 'outstanding']):
            identifier = m.group(1).strip().strip('"\'\n')
            identifier = re.sub(r'^(of|for|student)\s+', '', identifier).strip()
            if identifier:
                return ToolCall(tool="fee_details", params={"identifier": identifier})

    # --- Attendance History ---
    # Patterns: "attendance of 1234", "attendance for john", "attendance history 30 days"
    attendance_patterns = [
        r'attendance\s+(?:of|for|history\s+(?:of|for)?)\s+(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
        r'attendance\s+(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
        r'(?:show|get|fetch|find)\s+attendance\s+(?:of|for)\s+(.+?)(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
        r'(.+?)\s+attendance(?:\s+(?:for|last|past)\s+(\d+)\s+days?)?$',
    ]
    for pattern in attendance_patterns:
        m = re.search(pattern, msg)
        if m and any(kw in msg for kw in ['attendance', 'absent', 'present']):
            identifier = m.group(1).strip().strip('"\'')
            days = int(m.group(2)) if m.group(2) else 30
            # Clean up common filler words
            identifier = re.sub(r'^(of|for|student|history)\s+', '', identifier).strip()
            if identifier:
                return ToolCall(tool="attendance_history", params={"identifier": identifier, "days": days})

    # --- Marks / Assessment ---
    marks_patterns = [
        r'(?:marks|results?|assessment|exam|score|grade)s?\s+(?:of|for|details?\s+(?:of|for)?)\s+(.+)',
        r'(?:show|get|fetch|find)\s+(?:marks|results?|assessment|exam|score|grade)s?\s+(?:of|for)\s+(.+)',
        r'(.+?)\s+(?:marks|results?|assessment|exam|score|grade)s?',
        r'(?:how\s+(?:did|has|is))\s+(.+?)\s+(?:perform|score|do|did)',
    ]
    for pattern in marks_patterns:
        m = re.search(pattern, msg)
        if m and any(kw in msg for kw in ['mark', 'result', 'assess', 'exam', 'score', 'grade', 'perform']):
            identifier = m.group(1).strip().strip('"\'')
            identifier = re.sub(r'^(of|for|student)\s+', '', identifier).strip()
            if identifier:
                return ToolCall(tool="marks_details", params={"identifier": identifier})

    # --- Student Details ---
    student_patterns = [
        r'(?:student|details?|info|information|profile)\s+(?:of|for|about)\s+(.+)',
        r'(?:show|get|fetch|find|search|look\s*up|who\s+is)\s+(?:student\s+)?(.+)',
        r'(?:tell\s+me\s+about)\s+(.+)',
        r'(?:student)\s+(.+)',
    ]
    for pattern in student_patterns:
        m = re.search(pattern, msg)
        if m:
            identifier = m.group(1).strip().strip('"\'')
            identifier = re.sub(r'^(student|details?|of|for)\s+', '', identifier).strip()
            if identifier and identifier not in ('help', 'support', 'ticket', 'assist'):
                return ToolCall(tool="student_details", params={"identifier": identifier})

    # --- Explicit Help ---
    if re.search(r'^(help|commands?|menu|options?|what\s+can\s+you\s+do|how\s+to|assist)$', msg):
        return ToolCall(tool="help_menu", params={})

    # --- Know Your App (main menu) ---
    if re.search(r'know\s*your\s*app|app\s*guide|app\s*tutorial|learn\s*(the\s+)?app|application\s*guide', msg):
        return ToolCall(tool="know_your_app", params={})

    # --- Know Your App — specific feature categories ---
    kb_category_map = {
        "kb_dashboard": r'(guide|learn|how).*(dashboard)',
        "kb_students": r'(guide|learn|how).*(add|create|manage|edit|update|import|bulk).*(student)|kb[:\s]*student',
        "kb_attendance": r'(guide|learn|how).*(attendance|mark\s*absent|daily\s*attendance|attendance\s*summary)|kb[:\s]*attendance',
        "kb_examination": r'(guide|learn|how).*(exam|subject|marks?\s*entry|results?|report\s*card|academic\s*year|map\s*exam)|kb[:\s]*exam',
        "kb_staff": r'(guide|learn|how).*(add|create|manage|edit).*(staff|teacher|department|salary)|kb[:\s]*staff',
        "kb_fees": r'(guide|learn|how).*(fee|payment|razorpay|receipt)|kb[:\s]*fee',
        "kb_devices": r'(guide|learn|how).*(device|rfid|biometric|scanner)|kb[:\s]*device',
        "kb_settings": r'(guide|learn|how).*(setting|grade|role|sms|whatsapp|school\s*setting|user\s*manage|payment\s*gateway)|kb[:\s]*setting',
        "kb_chat": r'(guide|learn|how).*(chat|ai\s*assistant|help\s*desk|ticket)|kb[:\s]*chat',
    }
    for tool_name, pattern in kb_category_map.items():
        if re.search(pattern, msg):
            return ToolCall(tool=tool_name, params={})

    # --- Direct KB trigger phrases (button clicks from the Know Your App menu) ---
    kb_direct = {
        "kb_dashboard": ["📊 dashboard overview"],
        "kb_students": ["🎓 student management"],
        "kb_attendance": ["📋 attendance management"],
        "kb_examination": ["📝 examination & results"],
        "kb_staff": ["👨‍🏫 staff management"],
        "kb_fees": ["💰 fee management"],
        "kb_devices": ["📡 device management"],
        "kb_settings": ["⚙️ settings & configuration"],
        "kb_chat": ["🤖 ai assistant & help desk"],
    }
    for tool_name, phrases in kb_direct.items():
        if msg in phrases:
            return ToolCall(tool=tool_name, params={})

    # --- Technical Help / Raise Ticket ---
    if re.search(r'(raise|create|submit|open|new)\s*(a\s+)?(ticket|issue|bug|complaint|support)', msg) or \
       re.search(r'(technical|tech)\s*(help|support|issue|problem)', msg) or \
       re.search(r'report\s*(a\s+)?(bug|issue|problem|error)', msg) or \
       re.search(r'helpdesk|help\s*desk|service\s*now', msg):
        return ToolCall(tool="raise_ticket", params={})

    # --- Student Help ---
    if re.search(r'(student|find|search)\s*(details?\s*)?(help|info)', msg) or \
       re.search(r'how\s+to\s+(find|search|get)\s+(student|details|info)', msg):
        return ToolCall(tool="student_help", params={})

    # --- Staff Help ---
    if re.search(r'(staff|teacher|employee)\s*(details?\s*)?(help|info)', msg) or \
       re.search(r'how\s+to\s+(find|search|get)\s+(staff|teacher)', msg):
        return ToolCall(tool="staff_help", params={})

    # If message looks like an admission number or short name, default to student lookup
    if re.match(r'^[A-Za-z0-9/\-]+$', msg.strip()) and len(msg.strip()) <= 30:
        return ToolCall(tool="student_details", params={"identifier": msg.strip()})

    # --- Help / Unknown ---
    return ToolCall(tool="help_menu", params={})


# ==================== TOOLS ====================

def find_student(db: Session, identifier: str) -> Optional[Student]:
    """Find a student by admission number, name, or RFID."""
    # Try exact admission number match first
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(
        Student.admission_number == identifier,
        Student.is_active == True
    ).first()
    if student:
        return student

    # Try case-insensitive admission number
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(
        func.lower(Student.admission_number) == identifier.lower(),
        Student.is_active == True
    ).first()
    if student:
        return student

    # Try name search (first name or surname contains the query)
    students = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(
        Student.is_active == True,
        or_(
            func.lower(Student.first_name).contains(identifier.lower()),
            func.lower(Student.surname).contains(identifier.lower()),
            func.lower(Student.first_name + " " + func.coalesce(Student.surname, "")).contains(identifier.lower())
        )
    ).all()

    if len(students) == 1:
        return students[0]
    elif len(students) > 1:
        # Return the first match but note there are multiple
        return students[0]  # Caller can check for multiples separately

    return None


def find_students_multiple(db: Session, identifier: str) -> List[Student]:
    """Find all students matching a name/admission number."""
    # Exact admission number
    student = db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(
        func.lower(Student.admission_number) == identifier.lower(),
        Student.is_active == True
    ).first()
    if student:
        return [student]

    # Name search
    return db.query(Student).options(
        joinedload(Student.class_info)
    ).filter(
        Student.is_active == True,
        or_(
            func.lower(Student.first_name).contains(identifier.lower()),
            func.lower(Student.surname).contains(identifier.lower()),
            func.lower(Student.first_name + " " + func.coalesce(Student.surname, "")).contains(identifier.lower())
        )
    ).limit(10).all()


def tool_student_details(db: Session, identifier: str) -> ChatResponse:
    """Tool: Get student details by admission number or name."""
    students = find_students_multiple(db, identifier)

    if not students:
        return ChatResponse(
            reply=f"❌ No student found matching **\"{identifier}\"**. Please check the admission number or name and try again.",
            tool_used="student_details",
            suggestions=[
                "Try: student details of <admission_number>",
                "Try: find <student name>",
            ]
        )

    if len(students) > 1:
        # Multiple matches — list them
        lines = [f"🔍 Found **{len(students)} students** matching \"{identifier}\":\n"]
        student_data = []
        for i, s in enumerate(students, 1):
            cls = f"{s.class_info.class_name} - {s.class_info.section_name}" if s.class_info else "N/A"
            name = f"{s.first_name} {s.surname or ''}".strip()
            lines.append(f"**{i}.** {name} | Adm: `{s.admission_number}` | Class: {cls}")
            student_data.append({
                "id": s.id,
                "name": name,
                "admission_number": s.admission_number,
                "class": cls,
            })
        lines.append("\n💡 Please specify the exact admission number for detailed info.")
        return ChatResponse(
            reply="\n".join(lines),
            tool_used="student_details",
            data=student_data,
            suggestions=[f"student details of {s.admission_number}" for s in students[:3]]
        )

    # Single student found
    s = students[0]
    cls = f"{s.class_info.class_name} - {s.class_info.section_name}" if s.class_info else "N/A"
    name = f"{s.first_name} {s.surname or ''}".strip()

    details = {
        "id": s.id,
        "name": name,
        "admission_number": s.admission_number,
        "class": cls,
        "gender": s.gender,
        "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
        "father_guardian": s.father_guardian_name,
        "mother": s.mother_name,
        "mobile": s.mobile_number,
        "email": s.email,
        "aadhaar": s.aadhaar_number,
        "pen": s.pen,
        "rfid": s.rfid_id,
        "blood_group": s.blood_group,
        "address": s.address,
        "admission_date": str(s.admission_date) if s.admission_date else None,
    }

    reply_lines = [
        f"## 🎓 Student Profile: {name}",
        "",
        f"| Field | Details |",
        f"|-------|---------|",
        f"| **Admission No** | {s.admission_number} |",
        f"| **Class** | {cls} |",
        f"| **Gender** | {s.gender or 'N/A'} |",
        f"| **Date of Birth** | {s.date_of_birth or 'N/A'} |",
        f"| **Father/Guardian** | {s.father_guardian_name or 'N/A'} |",
        f"| **Mother** | {s.mother_name or 'N/A'} |",
        f"| **Mobile** | {s.mobile_number or 'N/A'} |",
        f"| **Email** | {s.email or 'N/A'} |",
        f"| **Aadhaar** | {s.aadhaar_number or 'N/A'} |",
        f"| **PEN** | {s.pen or 'N/A'} |",
        f"| **Blood Group** | {s.blood_group or 'N/A'} |",
        f"| **RFID ID** | {s.rfid_id or 'N/A'} |",
        f"| **Address** | {s.address or 'N/A'} |",
    ]

    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="student_details",
        data=details,
        suggestions=[
            f"attendance of {s.admission_number} last 30 days",
            f"marks of {s.admission_number}",
        ]
    )


def tool_attendance_history(db: Session, identifier: str, days: int = 30) -> ChatResponse:
    """Tool: Get attendance history for a student."""
    student = find_student(db, identifier)
    if not student:
        return ChatResponse(
            reply=f"❌ No student found matching **\"{identifier}\"**. Please check and try again.",
            tool_used="attendance_history",
            suggestions=["Try: attendance of <admission_number> last 30 days"]
        )

    name = f"{student.first_name} {student.surname or ''}".strip()
    cls = f"{student.class_info.class_name} - {student.class_info.section_name}" if student.class_info else "N/A"

    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    # Get attendance logs
    logs = db.query(AttendanceLog).filter(
        AttendanceLog.student_id == student.id,
        AttendanceLog.attendance_date >= start_date,
        AttendanceLog.attendance_date <= end_date
    ).order_by(AttendanceLog.attendance_date.desc()).all()

    # Count statuses
    present = sum(1 for l in logs if l.status in ("present", "late"))
    absent = sum(1 for l in logs if l.status == "absent")
    late = sum(1 for l in logs if l.status == "late")
    total_logged = len(logs)

    # Working days in range (Mon-Sat)
    working_days = sum(1 for d in range((end_date - start_date).days + 1)
                       if (start_date + timedelta(days=d)).weekday() < 6)

    not_marked = max(0, working_days - total_logged)
    total_absent = absent + not_marked
    percentage = round((present / working_days * 100), 1) if working_days > 0 else 0

    # Build day-wise table (last 15 entries max for readability)
    recent_logs = logs[:15]

    reply_lines = [
        f"## 📋 Attendance History: {name}",
        f"**Class:** {cls} | **Period:** Last {days} days ({start_date} to {end_date})",
        "",
        f"### Summary",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Working Days | {working_days} |",
        f"| ✅ Present | {present} |",
        f"| ❌ Absent | {total_absent} |",
        f"| ⏰ Late | {late} |",
        f"| 📊 Attendance % | **{percentage}%** |",
        "",
    ]

    if recent_logs:
        reply_lines.append("### Recent Records")
        reply_lines.append("| Date | Status | Check-in | Check-out |")
        reply_lines.append("|------|--------|----------|-----------|")
        for log in recent_logs:
            status_icon = {"present": "✅", "absent": "❌", "late": "⏰", "half_day": "🔶"}.get(log.status, "❓")
            checkin = log.check_in_time.strftime("%I:%M %p") if log.check_in_time else "—"
            checkout = log.check_out_time.strftime("%I:%M %p") if log.check_out_time else "—"
            reply_lines.append(f"| {log.attendance_date} | {status_icon} {log.status.title()} | {checkin} | {checkout} |")

    data = {
        "student_id": student.id,
        "student_name": name,
        "class": cls,
        "period_days": days,
        "working_days": working_days,
        "present": present,
        "absent": total_absent,
        "late": late,
        "percentage": percentage,
    }

    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="attendance_history",
        data=data,
        suggestions=[
            f"attendance of {student.admission_number} last 60 days",
            f"marks of {student.admission_number}",
            f"student details of {student.admission_number}",
        ]
    )


def tool_marks_details(db: Session, identifier: str) -> ChatResponse:
    """Tool: Get assessment / marks details for a student."""
    student = find_student(db, identifier)
    if not student:
        return ChatResponse(
            reply=f"❌ No student found matching **\"{identifier}\"**. Please check and try again.",
            tool_used="marks_details",
            suggestions=["Try: marks of <admission_number>"]
        )

    name = f"{student.first_name} {student.surname or ''}".strip()
    cls = f"{student.class_info.class_name} - {student.class_info.section_name}" if student.class_info else "N/A"

    # Get all marks for this student with related data
    marks = db.query(StudentExamMark).options(
        joinedload(StudentExamMark.subject),
        joinedload(StudentExamMark.exam_type),
        joinedload(StudentExamMark.academic_year),
    ).filter(
        StudentExamMark.student_id == student.id
    ).order_by(
        StudentExamMark.academic_year_id.desc(),
        StudentExamMark.exam_type_id,
        StudentExamMark.subject_id,
    ).all()

    if not marks:
        return ChatResponse(
            reply=f"📝 No exam marks found for **{name}** ({student.admission_number}).\n\nThe student may not have any marks entered yet.",
            tool_used="marks_details",
            data={"student_id": student.id, "student_name": name, "marks": []},
            suggestions=[
                f"attendance of {student.admission_number} last 30 days",
                f"student details of {student.admission_number}",
            ]
        )

    # Load grade criteria for grading
    grade_criteria = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True
    ).order_by(GradeCriteria.min_percentage.desc()).all()

    def get_grade(pct: float) -> str:
        for gc in grade_criteria:
            if gc.min_percentage <= pct <= gc.max_percentage:
                return gc.grade
        return "N/A"

    # Group by exam type
    exam_groups: Dict[str, List] = {}
    for mark in marks:
        exam_name = mark.exam_type.name if mark.exam_type else "Unknown"
        ay = mark.academic_year.name if mark.academic_year else ""
        key = f"{exam_name} ({ay})" if ay else exam_name
        if key not in exam_groups:
            exam_groups[key] = []
        exam_groups[key].append(mark)

    reply_lines = [
        f"## 📝 Assessment Report: {name}",
        f"**Class:** {cls} | **Admission No:** {student.admission_number}",
        "",
    ]

    all_marks_data = []

    for exam_key, exam_marks in exam_groups.items():
        reply_lines.append(f"### 📄 {exam_key}")
        reply_lines.append("| Subject | Marks | Max | Min | % | Grade | Status |")
        reply_lines.append("|---------|-------|-----|-----|---|-------|--------|")

        total_obtained = 0
        total_max = 0
        exam_data = {"exam": exam_key, "subjects": []}

        for m in exam_marks:
            subj = m.subject.name if m.subject else "Unknown"
            if m.is_absent:
                reply_lines.append(f"| {subj} | AB | {m.max_marks} | {m.min_marks} | — | — | ❌ Absent |")
                exam_data["subjects"].append({
                    "subject": subj, "marks": "AB", "max": m.max_marks,
                    "min": m.min_marks, "percentage": None, "grade": None, "status": "Absent"
                })
            else:
                obtained = m.marks_obtained or 0
                pct = round(obtained / m.max_marks * 100, 1) if m.max_marks > 0 else 0
                grade = get_grade(pct)
                passed = obtained >= (m.min_marks or 0)
                status = "✅ Pass" if passed else "❌ Fail"
                reply_lines.append(f"| {subj} | {obtained} | {m.max_marks} | {m.min_marks} | {pct}% | {grade} | {status} |")
                total_obtained += obtained
                total_max += m.max_marks
                exam_data["subjects"].append({
                    "subject": subj, "marks": obtained, "max": m.max_marks,
                    "min": m.min_marks, "percentage": pct, "grade": grade,
                    "status": "Pass" if passed else "Fail"
                })

        if total_max > 0:
            overall_pct = round(total_obtained / total_max * 100, 1)
            overall_grade = get_grade(overall_pct)
            reply_lines.append(f"| **Total** | **{total_obtained}** | **{total_max}** | — | **{overall_pct}%** | **{overall_grade}** | — |")
            exam_data["total_obtained"] = total_obtained
            exam_data["total_max"] = total_max
            exam_data["overall_percentage"] = overall_pct
            exam_data["overall_grade"] = overall_grade

        reply_lines.append("")
        all_marks_data.append(exam_data)

    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="marks_details",
        data={"student_id": student.id, "student_name": name, "class": cls, "exams": all_marks_data},
        suggestions=[
            f"attendance of {student.admission_number} last 30 days",
            f"student details of {student.admission_number}",
        ]
    )


def tool_fee_details(db: Session, identifier: str) -> ChatResponse:
    """Tool: Get fee summary and payment history for a student."""
    student = find_student(db, identifier)
    if not student:
        return ChatResponse(
            reply=f"❌ No student found matching **\"{identifier}\"**. Please check and try again.",
            tool_used="fee_details",
            suggestions=["Try: fee details of <admission_number>", "Try: fees of <student name>"]
        )

    name = f"{student.first_name} {student.surname or ''}".strip()
    cls = f"{student.class_info.class_name} - {student.class_info.section_name}" if student.class_info else "N/A"

    # Get current academic year (fallback to latest active if none marked current)
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        current_ay = db.query(AcademicYear).filter(
            AcademicYear.is_active == True
        ).order_by(AcademicYear.id.desc()).first()
    if not current_ay:
        return ChatResponse(
            reply=f"⚠️ No current academic year is set. Please configure an academic year first.",
            tool_used="fee_details",
            suggestions=["student details of " + student.admission_number]
        )

    # Bridge: Student -> Class -> ClassName to get the correct class_name_id
    class_name_id = None
    if student.class_info:
        # Class model has class_name (string like "1 CLASS"), match it to ClassName.name
        cn = db.query(ClassName).filter(
            func.lower(ClassName.name) == func.lower(student.class_info.class_name)
        ).first()
        if cn:
            class_name_id = cn.id

    fee_structures = db.query(FeeStructure).filter(
        FeeStructure.academic_year_id == current_ay.id,
        FeeStructure.is_active == True
    ).all()

    # Filter to student's class if we resolved the class_name_id
    if class_name_id:
        class_fees = [f for f in fee_structures if f.class_name_id == class_name_id]
        if class_fees:
            fee_structures = class_fees

    # Get all payments for this student in current AY
    payments = db.query(FeePayment).filter(
        FeePayment.student_id == student.id,
        FeePayment.academic_year_id == current_ay.id,
        FeePayment.status == "completed"
    ).order_by(FeePayment.payment_date.desc()).all()

    total_fee = sum(f.amount for f in fee_structures)
    total_paid = sum(p.amount_paid for p in payments)
    total_due = max(0, total_fee - total_paid)

    # Build fee breakdown
    fee_breakdown = []
    for fs in fee_structures:
        paid_for_type = sum(p.amount_paid for p in payments if p.fee_structure_id == fs.id)
        due_for_type = max(0, fs.amount - paid_for_type)
        fee_breakdown.append({
            "fee_type": fs.fee_type,
            "amount": fs.amount,
            "paid": paid_for_type,
            "due": due_for_type,
            "frequency": fs.frequency,
            "mandatory": fs.is_mandatory,
        })

    # Build response — using card_type for adaptive card rendering
    card_data = {
        "card_type": "fee_summary",
        "student_id": student.id,
        "student_name": name,
        "admission_number": student.admission_number,
        "class": cls,
        "academic_year": current_ay.name if hasattr(current_ay, 'name') else str(current_ay.id),
        "total_fee": float(total_fee),
        "total_paid": float(total_paid),
        "total_due": float(total_due),
        "payment_percentage": round(total_paid / total_fee * 100, 1) if total_fee > 0 else 0,
        "fee_breakdown": fee_breakdown,
        "recent_payments": [
            {
                "date": p.payment_date.strftime("%Y-%m-%d") if p.payment_date else "N/A",
                "amount": float(p.amount_paid),
                "method": p.payment_method,
                "receipt": p.receipt_number or "N/A",
                "status": p.status,
            }
            for p in payments[:10]
        ],
    }

    # Text reply (also rendered, but adaptive card takes priority)
    reply_lines = [
        f"## 💰 Fee Summary: {name}",
        f"**Class:** {cls} | **Adm No:** {student.admission_number} | **AY:** {card_data['academic_year']}",
        "",
        f"| | Amount |",
        f"|---|---|",
        f"| **Total Fee** | ₹{total_fee:,.2f} |",
        f"| **Total Paid** | ₹{total_paid:,.2f} |",
        f"| **Balance Due** | ₹{total_due:,.2f} |",
        "",
    ]

    if fee_breakdown:
        reply_lines.append("### Fee Breakdown")
        reply_lines.append("| Fee Type | Amount | Paid | Due |")
        reply_lines.append("|----------|--------|------|-----|")
        for fb in fee_breakdown:
            reply_lines.append(f"| {fb['fee_type']} | ₹{fb['amount']:,.2f} | ₹{fb['paid']:,.2f} | ₹{fb['due']:,.2f} |")
        reply_lines.append("")

    if payments:
        reply_lines.append("### Recent Payments")
        reply_lines.append("| Date | Amount | Method | Receipt |")
        reply_lines.append("|------|--------|--------|---------|")
        for p in payments[:5]:
            dt = p.payment_date.strftime("%d %b %Y") if p.payment_date else "N/A"
            reply_lines.append(f"| {dt} | ₹{p.amount_paid:,.2f} | {p.payment_method.title()} | {p.receipt_number or 'N/A'} |")
    else:
        reply_lines.append("_No payments recorded yet for this academic year._")

    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="fee_details",
        data=card_data,
        suggestions=[
            f"student details of {student.admission_number}",
            f"attendance of {student.admission_number} last 30 days",
            f"marks of {student.admission_number}",
        ]
    )


# ==================== STAFF TOOLS ====================

def find_staff(db: Session, identifier: str) -> Optional[Staff]:
    """Find a staff member by employee ID, name, or RFID."""
    # Try exact employee_id match
    staff = db.query(Staff).options(
        joinedload(Staff.department),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.section),
        joinedload(Staff.subjects).joinedload(StaffSubject.subject),
    ).filter(
        Staff.is_active == True,
        func.lower(Staff.employee_id) == identifier.lower()
    ).first()
    if staff:
        return staff

    # Try RFID
    staff = db.query(Staff).options(
        joinedload(Staff.department),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.section),
        joinedload(Staff.subjects).joinedload(StaffSubject.subject),
    ).filter(
        Staff.is_active == True,
        func.lower(Staff.rfid) == identifier.lower()
    ).first()
    if staff:
        return staff

    # Try name search
    results = db.query(Staff).options(
        joinedload(Staff.department),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.section),
        joinedload(Staff.subjects).joinedload(StaffSubject.subject),
    ).filter(
        Staff.is_active == True,
        or_(
            func.lower(Staff.first_name).contains(identifier.lower()),
            func.lower(Staff.last_name).contains(identifier.lower()),
            func.lower(Staff.first_name + " " + func.coalesce(Staff.last_name, "")).contains(identifier.lower())
        )
    ).limit(10).all()

    if len(results) == 1:
        return results[0]
    elif len(results) > 1:
        return results[0]  # Caller can handle multiples
    return None


def find_staff_multiple(db: Session, identifier: str) -> List[Staff]:
    """Find all staff matching a name / employee ID."""
    # Exact employee_id
    staff = db.query(Staff).options(
        joinedload(Staff.department),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.section),
        joinedload(Staff.subjects).joinedload(StaffSubject.subject),
    ).filter(
        Staff.is_active == True,
        func.lower(Staff.employee_id) == identifier.lower()
    ).first()
    if staff:
        return [staff]

    # Name search
    return db.query(Staff).options(
        joinedload(Staff.department),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.class_name),
        joinedload(Staff.class_sections).joinedload(StaffClassSection.class_section).joinedload(ClassSection.section),
        joinedload(Staff.subjects).joinedload(StaffSubject.subject),
    ).filter(
        Staff.is_active == True,
        or_(
            func.lower(Staff.first_name).contains(identifier.lower()),
            func.lower(Staff.last_name).contains(identifier.lower()),
            func.lower(Staff.first_name + " " + func.coalesce(Staff.last_name, "")).contains(identifier.lower())
        )
    ).limit(10).all()


def tool_staff_details(db: Session, identifier: str) -> ChatResponse:
    """Tool: Get staff details including subjects taught and class-sections."""
    staff_list = find_staff_multiple(db, identifier)

    if not staff_list:
        return ChatResponse(
            reply=f"❌ No staff member found matching **\"{identifier}\"**. Please check the name or employee ID and try again.",
            tool_used="staff_details",
            suggestions=[
                "Try: staff details of <employee_id>",
                "Try: teacher details of <name>",
            ]
        )

    if len(staff_list) > 1:
        lines = [f"🔍 Found **{len(staff_list)} staff members** matching \"{identifier}\":\n"]
        staff_data = []
        for i, s in enumerate(staff_list, 1):
            name = f"{s.first_name} {s.last_name or ''}".strip()
            dept = s.department.name if s.department else "N/A"
            lines.append(f"**{i}.** {name} | EmpID: `{s.employee_id or 'N/A'}` | Dept: {dept}")
            staff_data.append({"id": s.id, "name": name, "employee_id": s.employee_id, "department": dept})
        lines.append("\n💡 Please specify the exact employee ID or full name for detailed info.")
        return ChatResponse(
            reply="\n".join(lines),
            tool_used="staff_details",
            data=staff_data,
            suggestions=[f"staff details of {s.employee_id or s.first_name}" for s in staff_list[:3]]
        )

    # Single staff member found
    s = staff_list[0]
    name = f"{s.first_name} {s.last_name or ''}".strip()
    dept = s.department.name if s.department else "N/A"

    # Class-Sections
    cs_list = []
    for scs in s.class_sections:
        cs = scs.class_section
        cn = cs.class_name.name if cs and cs.class_name else "?"
        sec = cs.section.name if cs and cs.section else "?"
        cs_list.append(f"{cn} - {sec}")

    # Subjects
    subj_list = [ss.subject.name for ss in s.subjects if ss.subject]

    details = {
        "id": s.id,
        "name": name,
        "employee_id": s.employee_id,
        "department": dept,
        "designation": s.designation or "N/A",
        "gender": s.gender,
        "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
        "mobile": s.mobile,
        "email": s.email,
        "qualification": s.qualification,
        "date_of_joining": str(s.date_of_joining) if s.date_of_joining else None,
        "class_sections": cs_list,
        "subjects": subj_list,
    }

    reply_lines = [
        f"## 👨‍🏫 Staff Profile: {name}",
        "",
        f"| Field | Details |",
        f"|-------|---------|" ,
        f"| **Employee ID** | {s.employee_id or 'N/A'} |",
        f"| **Department** | {dept} |",
        f"| **Designation** | {s.designation or 'N/A'} |",
        f"| **Gender** | {s.gender or 'N/A'} |",
        f"| **Date of Birth** | {s.date_of_birth or 'N/A'} |",
        f"| **Mobile** | {s.mobile or 'N/A'} |",
        f"| **Email** | {s.email or 'N/A'} |",
        f"| **Qualification** | {s.qualification or 'N/A'} |",
        f"| **Date of Joining** | {s.date_of_joining or 'N/A'} |",
        f"| **Aadhaar** | {s.aadhar_number or 'N/A'} |",
        f"| **RFID** | {s.rfid or 'N/A'} |",
        f"| **Address** | {s.address or 'N/A'} |",
        "",
    ]

    if cs_list:
        reply_lines.append("### 📚 Classes & Sections")
        for cs_name in cs_list:
            reply_lines.append(f"- {cs_name}")
        reply_lines.append("")
    else:
        reply_lines.append("_No class-section assignments._\n")

    if subj_list:
        reply_lines.append("### 📖 Subjects")
        for subj in subj_list:
            reply_lines.append(f"- {subj}")
        reply_lines.append("")
    else:
        reply_lines.append("_No subject assignments._\n")

    emp_key = s.employee_id or s.first_name
    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="staff_details",
        data=details,
        suggestions=[
            f"staff attendance of {emp_key} last 30 days",
            f"staff details of <another_name>",
        ]
    )


def tool_staff_attendance(db: Session, identifier: str, days: int = 30) -> ChatResponse:
    """Tool: Get attendance history for a staff member."""
    staff_list = find_staff_multiple(db, identifier)

    if not staff_list:
        return ChatResponse(
            reply=f"❌ No staff member found matching **\"{identifier}\"**. Please check and try again.",
            tool_used="staff_attendance",
            suggestions=["Try: staff attendance of <employee_id> last 30 days"]
        )

    if len(staff_list) > 1:
        lines = [f"🔍 Found **{len(staff_list)} staff members** matching \"{identifier}\":\n"]
        staff_data = []
        for i, s in enumerate(staff_list, 1):
            name = f"{s.first_name} {s.last_name or ''}".strip()
            dept = s.department.name if s.department else "N/A"
            lines.append(f"**{i}.** {name} | EmpID: `{s.employee_id or 'N/A'}` | Dept: {dept}")
            staff_data.append({"id": s.id, "name": name, "employee_id": s.employee_id, "department": dept})
        lines.append("\n💡 Please specify the exact employee ID or full name to view attendance.")
        return ChatResponse(
            reply="\n".join(lines),
            tool_used="staff_attendance",
            data=staff_data,
            suggestions=[f"staff attendance of {s.employee_id or s.first_name} last {days} days" for s in staff_list[:3]]
        )

    staff = staff_list[0]
    name = f"{staff.first_name} {staff.last_name or ''}".strip()
    dept = staff.department.name if staff.department else "N/A"

    end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    logs = db.query(StaffAttendance).filter(
        StaffAttendance.staff_id == staff.id,
        StaffAttendance.attendance_date >= start_date,
        StaffAttendance.attendance_date <= end_date
    ).order_by(StaffAttendance.attendance_date.desc()).all()

    present = sum(1 for l in logs if l.status in ("present", "late"))
    absent = sum(1 for l in logs if l.status == "absent")
    late = sum(1 for l in logs if l.status == "late")
    leave = sum(1 for l in logs if l.status == "leave")
    total_logged = len(logs)

    # Working days (Mon-Sat)
    working_days = sum(1 for d in range((end_date - start_date).days + 1)
                       if (start_date + timedelta(days=d)).weekday() < 6)

    not_marked = max(0, working_days - total_logged)
    total_absent = absent + not_marked
    percentage = round((present / working_days * 100), 1) if working_days > 0 else 0

    recent_logs = logs[:15]

    reply_lines = [
        f"## 📋 Staff Attendance: {name}",
        f"**Department:** {dept} | **Period:** Last {days} days ({start_date} to {end_date})",
        "",
        f"### Summary",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Working Days | {working_days} |",
        f"| ✅ Present | {present} |",
        f"| ❌ Absent | {total_absent} |",
        f"| ⏰ Late | {late} |",
        f"| 🏖️ Leave | {leave} |",
        f"| 📊 Attendance % | **{percentage}%** |",
        "",
    ]

    if recent_logs:
        reply_lines.append("### Recent Records")
        reply_lines.append("| Date | Status | Check-in | Check-out |")
        reply_lines.append("|------|--------|----------|-----------|")
        for log in recent_logs:
            status_icon = {"present": "✅", "absent": "❌", "late": "⏰", "half_day": "🔶", "leave": "🏖️"}.get(log.status, "❓")
            checkin = log.check_in_time.strftime("%I:%M %p") if log.check_in_time else "—"
            checkout = log.check_out_time.strftime("%I:%M %p") if log.check_out_time else "—"
            reply_lines.append(f"| {log.attendance_date} | {status_icon} {log.status.title()} | {checkin} | {checkout} |")
    else:
        reply_lines.append("_No attendance records found for this period._")

    data = {
        "staff_id": staff.id,
        "staff_name": name,
        "department": dept,
        "period_days": days,
        "working_days": working_days,
        "present": present,
        "absent": total_absent,
        "late": late,
        "leave": leave,
        "percentage": percentage,
    }

    emp_key = staff.employee_id or staff.first_name
    return ChatResponse(
        reply="\n".join(reply_lines),
        tool_used="staff_attendance",
        data=data,
        suggestions=[
            f"staff attendance of {emp_key} last 60 days",
            f"staff details of {emp_key}",
        ]
    )


def _resolve_period(period: str, months_back: int = 0) -> tuple:
    """Return (start_date, end_date, label) for a named period."""
    today = date.today()
    if period == "today":
        return today, today, "Today"
    if period == "yesterday":
        y = today - timedelta(days=1)
        return y, y, "Yesterday"
    if period == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today, f"This week ({start} → {today})"
    if period == "this_month":
        start = today.replace(day=1)
        return start, today, f"This month ({start.strftime('%b %Y')})"
    if period == "last_n_months":
        n = max(1, months_back or 1)
        y, m = today.year, today.month - (n - 1)
        while m <= 0:
            m += 12
            y -= 1
        start = date(y, m, 1)
        return start, today, f"Last {n} month{'s' if n > 1 else ''} ({start} → {today})"
    return today, today, "Today"


def _current_academic_year(db: Session):
    ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not ay:
        ay = db.query(AcademicYear).filter(AcademicYear.is_active == True).order_by(AcademicYear.id.desc()).first()
    return ay


def tool_fee_collected(db: Session, period: str = "today", months_back: int = 0, want_list: bool = False) -> ChatResponse:
    """Tool: Total fee collected over a period, optionally with a list of payers."""
    current_ay = _current_academic_year(db)

    if period == "academic_year":
        if not current_ay:
            return ChatResponse(
                reply="⚠️ No current academic year is set. Please configure one first.",
                tool_used="fee_collected",
            )
        start_date = getattr(current_ay, 'start_date', None) or date.today().replace(month=4, day=1)
        end_date = date.today()
        label = f"Academic Year {getattr(current_ay, 'name', current_ay.id)} ({start_date} → {end_date})"
    else:
        start_date, end_date, label = _resolve_period(period, months_back)

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    base_filters = [
        FeePayment.status == "completed",
        FeePayment.payment_date >= start_dt,
        FeePayment.payment_date <= end_dt,
    ]
    if period == "academic_year" and current_ay:
        base_filters.append(FeePayment.academic_year_id == current_ay.id)

    total = float(db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0))
                    .filter(*base_filters).scalar() or 0)
    payment_count = db.query(func.count(FeePayment.id)).filter(*base_filters).scalar() or 0

    method_rows = db.query(
        FeePayment.payment_method,
        func.count(FeePayment.id),
        func.coalesce(func.sum(FeePayment.amount_paid), 0),
    ).filter(*base_filters).group_by(FeePayment.payment_method).all()

    lines = [
        f"## 💰 Fee Collection — {label}",
        "",
        f"**Total Collected:** ₹{total:,.2f}",
        f"**Payments:** {payment_count}",
        "",
    ]

    if method_rows:
        lines.append("### By Payment Method")
        lines.append("| Method | Count | Amount |")
        lines.append("|--------|------:|-------:|")
        for method, cnt, amt in method_rows:
            lines.append(f"| {(method or 'unknown').title()} | {cnt} | ₹{float(amt):,.2f} |")
        lines.append("")

    payers_data = []
    if want_list and payment_count > 0:
        payments = db.query(FeePayment).options(
            joinedload(FeePayment.student).joinedload(Student.class_info)
        ).filter(*base_filters).order_by(FeePayment.payment_date.desc()).limit(100).all()
        more = f" of {payment_count}" if payment_count > len(payments) else ""
        lines.append(f"### Students Who Paid ({len(payments)}{more})")
        lines.append("| # | Student | Adm No | Class | Amount | Method | Date |")
        lines.append("|---|---------|--------|-------|-------:|--------|------|")
        for i, p in enumerate(payments, 1):
            s = p.student
            if not s:
                continue
            name = f"{s.first_name} {s.surname or ''}".strip()
            cls = f"{s.class_info.class_name} - {s.class_info.section_name}" if s.class_info else "—"
            dt = p.payment_date.strftime("%d %b %Y") if p.payment_date else "—"
            lines.append(
                f"| {i} | {name} | {s.admission_number} | {cls} | "
                f"₹{float(p.amount_paid):,.2f} | {(p.payment_method or '').title()} | {dt} |"
            )
            payers_data.append({
                "student_id": s.id,
                "student_name": name,
                "admission_number": s.admission_number,
                "class": cls,
                "amount": float(p.amount_paid),
                "method": p.payment_method,
                "date": dt,
                "receipt": p.receipt_number,
            })

    return ChatResponse(
        reply="\n".join(lines),
        tool_used="fee_collected",
        data={
            "card_type": "fee_collected",
            "period": period,
            "label": label,
            "total_collected": total,
            "payment_count": payment_count,
            "by_method": [{"method": m, "count": c, "amount": float(a)} for m, c, a in method_rows],
            "payers": payers_data,
        },
        suggestions=[
            "students list who paid fees today",
            "how much fee collected this month",
            "how much fee collected for this academic year",
            "pending fees of students list for this month",
        ],
    )


def tool_fee_pending(db: Session, period: str = "academic_year", months_back: int = 0, want_list: bool = True) -> ChatResponse:
    """
    Tool: Students with pending fees.

    For "academic_year": full-year expected vs full-year paid.
    For shorter windows: full-year expected vs paid IN that window
      (i.e. "what was due that they didn't cover during that period").
    """
    current_ay = _current_academic_year(db)
    if not current_ay:
        return ChatResponse(
            reply="⚠️ No current academic year is set. Please configure one first.",
            tool_used="fee_pending",
        )

    fee_structs = db.query(FeeStructure).filter(
        FeeStructure.academic_year_id == current_ay.id,
        FeeStructure.is_active == True,
    ).all()
    expected_by_class: Dict[int, float] = {}
    for fs in fee_structs:
        expected_by_class[fs.class_name_id] = expected_by_class.get(fs.class_name_id, 0.0) + float(fs.amount or 0)

    if period == "academic_year":
        ay_label = f"Academic Year {getattr(current_ay, 'name', current_ay.id)}"
        paid_filter = [FeePayment.academic_year_id == current_ay.id]
    else:
        start_date, end_date, period_label = _resolve_period(period, months_back)
        ay_label = f"{period_label} (vs full-year fee)"
        paid_filter = [
            FeePayment.payment_date >= datetime.combine(start_date, datetime.min.time()),
            FeePayment.payment_date <= datetime.combine(end_date, datetime.max.time()),
        ]

    paid_rows = db.query(
        FeePayment.student_id,
        func.coalesce(func.sum(FeePayment.amount_paid), 0),
    ).filter(
        FeePayment.status == "completed",
        *paid_filter,
    ).group_by(FeePayment.student_id).all()
    paid_by_student: Dict[int, float] = {sid: float(amt) for sid, amt in paid_rows}

    students = db.query(Student).options(joinedload(Student.class_info)).filter(
        Student.is_active == True
    ).all()

    class_name_id_cache: Dict[str, Optional[int]] = {}
    def _resolve_class_name_id(class_name_str: Optional[str]) -> Optional[int]:
        if not class_name_str:
            return None
        if class_name_str in class_name_id_cache:
            return class_name_id_cache[class_name_str]
        cn = db.query(ClassName).filter(func.lower(ClassName.name) == class_name_str.lower()).first()
        cid = cn.id if cn else None
        class_name_id_cache[class_name_str] = cid
        return cid

    pending_rows: List[Dict[str, Any]] = []
    total_expected = 0.0
    total_paid = 0.0
    for s in students:
        cls_str = s.class_info.class_name if s.class_info else None
        cn_id = _resolve_class_name_id(cls_str)
        expected = expected_by_class.get(cn_id, 0.0) if cn_id else 0.0
        paid = paid_by_student.get(s.id, 0.0)
        pending = max(0.0, expected - paid)
        total_expected += expected
        total_paid += paid
        if expected > 0 and pending > 0:
            cls = f"{cls_str} - {s.class_info.section_name}" if s.class_info else "—"
            pending_rows.append({
                "student_id": s.id,
                "student_name": f"{s.first_name} {s.surname or ''}".strip(),
                "admission_number": s.admission_number,
                "class": cls,
                "mobile": s.mobile_number,
                "expected": expected,
                "paid": paid,
                "pending": pending,
            })

    pending_rows.sort(key=lambda r: r["pending"], reverse=True)
    grand_pending = max(0.0, total_expected - total_paid)

    lines = [
        f"## ⚠️ Pending Fees — {ay_label}",
        "",
        f"**Students with dues:** {len(pending_rows)}",
        f"**Total expected (full year):** ₹{total_expected:,.2f}",
        f"**Total paid (in window):** ₹{total_paid:,.2f}",
        f"**Total pending:** ₹{grand_pending:,.2f}",
        "",
    ]

    if not pending_rows:
        lines.append("🎉 **All students are up to date with their fees for this period!**")
    elif want_list:
        max_show = 50
        shown = pending_rows[:max_show]
        more = f" of {len(pending_rows)}" if len(pending_rows) > max_show else ""
        lines.append(f"### Top {len(shown)}{more} Students by Pending Amount")
        lines.append("| # | Student | Adm No | Class | Mobile | Expected | Paid | Pending |")
        lines.append("|---|---------|--------|-------|--------|---------:|-----:|--------:|")
        for i, r in enumerate(shown, 1):
            lines.append(
                f"| {i} | {r['student_name']} | {r['admission_number']} | {r['class']} | "
                f"{r['mobile'] or '—'} | ₹{r['expected']:,.0f} | ₹{r['paid']:,.0f} | "
                f"**₹{r['pending']:,.0f}** |"
            )
        if len(pending_rows) > max_show:
            lines.append("")
            lines.append(f"_… and {len(pending_rows) - max_show} more students with pending fees._")

    return ChatResponse(
        reply="\n".join(lines),
        tool_used="fee_pending",
        data={
            "card_type": "fee_pending",
            "period": period,
            "label": ay_label,
            "total_expected": total_expected,
            "total_paid": total_paid,
            "total_pending": grand_pending,
            "student_count": len(pending_rows),
            "students": pending_rows[:200],
        },
        suggestions=[
            "pending fees of students list for this month",
            "pending fees of students list from past 6 months",
            "how much fee pending for this academic year",
            "how much fee collected today",
        ],
    )


def tool_attendance_count(db: Session, who: str = "both", status: str = "all", target_date: Optional[date] = None) -> ChatResponse:
    """
    Tool: Daily attendance counts for students and/or staff.

    who:    'students' | 'staff' | 'both'
    status: 'present'  | 'absent' | 'late' | 'all'

    "Present" includes everyone marked present OR late (late counts as present-but-tardy).
    "Absent" includes both explicit absent rows AND people with no log for the day.
    """
    target_date = target_date or date.today()

    def _student_counts() -> Dict[str, int]:
        total = db.query(func.count(Student.id)).filter(Student.is_active == True).scalar() or 0
        rows = db.query(
            AttendanceLog.status,
            func.count(func.distinct(AttendanceLog.student_id)),
        ).join(Student, Student.id == AttendanceLog.student_id).filter(
            AttendanceLog.attendance_date == target_date,
            Student.is_active == True,
        ).group_by(AttendanceLog.status).all()
        sc = dict(rows)
        present_only = sc.get("present", 0)
        late = sc.get("late", 0)
        absent_marked = sc.get("absent", 0)
        marked = present_only + late + absent_marked
        not_marked = max(0, total - marked)
        return {
            "total": total,
            "present": present_only + late,
            "present_only": present_only,
            "late": late,
            "absent": absent_marked + not_marked,
            "absent_marked": absent_marked,
            "not_marked": not_marked,
        }

    def _staff_counts() -> Dict[str, int]:
        total = db.query(func.count(Staff.id)).filter(Staff.is_active == True).scalar() or 0
        rows = db.query(
            StaffAttendance.status,
            func.count(func.distinct(StaffAttendance.staff_id)),
        ).join(Staff, Staff.id == StaffAttendance.staff_id).filter(
            StaffAttendance.attendance_date == target_date,
            Staff.is_active == True,
        ).group_by(StaffAttendance.status).all()
        sc = dict(rows)
        present_only = sc.get("present", 0)
        late = sc.get("late", 0)
        absent_marked = sc.get("absent", 0)
        leave = sc.get("leave", 0)
        marked = present_only + late + absent_marked + leave
        not_marked = max(0, total - marked)
        return {
            "total": total,
            "present": present_only + late,
            "present_only": present_only,
            "late": late,
            "absent": absent_marked + not_marked,
            "absent_marked": absent_marked,
            "not_marked": not_marked,
            "leave": leave,
        }

    students = _student_counts() if who in ("students", "both") else None
    staff = _staff_counts() if who in ("staff", "both") else None

    date_label = "Today" if target_date == date.today() else target_date.strftime("%d %b %Y")
    pct = lambda part, whole: round(part / whole * 100, 1) if whole > 0 else 0.0

    icon_map = {"present": "✅", "absent": "❌", "late": "⏰", "all": "📊"}
    head_icon = icon_map.get(status, "📊")

    lines = [f"## {head_icon} Attendance Summary — {date_label}"]
    if status != "all":
        lines.append(f"**Filter:** {status.title()} only")
    lines.append("")

    data: Dict[str, Any] = {
        "card_type": "attendance_count",
        "date": str(target_date),
        "status_filter": status,
        "who": who,
    }

    def render_block(label: str, c: Dict[str, int], is_staff: bool = False) -> List[str]:
        out = [f"### {label}"]
        out.append("| Metric | Count | % |")
        out.append("|--------|------:|---:|")
        out.append(f"| Total {label.lower()} | **{c['total']}** | 100% |")
        if status in ("all", "present"):
            out.append(f"| ✅ Present (incl. late) | **{c['present']}** | {pct(c['present'], c['total'])}% |")
        if status in ("all", "late"):
            out.append(f"| ⏰ Late | **{c['late']}** | {pct(c['late'], c['total'])}% |")
        if status in ("all", "absent"):
            out.append(f"| ❌ Absent (incl. not marked) | **{c['absent']}** | {pct(c['absent'], c['total'])}% |")
            if c.get("not_marked", 0) > 0:
                out.append(f"| &nbsp;&nbsp;↳ not marked yet | {c['not_marked']} | — |")
        if is_staff and status == "all" and c.get("leave", 0) > 0:
            out.append(f"| 🏖️ On leave | {c['leave']} | {pct(c['leave'], c['total'])}% |")
        out.append("")
        return out

    if students is not None:
        lines += render_block("Students", students, is_staff=False)
        data["students"] = students
    if staff is not None:
        lines += render_block("Staff", staff, is_staff=True)
        data["staff"] = staff

    if students is not None and staff is not None and status == "all":
        combined_total = students["total"] + staff["total"]
        combined_present = students["present"] + staff["present"]
        lines.append(
            f"**Overall present:** {combined_present} / {combined_total} "
            f"({pct(combined_present, combined_total)}%)"
        )

    if who == "students":
        suggestions = [
            "how many students present today",
            "how many students late today",
            "how many staff present today",
        ]
    elif who == "staff":
        suggestions = [
            "how many staff absent today",
            "how many staff late today",
            "how many students present today",
        ]
    else:
        suggestions = [
            "how many students absent today",
            "how many staff late today",
            "today attendance summary",
        ]

    return ChatResponse(
        reply="\n".join(lines),
        tool_used="attendance_count",
        data=data,
        suggestions=suggestions,
    )


def tool_small_talk(talk_type: str, original: str) -> ChatResponse:
    """Tool: Handle greetings, thanks, and farewells."""
    import random

    if talk_type == 'thanks':
        replies = [
            "You're welcome! 😊 Let me know if you need anything else.",
            "Happy to help! Feel free to ask more questions.",
            "Anytime! I'm here whenever you need me. 🤖",
            "Glad I could help! What else would you like to know?",
        ]
    elif talk_type == 'farewell':
        replies = [
            "Goodbye! Have a great day! 👋",
            "See you later! Don't hesitate to come back anytime. 😊",
            "Bye! Take care! 🌟",
            "See you! I'll be here whenever you need help. 👋",
        ]
    else:
        replies = [
            f"Hello! 👋 I'm your School ERP Assistant. How can I help you today?",
            f"Hi there! 😊 I can help you with student details, attendance, marks, and fee information. What would you like to know?",
            f"Hey! 🤖 Welcome! Ask me about any student's details, attendance, marks or fee status.",
            f"Hello! Great to see you! I'm ready to help with student info, fees, attendance, or exam results.",
        ]

    return ChatResponse(
        reply=random.choice(replies),
        tool_used=None,
        data={"card_type": "text"},
        suggestions=[
            "student details of <admission_no>",
            "fees of <student>",
            "attendance of <student> last 30 days",
            "staff details of <name>",
        ]
    )


def tool_help() -> ChatResponse:
    """Tool: Show help / available commands."""
    return ChatResponse(
        reply=(
            "## 🤖 School Assistant — Available Commands\n\n"
            "I can help you find information about students and staff. Here's what I can do:\n\n"
            "### 1️⃣ Student Details\n"
            "Find student info by name or admission number.\n"
            "- `student details of 1234`\n"
            "- `find John`\n"
            "- `who is Ravi Kumar`\n\n"
            "### 2️⃣ Student Attendance\n"
            "Check attendance records for a student.\n"
            "- `attendance of 1234 last 30 days`\n"
            "- `attendance history of John`\n\n"
            "### 3️⃣ Marks / Assessment\n"
            "View exam marks and grades for a student.\n"
            "- `marks of 1234`\n"
            "- `results for John`\n\n"
            "### 4️⃣ Fee Details\n"
            "Check fee status, payments, and dues for a student.\n"
            "- `fee details of 1234`\n"
            "- `fees of John`\n\n"
            "### 5️⃣ Staff Details\n"
            "View staff info, subjects taught, and class-section assignments.\n"
            "- `staff details of RK`\n"
            "- `teacher details of <name>`\n"
            "- `what subjects does <name> teach`\n\n"
            "### 6️⃣ Staff Attendance\n"
            "Check attendance records for a staff member.\n"
            "- `staff attendance of <name> last 30 days`\n"
            "- `teacher attendance of <employee_id>`\n\n"
            "### 7️⃣ Today's Attendance Counts\n"
            "Quick daily totals for present / absent / late.\n"
            "- `how many students present today`\n"
            "- `how many staff absent`\n"
            "- `how many students late today`\n"
            "- `today attendance summary`\n\n"
            "### 8️⃣ Fee Collection & Pending\n"
            "Aggregate fee figures and lists.\n"
            "- `how much fee collected today`\n"
            "- `students list who paid fees today`\n"
            "- `how much fee collected for this academic year`\n"
            "- `how much fee pending for this academic year`\n"
            "- `pending fees of students list for this month`\n"
            "- `pending fees of students list from past 6 months`\n\n"
            "---\n"
            "💡 **Tip:** Use admission numbers, employee IDs, or names in any query!\n"
            "💬 **Tip:** You can also just say hi for a quick chat!"
        ),
        tool_used="help",
        data={"card_type": "text"},
        suggestions=[
            "student details of <admission_no>",
            "staff details of <name>",
            "attendance of <student> last 30 days",
            "fees of <student>",
        ]
    )


def tool_help_menu() -> ChatResponse:
    """Tool: Show help menu with two main options."""
    return ChatResponse(
        reply=(
            "## 🆘 How can I help you?\n\n"
            "Please choose one of the options below:\n\n"
            "**🎓 Student Details Help** — Learn how to find student information, attendance, marks, and fees\n\n"
            "**👨‍🏫 Staff Details Help** — Look up staff details, subjects, classes, and attendance\n\n"
            "**🛠️ Technical Help** — Report a bug, request a feature, or raise a support ticket to the development team\n\n"
            "**📚 Know Your App** — Step-by-step guide to every feature with examples & FAQ"
        ),
        tool_used="help_menu",
        data={"card_type": "help_menu"},
        suggestions=[
            "Student Details Help",
            "Staff Details Help",
            "Technical Help",
            "Know Your App",
        ]
    )


def tool_student_help() -> ChatResponse:
    """Tool: Show student-related help."""
    return ChatResponse(
        reply=(
            "## 🎓 Student Details Help\n\n"
            "Here's how to find information about students:\n\n"
            "### 🔍 Search by Admission Number\n"
            "Type the admission number directly:\n"
            "- `KTSN20251`\n"
            "- `student details of KTSN20251`\n\n"
            "### 🔍 Search by Name\n"
            "Type the student name:\n"
            "- `find Ravi Kumar`\n"
            "- `who is John`\n\n"
            "### 📋 Attendance\n"
            "- `attendance of KTSN20251`\n"
            "- `attendance of Ravi last 7 days`\n\n"
            "### 📝 Marks & Results\n"
            "- `marks of KTSN20251`\n"
            "- `results for Ravi`\n\n"
            "### 💰 Fee Details\n"
            "- `fees of KTSN20251`\n"
            "- `pending fees of Ravi`\n\n"
            "---\n"
            "💡 Just type any admission number or name and I'll look it up!"
        ),
        tool_used="student_help",
        data={"card_type": "text"},
        suggestions=[
            "student details of <admission_no>",
            "attendance of <student>",
            "marks of <student>",
            "fees of <student>",
            "help",
        ]
    )


def tool_staff_help() -> ChatResponse:
    """Tool: Show staff-related help."""
    return ChatResponse(
        reply=(
            "## 👨‍🏫 Staff Details Help\n\n"
            "Here's how to find information about staff members:\n\n"
            "### 🔍 Search by Name or Employee ID\n"
            "- `staff details of RK`\n"
            "- `teacher details of <employee_id>`\n\n"
            "### 📚 Subjects & Classes\n"
            "- `what subjects does <name> teach`\n"
            "- `which classes does <name> handle`\n\n"
            "### 📋 Staff Attendance\n"
            "- `staff attendance of <name> last 30 days`\n"
            "- `teacher attendance of <name>`\n\n"
            "---\n"
            "💡 Use staff name or employee ID in any query!"
        ),
        tool_used="staff_help",
        data={"card_type": "text"},
        suggestions=[
            "staff details of <name>",
            "staff attendance of <name> last 30 days",
            "help",
        ]
    )


def tool_raise_ticket() -> ChatResponse:
    """Tool: Prompt user to raise a support ticket."""
    return ChatResponse(
        reply=(
            "## 🛠️ Technical Support\n\n"
            "You can raise a ticket to report an issue or request a feature. "
            "The development team will be notified via email.\n\n"
            "Click the button below to open the ticket form:"
        ),
        tool_used="raise_ticket",
        data={"card_type": "raise_ticket"},
        suggestions=["help"],
    )


# ==================== KNOWLEDGE BASE ====================

KNOWLEDGE_BASE: Dict[str, Dict[str, Any]] = {
    "kb_dashboard": {
        "icon": "📊",
        "title": "Dashboard Overview",
        "summary": "Your home screen with real-time school statistics and charts.",
        "content": (
            "## 📊 Dashboard Overview\n\n"
            "The Dashboard is the first screen you see after logging in. "
            "It gives you a bird's-eye view of your entire school.\n\n"
            "### What You'll See\n"
            "- **Total Students** — Count of all active students\n"
            "- **Total Staff** — Count of all active staff members\n"
            "- **Attendance Rate** — Today's overall student attendance percentage\n"
            "- **Fee Collection** — Total fees collected vs pending\n\n"
            "### Charts & Analytics\n"
            "- **Attendance Pie Chart** — Present vs Absent vs Late breakdown\n"
            "- **Class-wise Students** — Bar chart showing how many students are in each class\n"
            "- **Gender Distribution** — Pie chart of male vs female students\n"
            "- **Attendance Trend** — Area chart showing attendance over time\n"
            "- **Fee Summary Cards** — Total fee, collected amount, and pending amount\n\n"
            "### Navigation\n"
            "📍 **Sidebar → Dashboard** (available to all roles)\n\n"
            "---\n"
            "💡 **Tip:** The dashboard auto-refreshes data. Use it to quickly spot low attendance or pending fees."
        ),
        "faq": [
            {"q": "Who can access the Dashboard?", "a": "All roles — Super Admin, Admin, Teacher, Student, and Parent."},
            {"q": "Is the data real-time?", "a": "Yes, the dashboard pulls live data from the database each time you visit."},
            {"q": "Can I customize which charts are shown?", "a": "Not yet — the layout is fixed, but all charts are always visible."},
        ],
    },
    "kb_students": {
        "icon": "🎓",
        "title": "Student Management",
        "summary": "Add, edit, import students and view performance reports.",
        "content": (
            "## 🎓 Student Management — Complete Guide\n\n"
            "### Step 1: Add a New Student\n"
            "1. Go to **Sidebar → Students → Student List**\n"
            "2. Click the **+ Add Student** button (top right)\n"
            "3. Fill in the required fields:\n"
            "   - **Admission Number** (e.g., `KTSN20251`) — must be unique\n"
            "   - **First Name**, **Surname**\n"
            "   - **Class** — select from the dropdown (e.g., `1 CLASS - A`)\n"
            "   - Optional: Date of Birth, Gender, Mobile, Email, RFID ID, Parent details, etc.\n"
            "4. Click **Save** to create the student\n\n"
            "### Step 2: Edit / Update a Student\n"
            "1. Go to **Students → Student List**\n"
            "2. Find the student using the **Search** box or **Class/Section filters**\n"
            "3. Click the **Edit (pencil)** icon on the student row\n"
            "4. Update any fields (name, class, mobile, RFID, etc.)\n"
            "5. Click **Update** to save changes\n\n"
            "### Step 3: Bulk Import Students from Excel\n"
            "1. Go to **Students → Student List**\n"
            "2. Click the **Import** button\n"
            "3. Upload an Excel/CSV file with columns matching the required fields\n"
            "   - Required columns: `admission_number`, `first_name`, `class_id`\n"
            "   - Optional: `surname`, `date_of_birth`, `gender`, `mobile_number`, `rfid_id`, etc.\n"
            "4. The system will parse and import all rows\n\n"
            "### Step 4: Delete a Student\n"
            "1. Click the **Delete (trash)** icon on the student row\n"
            "2. Confirm the deletion in the popup\n\n"
            "### Step 5: View Performance Report\n"
            "1. Go to **Students → Performance Report**\n"
            "2. Search and select a student\n"
            "3. Choose a date range\n"
            "4. Click **Generate Report** — shows attendance + marks summary\n"
            "5. Click **Print** to print the report\n\n"
            "### Filters & Search\n"
            "- Filter students by **Class Name**, **Section**, or **Search Text**\n"
            "- Paginated list shows 20 students per page\n\n"
            "---\n"
            "💡 **Tip:** Use bulk import to quickly onboard hundreds of students from a spreadsheet!"
        ),
        "faq": [
            {"q": "How do I add a student?", "a": "Go to Students → Student List → click '+ Add Student' → fill details → Save."},
            {"q": "How do I change a student's class?", "a": "Edit the student → change the Class dropdown → Update."},
            {"q": "Can I import students from Excel?", "a": "Yes! Click Import on the Student List page and upload your XLSX/CSV file."},
            {"q": "How do I assign an RFID card?", "a": "Edit the student → enter the RFID ID number → Update. The device will then recognize their scans."},
            {"q": "What is Performance Report?", "a": "It generates a combined report of a student's attendance and marks over a chosen date range, with print support."},
            {"q": "Example: Adding student KTSN20251", "a": "Go to Student List → + Add Student → Admission No: KTSN20251, First Name: PARNIKA, Surname: GOUD, Class: 1 CLASS - A → Save."},
        ],
    },
    "kb_attendance": {
        "icon": "📋",
        "title": "Attendance Management",
        "summary": "Daily attendance, manual marking, bulk absent, SMS/WhatsApp alerts.",
        "content": (
            "## 📋 Attendance Management — Complete Guide\n\n"
            "### Method 1: Automatic Attendance (RFID/Biometric Device)\n"
            "1. Configure your attendance device (see **Device Management** section)\n"
            "2. Students scan their ID card on the device\n"
            "3. The system automatically records **Check-in** and **Check-out** times\n"
            "4. First scan = Check-in, Second scan = Check-out\n\n"
            "### Method 2: Manual Attendance\n"
            "1. Go to **Sidebar → Attendance → Manual Attendance**\n"
            "2. Select the **Date** (defaults to today)\n"
            "3. Choose **Students** or **Staff** tab\n"
            "4. Filter by **Class** and **Section**\n"
            "5. You'll see the full student list with status toggles\n"
            "6. Mark each student as **Present**, **Absent**, or **Late**\n"
            "7. Changes are saved automatically\n\n"
            "### Mark Bulk Absent\n"
            "1. On the Manual Attendance page, click **Mark Bulk Absent**\n"
            "2. Select multiple students who are absent\n"
            "3. Optionally enable **Send SMS notification** to parents\n"
            "4. Click **Confirm** to mark all selected students as absent\n\n"
            "### Send Notifications to Parents\n"
            "1. After marking attendance, click **Send Notifications**\n"
            "2. Choose: **SMS**, **WhatsApp**, or **Both**\n"
            "3. The system sends absence alerts to parents' registered mobile numbers\n\n"
            "### View Attendance Summary\n"
            "1. Go to **Attendance → Attendance Summary**\n"
            "2. Choose view type: **Daily** / **Weekly** / **Monthly** / **Yearly** / **Overall**\n"
            "3. Filter by class, section, year, month\n"
            "4. See detailed attendance percentages and counts\n"
            "5. Click on a student to drill down into their attendance history\n\n"
            "---\n"
            "💡 **Tip:** The system considers 9:00 AM as school start time — arrivals after that are marked **Late**."
        ),
        "faq": [
            {"q": "How does automatic attendance work?", "a": "Students tap their RFID card on the scanner device. First scan = check-in, second scan = check-out. Data is pushed to the server in real-time."},
            {"q": "How do I mark a student absent manually?", "a": "Go to Attendance → Manual Attendance → select date, class, section → find the student → set status to Absent."},
            {"q": "Can I send SMS to parents for absent students?", "a": "Yes! Use 'Mark Bulk Absent' or 'Send Notifications' button to send SMS/WhatsApp alerts to parents."},
            {"q": "What is the attendance percentage formula?", "a": "Attendance % = (Days Present ÷ Working Days) × 100. Working days = Monday to Saturday."},
            {"q": "Can I view monthly attendance?", "a": "Yes — go to Attendance Summary → select 'Monthly' view → choose the month and year."},
        ],
    },
    "kb_examination": {
        "icon": "📝",
        "title": "Examination & Results",
        "summary": "Subjects, exams, marks entry, report cards, and grading.",
        "content": (
            "## 📝 Examination & Results — Complete Guide\n\n"
            "### Step 1: Set Up Academic Year\n"
            "1. Go to **Examination → Academic Year**\n"
            "2. Click **+ Add** to create a new year (e.g., `2025-26`)\n"
            "3. Set one year as **Current** using the toggle\n\n"
            "### Step 2: Create Subjects\n"
            "1. Go to **Examination → Subjects**\n"
            "2. Click **+ Add Subject** (e.g., `Mathematics`, Code: `MATH`)\n"
            "3. Assign subjects to class-sections:\n"
            "   - Click the subject → select which classes will have this subject\n\n"
            "### Step 3: Create Exam Types\n"
            "1. Go to **Examination → Manage Exams**\n"
            "2. Click **+ Add**\n"
            "3. Enter exam name (e.g., `Unit Test 1`, `Half Yearly`, `Final Exam`)\n"
            "4. Link to the current academic year\n\n"
            "### Step 4: Map Exams to Class-Sections (Exam Schedule)\n"
            "1. Go to **Examination → Map Exams**\n"
            "2. Select an **Exam Type** and **Academic Year**\n"
            "3. Select one or more **Class-Sections**\n"
            "4. For each subject, set:\n"
            "   - **Exam Date**, **Start Time**, **End Time**\n"
            "   - **Max Marks** (e.g., 100), **Min Marks** (e.g., 35)\n"
            "5. Click **Save Schedule**\n\n"
            "### Step 5: Enter Marks\n"
            "1. Go to **Examination → Marks Entry**\n"
            "2. Select: **Academic Year** → **Exam** → **Class** → **Section**\n"
            "3. A spreadsheet grid appears with students as rows & subjects as columns\n"
            "4. Enter marks for each student in each subject\n"
            "5. Mark absent students using the **Absent** checkbox\n"
            "6. Click **Save All** when done\n\n"
            "### Step 6: View Results & Print Report Cards\n"
            "1. Go to **Examination → Results**\n"
            "2. Select: **Academic Year**, **Exam Type**, **Class**, **Section**\n"
            "3. Options: show marks, show attendance, select report format\n"
            "4. Click **Generate** to see all students' results\n"
            "5. Click **Print Report Card** — generates a beautiful report card with:\n"
            "   - School header & logo\n"
            "   - Subject-wise marks, grades, and percentages\n"
            "   - Color-coded grade bars\n"
            "   - Auto-generated teacher remarks\n\n"
            "---\n"
            "💡 **Tip:** Set up Grades (Settings → Grades) before generating results to see proper grade letters!"
        ),
        "faq": [
            {"q": "How do I create an exam?", "a": "Go to Examination → Manage Exams → + Add → enter name (e.g., 'Unit Test 1') → select academic year → Save."},
            {"q": "What is 'Map Exams'?", "a": "It's where you schedule exams — assign exam dates, times, and max/min marks per subject for each class-section."},
            {"q": "How do I enter marks?", "a": "Go to Marks Entry → select Academic Year, Exam, Class, Section → fill in the marks grid → Save All."},
            {"q": "How do I print report cards?", "a": "Go to Results → select filters → Generate → click Print Report Card."},
            {"q": "What grading system is used?", "a": "Go to Settings → Grades to configure grade ranges (e.g., A+ = 90-100%, A = 80-89%, etc.)."},
            {"q": "Example: Enter marks for Unit Test 1", "a": "Marks Entry → Year: 2025-26 → Exam: Unit Test 1 → Class: 1 CLASS → Section: A → fill marks for each student/subject → Save All."},
        ],
    },
    "kb_staff": {
        "icon": "👨‍🏫",
        "title": "Staff Management",
        "summary": "Departments, staff profiles, class/subject assignments, salary.",
        "content": (
            "## 👨‍🏫 Staff Management — Complete Guide\n\n"
            "### Step 1: Create Departments\n"
            "1. Go to **Staff → Departments**\n"
            "2. Click **+ Add Department**\n"
            "3. Enter department name (e.g., `Teaching`, `Administration`, `IT`)\n"
            "4. Click **Save**\n\n"
            "### Step 2: Add a New Staff Member\n"
            "1. Go to **Staff → Staff List**\n"
            "2. Click the **Add** tab\n"
            "3. Fill in the fields:\n"
            "   - **First Name**, **Last Name**\n"
            "   - **Employee ID** (e.g., `EMP001`)\n"
            "   - **Department** — select from dropdown\n"
            "   - **Designation** (e.g., `Teacher`, `HOD`, `Principal`)\n"
            "   - **Mobile**, **Email**, **Qualification**\n"
            "   - **Date of Joining**, **Salary**\n"
            "   - **RFID** — for device-based attendance\n"
            "4. **Assign Class-Sections** — select which classes this staff member handles\n"
            "5. **Assign Subjects** — select which subjects they teach\n"
            "6. Optionally **upload a photo** or **capture from webcam**\n"
            "7. Click **Save**\n\n"
            "### Step 3: Edit / Update Staff\n"
            "1. Go to **Staff → Staff List**\n"
            "2. Click the **Edit** icon on the staff row\n"
            "3. Update any fields → click **Update**\n\n"
            "### Step 4: Process Staff Salary\n"
            "1. Go to **Staff → Salary**\n"
            "2. Select **Month** and **Year**\n"
            "3. Enter the number of **Working Days** for that month\n"
            "4. Click **Calculate Salary** — the system computes salary based on attendance\n"
            "5. Review the calculated amounts per staff member\n"
            "6. Filter by department if needed\n"
            "7. Click **Save** to store salary records\n\n"
            "---\n"
            "💡 **Tip:** Assign RFID cards to staff members so they can use the biometric device for attendance too!"
        ),
        "faq": [
            {"q": "How do I add a teacher?", "a": "Go to Staff → Staff List → Add tab → fill name, department, subjects, class-sections → Save."},
            {"q": "How do I assign a teacher to a class?", "a": "When adding/editing staff, select the class-sections from the multi-select dropdown."},
            {"q": "How do I assign subjects to a teacher?", "a": "When adding/editing staff, select the subjects from the multi-select dropdown."},
            {"q": "How is salary calculated?", "a": "Salary = (Base Salary ÷ Working Days) × Days Present. Go to Staff → Salary to calculate."},
            {"q": "Can I upload staff photos?", "a": "Yes! When adding/editing staff, you can upload a photo file or capture one live from your webcam."},
        ],
    },
    "kb_fees": {
        "icon": "💰",
        "title": "Fee Management",
        "summary": "Fee structure, payments, Razorpay, receipts, and fee summary.",
        "content": (
            "## 💰 Fee Management — Complete Guide\n\n"
            "### Step 1: Create Fee Structure\n"
            "1. Go to **Fee Management → Fee Structure**\n"
            "2. Click **+ Add Fee**\n"
            "3. Select **Academic Year** (e.g., `2025-26`)\n"
            "4. Select **Class** (e.g., `1 CLASS`)\n"
            "5. Enter **Fee Type** (e.g., `Tuition Fee`, `Lab Fee`, `Bus Fee`)\n"
            "6. Enter **Amount** (e.g., ₹50,000)\n"
            "7. Select **Frequency**: Yearly / Half-Yearly / Quarterly / Monthly / One-Time\n"
            "8. Toggle **Mandatory** on/off\n"
            "9. Click **Save**\n\n"
            "### Step 2: Record a Fee Payment\n"
            "1. Go to **Fee Management → Fee Payment**\n"
            "2. Search and select the **Student**\n"
            "3. Select the **Fee Structure** item to pay against\n"
            "4. Enter **Amount Paid**\n"
            "5. Select **Payment Method**: Cash or Online\n"
            "6. Optional: **Discount** (amount or percentage), **Tax %**, **Remarks**\n"
            "7. Click **Submit Payment**\n\n"
            "### Online Payment (Razorpay)\n"
            "1. Select **Online** as payment method\n"
            "2. The system creates a Razorpay order\n"
            "3. Student/parent completes payment through Razorpay checkout\n"
            "4. Payment is auto-recorded on success\n\n"
            "### Print Fee Receipt\n"
            "1. After a payment, click the **Print Receipt** button\n"
            "2. A receipt is generated with school header, student details, and payment info\n\n"
            "### View Fee Summary\n"
            "1. Go to **Fee Management → Fee Summary**\n"
            "2. Filter by Academic Year, Class, or search by student name\n"
            "3. View: Total Fee, Paid, Due for each student\n"
            "4. Click on a student to see detailed payment history\n\n"
            "---\n"
            "💡 **Tip:** Set up the Razorpay gateway in Settings → Payment Gateway before using online payments!"
        ),
        "faq": [
            {"q": "How do I set fees for a class?", "a": "Go to Fee Management → Fee Structure → + Add Fee → select class, fee type, amount, frequency → Save."},
            {"q": "How do I accept a cash payment?", "a": "Go to Fee Payment → search student → select fee → enter amount → choose 'Cash' → Submit Payment."},
            {"q": "How does Razorpay work?", "a": "Set up credentials in Settings → Payment Gateway, then students can pay online. Payments are auto-recorded."},
            {"q": "How do I print a receipt?", "a": "After recording a payment, click the Print Receipt button to generate a printable fee receipt."},
            {"q": "How do I check who has pending fees?", "a": "Go to Fee Summary → filter by class → students with 'Due' amount > 0 have pending fees."},
        ],
    },
    "kb_devices": {
        "icon": "📡",
        "title": "Device Management",
        "summary": "Add RFID/biometric devices, connect, test, and diagnose.",
        "content": (
            "## 📡 Device Management — Complete Guide\n\n"
            "### Step 1: Add a New Device\n"
            "1. Go to **Attendance → Devices**\n"
            "2. Click **+ Add Device**\n"
            "3. Fill in:\n"
            "   - **Device Name** (e.g., `Main Gate`)\n"
            "   - **Device Model** (e.g., `ZKTeco K40`)\n"
            "   - **Serial Number** (e.g., `AYSF05069993`) — printed on the device\n"
            "   - **IP Address** (e.g., `192.168.0.110`)\n"
            "   - **Port** (e.g., `5005`)\n"
            "   - **Connection Type**: `TCP/IP` (for push-based devices)\n"
            "   - **Location** (e.g., `Main Entrance`)\n"
            "4. Click **Save**\n\n"
            "### Step 2: Connect the Device\n"
            "1. Click the **Connect** button on the device row\n"
            "2. The system pings the device to verify it's reachable\n"
            "3. If successful, the device status changes to **Connected**\n"
            "4. A health monitor starts pinging every 30 seconds\n\n"
            "### Step 3: Configure the Device to Push Data\n"
            "On your ZKTeco device admin panel:\n"
            "1. Set **Push Server**: `http://<your-server-ip>:8000/iclock/cdata`\n"
            "2. The device will push attendance scans to your server automatically\n\n"
            "### Step 4: Test the Device (Diagnostic Mode)\n"
            "1. Go to **Devices** → **Test** tab\n"
            "2. Select the device from the dropdown\n"
            "3. **Run Connectivity Test** — checks if the device is reachable\n"
            "4. **Start Listening** — enters diagnostic mode\n"
            "5. Scan an ID card on the device → the scan appears in the live log\n"
            "6. This mode does **not** mark any attendance — it's for testing only\n"
            "7. Click **Stop Listening** when done\n\n"
            "---\n"
            "💡 **Tip:** The device serial number must match exactly what's configured on the device for push to work!"
        ),
        "faq": [
            {"q": "How do I add a biometric device?", "a": "Go to Attendance → Devices → + Add Device → enter name, model, serial, IP, port → Save."},
            {"q": "What IP and port should I use?", "a": "Use the device's network IP (e.g., 192.168.0.110) and the port configured on the device (usually 4370 or 5005)."},
            {"q": "How do I test if the device is working?", "a": "Go to Devices → Test tab → select the device → Start Listening → scan a card → check if it appears in the live log."},
            {"q": "The device is not sending data. What should I check?", "a": "1) Verify the device push URL is http://<server>:8000/iclock/cdata  2) Check the serial number matches  3) Ensure device and server are on the same network."},
            {"q": "Does diagnostic mode mark attendance?", "a": "No — diagnostic mode is purely for testing. It shows scan data without marking any attendance."},
        ],
    },
    "kb_settings": {
        "icon": "⚙️",
        "title": "Settings & Configuration",
        "summary": "Classes, grades, roles, SMS, WhatsApp, payment gateway, school profile.",
        "content": (
            "## ⚙️ Settings & Configuration — Complete Guide\n\n"
            "### Classes & Sections\n"
            "1. Go to **Settings → Classes & Sections**\n"
            "2. View all classes with their assigned sections\n"
            "3. Click a class to **assign sections** (e.g., assign Section A, B, C to `1 CLASS`)\n"
            "4. Set **capacity** for each class-section (e.g., 40 students)\n\n"
            "### Grades\n"
            "1. Go to **Settings → Grades**\n"
            "2. Define grade criteria in the spreadsheet editor:\n"
            "   - **Min %** → **Max %** → **Grade** → **Remarks** → **Grade Point**\n"
            "   - Example: 90-100 = A+, 80-89 = A, 70-79 = B+, etc.\n"
            "3. Click **Save All** to apply\n\n"
            "### Role Access (Per-User Menu Control)\n"
            "1. Go to **Settings → Role Access**\n"
            "2. Select a user from the dropdown\n"
            "3. Toggle on/off specific menu items for that user\n"
            "4. Click **Save** — that user will only see the enabled menus\n"
            "5. Click **Reset to Default** to restore role-based defaults\n\n"
            "### SMS Settings\n"
            "1. Go to **Settings → SMS Settings**\n"
            "2. **Config tab**: Add your SMS provider (API key, sender ID, etc.)\n"
            "3. **Templates tab**: Create message templates for absent notifications\n"
            "4. **Logs tab**: View history of sent SMS messages\n"
            "5. Use **Test SMS** to verify your setup works\n\n"
            "### WhatsApp Settings\n"
            "1. Go to **Settings → WhatsApp Settings**\n"
            "2. Same 3-tab structure: Config, Templates, Logs\n"
            "3. Configure your WhatsApp provider credentials\n"
            "4. Create message templates and test sending\n\n"
            "### Payment Gateway (Razorpay)\n"
            "1. Go to **Settings → Payment Gateway**\n"
            "2. Enter your Razorpay **Key ID** and **Key Secret**\n"
            "3. Toggle **Test Mode** for sandbox testing\n"
            "4. Click **Test Connection** to verify\n\n"
            "### School Settings\n"
            "1. Go to **Settings → School Settings**\n"
            "2. Update: School Name, Address, Phone, Email, Website, Affiliation Number\n"
            "3. **Upload your school logo** (max 2MB) — appears on report cards and receipts\n\n"
            "### User Management (Super Admin only)\n"
            "1. Go to **Settings → User Management**\n"
            "2. Add/edit/delete user accounts\n"
            "3. Assign roles: Super Admin, Admin, Teacher, Student, Parent\n"
            "4. Set email, username, password for each user\n\n"
            "---\n"
            "💡 **Tip:** Set up School Settings and Grades first — they affect report cards, receipts, and results!"
        ),
        "faq": [
            {"q": "How do I create a new class?", "a": "Go to Settings → Classes & Sections → add a new class name, then assign sections to it."},
            {"q": "How do I set up grades?", "a": "Go to Settings → Grades → fill in min%, max%, grade letter for each row → Save All."},
            {"q": "How do I restrict a user's menu access?", "a": "Go to Settings → Role Access → select the user → toggle off menus they shouldn't see → Save."},
            {"q": "How do I configure SMS?", "a": "Go to Settings → SMS Settings → Config tab → add your SMS provider details (API key, sender ID, etc.) → Save."},
            {"q": "How do I upload the school logo?", "a": "Go to Settings → School Settings → click the logo upload area → select an image (max 2MB) → Save."},
            {"q": "How do I add a new admin user?", "a": "Go to Settings → User Management (Super Admin only) → + Add User → fill email, name, role=admin, password → Save."},
        ],
    },
    "kb_chat": {
        "icon": "🤖",
        "title": "AI Assistant & Help Desk",
        "summary": "Chat assistant, support tickets, and notifications.",
        "content": (
            "## 🤖 AI Assistant & Help Desk — Complete Guide\n\n"
            "### Using the AI Chat Assistant\n"
            "1. Click the **robot icon** (💬) in the bottom-right corner of any page\n"
            "2. The chat window opens with a welcome message\n"
            "3. Type natural language queries like:\n"
            "   - `student details of KTSN20251` — view a student's full profile\n"
            "   - `attendance of KTSN20251 last 30 days` — check attendance\n"
            "   - `marks of KTSN20251` — view exam results\n"
            "   - `fees of KTSN20251` — check fee status and payments\n"
            "   - `staff details of EMP001` — view staff profile\n"
            "   - `staff attendance of EMP001 last 30 days` — check staff attendance\n"
            "4. Click **suggestion chips** for quick queries\n\n"
            "### Raising a Support Ticket\n"
            "1. Type `help` in the chat\n"
            "2. Click **Technical Help**\n"
            "3. Click **Raise a Ticket**\n"
            "4. Fill in: Title, Description, Category (bug/feature/general), Priority\n"
            "5. Submit — the dev team is notified via email\n\n"
            "### Notifications (Bell Icon)\n"
            "1. Click the **bell icon** (🔔) in the top navigation bar\n"
            "2. View notifications about new tickets, updates, etc.\n"
            "3. Unread count is shown as a badge on the bell\n\n"
            "### Quick Commands\n"
            "| Command | What It Does |\n"
            "|---------|-------------|\n"
            "| `help` | Show help menu |\n"
            "| `know your app` | Application guide (this!) |\n"
            "| `student details of <id>` | View student profile |\n"
            "| `attendance of <id>` | Check attendance |\n"
            "| `marks of <id>` | View exam results |\n"
            "| `fees of <id>` | Check fee status |\n"
            "| `staff details of <name>` | View staff profile |\n\n"
            "---\n"
            "💡 **Tip:** You can use student names or admission numbers interchangeably in queries!"
        ),
        "faq": [
            {"q": "How do I open the chat assistant?", "a": "Click the robot icon (💬) in the bottom-right corner of any page."},
            {"q": "What can the AI assistant do?", "a": "It can look up student details, attendance, marks, fees, staff info, and let you raise support tickets."},
            {"q": "How do I raise a support ticket?", "a": "Type 'help' → click Technical Help → click Raise a Ticket → fill the form → Submit."},
            {"q": "Can I search by student name?", "a": "Yes! Just type the name (e.g., 'find Ravi') and the assistant will search for matching students."},
        ],
    },
}


def tool_know_your_app() -> ChatResponse:
    """Tool: Show the Know Your App main menu with all feature categories."""
    categories = []
    for key, kb in KNOWLEDGE_BASE.items():
        categories.append({
            "key": key,
            "icon": kb["icon"],
            "title": kb["title"],
            "summary": kb["summary"],
        })

    return ChatResponse(
        reply=(
            "## 📚 Know Your App\n\n"
            "Welcome to the **School ERP Application Guide**! "
            "Select a topic below to learn how to use each feature step-by-step.\n\n"
            "Each section includes detailed instructions, examples, and frequently asked questions."
        ),
        tool_used="know_your_app",
        data={"card_type": "know_your_app", "categories": categories},
        suggestions=[
            "🎓 Student Management",
            "📋 Attendance Management",
            "📝 Examination & Results",
            "💰 Fee Management",
        ]
    )


def tool_kb_category(category_key: str) -> ChatResponse:
    """Tool: Show detailed knowledge base content for a specific category."""
    kb = KNOWLEDGE_BASE.get(category_key)
    if not kb:
        return tool_know_your_app()

    return ChatResponse(
        reply=kb["content"],
        tool_used="know_your_app",
        data={
            "card_type": "kb_detail",
            "key": category_key,
            "icon": kb["icon"],
            "title": kb["title"],
            "faq": kb.get("faq", []),
        },
        suggestions=[
            "Know Your App",
            "help",
        ]
    )


# ==================== ENDPOINT ====================

@router.post("/message", response_model=ChatResponse)
def chat_message(body: ChatMessage, db: Session = Depends(get_db)):
    """
    MCP-inspired chat endpoint.

    1. Parse the user's message to detect intent
    2. Route to the appropriate internal tool
    3. Execute the database query
    4. Return a formatted response
    """
    intent = detect_intent(body.message)

    if intent.tool == "student_details":
        return tool_student_details(db, intent.params["identifier"])
    elif intent.tool == "attendance_history":
        return tool_attendance_history(db, intent.params["identifier"], intent.params.get("days", 30))
    elif intent.tool == "marks_details":
        return tool_marks_details(db, intent.params["identifier"])
    elif intent.tool == "fee_details":
        return tool_fee_details(db, intent.params["identifier"])
    elif intent.tool == "staff_details":
        return tool_staff_details(db, intent.params["identifier"])
    elif intent.tool == "staff_attendance":
        return tool_staff_attendance(db, intent.params["identifier"], intent.params.get("days", 30))
    elif intent.tool == "attendance_count":
        return tool_attendance_count(
            db,
            who=intent.params.get("who", "both"),
            status=intent.params.get("status", "all"),
        )
    elif intent.tool == "fee_collected":
        return tool_fee_collected(
            db,
            period=intent.params.get("period", "today"),
            months_back=intent.params.get("months_back", 0),
            want_list=intent.params.get("want_list", False),
        )
    elif intent.tool == "fee_pending":
        return tool_fee_pending(
            db,
            period=intent.params.get("period", "academic_year"),
            months_back=intent.params.get("months_back", 0),
            want_list=intent.params.get("want_list", True),
        )
    elif intent.tool == "small_talk":
        return tool_small_talk(intent.params.get("type", "greeting"), intent.params.get("original", ""))
    elif intent.tool == "help_menu":
        return tool_help_menu()
    elif intent.tool == "student_help":
        return tool_student_help()
    elif intent.tool == "staff_help":
        return tool_staff_help()
    elif intent.tool == "raise_ticket":
        return tool_raise_ticket()
    elif intent.tool == "know_your_app":
        return tool_know_your_app()
    elif intent.tool.startswith("kb_"):
        return tool_kb_category(intent.tool)
    else:
        return tool_help_menu()
