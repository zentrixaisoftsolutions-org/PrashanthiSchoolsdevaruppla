from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
from database import get_db
from models import Student, Class, User, ClassName, Section, ClassSection, Subject, GradeCriteria, AttendanceLog, StudentExamMark, ExamType
from schemas import (
    StudentCreate, StudentResponse, StudentUpdate, 
    StudentSearchFilters, StudentListResponse
)
from auth import get_current_user, require_role
from typing import Optional, List
import csv
import io
import base64
from datetime import datetime, date, timedelta
from PIL import Image
import time
import pandas as pd
import numpy as np
from utils.performance import calculate_working_days_vectorized, calculate_marks_statistics

router = APIRouter(prefix="/api/students", tags=["Student Management"])


def generate_thumbnail(base64_data: str, max_size: int = 64) -> str:
    """Generate a small base64 thumbnail from a base64 image string.
    Returns a base64 JPEG string for list views (64x64, quality 50)."""
    try:
        # Extract raw base64 data if it has a data URI prefix
        if ',' in base64_data:
            raw = base64_data.split(',', 1)[1]
        else:
            raw = base64_data

        img_bytes = base64.b64decode(raw)
        img = Image.open(io.BytesIO(img_bytes))
        img = img.convert('RGB')
        img.thumbnail((max_size, max_size), Image.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=50, optimize=True)
        thumb_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/jpeg;base64,{thumb_b64}"
    except Exception:
        return ""


def build_student_response(student: Student, include_photo: bool = False) -> dict:
    """Build student response with class details."""
    response = {
        "id": student.id,
        "admission_number": student.admission_number,
        "rfid_id": student.rfid_id,
        "first_name": student.first_name,
        "surname": student.surname,
        "date_of_birth": student.date_of_birth,
        "gender": student.gender,
        "blood_group": student.blood_group,
        "caste": student.caste,
        "aadhaar_number": student.aadhaar_number,
        "pen": student.pen,
        "photo_data": student.photo_data if include_photo else None,
        "photo_thumbnail": student.photo_thumbnail,
        "mobile_number": student.mobile_number,
        "phone_number": student.phone_number,
        "email": student.email,
        "address": student.address,
        "father_guardian_name": student.father_guardian_name,
        "mother_name": student.mother_name,
        "parent_login_username": student.parent_login_username,
        "parent_login_password": None,  # Don't expose password
        "class_id": student.class_id,
        "session_timings": student.session_timings,
        "admission_date": student.admission_date,
        "user_id": student.user_id,
        "parent_id": student.parent_id,
        "roll_number": student.roll_number,
        "is_active": student.is_active,
        "created_at": student.created_at,
        "updated_at": student.updated_at,
        "class_name": student.class_info.class_name if student.class_info else None,
        "section_name": student.class_info.section_name if student.class_info else None,
    }
    return response


