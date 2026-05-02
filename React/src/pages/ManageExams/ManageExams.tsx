import React, { useEffect, useState } from 'react';
import examTypeService, { ExamType, ExamTypeCreate } from '../../services/examTypeService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';

const ManageExams: React.FC = () => {
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ExamTypeCreate>({ 
    name: '', 
    academic_year_id: null 
  });
  const [editingExam, setEditingExam] = useState<ExamType | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    fetchAcademicYears();
  }, []);

  useEffect(() => {
    fetchExamTypes();
  }, [currentPage]);

  const fetchAcademicYears = async () => {
    try {
      const data = await academicYearService.listAcademicYears(false);
      setAcademicYears(data);
      // Set default to first academic year if available
      if (data.length > 0 && !formData.academic_year_id) {
        const currentYear = data.find(y => y.is_current) || data[0];
        setFormData(prev => ({ ...prev, academic_year_id: currentYear.id }));
      }
    } catch (err: any) {
      console.error('Failed to fetch academic years:', err);
    }
  };

  const fetchExamTypes = async () => {
    try {
      setLoading(true);
      const skip = (currentPage - 1) * pageSize;
      const [data, count] = await Promise.all([
        examTypeService.listExamTypes({ skip, limit: pageSize, include_inactive: true }),
        examTypeService.countExamTypes({ include_inactive: true })
      ]);
      setExamTypes(data);
      setTotalCount(count);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch exam types');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Exam name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingExam) {
        await examTypeService.updateExamType(editingExam.id, {
          name: formData.name,
          academic_year_id: formData.academic_year_id
        });
        setSuccess('Exam updated successfully!');
      } else {
        await examTypeService.createExamType(formData);
        setSuccess('Exam created successfully!');
      }

      resetForm();
      fetchExamTypes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save exam');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (exam: ExamType) => {
    setEditingExam(exam);
    setFormData({ 
      name: exam.name, 
      academic_year_id: exam.academic_year_id 
    });
    setError('');
    setSuccess('');
  };

  const handleDelete = async (examId: number) => {
    if (!window.confirm('Are you sure you want to delete this exam?')) return;

    try {
      await examTypeService.deleteExamType(examId);
      setSuccess('Exam deleted successfully!');
      fetchExamTypes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete exam');
    }
  };

  const resetForm = () => {
    const currentYear = academicYears.find(y => y.is_current) || academicYears[0];
    setFormData({ 
      name: '', 
      academic_year_id: currentYear?.id || null 
    });
    setEditingExam(null);
    setError('');
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading && examTypes.length === 0) {
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
        
        {/* Title Bar */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-normal text-gray-700 tracking-wide">
            ADD EXAMINATION
          </h2>
        </div>
        <div className="h-0.5 bg-teal-500"></div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid gap-6 max-w-2xl">
            {/* Academic Year Dropdown */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Academic Year
              </label>
              <select
                value={formData.academic_year_id || ''}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  academic_year_id: e.target.value ? parseInt(e.target.value) : null 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              >
                <option value="">-- Select Academic Year --</option>
                {academicYears.map(year => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Exam Name Input */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Exam Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., TEST-I, FORMATIVE ASSESSMENT - I"
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="submit"
              disabled={saving}
              className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : (editingExam ? 'Update' : 'Submit')}
            </button>
            {editingExam && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded text-sm font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
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
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700" style={{ width: '50%' }}>
                Exam Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-700" style={{ width: '30%' }}>
                Academic Year
              </th>
              <th className="px-6 py-3 text-right text-sm font-medium text-gray-700" style={{ width: '20%' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {examTypes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No examinations found. Add one above.
                </td>
              </tr>
            ) : (
              examTypes.map((exam, index) => (
                <tr 
                  key={exam.id} 
                  className={`border-b border-gray-100 ${index % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <td className="px-6 py-4 text-sm text-indigo-600">
                    {exam.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {exam.academic_year_name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleEdit(exam)}
                        className="bg-green-500 hover:bg-green-600 text-white p-2 rounded"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(exam.id)}
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
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-indigo-600">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
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
    </div>
  );
};

export default ManageExams;
