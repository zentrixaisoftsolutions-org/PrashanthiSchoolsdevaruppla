import React, { useEffect, useState } from 'react';
import reportService, {
  AssessmentReportConfig,
  AssessmentReportData,
  AssessmentGpaBand,
  AssessmentStudent,
} from '../../services/reportService';

const AssessmentReport: React.FC = () => {
  const [config, setConfig] = useState<AssessmentReportConfig | null>(null);
  const [classNameId, setClassNameId] = useState<number | ''>('');
  const [sectionId, setSectionId] = useState<number | ''>('');
  const [examTypeId, setExamTypeId] = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [reportData, setReportData] = useState<AssessmentReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedBands, setExpandedBands] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const cfg = await reportService.getAssessmentReportConfig();
        setConfig(cfg);
      } catch {
        setError('Failed to load configuration');
      } finally {
        setConfigLoading(false);
      }
    })();
  }, []);

  const handleGenerate = async () => {
    if (!classNameId || !sectionId || !examTypeId) {
      setError('Please select Class, Section, and Exam Type');
      return;
    }
    setLoading(true);
    setError('');
    setReportData(null);
    try {
      const data = await reportService.getAssessmentReport(
        classNameId as number,
        sectionId as number,
        examTypeId as number,
        subjectId ? (subjectId as number) : undefined
      );
      setReportData(data);
      // Expand all bands by default
      setExpandedBands(new Set(data.bands.map((b: AssessmentGpaBand) => b.gpa_floor)));
    } catch {
      setError('Failed to generate assessment report');
    } finally {
      setLoading(false);
    }
  };

  const toggleBand = (gpaFloor: number) => {
    setExpandedBands(prev => {
      const next = new Set(prev);
      if (next.has(gpaFloor)) next.delete(gpaFloor);
      else next.add(gpaFloor);
      return next;
    });
  };

  const handlePrint = () => {
    const printContent = document.getElementById('assessment-report-content');
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Exam-wise Analysis</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #333; }
        h2 { text-align: center; margin-bottom: 4px; }
        h3 { margin: 12px 0 6px; color: #1a56db; border-bottom: 2px solid #1a56db; padding-bottom: 4px; }
        .summary { display: flex; gap: 24px; margin-bottom: 12px; }
        .summary span { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
        th { background: #f0f4ff; font-weight: 600; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .band-header { background: #e8edff; font-weight: bold; padding: 6px 10px; margin-top: 10px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .fail-row { background: #fff0f0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .fail-tag { color: #dc2626; font-weight: bold; }
        @media print { body { margin: 10px; } }
      </style></head><body>`);
    win.document.write(printContent.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  const bandColor = (floor: number): string => {
    if (floor === 10) return 'bg-green-50 border-green-300';
    if (floor >= 8) return 'bg-blue-50 border-blue-300';
    if (floor >= 6) return 'bg-yellow-50 border-yellow-300';
    if (floor >= 4) return 'bg-orange-50 border-orange-300';
    return 'bg-red-50 border-red-300';
  };

  const bandHeaderColor = (floor: number): string => {
    if (floor === 10) return 'bg-green-100 text-green-800';
    if (floor >= 8) return 'bg-blue-100 text-blue-800';
    if (floor >= 6) return 'bg-yellow-100 text-yellow-800';
    if (floor >= 4) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  if (configLoading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Exam-wise Analysis</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={classNameId}
              onChange={e => { setClassNameId(e.target.value ? Number(e.target.value) : ''); setReportData(null); }}
            >
              <option value="">Select Class</option>
              {config?.class_names.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section *</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={sectionId}
              onChange={e => { setSectionId(e.target.value ? Number(e.target.value) : ''); setReportData(null); }}
            >
              <option value="">Select Section</option>
              {config?.sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exam Type *</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={examTypeId}
              onChange={e => { setExamTypeId(e.target.value ? Number(e.target.value) : ''); setReportData(null); }}
            >
              <option value="">Select Exam</option>
              {config?.exam_types.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={subjectId}
              onChange={e => { setSubjectId(e.target.value ? Number(e.target.value) : ''); setReportData(null); }}
            >
              <option value="">All Subjects (Overall)</option>
              {config?.subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Generate'}
            </button>
            {reportData && (
              <button
                onClick={handlePrint}
                className="bg-gray-600 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-700"
              >
                Print
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>

      {/* Report Content */}
      {reportData && (
        <div id="assessment-report-content">
          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <span><strong>Class:</strong> {reportData.class_name} - {reportData.section_name}</span>
              <span><strong>Total Students:</strong> {reportData.total_students}</span>
              <span><strong>Students with Marks:</strong> {reportData.students_with_marks}</span>
              <span><strong>Failed:</strong> <span className="text-red-600 font-semibold">{reportData.failed_students.length}</span></span>
            </div>
          </div>

          {/* GPA Bands */}
          {reportData.bands.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No data available for the selected filters.</div>
          ) : (
            reportData.bands.map((band: AssessmentGpaBand) => (
              <div key={band.gpa_floor} className={`rounded-lg shadow mb-3 border ${bandColor(band.gpa_floor)}`}>
                <button
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-t-lg font-semibold text-sm ${bandHeaderColor(band.gpa_floor)}`}
                  onClick={() => toggleBand(band.gpa_floor)}
                >
                  <span>{band.label} — {band.count} student{band.count !== 1 ? 's' : ''}</span>
                  <span className="text-lg">{expandedBands.has(band.gpa_floor) ? '▾' : '▸'}</span>
                </button>
                {expandedBands.has(band.gpa_floor) && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left border-b">#</th>
                          <th className="px-3 py-2 text-left border-b">Adm No</th>
                          <th className="px-3 py-2 text-left border-b">Student Name</th>
                          <th className="px-3 py-2 text-center border-b">Marks</th>
                          <th className="px-3 py-2 text-center border-b">Percentage</th>
                          <th className="px-3 py-2 text-center border-b">Grade</th>
                          <th className="px-3 py-2 text-center border-b">CGPA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {band.students.map((s: AssessmentStudent, idx: number) => (
                          <tr key={s.student_id} className="border-b hover:bg-white/50">
                            <td className="px-3 py-2">{idx + 1}</td>
                            <td className="px-3 py-2">{s.admission_number}</td>
                            <td className="px-3 py-2 font-medium">{s.student_name}</td>
                            <td className="px-3 py-2 text-center">{s.total_obtained} / {s.total_max}</td>
                            <td className="px-3 py-2 text-center">{s.percentage}%</td>
                            <td className="px-3 py-2 text-center font-semibold">{s.grade}</td>
                            <td className="px-3 py-2 text-center font-bold">{s.cgpa}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Failed Students */}
          {reportData.failed_students.length > 0 && (
            <div className="rounded-lg shadow mb-3 border border-red-300 bg-red-50 mt-4">
              <div className="px-4 py-3 bg-red-100 text-red-800 font-semibold text-sm rounded-t-lg">
                Failed Students — {reportData.failed_students.length} student{reportData.failed_students.length !== 1 ? 's' : ''}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50">
                      <th className="px-3 py-2 text-left border-b">#</th>
                      <th className="px-3 py-2 text-left border-b">Adm No</th>
                      <th className="px-3 py-2 text-left border-b">Student Name</th>
                      <th className="px-3 py-2 text-center border-b">Marks</th>
                      <th className="px-3 py-2 text-center border-b">Percentage</th>
                      <th className="px-3 py-2 text-left border-b">Failed Subjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.failed_students.map((s: AssessmentStudent, idx: number) => (
                      <tr key={s.student_id} className="border-b hover:bg-red-50/50">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{s.admission_number}</td>
                        <td className="px-3 py-2 font-medium">{s.student_name}</td>
                        <td className="px-3 py-2 text-center">{s.total_obtained} / {s.total_max}</td>
                        <td className="px-3 py-2 text-center">{s.percentage}%</td>
                        <td className="px-3 py-2 text-red-700 font-semibold">{s.failed_subjects.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AssessmentReport;