@router.get("/my-children", summary="Get Parent's Children")
async def get_my_children(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get students linked to the current parent user."""
    students = db.query(Student).options(joinedload(Student.class_info)).filter(
        Student.is_active == 1,
        Student.mobile_number == current_user.phone
    ).all() if current_user.phone else []

    return [
        {
            "id": s.id,
            "first_name": s.first_name,
            "surname": s.surname or "",
            "admission_number": s.admission_number,
            "class_name": s.class_info.class_name if s.class_info else None,
            "section_name": s.class_info.section_name if s.class_info else None,
            "gender": s.gender,
            "date_of_birth": s.date_of_birth.isoformat() if s.date_of_birth else None,
            "father_guardian_name": s.father_guardian_name,
            "mother_name": s.mother_name,
            "mobile_number": s.mobile_number,
            "photo_thumbnail": s.photo_thumbnail,
            "is_active": s.is_active,
        }
        for s in students
    ]


@router.get("/", response_model=StudentListResponse, summary="List Students with Filters")
async def list_students(
    # Pagination
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    # Search Filters
    class_name: Optional[str] = Query(None, description="Filter by class name (e.g., '1 CLASS', '2 CLASS')"),
    section: Optional[str] = Query(None, description="Filter by section (e.g., 'A', 'B')"),
    aadhaar_number: Optional[str] = Query(None, description="Filter by Aadhaar number"),
    admission_number: Optional[str] = Query(None, description="Filter by admission number"),
    mobile_number: Optional[str] = Query(None, description="Filter by mobile number"),
    # General search
    search: Optional[str] = Query(None, description="General search across name, admission number, mobile"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get paginated list of students with search filters.
    
    Filters available:
    - class_name: Filter by class name (exact or partial match)
    - section: Filter by section name (exact or partial match)
    - aadhaar_number: Filter by Aadhaar number (partial match)
    - admission_number: Filter by admission number (partial match)
    - mobile_number: Filter by mobile number (partial match)
    - search: General search across multiple fields
    - is_active: Filter by active/inactive status
    """
    query = db.query(Student).options(joinedload(Student.class_info))
    
    # Apply filters
    if class_name:
        query = query.join(Class).filter(Class.class_name.ilike(f"%{class_name}%"))
    
    if section:
        if not class_name:  # Only join if not already joined
            query = query.join(Class)
        query = query.filter(Class.section_name.ilike(f"%{section}%"))
    
    if aadhaar_number:
        query = query.filter(Student.aadhaar_number.ilike(f"%{aadhaar_number}%"))
    
    if admission_number:
        query = query.filter(Student.admission_number.ilike(f"%{admission_number}%"))
    
    if mobile_number:
        query = query.filter(Student.mobile_number.ilike(f"%{mobile_number}%"))
    
    if search:
        search_filter = or_(
            Student.first_name.ilike(f"%{search}%"),
            Student.surname.ilike(f"%{search}%"),
            Student.admission_number.ilike(f"%{search}%"),
            Student.mobile_number.ilike(f"%{search}%"),
            Student.aadhaar_number.ilike(f"%{search}%"),
            Student.father_guardian_name.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    if is_active is not None:
        query = query.filter(Student.is_active == is_active)
    
    # Get total count
    total = query.count()
    
    # Apply ordering (required for SQL Server with OFFSET)
    query = query.order_by(Student.id)
    
    # Apply pagination
    offset = (page - 1) * page_size
    students = query.offset(offset).limit(page_size).all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    return StudentListResponse(
        students=[StudentResponse(**build_student_response(s)) for s in students],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/search-options", summary="Get Search Filter Options")
async def get_search_options(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get available options for search filters.
    Returns distinct values for class names and sections.
    """
    classes = db.query(Class).filter(Class.is_active == True).all()
    
    class_names = list(set([c.class_name for c in classes]))
    sections = list(set([c.section_name for c in classes]))
    
    return {
        "class_names": sorted(class_names),
        "sections": sorted(sections)
    }


@router.get("/classes", summary="Get All Classes")
async def get_classes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all active classes with their IDs for student enrollment.
    Returns class_id, class_name, and section_name.
    Auto-syncs from class_sections if the classes table is missing entries.
    """
    # Auto-populate classes table from class_sections for entries that don't exist yet
    class_sections = (
        db.query(ClassSection, ClassName, Section)
        .join(ClassName, ClassSection.class_name_id == ClassName.id)
        .join(Section, ClassSection.section_id == Section.id)
        .filter(ClassSection.is_active == True)
        .all()
    )
    for cs, cn, sec in class_sections:
        existing = db.query(Class).filter(
            Class.class_name == cn.name,
            Class.section_name == sec.name
        ).first()
        if not existing:
            new_class = Class(
                name=f"{cn.name} - {sec.name}",
                class_name=cn.name,
                section_name=sec.name,
                is_active=True
            )
            db.add(new_class)
    db.commit()

    classes = db.query(Class).filter(Class.is_active == True).order_by(Class.class_name, Class.section_name).all()
    
    return [
        {
            "id": c.id,
            "class_name": c.class_name,
            "section_name": c.section_name,
            "display_name": f"{c.class_name} - {c.section_name}"
        }
        for c in classes
    ]


@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED, summary="Create Student")
async def create_student(
    student_data: StudentCreate,
    current_user: User = Depends(require_role("admin", "super_admin")),
    db: Session = Depends(get_db)
):
    """Create a new student (Admin/Super Admin only)."""
    # Check if admission number already exists
    existing_adm = db.query(Student).filter(Student.admission_number == student_data.admission_number).first()
    if existing_adm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student with admission number '{student_data.admission_number}' already exists"
        )

    # Check if PEN already exists (if provided)
    if student_data.pen:
        existing_pen = db.query(Student).filter(Student.pen == student_data.pen).first()
        if existing_pen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Student with PEN '{student_data.pen}' already exists"
            )

    # Check if Aadhaar number already exists (if provided)
    if student_data.aadhaar_number:
        existing_aadhaar = db.query(Student).filter(Student.aadhaar_number == student_data.aadhaar_number).first()
        if existing_aadhaar:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Student with Aadhaar number '{student_data.aadhaar_number}' already exists"
            )
    
    # Validate class if provided
    if student_data.class_id:
        class_exists = db.query(Class).filter(Class.id == student_data.class_id).first()
        if not class_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Class with id {student_data.class_id} not found"
            )
    
    data = student_data.model_dump()
    # Generate thumbnail if photo_data is provided
    if data.get('photo_data'):
        data['photo_thumbnail'] = generate_thumbnail(data['photo_data'])
    
    new_student = Student(**data)
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    
    # Reload with relationships
    student = db.query(Student).options(joinedload(Student.class_info)).filter(Student.id == new_student.id).first()
    return StudentResponse(**build_student_response(student, include_photo=True))


