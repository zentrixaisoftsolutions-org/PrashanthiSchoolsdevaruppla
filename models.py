from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Enum, Date, Time, Text
from sqlalchemy.orm import relationship
import enum
from database import Base

# ==================== ENUMS ====================
class RoleEnum(str, enum.Enum):
    """User role enumeration."""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"
    PARENT = "parent"

class GradeEnum(str, enum.Enum):
    """Grade enumeration as per CBSE/ICSE standards."""
    A_PLUS = "A+"
    A = "A"
    B_PLUS = "B+"
    B = "B"
    C_PLUS = "C+"
    C = "C"
    D = "D"
    E = "E"
    F = "F"

class GenderEnum(str, enum.Enum):
    """Gender enumeration."""
    MALE = "Male"
    FEMALE = "Female"
    OTHER = "Other"

class BloodGroupEnum(str, enum.Enum):
    """Blood group enumeration."""
    A_POSITIVE = "A+"
    A_NEGATIVE = "A-"
    B_POSITIVE = "B+"
    B_NEGATIVE = "B-"
    AB_POSITIVE = "AB+"
    AB_NEGATIVE = "AB-"
    O_POSITIVE = "O+"
    O_NEGATIVE = "O-"

# ==================== USER MANAGEMENT ====================
class Role(Base):
    """Role model for role-based access control."""
    __tablename__ = "roles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    users = relationship("User", back_populates="role")

