import React, { useEffect, useState } from 'react';
import examinationScheduleService, { ExaminationSchedule, ExaminationScheduleCreate, ExaminationScheduleSubjectInput } from '../../services/examinationScheduleService';
import examTypeService, { ExamType } from '../../services/examTypeService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classSectionService, { ClassSection } from '../../services/classSectionService';
import subjectService, { Subject } from '../../services/subjectService';

interface ClassGroup {
  class_name: string;
  sections: { id: number; section_name: string }[];
}

interface SubjectScheduleEntry {
  subject_id: number;
  subject_name: string;
  subject_code: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  max_marks: number;
  pass_marks: number;
  display_order: number;
}

const MapExams: React.FC = () => {
  const [schedules, setSchedules] = useState<ExaminationSchedule[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ExaminationSchedule | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Form state
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedExamTypeId, setSelectedExamTypeId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedClassSections, setSelectedClassSections] = useState<number[]>([]);

  // Subject scheduling state
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [subjectSchedules, setSubjectSchedules] = useState<SubjectScheduleEntry[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Filtered exam types based on selected academic year
  const [filteredExamTypes, setFilteredExamTypes] = useState<ExamType[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [currentPage, pageSize]);

  useEffect(() => {
    // Filter exam types by selected academic year
    if (selectedAcademicYearId) {
      const filtered = examTypes.filter(
        et => et.academic_year_id === selectedAcademicYearId || et.academic_year_id === null
      );
      setFilteredExamTypes(filtered);
    } else {
      setFilteredExamTypes(examTypes);
    }
  }, [selectedAcademicYearId, examTypes]);

  // Function to fetch subjects for given class section IDs
  const fetchSubjectsForClassSections = async (classSectionIds: number[]) => {
    if (classSectionIds.length === 0) {
      setAvailableSubjects([]);
      return;
    }
    
    try {
      setLoadingSubjects(true);
      const subjects = await subjectService.getSubjectsByClassSections(classSectionIds);
      setAvailableSubjects(subjects);
    } catch (err) {
      console.error('Failed to fetch subjects:', err);
      setAvailableSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  // Fetch subjects when class sections change or modal opens
  useEffect(() => {
    if (showModal && selectedClassSections.length > 0) {
      fetchSubjectsForClassSections(selectedClassSections);
    } else if (!showModal) {
      setAvailableSubjects([]);
    }
  }, [selectedClassSections, showModal]);

  const fetchInitialData = async () => {
    try {
      const [yearsData, typesData, sectionsData] = await Promise.all([
        academicYearService.listAcademicYears(false),
        examTypeService.listExamTypes({ include_inactive: false }),
        classSectionService.listClassSections()
      ]);
      setAcademicYears(yearsData);
      setExamTypes(typesData);
      setFilteredExamTypes(typesData);
      setClassSections(sectionsData);
      
      // Set default academic year
      const currentYear = yearsData.find(y => y.is_current) || yearsData[0];
      if (currentYear) {
        setSelectedAcademicYearId(currentYear.id);
      }
    } catch (err: any) {
      console.error('Failed to fetch initial data:', err);
    }
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const skip = (currentPage - 1) * pageSize;
      const [data, count] = await Promise.all([
        examinationScheduleService.listExaminationSchedules({ skip, limit: pageSize, include_inactive: true }),
        examinationScheduleService.countExaminationSchedules({ include_inactive: true })
      ]);
      setSchedules(data);
      setTotalCount(count);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch examination schedules');
    } finally {
      setLoading(false);
    }
  };

  // Group class sections by class name for hierarchical display
  const getGroupedClasses = (): ClassGroup[] => {
    const grouped: { [key: string]: { id: number; section_name: string }[] } = {};
    
    classSections.forEach(cs => {
      if (!grouped[cs.class_name]) {
        grouped[cs.class_name] = [];
      }
      grouped[cs.class_name].push({ id: cs.id, section_name: cs.section_name });
    });

    return Object.entries(grouped).map(([class_name, sections]) => ({
      class_name,
      sections
    }));
  };

  // Check if all sections of a class are selected
  const isClassFullySelected = (className: string): boolean => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    return classSectionsForClass.every(cs => selectedClassSections.includes(cs.id));
  };

  // Check if some sections of a class are selected (for indeterminate state)
  const isClassPartiallySelected = (className: string): boolean => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    const selectedCount = classSectionsForClass.filter(cs => selectedClassSections.includes(cs.id)).length;
    return selectedCount > 0 && selectedCount < classSectionsForClass.length;
  };

  // Toggle all sections of a class
  const toggleClass = (className: string) => {
    const classSectionsForClass = classSections.filter(cs => cs.class_name === className);
    const allSelected = isClassFullySelected(className);
    
    if (allSelected) {
      setSelectedClassSections(prev => 
        prev.filter(id => !classSectionsForClass.some(cs => cs.id === id))
      );
    } else {
      const newIds = classSectionsForClass.map(cs => cs.id);
      setSelectedClassSections(prev => [...new Set([...prev, ...newIds])]);
    }
  };

  // Toggle a single section
  const toggleSection = (csId: number) => {
    setSelectedClassSections(prev => 
      prev.includes(csId) 
        ? prev.filter(id => id !== csId)
        : [...prev, csId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedExamTypeId) {
      setError('Please select an exam');
      return;
    }
    if (!fromDate || !toDate) {
      setError('Please select from and to dates');
      return;
    }
    if (selectedClassSections.length === 0) {
      setError('Please select at least one class section');
      return;
    }

    // Validate subject schedules have exam dates if subjects are added
    if (subjectSchedules.length > 0) {
      const invalidSubjects = subjectSchedules.filter(s => !s.exam_date);
      if (invalidSubjects.length > 0) {
        setError('Please set exam date for all subjects');
        return;
      }
    }

    try {
      setSaving(true);
      setError('');

      // Convert subject schedules to API format - only include subjects with valid exam dates
      const subjectsData: ExaminationScheduleSubjectInput[] = subjectSchedules
        .filter(s => s.exam_date) // Only include subjects with exam dates
        .map(s => ({
          subject_id: s.subject_id,
          exam_date: s.exam_date,
          start_time: s.start_time || null,
          end_time: s.end_time || null,
          max_marks: s.max_marks,
          pass_marks: s.pass_marks,
          display_order: s.display_order
        }));

      const data: ExaminationScheduleCreate = {
        exam_type_id: selectedExamTypeId,
        academic_year_id: selectedAcademicYearId,
        from_date: fromDate,
        to_date: toDate,
        class_section_ids: selectedClassSections,
        subjects: subjectsData
      };

      if (editingSchedule) {
        await examinationScheduleService.updateExaminationSchedule(editingSchedule.id, data);
        setSuccess('Examination schedule updated successfully!');
      } else {
        await examinationScheduleService.createExaminationSchedule(data);
        setSuccess('Examination schedule created successfully!');
      }

      setShowModal(false);
      resetForm();
      fetchSchedules();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save examination schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (schedule: ExaminationSchedule) => {
    setEditingSchedule(schedule);
    setSelectedAcademicYearId(schedule.academic_year_id);
    setSelectedExamTypeId(schedule.exam_type_id);
    setFromDate(schedule.from_date);
    setToDate(schedule.to_date);
    
    // Load class section IDs
    const csIds = schedule.class_sections.map(cs => cs.id);
    setSelectedClassSections(csIds);
    
    // Load subject schedules
    if (schedule.subjects && schedule.subjects.length > 0) {
      const subjectEntries: SubjectScheduleEntry[] = schedule.subjects.map(s => ({
        subject_id: s.subject_id,
        subject_name: s.subject_name,
        subject_code: s.subject_code,
        exam_date: s.exam_date,
        start_time: s.start_time || '',
        end_time: s.end_time || '',
        max_marks: s.max_marks,
        pass_marks: s.pass_marks ?? 35,
        display_order: s.display_order || 0
      }));
      // Sort by display_order
      subjectEntries.sort((a, b) => a.display_order - b.display_order);
      setSubjectSchedules(subjectEntries);
    } else {
      setSubjectSchedules([]);
    }
    
    setShowModal(true);
  };

  const handleDelete = async (scheduleId: number) => {
    if (!window.confirm('Are you sure you want to delete this examination schedule?')) return;

    try {
      await examinationScheduleService.deleteExaminationSchedule(scheduleId);
      setSuccess('Examination schedule deleted successfully!');
      fetchSchedules();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete examination schedule');
    }
  };

  const openCreateModal = () => {
    resetForm();
    setEditingSchedule(null);
    setShowModal(true);
  };

  const resetForm = () => {
    const currentYear = academicYears.find(y => y.is_current) || academicYears[0];
    setSelectedAcademicYearId(currentYear?.id || null);
    setSelectedExamTypeId(null);
    setFromDate('');
    setToDate('');
    setSelectedClassSections([]);
    setSubjectSchedules([]);
    setAvailableSubjects([]);
    setError('');
  };

  // Subject scheduling functions
  const addSubjectSchedule = (subject: Subject) => {
    // Check if already added
    if (subjectSchedules.some(s => s.subject_id === subject.id)) {
      return;
    }
    
    // Auto-assign next sequence number
    const nextOrder = subjectSchedules.length > 0 
      ? Math.max(...subjectSchedules.map(s => s.display_order)) + 1 
      : 1;
    
    setSubjectSchedules(prev => [...prev, {
      subject_id: subject.id,
      subject_name: subject.name,
      subject_code: subject.code,
      exam_date: fromDate || '',
      start_time: '',
      end_time: '',
      max_marks: 100,
      pass_marks: 35,
      display_order: nextOrder
    }]);
  };

  const removeSubjectSchedule = (subjectId: number) => {
    setSubjectSchedules(prev => prev.filter(s => s.subject_id !== subjectId));
  };

  const updateSubjectSchedule = (subjectId: number, field: keyof SubjectScheduleEntry, value: string | number) => {
    setSubjectSchedules(prev => prev.map(s => 
      s.subject_id === subjectId ? { ...s, [field]: value } : s
    ));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatClassSections = (schedule: ExaminationSchedule): React.ReactNode => {
    if (!schedule.class_sections || schedule.class_sections.length === 0) {
      return '-';
    }
    
    // Group by class name
    const grouped: { [key: string]: string[] } = {};
    schedule.class_sections.forEach(cs => {
      if (!grouped[cs.class_name]) {
        grouped[cs.class_name] = [];
      }
      grouped[cs.class_name].push(cs.section_name);
    });
    
    return Object.entries(grouped).map(([className, sections], idx) => (
      <div key={idx}>
        <span className="text-indigo-600">{className}</span>{' '}
        <span className="text-orange-500">{sections.join(' ')}</span>
      </div>
    ));
  };

  const formatSubjects = (schedule: ExaminationSchedule): React.ReactNode => {
    if (!schedule.subjects || schedule.subjects.length === 0) {
      return <span className="text-gray-400">-</span>;
    }
    
    return (
      <div className="space-y-1">
        {schedule.subjects.map((subject, idx) => (
          <div key={idx} className="text-xs">
            <span className="font-medium text-indigo-600">{subject.subject_name}</span>
            <span className="text-gray-500 ml-1">({formatDate(subject.exam_date)})</span>
          </div>
        ))}
      </div>
    );
  };

  const filteredSchedules = schedules.filter(
    (s) =>
      s.exam_type_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading && schedules.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header Card */}
      <div className="bg-white rounded-lg shadow mb-6">
        {/* Teal top bar */}
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        
        {/* Title Bar with Add Button */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-gray-700 tracking-wide">
            LIST OF EXAMINATION
          </h2>
          <button
            onClick={openCreateModal}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            ADD Examination
          </button>
        </div>
        <div className="h-0.5 bg-teal-500"></div>

        {/* Controls */}
        <div className="p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded text-sm">
              📥
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Search:</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Sr.No</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Exam Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Classes & Sections</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Subjects</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">From Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">To Date</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Created Date</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSchedules.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No examination schedules found. Click "ADD Examination" to create one.
                </td>
              </tr>
            ) : (
              filteredSchedules.map((schedule, index) => (
                <tr 
                  key={schedule.id} 
                  className={`border-b border-gray-100 ${index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <td className="px-4 py-3 text-sm text-indigo-600">
                    {(currentPage - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-4 py-3 text-sm text-indigo-600">
                    {schedule.exam_type_name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatClassSections(schedule)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {formatSubjects(schedule)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDate(schedule.from_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDate(schedule.to_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {formatDateTime(schedule.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(schedule)}
                        className="bg-green-500 hover:bg-green-600 text-white p-2 rounded"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-indigo-600">
              Showing {filteredSchedules.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                «
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 border rounded text-sm ${
                      currentPage === pageNum
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-start justify-center min-h-screen pt-4 px-4 pb-20">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowModal(false)}></div>
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-auto mt-10 z-10">
              {/* Modal Header */}
              <div className="bg-gray-100 px-6 py-4 rounded-t-lg border-b border-gray-200">
                <h3 className="text-lg font-normal text-gray-700 tracking-wide">
                  {editingSchedule ? 'EDIT EXAMINATION SETUP' : 'ADD EXAMINATION SETUP'}
                </h3>
              </div>
              <div className="h-0.5 bg-teal-500"></div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit}>
                <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
                  {/* Academic Year */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">
                      Academic Year
                    </label>
                    <select
                      value={selectedAcademicYearId || ''}
                      onChange={(e) => {
                        setSelectedAcademicYearId(e.target.value ? parseInt(e.target.value) : null);
                        setSelectedExamTypeId(null); // Reset exam selection when year changes
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                    >
                      <option value="">-- Select Academic Year --</option>
                      {academicYears.map(year => (
                        <option key={year.id} value={year.id}>
                          {year.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Exam */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">
                      Select Exam
                    </label>
                    <select
                      value={selectedExamTypeId || ''}
                      onChange={(e) => setSelectedExamTypeId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                    >
                      <option value="">-- Select Exam --</option>
                      {filteredExamTypes.map(exam => (
                        <option key={exam.id} value={exam.id}>
                          {exam.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Select Class - Hierarchical Checkboxes */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-2">
                      Select Class
                    </label>
                    <div className="border border-gray-200 rounded p-4 max-h-64 overflow-y-auto bg-gray-50">
                      {getGroupedClasses().map((classGroup) => (
                        <div key={classGroup.class_name} className="mb-4">
                          {/* Class Checkbox */}
                          <label className="flex items-center cursor-pointer mb-2">
                            <input
                              type="checkbox"
                              checked={isClassFullySelected(classGroup.class_name)}
                              ref={(el) => {
                                if (el) {
                                  el.indeterminate = isClassPartiallySelected(classGroup.class_name);
                                }
                              }}
                              onChange={() => toggleClass(classGroup.class_name)}
                              className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm font-medium text-gray-700">
                              {classGroup.class_name}
                            </span>
                          </label>
                          
                          {/* Section Checkboxes (indented) */}
                          <div className="ml-6 space-y-2">
                            {classGroup.sections.map((section) => (
                              <label key={section.id} className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedClassSections.includes(section.id)}
                                  onChange={() => toggleSection(section.id)}
                                  className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="ml-2 text-sm text-orange-500">
                                  {section.section_name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      {getGroupedClasses().length === 0 && (
                        <p className="text-gray-500 text-sm">No classes available. Please add classes first.</p>
                      )}
                    </div>
                  </div>

                  {/* Subject Scheduling Section - Always show after class selection section */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm text-gray-600">
                        Subject Schedule
                      </label>
                      {loadingSubjects && (
                        <span className="text-xs text-gray-500">Loading subjects...</span>
                      )}
                    </div>
                    
                    {selectedClassSections.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-gray-200">
                        Please select at least one class section above to add subjects.
                      </p>
                    ) : (
                      <>
                        {/* Add Subject Dropdown */}
                        <div className="mb-3">
                          <select
                            value=""
                            onChange={(e) => {
                              const subjectId = parseInt(e.target.value);
                              const subject = availableSubjects.find(s => s.id === subjectId);
                              if (subject) {
                                addSubjectSchedule(subject);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                            disabled={loadingSubjects || availableSubjects.length === 0}
                          >
                            <option value="">-- Add Subject --</option>
                            {availableSubjects
                              .filter(s => !subjectSchedules.some(ss => ss.subject_id === s.id))
                              .map(subject => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name} ({subject.code})
                                </option>
                              ))
                            }
                          </select>
                        </div>

                        {/* Subject Schedule Table */}
                        {subjectSchedules.length > 0 && (
                          <div className="border border-gray-200 rounded overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">Seq</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Exam Date</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Time</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">End Time</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Max Marks</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pass Marks</th>
                                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {[...subjectSchedules].sort((a, b) => a.display_order - b.display_order).map((schedule) => (
                                  <tr key={schedule.subject_id}>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        value={schedule.display_order}
                                        min={1}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'display_order', parseInt(e.target.value) || 1)}
                                        className="w-14 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      <span className="font-medium text-gray-900">{schedule.subject_name}</span>
                                      <span className="text-gray-500 ml-1">({schedule.subject_code})</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="date"
                                        value={schedule.exam_date}
                                        min={fromDate}
                                        max={toDate}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'exam_date', e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="time"
                                        value={schedule.start_time}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'start_time', e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="time"
                                        value={schedule.end_time}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'end_time', e.target.value)}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={schedule.max_marks}
                                        min={0}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'max_marks', parseInt(e.target.value) || 0)}
                                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={schedule.pass_marks}
                                        min={0}
                                        onChange={(e) => updateSubjectSchedule(schedule.subject_id, 'pass_marks', parseInt(e.target.value) || 0)}
                                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => removeSubjectSchedule(schedule.subject_id)}
                                        className="text-red-500 hover:text-red-700"
                                        title="Remove"
                                      >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {subjectSchedules.length === 0 && availableSubjects.length > 0 && !loadingSubjects && (
                          <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-gray-200">
                            No subjects added. Select a subject from the dropdown above.
                          </p>
                        )}

                        {availableSubjects.length === 0 && !loadingSubjects && (
                          <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-gray-200">
                            No subjects mapped to the selected classes. Please map subjects to classes first.
                          </p>
                        )}

                        {loadingSubjects && (
                          <p className="text-gray-500 text-sm text-center py-4 bg-gray-50 rounded border border-gray-200">
                            Loading available subjects...
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-start gap-2 px-6 py-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setEditingSchedule(null); }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapExams;