@router.get("/{student_id}", response_model=StudentResponse, summary="Get Student Details")
async def get_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student details by ID."""
    student = db.query(Student).options(joinedload(Student.class_info)).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found"
        )
    return StudentResponse(**build_student_response(student, include_photo=True))


@router.put("/{student_id}", response_model=StudentResponse, summary="Update Student")
async def update_student(
    student_id: int,
    student_data: StudentUpdate,
    current_user: User = Depends(require_role("admin", "super_admin")),
    db: Session = Depends(get_db)
):
    """Update student details (Admin/Super Admin only)."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found"
        )
    
    update_data = student_data.model_dump(exclude_unset=True)
    
    # Validate class if being updated
    if "class_id" in update_data and update_data["class_id"]:
        class_exists = db.query(Class).filter(Class.id == update_data["class_id"]).first()
        if not class_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Class with id {update_data['class_id']} not found"
            )
    
    # Generate thumbnail if photo_data is being updated
    if 'photo_data' in update_data and update_data['photo_data']:
        update_data['photo_thumbnail'] = generate_thumbnail(update_data['photo_data'])
    
    for field, value in update_data.items():
        setattr(student, field, value)
    
    db.commit()
    db.refresh(student)
    
    # Reload with relationships
    student = db.query(Student).options(joinedload(Student.class_info)).filter(Student.id == student_id).first()
    return StudentResponse(**build_student_response(student, include_photo=True))


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete Student")
async def delete_student(
    student_id: int,
    current_user: User = Depends(require_role("super_admin")),
    db: Session = Depends(get_db)
):
    """Delete a student (Super Admin only). Soft delete by setting is_active to False."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found"
        )
    
    student.is_active = False
    db.commit()
    return None


@router.post("/import-csv", summary="Import Students from CSV")
async def import_students_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role("admin", "super_admin")),
    db: Session = Depends(get_db)
):
    """
    Import students from CSV file matching the required format.
    Auto-creates Class Names, Sections, and Class-Section mappings if they don't exist.
    Expected columns: Admission No, RFID ID, Student Name, Student Surname, etc.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported"
        )
    
    try:
        contents = await file.read()
        decoded = contents.decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))
        
        # Count total rows first
        rows = list(reader)
        total_rows = len(rows)
        
        # Log headers for debugging
        if rows:
            print(f"CSV Headers found: {list(rows[0].keys())}")
        
        imported_count = 0
        skipped_count = 0
        created_classes = []
        created_sections = []
        errors = []
        
        # Cache for class lookups to reduce DB queries
        class_cache = {}  # (class_name, section_name) -> Class.id
        
        for row_num, row in enumerate(rows, start=2):  # Start at 2 (header is row 1)
            try:
                # Map CSV columns to model fields
                admission_no = row.get('Admission No', '').strip()
                if not admission_no:
                    errors.append(f"Row {row_num}: Admission number is required")
                    continue
                
                # Check if student already exists
                existing = db.query(Student).filter(Student.admission_number == admission_no).first()
                if existing:
                    skipped_count += 1
                    continue  # Skip silently for existing students
                
                # Get class and section from CSV
                class_name_str = row.get('* Class Name', '').strip()
                section_name_str = row.get('* Section Name', '').strip()
                class_id = None
                
                if class_name_str and section_name_str:
                    cache_key = (class_name_str, section_name_str)
                    
                    if cache_key in class_cache:
                        class_id = class_cache[cache_key]
                    else:
                        # Step 1: Ensure ClassName exists in master data
                        class_name_record = db.query(ClassName).filter(ClassName.name == class_name_str).first()
                        if not class_name_record:
                            class_name_record = ClassName(name=class_name_str, is_active=True)
                            db.add(class_name_record)
                            db.flush()
                            created_classes.append(class_name_str)
                        
                        # Step 2: Ensure Section exists in master data
                        section_record = db.query(Section).filter(Section.name == section_name_str).first()
                        if not section_record:
                            section_record = Section(name=section_name_str, is_active=True)
                            db.add(section_record)
                            db.flush()
                            created_sections.append(section_name_str)
                        
                        # Step 3: Ensure ClassSection mapping exists
                        class_section_mapping = db.query(ClassSection).filter(
                            ClassSection.class_name_id == class_name_record.id,
                            ClassSection.section_id == section_record.id
                        ).first()
                        if not class_section_mapping:
                            class_section_mapping = ClassSection(
                                class_name_id=class_name_record.id,
                                section_id=section_record.id,
                                is_active=True
                            )
                            db.add(class_section_mapping)
                            db.flush()
                        
                        # Step 4: Ensure Class (enrollment class) exists
                        class_obj = db.query(Class).filter(
                            Class.class_name == class_name_str,
                            Class.section_name == section_name_str
                        ).first()
                        
                        if not class_obj:
                            class_obj = Class(
                                name=f"{class_name_str} - {section_name_str}",
                                class_name=class_name_str, 
                                section_name=section_name_str, 
                                is_active=True
                            )
                            db.add(class_obj)
                            db.flush()
                        
                        class_id = class_obj.id
                        class_cache[cache_key] = class_id
                
                # Parse date of birth
                dob_str = row.get('Date of Birth', '').strip()
                dob = None
                if dob_str:
                    # Try different date formats
                    for fmt in ['%m/%d/%Y', '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y']:
                        try:
                            dob = datetime.strptime(dob_str, fmt).date()
                            break
                        except ValueError:
                            continue
                
                # Validate and sanitize gender
                gender_raw = row.get('Gender', '').strip()
                gender = None
                if gender_raw:
                    gender_lower = gender_raw.lower()
                    if gender_lower in ['male', 'm']:
                        gender = 'Male'
                    elif gender_lower in ['female', 'f']:
                        gender = 'Female'
                    elif gender_lower == 'other':
                        gender = 'Other'
                    # If invalid gender value, leave as None
                
                # Helper function to truncate strings safely
                def safe_str(value, max_len=None):
                    if not value:
                        return None
                    s = str(value).strip()
                    if not s:
                        return None
                    if max_len:
                        return s[:max_len]
                    return s
                
                # Create student
                student = Student(
                    admission_number=admission_no,
                    roll_number=admission_no,  # Use admission number as roll number
                    rfid_id=safe_str(row.get('Enter RFID / FACE / Finger print ID number'), 50),
                    first_name=safe_str(row.get('Student Name'), 100) or '',
                    surname=safe_str(row.get('Student Surname'), 100),
                    father_guardian_name=safe_str(row.get('Fathers or Guardians Name'), 200),
                    mobile_number=safe_str(row.get('Mobile Number'), 15),
                    session_timings=safe_str(row.get('* Sessions (Student Timings)'), 100),
                    class_id=class_id,
                    aadhaar_number=safe_str(row.get('Adhar Card Number'), 20),
                    parent_login_username=safe_str(row.get('Login Username For Parent'), 100),
                    parent_login_password=safe_str(row.get('Login Password For Parent'), 255),
                    mother_name=safe_str(row.get('Mothers Name'), 200),
                    blood_group=safe_str(row.get('Blood Group'), 10),
                    caste=safe_str(row.get('Caste'), 50),
                    phone_number=safe_str(row.get('Phone Number'), 15),
                    email=safe_str(row.get('Email id'), 100),
                    address=safe_str(row.get('Address')),  # Text field, no limit
                    date_of_birth=dob,
                    gender=gender,
                    is_active=True
                )
                
                db.add(student)
                imported_count += 1
                
                # Commit in batches of 50 to avoid memory issues
                if imported_count % 50 == 0:
                    db.commit()
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        # Final commit
        db.commit()
        
        # Build summary message
        summary_parts = [f"Successfully imported {imported_count} students"]
        if skipped_count > 0:
            summary_parts.append(f"{skipped_count} already existed (skipped)")
        if created_classes:
            summary_parts.append(f"Created {len(set(created_classes))} new class name(s): {', '.join(set(created_classes))}")
        if created_sections:
            summary_parts.append(f"Created {len(set(created_sections))} new section(s): {', '.join(set(created_sections))}")
        
        return {
            "message": ". ".join(summary_parts),
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "total_rows": total_rows,
            "created_classes": list(set(created_classes)),
            "created_sections": list(set(created_sections)),
            "errors": errors[:50] if errors else []  # Return first 50 errors
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing CSV: {str(e)}"
        )


