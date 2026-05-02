import React, { useEffect, useState, useCallback, useRef } from 'react';
import staffService, { StaffMember, StaffCreateRequest } from '../../services/staffService';
import departmentService, { Department } from '../../services/departmentService';
import classSectionService, { ClassSection } from '../../services/classSectionService';
import subjectService, { Subject } from '../../services/subjectService';
import {
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiUser, FiPhone,
  FiMail, FiCalendar, FiMapPin, FiChevronDown, FiAlertTriangle,
  FiBook, FiGrid, FiEye, FiCamera,
} from 'react-icons/fi';
import { FaIdBadge, FaUserTie, FaUsers, FaBuilding } from 'react-icons/fa';

type TabType = 'list' | 'add';

const emptyForm: StaffCreateRequest = {
  first_name: '',
  last_name: '',
  father_name: '',
  gender: 'Male',
  date_of_birth: '',
  mobile: '',
  email: '',
  aadhar_number: '',
  address: '',
  qualification: '',
  designation: '',
  department_id: undefined,
  date_of_joining: '',
  salary: undefined,
  rfid: '',
  employee_id: '',
  class_section_ids: [],
  subject_ids: [],
  class_teacher_of_ids: [],
};

const StaffPage: React.FC = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDeptId, setFilterDeptId] = useState<number | undefined>(undefined);
  const [formData, setFormData] = useState<StaffCreateRequest>({ ...emptyForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [permDeleteConfirm, setPermDeleteConfirm] = useState<number | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewStaff, setViewStaff] = useState<StaffMember | null>(null);

  // Camera capture
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setShowCamera(true);
    } catch {
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    setPhotoPreview(base64);
    handleFormChange('photo_data', base64);
    stopCamera();
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [staffData, deptData, csData, subData] = await Promise.all([
        staffService.list({ department_id: filterDeptId, include_inactive: true }),
        departmentService.list(),
        classSectionService.listClassSections(),
        subjectService.listSubjects(),
      ]);
      setStaff(staffData);
      setDepartments(deptData);
      setClassSections(csData);
      setSubjects(subData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [filterDeptId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clearAlerts = () => { setError(''); setSuccess(''); };

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo size must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      handleFormChange('photo_data', base64);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name.trim()) {
      setError('First name is required');
      return;
    }
    clearAlerts();
    setSubmitting(true);
    try {
      const payload = { ...formData };
      // Clean optional empty strings
      if (!payload.last_name) delete payload.last_name;
      if (!payload.rfid) delete payload.rfid;
      if (!payload.employee_id) delete payload.employee_id;
      if (!payload.email) delete payload.email;
      if (!payload.date_of_birth) delete payload.date_of_birth;
      if (!payload.date_of_joining) delete payload.date_of_joining;
      if (!payload.department_id) delete payload.department_id;
      if (payload.salary === null || payload.salary === undefined) delete payload.salary;

      if (editingId) {
        await staffService.update(editingId, payload);
        setSuccess('Staff member updated successfully');
      } else {
        await staffService.create(payload);
        setSuccess('Staff member added successfully');
      }
      resetForm();
      setActiveTab('list');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
    setTimeout(() => setSuccess(''), 4000);
  };

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setEditingId(null);
    setPhotoPreview(null);
    stopCamera();
  };

  const handleEdit = (s: StaffMember) => {
    setFormData({
      first_name: s.first_name,
      last_name: s.last_name || '',
      father_name: s.father_name || '',
      gender: s.gender || 'Male',
      date_of_birth: s.date_of_birth || '',
      mobile: s.mobile || '',
      email: s.email || '',
      aadhar_number: s.aadhar_number || '',
      address: s.address || '',
      qualification: s.qualification || '',
      designation: s.designation || '',
      department_id: s.department_id || undefined,
      date_of_joining: s.date_of_joining || '',
      salary: s.salary || undefined,
      rfid: s.rfid || '',
      employee_id: s.employee_id || '',
      class_section_ids: s.class_section_ids || [],
      subject_ids: s.subject_ids || [],
      class_teacher_of_ids: s.class_teacher_of_ids || [],
    });
    setEditingId(s.id);
    setPhotoPreview(s.photo_data || null);
    setActiveTab('add');
    clearAlerts();
  };

  const handleDelete = async (id: number) => {
    try {
      await staffService.delete(id);
      setSuccess('Staff member deactivated');
      setDeleteConfirm(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Delete failed');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handlePermanentDelete = async (id: number) => {
    try {
      await staffService.permanentDelete(id);
      setSuccess('Staff member permanently deleted');
      setPermDeleteConfirm(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Delete failed');
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const filtered = staff.filter(s => {
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return (
      s.first_name.toLowerCase().includes(q) ||
      (s.last_name || '').toLowerCase().includes(q) ||
      (s.rfid || '').toLowerCase().includes(q) ||
      (s.mobile || '').includes(q) ||
      (s.employee_id || '').toLowerCase().includes(q) ||
      (s.department_name || '').toLowerCase().includes(q)
    );
  });

  const deptName = (id?: number | null) => departments.find(d => d.id === id)?.name || '—';

  // ─── Stats Cards ─────────────────────────────
  const totalStaff = staff.filter(s => s.is_active).length;
  const totalMale = staff.filter(s => s.is_active && s.gender === 'Male').length;
  const totalFemale = staff.filter(s => s.is_active && s.gender === 'Female').length;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <FaUserTie className="text-indigo-600" />
            Staff Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage teaching &amp; non-teaching staff
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveTab('list'); resetForm(); }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            <FaUsers className="inline mr-1.5 -mt-0.5" /> Staff List
          </button>
          <button
            onClick={() => { setActiveTab('add'); resetForm(); }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              activeTab === 'add'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
            }`}
          >
            <FiPlus className="inline mr-1.5 -mt-0.5" /> Add Staff
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 rounded flex justify-between items-center">
          <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          <button onClick={() => setError('')}><FiX size={16} className="text-red-500" /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-500 p-3 rounded">
          <span className="text-emerald-700 dark:text-emerald-300 text-sm">{success}</span>
        </div>
      )}

      {/* ═══════ STAFF LIST TAB ═══════ */}
      {activeTab === 'list' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-xs font-medium uppercase tracking-wide">Total Staff</p>
                  <p className="text-3xl font-bold mt-1">{totalStaff}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3"><FaUsers size={24} /></div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Male</p>
                  <p className="text-3xl font-bold mt-1">{totalMale}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3"><FiUser size={24} /></div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl p-4 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-pink-100 text-xs font-medium uppercase tracking-wide">Female</p>
                  <p className="text-3xl font-bold mt-1">{totalFemale}</p>
                </div>
                <div className="bg-white/20 rounded-xl p-3"><FiUser size={24} /></div>
              </div>
            </div>
          </div>

          {/* Filters & List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name, RFID, mobile..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-64 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div className="relative">
                  <select
                    value={filterDeptId || ''}
                    onChange={e => setFilterDeptId(e.target.value ? Number(e.target.value) : undefined)}
                    className="pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none"
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <FaUserTie className="mx-auto text-4xl mb-3 opacity-30" />
                  <p>{searchTerm || filterDeptId ? 'No matching staff found' : 'No staff yet. Add a staff member to get started!'}</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 w-12">#</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">RFID</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Department</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Name</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Father Name</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Gender</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Mobile</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filtered.map((s, i) => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">
                          {s.rfid || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium">
                            <FaBuilding size={10} /> {s.department_name || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">
                          {s.first_name} {s.last_name || ''}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.father_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.gender || '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.mobile || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.is_active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                          }`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewStaff(s)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <FiEye size={15} />
                            </button>
                            <button
                              onClick={() => handleEdit(s)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <FiEdit2 size={15} />
                            </button>

                            {deleteConfirm === s.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handleDelete(s.id)} className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600">Yes</button>
                                <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white rounded">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(s.id)}
                                className="p-1.5 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                title="Deactivate"
                              >
                                <FiTrash2 size={15} />
                              </button>
                            )}

                            {permDeleteConfirm === s.id ? (
                              <div className="flex gap-1">
                                <button onClick={() => handlePermanentDelete(s.id)} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Confirm</button>
                                <button onClick={() => setPermDeleteConfirm(null)} className="px-2 py-1 text-xs bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white rounded">No</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setPermDeleteConfirm(s.id)}
                                className="px-2 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 rounded hover:bg-red-200 font-medium"
                                title="Permanently delete"
                              >
                                Permanent
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
          </div>
        </>
      )}

      {/* ═══════ VIEW STAFF MODAL ═══════ */}
      {viewStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewStaff(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FaUserTie /> Staff Details
              </h2>
              <button onClick={() => setViewStaff(null)} className="text-white/80 hover:text-white transition-colors">
                <FiX size={22} />
              </button>
            </div>

            <div className="p-6">
              {/* Top: Photo + Basic Info */}
              <div className="flex flex-col sm:flex-row gap-6 mb-6">
                {/* Photo */}
                <div className="flex-shrink-0">
                  <div className="w-36 h-36 rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden border-2 border-indigo-200 dark:border-indigo-700 flex items-center justify-center shadow-sm">
                    {viewStaff.photo_data ? (
                      <img src={viewStaff.photo_data} alt="Staff" className="w-full h-full object-cover" />
                    ) : (
                      <FiUser size={50} className="text-gray-300 dark:text-gray-500" />
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      viewStaff.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}>
                      {viewStaff.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Name & Key Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                    {viewStaff.first_name} {viewStaff.last_name || ''}
                  </h3>
                  {viewStaff.designation && (
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{viewStaff.designation}</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {viewStaff.employee_id && (
                      <div><span className="text-gray-400 dark:text-gray-500">Employee ID:</span> <span className="text-gray-800 dark:text-gray-200 font-medium">{viewStaff.employee_id}</span></div>
                    )}
                    {viewStaff.rfid && (
                      <div><span className="text-gray-400 dark:text-gray-500">RFID:</span> <span className="text-gray-800 dark:text-gray-200 font-mono">{viewStaff.rfid}</span></div>
                    )}
                    {viewStaff.department_name && (
                      <div><span className="text-gray-400 dark:text-gray-500">Department:</span> <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium"><FaBuilding size={10} /> {viewStaff.department_name}</span></div>
                    )}
                    {viewStaff.gender && (
                      <div><span className="text-gray-400 dark:text-gray-500">Gender:</span> <span className="text-gray-800 dark:text-gray-200">{viewStaff.gender}</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal Details Grid */}
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 mb-5">
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Personal Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {[{l:'Father\'s Name',v:viewStaff.father_name},{l:'Mobile',v:viewStaff.mobile},{l:'Email',v:viewStaff.email},{l:'Aadhar',v:viewStaff.aadhar_number},{l:'Date of Birth',v:viewStaff.date_of_birth},{l:'Date of Joining',v:viewStaff.date_of_joining},{l:'Qualification',v:viewStaff.qualification},{l:'Salary',v:viewStaff.salary ? `₹${Number(viewStaff.salary).toLocaleString('en-IN')}` : null},{l:'Address',v:viewStaff.address}].map((item,idx) => (
                    <div key={idx}>
                      <p className="text-gray-400 dark:text-gray-500 text-xs">{item.l}</p>
                      <p className="text-gray-800 dark:text-gray-200 font-medium truncate">{item.v || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Class/Section Mapping */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                  <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FiGrid size={13} /> Assigned Classes &amp; Sections
                  </h4>
                  {viewStaff.class_sections && viewStaff.class_sections.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {viewStaff.class_sections.map((cs, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 text-xs font-medium shadow-sm border border-blue-100 dark:border-blue-700">
                          {cs.class_name} — {cs.section_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-blue-400 dark:text-blue-500 italic">No classes assigned</p>
                  )}
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800">
                  <h4 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FiBook size={13} /> Assigned Subjects
                  </h4>
                  {viewStaff.subjects && viewStaff.subjects.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {viewStaff.subjects.map((sub, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 text-xs font-medium shadow-sm border border-purple-100 dark:border-purple-700">
                          {sub.name} <span className="text-purple-400 dark:text-purple-500">({sub.code})</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-purple-400 dark:text-purple-500 italic">No subjects assigned</p>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => { setViewStaff(null); handleEdit(viewStaff); }}
                  className="px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors"
                >
                  <FiEdit2 className="inline mr-1.5 -mt-0.5" size={14} /> Edit
                </button>
                <button
                  onClick={() => setViewStaff(null)}
                  className="px-5 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ ADD / EDIT STAFF TAB ═══════ */}
      {activeTab === 'add' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <FaIdBadge className="text-indigo-600" />
              {editingId ? 'Edit Staff Member' : 'Add New Staff Member'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* ── Left Column: Personal Info ── */}
              <div className="lg:col-span-2 space-y-6">
                {/* Row 1: Names */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={e => handleFormChange('first_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={formData.last_name || ''}
                      onChange={e => handleFormChange('last_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Father's Name</label>
                    <input
                      type="text"
                      value={formData.father_name || ''}
                      onChange={e => handleFormChange('father_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Row 2: Department, Designation, Gender */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
                    <div className="relative">
                      <select
                        value={formData.department_id || ''}
                        onChange={e => handleFormChange('department_id', e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none"
                      >
                        <option value="">— Select Department —</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Designation</label>
                    <input
                      type="text"
                      value={formData.designation || ''}
                      onChange={e => handleFormChange('designation', e.target.value)}
                      placeholder="e.g., Teacher, HOD"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                    <div className="flex gap-4 mt-2">
                      {['Male', 'Female', 'Other'].map(g => (
                        <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="gender"
                            value={g}
                            checked={formData.gender === g}
                            onChange={e => handleFormChange('gender', e.target.value)}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{g}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 3: Mobile, Email, Aadhar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <FiPhone className="inline -mt-0.5 mr-1" size={13} />Mobile
                    </label>
                    <input
                      type="text"
                      value={formData.mobile || ''}
                      onChange={e => handleFormChange('mobile', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <FiMail className="inline -mt-0.5 mr-1" size={13} />Email
                    </label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={e => handleFormChange('email', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aadhar Number</label>
                    <input
                      type="text"
                      value={formData.aadhar_number || ''}
                      onChange={e => handleFormChange('aadhar_number', e.target.value)}
                      maxLength={12}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Row 4: DOB, DOJ, Qualification */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <FiCalendar className="inline -mt-0.5 mr-1" size={13} />Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.date_of_birth || ''}
                      onChange={e => handleFormChange('date_of_birth', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <FiCalendar className="inline -mt-0.5 mr-1" size={13} />Date of Joining
                    </label>
                    <input
                      type="date"
                      value={formData.date_of_joining || ''}
                      onChange={e => handleFormChange('date_of_joining', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qualification</label>
                    <input
                      type="text"
                      value={formData.qualification || ''}
                      onChange={e => handleFormChange('qualification', e.target.value)}
                      placeholder="e.g., M.Ed, B.Tech"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Row 5: RFID, Employee ID, Salary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">RFID</label>
                    <input
                      type="text"
                      value={formData.rfid || ''}
                      onChange={e => handleFormChange('rfid', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee ID</label>
                    <input
                      type="text"
                      value={formData.employee_id || ''}
                      onChange={e => handleFormChange('employee_id', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Salary (₹)</label>
                    <input
                      type="number"
                      value={formData.salary || ''}
                      onChange={e => handleFormChange('salary', e.target.value ? Number(e.target.value) : undefined)}
                      min={0}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Row 6: Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <FiMapPin className="inline -mt-0.5 mr-1" size={13} />Address
                  </label>
                  <textarea
                    value={formData.address || ''}
                    onChange={e => handleFormChange('address', e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* ── Class/Section & Subject Assignment ── */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                    <FiGrid className="text-indigo-500" size={16} />
                    Class / Section &amp; Subject Assignment
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Class-Section multi-select */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Assigned Classes &amp; Sections
                      </label>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg max-h-44 overflow-y-auto bg-white dark:bg-gray-700">
                        {classSections.length === 0 ? (
                          <p className="p-3 text-xs text-gray-400">No class-sections available</p>
                        ) : (
                          classSections.map(cs => {
                            const checked = (formData.class_section_ids || []).includes(cs.id);
                            return (
                              <label
                                key={cs.id}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-sm ${
                                  checked ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const current = formData.class_section_ids || [];
                                    const next = checked
                                      ? current.filter(id => id !== cs.id)
                                      : [...current, cs.id];
                                    handleFormChange('class_section_ids', next);
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-gray-800 dark:text-gray-200">
                                  {cs.class_name} — {cs.section_name}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      {(formData.class_section_ids || []).length > 0 && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                          {(formData.class_section_ids || []).length} selected
                        </p>
                      )}
                    </div>

                    {/* Subject multi-select */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <FiBook className="inline -mt-0.5 mr-1" size={13} />
                        Assigned Subjects
                      </label>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg max-h-44 overflow-y-auto bg-white dark:bg-gray-700">
                        {subjects.length === 0 ? (
                          <p className="p-3 text-xs text-gray-400">No subjects available</p>
                        ) : (
                          subjects.map(sub => {
                            const checked = (formData.subject_ids || []).includes(sub.id);
                            return (
                              <label
                                key={sub.id}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-sm ${
                                  checked ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const current = formData.subject_ids || [];
                                    const next = checked
                                      ? current.filter(id => id !== sub.id)
                                      : [...current, sub.id];
                                    handleFormChange('subject_ids', next);
                                  }}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-gray-800 dark:text-gray-200">
                                  {sub.name}
                                  <span className="text-gray-400 ml-1 text-xs">({sub.code})</span>
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      {(formData.subject_ids || []).length > 0 && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                          {(formData.subject_ids || []).length} selected
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Class Teacher Assignment ── */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-1">
                    <FaUserTie className="text-amber-500" size={15} />
                    Class Teacher Assignment
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Select the class(es) and section(s) where this staff is the <strong>main class teacher</strong>. Only one class teacher per section is allowed.
                  </p>
                  <div className="border border-amber-200 dark:border-amber-700 rounded-lg max-h-44 overflow-y-auto bg-white dark:bg-gray-700">
                    {classSections.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400">No class-sections available</p>
                    ) : (
                      classSections.map(cs => {
                        const checked = (formData.class_teacher_of_ids || []).includes(cs.id);
                        return (
                          <label
                            key={cs.id}
                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-sm ${
                              checked ? 'bg-amber-50 dark:bg-amber-900/30' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const current = formData.class_teacher_of_ids || [];
                                const next = checked
                                  ? current.filter(id => id !== cs.id)
                                  : [...current, cs.id];
                                handleFormChange('class_teacher_of_ids', next);
                              }}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-gray-800 dark:text-gray-200">
                              {cs.class_name} — {cs.section_name}
                            </span>
                            {checked && (
                              <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">Class Teacher</span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                  {(formData.class_teacher_of_ids || []).length > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Class teacher of {(formData.class_teacher_of_ids || []).length} section(s)
                    </p>
                  )}
                </div>
              </div>

              {/* ── Right Column: Photo ── */}
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-5 border border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Staff Photo</h3>
                  <div className="flex flex-col items-center gap-3">
                    {/* Camera Preview */}
                    {showCamera ? (
                      <div className="w-full">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" style={{maxHeight:'220px',objectFit:'cover'}} />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="flex gap-2 mt-2 justify-center">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            <FiCamera size={14} /> Capture
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium transition-colors hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            <FiX size={14} /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-32 h-32 rounded-xl bg-gray-200 dark:bg-gray-600 overflow-hidden flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <FiUser size={40} className="text-gray-400 dark:text-gray-500" />
                          )}
                        </div>
                        <div className="flex gap-2">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                            <FiPlus size={14} /> Upload
                            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={startCamera}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                          >
                            <FiCamera size={14} /> Camera
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">Max 2MB, JPG/PNG</p>
                        {photoPreview && (
                          <button
                            type="button"
                            onClick={() => { setPhotoPreview(null); handleFormChange('photo_data', undefined); }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove Photo
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Quick Info Card */}
                {editingId && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <FiAlertTriangle size={16} />
                      <span className="text-sm font-medium">Editing Mode</span>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      You are editing an existing staff record. Changes will be saved when you click "Update".
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setActiveTab('list'); resetForm(); }}
                className="px-5 py-2.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? 'Saving...'
                  : editingId
                    ? 'Update Staff'
                    : 'Add Staff'
                }
              </button>
            </div>
          </form>
        </div>
      )}


    </div>
  );
};

export default StaffPage;
