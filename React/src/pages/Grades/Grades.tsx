import React, { useState, useEffect } from 'react';
import gradeService, { GradeCriteria, GradeCriteriaCreate } from '../../services/gradeService';

interface GradeRow {
  id?: number;
  min_percentage: string;
  max_percentage: string;
  grade: string;
  teacher_remarks: string;
  grade_point: string;
  general_remarks: string;
  is_active: boolean;
}

const Grades: React.FC = () => {
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [teacherRemarkEnabled, setTeacherRemarkEnabled] = useState(true);
  const [gradePointEnabled, setGradePointEnabled] = useState(true);
  const [rankEnabled, setRankEnabled] = useState(true);

  useEffect(() => {
    fetchGrades();
  }, []);

  const fetchGrades = async () => {
    try {
      setLoading(true);
      const data = await gradeService.listGrades(true);
      if (data.length === 0) {
        // No grades exist, set empty initial row
        setGrades([createEmptyRow()]);
      } else {
        setGrades(data.map(g => ({
          id: g.id,
          min_percentage: g.min_percentage.toString(),
          max_percentage: g.max_percentage.toString(),
          grade: g.grade,
          teacher_remarks: g.teacher_remarks || '',
          grade_point: g.grade_point?.toString() || '',
          general_remarks: g.general_remarks || '',
          is_active: g.is_active,
        })));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load grade criteria');
    } finally {
      setLoading(false);
    }
  };

  const createEmptyRow = (): GradeRow => ({
    min_percentage: '',
    max_percentage: '',
    grade: '',
    teacher_remarks: '',
    grade_point: '',
    general_remarks: '',
    is_active: true,
  });

  const addRow = () => {
    setGrades([...grades, createEmptyRow()]);
  };

  const removeRow = (index: number) => {
    if (grades.length > 1) {
      const newGrades = grades.filter((_, i) => i !== index);
      setGrades(newGrades);
    }
  };

  const updateRow = (index: number, field: keyof GradeRow, value: string | boolean) => {
    const newGrades = [...grades];
    newGrades[index] = { ...newGrades[index], [field]: value };
    setGrades(newGrades);
  };

  const validateGrades = (): boolean => {
    for (let i = 0; i < grades.length; i++) {
      const row = grades[i];
      if (!row.grade.trim()) {
        setError(`Row ${i + 1}: Grade name is required`);
        return false;
      }
      const minPct = parseFloat(row.min_percentage);
      const maxPct = parseFloat(row.max_percentage);
      
      if (isNaN(minPct) || isNaN(maxPct)) {
        setError(`Row ${i + 1}: Valid percentage range is required`);
        return false;
      }
      
      if (minPct > maxPct) {
        setError(`Row ${i + 1}: Min percentage cannot be greater than max percentage`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    
    if (!validateGrades()) {
      return;
    }
    
    try {
      setSaving(true);
      
      const criteria: GradeCriteriaCreate[] = grades.map((g, index) => ({
        min_percentage: parseFloat(g.min_percentage) || 0,
        max_percentage: parseFloat(g.max_percentage) || 0,
        grade: g.grade,
        teacher_remarks: g.teacher_remarks || undefined,
        grade_point: g.grade_point ? parseInt(g.grade_point) : undefined,
        general_remarks: g.general_remarks || undefined,
        is_active: g.is_active,
        display_order: index,
      }));
      
      await gradeService.bulkUpdate(criteria);
      setSuccess('Grade criteria saved successfully!');
      fetchGrades(); // Refresh to get updated IDs
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save grade criteria');
    } finally {
      setSaving(false);
    }
  };

  const seedDefaults = async () => {
    try {
      setLoading(true);
      setError('');
      await gradeService.seedDefaults();
      setSuccess('Default grade criteria added successfully!');
      fetchGrades();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to seed defaults');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Grade Criteria</h1>
        <p className="text-gray-600 mt-1">Manage grade calculation criteria for students performance reports</p>
      </div>

      {error && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
          <button className="float-right font-bold" onClick={() => setError('')}>×</button>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
          <button className="float-right font-bold" onClick={() => setSuccess('')}>×</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Settings */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 w-32">Teacher Remark</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={teacherRemarkEnabled}
                onChange={(e) => setTeacherRemarkEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 w-32">Grade Point</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gradePointEnabled}
                onChange={(e) => setGradePointEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 w-32">Rank</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rankEnabled}
                onChange={(e) => setRankEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
        </div>

        {/* Info */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-gray-700">Range Details</h3>
          <p className="text-sm text-orange-600">(The assigned % range should be in this format Ex: 50 to 59.99)</p>
        </div>

        {/* Table Header */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 w-20">From</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 w-20">To</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 w-24">Grade</th>
                {teacherRemarkEnabled && (
                  <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 w-32">Teacher Remarks</th>
                )}
                {gradePointEnabled && (
                  <th className="text-left py-2 px-2 text-sm font-medium text-gray-600 w-24">Grade Point</th>
                )}
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">General Remarks</th>
                <th className="text-center py-2 px-2 text-sm font-medium text-gray-600 w-16">Active</th>
                <th className="text-center py-2 px-2 text-sm font-medium text-gray-600 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((grade, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={grade.min_percentage}
                      onChange={(e) => updateRow(index, 'min_percentage', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={grade.max_percentage}
                      onChange={(e) => updateRow(index, 'max_percentage', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="100"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={grade.grade}
                      onChange={(e) => updateRow(index, 'grade', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="A1"
                    />
                  </td>
                  {teacherRemarkEnabled && (
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={grade.teacher_remarks}
                        onChange={(e) => updateRow(index, 'teacher_remarks', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Excellent work"
                      />
                    </td>
                  )}
                  {gradePointEnabled && (
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={grade.grade_point}
                        onChange={(e) => updateRow(index, 'grade_point', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="10"
                      />
                    </td>
                  )}
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={grade.general_remarks}
                      onChange={(e) => updateRow(index, 'general_remarks', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Excellent work! Your hard work is paying off"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={grade.is_active}
                      onChange={(e) => updateRow(index, 'is_active', e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    {index === 0 ? (
                      <button
                        onClick={addRow}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                      >
                        Add More
                      </button>
                    ) : (
                      <button
                        onClick={() => removeRow(index)}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 border border-gray-300"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
            Submit
          </button>
          <button
            onClick={() => fetchGrades()}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
          {grades.length === 1 && !grades[0].grade && (
            <button
              onClick={seedDefaults}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Load Default Grades
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Grades;
