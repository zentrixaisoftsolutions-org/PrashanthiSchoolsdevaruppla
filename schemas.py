from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from enum import Enum

# ==================== AUTHENTICATION SCHEMAS ====================
class TokenData(BaseModel):
    """JWT token data schema."""
    sub: str
    user_id: int
    role: str
    exp: Optional[datetime] = None

class TokenResponse(BaseModel):
    """Token response schema."""
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    expires_in: int = 28800  # seconds until token expiry
    full_name: str = ""

class LoginRequest(BaseModel):
    """Login request schema."""
    email: str  # Can be email or mobile number
    password: str

# ==================== ROLE SCHEMAS ====================
class RoleBase(BaseModel):
    """Base role schema."""
    name: str
    description: Optional[str] = None

class RoleCreate(RoleBase):
    """Role creation schema."""
    pass

class RoleResponse(RoleBase):
    """Role response schema."""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# ==================== USER SCHEMAS ====================
class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    username: str
    full_name: str
    phone: Optional[str] = None
    role_id: int

class UserCreate(UserBase):
    """User creation schema."""
    password: str
    
    @field_validator("password")
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v

class UserUpdate(BaseModel):
    """User update schema."""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[int] = None
    email: Optional[str] = None
    password: Optional[str] = None

class UserResponse(BaseModel):
    """User response schema. Uses plain str for email so synthetic addresses
    like '<mobile>@parent.local' (used for parent auto-accounts) don't fail
    EmailStr validation when listing users."""
    id: int
    email: str
    username: str
    full_name: str
    phone: Optional[str] = None
    role_id: int
    is_active: bool
    role_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==================== SUBJECT SCHEMAS ====================
class SubjectBase(BaseModel):
    """Base subject schema."""
    name: str
    code: str
    description: Optional[str] = None

class SubjectCreate(SubjectBase):
    """Subject creation schema."""
    pass

class SubjectUpdate(BaseModel):
    """Subject update schema."""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class SubjectResponse(SubjectBase):
    """Subject response schema."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ClassSectionInfo(BaseModel):
    """Class section info for subject response."""
    id: int
    class_name: str
    section_name: str


class SubjectWithClassSectionsResponse(SubjectBase):
    """Subject response with class sections."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    class_sections: List[ClassSectionInfo] = []
    
    class Config:
        from_attributes = True


class SubjectClassSectionAssign(BaseModel):
    """Schema for assigning class sections to a subject."""
    class_section_ids: List[int]


# ==================== TEACHER SCHEMAS ====================
class TeacherBase(BaseModel):
    """Base teacher schema."""
    employee_id: str
    qualification: str
    experience_years: int = 0
    specialization: Optional[str] = None

class TeacherCreate(TeacherBase):
    """Teacher creation with user data."""
    email: EmailStr
    username: str
    full_name: str
    phone: Optional[str] = None

class TeacherUpdate(BaseModel):
    """Teacher update schema."""
    qualification: Optional[str] = None
    experience_years: Optional[int] = None
    specialization: Optional[str] = None
    is_active: Optional[bool] = None

class TeacherResponse(TeacherBase):
    """Teacher response schema."""
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user: Optional[UserResponse] = None
    
    class Config:
        from_attributes = True

# ==================== TEACHER SUBJECT MAPPING ====================
class TeacherSubjectAssign(BaseModel):
    """Schema to assign subjects to teacher."""
    subject_ids: List[int]

class TeacherSubjectResponse(BaseModel):
    """Teacher subject mapping response."""
    teacher_id: int
    subject_id: int
    subject_name: str
    assigned_at: datetime
    
    class Config:
        from_attributes = True

# ==================== CLASS NAME MASTER DATA SCHEMAS ====================
class ClassNameBase(BaseModel):
    """Base class name schema."""
    name: str
    display_order: Optional[int] = 0
    description: Optional[str] = None

class ClassNameCreate(ClassNameBase):
    """Class name creation schema."""
    pass

class ClassNameUpdate(BaseModel):
    """Class name update schema."""
    name: Optional[str] = None
    display_order: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ClassNameResponse(ClassNameBase):
    """Class name response schema."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== SECTION MASTER DATA SCHEMAS ====================
class SectionBase(BaseModel):
    """Base section schema."""
    name: str
    display_order: Optional[int] = 0
    description: Optional[str] = None

class SectionCreate(SectionBase):
    """Section creation schema."""
    pass

class SectionUpdate(BaseModel):
    """Section update schema."""
    name: Optional[str] = None
    display_order: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class SectionResponse(SectionBase):
    """Section response schema."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== CLASS-SECTION MAPPING SCHEMAS ====================
