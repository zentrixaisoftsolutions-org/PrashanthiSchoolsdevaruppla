import { useState, useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import resultsService, { ExamMapping, ReportCardsResponse } from '../../services/resultsService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import examTypeService from '../../services/examTypeService';
import classSectionService from '../../services/classSectionService';
import ReportCard from './ReportCard';
import schoolSettingsService, { SchoolSettings } from '../../services/schoolSettingsService';

interface ExamType {
  id: number;
  name: string;
  academic_year_id: number | null;
}

interface ClassSection {
  id: number;
  class_name: string;
  section_name: string;
}

const Results = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [examMappings, setExamMappings] = useState<ExamMapping[]>([]);
  
  // Filter states
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [uniqueClasses, setUniqueClasses] = useState<string[]>([]);
  const [filteredSections, setFilteredSections] = useState<string[]>([]);
  
  // Selected filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<number | ''>('');
  const [selectedExam, setSelectedExam] = useState<number | ''>('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [displayMarks, setDisplayMarks] = useState('Yes');
  const [displayAttendance, setDisplayAttendance] = useState('Dont Display Attendance');
  const [selectedFormat, setSelectedFormat] = useState('Exam Report 1');
  
  // Report card printing
  const [selectedMapping, setSelectedMapping] = useState<ExamMapping | null>(null);
  const [reportData, setReportData] = useState<ReportCardsResponse | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | 'all'>('all');
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: reportData ? `${reportData.exam_name}_${reportData.class_name}_${reportData.section_name}_Results` : 'Results',
    onAfterPrint: () => {
      setShowPrintPreview(false);
    }
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Update sections when class changes
  useEffect(() => {
    if (selectedClass) {
      const sections = classSections
        .filter(cs => cs.class_name === selectedClass)
        .map(cs => cs.section_name)
        .filter((v, i, a) => a.indexOf(v) === i);
      setFilteredSections(sections);
      setSelectedSection('');
    } else {
      setFilteredSections([]);
      setSelectedSection('');
    }
  }, [selectedClass, classSections]);

  // Load exams when academic year changes
  useEffect(() => {
    if (selectedAcademicYear) {
      loadExamTypes(selectedAcademicYear as number);
    } else {
      loadExamTypes();
    }
  }, [selectedAcademicYear]);

  const loadInitialData = async () => {
    try {
      const [years, classes, settings] = await Promise.all([
        academicYearService.listAcademicYears(),
        classSectionService.listClassSections(),
        schoolSettingsService.get().catch(() => null)
      ]);
      setAcademicYears(years);
      setClassSections(classes);
      if (settings) setSchoolSettings(settings);
      
      const unique = [...new Set(classes.map(cs => cs.class_name))];
      setUniqueClasses(unique);
      
      // Set current academic year as default
      const currentYear = years.find(y => y.is_current);
      if (currentYear) {
        setSelectedAcademicYear(currentYear.id);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  const loadExamTypes = async (academicYearId?: number) => {
    try {
      const exams = await examTypeService.listExamTypes({ academic_year_id: academicYearId });
      setExamTypes(exams);
    } catch (err) {
      console.error('Error loading exam types:', err);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const mappings = await resultsService.getExamMappings({
        academic_year_id: selectedAcademicYear || undefined,
        exam_type_id: selectedExam || undefined,
        class_name: selectedClass || undefined,
        section_name: selectedSection || undefined
      });
      setExamMappings(mappings);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedAcademicYear('');
    setSelectedExam('');
    setSelectedClass('');
    setSelectedSection('');
    setDisplayMarks('Yes');
    setDisplayAttendance('Dont Display Attendance');
    setSelectedFormat('Exam Report 1');
    setExamMappings([]);
  };

  const handlePrintReport = async (mapping: ExamMapping) => {
    setPrintLoading(true);
    setSelectedMapping(mapping);
    try {
      const data = await resultsService.getReportCards(
        mapping.exam_type_id,
        mapping.class_section_id,
        mapping.academic_year_id || undefined
      );
      setReportData(data);
      setSelectedStudentId('all');
      setShowPrintPreview(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load report cards');
    } finally {
      setPrintLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Results</h1>
        <p className="text-gray-600 mt-1">Generate and print report cards for students</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900 text-xl">&times;</button>
        </div>
      )}

      {/* Filters Card */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Academic Year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Academic Year</label>
            <select
              value={selectedAcademicYear}
              onChange={(e) => setSelectedAcademicYear(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">Select Academic Year</option>
              {academicYears.map(ay => (
                <option key={ay.id} value={ay.id}>{ay.name}</option>
              ))}
            </select>
          </div>

          {/* Exam */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Exam</label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">-- Select Exam --</option>
              {examTypes.map(et => (
                <option key={et.id} value={et.id}>{et.name}</option>
              ))}
            </select>
          </div>

          {/* Grade Type - Static for now */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Grade Type</label>
            <select
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              defaultValue=""
            >
              <option value="">Select</option>
              <option value="100">100 Percentage</option>
            </select>
          </div>

          {/* Class */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Class Name</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">- Select Class -</option>
              {uniqueClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Section Name</label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              disabled={!selectedClass}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-gray-100"
            >
              <option value="">- Select Section -</option>
              {filteredSections.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Display Marks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Marks</label>
            <select
              value={displayMarks}
              onChange={(e) => setDisplayMarks(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </div>

          {/* Display Attendance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Attendance</label>
            <select
              value={displayAttendance}
              onChange={(e) => setDisplayAttendance(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="Dont Display Attendance">Don't Display Attendance</option>
              <option value="Display Attendance">Display Attendance</option>
            </select>
          </div>

          {/* Select Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Format</label>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="Exam Report 1">Exam Report 1</option>
              <option value="Exam Report 2">Exam Report 2</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            Search
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset Search
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Sr.No</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Examination Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Class Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Section Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Grade Type</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase">Send SMS</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase">Created at</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                <th className="px-4 py-3.5 text-center text-xs font-semibold text-gray-500 uppercase">Publish Marks</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    </div>
                  </td>
                </tr>
              ) : examMappings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                    No results found. Use the filters above to search for exam results.
                  </td>
                </tr>
              ) : (
                examMappings.map((mapping, index) => (
                  <tr key={mapping.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium">
                        {mapping.exam_type_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{mapping.class_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{mapping.section_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{mapping.grade_type}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        mapping.status === 'Complete' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {mapping.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button className="text-teal-600 hover:text-teal-800 text-sm font-medium">
                        Send SMS
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(mapping.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handlePrintReport(mapping)}
                        disabled={printLoading && selectedMapping?.id === mapping.id}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium disabled:opacity-50"
                      >
                        {printLoading && selectedMapping?.id === mapping.id ? 'Loading...' : 'Print'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select className="text-sm border border-gray-300 rounded px-2 py-1">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Preview Modal */}
      {showPrintPreview && reportData && (() => {
        const filteredCards = selectedStudentId === 'all'
          ? reportData.report_cards
          : reportData.report_cards.filter(c => c.student_id === selectedStudentId);
        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold">Report Cards Preview</h2>
                <p className="text-white/80 text-sm">
                  {reportData.exam_name} • {reportData.class_name} - {reportData.section_name} • {filteredCards.length} of {reportData.report_cards.length} Students
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Student Selection Dropdown */}
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 max-w-[220px]"
                >
                  <option value="all" className="text-gray-900">All Students ({reportData.report_cards.length})</option>
                  {reportData.report_cards.map(card => (
                    <option key={card.student_id} value={card.student_id} className="text-gray-900">
                      {card.student_name} ({card.admission_number})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handlePrint()}
                  className="px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium hover:bg-indigo-50 flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {selectedStudentId === 'all' ? 'Print All' : 'Print'}
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="text-white/80 hover:text-white p-2"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
              <div ref={printRef} className="report-card-light space-y-8">
                {filteredCards.map((card, index) => (
                  <ReportCard
                    key={card.student_id}
                    reportCard={card}
                    examName={reportData.exam_name}
                    academicYear={reportData.academic_year}
                    gradeScale={reportData.grade_scale}
                    displayMarks={displayMarks === 'Yes'}
                    isLast={index === filteredCards.length - 1}
                    schoolSettings={schoolSettings}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default Results;