class User(Base):
    """User model for authentication."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(15), nullable=True)
    is_active = Column(Boolean, default=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    role = relationship("Role", back_populates="users")
    student = relationship("Student", back_populates="user", uselist=False)
    parent = relationship("Parent", back_populates="user", uselist=False)

# ==================== ACADEMIC MASTER DATA ====================
class ClassName(Base):
    """Master data for class names (e.g., Class 1, Class 2)."""
    __tablename__ = "class_names"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "Class 1", "Class 2"
    display_order = Column(Integer, default=0)  # For sorting
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    class_sections = relationship("ClassSection", back_populates="class_name", cascade="all, delete-orphan")

class Section(Base):
    """Master data for section names (e.g., Lily, Rose, Daffodil)."""
    __tablename__ = "sections"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "Lily", "Rose", "Daffodil"
    display_order = Column(Integer, default=0)  # For sorting
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    class_sections = relationship("ClassSection", back_populates="section", cascade="all, delete-orphan")

class ClassSection(Base):
    """Association table mapping Classes to Sections (e.g., Class 6 -> Lily, Rose, Daffodil)."""
    __tablename__ = "class_sections"
    
    id = Column(Integer, primary_key=True, index=True)
    class_name_id = Column(Integer, ForeignKey("class_names.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=False)
    capacity = Column(Integer, default=50)  # Max students in this class-section
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    class_name = relationship("ClassName", back_populates="class_sections")
    section = relationship("Section", back_populates="class_sections")

class Subject(Base):
    """Subject model for teaching subjects."""
    __tablename__ = "subjects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    class_section_subjects = relationship("SubjectClassSection", back_populates="subject", cascade="all, delete-orphan")


class SubjectClassSection(Base):
    """Association table mapping Subjects to ClassSections."""
    __tablename__ = "subject_class_sections"
    
    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    subject = relationship("Subject", back_populates="class_section_subjects")
    class_section = relationship("ClassSection")

class Class(Base):
    """Class model for organizing students."""
    __tablename__ = "classes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # Combined name e.g., "1 CLASS - A"
    class_name = Column(String(50), nullable=False, index=True)  # e.g., "1 CLASS", "2 CLASS"
    section_name = Column(String(20), nullable=False, index=True)  # e.g., "A", "B", "BB"
    capacity = Column(Integer, default=50)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    students = relationship("Student", back_populates="class_info")

# ==================== STUDENT & PARENT ====================
class Parent(Base):
    """Parent/Guardian model."""
    __tablename__ = "parents"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    guardian_relationship = Column(String(50), nullable=False)  # Father, Mother, Guardian
    occupation = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="parent")
    students = relationship("Student", back_populates="parent")

class Student(Base):
    """Student model with comprehensive details as per CSV structure."""
    __tablename__ = "students"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Basic Identification
    admission_number = Column(String(50), unique=True, nullable=False, index=True)  # Admission No
    rfid_id = Column(String(50), nullable=True, index=True)  # RFID / FACE / Finger print ID
    
    # Personal Details
    first_name = Column(String(100), nullable=False)  # Student Name
    surname = Column(String(100), nullable=True)  # Student Surname
    date_of_birth = Column(Date, nullable=True)  # Date of Birth
    gender = Column(String(20), nullable=True)  # Gender
    blood_group = Column(String(10), nullable=True)  # Blood Group
    caste = Column(String(50), nullable=True)  # Caste
    aadhaar_number = Column(String(20), nullable=True, index=True)  # Adhar Card Number
    pen = Column(String(50), nullable=True, index=True)  # PEN (Permanent Education Number)
    photo_data = Column(Text, nullable=True)  # Base64 encoded photo (full resolution)
    photo_thumbnail = Column(Text, nullable=True)  # Base64 encoded thumbnail (low-res for list view)
    
    # Contact Information
    mobile_number = Column(String(15), nullable=True, index=True)  # Mobile Number
    phone_number = Column(String(15), nullable=True)  # Alternative Phone Number
    email = Column(String(100), nullable=True)  # Email id
    address = Column(Text, nullable=True)  # Address
    
    # Parent/Guardian Details
    father_guardian_name = Column(String(200), nullable=True)  # Fathers or Guardians Name
    mother_name = Column(String(200), nullable=True)  # Mothers Name
    parent_login_username = Column(String(100), nullable=True)  # Login Username For Parent
    parent_login_password = Column(String(255), nullable=True)  # Login Password For Parent (hashed)
    
    # Academic Details
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=True)
    session_timings = Column(String(100), nullable=True)  # Sessions (Student Timings)
    admission_date = Column(Date, nullable=True)  # Can be derived from admission number
    
    # Legacy relationships (kept for backward compatibility but nullable)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=True)
    parent_id = Column(Integer, ForeignKey("parents.id"), nullable=True)
    roll_number = Column(String(20), nullable=True, index=True)  # Legacy field
    
    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="student")
    class_info = relationship("Class", back_populates="students")
    parent = relationship("Parent", back_populates="students")

# ==================== GRADE CRITERIA ====================
class GradeCriteria(Base):
    """Grade criteria model for dynamic grade calculation."""
    __tablename__ = "grade_criteria"
    
    id = Column(Integer, primary_key=True, index=True)
    min_percentage = Column(Float, nullable=False)  # From percentage
    max_percentage = Column(Float, nullable=False)  # To percentage
    grade = Column(String(20), nullable=False)  # Grade name (A1, A2, B1, etc.)
    teacher_remarks = Column(String(100), nullable=True)  # e.g., "Excellent work"
    grade_point = Column(Integer, nullable=True)  # e.g., 10, 9, 8
    general_remarks = Column(String(255), nullable=True)  # Longer remarks
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)  # For sorting
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== ACADEMIC YEAR ====================
class AcademicYear(Base):
    """Academic year model for managing school years."""
    __tablename__ = "academic_years"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(20), unique=True, nullable=False, index=True)  # e.g., "2025-2026"
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(Boolean, default=False)  # Mark current academic year
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    exam_types = relationship("ExamType", back_populates="academic_year", cascade="all, delete-orphan")


# ==================== EXAM TYPE ====================
class ExamType(Base):
    """Exam type model for managing examination types (e.g., TEST-V, FORMATIVE ASSESSMENT - II)."""
    __tablename__ = "exam_types"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)  # e.g., "TEST-V", "FORMATIVE ASSESSMENT - II"
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    description = Column(String(255), nullable=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    academic_year = relationship("AcademicYear", back_populates="exam_types")
    examination_schedules = relationship("ExaminationSchedule", back_populates="exam_type", cascade="all, delete-orphan")


# ==================== EXAMINATION SCHEDULE ====================
class ExaminationSchedule(Base):
    """Examination schedule model linking exam types to class sections with date ranges."""
    __tablename__ = "examination_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    exam_type_id = Column(Integer, ForeignKey("exam_types.id"), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    exam_type = relationship("ExamType", back_populates="examination_schedules")
    academic_year = relationship("AcademicYear")
    class_sections = relationship("ExaminationScheduleClassSection", back_populates="examination_schedule", cascade="all, delete-orphan")
    subjects = relationship("ExaminationScheduleSubject", back_populates="examination_schedule", cascade="all, delete-orphan")


class ExaminationScheduleClassSection(Base):
    """Association table mapping Examination Schedules to ClassSections."""
    __tablename__ = "examination_schedule_class_sections"
    
    id = Column(Integer, primary_key=True, index=True)
    examination_schedule_id = Column(Integer, ForeignKey("examination_schedules.id"), nullable=False)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    examination_schedule = relationship("ExaminationSchedule", back_populates="class_sections")
    class_section = relationship("ClassSection")


class ExaminationScheduleSubject(Base):
    """Association table mapping Examination Schedules to Subjects with exam dates."""
    __tablename__ = "examination_schedule_subjects"
    
    id = Column(Integer, primary_key=True, index=True)
    examination_schedule_id = Column(Integer, ForeignKey("examination_schedules.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    exam_date = Column(Date, nullable=False)
    start_time = Column(String(10), nullable=True)  # e.g., "09:00"
    end_time = Column(String(10), nullable=True)   # e.g., "12:00"
    max_marks = Column(Float, default=100)
    pass_marks = Column(Float, default=35)
    display_order = Column(Integer, default=0)  # Sequence number for ordering subjects
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    examination_schedule = relationship("ExaminationSchedule", back_populates="subjects")
    subject = relationship("Subject")


# ==================== STUDENT EXAM MARKS ====================
class StudentExamMark(Base):
    """Student exam marks for storing individual subject marks per exam."""
    __tablename__ = "student_exam_marks"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    exam_type_id = Column(Integer, ForeignKey("exam_types.id"), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)
    marks_obtained = Column(Float, nullable=True)  # Null if absent
    max_marks = Column(Float, default=50)
    min_marks = Column(Float, default=18)
    is_absent = Column(Boolean, default=False)  # For "AB" entries
    remarks = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    student = relationship("Student")
    subject = relationship("Subject")
    exam_type = relationship("ExamType")
    academic_year = relationship("AcademicYear")
    class_section = relationship("ClassSection")


# ==================== ATTENDANCE DEVICE ====================
class AttendanceDevice(Base):
    """RFID/Face Recognition device model for attendance tracking."""
    __tablename__ = "attendance_devices"
    
    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String(100), nullable=False)  # User-friendly device name
    device_model = Column(String(50), nullable=True)  # e.g., "SA-AI06"
    serial_number = Column(String(100), unique=True, nullable=True)  # e.g., "AY SF05 070038"
    ip_address = Column(String(45), nullable=False)  # Device IP address
    port = Column(Integer, default=6321)  # TCP/IP port (from device specs)
    comm_key = Column(Integer, default=0, nullable=True)  # ZKTeco communication key (password)
    connection_type = Column(String(20), default="TCP/IP")  # TCP/IP, RS485, Wiegand, ZKTeco
    location = Column(String(200), nullable=True)  # Physical location (e.g., "Main Gate")
    status = Column(String(20), default="disconnected")  # connected, disconnected, error
    last_connected_at = Column(DateTime, nullable=True)
    last_heartbeat_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    attendance_logs = relationship("AttendanceLog", back_populates="device", cascade="all, delete-orphan")


# ==================== ATTENDANCE LOG ====================
class AttendanceStatusEnum(str, enum.Enum):
    """Attendance status enumeration."""
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    HALF_DAY = "half_day"


class AttendanceLog(Base):
    """Daily attendance log for students."""
    __tablename__ = "attendance_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    device_id = Column(Integer, ForeignKey("attendance_devices.id"), nullable=True)
    rfid_scanned = Column(String(50), nullable=True)  # RFID that was scanned
    attendance_date = Column(Date, nullable=False, index=True)
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="present")  # present, absent, late, half_day
    is_manual_entry = Column(Boolean, default=False)  # If manually marked
    remarks = Column(String(255), nullable=True)
    sms_sent = Column(Boolean, default=False)  # Whether SMS notification was sent
    whatsapp_sent = Column(Boolean, default=False)  # Whether WhatsApp notification was sent
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    student = relationship("Student")
    device = relationship("AttendanceDevice", back_populates="attendance_logs")


# ==================== SMS CONFIGURATION ====================
class SMSConfig(Base):
    """SMS API configuration for sending notifications."""
    __tablename__ = "sms_configurations"
    
    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String(50), nullable=False)  # e.g., "Twilio", "MSG91", "Fast2SMS"
    api_key = Column(String(255), nullable=False)
    api_secret = Column(String(255), nullable=True)
    sender_id = Column(String(50), nullable=True)  # Sender ID/Name
    base_url = Column(String(255), nullable=True)  # API base URL
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)  # Default SMS provider
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sms_logs = relationship("SMSLog", back_populates="config", cascade="all, delete-orphan")


# ==================== SMS LOG ====================
class SMSLog(Base):
    """Log of sent SMS messages."""
    __tablename__ = "sms_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(Integer, ForeignKey("sms_configurations.id"), nullable=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    phone_number = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    message_type = Column(String(50), nullable=True)  # attendance_absent, attendance_late, general
    status = Column(String(20), default="pending")  # pending, sent, failed, delivered
    provider_response = Column(Text, nullable=True)  # API response
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    config = relationship("SMSConfig", back_populates="sms_logs")
    student = relationship("Student")


# ==================== SMS TEMPLATE ====================
class SMSTemplate(Base):
    """SMS templates for different notification types."""
    __tablename__ = "sms_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # Template name
    template_type = Column(String(50), nullable=False)  # attendance_absent, attendance_late, etc.
    message_template = Column(Text, nullable=False)  # Template with placeholders like {student_name}
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== USER MENU ACCESS ====================
class UserMenuAccess(Base):
    """Per-user menu access control. If no records exist for a user, role-based defaults apply."""
    __tablename__ = "user_menu_access"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_path = Column(String(200), nullable=False)  # e.g. "/dashboard", "/students", "/examination/results"
    is_allowed = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User")


# ==================== FEE MANAGEMENT ====================
class FeeStructure(Base):
    """Fee structure defining fee components for each class per academic year."""
    __tablename__ = "fee_structures"

    id = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False)
    class_name_id = Column(Integer, ForeignKey("class_names.id"), nullable=False)
    term = Column(Integer, nullable=False, default=1)  # 1, 2, or 3
    fee_type = Column(String(100), nullable=False)  # e.g., "Tuition Fee", "Lab Fee", "Transport Fee"
    amount = Column(Float, nullable=False)
    frequency = Column(String(30), default="term")  # term, yearly, one_time
    description = Column(String(255), nullable=True)
    is_mandatory = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    academic_year = relationship("AcademicYear")
    class_name = relationship("ClassName")


class FeePayment(Base):
    """Records of fee payments made by students."""
    __tablename__ = "fee_payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False)
    fee_structure_id = Column(Integer, ForeignKey("fee_structures.id"), nullable=True)
    term = Column(Integer, nullable=True)  # 1, 2, or 3
    amount_paid = Column(Float, nullable=False)
    discount_type = Column(String(10), nullable=True)       # 'amount' or 'percent'
    discount_value = Column(Float, nullable=True, default=0)  # discount amount or %
    discount_amount = Column(Float, nullable=True, default=0) # computed discount ₹
    tax_percent = Column(Float, nullable=True, default=0)     # tax %
    tax_amount = Column(Float, nullable=True, default=0)      # computed tax ₹
    gross_amount = Column(Float, nullable=True)               # original fee before discount/tax
    net_amount = Column(Float, nullable=True)                 # = gross - discount + tax = amount_paid
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_method = Column(String(50), nullable=False)  # cash, razorpay, bank_transfer, cheque
    transaction_id = Column(String(255), nullable=True, index=True)  # Razorpay payment_id or cheque no.
    razorpay_order_id = Column(String(255), nullable=True, index=True)
    razorpay_signature = Column(String(512), nullable=True)
    receipt_number = Column(String(50), nullable=True, index=True)
    status = Column(String(30), default="completed")  # completed, pending, failed, refunded
    remarks = Column(String(255), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    student = relationship("Student")
    academic_year = relationship("AcademicYear")
    fee_structure = relationship("FeeStructure")
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])


class SchoolSettings(Base):
    """School branding / identity settings."""
    __tablename__ = "school_settings"

    id = Column(Integer, primary_key=True, index=True)
    school_name = Column(String(255), nullable=False, default="My School")
    address = Column(Text, nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    affiliation = Column(String(255), nullable=True)          # e.g. "Affiliated to CBSE, New Delhi"
    logo_path = Column(String(500), nullable=True)             # relative path inside uploads/
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentGatewayConfig(Base):
    """Payment gateway configuration (Razorpay etc.)."""
    __tablename__ = "payment_gateway_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False, default="razorpay")  # razorpay, paytm, etc.
    key_id = Column(String(255), nullable=False)
    key_secret = Column(String(255), nullable=False)
    webhook_secret = Column(String(255), nullable=True)
    is_test_mode = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== HELP DESK ====================
class HelpDeskTicket(Base):
    """Help desk tickets raised by users."""
    __tablename__ = "helpdesk_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(20), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(String(2000), nullable=False)
    category = Column(String(50), nullable=False, default="general")  # bug, feature, general, access
    priority = Column(String(20), nullable=False, default="medium")   # low, medium, high, critical
    status = Column(String(20), nullable=False, default="open")       # open, in_progress, resolved, closed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


class AppNotification(Base):
    """In-app notifications visible to all logged-in users."""
    __tablename__ = "app_notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    notification_type = Column(String(30), nullable=False, default="helpdesk")  # helpdesk, system, info
    reference_id = Column(Integer, nullable=True)   # e.g. ticket id
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by_user_id])


class NotificationRead(Base):
    """Tracks which users have read/dismissed a notification."""
    __tablename__ = "notification_reads"

    id = Column(Integer, primary_key=True, index=True)
    notification_id = Column(Integer, ForeignKey("app_notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    read_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== STAFF MANAGEMENT ====================
class Department(Base):
    """Departments for staff grouping (e.g., High School, Primary, Administration)."""
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff", back_populates="department")


class Staff(Base):
    """Staff members (teachers, admin, non-teaching, etc.)."""
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    rfid = Column(String(50), unique=True, nullable=True, index=True)
    employee_id = Column(String(50), unique=True, nullable=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    father_name = Column(String(100), nullable=True)
    gender = Column(String(10), nullable=True)  # Male, Female, Other
    date_of_birth = Column(Date, nullable=True)
    mobile = Column(String(15), nullable=True)
    email = Column(String(100), nullable=True)
    aadhar_number = Column(String(20), nullable=True)
    address = Column(String(500), nullable=True)
    qualification = Column(String(200), nullable=True)
    designation = Column(String(100), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    date_of_joining = Column(Date, nullable=True)
    salary = Column(Float, nullable=True)
    photo_data = Column(Text, nullable=True)  # Base64 encoded photo
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    department = relationship("Department", back_populates="staff")
    class_sections = relationship("StaffClassSection", back_populates="staff", cascade="all, delete-orphan")
    subjects = relationship("StaffSubject", back_populates="staff", cascade="all, delete-orphan")
    class_teacher_of = relationship("ClassTeacherMapping", back_populates="staff", cascade="all, delete-orphan")


class StaffClassSection(Base):
    """Maps staff to class-sections they teach / manage."""
    __tablename__ = "staff_class_sections"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff", back_populates="class_sections")
    class_section = relationship("ClassSection")


class StaffSubject(Base):
    """Maps staff to subjects they teach."""
    __tablename__ = "staff_subjects"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff", back_populates="subjects")
    subject = relationship("Subject")


class StaffAttendance(Base):
    """Daily attendance log for staff members."""
    __tablename__ = "staff_attendance"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    check_in_time = Column(DateTime, nullable=True)
    check_out_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="present")  # present, absent, late, half_day, leave
    is_manual_entry = Column(Boolean, default=False)
    remarks = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff")


class ClassTeacherMapping(Base):
    """Maps a staff member as the class teacher for a specific class-section."""
    __tablename__ = "class_teacher_mappings"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff", back_populates="class_teacher_of")
    class_section = relationship("ClassSection")


class StaffSalaryRecord(Base):
    """Monthly salary record for staff (computed from attendance)."""
    __tablename__ = "staff_salary_records"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    month = Column(Integer, nullable=False)        # 1-12
    year = Column(Integer, nullable=False)
    total_working_days = Column(Integer, nullable=False)
    days_present = Column(Integer, nullable=False, default=0)
    days_absent = Column(Integer, nullable=False, default=0)
    days_late = Column(Integer, nullable=False, default=0)
    days_half_day = Column(Integer, nullable=False, default=0)
    days_leave = Column(Integer, nullable=False, default=0)
    base_salary = Column(Float, nullable=False)            # from Staff.salary at time of calc
    deduction = Column(Float, nullable=False, default=0)   # absent-based deduction
    net_salary = Column(Float, nullable=False)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = relationship("Staff")


# ==================== ACADEMIC CALENDAR ====================
class AcademicCalendar(Base):
    """Working days per class per month for an academic year."""
    __tablename__ = "academic_calendar"

    id = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=False)
    class_name_id = Column(Integer, ForeignKey("class_names.id"), nullable=False)
    month = Column(Integer, nullable=False)     # 1-12
    year = Column(Integer, nullable=False)       # e.g. 2025
    total_working_days = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    academic_year = relationship("AcademicYear")
    class_name = relationship("ClassName")
    holidays = relationship("AcademicCalendarHoliday", back_populates="calendar", cascade="all, delete-orphan")


class AcademicCalendarHoliday(Base):
    """Holidays within an academic calendar month, auto-subtracted from working days."""
    __tablename__ = "academic_calendar_holidays"

    id = Column(Integer, primary_key=True, index=True)
    calendar_id = Column(Integer, ForeignKey("academic_calendar.id"), nullable=False)
    holiday_date = Column(Date, nullable=False)
    name = Column(String(200), nullable=False)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    calendar = relationship("AcademicCalendar", back_populates="holidays")


# ==================== STUDENT EXAM ATTENDANCE (Manual) ====================
class StudentExamAttendance(Base):
    """Manual attendance entry per student per exam per month, entered during marks entry."""
    __tablename__ = "student_exam_attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    exam_type_id = Column(Integer, ForeignKey("exam_types.id"), nullable=False)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=False)
    month = Column(Integer, nullable=False)          # 1-12
    year = Column(Integer, nullable=False)            # e.g. 2026
    total_working_days = Column(Integer, nullable=False, default=0)
    present_days = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("Student")
    exam_type = relationship("ExamType")
    academic_year = relationship("AcademicYear")
    class_section = relationship("ClassSection")


# ==================== SCHOLASTIC AREAS ====================
class ScholasticCategory(Base):
    """Categories for scholastic / co-curricular areas (e.g., Mathematics, Games, Personality)."""
    __tablename__ = "scholastic_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)                  # e.g. "MATHEMATICS", "GAMES"
    group_name = Column(String(100), nullable=True)             # e.g. "SCHOLASTIC AREAS", "CO-CURRICULAR ACTIVITIES", "PHYSICAL ASPECTS"
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parameters = relationship("ScholasticParameter", back_populates="category", cascade="all, delete-orphan")


class ScholasticParameter(Base):
    """Parameters within a scholastic category (e.g., 'Conceptual Understanding' under Mathematics)."""
    __tablename__ = "scholastic_parameters"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("scholastic_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)                  # e.g. "Conceptual Understanding"
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("ScholasticCategory", back_populates="parameters")


class StudentScholasticGrade(Base):
    """Grade entry for a student on a scholastic parameter for a specific term (1, 2, 3)."""
    __tablename__ = "student_scholastic_grades"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    parameter_id = Column(Integer, ForeignKey("scholastic_parameters.id"), nullable=False, index=True)
    term_number = Column(Integer, nullable=False, index=True)   # 1 = Term I, 2 = Term II, 3 = Term III
    academic_year_id = Column(Integer, ForeignKey("academic_years.id"), nullable=True)
    class_section_id = Column(Integer, ForeignKey("class_sections.id"), nullable=True)
    grade = Column(String(10), nullable=True)                   # e.g. "A+", "A", "B+", "B"
    numeric_value = Column(Float, nullable=True)                # for Physical Aspects (height/weight)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("Student")
    parameter = relationship("ScholasticParameter")
    academic_year = relationship("AcademicYear")
    class_section = relationship("ClassSection")


# ==================== MOBILE PUSH TOKENS ====================
class MobilePushToken(Base):
    """Expo push tokens registered by mobile app users."""
    __tablename__ = "mobile_push_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True)
    device_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


# ==================== TERM DUE DATES ====================
class TermDueDate(Base):
    """Admin-configurable due dates for each term per academic year."""
    __tablename__ = "term_due_dates"

    id = Column(Integer, primary_key=True, index=True)
    academic_year_id = Column(Integer, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False, index=True)
    term = Column(Integer, nullable=False)  # 1, 2, or 3
    due_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    academic_year = relationship("AcademicYear")


# ==================== MOBILE LOGIN LOG ====================
class MobileLoginLog(Base):
    """Audit log of mobile-app logins (per successful OTP verification).
    Used by the dashboard to compute 'currently logged-in' vs 'ever logged-in'.
    """
    __tablename__ = "mobile_login_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, index=True)  # 'parent' | 'teacher'
    login_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    device_name = Column(String(100), nullable=True)
    logout_at = Column(DateTime, nullable=True)

    user = relationship("User")


# ==================== ANNOUNCEMENTS ====================
class Announcement(Base):
    """School-wide announcements posted by Principal/Admin and pushed to the mobile app."""
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    audience = Column(String(20), default="all", nullable=False)  # 'all' | 'parents' | 'teachers'
    push_sent_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    sender = relationship("User")


# ==================== MOBILE OTP ====================
class MobileOtp(Base):
    """One-time passwords for the mobile app login flow."""
    __tablename__ = "mobile_otps"

    id = Column(Integer, primary_key=True, index=True)
    mobile_number = Column(String(15), nullable=False, index=True)
    otp_hash = Column(String(255), nullable=False)
    role_hint = Column(String(20), nullable=True)  # 'parent' | 'teacher' | None
    sent_to_email = Column(String(150), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ==================== HOMEWORK ====================
class HomeworkAssignment(Base):
    """Homework assigned by a teacher to a class-section."""
    __tablename__ = "homework_assignments"

    id = Column(Integer, primary_key=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True, index=True)
    assigned_by_staff_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    assigned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    class_info = relationship("Class")
    subject = relationship("Subject")
    assigned_by_staff = relationship("Staff")
    attachments = relationship("HomeworkAttachment", back_populates="homework",
                               cascade="all, delete-orphan")


class HomeworkAttachment(Base):
    """File attachments (worksheets, raw images) for a homework assignment."""
    __tablename__ = "homework_attachments"

    id = Column(Integer, primary_key=True, index=True)
    homework_id = Column(Integer, ForeignKey("homework_assignments.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)  # path under uploads/homework/
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    homework = relationship("HomeworkAssignment", back_populates="attachments")
