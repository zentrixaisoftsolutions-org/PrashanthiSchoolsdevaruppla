from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import List, Optional
from database import get_db
from models import (
    StudentExamMark, Student, Subject, ExamType, AcademicYear,
    ClassSection, ClassName, Section, SubjectClassSection, Class,
    GradeCriteria, ExaminationSchedule, ExaminationScheduleClassSection,
    ExaminationScheduleSubject, User, StudentExamAttendance
)
from auth import get_current_user, require_role
from datetime import datetime
import pandas as pd
import numpy as np
from utils.performance import calculate_marks_statistics, bulk_percentage_calculation

router = APIRouter(prefix="/api/results", tags=["Results Management"])


def get_grade_for_percentage(db: Session, percentage: float):
    """Get grade info based on percentage."""
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


@router.get("/my-children", summary="Exam Results for Parent's Children")
async def get_my_children_results(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get exam results for parent's children."""
    students = db.query(Student).filter(
        Student.is_active == 1,
        Student.mobile_number == current_user.phone
    ).all() if current_user.phone else []

    if not students:
        return {"students": []}

    result = []
    for student in students:
        # Get all marks grouped by exam
        marks = db.query(
            StudentExamMark, ExamType.name.label("exam_name"),
            Subject.name.label("subject_name")
        ).join(ExamType, StudentExamMark.exam_type_id == ExamType.id).join(
            Subject, StudentExamMark.subject_id == Subject.id
        ).filter(
            StudentExamMark.student_id == student.id
        ).order_by(ExamType.name, Subject.name).all()

        # Group by exam
        exams = {}
        for mark, exam_name, subject_name in marks:
            if exam_name not in exams:
                exams[exam_name] = {"exam_name": exam_name, "subjects": [], "total_obtained": 0, "total_max": 0}
            percentage = round((mark.marks_obtained / mark.max_marks * 100) if mark.max_marks > 0 else 0, 1)
            grade_info = get_grade_for_percentage(db, percentage)
            exams[exam_name]["subjects"].append({
                "subject": subject_name,
                "marks_obtained": mark.marks_obtained,
                "max_marks": mark.max_marks,
                "is_absent": mark.is_absent,
                "percentage": percentage,
                "grade": grade_info["grade"],
            })
            exams[exam_name]["total_obtained"] += (mark.marks_obtained or 0)
            exams[exam_name]["total_max"] += (mark.max_marks or 0)

        # Calculate overall percentage per exam
        exam_list = []
        for exam in exams.values():
            exam["overall_percentage"] = round(
                (exam["total_obtained"] / exam["total_max"] * 100) if exam["total_max"] > 0 else 0, 1
            )
            exam_list.append(exam)

        result.append({
            "student_id": student.id,
            "student_name": f"{student.first_name} {student.surname or ''}".strip(),
            "admission_number": student.admission_number,
            "class_name": student.class_info.class_name if student.class_info else None,
            "exams": exam_list,
        })

    return {"students": result}


@router.get("/exam-mappings", summary="Get Exam Mappings for Results")
async def get_exam_mappings(
    academic_year_id: Optional[int] = Query(None, description="Filter by academic year"),
    exam_type_id: Optional[int] = Query(None, description="Filter by exam type"),
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section_name: Optional[str] = Query(None, description="Filter by section name"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of exam mappings that have marks entered.
    Used for Results page filtering.
    """
    # Get distinct combinations of exam_type, class_section, academic_year that have marks
    marks_query = db.query(
        StudentExamMark.exam_type_id,
        StudentExamMark.class_section_id,
        StudentExamMark.academic_year_id,
        func.count(StudentExamMark.id).label('marks_count'),
        func.count(func.distinct(StudentExamMark.student_id)).label('students_count')
    ).group_by(
        StudentExamMark.exam_type_id,
        StudentExamMark.class_section_id,
        StudentExamMark.academic_year_id
    )
    
    if academic_year_id:
        marks_query = marks_query.filter(StudentExamMark.academic_year_id == academic_year_id)
    if exam_type_id:
        marks_query = marks_query.filter(StudentExamMark.exam_type_id == exam_type_id)
    
    marks_data = marks_query.all()
    
    results = []
    for mark_info in marks_data:
        # Get exam type info
        exam_type = db.query(ExamType).filter(ExamType.id == mark_info.exam_type_id).first()
        if not exam_type:
            continue
        
        # Get class section info
        class_section = db.query(ClassSection).options(
            joinedload(ClassSection.class_name),
            joinedload(ClassSection.section)
        ).filter(ClassSection.id == mark_info.class_section_id).first()
        
        if not class_section:
            continue
        
        cs_class_name = class_section.class_name.name if class_section.class_name else ""
        cs_section_name = class_section.section.name if class_section.section else ""
        
        # Apply class/section filters
        if class_name and cs_class_name != class_name:
            continue
        if section_name and cs_section_name != section_name:
            continue
        
        # Get academic year info
        academic_year = None
        academic_year_name = None
        if mark_info.academic_year_id:
            academic_year = db.query(AcademicYear).filter(AcademicYear.id == mark_info.academic_year_id).first()
            if academic_year:
                academic_year_name = academic_year.name
        
        # Check if all students have marks (Complete status)
        # Get total students in class
        total_students = db.query(func.count(Student.id)).join(Class).filter(
            Class.class_name == cs_class_name,
            Class.section_name == cs_section_name,
            Student.is_active == True
        ).scalar()
        
        # Get subjects mapped to class section
        subjects_count = db.query(func.count(SubjectClassSection.id)).filter(
            SubjectClassSection.class_section_id == mark_info.class_section_id,
            SubjectClassSection.is_active == True
        ).scalar()
        
        expected_marks = total_students * subjects_count if total_students and subjects_count else 0
        actual_marks = mark_info.marks_count
        
        status = "Complete" if actual_marks >= expected_marks and expected_marks > 0 else "Incomplete"
        
        results.append({
            "id": f"{mark_info.exam_type_id}_{mark_info.class_section_id}_{mark_info.academic_year_id or 0}",
            "exam_type_id": mark_info.exam_type_id,
            "exam_type_name": exam_type.name,
            "academic_year_id": mark_info.academic_year_id,
            "academic_year_name": academic_year_name,
            "class_section_id": mark_info.class_section_id,
            "class_name": cs_class_name,
            "section_name": cs_section_name,
            "grade_type": "100 percentage",
            "status": status,
            "students_count": mark_info.students_count,
            "marks_count": mark_info.marks_count,
            "created_at": exam_type.created_at.isoformat() if exam_type.created_at else None
        })
    
    # Sort by created_at descending
    results.sort(key=lambda x: x.get('created_at') or '', reverse=True)
    
    return results


@router.get("/report-cards/{exam_type_id}/{class_section_id}", summary="Get Report Cards")
async def get_report_cards(
    exam_type_id: int,
    class_section_id: int,
    academic_year_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get report card data for all students in a class/section for a specific exam.
    """
    # Get exam type
    exam_type = db.query(ExamType).filter(ExamType.id == exam_type_id).first()
    if not exam_type:
        raise HTTPException(status_code=404, detail="Exam type not found")
    
    # Get class section
    class_section = db.query(ClassSection).options(
        joinedload(ClassSection.class_name),
        joinedload(ClassSection.section)
    ).filter(ClassSection.id == class_section_id).first()
    
    if not class_section:
        raise HTTPException(status_code=404, detail="Class section not found")
    
    cs_class_name = class_section.class_name.name if class_section.class_name else ""
    cs_section_name = class_section.section.name if class_section.section else ""
    
    # Get academic year info
    academic_year_name = None
    if academic_year_id:
        academic_year = db.query(AcademicYear).filter(AcademicYear.id == academic_year_id).first()
        if academic_year:
            academic_year_name = academic_year.name
    
    # Get subjects from the examination schedule (only mapped subjects)
    exam_schedule = db.query(ExaminationSchedule).join(
        ExaminationScheduleClassSection,
        ExaminationSchedule.id == ExaminationScheduleClassSection.examination_schedule_id
    ).filter(
        ExaminationSchedule.exam_type_id == exam_type_id,
        ExaminationScheduleClassSection.class_section_id == class_section_id,
        ExaminationSchedule.is_active == True
    )
    if academic_year_id:
        exam_schedule = exam_schedule.filter(
            ExaminationSchedule.academic_year_id == academic_year_id
        )
    exam_schedule = exam_schedule.order_by(
        ExaminationSchedule.from_date.desc(),
        ExaminationSchedule.created_at.desc()
    ).first()

    subjects = []
    subject_ids = []
    if exam_schedule:
        schedule_subjects = db.query(ExaminationScheduleSubject).options(
            joinedload(ExaminationScheduleSubject.subject)
        ).filter(
            ExaminationScheduleSubject.examination_schedule_id == exam_schedule.id
        ).order_by(ExaminationScheduleSubject.display_order).all()
        for ss in schedule_subjects:
            if ss.subject and ss.subject.is_active:
                subjects.append({"id": ss.subject.id, "name": ss.subject.name})
                subject_ids.append(ss.subject.id)
    else:
        # Fallback: use class-level subject mappings if no schedule exists
        subject_mappings = db.query(SubjectClassSection).options(
            joinedload(SubjectClassSection.subject)
        ).filter(
            SubjectClassSection.class_section_id == class_section_id,
            SubjectClassSection.is_active == True
        ).order_by(SubjectClassSection.id).all()
        for mapping in subject_mappings:
            if mapping.subject and mapping.subject.is_active:
                subjects.append({"id": mapping.subject.id, "name": mapping.subject.name})
                subject_ids.append(mapping.subject.id)
    
    # Get students in this class
    students = db.query(Student).join(Class).filter(
        Class.class_name == cs_class_name,
        Class.section_name == cs_section_name,
        Student.is_active == True
    ).order_by(Student.first_name).all()
    
    student_ids = [s.id for s in students]
    
    # Get all marks for these students
    marks_query = db.query(StudentExamMark).filter(
        StudentExamMark.student_id.in_(student_ids),
        StudentExamMark.subject_id.in_(subject_ids),
        StudentExamMark.exam_type_id == exam_type_id,
        StudentExamMark.class_section_id == class_section_id
    )
    if academic_year_id:
        marks_query = marks_query.filter(StudentExamMark.academic_year_id == academic_year_id)
    
    all_marks = marks_query.all()
    
    # Build marks dictionary: (student_id, subject_id) -> mark
    marks_dict = {}
    for mark in all_marks:
        marks_dict[(mark.student_id, mark.subject_id)] = mark
    
    # Get grade criteria for grade calculation
    grade_criteria = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True
    ).order_by(GradeCriteria.display_order).all()
    
    # Calculate class topper and class average for each subject
    subject_stats = {}
    for subj in subjects:
        subj_marks = [m.marks_obtained for m in all_marks 
                      if m.subject_id == subj["id"] and m.marks_obtained is not None and not m.is_absent]
        if subj_marks:
            max_marks_val = next((m.max_marks for m in all_marks if m.subject_id == subj["id"]), 50)
            subject_stats[subj["id"]] = {
                "topper": max(subj_marks),
                "average": round(sum(subj_marks) / len(subj_marks), 1),
                "max_marks": max_marks_val
            }
        else:
            subject_stats[subj["id"]] = {"topper": 0, "average": 0, "max_marks": 50}
    
    # Build report cards for each student
    report_cards = []
    student_totals = []  # For calculating class rank
    
    for student in students:
        student_name = f"{student.first_name} {student.surname or ''}".strip()
        
        # Get subject-wise marks
        subject_marks = []
        total_marks = 0
        total_max_marks = 0
        total_points = 0
        
        for subj in subjects:
            mark = marks_dict.get((student.id, subj["id"]))
            stats = subject_stats.get(subj["id"], {"topper": 0, "average": 0, "max_marks": 50})
            
            if mark and not mark.is_absent and mark.marks_obtained is not None:
                marks_obtained = mark.marks_obtained
                max_marks = mark.max_marks or 50
                percentage = (marks_obtained / max_marks * 100) if max_marks > 0 else 0
                grade_info = get_grade_for_percentage(db, percentage)
                
                total_marks += marks_obtained
                total_max_marks += max_marks
                total_points += grade_info["grade_point"]
                
                subject_marks.append({
                    "subject_id": subj["id"],
                    "subject_name": subj["name"],
                    "marks_obtained": marks_obtained,
                    "max_marks": max_marks,
                    "min_marks": mark.min_marks if mark.min_marks is not None else 35,
                    "grade": grade_info["grade"],
                    "grade_point": grade_info["grade_point"],
                    "teacher_remarks": grade_info["teacher_remarks"],
                    "is_absent": False,
                    "class_topper": stats["topper"],
                    "class_average": stats["average"]
                })
            elif mark and mark.is_absent:
                max_marks = mark.max_marks or 50
                total_max_marks += max_marks
                
                subject_marks.append({
                    "subject_id": subj["id"],
                    "subject_name": subj["name"],
                    "marks_obtained": None,
                    "max_marks": max_marks,
                    "min_marks": mark.min_marks if mark.min_marks is not None else 35,
                    "grade": "FAIL",
                    "grade_point": 0,
                    "teacher_remarks": "",
                    "is_absent": True,
                    "class_topper": stats["topper"],
                    "class_average": stats["average"]
                })
            else:
                # No mark record
                max_marks = 50
                total_max_marks += max_marks
                
                subject_marks.append({
                    "subject_id": subj["id"],
                    "subject_name": subj["name"],
                    "marks_obtained": None,
                    "max_marks": max_marks,
                    "min_marks": 35,
                    "grade": "-",
                    "grade_point": 0,
                    "teacher_remarks": "",
                    "is_absent": False,
                    "class_topper": stats["topper"],
                    "class_average": stats["average"]
                })
        
        # Calculate overall percentage and grade
        overall_percentage = (total_marks / total_max_marks * 100) if total_max_marks > 0 else 0
        overall_grade_info = get_grade_for_percentage(db, overall_percentage)
        
        # Calculate GPA (average of grade points)
        subject_count = len([sm for sm in subject_marks if sm["marks_obtained"] is not None])
        gpa = round(total_points / subject_count, 1) if subject_count > 0 else 0
        
        student_totals.append({
            "student_id": student.id,
            "total_marks": total_marks,
            "percentage": overall_percentage
        })
        
        report_cards.append({
            "student_id": student.id,
            "student_name": student_name,
            "admission_number": student.admission_number or "",
            "father_name": student.father_guardian_name or "",
            "photo_thumbnail": student.photo_thumbnail,
            "photo_data": student.photo_data,
            "class_name": cs_class_name,
            "section_name": cs_section_name,
            "subject_marks": subject_marks,
            "total_marks": total_marks,
            "total_max_marks": total_max_marks,
            "percentage": round(overall_percentage, 2),
            "grade": overall_grade_info["grade"],
            "gpa": gpa,
            "total_gpa": 10,
            "general_remarks": overall_grade_info["teacher_remarks"],
            "class_rank": 0  # Will be calculated below
        })
    
    # Calculate class ranks
    sorted_totals = sorted(student_totals, key=lambda x: x["percentage"], reverse=True)
    rank_map = {}
    current_rank = 1
    prev_percentage = None
    for i, st in enumerate(sorted_totals):
        if prev_percentage is not None and st["percentage"] < prev_percentage:
            current_rank = i + 1
        rank_map[st["student_id"]] = current_rank
        prev_percentage = st["percentage"]
    
    # Update report cards with ranks
    for rc in report_cards:
        rc["class_rank"] = rank_map.get(rc["student_id"], 0)
        rc["total_students"] = len(students)
    
    # ===== ATTENDANCE DATA =====
    # Fetch manual attendance entries for this exam/class
    att_query = db.query(StudentExamAttendance).filter(
        StudentExamAttendance.student_id.in_(student_ids),
        StudentExamAttendance.exam_type_id == exam_type_id,
        StudentExamAttendance.class_section_id == class_section_id,
    )
    if academic_year_id:
        att_query = att_query.filter(StudentExamAttendance.academic_year_id == academic_year_id)
    all_att = att_query.order_by(StudentExamAttendance.year, StudentExamAttendance.month).all()

    MONTH_NAMES = [
        "", "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]

    # Group by student
    att_by_student: dict = {}
    for a in all_att:
        if a.student_id not in att_by_student:
            att_by_student[a.student_id] = []
        att_by_student[a.student_id].append({
            "month": a.month,
            "year": a.year,
            "month_name": MONTH_NAMES[a.month] if 1 <= a.month <= 12 else f"Month {a.month}",
            "total_working_days": a.total_working_days,
            "present_days": a.present_days,
        })

    for rc in report_cards:
        sid = rc["student_id"]
        att_list = att_by_student.get(sid, [])
        rc["attendance"] = att_list
        rc["attendance_total_working_days"] = sum(a["total_working_days"] for a in att_list)
        rc["attendance_total_present_days"] = sum(a["present_days"] for a in att_list)
    
    return {
        "exam_name": exam_type.name,
        "academic_year": academic_year_name,
        "class_name": cs_class_name,
        "section_name": cs_section_name,
        "subjects": subjects,
        "grade_scale": [
            {"grade": g.grade, "range": f"{g.min_percentage} - {g.max_percentage}", 
             "points": g.grade_point, "min_pct": g.min_percentage, "max_pct": g.max_percentage} 
            for g in grade_criteria
        ],
        "report_cards": report_cards,
        "generated_at": datetime.utcnow().isoformat()
    }
