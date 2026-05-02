import React, { useEffect, useState, useRef } from 'react';
import reportService, {
  AnnualReportResponse,
  AnnualReportStudent,
  AnnualReportRequest,
  LevelConfig,
  ExamTypeSummary,
  ClassSectionOption,
  StudentOption,
  AnnualAttendanceMonth,
  AnnualSubjectWiseMark,
} from '../../services/reportService';
import scholasticService, {
  ScholasticGridResponse,
  ScholasticCategoryInfo,
  ScholasticGridStudent,
  StudentScholasticGradeEntry,
  ScholasticStudentReport,
  ScholasticReportStudent,
} from '../../services/scholasticService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import schoolSettingsService, { SchoolSettings } from '../../services/schoolSettingsService';
import logoImg from '../../assets/logo.jpg';

const DEFAULT_LEVELS: LevelConfig[] = [
  { level_name: 'Formative Tests (F I+F II+F III+F IV)', exam_type_ids: [], weightage_pct: 25 },
  { level_name: 'Summative (25%) (ST I + ST II)', exam_type_ids: [], weightage_pct: 25 },
  { level_name: 'Summative Test-II (50%)', exam_type_ids: [], weightage_pct: 50 },
];

const MAX_EXAMS_PER_LEVEL = [4, 2, 2];

