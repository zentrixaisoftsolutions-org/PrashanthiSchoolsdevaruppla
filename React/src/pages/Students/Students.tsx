import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import studentService, { Student, StudentFilters, StudentCreate, SearchOptions, ClassInfo } from '../../services/studentService';
import classSectionService from '../../services/classSectionService';

const Students: React.FC = () => {
  // Messages
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState('');

  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState<'error' | 'success' | ''>('');
  const [notificationMessage, setNotificationMessage] = useState('');

  // Show notification when error, validationError, or success changes
  useEffect(() => {
    if (error) {
      setNotificationType('error');
      setNotificationMessage(error);
      setShowNotification(true);
    } else if (validationError) {
      setNotificationType('error');
      setNotificationMessage(validationError);
      setShowNotification(true);
    } else if (success) {
      setNotificationType('success');
      setNotificationMessage(success);
      setShowNotification(true);
    }
  }, [error, validationError, success]);

  // Auto-dismiss notification after 4 seconds
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => setShowNotification(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showNotification]);
  // State
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Filter state
  const [filters, setFilters] = useState<StudentFilters>({
    page: 1,
    page_size: 20,
  });
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({ class_names: [], sections: [] });
  const [allClassSections, setAllClassSections] = useState<{class_name: string; section_name: string}[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [showFilters, setShowFilters] = useState(true);
  
  // Filter inputs
  const [searchClassName, setSearchClassName] = useState('');
  const [searchSection, setSearchSection] = useState('');
  const [searchAadhaar, setSearchAadhaar] = useState('');
  const [searchAdmission, setSearchAdmission] = useState('');
  const [searchMobile, setSearchMobile] = useState('');
  const [generalSearch, setGeneralSearch] = useState('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{
    message: string;
    imported_count: number;
    skipped_count: number;
    total_rows: number;
    created_classes: string[];
    created_sections: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  

  // Photo capture state
  const [showCamera, setShowCamera] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Form state
  const [formData, setFormData] = useState<StudentCreate>({
    admission_number: '',
    first_name: '',
    surname: '',
    father_guardian_name: '',
    mobile_number: '',
    phone_number: '',
    aadhaar_number: '',
    pen: '',
    class_id: undefined,
    gender: '',
    date_of_birth: '',
    email: '',
    address: '',
    mother_name: '',
    blood_group: '',
    caste: '',
    session_timings: '',
    rfid_id: '',
    photo_data: '',
  });

  // Load search options and classes on mount
  useEffect(() => {
    loadSearchOptions();
    loadClasses();
  }, []);

  // Load students when filters change
  useEffect(() => {
    loadStudents();
  }, [filters]);

  const loadSearchOptions = async () => {
    try {
      const classSections = await classSectionService.listClassSections();
      // Extract unique class names and sections
      const classNames = [...new Set(classSections.map(cs => cs.class_name))];
      const sections = [...new Set(classSections.map(cs => cs.section_name).filter(s => s !== ''))];
      setAllClassSections(classSections.map(cs => ({ class_name: cs.class_name, section_name: cs.section_name })));
      setSearchOptions({ class_names: classNames, sections: sections });
    } catch (err) {
      console.error('Failed to load search options:', err);
    }
  };

  const loadClasses = async () => {
    try {
      const classList = await studentService.getClasses();
      setClasses(classList);
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await studentService.getStudents(filters);
      setStudents(response.students);
      setTotalStudents(response.total);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleSearch = () => {
    setFilters({
      ...filters,
      page: 1,
      class_name: searchClassName || undefined,
      section: searchSection || undefined,
      aadhaar_number: searchAadhaar || undefined,
      admission_number: searchAdmission || undefined,
      mobile_number: searchMobile || undefined,
      search: generalSearch || undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchClassName('');
    setSearchSection('');
    setSearchAadhaar('');
    setSearchAdmission('');
    setSearchMobile('');
    setGeneralSearch('');
    setFilters({
      page: 1,
      page_size: pageSize,
    });
  };

  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationError('');

    // Validation: No numbers in first name or surname
    if (/\d/.test(formData.first_name)) {
      setValidationError('First name should not contain numbers.');
      return;
    }
    if (formData.surname && /\d/.test(formData.surname)) {
      setValidationError('Surname should not contain numbers.');
      return;
    }
    // Validation: Mobile number must contain only digits
    if (formData.mobile_number && /[^0-9]/.test(formData.mobile_number)) {
      setValidationError('Mobile number must contain only digits.');
      return;
    }
    // Validation: Aadhaar number must be exactly 12 digits
    if (formData.aadhaar_number && (formData.aadhaar_number.length !== 12 || /[^0-9]/.test(formData.aadhaar_number))) {
      setValidationError('Aadhaar number must be exactly 12 digits.');
      return;
    }

    // Uniqueness checks
    if (formData.pen && students.some(s => s.pen && s.pen === formData.pen)) {
      setValidationError('PEN must be unique.');
      return;
    }
    if (formData.aadhaar_number && students.some(s => s.aadhaar_number && s.aadhaar_number === formData.aadhaar_number)) {
      setValidationError('Aadhaar number must be unique.');
      return;
    }
    if (formData.admission_number && students.some(s => s.admission_number && s.admission_number === formData.admission_number)) {
      setValidationError('Admission number must be unique.');
      return;
    }

    setLoading(true);
    try {
      // Clean form data: convert empty strings to undefined/null for optional fields
      const cleanedData: Record<string, any> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === undefined) {
          // Omit empty strings and undefined values so backend uses defaults (None)
          continue;
        }
        cleanedData[key] = value;
      }
      // Ensure required fields are always present
      cleanedData.admission_number = formData.admission_number;
      cleanedData.first_name = formData.first_name;
      await studentService.createStudent(cleanedData as StudentCreate);
      setSuccess('Student created successfully!');
      setShowModal(false);
      resetForm();
      loadStudents();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join('; '));
      } else {
        setError(detail || 'Failed to create student');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    setError('');
    setLoading(true);

    try {
      await studentService.updateStudent(editingStudent.id, {
        first_name: formData.first_name,
        surname: formData.surname,
        father_guardian_name: formData.father_guardian_name,
        mobile_number: formData.mobile_number,
        phone_number: formData.phone_number,
        aadhaar_number: formData.aadhaar_number,
        pen: formData.pen,
        class_id: formData.class_id,
        gender: formData.gender,
        date_of_birth: formData.date_of_birth,
        email: formData.email,
        address: formData.address,
        mother_name: formData.mother_name,
        blood_group: formData.blood_group,
        caste: formData.caste,
        session_timings: formData.session_timings,
        rfid_id: formData.rfid_id || undefined,
        photo_data: formData.photo_data || undefined,
      });
      setSuccess('Student updated successfully!');
      setShowModal(false);
      setEditingStudent(null);
      resetForm();
      loadStudents();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail.map((e: any) => e.msg || JSON.stringify(e)).join('; '));
      } else {
        setError(detail || 'Failed to update student');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!window.confirm(`Are you sure you want to deactivate ${student.surname ? `${student.surname} ${student.first_name}` : student.first_name}?`)) return;
    
    try {
      await studentService.deleteStudent(student.id);
      setSuccess('Student deactivated successfully!');
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete student');
    }
  };

  const handleEdit = async (student: Student) => {
    setEditingStudent(student);
    setFormData({
      admission_number: student.admission_number,
      first_name: student.first_name,
      surname: student.surname || '',
      father_guardian_name: student.father_guardian_name || '',
      mobile_number: student.mobile_number || '',
      phone_number: student.phone_number || '',
      aadhaar_number: student.aadhaar_number || '',
      pen: student.pen || '',
      class_id: student.class_id,
      gender: student.gender || '',
      date_of_birth: student.date_of_birth || '',
      email: student.email || '',
      address: student.address || '',
      mother_name: student.mother_name || '',
      blood_group: student.blood_group || '',
      caste: student.caste || '',
      session_timings: student.session_timings || '',
      rfid_id: student.rfid_id || '',
      photo_data: '',
    });
    // Show thumbnail immediately, then fetch full-res photo
    setPhotoPreview(student.photo_thumbnail || '');
    setShowModal(true);
    try {
      const fullStudent = await studentService.getStudent(student.id);
      if (fullStudent.photo_data) {
        setPhotoPreview(fullStudent.photo_data);
      }
    } catch (err) {
      console.error('Failed to load full photo:', err);
    }
  };

  const handleView = async (student: Student) => {
    setLoadingStudent(true);
    setViewingStudent(student);
    setShowViewModal(true);
    try {
      const fullStudent = await studentService.getStudent(student.id);
      setViewingStudent(fullStudent);
    } catch (err) {
      console.error('Failed to load student details:', err);
    } finally {
      setLoadingStudent(false);
    }
  };

  const convertExcelToCSV = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const csvData = XLSX.utils.sheet_to_csv(worksheet);
          const csvBlob = new Blob([csvData], { type: 'text/csv' });
          const csvFile = new File([csvBlob], file.name.replace(/\.(xlsx?|xls)$/i, '.csv'), { type: 'text/csv' });
          resolve(csvFile);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportErrors([]);
    setImportResult(null);
    try {
      let fileToUpload = file;
      
      // Convert Excel files to CSV
      if (file.name.match(/\.(xlsx?|xls)$/i)) {
        fileToUpload = await convertExcelToCSV(file);
      }
      
      const result = await studentService.importCSV(fileToUpload);
      setImportResult(result);
      
      if (result.errors && result.errors.length > 0) {
        setImportErrors(result.errors);
      }
      
      if (result.imported_count > 0) {
        setSuccess(result.message);
        loadStudents();
        loadSearchOptions();
        loadClasses();
      }
    } catch (err: any) {
      const errorDetail = err.response?.data?.detail;
      if (typeof errorDetail === 'string') {
        setError(errorDetail);
      } else if (Array.isArray(errorDetail)) {
        setImportErrors(errorDetail.map((e: any) => e.msg || JSON.stringify(e)));
      } else {
        setError('Failed to import file. Please check the file format.');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await studentService.exportCSV({
        class_name: searchClassName || undefined,
        section: searchSection || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to export CSV');
    }
  };

  const resetForm = () => {
    setFormData({
      admission_number: '',
      first_name: '',
      surname: '',
      father_guardian_name: '',
      mobile_number: '',
      phone_number: '',
      aadhaar_number: '',
      pen: '',
      class_id: undefined,
      gender: '',
      date_of_birth: '',
      email: '',
      address: '',
      mother_name: '',
      blood_group: '',
      caste: '',
      session_timings: '',
      rfid_id: '',
      photo_data: '',
    });
    setPhotoPreview('');
  };

  // Photo handling functions
  const compressImage = (file: File, maxWidth: number = 800): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject('Canvas not supported'); return; }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = () => reject('Failed to load image');
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB');
      return;
    }
    try {
      const compressed = await compressImage(file);
      setFormData({ ...formData, photo_data: compressed });
      setPhotoPreview(compressed);
    } catch {
      setError('Failed to process image');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      cameraStreamRef.current = stream;
      setShowCamera(true);
      // Attach stream after DOM renders
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setFormData({ ...formData, photo_data: dataUrl });
    setPhotoPreview(dataUrl);
    stopCamera();
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setShowCamera(false);
  };

  const removePhoto = () => {
    setFormData({ ...formData, photo_data: '' });
    setPhotoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div>
      {/* Top-right notification */}
      {showNotification && (
        <div
          style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, minWidth: 320, maxWidth: 400 }}
          className={`shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 ${notificationType === 'error' ? 'bg-red-50 border border-red-400' : 'bg-green-50 border border-green-400'}`}
        >
          <span className={`text-xl ${notificationType === 'error' ? 'text-red-500' : 'text-green-500'}`}>{notificationType === 'error' ? '❌' : '✅'}</span>
          <span className={`text-sm ${notificationType === 'error' ? 'text-red-700' : 'text-green-700'}`}>{notificationMessage}</span>
          <button
            onClick={() => {
              setShowNotification(false);
              setError('');
              setValidationError('');
              setSuccess('');
            }}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >✕</button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
          <p className="text-gray-600 mt-1">
            Total: {totalStudents} students
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setImportErrors([]);
              setImportResult(null);
              setShowImportModal(true);
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <span>📤</span> Import
          </button>
          <button
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <span>📥</span> Export CSV
          </button>
          <button
            onClick={() => {
              resetForm();
              setEditingStudent(null);
              setShowModal(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <span>+</span> Add Student
          </button>
        </div>
      </div>

      {/* Messages */}
      {(error || validationError) && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{validationError || error}</p>
          <button onClick={() => { setError(''); setValidationError(''); }} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Search Filters</h3>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-indigo-600 hover:text-indigo-800 text-sm"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        {showFilters && (
          <div className="space-y-4">
            {/* Row 1: Class Name, Section, General Search */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                <select
                  value={searchClassName}
                  onChange={(e) => { setSearchClassName(e.target.value); setSearchSection(''); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                >
                  <option value="">All Classes</option>
                  {searchOptions.class_names.map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const sectionsForClass = searchClassName
                  ? allClassSections.filter(cs => cs.class_name === searchClassName && cs.section_name !== '').map(cs => cs.section_name)
                  : searchOptions.sections;
                return sectionsForClass.length > 0 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select
                      value={searchSection}
                      onChange={(e) => setSearchSection(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="">All Sections</option>
                      {sectionsForClass.map((section) => (
                        <option key={section} value={section}>{section}</option>
                      ))}
                    </select>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">General Search</label>
                <input
                  type="text"
                  placeholder="Search name, admission no, etc..."
                  value={generalSearch}
                  onChange={(e) => setGeneralSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Row 2: Aadhaar, Admission No, Mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aadhaar Number</label>
                <input
                  type="text"
                  placeholder="Search by Aadhaar..."
                  value={searchAadhaar}
                  onChange={(e) => setSearchAadhaar(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                <input
                  type="text"
                  placeholder="Search by Admission No..."
                  value={searchAdmission}
                  onChange={(e) => setSearchAdmission(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                <input
                  type="text"
                  placeholder="Search by Mobile..."
                  value={searchMobile}
                  onChange={(e) => setSearchMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                🔍 Search
              </button>
              <button
                onClick={handleClearFilters}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mx-auto"></div>
            <p className="text-gray-500 mt-2">Loading students...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    Photo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Admission No
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Father/Guardian
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Class
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Section
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mobile
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aadhaar
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PEN
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      No students found. Try adjusting your filters or add new students.
                    </td>
                  </tr>
                ) : (
                  students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {student.photo_thumbnail ? (
                          <img
                            src={student.photo_thumbnail}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover border border-gray-200"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                            <span className="text-indigo-600 text-xs font-bold">
                              {student.first_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-indigo-600">
                        {student.admission_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {student.surname ? `${student.surname} ${student.first_name}` : student.first_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.father_guardian_name || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.class_name || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.section_name || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.mobile_number || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.aadhaar_number || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {student.pen || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          student.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {student.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleView(student)}
                          className="text-emerald-600 hover:text-emerald-900 mr-2"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(student)}
                          className="text-indigo-600 hover:text-indigo-900 mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(student)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} ({totalStudents} total students)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let page;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (currentPage <= 3) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = currentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1 border rounded text-sm ${
                      currentPage === page
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Student Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => { stopCamera(); setShowModal(false); }}></div>

            <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full mx-auto p-6 z-10 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingStudent ? 'Edit Student' : 'Add New Student'}
              </h3>

              <form onSubmit={editingStudent ? handleUpdate : handleCreate} className="space-y-4">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number *</label>
                    <input
                      type="text"
                      required
                      disabled={!!editingStudent}
                      value={formData.admission_number}
                      onChange={(e) => setFormData({ ...formData, admission_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-100"
                      placeholder="e.g., KTSN20251"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => {
                        if (/\d/.test(e.target.value)) {
                          setValidationError('First name should not contain numbers.');
                          return;
                        }
                        setFormData({ ...formData, first_name: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Student's first name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                    <input
                      type="text"
                      value={formData.surname}
                      onChange={(e) => {
                        if (/\d/.test(e.target.value)) {
                          setValidationError('Surname should not contain numbers.');
                          return;
                        }
                        setFormData({ ...formData, surname: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Student's surname"
                    />
                  </div>
                </div>

                {/* Class Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class & Section *</label>
                    <select
                      required
                      value={formData.class_id || ''}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select Class & Section</option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">RFID / Biometric ID</label>
                    <input
                      type="text"
                      value={formData.rfid_id}
                      onChange={(e) => setFormData({ ...formData, rfid_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="RFID/Face/Fingerprint ID"
                    />
                  </div>
                </div>

                {/* Parent Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Father/Guardian Name</label>
                    <input
                      type="text"
                      value={formData.father_guardian_name}
                      onChange={(e) => setFormData({ ...formData, father_guardian_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Father's or Guardian's name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mother's Name</label>
                    <input
                      type="text"
                      value={formData.mother_name}
                      onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Mother's name"
                    />
                  </div>
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                    <input
                      type="text"
                      value={formData.mobile_number}
                      onChange={(e) => {
                        if (e.target.value && /[^0-9]/.test(e.target.value)) {
                          setValidationError('Mobile number must contain only digits.');
                          return;
                        }
                        setFormData({ ...formData, mobile_number: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Primary mobile number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Alternate phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Aadhaar Number</label>
                    <input
                      type="text"
                      value={formData.aadhaar_number}
                      maxLength={12}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && /[^0-9]/.test(val)) {
                          setValidationError('Aadhaar number must contain only digits.');
                          return;
                        }
                        if (val.length > 12) {
                          setValidationError('Aadhaar number must be exactly 12 digits.');
                          return;
                        }
                        setFormData({ ...formData, aadhaar_number: val });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="12-digit Aadhaar"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PEN</label>
                    <input
                      type="text"
                      value={formData.pen}
                      onChange={(e) => setFormData({ ...formData, pen: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Permanent Education Number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Email address"
                    />
                  </div>
                </div>

                {/* Personal Details */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Blood Group</label>
                    <select
                      value={formData.blood_group}
                      onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    >
                      <option value="">Select</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caste</label>
                    <input
                      type="text"
                      value={formData.caste}
                      onChange={(e) => setFormData({ ...formData, caste: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="Caste"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Session Timings</label>
                    <input
                      type="text"
                      value={formData.session_timings}
                      onChange={(e) => setFormData({ ...formData, session_timings: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="e.g., SCHOOL TIMINGS"
                    />
                  </div>
                </div>

                {/* Student Photo */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Student Photo</label>
                  <div className="flex items-start gap-4">
                    {/* Photo Preview */}
                    <div className="flex-shrink-0">
                      {photoPreview ? (
                        <div className="relative group">
                          <img
                            src={photoPreview}
                            alt="Student"
                            className="w-24 h-24 rounded-lg object-cover border-2 border-indigo-200 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={removePhoto}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-lg bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-300">
                          <span className="text-gray-400 text-3xl">👤</span>
                        </div>
                      )}
                    </div>

                    {/* Camera View */}
                    {showCamera && (
                      <div className="flex-shrink-0">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-48 h-36 rounded-lg object-cover border-2 border-blue-300 bg-black"
                        />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            📸 Capture
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="flex-1 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Upload/Camera Buttons */}
                    {!showCamera && (
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                        >
                          📁 Upload Photo
                        </button>
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                        >
                          📷 Camera Capture
                        </button>
                        <p className="text-xs text-gray-400 mt-1">Max 10MB · JPG, PNG, WebP</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    rows={2}
                    placeholder="Full address"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setShowModal(false);
                      setEditingStudent(null);
                      resetForm();
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    )}
                    {editingStudent ? 'Update Student' : 'Create Student'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Student Detail Modal */}
      {showViewModal && viewingStudent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => { setShowViewModal(false); setViewingStudent(null); }}></div>

            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full mx-auto z-10 overflow-hidden">
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white">
                <div className="flex items-center gap-4">
                  {/* Photo */}
                  <div className="flex-shrink-0">
                    {loadingStudent && !viewingStudent.photo_data ? (
                      <div className="w-20 h-20 rounded-full bg-white/20 animate-pulse"></div>
                    ) : viewingStudent.photo_data || viewingStudent.photo_thumbnail ? (
                      <img
                        src={viewingStudent.photo_data || viewingStudent.photo_thumbnail}
                        alt="Student"
                        className="w-20 h-20 rounded-full object-cover border-3 border-white/50 shadow-lg"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-3xl font-bold text-white/80">
                          {viewingStudent.first_name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-xl font-bold">{viewingStudent.surname ? `${viewingStudent.surname} ${viewingStudent.first_name}` : viewingStudent.first_name}</h3>
                    <p className="text-indigo-200 text-sm">{viewingStudent.admission_number}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {viewingStudent.class_name && (
                        <span className="bg-white/20 px-2 py-0.5 rounded text-xs">{viewingStudent.class_name} - {viewingStudent.section_name}</span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${viewingStudent.is_active ? 'bg-green-400/30 text-green-100' : 'bg-red-400/30 text-red-100'}`}>
                        {viewingStudent.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowViewModal(false); setViewingStudent(null); }}
                    className="text-white/70 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Details body */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {loadingStudent && (
                  <div className="flex items-center gap-2 text-indigo-600 text-sm mb-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>
                    Loading full details...
                  </div>
                )}

                {/* Personal Information */}
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Information</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {[
                      { label: 'First Name', value: viewingStudent.first_name },
                      { label: 'Surname', value: viewingStudent.surname },
                      { label: 'Gender', value: viewingStudent.gender },
                      { label: 'Date of Birth', value: viewingStudent.date_of_birth },
                      { label: 'Blood Group', value: viewingStudent.blood_group },
                      { label: 'Caste', value: viewingStudent.caste },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="text-sm font-medium text-gray-800">{item.value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ID & Academic */}
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">ID & Academic</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {[
                      { label: 'Admission No', value: viewingStudent.admission_number },
                      { label: 'RFID / Biometric', value: viewingStudent.rfid_id },
                      { label: 'Aadhaar Number', value: viewingStudent.aadhaar_number },
                      { label: 'PEN', value: viewingStudent.pen },
                      { label: 'Roll Number', value: viewingStudent.roll_number },
                      { label: 'Session Timings', value: viewingStudent.session_timings },
                      { label: 'Class', value: viewingStudent.class_name },
                      { label: 'Section', value: viewingStudent.section_name },
                      { label: 'Admission Date', value: viewingStudent.admission_date },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="text-sm font-medium text-gray-800">{item.value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Family & Contact */}
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Family & Contact</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {[
                      { label: 'Father/Guardian', value: viewingStudent.father_guardian_name },
                      { label: 'Mother\'s Name', value: viewingStudent.mother_name },
                      { label: 'Mobile', value: viewingStudent.mobile_number },
                      { label: 'Phone', value: viewingStudent.phone_number },
                      { label: 'Email', value: viewingStudent.email },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="text-sm font-medium text-gray-800">{item.value || '-'}</p>
                      </div>
                    ))}
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-xs text-gray-400">Address</p>
                      <p className="text-sm font-medium text-gray-800">{viewingStudent.address || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* System Info */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">System Info</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                    {[
                      { label: 'Student ID', value: String(viewingStudent.id) },
                      { label: 'Created At', value: viewingStudent.created_at ? new Date(viewingStudent.created_at).toLocaleString() : '-' },
                      { label: 'Updated At', value: viewingStudent.updated_at ? new Date(viewingStudent.updated_at).toLocaleString() : '-' },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs text-gray-400">{item.label}</p>
                        <p className="text-sm font-medium text-gray-800">{item.value || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-4 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    if (viewingStudent) handleEdit(viewingStudent);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm"
                >
                  Edit Student
                </button>
                <button
                  onClick={() => { setShowViewModal(false); setViewingStudent(null); }}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowImportModal(false)}></div>

            <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full mx-auto p-6 z-10">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Students</h3>
              
              {/* Download Template Section */}
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">Step 1: Download Template</p>
                    <p className="text-xs text-green-600 mt-1">Get the template with all required columns</p>
                  </div>
                  <button
                    onClick={() => {
                      const headers = [
                        'Admission No',
                        'Enter RFID / FACE / Finger print ID number',
                        'Student Name',
                        'Student Surname',
                        'Fathers or Guardians Name',
                        'Mobile Number',
                        '* Sessions (Student Timings)',
                        '* Class Name',
                        '* Section Name',
                        'Photo',
                        'Adhar Card Number',
                        'Login Username For Parent',
                        'Login Password For Parent',
                        'Mothers Name',
                        'Blood Group',
                        'Caste',
                        'Phone Number',
                        'Email id',
                        'Address',
                        'Date of Birth',
                        'Gender'
                      ];
                      const sampleRow = [
                        'KTSN20251',
                        'KTSN20251',
                        'SAMPLE',
                        'STUDENT',
                        'FATHER NAME',
                        '9876543210',
                        'SCHOOL TIMINGS',
                        '1 CLASS',
                        'A',
                        '',
                        '123456789012',
                        '',
                        '',
                        'MOTHER NAME',
                        'B+',
                        '',
                        '',
                        'student@email.com',
                        'Address Here',
                        '01/15/2018',
                        'Male'
                      ];
                      const csvContent = [
                        headers.map(h => `"${h}"`).join(','),
                        sampleRow.map(s => `"${s}"`).join(',')
                      ].join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'student_import_template.csv';
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  >
                    📥 Download Template
                  </button>
                </div>
              </div>

              {/* Upload Section */}
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-2">Step 2: Upload Your File</p>
                <p className="text-xs text-blue-600 mb-3">Fill in the template and upload it here</p>
                
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-blue-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-8 h-8 mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-blue-600">
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-blue-500">CSV, XLS, or XLSX files</p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(file);
                    }}
                    disabled={importing}
                  />
                </label>
                
                {importing && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-blue-600">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    <span className="text-sm">Importing students... Please wait, this may take a moment.</span>
                  </div>
                )}
              </div>

              {/* Expected Columns Info */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-700 mb-1">Required columns:</p>
                <p className="text-xs text-gray-500">
                  Admission No, Student Name, Class Name, Section Name
                </p>
                <p className="text-xs font-medium text-gray-700 mt-2 mb-1">Optional columns:</p>
                <p className="text-xs text-gray-500">
                  RFID ID, Surname, Father/Guardian Name, Mobile, Sessions, Aadhaar, Mother's Name, Blood Group, Caste, Email, Address, DOB, Gender
                </p>
              </div>

              {/* Import Results Display */}
              {importResult && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                    ✅ Import Completed Successfully!
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white p-2 rounded border border-green-100">
                      <p className="text-xs text-gray-500">Total Rows</p>
                      <p className="font-semibold text-gray-800">{importResult.total_rows}</p>
                    </div>
                    <div className="bg-white p-2 rounded border border-green-100">
                      <p className="text-xs text-gray-500">Imported</p>
                      <p className="font-semibold text-green-600">{importResult.imported_count}</p>
                    </div>
                    {importResult.skipped_count > 0 && (
                      <div className="bg-white p-2 rounded border border-yellow-100">
                        <p className="text-xs text-gray-500">Skipped (Duplicates)</p>
                        <p className="font-semibold text-yellow-600">{importResult.skipped_count}</p>
                      </div>
                    )}
                  </div>
                  
                  {importResult.created_classes && importResult.created_classes.length > 0 && (
                    <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-100">
                      <p className="text-xs font-medium text-blue-800 mb-1">
                        📚 Auto-created {new Set(importResult.created_classes).size} new class(es):
                      </p>
                      <p className="text-xs text-blue-600">
                        {[...new Set(importResult.created_classes)].join(', ')}
                      </p>
                    </div>
                  )}
                  
                  {importResult.created_sections && importResult.created_sections.length > 0 && (
                    <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-100">
                      <p className="text-xs font-medium text-purple-800 mb-1">
                        📋 Auto-created {new Set(importResult.created_sections).size} new section(s):
                      </p>
                      <p className="text-xs text-purple-600">
                        {[...new Set(importResult.created_sections)].join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Import Errors Display */}
              {importErrors.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-red-800 mb-2">Import Errors ({importErrors.length}):</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {importErrors.slice(0, 20).map((err, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-red-400">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                    {importErrors.length > 20 && (
                      <li className="text-red-500 font-medium">...and {importErrors.length - 20} more errors</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportResult(null);
                    setImportErrors([]);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
