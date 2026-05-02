import React, { useEffect, useState, useCallback } from 'react';
import marksEntryService, { 
  MarksEntryGridResponse, 
  SubjectColumnInfo, 
  StudentWithMarks,
  MarksEntryRequest,
  SubjectMarkEntry,
  ClassSectionOption,
  ExamOption,
  AttendanceMonthInfo,
  SavedAttendanceMap,
  StudentAttendanceEntry
} from '../../services/marksEntryService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classNameService, { ClassName } from '../../services/classNameService';

// Academic year month order: June(6) to April(4), excluding May(5)
const academicMonthOrder = (month: number) => {
  // June=0, July=1, ..., Dec=6, Jan=7, Feb=8, Mar=9, Apr=10
  return month >= 6 ? month - 6 : month + 6;
};

const MarksEntry: React.FC = () => {
  // Filter state
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [sections, setSections] = useState<ClassSectionOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedClassNameId, setSelectedClassNameId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);

  // Grid state
  const [gridData, setGridData] = useState<MarksEntryGridResponse | null>(null);
  const [marksInput, setMarksInput] = useState<{ [key: string]: string }>({});
  
  // Attendance state
  const [attendanceMonths, setAttendanceMonths] = useState<AttendanceMonthInfo[]>([]);
  const [selectedAttMonths, setSelectedAttMonths] = useState<AttendanceMonthInfo[]>([]);
  const [attendanceInput, setAttendanceInput] = useState<{ [key: string]: string }>({}); // key: studentId_month_year
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  
  // General search filter
  const [generalSearch, setGeneralSearch] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch sections when class changes
  useEffect(() => {
    if (selectedClassNameId) {
      fetchSections(selectedClassNameId);
    } else {
      setSections([]);
      setSelectedSectionId(null);
    }
  }, [selectedClassNameId]);

  // Fetch exams when academic year changes
  useEffect(() => {
    if (selectedAcademicYearId) {
      fetchExams(selectedAcademicYearId);
    } else {
      setExams([]);
      setSelectedExamId(null);
    }
  }, [selectedAcademicYearId]);

  const fetchInitialData = async () => {
    try {
      setInitialLoading(true);
      const [yearsData, classNamesData] = await Promise.all([
        academicYearService.listAcademicYears(false),
        classNameService.listClassNames(false)
      ]);
      setAcademicYears(yearsData);
      setClassNames(classNamesData);
      
      // Set default academic year
      const currentYear = yearsData.find(y => y.is_current) || yearsData[0];
      if (currentYear) {
        setSelectedAcademicYearId(currentYear.id);
      }
    } catch (err: any) {
      setError('Failed to load initial data');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchSections = async (classNameId: number) => {
    try {
      const sectionsData = await marksEntryService.getClassSectionsByClass(classNameId);
      setSections(sectionsData);
    } catch (err: any) {
      console.error('Failed to fetch sections:', err);
      setSections([]);
    }
  };

  const fetchExams = async (academicYearId: number) => {
    try {
      const examsData = await marksEntryService.getExamsByAcademicYear(academicYearId);
      setExams(examsData);
    } catch (err: any) {
      console.error('Failed to fetch exams:', err);
      setExams([]);
    }
  };

  const handleSearch = async () => {
    if (!selectedExamId || !selectedSectionId) {
      setError('Please select Exam and Section');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setGridData(null);
      
      const data = await marksEntryService.getMarksEntryGrid(
        selectedExamId,
        selectedSectionId,
        selectedAcademicYearId || undefined
      );
      
      setGridData(data);
      
      // Initialize marks input state
      const initialMarks: { [key: string]: string } = {};
      data.students.forEach(student => {
        data.subjects.forEach(subject => {
          const key = `${student.student_id}_${subject.subject_id}`;
          const mark = student.marks[subject.subject_id.toString()];
          if (mark === 'AB') {
            initialMarks[key] = 'AB';
          } else if (mark !== null && mark !== undefined) {
            initialMarks[key] = mark.toString();
          } else {
            initialMarks[key] = '';
          }
        });
      });
      setMarksInput(initialMarks);

      // Fetch attendance months from academic calendar
      if (selectedAcademicYearId && selectedSectionId) {
        try {
          const [months, savedAtt] = await Promise.all([
            marksEntryService.getAttendanceMonths(selectedAcademicYearId, selectedSectionId),
            marksEntryService.getAttendance(selectedExamId!, selectedSectionId, selectedAcademicYearId || undefined),
          ]);
          // Filter out May and sort in academic year order (June to April)
          const sortedMonths = months
            .filter(m => m.month !== 5)
            .sort((a, b) => {
              if (a.year !== b.year) return a.year - b.year;
              return academicMonthOrder(a.month) - academicMonthOrder(b.month);
            });
          setAttendanceMonths(sortedMonths);
          // Initialize attendance input from saved data
          const initialAtt: { [key: string]: string } = {};
          const savedMonthKeys = new Set<string>();
          data.students.forEach(student => {
            months.forEach(m => {
              const key = `${student.student_id}_${m.month}_${m.year}`;
              if (savedAtt[key] && savedAtt[key].present_days > 0) {
                initialAtt[key] = savedAtt[key].present_days.toString();
                savedMonthKeys.add(`${m.month}_${m.year}`);
              } else {
                initialAtt[key] = '';
              }
            });
          });
          setAttendanceInput(initialAtt);
          // Auto-select only months that have saved attendance with present_days > 0
          const autoSelected = sortedMonths.filter(m => savedMonthKeys.has(`${m.month}_${m.year}`));
          setSelectedAttMonths(autoSelected);
          setShowAttendance(months.length > 0);
        } catch (err) {
          console.error('Failed to fetch attendance months:', err);
          setAttendanceMonths([]);
          setSelectedAttMonths([]);
          setShowAttendance(false);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch marks data');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSearch = () => {
    setSelectedExamId(null);
    setSelectedClassNameId(null);
    setSelectedSectionId(null);
    setGridData(null);
    setMarksInput({});
    setAttendanceMonths([]);
    setSelectedAttMonths([]);
    setAttendanceInput({});
    setShowAttendance(false);
    setGeneralSearch('');
    setError('');
    setSuccess('');
  };

  const handleMarkChange = (studentId: number, subjectId: number, value: string) => {
    const key = `${studentId}_${subjectId}`;
    // Allow empty, numbers, or "AB"
    if (value === '' || value.toUpperCase() === 'AB' || /^\d*\.?\d*$/.test(value)) {
      setMarksInput(prev => ({
        ...prev,
        [key]: value.toUpperCase() === 'AB' ? 'AB' : value
      }));
    }
  };

  const handleUpdateMarks = async () => {
    if (!gridData) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const subjects: SubjectMarkEntry[] = gridData.subjects.map(subject => ({
        subject_id: subject.subject_id,
        subject_name: subject.subject_name,
        max_marks: subject.max_marks,
        min_marks: subject.min_marks,
        marks: gridData.students.map(student => {
          const key = `${student.student_id}_${subject.subject_id}`;
          const value = marksInput[key] || '';
          
          if (value === 'AB') {
            return {
              student_id: student.student_id,
              marks_obtained: null,
              is_absent: true
            };
          } else if (value !== '') {
            return {
              student_id: student.student_id,
              marks_obtained: parseFloat(value),
              is_absent: false
            };
          } else {
            return {
              student_id: student.student_id,
              marks_obtained: null,
              is_absent: false
            };
          }
        })
      }));

      const request: MarksEntryRequest = {
        exam_type_id: gridData.exam_type_id,
        academic_year_id: gridData.academic_year_id,
        class_section_id: gridData.class_section_id,
        subjects
      };

      const result = await marksEntryService.updateMarks(request);

      // Also save/clear attendance if months are selected
      let attMsg = '';
      if (selectedAttMonths.length > 0) {
        const entries: StudentAttendanceEntry[] = [];
        gridData.students.forEach(student => {
          selectedAttMonths.forEach(m => {
            const aKey = `${student.student_id}_${m.month}_${m.year}`;
            const aVal = attendanceInput[aKey];
            const parsed = aVal !== undefined && aVal !== '' ? parseInt(aVal) : 0;
            entries.push({ student_id: student.student_id, month: m.month, year: m.year, total_working_days: m.total_working_days, present_days: isNaN(parsed) ? 0 : parsed });
          });
        });
        const attBase = { exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id, class_section_id: gridData.class_section_id };
        if (entries.length > 0) {
          const r = await marksEntryService.saveAttendance({ ...attBase, entries });
          attMsg = ` | Att: ${r.created} created, ${r.updated} updated`;
        }
        // Deselect months where all students now have empty or 0 input
        setSelectedAttMonths(selectedAttMonths.filter(m =>
          gridData.students.some(s => {
            const aVal = attendanceInput[`${s.student_id}_${m.month}_${m.year}`];
            const parsed = aVal !== undefined && aVal !== '' ? parseInt(aVal) : NaN;
            return !isNaN(parsed) && parsed > 0;
          })
        ));
      }

      setSuccess(`Marks updated successfully! (${result.created} created, ${result.updated} updated)${attMsg}`);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? (detail[0]?.msg || 'Validation error') : (detail || 'Failed to update'));
    } finally {
      setSaving(false);
    }
  };

  // Filter students by search term
  const searchTerm = generalSearch.toLowerCase().trim();
  const filteredStudents = gridData
    ? (searchTerm
        ? gridData.students.filter(s =>
            (s.student_name || '').toLowerCase().includes(searchTerm) ||
            (s.admission_number || '').toLowerCase().includes(searchTerm)
          )
        : gridData.students)
    : [];

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Filter Card */}
      <div className="bg-white rounded-lg shadow mb-6">
        {/* Teal top bar */}
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        
        {/* Title Bar */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">
            MARKS ENTRY
          </h2>
          <div className="flex gap-2">
            <span className="text-gray-400 cursor-pointer">∨</span>
            <span className="text-gray-400 cursor-pointer">⚙</span>
            <span className="text-gray-400 cursor-pointer">✕</span>
          </div>
        </div>

        {/* Filter Form */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Academic Year */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
              <select
                value={selectedAcademicYearId || ''}
                onChange={(e) => setSelectedAcademicYearId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Select Academic Year --</option>
                {academicYears.map(year => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </select>
            </div>

            {/* Select Exam */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Select Exam</label>
              <select
                value={selectedExamId || ''}
                onChange={(e) => setSelectedExamId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Select Exam --</option>
                {exams.map(exam => (
                  <option key={exam.id} value={exam.id}>{exam.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Class Name */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Class Name</label>
              <select
                value={selectedClassNameId || ''}
                onChange={(e) => {
                  setSelectedClassNameId(e.target.value ? parseInt(e.target.value) : null);
                  setSelectedSectionId(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Select Class --</option>
                {classNames.map(cn => (
                  <option key={cn.id} value={cn.id}>{cn.name}</option>
                ))}
              </select>
            </div>

            {/* Section Name */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">Section Name</label>
              <select
                value={selectedSectionId || ''}
                onChange={(e) => setSelectedSectionId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                disabled={!selectedClassNameId}
              >
                <option value="">-- Select Section --</option>
                {sections.map(section => (
                  <option key={section.id} value={section.id}>{section.section_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={handleResetSearch}
              className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium"
            >
              Reset Search
            </button>
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

      {/* Marks Entry Grid */}
      {gridData && (
        <div className="bg-white rounded-lg shadow relative">
          {/* Teal top bar */}
          <div className="h-1 bg-teal-500 rounded-t-lg"></div>
          {/* Quick Fill Actions */}
          <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 sticky top-0 z-10 items-center">
            <button className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-medium" onClick={() => {
              // Fill all as present (empty)
              const updated = { ...marksInput };
              gridData.students.forEach(student => {
                gridData.subjects.forEach(subject => {
                  const key = `${student.student_id}_${subject.subject_id}`;
                  if (updated[key] === 'AB') updated[key] = '';
                });
              });
              setMarksInput(updated);
            }}>Fill All Present</button>
            <button className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium" onClick={() => {
              // Fill all as absent
              const updated = { ...marksInput };
              gridData.students.forEach(student => {
                gridData.subjects.forEach(subject => {
                  const key = `${student.student_id}_${subject.subject_id}`;
                  updated[key] = 'AB';
                });
              });
              setMarksInput(updated);
            }}>Fill All Absent</button>
            <button className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs font-medium" onClick={() => {
              // Clear all
              const updated = { ...marksInput };
              gridData.students.forEach(student => {
                gridData.subjects.forEach(subject => {
                  const key = `${student.student_id}_${subject.subject_id}`;
                  updated[key] = '';
                });
              });
              setMarksInput(updated);
            }}>Clear All</button>
            <button className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-xs font-medium" onClick={handleUpdateMarks} disabled={saving}>
              {saving ? 'Saving All...' : 'Save All'}
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                placeholder="🔍 Filter by name or admission no..."
                className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64"
              />
              {searchTerm && (
                <span className="text-xs text-gray-500">{filteredStudents.length}/{gridData.students.length}</span>
              )}
            </div>
          </div>
          {/* Summary Feedback */}
          <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-600">Missing marks: {
              gridData.students.reduce((count, student) => {
                return count + gridData.subjects.filter(subject => {
                  const key = `${student.student_id}_${subject.subject_id}`;
                  return !marksInput[key] || marksInput[key] === '';
                }).length;
              }, 0)
            } | Invalid marks: {
              gridData.students.reduce((count, student) => {
                return count + gridData.subjects.filter(subject => {
                  const key = `${student.student_id}_${subject.subject_id}`;
                  const value = marksInput[key] || '';
                  return value !== '' && value !== 'AB' && (parseFloat(value) < subject.min_marks || parseFloat(value) > subject.max_marks);
                }).length;
              }, 0)
            }</span>
          </div>
          {/* Attendance Month Selector */}
          {showAttendance && attendanceMonths.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 bg-orange-50 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-orange-700">📋 Attendance Months:</span>
              {attendanceMonths.map(m => {
                const isSel = selectedAttMonths.some(sm => sm.month === m.month && sm.year === m.year);
                return (
                  <button
                    key={`${m.month}_${m.year}`}
                    type="button"
                    onClick={() => {
                      if (isSel) {
                        // Deselect: clear inputs + immediately delete from DB by sending present_days=0
                        const newInput = { ...attendanceInput };
                        if (gridData) {
                          gridData.students.forEach(s => { newInput[`${s.student_id}_${m.month}_${m.year}`] = ''; });
                          marksEntryService.saveAttendance({
                            exam_type_id: gridData.exam_type_id,
                            academic_year_id: gridData.academic_year_id,
                            class_section_id: gridData.class_section_id,
                            entries: gridData.students.map(s => ({ student_id: s.student_id, month: m.month, year: m.year, total_working_days: m.total_working_days, present_days: 0 }))
                          }).catch(err => console.error('Failed to delete attendance:', err));
                        }
                        setAttendanceInput(newInput);
                        setSelectedAttMonths(prev => prev.filter(sm => !(sm.month === m.month && sm.year === m.year)));
                      } else if (selectedAttMonths.length < 5) {
                        setSelectedAttMonths(prev => [...prev, m]);
                      }
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${
                      isSel ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                    }`}
                  >
                    {m.month_name.substring(0, 3)} ({m.total_working_days}d)
                  </button>
                );
              })}
              <span className="text-[10px] text-gray-400 ml-1">(max 5)</span>
            </div>
          )}
          {/* Table */}
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <table className="min-w-full">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b sticky left-0 bg-gray-50">Student Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 border-b sticky left-32 bg-gray-50">Admission No</th>
                  {[...selectedAttMonths].sort((a, b) => a.year === b.year ? academicMonthOrder(a.month) - academicMonthOrder(b.month) : a.year - b.year).map(m => (
                    <th key={`att-h1-${m.month}_${m.year}`} className="px-2 py-1 text-center text-xs border-b bg-orange-50" colSpan={2}>
                      <div className="font-semibold text-orange-700">{m.month_name.substring(0, 3)} {m.year}</div>
                    </th>
                  ))}
                  {gridData.subjects.map(subject => (
                    <th key={subject.subject_id} className="px-4 py-1 text-center text-xs text-gray-500 border-b">
                      <div>Min : {subject.min_marks}</div>
                      <div>and Max: {subject.max_marks}</div>
                    </th>
                  ))}
                  <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 border-b" rowSpan={2}>Action</th>
                </tr>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b sticky left-0 bg-gray-50"></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 border-b sticky left-32 bg-gray-50"></th>
                  {[...selectedAttMonths].sort((a, b) => a.year === b.year ? academicMonthOrder(a.month) - academicMonthOrder(b.month) : a.year - b.year).map(m => (
                    <React.Fragment key={`att-h2-${m.month}_${m.year}`}>
                      <th className="px-2 py-1 text-center text-[10px] text-orange-600 bg-orange-50 border-b">Working Days</th>
                      <th className="px-2 py-1 text-center text-[10px] text-orange-600 bg-orange-50 border-b">Present Days</th>
                    </React.Fragment>
                  ))}
                  {gridData.subjects.map(subject => (
                    <th key={`name-${subject.subject_id}`} className="px-4 py-2 text-center text-sm font-medium text-gray-700">
                      {subject.subject_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={gridData.subjects.length + 3 + selectedAttMonths.length * 2} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm ? 'No students match your search.' : 'No students found in this class section.'}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, index) => (
                    <tr key={student.student_id} className={index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-4 py-3 text-sm text-indigo-600 sticky left-0 bg-white">
                        {student.student_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 sticky left-32 bg-white">
                        {student.admission_number}
                      </td>
                      {[...selectedAttMonths].sort((a, b) => a.year === b.year ? academicMonthOrder(a.month) - academicMonthOrder(b.month) : a.year - b.year).map(m => {
                        const attKey = `${student.student_id}_${m.month}_${m.year}`;
                        const presentVal = attendanceInput[attKey] || '';
                        const attInvalid = presentVal !== '' && (parseInt(presentVal) < 0 || parseInt(presentVal) > m.total_working_days || isNaN(parseInt(presentVal)));
                        return (
                          <React.Fragment key={`att-${m.month}_${m.year}`}>
                            <td className="px-2 py-2 text-center bg-orange-50/50 border-l border-orange-200">
                              <span className="inline-block bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-xs">{m.total_working_days}</span>
                            </td>
                            <td className="px-2 py-2 text-center bg-orange-50/30">
                              <input
                                type="number"
                                value={presentVal}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v === '' || isNaN(parseInt(v))) { setAttendanceInput(prev => ({ ...prev, [attKey]: v })); return; }
                                  const num = parseInt(v);
                                  setAttendanceInput(prev => ({ ...prev, [attKey]: num > m.total_working_days ? String(m.total_working_days) : num < 0 ? '0' : String(num) }));
                                }}
                                min={0}
                                max={m.total_working_days}
                                className={`w-14 px-1 py-1 border rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                                  attInvalid ? 'border-red-500 bg-red-50' : 'border-orange-300'
                                }`}
                                placeholder="0"
                              />
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {gridData.subjects.map(subject => {
                        const key = `${student.student_id}_${subject.subject_id}`;
                        const value = marksInput[key] || '';
                        const isInvalid = value !== '' && value !== 'AB' && 
                          (parseFloat(value) < subject.min_marks || parseFloat(value) > subject.max_marks);
                        return (
                          <td key={subject.subject_id} className="px-4 py-2 text-center">
                            <input
                              type="text"
                              value={value}
                              onChange={(e) => handleMarkChange(student.student_id, subject.subject_id, e.target.value)}
                              className={`w-20 px-2 py-1 border rounded text-center text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                isInvalid ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              } ${value === 'AB' ? 'text-red-500' : ''}`}
                              placeholder=""
                              tabIndex={index * gridData.subjects.length}
                            />
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-center">
                        <button
                          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                          disabled={saving}
                          onClick={async () => {
                            // Only update this student's marks
                            if (!gridData) return;
                            try {
                              setSaving(true);
                              setError('');
                              setSuccess('');
                              const subjects = gridData.subjects.map(subject => {
                                const key = `${student.student_id}_${subject.subject_id}`;
                                const value = marksInput[key] || '';
                                if (value === 'AB') {
                                  return {
                                    subject_id: subject.subject_id,
                                    subject_name: subject.subject_name,
                                    max_marks: subject.max_marks,
                                    min_marks: subject.min_marks,
                                    marks: [{
                                      student_id: student.student_id,
                                      marks_obtained: null,
                                      is_absent: true
                                    }]
                                  };
                                } else if (value !== '') {
                                  return {
                                    subject_id: subject.subject_id,
                                    subject_name: subject.subject_name,
                                    max_marks: subject.max_marks,
                                    min_marks: subject.min_marks,
                                    marks: [{
                                      student_id: student.student_id,
                                      marks_obtained: parseFloat(value),
                                      is_absent: false
                                    }]
                                  };
                                } else {
                                  return {
                                    subject_id: subject.subject_id,
                                    subject_name: subject.subject_name,
                                    max_marks: subject.max_marks,
                                    min_marks: subject.min_marks,
                                    marks: [{
                                      student_id: student.student_id,
                                      marks_obtained: null,
                                      is_absent: false
                                    }]
                                  };
                                }
                              });
                              const request = {
                                exam_type_id: gridData.exam_type_id,
                                academic_year_id: gridData.academic_year_id,
                                class_section_id: gridData.class_section_id,
                                subjects
                              };
                              const result = await marksEntryService.updateMarks(request);
                              // Save/clear attendance for this student
                              let attMsg = '';
                              if (selectedAttMonths.length > 0) {
                                const entries: StudentAttendanceEntry[] = [];
                                selectedAttMonths.forEach(m => {
                                  const aKey = `${student.student_id}_${m.month}_${m.year}`;
                                  const aVal = attendanceInput[aKey];
                                  const parsed = aVal !== undefined && aVal !== '' ? parseInt(aVal) : 0;
                                  entries.push({ student_id: student.student_id, month: m.month, year: m.year, total_working_days: m.total_working_days, present_days: isNaN(parsed) ? 0 : parsed });
                                });
                                const attBase = { exam_type_id: gridData.exam_type_id, academic_year_id: gridData.academic_year_id, class_section_id: gridData.class_section_id };
                                if (entries.length > 0) {
                                  const r = await marksEntryService.saveAttendance({ ...attBase, entries });
                                  attMsg = ` | Att: ${r.created} created, ${r.updated} updated`;
                                }
                                // Deselect months where all students have empty or 0 input
                                setSelectedAttMonths(selectedAttMonths.filter(m =>
                                  gridData.students.some(s => {
                                    const aVal = attendanceInput[`${s.student_id}_${m.month}_${m.year}`];
                                    const parsed = aVal !== undefined && aVal !== '' ? parseInt(aVal) : NaN;
                                    return !isNaN(parsed) && parsed > 0;
                                  })
                                ));
                              }
                              setSuccess(`Updated ${student.student_name}! (Marks: ${result.created}+${result.updated}${attMsg})`);
                            } catch (err: any) {
                              const detail = err.response?.data?.detail;
                              setError(Array.isArray(detail) ? (detail[0]?.msg || 'Validation error') : (detail || 'Failed to update'));
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {saving ? 'Saving...' : 'Update'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance is now integrated into the marks grid above */}
    </div>
  );
};

export default MarksEntry;
