import { ReportCard as ReportCardType, GradeScale } from '../../services/resultsService';
import schoolSettingsService, { SchoolSettings } from '../../services/schoolSettingsService';

interface AttendanceMonth {
  month: number;
  year: number;
  month_name: string;
  total_working_days: number;
  present_days: number;
}

interface ExtendedReportCard extends ReportCardType {
  attendance?: AttendanceMonth[];
  attendance_total_working_days?: number;
  attendance_total_present_days?: number;
}

interface ReportCardProps {
  reportCard: ExtendedReportCard;
  examName: string;
  academicYear: string | null;
  gradeScale: GradeScale[];
  displayMarks: boolean;
  isLast: boolean;
  schoolSettings?: SchoolSettings | null;
}

const ReportCard = ({ reportCard, examName, academicYear, gradeScale, displayMarks, isLast, schoolSettings }: ReportCardProps) => {
  const logoUrl = schoolSettings ? schoolSettingsService.getLogoUrl(schoolSettings) : null;
  const schoolName = schoolSettings?.school_name || 'KRISHNAVENI TALENT HIGH SCHOOL';
  const schoolAddress = schoolSettings?.address || 'Dwaraka Nagar, Bandlaguda Jagir, Gandipet Mandal, R.R.Dist., Hyderabad.';
  const affiliation = schoolSettings?.affiliation || 'Recognised by the Govt. of Telangana';
  const getPercentageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-emerald-600';
    if (percentage >= 75) return 'text-blue-600';
    if (percentage >= 60) return 'text-amber-600';
    if (percentage >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-emerald-100 text-emerald-700';
    if (grade.startsWith('B')) return 'bg-blue-100 text-blue-700';
    if (grade.startsWith('C')) return 'bg-amber-100 text-amber-700';
    if (grade.startsWith('D')) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  const getBarWidth = (value: number, max: number) => {
    return Math.min((value / max) * 100, 100);
  };

  // Calculate remarks based on percentage
  const getRemarks = (percentage: number) => {
    if (percentage >= 90) return "Outstanding performance! Keep up the excellent work.";
    if (percentage >= 75) return "Great job! Continue working hard to achieve even more.";
    if (percentage >= 60) return "Good effort! Focus on your weak areas to improve further.";
    if (percentage >= 40) return "Keep pushing! Your hard work will lead to better results with time.";
    return "Need improvement. Please focus more on studies and seek help where needed.";
  };

  return (
    <div className={`report-card-print bg-white rounded-xl shadow-lg overflow-hidden ${!isLast ? 'break-after-page' : ''}`}>
      {/* School Header */}
      <div style={{ background: '#fefce8', borderBottom: '3px solid #1e3a5f', padding: '12px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Logo inline with name */}
            {logoUrl ? (
              <img src={logoUrl} alt="School Logo" style={{ height: '64px', width: '64px', objectFit: 'contain', flexShrink: 0 }} />
            ) : (
              <div style={{ height: '64px', width: '64px', borderRadius: '50%', border: '3px solid #1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4ff', flexShrink: 0 }}>
                <svg width="40" height="40" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 3L4 11V25C4 34 22 42 22 42C22 42 40 34 40 25V11L22 3Z" fill="#1e3a5f" />
                  <text x="22" y="27" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="serif">KTB</text>
                </svg>
              </div>
            )}
            <span style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', letterSpacing: '2px', fontFamily: 'Georgia, serif', lineHeight: '1' }}>{schoolName.replace(/HIGH SCHOOL/i, '').trim()}</span>
            <div style={{ background: '#b91c1c', color: 'white', padding: '3px 10px', borderRadius: '3px', fontSize: '13px', fontWeight: '900', lineHeight: '1.3', textAlign: 'center', letterSpacing: '1px' }}>
              <div>HIGH</div>
              <div>SCHOOL</div>
            </div>
          </div>
          <div style={{ fontSize: '11.5px', color: '#374151', marginTop: '3px', fontStyle: 'italic' }}>({affiliation})</div>
          <div style={{ fontSize: '12px', color: '#be185d', fontWeight: '700', marginTop: '2px' }}>{schoolAddress}</div>
        </div>
        {/* Report label bar */}
        <div style={{ marginTop: '8px', background: '#1e3a5f', borderRadius: '3px', padding: '4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: '700', letterSpacing: '1px' }}>PROGRESS REPORT</span>
          <span style={{ color: '#93c5fd', fontSize: '12px' }}>{academicYear || ''}</span>
        </div>
      </div>

      <div className="p-6">
        {/* Exam & Student Details */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Exam Details */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-indigo-800">Exam Details</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600 text-sm">Exam:</span>
                <span className="font-medium text-gray-800">{examName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 text-sm">Class:</span>
                <span className="font-medium text-gray-800">{reportCard.class_name} - {reportCard.section_name}</span>
              </div>
            </div>
          </div>

          {/* Student Details */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-purple-800">Student Details</h3>
            </div>
            <div className="flex items-start gap-4">
              {(reportCard.photo_data || reportCard.photo_thumbnail) ? (
                <img src={reportCard.photo_data || reportCard.photo_thumbnail!} alt="Student" className="h-14 w-14 rounded-lg object-cover border-2 border-purple-200" />
              ) : (
                <div className="h-14 w-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-xl font-bold">
                  {reportCard.student_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">Name:</span>
                  <span className="font-semibold text-gray-800">{reportCard.student_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">Father's Name:</span>
                  <span className="font-medium text-gray-800">{reportCard.father_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 text-sm">Admission No:</span>
                  <span className="font-medium text-gray-800">{reportCard.admission_number}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Subject-wise Performance */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800">Subject-wise Performance</h3>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">S.No</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Subject</th>
                  {displayMarks && <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Marks</th>}
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Grade</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Points</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Teacher Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportCard.subject_marks.map((mark, idx) => {
                  const isFail = !mark.is_absent && mark.marks_obtained !== null && mark.min_marks != null && mark.marks_obtained < mark.min_marks;
                  return (
                  <tr key={mark.subject_id} className={isFail ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{mark.subject_name}</td>
                    {displayMarks && (
                      <td className={`px-4 py-3 text-center text-sm font-semibold ${isFail ? 'text-red-600' : 'text-gray-800'}`}>
                        {mark.is_absent ? 'AB' : mark.marks_obtained !== null ? `${mark.marks_obtained}/${mark.max_marks}` : '-'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${isFail ? 'bg-red-100 text-red-700' : getGradeColor(mark.grade)}`}>
                        {mark.grade}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-center text-sm font-semibold ${isFail ? 'text-red-600' : 'text-gray-800'}`}>{mark.grade_point}</td>
                    <td className="px-4 py-3 text-sm text-indigo-600 italic">{mark.teacher_remarks || '-'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 text-center border border-slate-200">
            <div className="text-2xl font-bold text-slate-700">{reportCard.total_marks}/{reportCard.total_max_marks}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Total Marks</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center border border-blue-200">
            <div className={`text-2xl font-bold ${getPercentageColor(reportCard.percentage)}`}>{reportCard.percentage}%</div>
            <div className="text-xs text-blue-500 mt-1 font-medium">Percentage</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 text-center border border-purple-200">
            <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${getGradeColor(reportCard.grade)}`}>{reportCard.grade}</span>
            <div className="text-xs text-purple-500 mt-2 font-medium">Grade</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 text-center border border-emerald-200">
            <div className="text-2xl font-bold text-emerald-600">{reportCard.gpa} / {reportCard.total_gpa}</div>
            <div className="text-xs text-emerald-500 mt-1 font-medium">GPA</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 text-center border border-amber-200">
            <div className="text-2xl font-bold text-amber-600">{reportCard.class_rank}<sup className="text-base">{getOrdinalSuffix(reportCard.class_rank)}</sup></div>
            <div className="text-xs text-amber-500 mt-1 font-medium">Class Rank</div>
          </div>
        </div>

        {/* Attendance Section */}
        {reportCard.attendance && reportCard.attendance.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800">Attendance</h3>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                    <th className="px-3 py-2 text-left text-xs font-semibold"></th>
                    {reportCard.attendance.map((att) => (
                      <th key={`${att.month}_${att.year}`} className="px-3 py-2 text-center text-xs font-semibold">
                        {att.month_name.substring(0, 3)}
                      </th>
                    ))}
                    {reportCard.attendance.length > 1 && (
                      <th className="px-3 py-2 text-center text-xs font-semibold">Total</th>
                    )}
                    <th className="px-3 py-2 text-center text-xs font-semibold">Att %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-white">
                    <td className="px-3 py-2 text-sm font-medium text-gray-800">Working days</td>
                    {reportCard.attendance.map((att) => (
                      <td key={`wd_${att.month}_${att.year}`} className="px-3 py-2 text-center text-sm font-semibold text-blue-700">
                        {att.total_working_days}
                      </td>
                    ))}
                    {reportCard.attendance.length > 1 && (
                      <td className="px-3 py-2 text-center text-sm font-bold text-blue-800">
                        {reportCard.attendance_total_working_days}
                      </td>
                    )}
                    <td rowSpan={2} className="px-3 py-2 text-center text-sm font-bold text-orange-700 align-middle">
                      {(reportCard.attendance_total_working_days ?? 0) > 0 ? (((reportCard.attendance_total_present_days ?? 0) / (reportCard.attendance_total_working_days ?? 1)) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                  <tr className="bg-orange-50/30">
                    <td className="px-3 py-2 text-sm font-medium text-gray-800">Present days</td>
                    {reportCard.attendance.map((att) => (
                      <td key={`pd_${att.month}_${att.year}`} className="px-3 py-2 text-center text-sm font-semibold text-green-700">
                        {att.present_days}
                      </td>
                    ))}
                    {reportCard.attendance.length > 1 && (
                      <td className="px-3 py-2 text-center text-sm font-bold text-green-800">
                        {reportCard.attendance_total_present_days}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Remarks */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-6 border border-indigo-100">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-indigo-800 mb-1">Remarks:</h4>
              <p className="text-gray-700">{getRemarks(reportCard.percentage)}</p>
            </div>
          </div>
        </div>

        {/* Performance Analysis */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800">Performance Comparison - All Subjects</h3>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="space-y-4">
              {reportCard.subject_marks.map((mark) => (
                <div key={mark.subject_id} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-medium text-gray-700 truncate">{mark.subject_name}</div>
                  <div className="flex-1 flex items-center gap-2">
                    {/* Class Topper */}
                    <div className="flex-1">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${getBarWidth(mark.class_topper, mark.max_marks)}%` }}
                        >
                          <span className="text-xs text-white font-bold">{Math.round(mark.class_topper / mark.max_marks * 100)}%</span>
                        </div>
                      </div>
                    </div>
                    {/* Class Average */}
                    <div className="flex-1">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-amber-500 rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${getBarWidth(mark.class_average, mark.max_marks)}%` }}
                        >
                          <span className="text-xs text-white font-bold">{Math.round(mark.class_average / mark.max_marks * 100)}%</span>
                        </div>
                      </div>
                    </div>
                    {/* Student Marks */}
                    <div className="flex-1">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div 
                          className={`h-full rounded-full flex items-center justify-end pr-2 ${
                            mark.is_absent || mark.marks_obtained === null ? 'bg-gray-400' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${mark.marks_obtained !== null && !mark.is_absent ? getBarWidth(mark.marks_obtained, mark.max_marks) : 0}%` }}
                        >
                          {mark.marks_obtained !== null && !mark.is_absent && (
                            <span className="text-xs text-white font-bold">{Math.round(mark.marks_obtained / mark.max_marks * 100)}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                <span className="text-xs text-gray-600">Class Topper</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-500 rounded"></div>
                <span className="text-xs text-gray-600">Class Average</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-indigo-500 rounded"></div>
                <span className="text-xs text-gray-600">Student Marks</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Scale */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800">Grade Scale</h3>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                  <th className="px-4 py-2 text-xs font-semibold uppercase">Grade</th>
                  {gradeScale.map((g) => (
                    <th key={g.grade} className="px-3 py-2 text-xs font-semibold">{g.grade}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 text-xs font-medium text-gray-600">Range</td>
                  {gradeScale.map((g) => (
                    <td key={g.grade} className="px-3 py-2 text-xs text-center text-gray-700">{g.min_pct} - {g.max_pct}</td>
                  ))}
                </tr>
                <tr className="bg-white">
                  <td className="px-4 py-2 text-xs font-medium text-gray-600">Points</td>
                  {gradeScale.map((g) => (
                    <td key={g.grade} className="px-3 py-2 text-xs text-center font-semibold text-indigo-600">{g.points}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
        <span>Generated by Krishnaveni Talent School Management System</span>
        <span>{new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
    </div>
  );
};

// Helper function for ordinal suffix
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default ReportCard;
