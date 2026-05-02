import React, { useState, useEffect } from 'react';
import roleAccessService, {
  UserListItem,
  MenuStructureItem,
  MenuAccessItem,
} from '../../services/roleAccessService';
import { FaUserShield, FaCheck, FaTimes, FaUndo, FaSave, FaSearch } from 'react-icons/fa';

const RoleAccess: React.FC = () => {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [menuStructure, setMenuStructure] = useState<MenuStructureItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [accessMap, setAccessMap] = useState<Record<string, boolean>>({});
  const [hasCustomAccess, setHasCustomAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [usersData, menuData] = await Promise.all([
        roleAccessService.getUsers(),
        roleAccessService.getMenuStructure(),
      ]);
      setUsers(usersData);
      setMenuStructure(menuData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const selectUser = async (user: UserListItem) => {
    try {
      setAccessLoading(true);
      setSelectedUser(user);
      setError('');
      setSuccess('');
      setDirty(false);
      const data = await roleAccessService.getUserAccess(user.id);
      setHasCustomAccess(data.has_custom_access);
      const map: Record<string, boolean> = {};
      data.access.forEach((item) => {
        map[item.menu_path] = item.is_allowed;
      });
      setAccessMap(map);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load user access');
    } finally {
      setAccessLoading(false);
    }
  };

  const toggleAccess = (path: string) => {
    setAccessMap((prev) => ({ ...prev, [path]: !prev[path] }));
    setDirty(true);
    setSuccess('');
  };

  const toggleGroup = (parent: string, checked: boolean) => {
    const groupPaths = menuStructure
      .filter((m) => m.parent === parent)
      .map((m) => m.path);
    setAccessMap((prev) => {
      const updated = { ...prev };
      groupPaths.forEach((p) => (updated[p] = checked));
      return updated;
    });
    setDirty(true);
    setSuccess('');
  };

  const selectAll = () => {
    const updated: Record<string, boolean> = {};
    menuStructure.forEach((m) => (updated[m.path] = true));
    setAccessMap(updated);
    setDirty(true);
    setSuccess('');
  };

  const deselectAll = () => {
    const updated: Record<string, boolean> = {};
    menuStructure.forEach((m) => (updated[m.path] = false));
    setAccessMap(updated);
    setDirty(true);
    setSuccess('');
  };

  const saveAccess = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      setError('');
      const access: MenuAccessItem[] = Object.entries(accessMap).map(([path, allowed]) => ({
        menu_path: path,
        is_allowed: allowed,
      }));
      await roleAccessService.updateUserAccess(selectedUser.id, access);
      setSuccess('Menu access saved successfully!');
      setDirty(false);
      setHasCustomAccess(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save access');
    } finally {
      setSaving(false);
    }
  };

  const resetAccess = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      setError('');
      await roleAccessService.resetUserAccess(selectedUser.id);
      // Reload access (all allowed now)
      const map: Record<string, boolean> = {};
      menuStructure.forEach((m) => (map[m.path] = true));
      setAccessMap(map);
      setHasCustomAccess(false);
      setDirty(false);
      setSuccess('Access reset to role defaults');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset access');
    } finally {
      setSaving(false);
    }
  };

  // Group menu items by parent
  const groupedMenus = menuStructure.reduce<Record<string, MenuStructureItem[]>>((acc, item) => {
    const key = item.parent || 'Main';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const isGroupAllChecked = (parent: string) => {
    const items = menuStructure.filter((m) => m.parent === parent);
    return items.length > 0 && items.every((m) => accessMap[m.path]);
  };

  const isGroupPartial = (parent: string) => {
    const items = menuStructure.filter((m) => m.parent === parent);
    const checked = items.filter((m) => accessMap[m.path]).length;
    return checked > 0 && checked < items.length;
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      teacher: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      student: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
      parent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      teacher: 'Teacher',
      student: 'Student',
      parent: 'Parent',
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors[role] || 'bg-gray-100 text-gray-700'}`}>
        {labels[role] || role}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
            <FaUserShield className="text-indigo-600 dark:text-indigo-400 text-lg" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Role Access Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure menu access per user</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg flex justify-between items-center">
          <span className="flex items-center gap-2"><FaCheck /> {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List Panel */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Select User</h2>
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {filteredUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => selectUser(user)}
                className={`w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors ${
                  selectedUser?.id === user.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.full_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>
                  {getRoleBadge(user.role)}
                </div>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">No users found</div>
            )}
          </div>
        </div>

        {/* Access Configuration Panel */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
              <FaUserShield className="text-4xl mb-3 opacity-50" />
              <p className="text-lg font-medium">Select a user</p>
              <p className="text-sm">Choose a user from the list to configure their menu access</p>
            </div>
          ) : accessLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {/* User Info Header */}
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                      {selectedUser.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{selectedUser.full_name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{selectedUser.email} · {getRoleBadge(selectedUser.role)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasCustomAccess && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
                        Custom Access
                      </span>
                    )}
                    {dirty && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-full font-medium animate-pulse">
                        Unsaved Changes
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                <button
                  onClick={selectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <FaCheck className="text-[10px]" /> Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <FaTimes className="text-[10px]" /> Deselect All
                </button>
                {hasCustomAccess && (
                  <button
                    onClick={resetAccess}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    <FaUndo className="text-[10px]" /> Reset to Defaults
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={saveAccess}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <FaSave className="text-[10px]" /> Save Access
                    </>
                  )}
                </button>
              </div>

              {/* Menu Checkboxes */}
              <div className="px-5 py-4 max-h-[calc(100vh-420px)] overflow-y-auto space-y-4">
                {Object.entries(groupedMenus).map(([group, items]) => {
                  const allChecked = group !== 'Main' && isGroupAllChecked(group);
                  const partial = group !== 'Main' && isGroupPartial(group);

                  return (
                    <div
                      key={group}
                      className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                    >
                      {/* Group Header */}
                      <div className="bg-gray-50 dark:bg-gray-750 px-4 py-2.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                          {group !== 'Main' && (
                            <label className="relative flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = partial;
                                }}
                                onChange={(e) => toggleGroup(group, e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                allChecked
                                  ? 'bg-indigo-600 border-indigo-600'
                                  : partial
                                  ? 'bg-indigo-300 border-indigo-400'
                                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500'
                              }`}>
                                {(allChecked || partial) && (
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    {allChecked ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    ) : (
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                                    )}
                                  </svg>
                                )}
                              </div>
                            </label>
                          )}
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group}</span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {items.filter((m) => accessMap[m.path]).length}/{items.length} enabled
                        </span>
                      </div>

                      {/* Menu Items */}
                      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {items.map((menu) => (
                          <label
                            key={menu.path}
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={!!accessMap[menu.path]}
                                  onChange={() => toggleAccess(menu.path)}
                                  className="sr-only peer"
                                />
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                  accessMap[menu.path]
                                    ? 'bg-indigo-600 border-indigo-600'
                                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500'
                                }`}>
                                  {accessMap[menu.path] && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{menu.label}</span>
                                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-mono">{menu.path}</span>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                accessMap[menu.path]
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}
                            >
                              {accessMap[menu.path] ? 'Allowed' : 'Blocked'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleAccess;
