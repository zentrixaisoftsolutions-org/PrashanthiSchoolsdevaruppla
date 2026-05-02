from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_
from typing import List, Optional
from database import get_db
from models import (
    StudentExamMark, Student, Subject, ExamType, AcademicYear, 
    ClassSection, ClassName, Section, SubjectClassSection, Class,
    ExaminationSchedule, ExaminationScheduleClassSection, ExaminationScheduleSubject,
    AcademicCalendar, AcademicCalendarHoliday, StudentExamAttendance
)
from schemas import (
    MarksEntryRequest, MarksEntryGridResponse, SubjectColumnInfo, 
    StudentWithMarks, StudentMarkEntry, SubjectMarkEntry,
    AttendanceMonthInfo, StudentAttendanceBulkRequest, StudentAttendanceResponse
)
from auth import get_current_user, require_role, User

router = APIRouter(prefix="/api/marks-entry", tags=["Marks Entry"])


@router.get("/teacher-options", summary="Lookups for teacher mobile marks entry")
async def get_teacher_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns everything the mobile teacher needs to pick before opening the grid:
    - current academic year (id + name)
    - all active class sections with a friendly label "<class> - <section>"
    - all active exam types for the current academic year (plus any without one)
    """
    current_year = db.query(AcademicYear).filter(AcademicYear.is_current == True).first()
    if not current_year:
        current_year = db.query(AcademicYear).order_by(AcademicYear.id.desc()).first()
    academic_year_id = current_year.id if current_year else None
    academic_year_name = current_year.name if current_year else None

    sections = (
        db.query(ClassSection)
        .options(joinedload(ClassSection.class_name), joinedload(ClassSection.section))
        .filter(ClassSection.is_active == True)
        .all()
    )
    section_list = []
    for cs in sections:
        cn = cs.class_name.name if cs.class_name else ""
        sn = cs.section.name if cs.section else ""
        label = f"{cn} - {sn}".strip(" -")
        section_list.append({
            "id": cs.id,
            "class_name": cn,
            "section_name": sn,
            "label": label or f"Section {cs.id}",
        })
    section_list.sort(key=lambda x: x["label"])

    exam_q = db.query(ExamType).filter(ExamType.is_active == True)
    if academic_year_id:
        exam_q = exam_q.filter(
            (ExamType.academic_year_id == academic_year_id) | (ExamType.academic_year_id == None)
        )
    exam_types = exam_q.order_by(ExamType.display_order).all()
    exam_list = [
        {"id": e.id, "name": e.name, "academic_year_id": e.academic_year_id}
        for e in exam_types
    ]

    return {
        "academic_year_id": academic_year_id,
        "academic_year_name": academic_year_name,
        "class_sections": section_list,
        "exam_types": exam_list,
    }


@router.get("/grid", response_model=MarksEntryGridResponse, summary="Get Marks Entry Grid")
async def get_marks_entry_grid(
    exam_type_id: int,
    class_section_id: int,
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the marks entry grid for a specific exam, class section, and academic year.
    Returns subjects mapped to the class section and students with their marks.
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
    
    # Get academic year info
    academic_year = None
    academic_year_name = None
    if academic_year_id:
        academic_year = db.query(AcademicYear).filter(AcademicYear.id == academic_year_id).first()
        if academic_year:
            academic_year_name = academic_year.name
    
    # Get subjects - first check if there's an examination schedule with subjects defined
    subjects = []
    
    # Find examination schedule for this exam type and class section
    exam_schedule_query = db.query(ExaminationSchedule).join(
        ExaminationScheduleClassSection,
        ExaminationSchedule.id == ExaminationScheduleClassSection.examination_schedule_id
    ).filter(
        ExaminationSchedule.exam_type_id == exam_type_id,
        ExaminationScheduleClassSection.class_section_id == class_section_id,
        ExaminationSchedule.is_active == True
    )
    if academic_year_id:
        exam_schedule_query = exam_schedule_query.filter(
            ExaminationSchedule.academic_year_id == academic_year_id
        )
    exam_schedule = exam_schedule_query.order_by(
        ExaminationSchedule.from_date.desc(),
        ExaminationSchedule.created_at.desc()
    ).first()
    
    if exam_schedule:
        # Get subjects from examination schedule, ordered by display_order
        schedule_subjects = db.query(ExaminationScheduleSubject).options(
            joinedload(ExaminationScheduleSubject.subject)
        ).filter(
            ExaminationScheduleSubject.examination_schedule_id == exam_schedule.id
        ).order_by(ExaminationScheduleSubject.display_order).all()
        
        for ess in schedule_subjects:
            if ess.subject and ess.subject.is_active:
                subjects.append(SubjectColumnInfo(
                    subject_id=ess.subject.id,
                    subject_name=ess.subject.name,
                    max_marks=ess.max_marks,
                    min_marks=ess.pass_marks if ess.pass_marks is not None else 35
                ))
    
    # If no subjects from schedule, fall back to class section subject mappings
    if not subjects:
        subject_mappings = db.query(SubjectClassSection).options(
            joinedload(SubjectClassSection.subject)
        ).filter(
            SubjectClassSection.class_section_id == class_section_id,
            SubjectClassSection.is_active == True
        ).all()
        
        for mapping in subject_mappings:
            if mapping.subject and mapping.subject.is_active:
                subjects.append(SubjectColumnInfo(
                    subject_id=mapping.subject.id,
                    subject_name=mapping.subject.name,
                    max_marks=50,
                    min_marks=18
                ))
    
    # Get students in this class section
    # Match by class_name and section_name from Class table
    class_name = class_section.class_name.name if class_section.class_name else ""
    section_name = class_section.section.name if class_section.section else ""
    
    students_query = db.query(Student).join(Class).filter(
        Class.class_name == class_name,
        Class.section_name == section_name,
        Student.is_active == True
    ).order_by(Student.first_name).all()
    
    # Get existing marks for these students
    student_ids = [s.id for s in students_query]
    subject_ids = [s.subject_id for s in subjects]
    
    existing_marks = {}
    if student_ids and subject_ids:
        marks_query = db.query(StudentExamMark).filter(
            StudentExamMark.student_id.in_(student_ids),
            StudentExamMark.subject_id.in_(subject_ids),
            StudentExamMark.exam_type_id == exam_type_id,
            StudentExamMark.class_section_id == class_section_id
        )
        if academic_year_id:
            marks_query = marks_query.filter(StudentExamMark.academic_year_id == academic_year_id)
        
        for mark in marks_query.all():
            key = (mark.student_id, mark.subject_id)
            existing_marks[key] = mark
    
    # Build students with marks
    students_with_marks = []
    for student in students_query:
        student_name = f"{student.first_name} {student.surname or ''}".strip()
        marks_dict = {}
        
        for subj in subjects:
            key = (student.id, subj.subject_id)
            if key in existing_marks:
                mark = existing_marks[key]
                if mark.is_absent:
                    marks_dict[str(subj.subject_id)] = "AB"
                else:
                    marks_dict[str(subj.subject_id)] = mark.marks_obtained
            else:
                marks_dict[str(subj.subject_id)] = None
        
        students_with_marks.append(StudentWithMarks(
            student_id=student.id,
            student_name=student_name,
            admission_number=student.admission_number or "",
            marks=marks_dict
        ))
    
    return MarksEntryGridResponse(
        exam_type_id=exam_type_id,
        exam_type_name=exam_type.name,
        academic_year_id=academic_year_id,
        academic_year_name=academic_year_name,
        class_section_id=class_section_id,
        class_name=class_name,
        section_name=section_name,
        subjects=subjects,
        students=students_with_marks
    )


@router.post("/update", summary="Update Marks")
async def update_marks(
    data: MarksEntryRequest,
    current_user: User = Depends(require_role("super_admin", "admin", "teacher")),
    db: Session = Depends(get_db)
):
    """
    Bulk update marks for students. Creates new records or updates existing ones.
    """
    # Validate exam type
    exam_type = db.query(ExamType).filter(ExamType.id == data.exam_type_id).first()
    if not exam_type:
        raise HTTPException(status_code=404, detail="Exam type not found")
    
    # Validate class section
    class_section = db.query(ClassSection).filter(ClassSection.id == data.class_section_id).first()
    if not class_section:
        raise HTTPException(status_code=404, detail="Class section not found")
    
    updated_count = 0
    created_count = 0
    
    for subject_entry in data.subjects:
        subject = db.query(Subject).filter(Subject.id == subject_entry.subject_id).first()
        if not subject:
            continue
        
        for mark_entry in subject_entry.marks:
            # Find existing mark record
            existing_mark = db.query(StudentExamMark).filter(
                StudentExamMark.student_id == mark_entry.student_id,
                StudentExamMark.subject_id == subject_entry.subject_id,
                StudentExamMark.exam_type_id == data.exam_type_id,
                StudentExamMark.class_section_id == data.class_section_id
            )
            if data.academic_year_id:
                existing_mark = existing_mark.filter(
                    StudentExamMark.academic_year_id == data.academic_year_id
                )
            existing_mark = existing_mark.first()
            
            if existing_mark:
                # Update existing
                existing_mark.marks_obtained = mark_entry.marks_obtained
                existing_mark.is_absent = mark_entry.is_absent
                existing_mark.max_marks = subject_entry.max_marks
                existing_mark.min_marks = subject_entry.min_marks
                updated_count += 1
            else:
                # Create new
                new_mark = StudentExamMark(
                    student_id=mark_entry.student_id,
                    subject_id=subject_entry.subject_id,
                    exam_type_id=data.exam_type_id,
                    academic_year_id=data.academic_year_id,
                    class_section_id=data.class_section_id,
                    marks_obtained=mark_entry.marks_obtained,
                    max_marks=subject_entry.max_marks,
                    min_marks=subject_entry.min_marks,
                    is_absent=mark_entry.is_absent
                )
                db.add(new_mark)
                created_count += 1
    
    db.commit()
    
    return {
        "message": "Marks updated successfully",
        "created": created_count,
        "updated": updated_count
    }


@router.get("/class-sections-by-class", summary="Get Class Sections by Class Name")
async def get_class_sections_by_class(
    class_name_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all sections for a specific class name."""
    sections = db.query(ClassSection).options(
        joinedload(ClassSection.section)
    ).filter(
        ClassSection.class_name_id == class_name_id,
        ClassSection.is_active == True
    ).all()
    
    return [
        {
            "id": cs.id,
            "section_name": cs.section.name if cs.section else ""
        }
        for cs in sections
    ]


