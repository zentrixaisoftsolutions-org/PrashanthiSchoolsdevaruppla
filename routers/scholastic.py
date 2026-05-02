from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
from database import get_db
from models import (
    ScholasticCategory, ScholasticParameter, StudentScholasticGrade,
    Student, AcademicYear, ClassSection, Class,
)
from schemas import (
    ScholasticCategoryCreate, ScholasticParameterCreate,
    ScholasticCategoriesResponse, ScholasticCategoryInfo, ScholasticParameterInfo,
    ScholasticGradesBulkRequest, ScholasticGridResponse, ScholasticGridStudent,
)
from auth import get_current_user, require_role, User

router = APIRouter(prefix="/api/scholastic", tags=["Scholastic Areas"])

TERM_LABELS = {1: "Term I", 2: "Term II", 3: "Term III"}


# ==================== CATEGORY / PARAMETER MASTER DATA ====================

@router.get("/categories", summary="Get all scholastic categories with parameters")
async def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cats = (
        db.query(ScholasticCategory)
        .filter(ScholasticCategory.is_active == True)
        .options(joinedload(ScholasticCategory.parameters))
        .order_by(ScholasticCategory.display_order)
        .all()
    )
    result: List[ScholasticCategoryInfo] = []
    for c in cats:
        params = sorted(
            [p for p in c.parameters if p.is_active],
            key=lambda p: p.display_order,
        )
        result.append(ScholasticCategoryInfo(
            id=c.id,
            name=c.name,
            group_name=c.group_name,
            display_order=c.display_order,
            parameters=[ScholasticParameterInfo(id=p.id, name=p.name, display_order=p.display_order) for p in params],
        ))
    return ScholasticCategoriesResponse(categories=result)


@router.post("/categories", summary="Create a scholastic category")
async def create_category(
    data: ScholasticCategoryCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    cat = ScholasticCategory(name=data.name, group_name=data.group_name, display_order=data.display_order)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "message": "Category created"}


