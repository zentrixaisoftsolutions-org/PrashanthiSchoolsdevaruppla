import React, { useEffect, useState } from 'react';
import departmentService, { Department } from '../../services/departmentService';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiCheck } from 'react-icons/fi';
import { FaBuilding } from 'react-icons/fa';

const Departments: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [formName, setFormName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const data = await departmentService.list(true);
      setDepartments(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch departments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    try {
      if (editing) {
        await departmentService.update(editing.id, { name: formName.trim() });
        setSuccess('Department updated successfully');
      } else {
        await departmentService.create({ name: formName.trim() });
        setSuccess('Department created successfully');
      }
      setShowModal(false);
      setEditing(null);
      setFormName('');
      fetchDepartments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Operation failed');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = async (id: number) => {
    try {
      await departmentService.delete(id);
      setSuccess('Department deactivated');
      setDeleteConfirm(null);
      fetchDepartments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleToggleActive = async (dept: Department) => {
    try {
      await departmentService.update(dept.id, { is_active: !dept.is_active });
      fetchDepartments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update');
    }
  };

  const openAddModal = () => {
    setEditing(null);
    setFormName('');
    setShowModal(true);
    setError('');
  };

  const openEditModal = (dept: Department) => {
    setEditing(dept);
    setFormName(dept.name);
    setShowModal(true);
    setError('');
  };

  const filtered = departments.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <FaBuilding className="text-indigo-600" />
          Departments
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage staff departments and divisions
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 rounded flex justify-between items-center">
          <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700"><FiX size={16} /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-500 p-3 rounded">
          <span className="text-emerald-700 dark:text-emerald-300 text-sm">{success}</span>
        </div>
      )}

      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search departments..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-64 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <FiPlus size={16} /> Add Department
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <FaBuilding className="mx-auto text-4xl mb-3 opacity-30" />
              <p>{searchTerm ? 'No matching departments found' : 'No departments yet. Add one to get started!'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 w-16">#</th>
                  <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">Department Name</th>
                  <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 w-28 text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300 w-40 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((dept, i) => (
                  <tr
                    key={dept.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-white">{dept.name}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(dept)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          dept.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 hover:bg-red-200'
                        }`}
                        title={dept.is_active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        <FiCheck size={12} />
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(dept)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 size={16} />
                        </button>
                        {deleteConfirm === dept.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(dept.id)}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(dept.id)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            Showing {filtered.length} department{filtered.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                {editing ? 'Edit Department' : 'Add Department'}
              </h3>
              <button
                onClick={() => { setShowModal(false); setEditing(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <FiX size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Department Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., High School"
                autoFocus
                required
              />
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditing(null); }}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Departments;
