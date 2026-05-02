from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import List, Optional
from database import get_db
from models import (
    StudentExamMark, Student, Subject, ExamType, AcademicYear,
    ClassSection, ClassName, Section, SubjectClassSection, Class,
    GradeCriteria, StudentExamAttendance, User,
    ExaminationSchedule, ExaminationScheduleClassSection, ExaminationScheduleSubject
)
from auth import get_current_user, require_role
from pydantic import BaseModel
import pandas as pd
import numpy as np
from utils.performance import calculate_marks_statistics, bulk_percentage_calculation

router = APIRouter(prefix="/api/reports", tags=["Reports"])


# ========== Schemas ==========

class AnnualReportLevelRow(BaseModel):
    level_name: str
    exam_names: List[str]
    average_value: Optional[float] = None
    grade: Optional[str] = None
    grade_point: Optional[int] = None
    weightage_pct: int = 0

class AnnualAttendanceMonth(BaseModel):
    month: int
    year: int
    month_name: str
    total_working_days: int = 0
    present_days: int = 0

class AnnualSubjectPerformance(BaseModel):
    subject_name: str
    student_marks: Optional[float] = None
    max_marks: float = 0
    pass_marks: float = 35
    class_topper: float = 0
    class_average: float = 0

class AnnualSubjectWiseMark(BaseModel):
    subject_name: str
    fa_marks: Optional[float] = None   # (FA1+FA2+FA3+FA4) / 12
    fa_max: float = 0
    sa1_marks: Optional[float] = None  # SA1 / 4
    sa1_max: float = 0
    sa2_marks: Optional[float] = None  # SA2 / 2
    sa2_max: float = 0
    total_marks: Optional[float] = None
    total_max: float = 0
    teacher_remarks: Optional[str] = None

class AnnualReportStudent(BaseModel):
    student_id: int
    student_name: str
    admission_number: str
    father_name: str
    photo_thumbnail: Optional[str] = None
    photo_data: Optional[str] = None
    class_name: str
    section_name: str
    levels: List[AnnualReportLevelRow]
    total_average: Optional[float] = None
    total_grade: Optional[str] = None
    total_grade_point: Optional[int] = None
    cg: Optional[str] = None
    cgpa: Optional[float] = None
    attendance_working_days: int = 0
    attendance_present_days: int = 0
    attendance_percentage: float = 0.0
    attendance_monthly: List[AnnualAttendanceMonth] = []
    subject_performance: List[AnnualSubjectPerformance] = []
    subject_wise_marks: List[AnnualSubjectWiseMark] = []
    class_rank: Optional[int] = None
    total_students: Optional[int] = None
    remarks: str = ""

class AnnualReportResponse(BaseModel):
    academic_year: Optional[str] = None
    class_name: str
    section_name: str
    grade_scale: list
    students: List[AnnualReportStudent]

class ExamTypeSummary(BaseModel):
    id: int
    name: str

class AnnualReportConfigResponse(BaseModel):
    exam_types: List[ExamTypeSummary]
    class_sections: list

class LevelConfig(BaseModel):
    level_name: str
    exam_type_ids: List[int]
    weightage_pct: int

class AnnualReportRequest(BaseModel):
    academic_year_id: int
    class_section_id: int
    student_id: Optional[int] = None
    levels: List[LevelConfig]


# ========== Helper ==========

def get_grade_for_percentage(db: Session, percentage: float):
    grade = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True,
        GradeCriteria.min_percentage <= percentage,
        GradeCriteria.max_percentage >= percentage
    ).order_by(GradeCriteria.display_order).first()
    if grade:
        return {
            "grade": grade.grade,
            "grade_point": grade.grade_point or 0,
            "teacher_remarks": grade.teacher_remarks or ""
        }
    return {"grade": "FAIL", "grade_point": 0, "teacher_remarks": "Keep trying"}


# ========== Endpoints ==========