@router.put("/categories/{category_id}", summary="Update a scholastic category")
async def update_category(
    category_id: int,
    data: ScholasticCategoryCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    cat = db.query(ScholasticCategory).filter(ScholasticCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.name = data.name
    cat.group_name = data.group_name
    cat.display_order = data.display_order
    db.commit()
    return {"message": "Category updated"}


@router.delete("/categories/{category_id}", summary="Delete a scholastic category")
async def delete_category(
    category_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    cat = db.query(ScholasticCategory).filter(ScholasticCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.is_active = False
    db.commit()
    return {"message": "Category deleted"}


@router.post("/parameters", summary="Create a scholastic parameter")
async def create_parameter(
    data: ScholasticParameterCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    cat = db.query(ScholasticCategory).filter(ScholasticCategory.id == data.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    param = ScholasticParameter(category_id=data.category_id, name=data.name, display_order=data.display_order)
    db.add(param)
    db.commit()
    db.refresh(param)
    return {"id": param.id, "name": param.name, "message": "Parameter created"}


@router.put("/parameters/{parameter_id}", summary="Update a scholastic parameter")
async def update_parameter(
    parameter_id: int,
    data: ScholasticParameterCreate,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    param = db.query(ScholasticParameter).filter(ScholasticParameter.id == parameter_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    param.name = data.name
    param.category_id = data.category_id
    param.display_order = data.display_order
    db.commit()
    return {"message": "Parameter updated"}


@router.delete("/parameters/{parameter_id}", summary="Delete a scholastic parameter")
async def delete_parameter(
    parameter_id: int,
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    param = db.query(ScholasticParameter).filter(ScholasticParameter.id == parameter_id).first()
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    param.is_active = False
    db.commit()
    return {"message": "Parameter deleted"}


# ==================== SEED DEFAULT DATA ====================

@router.post("/seed-defaults", summary="Seed default scholastic categories/parameters")
async def seed_defaults(
    current_user: User = Depends(require_role("super_admin", "admin")),
    db: Session = Depends(get_db),
):
    """Seed the standard scholastic categories and parameters from the school report card."""
    existing = db.query(ScholasticCategory).filter(ScholasticCategory.is_active == True).count()
    if existing > 0:
        return {"message": f"Already have {existing} categories. Skipped seeding."}

    defaults = [
        ("MATHEMATICS", "SCHOLASTIC AREAS", 1, ["Conceptual Understanding", "Activities", "Tables", "Speed Math"]),
        ("EVS", "SCHOLASTIC AREAS", 2, ["Environmental Sensitivity", "Activity / Project", "Group Discussion"]),
        ("GAMES", "CO-CURRICULAR ACTIVITIES", 3, ["Enthusiasm", "Discipline", "Team Building", "Talent"]),
        ("ART & CRAFT", "CO-CURRICULAR ACTIVITIES", 4, ["Interest", "Creativity", "Skill"]),
        ("PERSONALITY", "CO-CURRICULAR ACTIVITIES", 5, [
            "Courtesy", "Confidence", "Care for Belongings", "Neatness",
            "Regularity & Punctuality", "Initiative", "Sharing & Caring",
            "Respect for Others Property", "Self-control", "Honesty",
        ]),
        ("PHYSICAL ASPECTS", "PHYSICAL ASPECTS", 6, ["Height (in cms)", "Weight (in kgs)"]),
    ]

    count = 0
    for cat_name, group, order, params in defaults:
        cat = ScholasticCategory(name=cat_name, group_name=group, display_order=order)
        db.add(cat)
        db.flush()
        for i, pname in enumerate(params, 1):
            db.add(ScholasticParameter(category_id=cat.id, name=pname, display_order=i))
            count += 1

    db.commit()
    return {"message": f"Seeded {len(defaults)} categories with {count} parameters"}


# ==================== GRADE ENTRY GRID ====================

@router.get("/grid", summary="Get scholastic grade entry grid")
async def get_scholastic_grid(
    term_number: int,
    class_section_id: int,
    academic_year_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if term_number not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="term_number must be 1, 2, or 3")

    cs = db.query(ClassSection).options(
        joinedload(ClassSection.class_name), joinedload(ClassSection.section)
    ).filter(ClassSection.id == class_section_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    academic_year_name = None
    if academic_year_id:
        ay = db.query(AcademicYear).filter(AcademicYear.id == academic_year_id).first()
        if ay:
            academic_year_name = ay.name

    # Get categories & parameters
    cats = (
        db.query(ScholasticCategory)
        .filter(ScholasticCategory.is_active == True)
        .options(joinedload(ScholasticCategory.parameters))
        .order_by(ScholasticCategory.display_order)
        .all()
    )
    categories_info: List[ScholasticCategoryInfo] = []
    all_param_ids: List[int] = []
    for c in cats:
        params = sorted([p for p in c.parameters if p.is_active], key=lambda p: p.display_order)
        categories_info.append(ScholasticCategoryInfo(
            id=c.id, name=c.name, group_name=c.group_name, display_order=c.display_order,
            parameters=[ScholasticParameterInfo(id=p.id, name=p.name, display_order=p.display_order) for p in params],
        ))
        all_param_ids.extend([p.id for p in params])

    # Get students
    class_name = cs.class_name.name if cs.class_name else ""
    section_name = cs.section.name if cs.section else ""
    students_query = (
        db.query(Student).join(Class)
        .filter(Class.class_name == class_name, Class.section_name == section_name, Student.is_active == True)
        .order_by(Student.first_name)
        .all()
    )

    student_ids = [s.id for s in students_query]

    # Load existing grades
    existing_grades: dict = {}
    if student_ids and all_param_ids:
        q = db.query(StudentScholasticGrade).filter(
            StudentScholasticGrade.student_id.in_(student_ids),
            StudentScholasticGrade.parameter_id.in_(all_param_ids),
            StudentScholasticGrade.term_number == term_number,
        )
        if academic_year_id:
            q = q.filter(StudentScholasticGrade.academic_year_id == academic_year_id)
        for g in q.all():
            existing_grades[(g.student_id, g.parameter_id)] = g

    students_result: List[ScholasticGridStudent] = []
    for s in students_query:
        grades_dict: dict = {}
        for pid in all_param_ids:
            key = (s.id, pid)
            if key in existing_grades:
                g = existing_grades[key]
                if g.numeric_value is not None:
                    grades_dict[str(pid)] = g.numeric_value
                else:
                    grades_dict[str(pid)] = g.grade
            else:
                grades_dict[str(pid)] = None
        students_result.append(ScholasticGridStudent(
            student_id=s.id,
            student_name=f"{s.first_name} {s.surname or ''}".strip(),
            admission_number=s.admission_number or "",
            grades=grades_dict,
        ))

    return ScholasticGridResponse(
        term_number=term_number,
        term_label=TERM_LABELS[term_number],
        academic_year_id=academic_year_id,
        academic_year_name=academic_year_name,
        class_section_id=class_section_id,
        class_name=class_name,
        section_name=section_name,
        categories=categories_info,
        students=students_result,
    )


# ==================== SAVE GRADES ====================

@router.post("/grades", summary="Bulk save scholastic grades")
async def save_scholastic_grades(
    data: ScholasticGradesBulkRequest,
    current_user: User = Depends(require_role("super_admin", "admin", "teacher")),
    db: Session = Depends(get_db),
):
    created_count = 0
    updated_count = 0

    for entry in data.entries:
        existing = db.query(StudentScholasticGrade).filter(
            StudentScholasticGrade.student_id == entry.student_id,
            StudentScholasticGrade.parameter_id == entry.parameter_id,
            StudentScholasticGrade.term_number == data.term_number,
            StudentScholasticGrade.class_section_id == data.class_section_id,
        )
        if data.academic_year_id:
            existing = existing.filter(StudentScholasticGrade.academic_year_id == data.academic_year_id)
        existing = existing.first()

        if existing:
            existing.grade = entry.grade
            existing.numeric_value = entry.numeric_value
            updated_count += 1
        else:
            rec = StudentScholasticGrade(
                student_id=entry.student_id,
                parameter_id=entry.parameter_id,
                term_number=data.term_number,
                academic_year_id=data.academic_year_id,
                class_section_id=data.class_section_id,
                grade=entry.grade,
                numeric_value=entry.numeric_value,
            )
            db.add(rec)
            created_count += 1

    db.commit()
    return {"message": "Scholastic grades saved", "created": created_count, "updated": updated_count}


# ==================== STUDENT REPORT (Multi-Term) ====================

@router.get("/student-report", summary="Get scholastic grades for all 3 terms for report printing")
async def get_student_scholastic_report(
    class_section_id: int,
    academic_year_id: Optional[int] = None,
    student_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns scholastic grades for 3 terms for all students (or one student) for printing on back of report card."""
    cs = db.query(ClassSection).options(
        joinedload(ClassSection.class_name), joinedload(ClassSection.section)
    ).filter(ClassSection.id == class_section_id).first()
    if not cs:
        raise HTTPException(status_code=404, detail="Class section not found")

    class_name = cs.class_name.name if cs.class_name else ""
    section_name = cs.section.name if cs.section else ""

    # Get categories & parameters
    cats = (
        db.query(ScholasticCategory)
        .filter(ScholasticCategory.is_active == True)
        .options(joinedload(ScholasticCategory.parameters))
        .order_by(ScholasticCategory.display_order)
        .all()
    )
    categories_info = []
    all_param_ids = []
    for c in cats:
        params = sorted([p for p in c.parameters if p.is_active], key=lambda p: p.display_order)
        categories_info.append({
            "id": c.id, "name": c.name, "group_name": c.group_name,
            "parameters": [{"id": p.id, "name": p.name} for p in params],
        })
        all_param_ids.extend([p.id for p in params])

    # Get students
    students_query = (
        db.query(Student).join(Class)
        .filter(Class.class_name == class_name, Class.section_name == section_name, Student.is_active == True)
    )
    if student_id:
        students_query = students_query.filter(Student.id == student_id)
    students_query = students_query.order_by(Student.first_name).all()

    student_ids = [s.id for s in students_query]

    # Load grades for all 3 terms
    all_grades: dict = {}  # (student_id, param_id, term_number) -> grade_value
    if student_ids and all_param_ids:
        q = db.query(StudentScholasticGrade).filter(
            StudentScholasticGrade.student_id.in_(student_ids),
            StudentScholasticGrade.parameter_id.in_(all_param_ids),
            StudentScholasticGrade.term_number.in_([1, 2, 3]),
        )
        if academic_year_id:
            q = q.filter(StudentScholasticGrade.academic_year_id == academic_year_id)
        for g in q.all():
            val = g.numeric_value if g.numeric_value is not None else (g.grade or "")
            all_grades[(g.student_id, g.parameter_id, g.term_number)] = val

    students_result = []
    for s in students_query:
        term_grades = {}
        for tn in [1, 2, 3]:
            param_grades = {}
            for pid in all_param_ids:
                param_grades[str(pid)] = all_grades.get((s.id, pid, tn), None)
            term_grades[str(tn)] = param_grades
        students_result.append({
            "student_id": s.id,
            "student_name": f"{s.first_name} {s.surname or ''}".strip(),
            "admission_number": s.admission_number or "",
            "father_name": s.father_name or "",
            "term_grades": term_grades,
        })

    return {
        "class_name": class_name,
        "section_name": section_name,
        "categories": categories_info,
        "terms": [
            {"id": 1, "name": "Term I", "label": "Term I"},
            {"id": 2, "name": "Term II", "label": "Term II"},
            {"id": 3, "name": "Term III", "label": "Term III"},
        ],
        "students": students_result,
    }