@router.get("/export/csv", summary="Export Students to CSV")
async def export_students_csv(
    class_name: Optional[str] = Query(None, description="Filter by class name"),
    section: Optional[str] = Query(None, description="Filter by section"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    current_user: User = Depends(require_role("admin", "super_admin")),
    db: Session = Depends(get_db)
):
    """Export students to CSV format (Admin/Super Admin only)."""
    from fastapi.responses import StreamingResponse
    
    query = db.query(Student).options(joinedload(Student.class_info))
    
    if class_name:
        query = query.join(Class).filter(Class.class_name.ilike(f"%{class_name}%"))
    
    if section:
        if not class_name:
            query = query.join(Class)
        query = query.filter(Class.section_name.ilike(f"%{section}%"))
    
    if is_active is not None:
        query = query.filter(Student.is_active == is_active)
    
    students = query.all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    headers = [
        "Admission No", "RFID ID", "Student Name", "Student Surname",
        "Fathers or Guardians Name", "Mobile Number", "Sessions",
        "Class Name", "Section Name", "Adhar Card Number", "Mothers Name",
        "Blood Group", "Caste", "Phone Number", "Email", "Address",
        "Date of Birth", "Gender", "Active"
    ]
    writer.writerow(headers)
    
    # Write data
    for s in students:
        writer.writerow([
            s.admission_number,
            s.rfid_id or '',
            s.first_name,
            s.surname or '',
            s.father_guardian_name or '',
            s.mobile_number or '',
            s.session_timings or '',
            s.class_info.class_name if s.class_info else '',
            s.class_info.section_name if s.class_info else '',
            s.aadhaar_number or '',
            s.mother_name or '',
            s.blood_group or '',
            s.caste or '',
            s.phone_number or '',
            s.email or '',
            s.address or '',
            s.date_of_birth.strftime('%m/%d/%Y') if s.date_of_birth else '',
            s.gender or '',
            'Yes' if s.is_active else 'No'
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=students_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )


@router.get("/{student_id}/performance-report", summary="Get Student Performance Report")
async def get_student_performance_report(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get performance report for a student including:
    - Student details
    - Attendance summary
    - Grade scale
    """
    # Get student with class info
    student = db.query(Student).options(joinedload(Student.class_info)).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get grade criteria from database
    grade_criteria = db.query(GradeCriteria).filter(
        GradeCriteria.is_active == True
    ).order_by(GradeCriteria.min_percentage.desc()).all()
    
    # Build grade scale from database
    grade_scale = {}
    for gc in grade_criteria:
        if gc.min_percentage == gc.max_percentage:
            grade_scale[gc.grade] = f"{int(gc.min_percentage)}%"
        else:
            grade_scale[gc.grade] = f"{int(gc.min_percentage)}-{gc.max_percentage}%"
    
    # Fallback if no criteria in database
    if not grade_criteria:
        grade_scale = {
            "A1": "91-100%",
            "A2": "81-90%",
            "B1": "71-80%",
            "B2": "61-70%",
            "C1": "51-60%",
            "C2": "41-50%",
            "D": "33-40%",
            "E": "Below 33%"
        }
    
    # Calculate attendance data
    # Get the current academic year (Jan to Dec of current year or adjust as needed)
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date.today()
    
    # Calculate working days (exclude Sundays) - OPTIMIZED with NumPy/Pandas
    total_working_days = calculate_working_days_vectorized(year_start, year_end)
    
    # Get attendance counts for this student
    attendance_counts = db.query(
        AttendanceLog.status,
        func.count(AttendanceLog.id)
    ).filter(
        AttendanceLog.student_id == student_id,
        AttendanceLog.attendance_date >= year_start,
        AttendanceLog.attendance_date <= year_end
    ).group_by(AttendanceLog.status).all()
    
    counts_dict = {status: count for status, count in attendance_counts}
    days_present = counts_dict.get("present", 0) + counts_dict.get("late", 0)
    days_late = counts_dict.get("late", 0)
    days_absent = total_working_days - days_present if total_working_days > days_present else 0
    
    attendance_percentage = round((days_present / total_working_days * 100), 2) if total_working_days > 0 else 0
    
    # Fetch exam marks for this student
    exam_marks = db.query(StudentExamMark).options(
        joinedload(StudentExamMark.subject),
        joinedload(StudentExamMark.exam_type)
    ).filter(
        StudentExamMark.student_id == student_id
    ).all()
    
    # Group marks by exam type
    exams_dict = {}
    for mark in exam_marks:
        if not mark.exam_type:
            continue
        exam_id = mark.exam_type_id
        if exam_id not in exams_dict:
            exams_dict[exam_id] = {
                "exam_name": mark.exam_type.name,
                "exam_date": str(mark.created_at.date()) if mark.created_at else None,
                "subjects": [],
                "total_marks_obtained": 0,
                "total_max_marks": 0
            }
        
        # Calculate grade and grade point for this subject
        marks_obtained = mark.marks_obtained if mark.marks_obtained is not None else 0
        max_marks = mark.max_marks or 50
        percentage = (marks_obtained / max_marks * 100) if max_marks > 0 else 0
        
        subject_grade = "N/A"
        subject_grade_point = 0.0
        for gc in grade_criteria:
            if gc.min_percentage <= percentage <= gc.max_percentage:
                subject_grade = gc.grade
                subject_grade_point = gc.grade_point if gc.grade_point else 0.0
                break
        
        subject_data = {
            "subject_name": mark.subject.name if mark.subject else "Unknown",
            "marks_obtained": int(marks_obtained) if not mark.is_absent else "AB",
            "total_marks": int(max_marks),
            "grade_point": round(subject_grade_point, 1),
            "grade": subject_grade,
            "is_absent": mark.is_absent
        }
        exams_dict[exam_id]["subjects"].append(subject_data)
        
        if not mark.is_absent:
            exams_dict[exam_id]["total_marks_obtained"] += marks_obtained
            exams_dict[exam_id]["total_max_marks"] += max_marks
    
    # Calculate overall GPA and grade for each exam
    exams_list = []
    for exam_id, exam_data in exams_dict.items():
        total_obtained = exam_data["total_marks_obtained"]
        total_max = exam_data["total_max_marks"]
        overall_percentage = (total_obtained / total_max * 100) if total_max > 0 else 0
        
        # Calculate average GPA from subject grade points
        subject_gpa_list = [s["grade_point"] for s in exam_data["subjects"] if not s.get("is_absent", False)]
        average_gpa = sum(subject_gpa_list) / len(subject_gpa_list) if subject_gpa_list else 0.0
        # Round to nearest decimal (1 decimal place)
        average_gpa = round(average_gpa, 1)
        
        overall_grade = "N/A"
        for gc in grade_criteria:
            if gc.min_percentage <= overall_percentage <= gc.max_percentage:
                overall_grade = gc.grade
                break
        
        exams_list.append({
            "exam_name": exam_data["exam_name"],
            "exam_date": exam_data["exam_date"],
            "subjects": exam_data["subjects"],
            "total_marks_obtained": int(total_obtained),
            "total_max_marks": int(total_max),
            "average_gpa": average_gpa,
            "overall_grade": overall_grade
        })
    
    return {
        "student": {
            "id": student.id,
            "admission_number": student.admission_number,
            "full_name": f"{student.first_name} {student.surname or ''}".strip(),
            "first_name": student.first_name,
            "surname": student.surname,
            "date_of_birth": str(student.date_of_birth) if student.date_of_birth else None,
            "gender": student.gender,
            "class_name": student.class_info.class_name if student.class_info else None,
            "section_name": student.class_info.section_name if student.class_info else None,
            "father_guardian_name": student.father_guardian_name,
            "mother_name": student.mother_name,
            "mobile_number": student.mobile_number,
            "address": student.address,
            "admission_date": str(student.admission_date) if student.admission_date else None,
            "photo_thumbnail": student.photo_thumbnail,
            "photo_data": student.photo_data
        },
        "attendance": {
            "from_date": str(year_start),
            "to_date": str(year_end),
            "total_working_days": total_working_days,
            "days_present": days_present,
            "days_absent": days_absent,
            "days_late": days_late,
            "attendance_percentage": attendance_percentage
        },
        "fees": {
            "total_fee_amount": 0,
            "total_paid": 0,
            "total_pending": 0,
            "total_partial": 0,
            "fee_records": []
        },
        "exams": exams_list,
        "grade_scale": grade_scale
    }