@router.get("/annual-report/config")
async def get_annual_report_config(
    academic_year_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get available exam types and class sections for annual report configuration."""
    exam_types = db.query(ExamType).filter(
        ExamType.academic_year_id == academic_year_id,
        ExamType.is_active == True
    ).order_by(ExamType.display_order, ExamType.name).all()

    # Get class sections that have marks for this academic year
    cs_ids = db.query(StudentExamMark.class_section_id).filter(
        StudentExamMark.academic_year_id == academic_year_id
    ).distinct().all()
    cs_ids = [c[0] for c in cs_ids if c[0]]

    class_sections = []
    for cs in db.query(ClassSection).options(
        joinedload(ClassSection.class_name), joinedload(ClassSection.section)
    ).filter(ClassSection.id.in_(cs_ids)).all():
        class_sections.append({
            "id": cs.id,
            "class_name": cs.class_name.name if cs.class_name else "",
            "section_name": cs.section.name if cs.section else "",
            "display": f"{cs.class_name.name if cs.class_name else ''} - {cs.section.name if cs.section else ''}"
        })

    return {
        "exam_types": [{"id": e.id, "name": e.name} for e in exam_types],
        "class_sections": class_sections
    }


@router.get("/annual-report/students")
async def get_students_for_report(
    class_section_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get students for a given class section."""
    cs = db.query(ClassSection).options(
        joinedload(ClassSection.class_name), joinedload(ClassSection.section)
    ).filter(ClassSection.id == class_section_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    cn = cs.class_name.name if cs.class_name else ""
    sn = cs.section.name if cs.section else ""

    students = db.query(Student).join(Class).filter(
        Class.class_name == cn, Class.section_name == sn, Student.is_active == True
    ).order_by(Student.first_name).all()

    return [
        {"id": s.id, "name": f"{s.first_name} {s.surname or ''}".strip(),
         "admission_number": s.admission_number or ""}
        for s in students
    ]


@router.post("/annual-report/generate")
async def generate_annual_report(
    req: AnnualReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate Annual Report for student(s).
    Levels define test groupings with exam_type_ids and weightage percentages.
    For each level, we average marks across the selected exam types,
    then compute weighted total.
    """
    # Validate
    ay = db.query(AcademicYear).filter(AcademicYear.id == req.academic_year_id).first()
    if not ay:
        raise HTTPException(status_code=404, detail="Academic year not found")

    cs = db.query(ClassSection).options(
        joinedload(ClassSection.class_name), joinedload(ClassSection.section)
    ).filter(ClassSection.id == req.class_section_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    cn = cs.class_name.name if cs.class_name else ""
    sn = cs.section.name if cs.section else ""

    # Get students
    student_query = db.query(Student).join(Class).filter(
        Class.class_name == cn, Class.section_name == sn, Student.is_active == True
    )
    if req.student_id:
        student_query = student_query.filter(Student.id == req.student_id)
    students = student_query.order_by(Student.first_name).all()

    if not students:
        raise HTTPException(status_code=404, detail="No students found")

    student_ids = [s.id for s in students]

    # Get all exam type ids across all levels
    all_exam_ids = []
    for level in req.levels:
        all_exam_ids.extend(level.exam_type_ids)
    all_exam_ids = list(set(all_exam_ids))

    # Get exam type names
    exam_types = {e.id: e.name for e in db.query(ExamType).filter(ExamType.id.in_(all_exam_ids)).all()}


    # --- Subject ordering: match SA2 exam order if possible ---
    schedule_subject_ids = set()
    schedule_subject_names = {}
    sa2_subject_order = []
    sa2_exam_type_id = None
    # Try to find SA2 exam_type_id from levels (usually 3rd level)
    if len(req.levels) >= 3:
        sa2_exam_type_ids = req.levels[2].exam_type_ids
        if sa2_exam_type_ids:
            sa2_exam_type_id = sa2_exam_type_ids[0]

    # Collect all subjects from all exam schedules for the selected exam types and class section
    for eid in all_exam_ids:
        es = db.query(ExaminationSchedule).join(
            ExaminationScheduleClassSection,
            ExaminationSchedule.id == ExaminationScheduleClassSection.examination_schedule_id
        ).filter(
            ExaminationSchedule.exam_type_id == eid,
            ExaminationScheduleClassSection.class_section_id == req.class_section_id,
            ExaminationSchedule.is_active == True,
            ExaminationSchedule.academic_year_id == req.academic_year_id,
        ).order_by(
            ExaminationSchedule.from_date.desc(),
            ExaminationSchedule.created_at.desc()
        ).first()
        if es:
            # If this is the SA2 schedule, record subject order
            if eid == sa2_exam_type_id:
                sa2_subjects = db.query(ExaminationScheduleSubject).options(
                    joinedload(ExaminationScheduleSubject.subject)
                ).filter(
                    ExaminationScheduleSubject.examination_schedule_id == es.id
                ).order_by(ExaminationScheduleSubject.display_order, ExaminationScheduleSubject.id).all()
                sa2_subject_order = [ss.subject.id for ss in sa2_subjects if ss.subject and ss.subject.is_active]
            # Collect all subjects for all exams
            for ss in db.query(ExaminationScheduleSubject).options(
                joinedload(ExaminationScheduleSubject.subject)
            ).filter(
                ExaminationScheduleSubject.examination_schedule_id == es.id
            ).all():
                if ss.subject and ss.subject.is_active:
                    schedule_subject_ids.add(ss.subject.id)
                    schedule_subject_names[ss.subject.id] = ss.subject.name

    if schedule_subject_ids:
        # Use SA2 subject order if available, else default to sorted by name
        if sa2_subject_order:
            subject_ids = [sid for sid in sa2_subject_order if sid in schedule_subject_ids]
            # Add any extra subjects not in SA2 at the end (sorted by name)
            extra_ids = [sid for sid in schedule_subject_ids if sid not in sa2_subject_order]
            extra_ids_sorted = sorted(extra_ids, key=lambda x: schedule_subject_names.get(x, ""))
            subject_ids += extra_ids_sorted
        else:
            subject_ids = sorted(list(schedule_subject_ids), key=lambda x: schedule_subject_names.get(x, ""))
        subject_mappings = None  # not used below when we have schedule subjects
    else:
        # Fallback: use class-level subject mappings if no schedules exist
        subject_mappings = db.query(SubjectClassSection).options(
            joinedload(SubjectClassSection.subject)
        ).filter(
            SubjectClassSection.class_section_id == req.class_section_id,
            SubjectClassSection.is_active == True
        ).all()
        subject_ids = [m.subject.id for m in subject_mappings if m.subject and m.subject.is_active]

    # Fetch ALL marks for these students, exams, subjects
    all_marks = db.query(StudentExamMark).filter(
        StudentExamMark.student_id.in_(student_ids),
        StudentExamMark.exam_type_id.in_(all_exam_ids),
        StudentExamMark.class_section_id == req.class_section_id,
        StudentExamMark.academic_year_id == req.academic_year_id,
        StudentExamMark.subject_id.in_(subject_ids)
    ).all()

    # Organize: marks_dict[student_id][exam_type_id] = list of (marks_obtained, max_marks, is_absent)
    marks_dict: dict = {}
    # subject_exam_lookup[subject_id][student_id][exam_type_id] = (obtained_or_None, max_marks)
    subject_exam_lookup: dict = {}
    for m in all_marks:
        marks_dict.setdefault(m.student_id, {}).setdefault(m.exam_type_id, []).append(
            (m.marks_obtained, m.max_marks or 50, m.is_absent)
        )
        obt = m.marks_obtained if (m.marks_obtained is not None and not m.is_absent) else None
        subject_exam_lookup.setdefault(m.subject_id, {}).setdefault(m.student_id, {})[m.exam_type_id] = (
            obt, m.max_marks or 50
        )

    # Fetch attendance for ALL exam types for the year
    all_att = db.query(StudentExamAttendance).filter(
        StudentExamAttendance.student_id.in_(student_ids),
        StudentExamAttendance.class_section_id == req.class_section_id,
        StudentExamAttendance.academic_year_id == req.academic_year_id
    ).all()

    # Deduplicate attendance by student + month + year (take latest entry)
    att_dict: dict = {}
    for a in all_att:
        key = (a.student_id, a.month, a.year)
        att_dict[key] = a  # last wins

    # Build monthly attendance per student: att_monthly_by_student[sid][(month, year)] = {working, present}
    att_monthly_by_student: dict = {}
    for (sid, month, year), a in att_dict.items():
        att_monthly_by_student.setdefault(sid, {})
        att_monthly_by_student[sid][(month, year)] = {
            "working": a.total_working_days,
            "present": a.present_days,
        }

    # Determine the academic year range (Jun start_year to Apr end_year)
    MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    ACADEMIC_MONTHS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4]  # Jun-Apr

    # Parse academic year to get start/end years (e.g. "2025-2026")
    ay_start_year = None
    ay_end_year = None
    if ay.name and "-" in ay.name:
        parts = ay.name.split("-")
        try:
            ay_start_year = int(parts[0].strip())
            ay_end_year = int(parts[1].strip())
        except (ValueError, IndexError):
            pass
    if not ay_start_year:
        # Fallback: check attendance records for year values
        years_in_att = set()
        for (sid, month, year) in att_dict.keys():
            years_in_att.add(year)
        if years_in_att:
            ay_start_year = min(years_in_att)
            ay_end_year = max(years_in_att) if max(years_in_att) > ay_start_year else ay_start_year + 1
        else:
            from datetime import datetime as dt
            ay_start_year = dt.now().year
            ay_end_year = ay_start_year + 1

    # ===== SUBJECT PERFORMANCE: class topper & average across ALL exams =====
    # For each subject, aggregate marks across all exam types in all levels
    # marks_by_subject[subject_id][student_id] = {total_obtained, total_max}
    if schedule_subject_names:
        subject_names = schedule_subject_names
    else:
        subject_names = {m.subject.id: m.subject.name for m in subject_mappings if m.subject and m.subject.is_active}
    marks_by_subject: dict = {}
    subject_pass_marks: dict = {}
    for m in all_marks:
        marks_by_subject.setdefault(m.subject_id, {}).setdefault(m.student_id, {"obtained": 0.0, "max": 0.0})
        if m.marks_obtained is not None and not m.is_absent:
            marks_by_subject[m.subject_id][m.student_id]["obtained"] += m.marks_obtained
        marks_by_subject[m.subject_id][m.student_id]["max"] += (m.max_marks or 50)
        if m.subject_id not in subject_pass_marks and m.min_marks is not None:
            subject_pass_marks[m.subject_id] = m.min_marks

    # Compute per-subject stats: topper marks, class average
    subject_stats: dict = {}
    for subj_id in subject_ids:
        subj_data = marks_by_subject.get(subj_id, {})
        if subj_data:
            all_obtained = [v["obtained"] for v in subj_data.values()]
            total_max = max((v["max"] for v in subj_data.values()), default=50)
            subject_stats[subj_id] = {
                "topper": max(all_obtained) if all_obtained else 0,
                "average": round(sum(all_obtained) / len(all_obtained), 1) if all_obtained else 0,
                "max_marks": total_max,
            }
        else:
            subject_stats[subj_id] = {"topper": 0, "average": 0, "max_marks": 50}

    # Grade scale
    grade_criteria = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True
    ).order_by(GradeCriteria.display_order).all()

    grade_scale = [
        {"grade": g.grade, "range": f"{g.min_percentage} - {g.max_percentage}",
         "points": g.grade_point, "min_pct": g.min_percentage, "max_pct": g.max_percentage}
        for g in grade_criteria
    ]

    # Build report per student (first pass: compute levels + weighted total for ranking)
    student_report_data = []
    for student in students:
        sid = student.id
        student_name = f"{student.first_name} {student.surname or ''}".strip()
        student_marks = marks_dict.get(sid, {})

        levels_data = []
        weighted_sum = 0.0
        total_weight = 0

        for level in req.levels:
            exam_names = [exam_types.get(eid, f"Exam {eid}") for eid in level.exam_type_ids]

            # For each exam in this level, compute percentage, then average across exams
            exam_percentages = []
            for eid in level.exam_type_ids:
                marks_list = student_marks.get(eid, [])
                total_obt = 0.0
                total_max = 0.0
                for (obt, mx, absent) in marks_list:
                    if obt is not None and not absent:
                        total_obt += obt
                        total_max += mx
                    else:
                        total_max += mx
                if total_max > 0:
                    exam_percentages.append((total_obt / total_max) * 100)

            if exam_percentages:
                avg_pct = sum(exam_percentages) / len(exam_percentages)
                gi = get_grade_for_percentage(db, avg_pct)
                # Weighted contribution: (avg %) * (weightage / 100)
                weighted_sum += avg_pct * (level.weightage_pct / 100)
                total_weight += level.weightage_pct

                levels_data.append(AnnualReportLevelRow(
                    level_name=level.level_name,
                    exam_names=exam_names,
                    average_value=round(avg_pct, 1),
                    grade=gi["grade"],
                    grade_point=gi["grade_point"],
                    weightage_pct=level.weightage_pct
                ))
            else:
                levels_data.append(AnnualReportLevelRow(
                    level_name=level.level_name,
                    exam_names=exam_names,
                    average_value=None,
                    grade=None,
                    grade_point=None,
                    weightage_pct=level.weightage_pct
                ))

        # Total weighted percentage
        total_pct = weighted_sum if total_weight > 0 else None
        total_gi = get_grade_for_percentage(db, total_pct) if total_pct is not None else {"grade": None, "grade_point": None}

        # CGPA: average of grade points across levels that have values
        gp_list = [l.grade_point for l in levels_data if l.grade_point is not None]
        cgpa = round(sum(gp_list) / len(gp_list), 1) if gp_list else None

        # Monthly attendance (Jun-Apr)
        student_monthly = att_monthly_by_student.get(sid, {})
        attendance_monthly = []
        total_working = 0
        total_present = 0
        for m in ACADEMIC_MONTHS:
            yr = ay_start_year if m >= 6 else ay_end_year
            data = student_monthly.get((m, yr), {"working": 0, "present": 0})
            total_working += data["working"]
            total_present += data["present"]
            attendance_monthly.append(AnnualAttendanceMonth(
                month=m,
                year=yr,
                month_name=MONTH_SHORT[m],
                total_working_days=data["working"],
                present_days=data["present"],
            ))

        att_pct = round((total_present / total_working) * 100, 1) if total_working > 0 else 0.0

        # Subject performance
        subj_perf = []
        for subj_id in subject_ids:
            stats = subject_stats.get(subj_id, {"topper": 0, "average": 0, "max_marks": 50})
            student_subj = marks_by_subject.get(subj_id, {}).get(sid, None)
            subj_perf.append(AnnualSubjectPerformance(
                subject_name=subject_names.get(subj_id, f"Subject {subj_id}"),
                student_marks=round(student_subj["obtained"], 1) if student_subj else None,
                max_marks=stats["max_marks"],
                pass_marks=subject_pass_marks.get(subj_id, 35),
                class_topper=stats["topper"],
                class_average=stats["average"],
            ))

        # Subject-wise marks: FA (sum/12) + SA-1 (/4) + SA-2 (/2)
        LEVEL_DIVISORS = [12, 4, 2]
        sw_marks_list: List[AnnualSubjectWiseMark] = []
        print(f"DEBUG sw: sid={sid} subject_ids={subject_ids} levels={[l.exam_type_ids for l in req.levels[:3]]}")
        for subj_id in subject_ids:
            level_results = []
            for lev_idx, (level, divisor) in enumerate(zip(req.levels[:3], LEVEL_DIVISORS)):
                raw_obt = 0.0
                raw_max = 0.0
                for eid in level.exam_type_ids:
                    entry = subject_exam_lookup.get(subj_id, {}).get(sid, {}).get(eid)
                    if entry is not None:
                        obt, mx = entry
                        raw_max += mx
                        if obt is not None:
                            raw_obt += obt
                if raw_max > 0:
                    level_results.append((round(raw_obt / divisor, 2), round(raw_max / divisor, 2)))
                else:
                    level_results.append((None, 0.0))

            fa = level_results[0] if len(level_results) > 0 else (None, 0.0)
            sa1 = level_results[1] if len(level_results) > 1 else (None, 0.0)
            sa2 = level_results[2] if len(level_results) > 2 else (None, 0.0)

            # Round each level to integer first so displayed column values add up to displayed total
            non_none_rounded = [round(v) for v, _ in level_results if v is not None]
            total = sum(non_none_rounded) if non_none_rounded else None
            total_max = round(sum(mx for _, mx in level_results))

            # Calculate percentage for teacher remarks
            percentage = (total / total_max * 100) if (total is not None and total_max > 0) else 0
            grade_info = get_grade_for_percentage(db, percentage)
            sw_marks_list.append(AnnualSubjectWiseMark(
                subject_name=subject_names.get(subj_id, f"Subject {subj_id}"),
                fa_marks=fa[0], fa_max=fa[1],
                sa1_marks=sa1[0], sa1_max=sa1[1],
                sa2_marks=sa2[0], sa2_max=sa2[1],
                total_marks=total, total_max=total_max,
                teacher_remarks=grade_info["teacher_remarks"]
            ))

        print(f"DEBUG sw_marks_list len={len(sw_marks_list)}")
        student_report_data.append({
            "student": student,
            "student_name": student_name,
            "levels_data": levels_data,
            "total_pct": total_pct,
            "total_gi": total_gi,
            "cgpa": cgpa,
            "total_working": total_working,
            "total_present": total_present,
            "att_pct": att_pct,
            "attendance_monthly": attendance_monthly,
            "subj_perf": subj_perf,
            "sw_marks": sw_marks_list,
        })

    # Calculate class ranks based on total weighted percentage
    ranked = sorted(
        [(i, d["total_pct"] or 0.0) for i, d in enumerate(student_report_data)],
        key=lambda x: x[1], reverse=True
    )
    rank_map: dict = {}
    current_rank = 1
    prev_pct = None
    for pos, (idx, pct) in enumerate(ranked):
        if prev_pct is not None and pct < prev_pct:
            current_rank = pos + 1
        rank_map[idx] = current_rank
        prev_pct = pct

    total_students_count = len(students)

    # Build final response
    report_students = []
    for i, data in enumerate(student_report_data):
        student = data["student"]
        sid = student.id
        report_students.append(AnnualReportStudent(
            student_id=sid,
            student_name=data["student_name"],
            admission_number=student.admission_number or "",
            father_name=student.father_guardian_name or "",
            photo_thumbnail=student.photo_thumbnail,
            photo_data=student.photo_data,
            class_name=cn,
            section_name=sn,
            levels=data["levels_data"],
            total_average=round(data["total_pct"], 1) if data["total_pct"] is not None else None,
            total_grade=data["total_gi"]["grade"],
            total_grade_point=data["total_gi"]["grade_point"],
            cg=data["total_gi"]["grade"],
            cgpa=data["cgpa"],
            attendance_working_days=data["total_working"],
            attendance_present_days=data["total_present"],
            attendance_percentage=data["att_pct"],
            attendance_monthly=data["attendance_monthly"],
            subject_performance=data["subj_perf"],
            subject_wise_marks=data["sw_marks"],
            class_rank=rank_map.get(i),
            total_students=total_students_count,
            remarks=""
        ))

    return AnnualReportResponse(
        academic_year=ay.name,
        class_name=cn,
        section_name=sn,
        grade_scale=grade_scale,
        students=report_students
    )


# ==================== ASSESSMENT REPORT ====================

@router.get("/assessment-report/config", summary="Config options for assessment report")
async def get_assessment_report_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return class names, sections, and subjects available for the assessment report."""
    current_ay = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()

    class_names = (
        db.query(ClassName)
        .filter(ClassName.is_active == True)
        .order_by(ClassName.display_order, ClassName.name)
        .all()
    )
    sections = (
        db.query(Section)
        .filter(Section.is_active == True)
        .order_by(Section.display_order, Section.name)
        .all()
    )
    subjects = (
        db.query(Subject)
        .filter(Subject.is_active == True)
        .order_by(Subject.name)
        .all()
    )

    # Exam types for current academic year
    exam_types = []
    if current_ay:
        exam_types = (
            db.query(ExamType)
            .filter(ExamType.academic_year_id == current_ay.id, ExamType.is_active == True)
            .order_by(ExamType.display_order, ExamType.name)
            .all()
        )

    return {
        "class_names": [{"id": c.id, "name": c.name} for c in class_names],
        "sections": [{"id": s.id, "name": s.name} for s in sections],
        "subjects": [{"id": s.id, "name": s.name} for s in subjects],
        "exam_types": [{"id": e.id, "name": e.name} for e in exam_types],
        "academic_year_id": current_ay.id if current_ay else None,
    }


@router.get("/assessment-report", summary="Assessment Report - GPA wise student list")
async def get_assessment_report(
    class_name_id: int = Query(...),
    section_id: int = Query(...),
    exam_type_id: int = Query(...),
    subject_id: Optional[int] = Query(None, description="Optional subject filter; omit for overall"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return students grouped by GPA band for a given class-section and exam.
    Optionally filter by a single subject. If subject_id is omitted the overall
    average across all subjects is used.
    Also returns a list of failed students with their failed-subject details.
    """

    # Resolve class_section
    cs = (
        db.query(ClassSection)
        .options(joinedload(ClassSection.class_name), joinedload(ClassSection.section))
        .filter(
            ClassSection.class_name_id == class_name_id,
            ClassSection.section_id == section_id,
            ClassSection.is_active == True,
        )
        .first()
    )
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    cn = cs.class_name.name if cs.class_name else ""
    sn = cs.section.name if cs.section else ""

    # Students in this class-section
    students = (
        db.query(Student)
        .join(Class, Student.class_id == Class.id)
        .filter(
            Class.class_name == cn,
            Class.section_name == sn,
            Student.is_active == True,
        )
        .order_by(Student.first_name)
        .all()
    )
    if not students:
        return {"class_name": cn, "section_name": sn, "bands": [], "failed_students": []}

    student_ids = [s.id for s in students]
    student_map = {s.id: f"{s.first_name} {s.surname or ''}".strip() for s in students}
    admission_map = {s.id: s.admission_number or "" for s in students}

    # Load grade criteria (for GPA and pass/fail)
    grade_criteria = (
        db.query(GradeCriteria)
        .filter(GradeCriteria.is_active == True)
        .order_by(GradeCriteria.display_order)
        .all()
    )
    min_pass_pct = min((g.min_percentage for g in grade_criteria if (g.grade_point or 0) > 0), default=0)

    def _grade_info(pct: float):
        for g in grade_criteria:
            if g.min_percentage <= pct <= g.max_percentage:
                return g.grade, g.grade_point or 0
        return "FAIL", 0

    # Fetch marks
    marks_q = (
        db.query(StudentExamMark)
        .filter(
            StudentExamMark.student_id.in_(student_ids),
            StudentExamMark.exam_type_id == exam_type_id,
            StudentExamMark.class_section_id == cs.id,
        )
    )
    if subject_id:
        marks_q = marks_q.filter(StudentExamMark.subject_id == subject_id)
    all_marks = marks_q.all()

    if not all_marks:
        return {"class_name": cn, "section_name": sn, "bands": [], "failed_students": []}

    # Get subject names for the marks
    subject_ids_present = list({m.subject_id for m in all_marks})
    subj_names = {}
    for s in db.query(Subject).filter(Subject.id.in_(subject_ids_present)).all():
        subj_names[s.id] = s.name

    # Build per-student summary:
    # {student_id: {total_obtained, total_max, subject_details: [{name, obtained, max, pct, grade, gpa, is_fail}]}}
    student_data: dict = {}
    for m in all_marks:
        sid = m.student_id
        if sid not in student_data:
            student_data[sid] = {"total_obtained": 0.0, "total_max": 0.0, "subjects": []}
        obtained = m.marks_obtained if (m.marks_obtained is not None and not m.is_absent) else 0.0
        max_m = m.max_marks or 50
        pct = (obtained / max_m * 100) if max_m > 0 else 0
        grade, gp = _grade_info(pct)
        is_fail = pct < min_pass_pct
        student_data[sid]["total_obtained"] += obtained
        student_data[sid]["total_max"] += max_m
        student_data[sid]["subjects"].append({
            "subject_name": subj_names.get(m.subject_id, ""),
            "marks_obtained": obtained if not m.is_absent else None,
            "max_marks": max_m,
            "percentage": round(pct, 2),
            "grade": grade,
            "gpa": gp,
            "is_absent": bool(m.is_absent),
            "is_fail": is_fail,
        })

    # Compute per-student overall
    student_results = []
    for sid, d in student_data.items():
        overall_pct = (d["total_obtained"] / d["total_max"] * 100) if d["total_max"] > 0 else 0
        overall_grade, overall_gp = _grade_info(overall_pct)
        subj_count = len([s for s in d["subjects"] if s["marks_obtained"] is not None])
        cgpa = round(sum(s["gpa"] for s in d["subjects"]) / subj_count, 2) if subj_count > 0 else 0

        failed_subjects = [s["subject_name"] for s in d["subjects"] if s["is_fail"]]

        student_results.append({
            "student_id": sid,
            "student_name": student_map.get(sid, ""),
            "admission_number": admission_map.get(sid, ""),
            "total_obtained": round(d["total_obtained"], 1),
            "total_max": round(d["total_max"], 1),
            "percentage": round(overall_pct, 2),
            "grade": overall_grade,
            "gpa": overall_gp,
            "cgpa": cgpa,
            "failed_subjects": failed_subjects,
            "subject_details": d["subjects"],
        })

    # ---- Group into GPA bands ----
    # 10, 9-9.99, 8-8.99, …, 1-1.99, 0 (failed)
    bands = []
    for gpa_floor in range(10, -1, -1):
        gpa_ceil = gpa_floor + 0.99 if gpa_floor < 10 else 10
        if gpa_floor == 10:
            label = "10 GPA"
            band_students = [s for s in student_results if s["cgpa"] == 10]
        else:
            label = f"{gpa_floor}-{gpa_floor + 0.99:.2f} GPA"
            band_students = [
                s for s in student_results
                if gpa_floor <= s["cgpa"] < gpa_floor + 1 and s["cgpa"] != 10
            ]
        if not band_students:
            continue
        band_students.sort(key=lambda s: (-s["cgpa"], s["student_name"]))
        bands.append({
            "label": label,
            "gpa_floor": gpa_floor,
            "count": len(band_students),
            "students": band_students,
        })

    # ---- Failed students ----
    failed_students = [
        s for s in student_results if s["failed_subjects"]
    ]
    failed_students.sort(key=lambda s: s["student_name"])

    return {
        "class_name": cn,
        "section_name": sn,
        "total_students": len(student_ids),
        "students_with_marks": len(student_results),
        "bands": bands,
        "failed_students": failed_students,
    }