@router.get("/exams-by-academic-year", summary="Get Exams by Academic Year")
async def get_exams_by_academic_year(
    academic_year_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all exam types for a specific academic year."""
    exam_types = db.query(ExamType).filter(
        ExamType.academic_year_id == academic_year_id,
        ExamType.is_active == True
    ).order_by(ExamType.display_order).all()
    
    # Also include exams without academic year (general exams)
    general_exams = db.query(ExamType).filter(
        ExamType.academic_year_id == None,
        ExamType.is_active == True
    ).order_by(ExamType.display_order).all()
    
    all_exams = exam_types + general_exams
    
    return [
        {
            "id": et.id,
            "name": et.name,
            "academic_year_id": et.academic_year_id
        }
        for et in all_exams
    ]


# ==================== ATTENDANCE DURING MARKS ENTRY ====================

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


@router.get("/attendance-months", summary="Get attendance months from academic calendar")
async def get_attendance_months(
    academic_year_id: int,
    class_section_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get months with working days from the academic calendar for the class.
    Matches via class_name_id from ClassSection.
    """
    cs = db.query(ClassSection).filter(ClassSection.id == class_section_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    calendars = (
        db.query(AcademicCalendar)
        .filter(
            AcademicCalendar.academic_year_id == academic_year_id,
            AcademicCalendar.class_name_id == cs.class_name_id,
            AcademicCalendar.is_active == True,
        )
        .order_by(AcademicCalendar.year, AcademicCalendar.month)
        .all()
    )

    result = []
    for cal in calendars:
        h_count = len(cal.holidays or [])
        effective = max(0, cal.total_working_days - h_count)
        result.append(AttendanceMonthInfo(
            month=cal.month,
            year=cal.year,
            month_name=MONTH_NAMES[cal.month] if 1 <= cal.month <= 12 else f"Month {cal.month}",
            total_working_days=effective,
        ))
    return result


@router.get("/attendance", summary="Get saved attendance for students")
async def get_attendance(
    exam_type_id: int,
    class_section_id: int,
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get existing manual attendance entries for an exam/class.
    Returns dict: { "studentId_month_year": { present_days, total_working_days } }
    """
    q = db.query(StudentExamAttendance).filter(
        StudentExamAttendance.exam_type_id == exam_type_id,
        StudentExamAttendance.class_section_id == class_section_id,
    )
    if academic_year_id:
        q = q.filter(StudentExamAttendance.academic_year_id == academic_year_id)

    records = q.all()
    result = {}
    for r in records:
        key = f"{r.student_id}_{r.month}_{r.year}"
        result[key] = {
            "id": r.id,
            "student_id": r.student_id,
            "month": r.month,
            "year": r.year,
            "total_working_days": r.total_working_days,
            "present_days": r.present_days,
        }
    return result


@router.post("/attendance", summary="Save/Update attendance for students")
async def save_attendance(
    data: StudentAttendanceBulkRequest,
    current_user: User = Depends(require_role("super_admin", "admin", "teacher")),
    db: Session = Depends(get_db),
):
    """
    Bulk upsert manual attendance entries entered during marks entry.
    """
    created_count = 0
    updated_count = 0

    for entry in data.entries:
        if entry.present_days > entry.total_working_days:
            raise HTTPException(status_code=400, detail=f"Present days ({entry.present_days}) cannot exceed working days ({entry.total_working_days})")
        existing = db.query(StudentExamAttendance).filter(
            StudentExamAttendance.student_id == entry.student_id,
            StudentExamAttendance.exam_type_id == data.exam_type_id,
            StudentExamAttendance.class_section_id == data.class_section_id,
            StudentExamAttendance.month == entry.month,
            StudentExamAttendance.year == entry.year,
        )
        if data.academic_year_id:
            existing = existing.filter(
                StudentExamAttendance.academic_year_id == data.academic_year_id
            )
        existing = existing.first()

        if entry.present_days == 0:
            # present_days 0 means delete the record
            if existing:
                db.delete(existing)
        elif existing:
            existing.total_working_days = entry.total_working_days
            existing.present_days = entry.present_days
            updated_count += 1
        else:
            rec = StudentExamAttendance(
                student_id=entry.student_id,
                exam_type_id=data.exam_type_id,
                academic_year_id=data.academic_year_id,
                class_section_id=data.class_section_id,
                month=entry.month,
                year=entry.year,
                total_working_days=entry.total_working_days,
                present_days=entry.present_days,
            )
            db.add(rec)
            created_count += 1

    db.commit()
    return {"message": "Attendance saved", "created": created_count, "updated": updated_count}