class ClassSectionBase(BaseModel):
    """Base class-section mapping schema."""
    class_name_id: int
    section_id: int
    capacity: Optional[int] = 50

class ClassSectionCreate(ClassSectionBase):
    """Class-section mapping creation schema."""
    pass

class ClassSectionBulkAssign(BaseModel):
    """Bulk assign sections to a class."""
    class_name_id: int
    section_ids: List[int]
    capacity: Optional[int] = 50

class ClassSectionUpdate(BaseModel):
    """Class-section mapping update schema."""
    capacity: Optional[int] = None
    is_active: Optional[bool] = None

class ClassSectionResponse(BaseModel):
    """Class-section mapping response schema."""
    id: int
    class_name_id: int
    class_name: str  # Populated from join
    section_id: int
    section_name: str  # Populated from join
    capacity: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class ClassWithSectionsResponse(BaseModel):
    """Class with all its assigned sections."""
    id: int
    name: str
    display_order: int
    description: Optional[str]
    is_active: bool
    sections: List[SectionResponse]
    
    class Config:
        from_attributes = True

# ==================== CLASS SCHEMAS ====================
class ClassBase(BaseModel):
    """Base class schema."""
    class_name: str  # e.g., "1 CLASS", "2 CLASS"
    section_name: str  # e.g., "A", "B", "BB"
    teacher_id: Optional[int] = None
    capacity: int = 50

class ClassCreate(ClassBase):
    """Class creation schema."""
    pass

class ClassUpdate(BaseModel):
    """Class update schema."""
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    teacher_id: Optional[int] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None

class ClassResponse(ClassBase):
    """Class response schema."""
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# ==================== PARENT SCHEMAS ====================
class ParentBase(BaseModel):
    """Base parent schema."""
    relationship: str
    occupation: Optional[str] = None

class ParentCreate(ParentBase):
    """Parent creation with user data."""
    email: EmailStr
    username: str
    full_name: str
    phone: Optional[str] = None

class ParentResponse(ParentBase):
    """Parent response schema."""
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user: Optional[UserResponse] = None
    
    class Config:
        from_attributes = True

# ==================== STUDENT SCHEMAS ====================
class StudentBase(BaseModel):
    """Base student schema matching CSV structure."""
    # Basic Identification
    admission_number: str
    rfid_id: Optional[str] = None
    
    # Personal Details
    first_name: str
    surname: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    caste: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pen: Optional[str] = None  # Permanent Education Number
    photo_data: Optional[str] = None  # Base64 encoded photo
    photo_thumbnail: Optional[str] = None  # Base64 thumbnail (auto-generated)
    
    # Contact Information
    mobile_number: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    
    # Parent/Guardian Details
    father_guardian_name: Optional[str] = None
    mother_name: Optional[str] = None
    parent_login_username: Optional[str] = None
    parent_login_password: Optional[str] = None
    
    # Academic Details
    class_id: Optional[int] = None
    session_timings: Optional[str] = None
    admission_date: Optional[date] = None

class StudentCreate(StudentBase):
    """Student creation schema."""
    pass

class StudentUpdate(BaseModel):
    """Student update schema."""
    # Personal Details
    first_name: Optional[str] = None
    surname: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    caste: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pen: Optional[str] = None
    photo_data: Optional[str] = None  # Base64 encoded photo
    photo_thumbnail: Optional[str] = None  # Base64 thumbnail (auto-generated)
    
    # Contact Information
    mobile_number: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    
    # Parent/Guardian Details
    father_guardian_name: Optional[str] = None
    mother_name: Optional[str] = None
    
    # Academic Details
    class_id: Optional[int] = None
    session_timings: Optional[str] = None
    rfid_id: Optional[str] = None
    is_active: Optional[bool] = None

class StudentSearchFilters(BaseModel):
    """Student search filter schema."""
    class_name: Optional[str] = None  # Filter by class name
    section: Optional[str] = None  # Filter by section
    aadhaar_number: Optional[str] = None  # Filter by Aadhaar
    admission_number: Optional[str] = None  # Filter by admission number
    mobile_number: Optional[str] = None  # Filter by mobile

class StudentResponse(StudentBase):
    """Student response schema."""
    id: int
    user_id: Optional[int] = None
    parent_id: Optional[int] = None
    roll_number: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    class_name: Optional[str] = None  # Populated from class_info
    section_name: Optional[str] = None  # Populated from class_info
    
    class Config:
        from_attributes = True

