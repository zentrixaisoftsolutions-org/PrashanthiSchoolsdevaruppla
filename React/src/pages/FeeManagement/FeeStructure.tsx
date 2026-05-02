import React, { useEffect, useState } from 'react';
import feeService, { FeeStructure } from '../../services/feeService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classNameService, { ClassName } from '../../services/classNameService';

interface FeeRow {
  fee_type: string;
  term1: FeeStructure | null;
  term2: FeeStructure | null;
  term3: FeeStructure | null;
}

const FeeStructurePage: React.FC = () => {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [filterAYId, setFilterAYId] = useState<number | null>(null);
  const [filterClassId, setFilterClassId] = useState<number | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    academic_year_id: 0,
    class_name_id: 0,
    fee_type: '',
    amount: '',
    term: 1,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (filterAYId !== null) loadStructures();
  }, [filterAYId, filterClassId]);

  const loadInitialData = async () => {
    try {
      const [years, classes] = await Promise.all([
        academicYearService.listAcademicYears(false),
        classNameService.listClassNames(false),
      ]);
      setAcademicYears(years);
      setClassNames(classes);
      const current = years.find(y => y.is_current) || years[0];
      if (current) {
        setFilterAYId(current.id);
        setFormData(prev => ({ ...prev, academic_year_id: current.id }));
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadStructures = async () => {
    if (!filterAYId) return;
    try {
      const data = await feeService.listStructures(filterAYId, filterClassId || undefined);
      setStructures(data);
    } catch {
      setError('Failed to load fee structures');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editId) {
        await feeService.updateStructure(editId, {
          fee_type: formData.fee_type,
          amount: parseFloat(formData.amount),
          term: formData.term,
        });
        setSuccess('Fee structure updated');
      } else {
        await feeService.createStructure({
          academic_year_id: formData.academic_year_id,
          class_name_id: formData.class_name_id,
          fee_type: formData.fee_type,
          amount: parseFloat(formData.amount),
          term: formData.term,
        });
        setSuccess('Fee structure created');
      }
      resetForm();
      loadStructures();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleEdit = (s: FeeStructure) => {
    setEditId(s.id);
    setFormData({
      academic_year_id: s.academic_year_id,
      class_name_id: s.class_name_id,
      fee_type: s.fee_type,
      amount: String(s.amount),
      term: s.term || 1,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this fee structure?')) return;
    try {
      await feeService.deleteStructure(id);
      setSuccess('Fee structure deactivated');
      loadStructures();
    } catch {
      setError('Failed to delete');
    }
  };

  const resetForm = () => {
    setEditId(null);
    setShowForm(false);
    setFormData({
      academic_year_id: filterAYId || 0,
      class_name_id: 0,
      fee_type: '',
      amount: '',
      term: 1,
    });
  };

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amt);

  // Group by class, then pivot fee types across terms
  const groupedByClass = structures.reduce<Record<string, FeeStructure[]>>((acc, s) => {
    const key = s.class_name || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const classTables = Object.entries(groupedByClass).map(([className, items]) => {
    const feeMap: Record<string, FeeRow> = {};
    for (const s of items) {
      if (!feeMap[s.fee_type]) {
        feeMap[s.fee_type] = { fee_type: s.fee_type, term1: null, term2: null, term3: null };
      }
      if (s.term === 1) feeMap[s.fee_type].term1 = s;
      else if (s.term === 2) feeMap[s.fee_type].term2 = s;
      else if (s.term === 3) feeMap[s.fee_type].term3 = s;
    }
    const rows = Object.values(feeMap);
    const totalT1 = rows.reduce((sum, r) => sum + (r.term1?.amount || 0), 0);
    const totalT2 = rows.reduce((sum, r) => sum + (r.term2?.amount || 0), 0);
    const totalT3 = rows.reduce((sum, r) => sum + (r.term3?.amount || 0), 0);
    const grandTotal = totalT1 + totalT2 + totalT3;
    return { className, rows, totalT1, totalT2, totalT3, grandTotal };
  });

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
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">FEE STRUCTURE</h2>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            + Add Fee Component
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
            <select
              value={filterAYId || ''}
              onChange={e => setFilterAYId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">-- Select --</option>
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Class</label>
            <select
              value={filterClassId || ''}
              onChange={e => setFilterClassId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
            >
              <option value="">All Classes</option>
              {classNames.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Alerts */}
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

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="bg-gray-100 px-4 py-3 rounded-t-lg border-b flex justify-between items-center">
              <h3 className="text-base font-medium text-gray-800">{editId ? 'Edit Fee Component' : 'Add Fee Component'}</h3>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
                  <select
                    value={formData.academic_year_id}
                    onChange={e => setFormData(p => ({ ...p, academic_year_id: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    required disabled={!!editId}
                  >
                    <option value={0}>-- Select --</option>
                    {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Class</label>
                  <select
                    value={formData.class_name_id}
                    onChange={e => setFormData(p => ({ ...p, class_name_id: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                    required disabled={!!editId}
                  >
                    <option value={0}>-- Select --</option>
                    {classNames.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fee Type</label>
                <input
                  type="text"
                  value={formData.fee_type}
                  onChange={e => setFormData(p => ({ ...p, fee_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., Tuition Fee"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Term</label>
                  <select
                    value={formData.term}
                    onChange={e => setFormData(p => ({ ...p, term: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                  >
                    <option value={1}>Term 1</option>
                    <option value={2}>Term 2</option>
                    <option value={3}>Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium">
                  {editId ? 'Update' : 'Save'}
                </button>
                <button type="button" onClick={resetForm} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fee Structure Table */}
      {classTables.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No fee structures found. Click "Add Fee Component" to create one.
        </div>
      ) : (
        classTables.map(({ className, rows, totalT1, totalT2, totalT3, grandTotal }) => (
          <div key={className} className="bg-white rounded-lg shadow mb-4">
            <div className="bg-indigo-50 px-4 py-3 border-b flex justify-between items-center rounded-t-lg">
              <h3 className="text-sm font-semibold text-indigo-700">{className}</h3>
              <span className="text-sm font-bold text-indigo-600">Year Total: {formatCurrency(grandTotal)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Fee Type</th>
                    <th className="px-4 py-3 text-right">Term 1</th>
                    <th className="px-4 py-3 text-right">Term 2</th>
                    <th className="px-4 py-3 text-right">Term 3</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const rowTotal = (row.term1?.amount || 0) + (row.term2?.amount || 0) + (row.term3?.amount || 0);
                    return (
                      <tr key={row.fee_type} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.fee_type}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-700">
                          {row.term1 ? formatCurrency(row.term1.amount) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-700">
                          {row.term2 ? formatCurrency(row.term2.amount) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-700">
                          {row.term3 ? formatCurrency(row.term3.amount) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-indigo-700">
                          {formatCurrency(rowTotal)}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {[row.term1, row.term2, row.term3].filter(Boolean).map(s => (
                            <span key={s!.id} className="inline-flex items-center mr-1">
                              <button onClick={() => handleEdit(s!)} className="text-indigo-600 hover:text-indigo-800 text-xs mr-1" title={`Edit Term ${s!.term}`}>
                                T{s!.term}✏️
                              </button>
                              <button onClick={() => handleDelete(s!.id)} className="text-red-500 hover:text-red-700 text-xs mr-2" title={`Delete Term ${s!.term}`}>
                                ✕
                              </button>
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-50 font-bold text-sm">
                    <td className="px-4 py-3 text-indigo-700">Total</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{formatCurrency(totalT1)}</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{formatCurrency(totalT2)}</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{formatCurrency(totalT3)}</td>
                    <td className="px-4 py-3 text-right text-indigo-900">{formatCurrency(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default FeeStructurePage;
