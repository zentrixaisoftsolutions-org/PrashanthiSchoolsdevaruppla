import React, { useState, useEffect, useRef } from 'react';
import studentService, { Student, StudentListResponse, PerformanceReport as PerformanceReportType } from '../../services/studentService';
import { useReactToPrint } from 'react-to-print';
import logoImg from '../../assets/logo.jpg';

const PerformanceReport: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [reportData, setReportData] = useState<PerformanceReportType | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStudents();
  }, [page, searchTerm]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response: StudentListResponse = await studentService.getStudents({
        page,
        page_size: 15,
        search: searchTerm || undefined,
        is_active: true,
      });
      setStudents(response.students);
      setTotalPages(response.total_pages);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (student: Student) => {
    try {
      setReportLoading(true);
      setSelectedStudent(student);
      const data = await studentService.getPerformanceReport(
        student.id,
        fromDate || undefined,
        toDate || undefined
      );
      setReportData(data);
      setShowReport(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: reportRef,
    documentTitle: `Performance_Report_${selectedStudent?.first_name}_${selectedStudent?.surname || ''}`,
  });

  const closeReport = () => {
    setShowReport(false);
    setReportData(null);
    setSelectedStudent(null);
  };

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      'A1': 'bg-green-600 text-white',
      'A2': 'bg-green-500 text-white',
      'B1': 'bg-blue-600 text-white',
      'B2': 'bg-blue-500 text-white',
      'C1': 'bg-yellow-500 text-white',
      'C2': 'bg-yellow-600 text-white',
      'D': 'bg-orange-500 text-white',
      'E': 'bg-red-600 text-white',
    };
    return colors[grade] || 'bg-gray-500 text-white';
  };

  if (showReport && reportData) {
    return (
      <div className="p-4">
        {/* Action Buttons */}
        <div className="mb-4 flex gap-3 no-print">
          <button
            onClick={() => handlePrint()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            🖨️ Print Report
          </button>
          <button
            onClick={closeReport}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            ← Back to List
          </button>
        </div>

        {/* Report Content */}
        <div ref={reportRef} className="bg-white p-8 rounded-lg shadow-lg max-w-4xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-indigo-900 pb-4 mb-6">
            <div className="flex items-center justify-center gap-4 mb-2">
              <img src={logoImg} alt="School Logo" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-indigo-900">KRISHNAVENI TALENT HIGH SCHOOL</h1>
                <p className="text-sm text-gray-600">MENTORED FOR LIFE</p>
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mt-2">STUDENTS PERFORMANCE REPORT</h2>
          </div>

          {/* Student Details */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">Student Information</h3>
            <div className="flex gap-6">
              {/* Photo */}
              <div className="flex-shrink-0">
                {(reportData.student.photo_data || reportData.student.photo_thumbnail) ? (
                  <img
                    src={reportData.student.photo_data || reportData.student.photo_thumbnail}
                    alt={reportData.student.full_name}
                    className="h-24 w-20 object-cover rounded-lg border-2 border-indigo-200 shadow-sm"
                  />
                ) : (
                  <div className="h-24 w-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg border-2 border-indigo-200 flex items-center justify-center">
                    <span className="text-2xl font-bold text-indigo-400">
                      {reportData.student.full_name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              {/* Details */}
              <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
                <div className="flex">
                  <span className="font-medium w-40">Name:</span>
                  <span>{reportData.student.full_name}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Admission No:</span>
                  <span>{reportData.student.admission_number}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Class:</span>
                  <span>{reportData.student.class_name} - {reportData.student.section_name}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Date of Birth:</span>
                  <span>{reportData.student.date_of_birth || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Father/Guardian:</span>
                  <span>{reportData.student.father_guardian_name || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Mother:</span>
                  <span>{reportData.student.mother_name || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Contact:</span>
                  <span>{reportData.student.mobile_number || 'N/A'}</span>
                </div>
                <div className="flex">
                  <span className="font-medium w-40">Admission Date:</span>
                  <span>{reportData.student.admission_date || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Information */}
          {reportData.attendance && reportData.attendance.total_working_days > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">Attendance Information</h3>
            <p className="text-sm text-gray-600 mb-2">
              Period: {reportData.attendance.from_date} to {reportData.attendance.to_date}
            </p>
            <div className="grid grid-cols-5 gap-4 text-center">
              <div className="bg-gray-100 p-3 rounded">
                <div className="text-2xl font-bold text-gray-700">{reportData.attendance.total_working_days}</div>
                <div className="text-sm text-gray-500">Total Days</div>
              </div>
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-700">{reportData.attendance.days_present}</div>
                <div className="text-sm text-green-600">Present</div>
              </div>
              <div className="bg-red-100 p-3 rounded">
                <div className="text-2xl font-bold text-red-700">{reportData.attendance.days_absent}</div>
                <div className="text-sm text-red-600">Absent</div>
              </div>
              <div className="bg-yellow-100 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-700">{reportData.attendance.days_late || 0}</div>
                <div className="text-sm text-yellow-600">Late</div>
              </div>
              <div className="bg-blue-100 p-3 rounded">
                <div className="text-2xl font-bold text-blue-700">{reportData.attendance.attendance_percentage}%</div>
                <div className="text-sm text-blue-600">Attendance</div>
              </div>
            </div>
          </div>
          )}

          {/* Fee Information */}
          {reportData.fees && reportData.fees.total_fee_amount > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">Fee Information</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-100 p-3 rounded">
                <div className="text-2xl font-bold text-green-700">₹{reportData.fees.total_paid.toLocaleString()}</div>
                <div className="text-sm text-green-600">Total Paid</div>
              </div>
              <div className="bg-red-100 p-3 rounded">
                <div className="text-2xl font-bold text-red-700">₹{reportData.fees.total_pending.toLocaleString()}</div>
                <div className="text-sm text-red-600">Pending Due</div>
              </div>
              <div className="bg-blue-100 p-3 rounded">
                <div className="text-2xl font-bold text-blue-700">₹{reportData.fees.total_fee_amount.toLocaleString()}</div>
                <div className="text-sm text-blue-600">Total Fee</div>
              </div>
            </div>
          </div>
          )}

          {/* Examination Results */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-indigo-800 border-b border-indigo-200 pb-1 mb-3">Examination Results</h3>
            {(!reportData.exams || reportData.exams.length === 0) ? (
              <p className="text-gray-500 text-center py-4">No examination records found</p>
            ) : (
              reportData.exams.map((exam, index) => (
                <div key={index} className="mb-4 border rounded-lg overflow-hidden">
                  <div className="bg-indigo-100 px-4 py-2 flex justify-between items-center">
                    <span className="font-semibold text-indigo-800">{exam.exam_name}</span>
                    <span className="text-sm text-gray-600">{exam.exam_date}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Subject</th>
                        <th className="text-center px-4 py-2 font-medium">Marks</th>
                        <th className="text-center px-4 py-2 font-medium">Out of</th>
                        <th className="text-center px-4 py-2 font-medium">GPA</th>
                        <th className="text-center px-4 py-2 font-medium">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.subjects.map((subject, sIndex) => (
                        <tr key={sIndex} className="border-t">
                          <td className="px-4 py-2">{subject.subject_name}</td>
                          <td className="text-center px-4 py-2">{subject.marks_obtained}</td>
                          <td className="text-center px-4 py-2">{subject.total_marks}</td>
                          <td className="text-center px-4 py-2">{subject.grade_point}</td>
                          <td className="text-center px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${getGradeColor(subject.grade || 'N/A')}`}>
                              {subject.grade || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-indigo-50 font-semibold">
                      <tr className="border-t-2">
                        <td className="px-4 py-2">Total / Overall</td>
                        <td className="text-center px-4 py-2">{exam.total_marks_obtained}</td>
                        <td className="text-center px-4 py-2">{exam.total_max_marks}</td>
                        <td className="text-center px-4 py-2">{exam.average_gpa}</td>
                        <td className="text-center px-4 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${getGradeColor(exam.overall_grade)}`}>
                            {exam.overall_grade}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))
            )}
          </div>

          {/* Grade Scale */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Grade Scale:</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(reportData.grade_scale).map(([grade, range]) => (
                <span key={grade} className={`px-2 py-1 rounded ${getGradeColor(grade)}`}>
                  {grade}: {range}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-sm text-gray-500">
            <p>Generated on: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
            <p className="mt-2 font-medium text-indigo-800">KRISHNAVENI TALENT HIGH SCHOOL - MENTORED FOR LIFE</p>
          </div>
        </div>

        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Students Performance Report</h1>
        <p className="text-gray-600 mt-1">Generate comprehensive performance reports for students</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
          <button className="float-right" onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Student</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Name, Admission No..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFromDate(''); setToDate(''); setSearchTerm(''); }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admission No</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-700 font-medium">
                            {student.first_name.charAt(0)}{student.surname?.charAt(0) || ''}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {student.first_name} {student.surname || ''}
                          </div>
                          <div className="text-sm text-gray-500">{student.gender || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.admission_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {student.class_name} - {student.section_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.mobile_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => generateReport(student)}
                        disabled={reportLoading && selectedStudent?.id === student.id}
                        className="inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reportLoading && selectedStudent?.id === student.id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Generating...
                          </>
                        ) : (
                          <>📄 Generate Report</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Page <span className="font-medium">{page}</span> of{' '}
                      <span className="font-medium">{totalPages}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="relative inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="relative inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PerformanceReport;
