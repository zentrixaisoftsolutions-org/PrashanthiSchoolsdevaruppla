import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiEye, FiEyeOff, FiRefreshCw } from 'react-icons/fi';
import { FaUserPlus, FaUsers, FaUserShield } from 'react-icons/fa';
import userManagementService, { UserRecord, Role, CreateUserPayload, UpdateUserPayload } from '../../services/userManagementService';

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  student: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  parent: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [form, setForm] = useState({
    email: '',
    username: '',
    full_name: '',
    phone: '',
    role_id: 0,
    password: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        userManagementService.listUsers(),
        userManagementService.listRoles(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (err: any) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setForm({ email: '', username: '', full_name: '', phone: '', role_id: roles[0]?.id || 0, password: '' });
    setEditId(null);
    setShowModal(false);
    setShowPassword(false);
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setForm(prev => ({ ...prev, role_id: roles[0]?.id || 0 }));
    setShowModal(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditId(user.id);
    setForm({
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      phone: user.phone || '',
      role_id: user.role_id,
      password: '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editId) {
        const payload: UpdateUserPayload = {
          full_name: form.full_name,
          phone: form.phone || undefined,
          role_id: form.role_id,
          email: form.email,
        };
        if (form.password.trim()) {
          payload.password = form.password;
        }
        await userManagementService.updateUser(editId, payload);
        setSuccess('User updated successfully');
      } else {
        if (!form.password || form.password.length < 8) {
          setError('Password must be at least 8 characters');
          return;
        }
        const payload: CreateUserPayload = {
          email: form.email,
          username: form.username,
          full_name: form.full_name,
          phone: form.phone || undefined,
          role_id: form.role_id,
          password: form.password,
        };
        await userManagementService.createUser(payload);
        setSuccess('User created successfully');
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Operation failed';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

  const handleDelete = async (user: UserRecord) => {
    if (!window.confirm(`Are you sure you want to delete user "${user.full_name}" (${user.username})?`)) return;
    setError('');
    setSuccess('');
    try {
      await userManagementService.deleteUser(user.id);
      setSuccess(`User "${user.username}" deleted successfully`);
      fetchData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to delete user';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    try {
      await userManagementService.updateUser(user.id, { is_active: !user.is_active });
      setSuccess(`User "${user.username}" ${!user.is_active ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (err: any) {
      setError('Failed to update user status');
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || 
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || u.role_name === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCounts = roles.map(r => ({
    ...r,
    count: users.filter(u => u.role_name === r.name).length,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <FaUsers className="text-teal-500" /> User Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Add, edit, and manage user accounts and role assignments
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            <FiRefreshCw className="inline mr-1" /> Refresh
          </button>
          <button onClick={openCreate} className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors">
            <FaUserPlus /> Add User
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700"><FiX /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 text-sm flex justify-between items-center">
          {success}
          <button onClick={() => setSuccess('')} className="ml-2 text-green-500 hover:text-green-700"><FiX /></button>
        </div>
      )}

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {roleCounts.map(r => (
          <button
            key={r.id}
            onClick={() => setRoleFilter(roleFilter === r.name ? '' : r.name)}
            className={`p-3 rounded-lg border text-left transition-all ${
              roleFilter === r.name
                ? 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="text-lg font-bold text-gray-800 dark:text-white">{r.count}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{r.name.replace('_', ' ')}</div>
          </button>
        ))}
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, username, or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
        >
          <option value="">All Roles</option>
          {roles.map(r => (
            <option key={r.id} value={r.name}>{r.name.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
          ))}
        </select>
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">{user.full_name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.username}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[user.role_name || ''] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {(user.role_name || 'unknown').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                          user.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200'
                        }`}
                        title={user.is_active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                        {user.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="Edit"
                        >
                          <FiEdit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Showing {filtered.length} of {users.length} users
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                {editId ? <FiEdit2 className="text-teal-500" /> : <FaUserPlus className="text-teal-500" />}
                {editId ? 'Edit User' : 'Add New User'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {error && (
                <div className="p-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs">{error}</div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={e => setForm({ ...form, full_name: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    disabled={!!editId}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="johndoe"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="john@school.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
                    placeholder="+91 9876543210"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role *</label>
                  <select
                    required
                    value={form.role_id}
                    onChange={e => setForm({ ...form, role_id: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Password {editId ? '(leave blank to keep)' : '*'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editId}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
                      placeholder={editId ? '••••••••' : 'Min 8 characters'}
                      minLength={editId ? 0 : 8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button type="submit" className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium transition-colors">
                  {editId ? 'Update' : 'Create User'}
                </button>
                <button type="button" onClick={resetForm} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