const AnnualReport: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [examTypes, setExamTypes] = useState<ExamTypeSummary[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<number | null>(null);
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const [levels, setLevels] = useState<LevelConfig[]>(DEFAULT_LEVELS);
  const [reportData, setReportData] = useState<AnnualReportResponse | null>(null);
  const [remarks, setRemarks] = useState<{ [studentId: number]: string }>({});

  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);

  // Scholastic state
  const [showScholastic, setShowScholastic] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [scholasticGrid, setScholasticGrid] = useState<ScholasticGridResponse | null>(null);
  const [scholasticInput, setScholasticInput] = useState<{ [key: string]: string }>({});
  const [scholasticLoading, setScholasticLoading] = useState(false);
  const [savingScholastic, setSavingScholastic] = useState(false);
  const [scholasticSuccess, setScholasticSuccess] = useState('');
  const [scholasticReport, setScholasticReport] = useState<ScholasticStudentReport | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);

  const GRADE_OPTIONS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'E', ''];
  const TERM_OPTIONS = [{ value: 1, label: 'Term I' }, { value: 2, label: 'Term II' }, { value: 3, label: 'Term III' }];

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [years, settings] = await Promise.all([
          academicYearService.listAcademicYears(false),
          schoolSettingsService.get().catch(() => null)
        ]);
        setAcademicYears(years);
        if (settings) setSchoolSettings(settings);
        const current = years.find(y => y.is_current) || years[0];
        if (current) setSelectedAcademicYearId(current.id);
      } catch { setError('Failed to load academic years'); }
      finally { setInitialLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedAcademicYearId) return;
    (async () => {
      setConfigLoading(true);
      try {
        const config = await reportService.getAnnualReportConfig(selectedAcademicYearId);
        setExamTypes(config.exam_types);
        setClassSections(config.class_sections);
      } catch { setError('Failed to load config'); }
      finally { setConfigLoading(false); }
    })();
  }, [selectedAcademicYearId]);

  useEffect(() => {
    if (!selectedClassSectionId) { setStudents([]); return; }
    (async () => {
      try {
        const sts = await reportService.getStudentsForReport(selectedClassSectionId);
        setStudents(sts);
      } catch { setStudents([]); }
    })();
  }, [selectedClassSectionId]);

  const handleExamToggle = (levelIdx: number, examId: number) => {
    setLevels(prev => {
      const updated = [...prev];
      const ids = [...updated[levelIdx].exam_type_ids];
      const i = ids.indexOf(examId);
      if (i >= 0) {
        ids.splice(i, 1);
      } else {
        const maxAllowed = MAX_EXAMS_PER_LEVEL[levelIdx] || 99;
        if (ids.length >= maxAllowed) return prev;
        ids.push(examId);
      }
      updated[levelIdx] = { ...updated[levelIdx], exam_type_ids: ids };
      return updated;
    });
  };

  // ==================== Scholastic Area Functions ====================
  // When class section changes, reset scholastic
  useEffect(() => {
    setScholasticGrid(null);
    setScholasticInput({});
    setSelectedTerm(null);
    setShowScholastic(false);
    setScholasticSuccess('');
    setScholasticReport(null);
  }, [selectedClassSectionId]);

  const fetchScholasticGrid = async (termNumber: number) => {
    if (!selectedClassSectionId) return;
    try {
      setScholasticLoading(true);
      setError('');
      const data = await scholasticService.getGrid(
        termNumber,
        selectedClassSectionId,
        selectedAcademicYearId || undefined
      );
      setScholasticGrid(data);
      const initial: { [key: string]: string } = {};
      data.students.forEach(student => {
        data.categories.forEach(cat => {
          cat.parameters.forEach(param => {
            const key = `${student.student_id}_${param.id}`;
            const val = student.grades[param.id.toString()];
            initial[key] = val !== null && val !== undefined ? String(val) : '';
          });
        });
      });
      setScholasticInput(initial);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setScholasticGrid(null);
      } else {
        setError(err.response?.data?.detail || 'Failed to load scholastic data');
      }
    } finally {
      setScholasticLoading(false);
    }
  };

  const handleTermChange = (termNumber: number | null) => {
    setSelectedTerm(termNumber);
    setScholasticGrid(null);
    setScholasticInput({});
    setScholasticSuccess('');
    if (termNumber && selectedClassSectionId) {
      fetchScholasticGrid(termNumber);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await scholasticService.seedDefaults();
      setScholasticSuccess('Default scholastic categories seeded!');
      if (selectedTerm) {
        await fetchScholasticGrid(selectedTerm);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to seed defaults');
    }
  };

  const handleScholasticGradeChange = (studentId: number, paramId: number, value: string) => {
    const key = `${studentId}_${paramId}`;
    setScholasticInput(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveScholastic = async () => {
    if (!scholasticGrid) return;
    try {
      setSavingScholastic(true);
      setError('');
      setScholasticSuccess('');
      const entries: StudentScholasticGradeEntry[] = [];
      scholasticGrid.students.forEach(student => {
        scholasticGrid.categories.forEach(cat => {
          cat.parameters.forEach(param => {
            const key = `${student.student_id}_${param.id}`;
            const val = scholasticInput[key] || '';
            if (val !== '') {
              const isNumeric = cat.group_name === 'PHYSICAL ASPECTS';
              entries.push({
                student_id: student.student_id,
                parameter_id: param.id,
                grade: isNumeric ? null : val,
                numeric_value: isNumeric ? parseFloat(val) || null : null,
              });
            }
          });
        });
      });

      const result = await scholasticService.saveGrades({
        term_number: scholasticGrid.term_number,
        academic_year_id: scholasticGrid.academic_year_id,
        class_section_id: scholasticGrid.class_section_id,
        entries,
      });
      setScholasticSuccess(`Scholastic grades saved! (${result.created} created, ${result.updated} updated)`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save scholastic grades');
    } finally {
      setSavingScholastic(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedAcademicYearId || !selectedClassSectionId) {
      setError('Please select Academic Year and Class Section');
      return;
    }
    const hasExams = levels.some(l => l.exam_type_ids.length > 0);
    if (!hasExams) {
      setError('Please assign at least one exam type to a level');
      return;
    }
    setLoading(true);
    setError('');
    setReportData(null);
    setScholasticReport(null);
    try {
      const req: AnnualReportRequest = {
        academic_year_id: selectedAcademicYearId,
        class_section_id: selectedClassSectionId,
        student_id: selectedStudentId || undefined,
        levels: levels,
      };
      const res = await reportService.generateAnnualReport(req);
      setReportData(res);
      const initRemarks: { [k: number]: string } = {};
      res.students.forEach(s => { initRemarks[s.student_id] = s.remarks || ''; });
      setRemarks(initRemarks);

      // Also fetch scholastic report for all 3 terms
      try {
        const scholReport = await scholasticService.getStudentReport(
          selectedClassSectionId,
          selectedAcademicYearId || undefined,
          selectedStudentId || undefined
        );
        setScholasticReport(scholReport);
      } catch {
        // Scholastic data is optional for report
        setScholasticReport(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Annual Report</title>
      <style>
        @page { size: A4; margin: 8mm; }
        html, body { height: 100%; }
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #222; min-height: 100vh; height: 100vh; }
        .report-card { page-break-after: always; padding: 12px 16px; border: 2px solid #1e3a5f; display: flex; flex-direction: column; min-height: 100vh; height: 100vh; }
        .report-card:last-child { page-break-after: auto; }
        .report-card-body { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
        h2 { text-align: center; background: #6a1b9a; color: white; padding: 6px; font-size: 16px; letter-spacing: 2px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        .attendance-table { margin: 4px 0; }
        .attendance-table th { background: #fff9c4; padding: 2px 3px; border: 1px solid #999; font-size: 8px; }
        .attendance-table td { padding: 2px 3px; border: 1px solid #999; text-align: center; font-size: 9px; }
        .perf-section { margin: 4px 0; border: 1px solid #ccc; padding: 6px; }
        .remarks-box { border: 1px solid #999; padding: 6px; margin: 4px 0; }
        .no-print { display: none !important; }
        .print-remarks { display: block !important; }
        .summary-cards { display: flex; gap: 6px; justify-content: center; margin: 6px 0; }
        .summary-card { flex: 1; text-align: center; border: 1px solid #ddd; border-radius: 6px; padding: 5px 4px; }
        .summary-card .val { font-size: 13px; font-weight: 700; }
        .summary-card .lbl { font-size: 8px; color: #666; margin-top: 2px; }
        .promoted-row { display: flex; align-items: center; gap: 30px; justify-content: center; margin: 6px 0; }
        .promoted-row .chk { width: 18px; height: 18px; border: 1px solid #999; display: inline-flex; align-items: center; justify-content: center; margin-right: 4px; }
        .signatures-row { display: flex; justify-content: space-between; margin-top: 16px; font-size: 10px; }
        .signatures-row > div { text-align: center; border-top: 1px solid #333; padding-top: 4px; min-width: 120px; }
        .student-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 20px; font-size: 10px; margin-bottom: 6px; }
        .student-info-grid .right { text-align: right; }
        .flex-grow-spacer { flex: 1; }
        .scholastic-back { page-break-before: always; padding: 16px; border: 2px solid #1e3a5f; }
        .scholastic-back h2 { text-align: center; background: #1565c0; color: white; padding: 6px; font-size: 14px; letter-spacing: 2px; margin-bottom: 8px; }
        table.schol-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        table.schol-table th, table.schol-table td { border: 1px solid #999; padding: 3px 4px; text-align: center; font-size: 10px; }
        table.schol-table th { background: #e3f2fd; font-size: 9px; font-weight: 600; }
        table.schol-table td.cat-header { background: #e8eaf6; font-weight: 700; text-align: left; font-size: 10px; }
        table.schol-table td.param-name { text-align: left; padding-left: 10px; font-size: 9px; }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Configuration Card */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="h-1 bg-purple-600 rounded-t-lg"></div>
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-purple-700 tracking-wide">ANNUAL REPORT</h2>
        </div>

        <div className="p-6 space-y-5">
          {/* Row 1: Academic Year & Class Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
              <select value={selectedAcademicYearId || ''} onChange={e => { setSelectedAcademicYearId(e.target.value ? parseInt(e.target.value) : null); setSelectedClassSectionId(null); setSelectedStudentId(null); setReportData(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                <option value="">-- Select --</option>
                {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Class - Section</label>
              <select value={selectedClassSectionId || ''} onChange={e => { setSelectedClassSectionId(e.target.value ? parseInt(e.target.value) : null); setSelectedStudentId(null); setReportData(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white" disabled={configLoading}>
                <option value="">-- Select --</option>
                {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.display}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Student (optional - leave blank for all)</label>
              <select value={selectedStudentId || ''} onChange={e => { setSelectedStudentId(e.target.value ? parseInt(e.target.value) : null); setReportData(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white">
                <option value="">All Students</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.admission_number})</option>)}
              </select>
            </div>
          </div>

          {/* Levels Configuration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Test Levels & Exam Mapping</label>
            <div className="space-y-3">
              {levels.map((level, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800">{level.level_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {level.exam_type_ids.length} / {MAX_EXAMS_PER_LEVEL[idx] || '∞'} selected
                      </span>
                      <span className="text-xs text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded">
                        Weightage: {level.weightage_pct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {examTypes.map(et => {
                      const selected = level.exam_type_ids.includes(et.id);
                      const usedElsewhere = levels.some((l, li) => li !== idx && l.exam_type_ids.includes(et.id));
                      const maxReached = !selected && level.exam_type_ids.length >= (MAX_EXAMS_PER_LEVEL[idx] || 99);
                      const disabled = (usedElsewhere && !selected) || maxReached;
                      return (
                        <button key={et.id} type="button" onClick={() => !disabled && handleExamToggle(idx, et.id)}
                          disabled={disabled}
                          className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                            selected ? 'bg-purple-600 text-white border-purple-600' :
                            disabled ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed' :
                            'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                          }`}>
                          {et.name}
                        </button>
                      );
                    })}
                    {examTypes.length === 0 && <span className="text-xs text-gray-400 italic">No exam types available</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex gap-2">
            <button onClick={handleGenerate} disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50">
              {loading ? 'Generating...' : 'Generate Annual Report'}
            </button>
            {reportData && (
              <button onClick={handlePrint}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Print Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scholastic Areas Entry Section */}
      {selectedClassSectionId && selectedAcademicYearId && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="h-1 bg-purple-500 rounded-t-lg"></div>
          <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center cursor-pointer"
            onClick={() => setShowScholastic(!showScholastic)}>
            <h2 className="text-lg font-normal text-purple-700 tracking-wide">🎯 SCHOLASTIC AREAS (Term-wise Grade Entry)</h2>
            <span className="text-gray-500 text-lg">{showScholastic ? '▲' : '▼'}</span>
          </div>

          {showScholastic && (
            <div className="p-4">
              {/* Term Selector */}
              <div className="mb-4 flex items-center gap-4">
                <div>
                  <label className="block text-xs font-semibold text-purple-700 mb-1">Select Term</label>
                  <select
                    value={selectedTerm || ''}
                    onChange={e => handleTermChange(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-48 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                  >
                    <option value="">-- Select Term --</option>
                    {TERM_OPTIONS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Success message */}
              {scholasticSuccess && (
                <div className="bg-green-50 border-l-4 border-green-500 p-3 mb-4 rounded">
                  <p className="text-green-700 text-sm">{scholasticSuccess}</p>
                  <button onClick={() => setScholasticSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
                </div>
              )}

              {/* Scholastic Grid */}
              {selectedTerm && (
                <>
                  {scholasticLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
                    </div>
                  ) : !scholasticGrid || scholasticGrid.categories.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-gray-500 mb-4">No scholastic categories found. Seed the default categories to get started.</p>
                      <button
                        onClick={handleSeedDefaults}
                        className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded text-sm font-medium"
                      >
                        Seed Default Categories
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Action Bar */}
                      <div className="flex gap-2 mb-3">
                        <button
                          className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded text-sm font-medium disabled:opacity-50"
                          onClick={handleSaveScholastic}
                          disabled={savingScholastic}
                        >
                          {savingScholastic ? 'Saving...' : 'Save Scholastic Grades'}
                        </button>
                        <span className="text-xs text-gray-500 self-center ml-2">
                          Term: <strong className="text-purple-700">{scholasticGrid.term_label}</strong> | 
                          Class: <strong>{scholasticGrid.class_name} - {scholasticGrid.section_name}</strong> | 
                          Students: <strong>{scholasticGrid.students.length}</strong>
                        </span>
                      </div>

                      {/* Scholastic Grid Table */}
                      <div className="overflow-x-auto border border-gray-200 rounded">
                        <table className="min-w-full">
                          <thead className="sticky top-0 z-10 bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b sticky left-0 bg-gray-50 z-20" rowSpan={2}>Student Name</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 border-b z-20" rowSpan={2}>Adm No</th>
                              {scholasticGrid.categories.map(cat => (
                                <th
                                  key={cat.id}
                                  className={`px-2 py-1.5 text-center text-xs font-bold border-b border-l ${
                                    cat.group_name === 'PHYSICAL ASPECTS' ? 'bg-green-100 text-green-800' :
                                    cat.group_name === 'CO-CURRICULAR ACTIVITIES' ? 'bg-pink-100 text-pink-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}
                                  colSpan={cat.parameters.length}
                                >
                                  {cat.name}
                                </th>
                              ))}
                            </tr>
                            <tr>
                              {scholasticGrid.categories.map(cat =>
                                cat.parameters.map(param => (
                                  <th
                                    key={param.id}
                                    className={`px-2 py-1.5 text-center text-[10px] font-medium border-b border-l ${
                                      cat.group_name === 'PHYSICAL ASPECTS' ? 'bg-green-50 text-green-700' :
                                      cat.group_name === 'CO-CURRICULAR ACTIVITIES' ? 'bg-pink-50 text-pink-700' :
                                      'bg-blue-50 text-blue-700'
                                    }`}
                                    title={param.name}
                                  >
                                    <div className="max-w-[80px] truncate">{param.name}</div>
                                  </th>
                                ))
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {scholasticGrid.students.length === 0 ? (
                              <tr>
                                <td colSpan={2 + scholasticGrid.categories.reduce((sum, cat) => sum + cat.parameters.length, 0)} className="px-4 py-8 text-center text-gray-500">
                                  No students found.
                                </td>
                              </tr>
                            ) : (
                              scholasticGrid.students.map((student, index) => (
                                <tr key={student.student_id} className={index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}>
                                  <td className="px-4 py-2 text-sm text-purple-700 font-medium sticky left-0 bg-white whitespace-nowrap">
                                    {student.student_name}
                                  </td>
                                  <td className="px-3 py-2 text-xs text-gray-500">
                                    {student.admission_number}
                                  </td>
                                  {scholasticGrid.categories.map(cat =>
                                    cat.parameters.map(param => {
                                      const key = `${student.student_id}_${param.id}`;
                                      const val = scholasticInput[key] || '';
                                      const isPhysical = cat.group_name === 'PHYSICAL ASPECTS';
                                      return (
                                        <td key={param.id} className="px-1 py-1 text-center border-l">
                                          {isPhysical ? (
                                            <input
                                              type="number"
                                              value={val}
                                              onChange={e => handleScholasticGradeChange(student.student_id, param.id, e.target.value)}
                                              className="w-16 px-1 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                                              placeholder="0"
                                              step="0.1"
                                            />
                                          ) : (
                                            <select
                                              value={val}
                                              onChange={e => handleScholasticGradeChange(student.student_id, param.id, e.target.value)}
                                              className={`w-16 px-0.5 py-1 border rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                                                val ? 'border-purple-300 bg-purple-50 font-semibold text-purple-800' : 'border-gray-300'
                                              }`}
                                            >
                                              {GRADE_OPTIONS.map(g => (
                                                <option key={g} value={g}>{g || '--'}</option>
                                              ))}
                                            </select>
                                          )}
                                        </td>
                                      );
                                    })
                                  )}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Report Output */}
      {reportData && (
        <div ref={printRef}>
          {reportData.students.map((student) => {
            const scholStudent = scholasticReport?.students.find(s => s.student_id === student.student_id);
            return (
              <React.Fragment key={student.student_id}>
                <StudentReportCard
                  student={student}
                  academicYear={reportData.academic_year || ''}
                  gradeScale={reportData.grade_scale}
                  remarks={remarks[student.student_id] || ''}
                  onRemarksChange={(val) => setRemarks(prev => ({ ...prev, [student.student_id]: val }))}
                  schoolSettings={schoolSettings}
                />
                {/* Scholastic Back Page */}
                {scholasticReport && scholStudent && (
                  <ScholasticBackPage
                    student={scholStudent}
                    categories={scholasticReport.categories}
                    terms={scholasticReport.terms}
                    academicYear={reportData.academic_year || ''}
                    className={scholasticReport.class_name}
                    sectionName={scholasticReport.section_name}
                    schoolSettings={schoolSettings}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {reportData && reportData.students.length === 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
          <p className="text-yellow-700 text-sm">No data found for the selected criteria.</p>
        </div>
      )}
    </div>
  );
};

// ========== Individual Student Report Card ==========

interface StudentReportCardProps {
  student: AnnualReportStudent;
  academicYear: string;
  gradeScale: any[];
  remarks: string;
  onRemarksChange: (val: string) => void;
  schoolSettings?: SchoolSettings | null;
}

const StudentReportCard: React.FC<StudentReportCardProps> = ({ student, academicYear, gradeScale, remarks, onRemarksChange, schoolSettings }) => {
  const logoUrl = schoolSettings ? schoolSettingsService.getLogoUrl(schoolSettings) : null;
  const schoolName = schoolSettings?.school_name || 'SRI SAI PRASANTHI VIDYANIKETAN';
  const schoolAddress = schoolSettings?.address || 'Dwaraka Nagar, Bandlaguda Jagir, Gandipet Mandal, R.R.Dist., Hyderabad.';
  const affiliation = schoolSettings?.affiliation || 'Recognised by the Govt. of Telangana';
  return (
    <div className="bg-white rounded-lg shadow mb-6 border-2 border-blue-900 overflow-hidden report-card">
      {/* School Header */}
      <div style={{ background: '#fefce8', borderBottom: '3px solid #1e3a5f', padding: '8px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <img src={logoUrl || logoImg} alt="School Logo" style={{ height: '48px', width: '48px', objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontSize: '22px', fontWeight: '900', color: '#1e3a5f', letterSpacing: '2px', fontFamily: 'Georgia, serif', lineHeight: '1' }}>{schoolName.replace(/HIGH SCHOOL/i, '').trim()}</span>
            <div style={{ color: '#dc2626', padding: '2px 8px', fontSize: '14px', fontWeight: '900', lineHeight: '1.2', textAlign: 'center', letterSpacing: '1px', fontFamily: 'Georgia, serif' }}>
              <div>HIGH</div>
              <div>SCHOOL</div>
            </div>
          </div>
          <div style={{ fontSize: '10.5px', color: '#374151', marginTop: '2px', fontStyle: 'italic' }}>({affiliation})</div>
          <div style={{ fontSize: '11px', color: '#be185d', fontWeight: '700', marginTop: '1px' }}>{schoolAddress}</div>
        </div>
        {/* Yellow accent strip */}
        <div style={{ marginTop: '8px', background: '#fbbf24', height: '8px', borderRadius: '3px 3px 0 0' }}></div>
        {/* Report label bar */}
        <div style={{ background: '#1e3a5f', borderRadius: '0 0 3px 3px', padding: '5px 16px', textAlign: 'center' }}>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: '700', letterSpacing: '1px' }}>ANNUAL REPORT</span>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: '700', letterSpacing: '1px', marginLeft: '12px' }}>{academicYear}</span>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-grow report-card-body" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Student info */}
        <div className="student-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 20px', fontSize: '10px', marginBottom: '6px' }}>
          <div><span style={{ color: '#6b7280' }}>Name:</span> <span style={{ fontWeight: 600 }}>{student.student_name}</span></div>
          <div style={{ textAlign: 'right' }}><span style={{ color: '#6b7280' }}>Class:</span> <span style={{ fontWeight: 600 }}>{student.class_name} - {student.section_name}</span></div>
          <div><span style={{ color: '#6b7280' }}>Admission No:</span> <span style={{ fontWeight: 600 }}>{student.admission_number}</span></div>
          <div style={{ textAlign: 'right' }}><span style={{ color: '#6b7280' }}>Academic Year:</span> <span style={{ fontWeight: 600 }}>{academicYear}</span></div>
          {student.father_name && <div><span style={{ color: '#6b7280' }}>Father/Guardian:</span> <span style={{ fontWeight: 600 }}>{student.father_name}</span></div>}
        </div>

        {/* Subject-wise Marks Table */}
        {student.subject_wise_marks && student.subject_wise_marks.length > 0 && (
          <div style={{ marginBottom: '4px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #6b7280', fontSize: '10px', flex: 1 }}> 
              <thead>
                <tr style={{ background: '#1e3a5f', color: 'white' }}>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, width: '24px', fontSize: '11px' }}>S.No</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 4px', textAlign: 'left', fontWeight: 600, fontSize: '11px' }}>Subject</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>FA1+2+3+4<br/>(25%)</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>SA-1<br/>(25%)</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>SA-2<br/>(50%)</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>Total</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>Points</th>
                  <th style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 600, fontSize: '10px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {student.subject_wise_marks.map((sw, idx) => {
                  const pct = sw.total_max > 0 && sw.total_marks !== null ? (sw.total_marks / sw.total_max) * 100 : null;
                  const gradeInfo = pct !== null ? gradeScale.slice().sort((a: any, b: any) => b.min_pct - a.min_pct).find((g: any) => pct >= g.min_pct) : null;
                  const points = gradeInfo?.points ?? (pct !== null ? 0 : '-');
                  const passed = pct !== null && pct >= 35;
                  return (
                    <tr key={sw.subject_name} style={{ background: idx % 2 === 0 ? '#fff' : '#fefce8', fontSize: '10px' }}>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: '#374151', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 4px', fontWeight: 600, color: '#1f2937' }}>{sw.subject_name}</td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: '#111827', fontWeight: 500 }}>
                        {sw.fa_marks !== null ? Math.round(sw.fa_marks) : '-'}
                      </td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: '#111827', fontWeight: 500 }}>
                        {sw.sa1_marks !== null ? Math.round(sw.sa1_marks) : '-'}
                      </td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', color: '#111827', fontWeight: 500 }}>
                        {sw.sa2_marks !== null ? Math.round(sw.sa2_marks) : '-'}
                      </td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>
                        {sw.total_marks !== null ? Math.round(sw.total_marks) : '-'}
                      </td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>
                        {points}
                      </td>
                      <td style={{ border: '1px solid #9ca3af', padding: '3px 2px', textAlign: 'center', fontWeight: 700, fontStyle: 'italic', color: pct === null ? '#6b7280' : passed ? '#15803d' : '#dc2626' }}>
                        {sw.teacher_remarks || (pct === null ? '-' : pct >= 90 ? 'Excellent' : pct >= 75 ? 'Very good' : pct >= 60 ? 'Good' : pct >= 50 ? 'Pass' : pct >= 35 ? 'Keep pushing' : 'Stay determined')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary Cards */}
        <div className="summary-cards" style={{ display: 'flex', gap: '6px', justifyContent: 'center', margin: '4px 0', flexShrink: 0 }}>
          {(() => {
            const swMarks = student.subject_wise_marks || [];
            const grandTotal = swMarks.reduce((sum, sw) => sum + (sw.total_marks ?? 0), 0);
            const grandMax = 600;
            const pct = grandTotal > 0 ? Math.round((grandTotal / 600) * 100) : null;
            const pctColor = pct === null ? '#475569' : pct >= 75 ? '#16a34a' : pct >= 60 ? '#2563eb' : pct >= 40 ? '#ea580c' : '#dc2626';
            return [
              <div key="total" className="summary-card" style={{ flex: 1, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 2px', background: '#f8fafc' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{Math.round(grandTotal)}/{grandMax}</div>
                <div style={{ fontSize: '7px', color: '#64748b', marginTop: '1px' }}>Total Marks</div>
              </div>,
              <div key="pct" className="summary-card" style={{ flex: 1, textAlign: 'center', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '4px 2px', background: '#eff6ff' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: pctColor }}>{pct !== null ? pct : '-'}%</div>
                <div style={{ fontSize: '7px', color: '#3b82f6', marginTop: '1px' }}>Percentage</div>
              </div>,
              <div key="grade" className="summary-card" style={{ flex: 1, textAlign: 'center', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '4px 2px', background: '#faf5ff' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c', background: '#fff7ed', padding: '1px 4px', borderRadius: '4px' }}>{student.total_grade || '-'}</span>
                <div style={{ fontSize: '7px', color: '#a855f7', marginTop: '1px' }}>Grade</div>
              </div>,
              <div key="gpa" className="summary-card" style={{ flex: 1, textAlign: 'center', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '4px 2px', background: '#ecfdf5' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669' }}>{student.cgpa !== null ? student.cgpa : '-'} / 10</div>
                <div style={{ fontSize: '7px', color: '#10b981', marginTop: '1px' }}>GPA</div>
              </div>,
              <div key="rank" className="summary-card" style={{ flex: 1, textAlign: 'center', border: '1px solid #fde68a', borderRadius: '8px', padding: '4px 2px', background: '#fffbeb' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#d97706' }}>{student.class_rank ?? '-'}<sup style={{ fontSize: '7px' }}>{student.class_rank === 1 ? 'st' : student.class_rank === 2 ? 'nd' : student.class_rank === 3 ? 'rd' : 'th'}</sup></div>
                <div style={{ fontSize: '7px', color: '#f59e0b', marginTop: '1px' }}>Class Rank</div>
              </div>
            ];
          })()}
        </div>

        {/* Attendance Section - Monthly Jun to Apr */}
        <div style={{ marginBottom: '4px' }}>
          <h4 style={{ fontSize: '10px', fontWeight: 600, color: '#374151', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            📅 Attendance
          </h4>
          {(() => {
            const academicMonths = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4];
            const shortNames = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
            const monthlyMap: { [key: number]: AnnualAttendanceMonth } = {};
            (student.attendance_monthly || []).forEach(m => { monthlyMap[m.month] = m; });

            const totalWorking = academicMonths.reduce((sum, m) => sum + (monthlyMap[m]?.total_working_days || 0), 0);
            const totalPresent = academicMonths.reduce((sum, m) => sum + (monthlyMap[m]?.present_days || 0), 0);
            const attPct = totalWorking > 0 ? ((totalPresent / totalWorking) * 100).toFixed(1) : '0.0';

            return (
              <table className="attendance-table" style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #9ca3af', fontSize: '10px' }}>
                <thead>
                  <tr style={{ background: '#fef9c3' }}>
                    <th style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'left', fontSize: '9px', fontWeight: 600 }}></th>
                    {shortNames.map((name, i) => (
                      <th key={academicMonths[i]} style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '9px', fontWeight: 600 }}>{name}</th>
                    ))}
                    <th style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '9px', fontWeight: 600 }}>Total</th>
                    <th style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '9px', fontWeight: 600 }}>Att %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#fff' }}>
                    <td style={{ border: '1px solid #9ca3af', padding: '2px 3px', fontSize: '9px', fontWeight: 500, color: '#374151' }}>Working days</td>
                    {academicMonths.map(m => (
                      <td key={`wd_${m}`} style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#1d4ed8' }}>
                        {monthlyMap[m]?.total_working_days ?? 0}
                      </td>
                    ))}
                    <td style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#1e40af' }}>{totalWorking}</td>
                    <td rowSpan={2} style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: '#c2410c', verticalAlign: 'middle' }}>{attPct}%</td>
                  </tr>
                  <tr style={{ background: '#fff7ed' }}>
                    <td style={{ border: '1px solid #9ca3af', padding: '2px 3px', fontSize: '9px', fontWeight: 500, color: '#374151' }}>Present days</td>
                    {academicMonths.map(m => (
                      <td key={`pd_${m}`} style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '10px', fontWeight: 600, color: '#15803d' }}>
                        {monthlyMap[m]?.present_days ?? 0}
                      </td>
                    ))}
                    <td style={{ border: '1px solid #9ca3af', padding: '2px 3px', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#166534' }}>{totalPresent}</td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>

        {/* Performance Comparison - Class Topper / Average / Student */}
        {student.subject_performance && student.subject_performance.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#6366f1' }}>📊</span> Performance Comparison
              {student.class_rank != null && student.total_students != null && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#7e22ce', background: '#f3e8ff', padding: '1px 6px', borderRadius: '4px' }}>
                  Rank: {student.class_rank} / {student.total_students}
                </span>
              )}
            </h4>
            <div className="perf-section" style={{ background: '#fff', borderRadius: '4px', border: '1px solid #d1d5db', padding: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {student.subject_performance.map((sp) => {
                  const topperPct = sp.max_marks > 0 ? (sp.class_topper / sp.max_marks) * 100 : 0;
                  const avgPct = sp.max_marks > 0 ? (sp.class_average / sp.max_marks) * 100 : 0;
                  const studentPct = sp.student_marks !== null && sp.max_marks > 0 ? (sp.student_marks / sp.max_marks) * 100 : 0;
                  const isFail = sp.student_marks !== null && sp.pass_marks != null && sp.student_marks < sp.pass_marks;
                  return (
                    <div key={sp.subject_name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '80px', fontSize: '10px', fontWeight: 600, color: isFail ? '#dc2626' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.subject_name}</div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {/* Class Topper */}
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${Math.min(topperPct, 100)}%`, background: '#10b981', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '3px' }}>
                              <span style={{ fontSize: '8px', color: 'white', fontWeight: 700 }}>{Math.round(topperPct)}%</span>
                            </div>
                          </div>
                        </div>
                        {/* Class Average */}
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${Math.min(avgPct, 100)}%`, background: '#f59e0b', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '3px' }}>
                              <span style={{ fontSize: '8px', color: 'white', fontWeight: 700 }}>{Math.round(avgPct)}%</span>
                            </div>
                          </div>
                        </div>
                        {/* Student */}
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${Math.min(studentPct, 100)}%`, background: isFail ? '#ef4444' : sp.student_marks !== null ? '#6366f1' : '#9ca3af', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '3px' }}>
                              {sp.student_marks !== null && <span style={{ fontSize: '8px', color: 'white', fontWeight: 700 }}>{Math.round(studentPct)}%</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '6px', paddingTop: '4px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '2px' }}></div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>Class Topper</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '2px' }}></div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>Class Average</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#6366f1', borderRadius: '2px' }}></div>
                  <span style={{ fontSize: '10px', color: '#6b7280' }}>Student</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Promoted / Detained */}
        <div className="promoted-row" style={{ display: 'flex', alignItems: 'center', gap: '30px', justifyContent: 'center', margin: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '16px', border: '1px solid #4ade80', background: '#f0fdf4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '2px' }}>
              {student.total_grade_point !== null && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '11px' }}>✓</span>}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#dc2626' }}>PROMOTED</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '16px', border: '1px solid #d1d5db', background: '#f9fafb', display: 'inline-flex', borderRadius: '2px' }}></span>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>DETAINED</span>
          </div>
        </div>

        {/* Remarks */}
        <div className="remarks-box" style={{ border: '2px solid #1e3a5f', padding: '8px 10px', margin: '6px 0', borderRadius: '4px', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e3a5f', whiteSpace: 'nowrap' }}>Remarks:</span>
            <span style={{ fontSize: '10px', color: '#374151' }}>
              {remarks || (
                (() => {
                  const swMarks = student.subject_wise_marks || [];
                  const remarkCounts: { [remark: string]: number } = {};
                  swMarks.forEach(sw => {
                    if (sw.teacher_remarks) {
                      remarkCounts[sw.teacher_remarks] = (remarkCounts[sw.teacher_remarks] || 0) + 1;
                    }
                  });
                  const sorted = Object.entries(remarkCounts).sort((a, b) => b[1] - a[1]);
                  if (sorted.length > 0) return sorted[0][0];
                  if (student.total_average !== null) {
                    return student.total_average >= 90 ? "Outstanding performance! Keep up the excellent work."
                      : student.total_average >= 75 ? "Great job! Continue working hard to achieve even more."
                      : student.total_average >= 60 ? "Good effort! Focus on your weak areas to improve further."
                      : student.total_average >= 40 ? "Keep pushing! Your hard work will lead to better results with time."
                      : "Need improvement. Please focus more on studies and seek help where needed.";
                  }
                  return '';
                })()
              )}
            </span>
          </div>
          <textarea
            value={remarks}
            onChange={e => onRemarksChange(e.target.value)}
            className="no-print"
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '4px', padding: '4px 6px', fontSize: '11px', marginTop: '4px' }}
            rows={2}
            placeholder="Enter remarks (e.g. Excellent!, Good Performance...)"
          />
        </div>

        {/* Spacer to push signatures to bottom when printing */}
        {/* Spacer to push signatures to bottom when printing */}
        <div className="flex-grow-spacer" style={{ flex: 1, minHeight: 0 }}></div>

        {/* Signatures - always at the bottom of the page */}
        <div className="signatures-row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', fontSize: '10px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', width: '120px', margin: '0 auto 3px' }}></div>
            <span style={{ fontSize: '9px', color: '#6b7280' }}>Signature of the Parent</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', width: '120px', margin: '0 auto 3px' }}></div>
            <span style={{ fontSize: '9px', color: '#6b7280' }}>Signature of Class Teacher</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9ca3af', width: '120px', margin: '0 auto 3px' }}></div>
            <span style={{ fontSize: '9px', color: '#6b7280' }}>Signature of the Principal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ========== Scholastic Back Page (printed on back of report card) ==========

interface ScholasticBackPageProps {
  student: ScholasticReportStudent;
  categories: ScholasticStudentReport['categories'];
  terms: ScholasticStudentReport['terms'];
  academicYear: string;
  className: string;
  sectionName: string;
  schoolSettings?: SchoolSettings | null;
}

const ScholasticBackPage: React.FC<ScholasticBackPageProps> = ({ student, categories, terms, academicYear, className, sectionName, schoolSettings }) => {
  const logoUrl = schoolSettings ? schoolSettingsService.getLogoUrl(schoolSettings) : null;
  const schoolName = schoolSettings?.school_name || 'SRI SAI PRASANTHI VIDYANIKETAN';
  const schoolAddress = schoolSettings?.address || 'Dwaraka Nagar, Bandlaguda Jagir, Gandipet Mandal, R.R.Dist., Hyderabad.';
  const affiliation = schoolSettings?.affiliation || 'Recognised by the Govt. of Telangana';
  return (
    <div className="bg-white rounded-lg shadow mb-6 border-2 border-blue-900 overflow-hidden scholastic-back" style={{ pageBreakBefore: 'always' }}>
      {/* School Header */}
      <div style={{ background: '#fefce8', borderBottom: '3px solid #1e3a5f', padding: '12px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <img src={logoUrl || logoImg} alt="School Logo" style={{ height: '64px', width: '64px', objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', letterSpacing: '2px', fontFamily: 'Georgia, serif', lineHeight: '1' }}>{schoolName.replace(/HIGH SCHOOL/i, '').trim()}</span>
            <div style={{ background: '#b91c1c', color: 'white', padding: '3px 10px', borderRadius: '3px', fontSize: '13px', fontWeight: '900', lineHeight: '1.3', textAlign: 'center', letterSpacing: '1px' }}>
              <div>HIGH</div>
              <div>SCHOOL</div>
            </div>
          </div>
          <div style={{ fontSize: '11.5px', color: '#374151', marginTop: '3px', fontStyle: 'italic' }}>({affiliation})</div>
          <div style={{ fontSize: '12px', color: '#be185d', fontWeight: '700', marginTop: '2px' }}>{schoolAddress}</div>
        </div>
        <div style={{ marginTop: '8px', background: '#1e3a5f', borderRadius: '3px', padding: '4px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'white', fontSize: '13px', fontWeight: '700', letterSpacing: '1px' }}>SCHOLASTIC AREAS</span>
          <span style={{ color: '#93c5fd', fontSize: '12px' }}>{academicYear}</span>
        </div>
      </div>

      <div className="p-5">
        {/* Student Info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-4 text-sm">
          <div><span className="text-gray-500">Name:</span> <span className="font-semibold">{student.student_name}</span></div>
          <div><span className="text-gray-500">Class:</span> <span className="font-semibold">{className} - {sectionName}</span></div>
          <div><span className="text-gray-500">Admission No:</span> <span className="font-semibold">{student.admission_number}</span></div>
          <div><span className="text-gray-500">Academic Year:</span> <span className="font-semibold">{academicYear}</span></div>
          {student.father_name && <div><span className="text-gray-500">Father/Guardian:</span> <span className="font-semibold">{student.father_name}</span></div>}
        </div>

        {/* Scholastic Table with 3 Terms */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-400 schol-table">
            <thead>
              <tr className="bg-blue-50">
                <th className="border border-gray-400 px-3 py-2 text-left text-xs font-semibold text-gray-800 w-12">S.No</th>
                <th className="border border-gray-400 px-3 py-2 text-left text-xs font-semibold text-gray-800">Area / Parameter</th>
                {terms.map(term => (
                  <th key={term.id} className="border border-gray-400 px-3 py-2 text-center text-xs font-semibold text-gray-800 w-24">
                    {term.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => {
                const rows: React.ReactNode[] = [];
                // Category header row
                rows.push(
                  <tr key={`cat-${cat.id}`} className="bg-indigo-50">
                    <td className="border border-gray-400 px-3 py-2 font-bold text-xs text-indigo-900 cat-header" colSpan={2 + terms.length}>
                      {cat.name}
                    </td>
                  </tr>
                );
                // Parameter rows
                cat.parameters.forEach((param, pIdx) => {
                  rows.push(
                    <tr key={`param-${param.id}`} className={pIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-400 px-3 py-1.5 text-center text-xs text-gray-600">{pIdx + 1}</td>
                      <td className="border border-gray-400 px-3 py-1.5 text-xs text-gray-800 param-name">{param.name}</td>
                      {terms.map(term => {
                        const val = student.term_grades[String(term.id)]?.[String(param.id)];
                        return (
                          <td key={term.id} className="border border-gray-400 px-3 py-1.5 text-center text-xs font-semibold text-purple-800">
                            {val !== null && val !== undefined ? String(val) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
                return rows;
              })}
            </tbody>
          </table>
        </div>

        {/* Grading Scale Legend */}
        <div className="mt-4 border border-gray-300 rounded p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 mb-1">Grading Scale:</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
            <span><strong>A+</strong> = Outstanding</span>
            <span><strong>A</strong> = Excellent</span>
            <span><strong>B+</strong> = Very Good</span>
            <span><strong>B</strong> = Good</span>
            <span><strong>C+</strong> = Above Average</span>
            <span><strong>C</strong> = Average</span>
            <span><strong>D</strong> = Below Average</span>
            <span><strong>E</strong> = Needs Improvement</span>
          </div>
        </div>

        {/* Signatures */}
        <div className="flex justify-between mt-8 pt-4">
          <div className="text-center">
            <div className="border-t border-gray-400 w-40 mx-auto mb-1"></div>
            <span className="text-xs text-gray-600">Signature of the Parent</span>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-40 mx-auto mb-1"></div>
            <span className="text-xs text-gray-600">Signature of Class Teacher</span>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-40 mx-auto mb-1"></div>
            <span className="text-xs text-gray-600">Signature of the Principal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnualReport;
