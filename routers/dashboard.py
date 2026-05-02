from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, case, literal
from typing import Optional, List
from datetime import date, datetime, timedelta
from database import get_db
from models import (
    Student, Class, User, Role, AcademicYear, ClassSection, ClassName, Section,
    AttendanceLog, Subject, ExamType, StudentExamMark, SubjectClassSection,
    FeePayment, FeeStructure, Staff, Department, GradeCriteria, ClassTeacherMapping
)
from auth import get_current_user
import pandas as pd
import numpy as np
from utils.performance import aggregate_attendance_bulk, calculate_fee_aggregations

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", summary="Get Dashboard Statistics")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive dashboard statistics including:
    - Student counts (total, active, by gender)
    - Class/section counts
    - Attendance stats for today
    - Academic year info
    - Recent activity
    """
    today = date.today()

    # ==================== COMBINED STUDENT STATS (single query) ====================
    student_stats = db.query(
        func.count(Student.id).label("total"),
        func.sum(case((Student.gender.ilike("male"), 1), else_=0)).label("male"),
        func.sum(case((Student.gender.ilike("female"), 1), else_=0)).label("female"),
        func.sum(case(
            (and_(
                func.month(Student.created_at) == today.month,
                func.year(Student.created_at) == today.year
            ), 1),
            else_=0
        )).label("new_this_month"),
    ).filter(Student.is_active == True).first()

    total_students = student_stats.total or 0
    male_students = student_stats.male or 0
    female_students = student_stats.female or 0
    new_admissions_this_month = student_stats.new_this_month or 0

    # ==================== COMBINED ACADEMIC STATS (single query) ====================
    academic_stats = db.query(
        func.sum(case((literal(1) == 1, 1), else_=0)).label("dummy")  # placeholder
    ).first()

    # These are cheap count queries - run them together conceptually
    total_classes = db.query(func.count(ClassName.id)).filter(ClassName.is_active == True).scalar() or 0
    total_sections = db.query(func.count(Section.id)).filter(Section.is_active == True).scalar() or 0
    total_class_sections = db.query(func.count(ClassSection.id)).filter(ClassSection.is_active == True).scalar() or 0
    total_subjects = db.query(func.count(Subject.id)).filter(Subject.is_active == True).scalar() or 0
    total_exams = db.query(func.count(ExamType.id)).filter(ExamType.is_active == True).scalar() or 0

    # ==================== STAFF STATS (from staff table) ====================
    total_staff = db.query(func.count(Staff.id)).filter(Staff.is_active == True).scalar() or 0

    # Teachers = staff whose department name is "Teaching"
    total_teachers = db.query(func.count(Staff.id)).join(Department).filter(
        Staff.is_active == True,
        func.lower(Department.name).like("%teaching%")
    ).scalar() or 0

    # ==================== ATTENDANCE TODAY (aggregate - NO .all()) ====================
    attendance_agg = db.query(
        func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label("present"),
        func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label("absent"),
        func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label("late"),
        func.count(func.distinct(AttendanceLog.student_id)).label("marked_count"),
    ).filter(
        AttendanceLog.attendance_date == today
    ).first()

    present_only_today = attendance_agg.present or 0
    absent_marked_today = attendance_agg.absent or 0
    late_today = attendance_agg.late or 0
    present_today = present_only_today + late_today  # late counts as present (consistent with attendance summary)
    marked_count = attendance_agg.marked_count or 0
    not_marked_today = max(0, total_students - marked_count)
    absent_today = absent_marked_today + not_marked_today  # not marked = absent (consistent with attendance summary)

    attendance_percentage = round(
        (present_today / total_students * 100) if total_students > 0 else 0, 1
    )

    # ==================== ATTENDANCE TREND (Last 7 days) ====================
    # AttendanceLog can hold multiple rows per student per day (every swipe).
    # Use DISTINCT student_id per status so duplicate punches don't inflate
    # totals. Mirror "today" logic: late counts as present, and any unmarked
    # active student is treated as absent.
    seven_days_ago = today - timedelta(days=6)
    weekly_attendance = db.query(
        AttendanceLog.attendance_date,
        func.count(func.distinct(case(
            (AttendanceLog.status == "present", AttendanceLog.student_id)
        ))).label("present"),
        func.count(func.distinct(case(
            (AttendanceLog.status == "absent", AttendanceLog.student_id)
        ))).label("absent"),
        func.count(func.distinct(case(
            (AttendanceLog.status == "late", AttendanceLog.student_id)
        ))).label("late"),
        func.count(func.distinct(AttendanceLog.student_id)).label("marked"),
    ).filter(
        AttendanceLog.attendance_date >= seven_days_ago,
        AttendanceLog.attendance_date <= today,
    ).group_by(AttendanceLog.attendance_date).all()

    by_date = {r.attendance_date: r for r in weekly_attendance}
    attendance_trend = []
    for i in range(7):
        d = seven_days_ago + timedelta(days=i)
        r = by_date.get(d)
        present_d = (r.present if r else 0) + (r.late if r else 0)
        absent_marked = r.absent if r else 0
        marked = r.marked if r else 0
        not_marked = max(0, total_students - marked) if d <= today else 0
        # For future dates inside the window (shouldn't normally happen here),
        # don't auto-fill absentees.
        absent_d = absent_marked + not_marked
        attendance_trend.append({
            "date": d.isoformat(),
            "day": d.strftime("%a"),
            "present": present_d,
            "absent": absent_d,
            "late": r.late if r else 0,
            "total": total_students,
        })

    # ==================== ACADEMIC YEAR ====================
    current_academic_year = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    academic_year_info = None
    if current_academic_year:
        academic_year_info = {
            "id": current_academic_year.id,
            "name": current_academic_year.name,
            "start_date": current_academic_year.start_date.isoformat() if current_academic_year.start_date else None,
            "end_date": current_academic_year.end_date.isoformat() if current_academic_year.end_date else None
        }

    # ==================== CLASS-WISE STUDENT DISTRIBUTION ====================
    class_distribution = db.query(
        Class.class_name,
        func.count(Student.id).label("count")
    ).join(Student, Student.class_id == Class.id).filter(
        Student.is_active == True
    ).group_by(Class.class_name).order_by(Class.class_name).all()

    # Build class teacher lookup: class_name -> list of "section: Teacher Name"
    class_teacher_rows = db.query(
        ClassTeacherMapping, ClassSection, ClassName, Section, Staff
    ).join(ClassSection, ClassTeacherMapping.class_section_id == ClassSection.id
    ).join(ClassName, ClassSection.class_name_id == ClassName.id
    ).join(Section, ClassSection.section_id == Section.id
    ).join(Staff, ClassTeacherMapping.staff_id == Staff.id).all()

    # Group by class_name: { "Class 1": ["Lily: Arun Kumar", "Rose: Priya S"] }
    teacher_by_class: dict = {}
    for row in class_teacher_rows:
        ctm, cs, cn, sec, s = row
        class_name = cn.name
        teacher_name = f"{s.first_name} {s.last_name or ''}".strip()
        entry = f"{sec.name}: {teacher_name}"
        teacher_by_class.setdefault(class_name, []).append(entry)

    class_wise_students = [
        {
            "class_name": row.class_name,
            "count": row.count,
            "class_teachers": teacher_by_class.get(row.class_name, []),
        }
        for row in class_distribution
    ]

    # ==================== GENDER DISTRIBUTION ====================
    gender_distribution = [
        {"label": "Male", "value": male_students, "color": "#4F46E5"},
        {"label": "Female", "value": female_students, "color": "#EC4899"},
        {"label": "Other", "value": max(0, total_students - male_students - female_students), "color": "#F59E0B"}
    ]

    # ==================== RECENT STUDENTS ====================
    recent_students = db.query(
        Student.id, Student.first_name, Student.surname,
        Student.admission_number, Student.created_at
    ).filter(Student.is_active == True).order_by(
        Student.created_at.desc()
    ).limit(5).all()

    recent_student_list = [
        {
            "id": s.id,
            "name": f"{s.first_name} {s.surname or ''}".strip(),
            "admission_number": s.admission_number,
            "created_at": s.created_at.isoformat() if s.created_at else None
        }
        for s in recent_students
    ]

    # ==================== FEE STATS ====================
    fee_collected_today = 0
    fee_collected_year = 0
    fee_total_expected = 0
    try:
        # Collected today
        fee_collected_today = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
            FeePayment.status == "completed",
            FeePayment.payment_date >= datetime.combine(today, datetime.min.time()),
            FeePayment.payment_date < datetime.combine(today + timedelta(days=1), datetime.min.time()),
        ).scalar() or 0

        # Collected this academic year
        if current_academic_year:
            fee_collected_year = db.query(func.coalesce(func.sum(FeePayment.amount_paid), 0)).filter(
                FeePayment.status == "completed",
                FeePayment.academic_year_id == current_academic_year.id,
            ).scalar() or 0

            # Total expected
            structures = db.query(FeeStructure).filter(
                FeeStructure.academic_year_id == current_academic_year.id,
                FeeStructure.is_active == True,
            ).all()
            for s in structures:
                cn = db.query(ClassName.name).filter(ClassName.id == s.class_name_id).scalar()
                if cn:
                    sc = db.query(func.count(Student.id)).join(
                        Class, Student.class_id == Class.id
                    ).filter(
                        Student.is_active == True,
                        Class.class_name.ilike(f"%{cn}%")
                    ).scalar() or 0
                    fee_total_expected += s.amount * sc
    except Exception:
        pass  # Fail silently for dashboard

    fee_pending = max(0, fee_total_expected - fee_collected_year)

    return {
        "students": {
            "total": total_students,
            "male": male_students,
            "female": female_students,
            "new_this_month": new_admissions_this_month
        },
        "staff": {
            "teachers": total_teachers,
            "total_staff": total_staff
        },
        "academics": {
            "classes": total_classes,
            "sections": total_sections,
            "class_sections": total_class_sections,
            "subjects": total_subjects,
            "exams": total_exams,
            "academic_year": academic_year_info
        },
        "attendance": {
            "today": {
                "present": present_today,
                "absent": absent_today,
                "late": late_today,
                "not_marked": not_marked_today,
                "total_students": total_students,
                "percentage": attendance_percentage
            },
            "trend": attendance_trend
        },
        "fees": {
            "collected_today": float(fee_collected_today),
            "collected_this_year": float(fee_collected_year),
            "pending_this_year": float(fee_pending),
            "total_expected": float(fee_total_expected)
        },
        "charts": {
            "class_wise_students": class_wise_students,
            "gender_distribution": gender_distribution
        },
        "recent_students": recent_student_list,
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/parent", summary="Get Parent Dashboard")
async def get_parent_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Dashboard for parent users - returns data for students linked to their mobile number.
    Shows: student info, attendance, fees, recent exam results.
    """
    today = date.today()

    # Find students linked to this user via user_id OR mobile_number matching user's phone
    students = db.query(Student).filter(
        Student.is_active == True,
        (Student.user_id == current_user.id) | (Student.mobile_number == current_user.phone)
    ).all()

    if not students:
        return {
            "students": [],
            "message": "No students linked to this account"
        }

    student_ids = [s.id for s in students]

    # Build student details with attendance and fee info
    student_list = []
    total_fees_pending = 0

    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()

    for student in students:
        # Class info
        class_name = ""
        if student.class_info:
            class_name = student.class_info.name

        # Attendance stats for this student (current month)
        first_of_month = today.replace(day=1)
        att_stats = db.query(
            func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label("present"),
            func.sum(case((AttendanceLog.status == "absent", 1), else_=0)).label("absent"),
            func.sum(case((AttendanceLog.status == "late", 1), else_=0)).label("late"),
            func.count(AttendanceLog.id).label("total"),
        ).filter(
            AttendanceLog.student_id == student.id,
            AttendanceLog.attendance_date >= first_of_month,
            AttendanceLog.attendance_date <= today
        ).first()

        present = att_stats.present or 0
        absent = att_stats.absent or 0
        late = att_stats.late or 0
        total_days = att_stats.total or 0
        att_percentage = round((present / total_days * 100) if total_days > 0 else 0, 1)

        # Today's attendance
        today_att = db.query(AttendanceLog.status).filter(
            AttendanceLog.student_id == student.id,
            AttendanceLog.attendance_date == today
        ).first()
        today_status = today_att.status if today_att else "not_marked"

        # Fee info for this student
        student_fees_paid = 0
        student_fees_total = 0
        if current_ay:
            student_fees_paid = db.query(
                func.coalesce(func.sum(FeePayment.amount_paid), 0)
            ).filter(
                FeePayment.student_id == student.id,
                FeePayment.academic_year_id == current_ay.id,
                FeePayment.status == "completed"
            ).scalar() or 0

            # Get fee structure for this student's class
            if student.class_info:
                class_name_obj = db.query(ClassName).filter(
                    ClassName.name.ilike(f"%{student.class_info.class_name}%")
                ).first()
                if class_name_obj:
                    fee_structures = db.query(FeeStructure).filter(
                        FeeStructure.academic_year_id == current_ay.id,
                        FeeStructure.class_name_id == class_name_obj.id,
                        FeeStructure.is_active == True
                    ).all()
                    student_fees_total = sum(fs.amount for fs in fee_structures)

        fees_pending = max(0, float(student_fees_total) - float(student_fees_paid))
        total_fees_pending += fees_pending

        # Recent exam results
        recent_marks = db.query(
            StudentExamMark, ExamType.name.label("exam_name"),
            Subject.name.label("subject_name")
        ).join(ExamType, StudentExamMark.exam_type_id == ExamType.id).join(
            Subject, StudentExamMark.subject_id == Subject.id
        ).filter(
            StudentExamMark.student_id == student.id
        ).order_by(StudentExamMark.id.desc()).limit(5).all()

        exam_results = []
        for mark, exam_name, subject_name in recent_marks:
            percentage = round((mark.marks_obtained / mark.max_marks * 100) if mark.max_marks > 0 else 0, 1)
            grade, _ = _get_grade_for_percentage(db, percentage)
            exam_results.append({
                "exam": exam_name,
                "subject": subject_name,
                "marks": mark.marks_obtained,
                "max_marks": mark.max_marks,
                "percentage": percentage,
                "grade": grade,
            })

        student_list.append({
            "id": student.id,
            "name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class": class_name,
            "photo_thumbnail": student.photo_thumbnail,
            "attendance": {
                "today": today_status,
                "month_present": present,
                "month_absent": absent,
                "month_late": late,
                "month_total": total_days,
                "percentage": att_percentage,
            },
            "fees": {
                "total": float(student_fees_total),
                "paid": float(student_fees_paid),
                "pending": fees_pending,
            },
            "recent_results": exam_results,
        })

    return {
        "students": student_list,
        "total_fees_pending": total_fees_pending,
        "generated_at": datetime.utcnow().isoformat(),
    }