class StudentListResponse(BaseModel):
    """Paginated student list response."""
    students: List[StudentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

# ==================== FEES SCHEMAS ====================
class FeesBase(BaseModel):
    """Base fees schema."""
    student_id: int
    amount: float
    month: str
    due_date: date
    notes: Optional[str] = None

class FeesCreate(FeesBase):
    """Fees creation schema."""
    pass

class FeesUpdate(BaseModel):
    """Fees update schema."""
    status: Optional[str] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = None

class FeesResponse(FeesBase):
    """Fees response schema."""
    id: int
    status: str
    payment_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class FeesDashboard(BaseModel):
    """Fees dashboard schema."""
    total_collected: float
    total_pending: float
    total_partially_paid: float
    total_students: int
    students_paid: int
    students_pending: int

# ==================== ATTENDANCE SCHEMAS ====================
class AttendanceBase(BaseModel):
    """Base attendance schema."""
    student_id: int
    class_id: int
    attendance_date: date
    status: str
    remarks: Optional[str] = None

class AttendanceCreate(AttendanceBase):
    """Attendance creation schema."""
    pass

class AttendanceUpdate(BaseModel):
    """Attendance update schema."""
    status: Optional[str] = None
    remarks: Optional[str] = None

class AttendanceResponse(AttendanceBase):
    """Attendance response schema."""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class AttendanceDashboard(BaseModel):
    """Attendance dashboard schema."""
    attendance_date: date
    total_students: int
    present: int
    absent: int
    leave: int
    attendance_percentage: float

# ==================== EXAM SCHEMAS ====================
class ExamBase(BaseModel):
    """Base exam schema."""
    student_id: int
    subject_id: int
    exam_name: str
    exam_date: date
    marks_obtained: float
    total_marks: float = 100
    comments: Optional[str] = None

class ExamCreate(ExamBase):
    """Exam creation schema."""
    pass

class ExamUpdate(BaseModel):
    """Exam update schema."""
    marks_obtained: Optional[float] = None
    grade: Optional[str] = None
    comments: Optional[str] = None

class ExamResponse(ExamBase):
    """Exam response schema."""
    id: int
    grade: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ExamDashboard(BaseModel):
    """Exam results dashboard schema."""
    subject_name: str
    total_students: int
    average_marks: float
    highest_marks: float
    lowest_marks: float
    pass_count: int
    fail_count: int


# ==================== GRADE CRITERIA SCHEMAS ====================
class GradeCriteriaBase(BaseModel):
    """Base grade criteria schema."""
    min_percentage: float = Field(..., ge=0, le=100)
    max_percentage: float = Field(..., ge=0, le=100)
    grade: str
    teacher_remarks: Optional[str] = None
    grade_point: Optional[int] = None
    general_remarks: Optional[str] = None
    is_active: bool = True
    display_order: Optional[int] = 0

class GradeCriteriaCreate(GradeCriteriaBase):
    """Grade criteria creation schema."""
    pass

class GradeCriteriaUpdate(BaseModel):
    """Grade criteria update schema."""
    min_percentage: Optional[float] = None
    max_percentage: Optional[float] = None
    grade: Optional[str] = None
    teacher_remarks: Optional[str] = None
    grade_point: Optional[int] = None
    general_remarks: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None

class GradeCriteriaResponse(GradeCriteriaBase):
    """Grade criteria response schema."""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class GradeCriteriaBulkUpdate(BaseModel):
    """Bulk update grade criteria schema."""
    criteria: List[GradeCriteriaCreate]


# ==================== ACADEMIC YEAR SCHEMAS ====================
class AcademicYearBase(BaseModel):
    """Base academic year schema."""
    name: str


class AcademicYearCreate(AcademicYearBase):
    """Academic year creation schema."""
    pass


class AcademicYearUpdate(BaseModel):
    """Academic year update schema."""
    name: Optional[str] = None
    is_current: Optional[bool] = None
    is_active: Optional[bool] = None


class AcademicYearResponse(AcademicYearBase):
    """Academic year response schema."""
    id: int
    is_current: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== EXAM TYPE SCHEMAS ====================
class ExamTypeBase(BaseModel):
    """Base exam type schema."""
    name: str
    academic_year_id: Optional[int] = None
    description: Optional[str] = None


class ExamTypeCreate(ExamTypeBase):
    """Exam type creation schema."""
    pass


class ExamTypeUpdate(BaseModel):
    """Exam type update schema."""
    name: Optional[str] = None
    academic_year_id: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ExamTypeResponse(ExamTypeBase):
    """Exam type response schema."""
    id: int
    is_active: bool
    academic_year_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== EXAMINATION SCHEDULE SCHEMAS ====================
class ExaminationScheduleClassSectionInfo(BaseModel):
    """Class section info for examination schedule response."""
    id: int
    class_name: str
    section_name: str


class ExaminationScheduleSubjectInfo(BaseModel):
    """Subject info for examination schedule response."""
    id: int
    subject_id: int
    subject_name: str
    subject_code: str
    exam_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    max_marks: float = 100
    pass_marks: float = 35
    display_order: int = 0


class ExaminationScheduleSubjectInput(BaseModel):
    """Subject input for creating/updating examination schedule."""
    subject_id: int
    exam_date: date
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    max_marks: float = 100
    pass_marks: float = 35
    display_order: int = 0


class ExaminationScheduleBase(BaseModel):
    """Base examination schedule schema."""
    exam_type_id: int
    academic_year_id: Optional[int] = None
    from_date: date
    to_date: date


class ExaminationScheduleCreate(ExaminationScheduleBase):
    """Examination schedule creation schema."""
    class_section_ids: List[int]
    subjects: Optional[List[ExaminationScheduleSubjectInput]] = []


class ExaminationScheduleUpdate(BaseModel):
    """Examination schedule update schema."""
    exam_type_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    class_section_ids: Optional[List[int]] = None
    subjects: Optional[List[ExaminationScheduleSubjectInput]] = None
    is_active: Optional[bool] = None


class ExaminationScheduleResponse(BaseModel):
    """Examination schedule response schema."""
    id: int
    exam_type_id: int
    exam_type_name: str
    academic_year_id: Optional[int] = None
    academic_year_name: Optional[str] = None
    from_date: date
    to_date: date
    is_active: bool
    class_sections: List[ExaminationScheduleClassSectionInfo] = []
    subjects: List[ExaminationScheduleSubjectInfo] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== STUDENT EXAM MARKS SCHEMAS ====================
class StudentMarkEntry(BaseModel):
    """Single student mark entry for a subject."""
    student_id: int
    marks_obtained: Optional[float] = None
    is_absent: bool = False


class SubjectMarkEntry(BaseModel):
    """Subject with marks for all students."""
    subject_id: int
    subject_name: str
    max_marks: float = 50
    min_marks: float = 18
    marks: List[StudentMarkEntry] = []


class MarksEntryRequest(BaseModel):
    """Request schema for bulk marks entry."""
    exam_type_id: int
    academic_year_id: Optional[int] = None
    class_section_id: int
    subjects: List[SubjectMarkEntry]


class StudentMarkResponse(BaseModel):
    """Response for a single student's mark in a subject."""
    id: Optional[int] = None
    student_id: int
    subject_id: int
    marks_obtained: Optional[float] = None
    max_marks: float = 50
    min_marks: float = 18
    is_absent: bool = False


class StudentWithMarks(BaseModel):
    """Student info with their marks across subjects."""
    student_id: int
    student_name: str
    admission_number: str
    marks: dict  # subject_id -> marks_obtained or "AB"


class SubjectColumnInfo(BaseModel):
    """Subject column info for marks entry grid."""
    subject_id: int
    subject_name: str
    max_marks: float = 50
    min_marks: float = 18


class MarksEntryGridResponse(BaseModel):
    """Response schema for marks entry grid."""
    exam_type_id: int
    exam_type_name: str
    academic_year_id: Optional[int] = None
    academic_year_name: Optional[str] = None
    class_section_id: int
    class_name: str
    section_name: str
    subjects: List[SubjectColumnInfo]
    students: List[StudentWithMarks]


# ==================== STUDENT EXAM ATTENDANCE SCHEMAS ====================
class AttendanceMonthInfo(BaseModel):
    """A month available for attendance entry, with working days from academic calendar."""
    month: int
    year: int
    month_name: str
    total_working_days: int

class StudentAttendanceEntry(BaseModel):
    """Single student attendance entry for a specific month."""
    student_id: int
    month: int
    year: int
    total_working_days: int
    present_days: int

class StudentAttendanceBulkRequest(BaseModel):
    """Bulk save attendance for students during marks entry."""
    exam_type_id: int
    academic_year_id: Optional[int] = None
    class_section_id: int
    entries: List[StudentAttendanceEntry]

class StudentAttendanceResponse(BaseModel):
    """Response for a student's attendance in a month."""
    id: int
    student_id: int
    month: int
    year: int
    total_working_days: int
    present_days: int
    month_name: Optional[str] = None


# ==================== ATTENDANCE DEVICE SCHEMAS ====================
class AttendanceDeviceBase(BaseModel):
    """Base attendance device schema."""
    device_name: str
    device_model: Optional[str] = None
    serial_number: Optional[str] = None
    ip_address: str
    port: int = 6321
    comm_key: Optional[int] = 0
    connection_type: str = "TCP/IP"
    location: Optional[str] = None


class AttendanceDeviceCreate(AttendanceDeviceBase):
    """Attendance device creation schema."""
    pass


class AttendanceDeviceUpdate(BaseModel):
    """Attendance device update schema."""
    device_name: Optional[str] = None
    device_model: Optional[str] = None
    serial_number: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    comm_key: Optional[int] = None
    connection_type: Optional[str] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None


class AttendanceDeviceResponse(AttendanceDeviceBase):
    """Attendance device response schema."""
    id: int
    status: str
    last_connected_at: Optional[datetime] = None
    last_heartbeat_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class DeviceConnectionRequest(BaseModel):
    """Request to connect/disconnect a device."""
    action: str  # "connect" or "disconnect"


class DeviceConnectionResponse(BaseModel):
    """Response for device connection action."""
    device_id: int
    status: str
    message: str
    connected_at: Optional[datetime] = None


# ==================== ATTENDANCE LOG SCHEMAS ====================
class AttendanceLogBase(BaseModel):
    """Base attendance log schema."""
    student_id: int
    attendance_date: date
    status: str = "present"
    remarks: Optional[str] = None


class AttendanceLogCreate(AttendanceLogBase):
    """Attendance log creation schema."""
    device_id: Optional[int] = None
    rfid_scanned: Optional[str] = None
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    is_manual_entry: bool = False


class ManualAttendanceCreate(BaseModel):
    """Schema for manual attendance entry with notification support."""
    student_id: int
    attendance_date: date
    check_in_time: Optional[str] = None    # "HH:MM" format
    check_out_time: Optional[str] = None   # "HH:MM" format
    status: str = "present"
    remarks: Optional[str] = None
    send_sms: bool = False
    send_whatsapp: bool = False
    update_existing: bool = False          # If True, update existing record instead of erroring


class AttendanceLogUpdate(BaseModel):
    """Attendance log update schema."""
    status: Optional[str] = None
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    remarks: Optional[str] = None


class AttendanceLogResponse(BaseModel):
    """Attendance log response schema."""
    id: int
    student_id: int
    student_name: Optional[str] = None
    admission_number: Optional[str] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    device_id: Optional[int] = None
    device_name: Optional[str] = None
    rfid_scanned: Optional[str] = None
    attendance_date: date
    check_in_time: Optional[datetime] = None
    check_out_time: Optional[datetime] = None
    status: str
    is_manual_entry: bool
    remarks: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class RFIDScanRequest(BaseModel):
    """Request schema for RFID scan event."""
    device_id: int
    rfid_id: str
    scan_time: Optional[datetime] = None


class RFIDScanResponse(BaseModel):
    """Response schema for RFID scan event."""
    success: bool
    message: str
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    attendance_id: Optional[int] = None
    status: Optional[str] = None


class AttendanceReportFilters(BaseModel):
    """Filters for attendance report."""
    from_date: date
    to_date: date
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    section_name: Optional[str] = None


class StudentAttendanceSummary(BaseModel):
    """Summary of a student's attendance."""
    student_id: int
    student_name: str
    admission_number: str
    class_name: Optional[str] = None
    section_name: Optional[str] = None
    total_days: int
    present_days: int
    absent_days: int
    late_days: int
    attendance_percentage: float


class DailyAttendanceReport(BaseModel):
    """Daily attendance report for a class."""
    date: date
    total_students: int
    present_count: int
    absent_count: int
    late_count: int
    students: List[AttendanceLogResponse]


# ==================== SMS CONFIG SCHEMAS ====================
class SMSConfigBase(BaseModel):
    """Base SMS config schema."""
    provider_name: str
    api_key: str
    api_secret: Optional[str] = None
    sender_id: Optional[str] = None
    base_url: Optional[str] = None


class SMSConfigCreate(SMSConfigBase):
    """SMS config creation schema."""
    is_active: bool = True
    is_default: bool = False


class SMSConfigUpdate(BaseModel):
    """SMS config update schema."""
    provider_name: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    sender_id: Optional[str] = None
    base_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class SMSConfigResponse(BaseModel):
    """SMS config response schema (masks sensitive data)."""
    id: int
    provider_name: str
    api_key_masked: str  # Only show last 4 characters
    api_secret_masked: Optional[str] = None
    sender_id: Optional[str] = None
    base_url: Optional[str] = None
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== SMS TEMPLATE SCHEMAS ====================
class SMSTemplateBase(BaseModel):
    """Base SMS template schema."""
    name: str
    template_type: str
    message_template: str


class SMSTemplateCreate(SMSTemplateBase):
    """SMS template creation schema."""
    is_default: bool = False


class SMSTemplateUpdate(BaseModel):
    """SMS template update schema."""
    name: Optional[str] = None
    template_type: Optional[str] = None
    message_template: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class SMSTemplateResponse(SMSTemplateBase):
    """SMS template response schema."""
    id: int
    is_active: bool
    is_default: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ==================== SMS LOG SCHEMAS ====================
class SMSLogResponse(BaseModel):
    """SMS log response schema."""
    id: int
    config_id: Optional[int] = None
    provider_name: Optional[str] = None
    student_id: Optional[int] = None
    student_name: Optional[str] = None
    phone_number: str
    message: str
    message_type: Optional[str] = None
    status: str
    sent_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class SendSMSRequest(BaseModel):
    """Request to send SMS."""
    phone_number: str
    message: str
    student_id: Optional[int] = None
    message_type: Optional[str] = None


class SendBulkSMSRequest(BaseModel):
    """Request to send bulk SMS for absent students."""
    attendance_date: date
    class_id: Optional[int] = None
    template_type: str = "attendance_absent"


class SMSSendResponse(BaseModel):
    """Response for SMS send action."""
    success: bool
    message: str
    sms_log_id: Optional[int] = None


class SMSTestRequest(BaseModel):
    """Request to test SMS configuration."""
    config_id: int
    phone_number: str


# ==================== FEE STRUCTURE SCHEMAS ====================
class FeeStructureBase(BaseModel):
    """Base fee structure schema."""
    academic_year_id: int
    class_name_id: int
    term: int = 1  # 1, 2, or 3
    fee_type: str
    amount: float
    frequency: str = "term"
    description: Optional[str] = None
    is_mandatory: bool = True


class FeeStructureCreate(FeeStructureBase):
    """Fee structure creation schema."""
    pass


class FeeStructureUpdate(BaseModel):
    """Fee structure update schema."""
    term: Optional[int] = None
    fee_type: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    description: Optional[str] = None
    is_mandatory: Optional[bool] = None
    is_active: Optional[bool] = None


class FeeStructureResponse(FeeStructureBase):
    """Fee structure response schema."""
    id: int
    term: int = 1
    is_active: bool
    academic_year_name: Optional[str] = None
    class_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FeeStructureBulkCreate(BaseModel):
    """Create fee structures for a class in bulk."""
    academic_year_id: int
    class_name_id: int
    items: List[dict]  # [{"fee_type": "Tuition", "amount": 5000, "frequency": "monthly", ...}]


# ==================== FEE PAYMENT SCHEMAS ====================
class FeePaymentCreate(BaseModel):
    """Fee payment creation (manual/cash)."""
    student_id: int
    academic_year_id: int
    fee_structure_id: Optional[int] = None
    term: Optional[int] = None  # 1, 2, or 3
    amount_paid: float
    discount_type: Optional[str] = None       # 'amount' or 'percent'
    discount_value: Optional[float] = 0       # discount amount or percentage value
    tax_percent: Optional[float] = 0          # tax percentage
    payment_method: str = "cash"
    transaction_id: Optional[str] = None
    receipt_number: Optional[str] = None
    remarks: Optional[str] = None


class FeePaymentResponse(BaseModel):
    """Fee payment response schema."""
    id: int
    student_id: int
    student_name: Optional[str] = None
    admission_number: Optional[str] = None
    academic_year_id: int
    academic_year_name: Optional[str] = None
    fee_structure_id: Optional[int] = None
    term: Optional[int] = None
    fee_type: Optional[str] = None
    gross_amount: Optional[float] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = 0
    discount_amount: Optional[float] = 0
    tax_percent: Optional[float] = 0
    tax_amount: Optional[float] = 0
    net_amount: Optional[float] = None
    amount_paid: float
    payment_date: datetime
    payment_method: str
    transaction_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    receipt_number: Optional[str] = None
    status: str
    remarks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StudentFeeSummary(BaseModel):
    """Fee summary for a single student."""
    student_id: int
    student_name: str
    admission_number: str
    class_name: Optional[str] = None
    total_fee: float
    total_paid: float
    total_due: float
    last_payment_date: Optional[datetime] = None
    fee_breakdown: List[dict] = []  # [{fee_type, amount, paid, due}]


class PaginatedFeeSummaryResponse(BaseModel):
    """Paginated fee summary response with aggregate totals."""
    items: List[StudentFeeSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    total_fee: float
    total_paid: float
    total_due: float


class RazorpayOrderCreate(BaseModel):
    """Create a Razorpay order."""
    student_id: int
    academic_year_id: int
    amount: float
    fee_structure_id: Optional[int] = None
    remarks: Optional[str] = None


class RazorpayOrderResponse(BaseModel):
    """Razorpay order creation response."""
    order_id: str
    amount: int  # in paise
    currency: str
    key_id: str
    student_name: str
    student_email: Optional[str] = None
    student_phone: Optional[str] = None
    receipt: str


class RazorpayVerifyPayment(BaseModel):
    """Verify a Razorpay payment."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    student_id: int
    academic_year_id: int
    amount: float
    fee_structure_id: Optional[int] = None
    remarks: Optional[str] = None


# ==================== PAYMENT GATEWAY CONFIG SCHEMAS ====================
class PaymentGatewayConfigCreate(BaseModel):
    """Payment gateway config creation."""
    provider: str = "razorpay"
    key_id: str
    key_secret: str
    webhook_secret: Optional[str] = None
    is_test_mode: bool = True


class PaymentGatewayConfigUpdate(BaseModel):
    """Payment gateway config update."""
    provider: Optional[str] = None
    key_id: Optional[str] = None
    key_secret: Optional[str] = None
    webhook_secret: Optional[str] = None
    is_test_mode: Optional[bool] = None
    is_active: Optional[bool] = None


class PaymentGatewayConfigResponse(BaseModel):
    """Payment gateway config response (masks secrets)."""
    id: int
    provider: str
    key_id_masked: str
    is_test_mode: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== DEPARTMENT SCHEMAS ====================
class DepartmentBase(BaseModel):
    """Base department schema."""
    name: str

class DepartmentCreate(DepartmentBase):
    """Department creation schema."""
    pass

class DepartmentUpdate(BaseModel):
    """Department update schema."""
    name: Optional[str] = None
    is_active: Optional[bool] = None

class DepartmentResponse(DepartmentBase):
    """Department response schema."""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== STAFF SCHEMAS ====================
class StaffBase(BaseModel):
    """Base staff schema."""
    first_name: str
    last_name: Optional[str] = None
    father_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    aadhar_number: Optional[str] = None
    address: Optional[str] = None
    qualification: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[int] = None
    date_of_joining: Optional[date] = None
    salary: Optional[float] = None
    rfid: Optional[str] = None
    employee_id: Optional[str] = None

class StaffCreate(StaffBase):
    """Staff creation schema."""
    photo_data: Optional[str] = None
    class_section_ids: Optional[List[int]] = None
    subject_ids: Optional[List[int]] = None
    class_teacher_of_ids: Optional[List[int]] = None  # class_section_ids where this staff is class teacher

class StaffUpdate(BaseModel):
    """Staff update schema."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    father_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[date] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    aadhar_number: Optional[str] = None
    address: Optional[str] = None
    qualification: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[int] = None
    date_of_joining: Optional[date] = None
    salary: Optional[float] = None
    rfid: Optional[str] = None
    employee_id: Optional[str] = None
    photo_data: Optional[str] = None
    is_active: Optional[bool] = None
    class_section_ids: Optional[List[int]] = None
    subject_ids: Optional[List[int]] = None
    class_teacher_of_ids: Optional[List[int]] = None  # class_section_ids where this staff is class teacher

class StaffClassSectionBrief(BaseModel):
    """Brief class-section info for staff response."""
    id: int
    class_name: str
    section_name: str

class StaffSubjectBrief(BaseModel):
    """Brief subject info for staff response."""
    id: int
    name: str
    code: str

class StaffResponse(StaffBase):
    """Staff response schema."""
    id: int
    is_active: bool
    department_name: Optional[str] = None
    photo_data: Optional[str] = None
    class_sections: List[StaffClassSectionBrief] = []
    subjects: List[StaffSubjectBrief] = []
    class_section_ids: List[int] = []
    subject_ids: List[int] = []
    class_teacher_of_ids: List[int] = []  # class_section_ids where this staff is class teacher
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== STAFF SALARY SCHEMAS ====================
class StaffSalaryCalculateRequest(BaseModel):
    """Request to calculate salary for staff."""
    month: int
    year: int
    total_working_days: int
    staff_ids: Optional[List[int]] = None  # None = all active staff

class StaffSalaryDetail(BaseModel):
    """Salary detail for one staff member."""
    id: Optional[int] = None
    staff_id: int
    staff_name: str
    employee_id: Optional[str] = None
    designation: Optional[str] = None
    department_name: Optional[str] = None
    month: int
    year: int
    total_working_days: int
    days_present: int
    days_absent: int
    days_late: int
    days_half_day: int
    days_leave: int
    base_salary: float
    deduction: float
    net_salary: float
    remarks: Optional[str] = None

class StaffSalaryResponse(BaseModel):
    """Response for salary calculation."""
    month: int
    year: int
    total_working_days: int
    staff_salaries: List[StaffSalaryDetail]
    summary: dict  # total_base, total_deduction, total_net


# ==================== ACADEMIC CALENDAR SCHEMAS ====================
class AcademicCalendarHolidayBase(BaseModel):
    holiday_date: date
    name: str
    remarks: Optional[str] = None

class AcademicCalendarHolidayCreate(AcademicCalendarHolidayBase):
    pass

class AcademicCalendarHolidayResponse(AcademicCalendarHolidayBase):
    id: int
    calendar_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class AcademicCalendarBase(BaseModel):
    academic_year_id: int
    class_name_id: int
    month: int
    year: int
    total_working_days: int

class AcademicCalendarCreate(AcademicCalendarBase):
    pass

class AcademicCalendarBulkCreate(BaseModel):
    academic_year_id: int
    class_name_ids: List[int]
    months: List[int]
    year: int
    total_working_days: int

class AcademicCalendarUpdate(BaseModel):
    total_working_days: Optional[int] = None
    is_active: Optional[bool] = None

class AcademicCalendarResponse(AcademicCalendarBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    class_name: Optional[str] = None
    academic_year_name: Optional[str] = None
    holidays: List[AcademicCalendarHolidayResponse] = []
    holiday_count: int = 0
    effective_working_days: int = 0
    class Config:
        from_attributes = True

class AcademicCalendarSummaryResponse(BaseModel):
    academic_year_id: int
    academic_year_name: str
    class_name_id: int
    class_name: str
    months: List[dict]
    total_working_days: int
    total_holidays: int
    total_effective_days: int


# ==================== SCHOLASTIC AREAS SCHEMAS ====================
class ScholasticParameterInfo(BaseModel):
    id: int
    name: str
    display_order: int = 0

class ScholasticCategoryInfo(BaseModel):
    id: int
    name: str
    group_name: Optional[str] = None
    display_order: int = 0
    parameters: List[ScholasticParameterInfo] = []

class ScholasticCategoriesResponse(BaseModel):
    categories: List[ScholasticCategoryInfo]

class ScholasticCategoryCreate(BaseModel):
    name: str
    group_name: Optional[str] = None
    display_order: int = 0

class ScholasticParameterCreate(BaseModel):
    category_id: int
    name: str
    display_order: int = 0

class StudentScholasticGradeEntry(BaseModel):
    student_id: int
    parameter_id: int
    grade: Optional[str] = None
    numeric_value: Optional[float] = None

class ScholasticGradesBulkRequest(BaseModel):
    term_number: int  # 1, 2, or 3
    academic_year_id: Optional[int] = None
    class_section_id: int
    entries: List[StudentScholasticGradeEntry]

class StudentScholasticGradeResponse(BaseModel):
    id: int
    student_id: int
    parameter_id: int
    grade: Optional[str] = None
    numeric_value: Optional[float] = None

class ScholasticGridStudent(BaseModel):
    student_id: int
    student_name: str
    admission_number: str
    grades: dict  # parameter_id -> grade or numeric_value

class ScholasticGridResponse(BaseModel):
    term_number: int
    term_label: str
    academic_year_id: Optional[int] = None
    academic_year_name: Optional[str] = None
    class_section_id: int
    class_name: str
    section_name: str
    categories: List[ScholasticCategoryInfo]
    students: List[ScholasticGridStudent]
