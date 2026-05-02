import React, { useEffect, useState } from 'react';
import academicYearService, { AcademicYear, AcademicYearCreate } from '../../services/academicYearService';

const AcademicYearPage: React.FC = () => {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AcademicYearCreate>({ name: '' });
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);

  useEffect(() => {
    fetchYears();
  }, []);

  const fetchYears = async () => {
    try {
      setLoading(true);
      const data = await academicYearService.listAcademicYears(true);
      setYears(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch academic years');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Year name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingYear) {
        await academicYearService.updateAcademicYear(editingYear.id, { name: formData.name });
        setSuccess('Academic year updated successfully!');
      } else {
        await academicYearService.createAcademicYear(formData);
        setSuccess('Academic year created successfully!');
      }

      resetForm();
      fetchYears();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save academic year');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (year: AcademicYear) => {
    setEditingYear(year);
    setFormData({ name: year.name });
    setError('');
    setSuccess('');
  };

  const handleDelete = async (yearId: number) => {
    if (!window.confirm('Are you sure you want to delete this academic year?')) return;

    try {
      await academicYearService.deleteAcademicYear(yearId);
      setSuccess('Academic year deleted successfully!');
      fetchYears();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete academic year');
    }
  };

  const resetForm = () => {
    setFormData({ name: '' });
    setEditingYear(null);
    setError('');
  };

  if (loading) {
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
        {/* Title Bar */}
        <div className="bg-gray-600 text-white px-4 py-3 rounded-t-lg">
          <h2 className="text-base font-medium">Academic Year Management</h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">
              Year <span className="text-gray-400">e.g 2024 - 2025</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              placeholder="2025-2026"
              className="w-full max-w-md px-3 py-2 border-l-4 border-l-indigo-500 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : (editingYear ? 'Update' : 'Submit')}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded text-sm font-medium"
            >
              Cancel
            </button>
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
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-16">
                #
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                Year Name
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 w-40">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {years.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  No academic years found. Add one above.
                </td>
              </tr>
            ) : (
              years.map((year, index) => (
                <tr key={year.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-indigo-600">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 text-sm text-indigo-600">
                    {year.name}
                    {year.is_current && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(year)}
                        className="bg-teal-500 hover:bg-teal-600 text-white px-3 py-1 rounded text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(year.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AcademicYearPage;