def _get_grade_for_percentage(db: Session, percentage: float):
    """Get grade info based on percentage."""
    grade = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True,
        GradeCriteria.min_percentage <= percentage,
        GradeCriteria.max_percentage >= percentage
    ).order_by(GradeCriteria.display_order).first()
    if grade:
        return grade.grade, grade.grade_point or 0
    return "FAIL", 0


@router.get("/class-topper-exams", summary="Get exams that have marks")
async def get_class_topper_exams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Return exam types that have marks in the current academic year."""
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        return []

    exam_ids = (
        db.query(StudentExamMark.exam_type_id)
        .filter(StudentExamMark.academic_year_id == current_ay.id)
        .distinct()
        .all()
    )
    exam_ids = [r[0] for r in exam_ids if r[0]]
    if not exam_ids:
        return []

    exams = db.query(ExamType).filter(ExamType.id.in_(exam_ids)).order_by(ExamType.id).all()
    return [{"id": e.id, "name": e.name} for e in exams]


@router.get("/class-toppers", summary="Get Class Toppers per Section")
async def get_class_toppers(
    exam_type_id: Optional[int] = Query(None, description="Filter by exam type. Uses latest exam if omitted."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    For every active class-section that has exam marks in the current academic
    year, return the rank-1 student with their CGPA, grade and attendance %.
    """
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_ay:
        return []

    # Resolve the exam type
    if exam_type_id:
        target_exam = db.query(ExamType).filter(ExamType.id == exam_type_id).first()
    else:
        target_exam = (
            db.query(ExamType)
            .join(StudentExamMark, StudentExamMark.exam_type_id == ExamType.id)
            .filter(StudentExamMark.academic_year_id == current_ay.id)
            .order_by(ExamType.id.desc())
            .first()
        )
    if not target_exam:
        return []

    # Get all class_section_ids that have marks for this exam
    cs_ids = (
        db.query(StudentExamMark.class_section_id)
        .filter(
            StudentExamMark.exam_type_id == target_exam.id,
            StudentExamMark.academic_year_id == current_ay.id,
            StudentExamMark.class_section_id.isnot(None),
        )
        .distinct()
        .all()
    )
    cs_ids = [r[0] for r in cs_ids]
    if not cs_ids:
        return []

    # Load class-section labels
    cs_map = {}
    class_sections = (
        db.query(ClassSection)
        .options(joinedload(ClassSection.class_name), joinedload(ClassSection.section))
        .filter(ClassSection.id.in_(cs_ids), ClassSection.is_active == True)
        .all()
    )
    for cs in class_sections:
        cn = cs.class_name.name if cs.class_name else ""
        sn = cs.section.name if cs.section else ""
        cs_map[cs.id] = f"{cn} - {sn}"

    today = date.today()
    results: List[dict] = []

    for cs_id in cs_ids:
        label = cs_map.get(cs_id)
        if not label:
            continue

        cn_part, sn_part = label.split(" - ", 1) if " - " in label else (label, "")

        # Get all marks for this class-section / exam / academic year
        marks = (
            db.query(
                StudentExamMark.student_id,
                func.sum(
                    case(
                        (and_(StudentExamMark.is_absent == False, StudentExamMark.marks_obtained.isnot(None)),
                         StudentExamMark.marks_obtained),
                        else_=literal(0),
                    )
                ).label("total_marks"),
                func.sum(StudentExamMark.max_marks).label("total_max"),
            )
            .filter(
                StudentExamMark.exam_type_id == target_exam.id,
                StudentExamMark.academic_year_id == current_ay.id,
                StudentExamMark.class_section_id == cs_id,
            )
            .group_by(StudentExamMark.student_id)
            .all()
        )
        if not marks:
            continue

        # Find the student with the highest percentage
        best = max(marks, key=lambda r: (r.total_marks / r.total_max * 100) if r.total_max else 0)
        best_pct = (best.total_marks / best.total_max * 100) if best.total_max else 0

        # Per-subject grade points for GPA
        subj_marks = (
            db.query(StudentExamMark)
            .filter(
                StudentExamMark.student_id == best.student_id,
                StudentExamMark.exam_type_id == target_exam.id,
                StudentExamMark.academic_year_id == current_ay.id,
                StudentExamMark.class_section_id == cs_id,
            )
            .all()
        )
        total_gp = 0
        subj_count = 0
        for sm in subj_marks:
            if sm.marks_obtained is not None and not sm.is_absent and sm.max_marks:
                pct = sm.marks_obtained / sm.max_marks * 100
                _, gp = _get_grade_for_percentage(db, pct)
                total_gp += gp
                subj_count += 1

        cgpa = round(total_gp / subj_count, 1) if subj_count else 0
        cg_label, _ = _get_grade_for_percentage(db, best_pct) if best_pct else ("—", 0)

        # Student name
        student = db.query(Student.first_name, Student.surname).filter(Student.id == best.student_id).first()
        student_name = f"{student.first_name} {student.surname or ''}".strip() if student else "—"

        # Attendance percentage (current academic year)
        att_agg = (
            db.query(
                func.count(AttendanceLog.id).label("total"),
                func.sum(case((AttendanceLog.status == "present", 1), else_=0)).label("present"),
            )
            .join(Student, AttendanceLog.student_id == Student.id)
            .join(Class, Student.class_id == Class.id)
            .filter(
                AttendanceLog.student_id == best.student_id,
                AttendanceLog.attendance_date >= (current_ay.start_date or today.replace(month=6, day=1)),
            )
            .first()
        )

        att_total = att_agg.total or 0 if att_agg else 0
        att_present = att_agg.present or 0 if att_agg else 0
        att_pct = round(att_present / att_total * 100, 1) if att_total > 0 else 0

        results.append({
            "class_section": label,
            "student_name": student_name,
            "cgpa": cgpa,
            "cg": cg_label,
            "attendance_percentage": att_pct,
        })

    # Sort by class name naturally
    def _sort_key(item):
        import re
        m = re.search(r"\d+", item["class_section"])
        return (int(m.group()) if m else 0, item["class_section"])

    results.sort(key=_sort_key)
    return results
