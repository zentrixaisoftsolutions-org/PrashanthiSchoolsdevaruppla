import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import dashboardService, { DashboardStats, ClassTopperInfo, TopperExam } from '../../services/dashboardService';
import MobileLoginsCard from '../../components/MobileLoginsCard';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line
} from 'recharts';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [classToppers, setClassToppers] = useState<ClassTopperInfo[]>([]);
  const [topperExams, setTopperExams] = useState<TopperExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | undefined>(undefined);
  const [toppersLoading, setToppersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadDashboard = async () => {
    try {
      const [data, exams, toppers] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getTopperExams().catch(() => [] as TopperExam[]),
        dashboardService.getClassToppers().catch(() => [] as ClassTopperInfo[]),
      ]);
      setStats(data);
      setTopperExams(exams);
      setClassToppers(toppers);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExamChange = async (examId: number | undefined) => {
    setSelectedExamId(examId);
    setToppersLoading(true);
    try {
      const toppers = await dashboardService.getClassToppers(examId);
      setClassToppers(toppers);
    } catch {
      setClassToppers([]);
    } finally {
      setToppersLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-gray-50 min-h-screen animate-pulse">
        {/* Skeleton Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <div className="h-7 w-80 bg-gray-200 rounded-lg"></div>
            <div className="h-4 w-48 bg-gray-200 rounded mt-2"></div>
          </div>
        </div>

        {/* Skeleton Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl p-5 bg-gray-200 h-32"></div>
          ))}
        </div>

        {/* Skeleton Fee Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 h-20">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
                <div className="flex-1">
                  <div className="h-3 w-24 bg-gray-200 rounded mb-2"></div>
                  <div className="h-6 w-20 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 h-80">
            <div className="h-5 w-40 bg-gray-200 rounded mb-4"></div>
            <div className="flex items-center justify-center h-56">
              <div className="w-40 h-40 bg-gray-100 rounded-full"></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-gray-100 lg:col-span-2 h-80">
            <div className="h-5 w-56 bg-gray-200 rounded mb-4"></div>
            <div className="flex items-end gap-3 h-56 pb-4">
              {[60, 80, 45, 90, 70, 55, 85, 40, 75].map((h, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t" style={{ height: `${h}%` }}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">Failed to load dashboard data</p>
      </div>
    );
  }

  const attendancePieData = [
    { name: 'Present', value: stats.attendance.today.present, color: '#10B981' },
    { name: 'Absent', value: stats.attendance.today.absent, color: '#EF4444' },
  ].filter(d => d.value > 0);

  // If no attendance data at all, show full "Not Marked"
  if (attendancePieData.length === 0) {
    attendancePieData.push({ name: 'Not Marked', value: stats.students.total || 1, color: '#94A3B8' });
  }

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to <span className="text-indigo-600">SRI SAI PRASANTHI VIDYANIKETAN</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {stats.academics.academic_year && (
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                AY: {stats.academics.academic_year.name}
              </span>
            )}
          </p>
        </div>
        <div className="mt-3 md:mt-0 flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 shadow-sm text-gray-700">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            {(user as any)?.role === 'super_admin' ? 'Super Admin' : (user as any)?.role === 'admin' ? 'Admin' : (user as any)?.role || 'User'}
          </span>
          <button
            onClick={loadDashboard}
            className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600 transition-colors"
            title="Refresh Dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* ==================== STATS CARDS ROW ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Students Card */}
        <div onClick={() => navigate('/students')} className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/20 cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Students</p>
              <p className="text-3xl font-bold mt-1">{formatNumber(stats.students.total)}</p>
              <p className="text-blue-200 text-xs mt-2">
                {stats.students.new_this_month > 0 && `+${stats.students.new_this_month} this month`}
              </p>
            </div>
            <div className="bg-white/20 rounded-2xl p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
          <div className="absolute -top-4 -right-8 w-16 h-16 bg-white/5 rounded-full"></div>
        </div>

        {/* Teachers Card */}
        <div onClick={() => navigate('/staff/list')} className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20 cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium">Teachers</p>
              <p className="text-3xl font-bold mt-1">{formatNumber(stats.staff.teachers)}</p>
              <p className="text-emerald-200 text-xs mt-2">{stats.staff.total_staff} total staff</p>
            </div>
            <div className="bg-white/20 rounded-2xl p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
        </div>

        {/* Classes Card */}
        <div onClick={() => navigate('/settings/classes')} className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-500/20 cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-violet-100 text-sm font-medium">Classes</p>
              <p className="text-3xl font-bold mt-1">{formatNumber(stats.academics.class_sections)}</p>
              <p className="text-violet-200 text-xs mt-2">
                {stats.academics.classes} classes &middot; {stats.academics.sections} sections
              </p>
            </div>
            <div className="bg-white/20 rounded-2xl p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9v-2h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
        </div>

        {/* Subjects Card */}
        <div onClick={() => navigate('/examination/subjects')} className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/20 cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm font-medium">Subjects</p>
              <p className="text-3xl font-bold mt-1">{formatNumber(stats.academics.subjects)}</p>
              <p className="text-amber-200 text-xs mt-2">{stats.academics.exams} exams created</p>
            </div>
            <div className="bg-white/20 rounded-2xl p-3">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
              </svg>
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full"></div>
        </div>
      </div>

      {/* ==================== FEES ROW ==================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Fees Collected Today */}
        <div onClick={() => navigate('/fees/summary')} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 rounded-xl p-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Fees Collected Today</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.fees.collected_today)}</p>
            </div>
          </div>
        </div>

        {/* Total Fee Collected This Year */}
        <div onClick={() => navigate('/fees/summary')} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-xl p-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Collected This Year</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.fees.collected_this_year)}</p>
            </div>
          </div>
        </div>

        {/* Total Fee Pending */}
        <div onClick={() => navigate('/fees/summary')} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:scale-[1.02] transition-transform">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 rounded-xl p-3">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pending This Year</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.fees.pending_this_year)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CHARTS ROW (Attendance only) ==================== */}
      {(((user as any)?.role === 'super_admin') || ((user as any)?.role === 'admin') || ((user as any)?.role === 'principal')) && (
        <MobileLoginsCard totalTeachers={stats.staff.teachers} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Attendance Pie Chart */}
        <div onClick={() => navigate('/attendance/summary')} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">Today&apos;s Attendance</h3>
            <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
              stats.attendance.today.percentage >= 80
                ? 'bg-green-100 text-green-700'
                : stats.attendance.today.percentage >= 60
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {stats.attendance.today.percentage}%
            </span>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={attendancePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {attendancePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[
              { label: 'Present', value: stats.attendance.today.present, color: 'bg-green-500' },
              { label: 'Absent', value: stats.attendance.today.absent, color: 'bg-red-500' },
              { label: 'Late', value: stats.attendance.today.late, color: 'bg-yellow-500' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${item.color}`}></span>
                <span className="text-gray-500">{item.label}</span>
                <span className="font-semibold text-gray-900 ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Class Toppers — CGPA & Attendance (with exam dropdown) */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-lg">🏆</span> Class Toppers — CGPA &amp; Attendance
            </h3>
            {topperExams.length > 0 && (
              <select
                value={selectedExamId ?? ''}
                onChange={(e) => handleExamChange(e.target.value ? Number(e.target.value) : undefined)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              >
                <option value="">Latest Exam</option>
                {topperExams.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </select>
            )}
          </div>
          {toppersLoading ? (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              Loading...
            </div>
          ) : classToppers.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={classToppers}
                barSize={20}
                barGap={4}
              >
                <defs>
                  <linearGradient id="cgpaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis
                  dataKey="class_section"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 10]}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontSize: '12px' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const d = payload[0].payload as ClassTopperInfo;
                      return (
                        <div style={{ background: '#fff', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: '1px solid #f3f4f6' }}>
                          <p style={{ fontWeight: 700, fontSize: '13px', color: '#111827', marginBottom: '6px' }}>{d.class_section}</p>
                          <p style={{ fontSize: '12px', color: '#374151', marginBottom: '2px' }}>🥇 <strong>{d.student_name}</strong></p>
                          <p style={{ fontSize: '12px', color: '#ea580c', marginBottom: '2px' }}>CGPA: <strong>{d.cgpa ?? '-'}</strong> {d.cg ? `(${d.cg})` : ''}</p>
                          <p style={{ fontSize: '12px', color: '#0891b2' }}>Attendance: <strong>{d.attendance_percentage}%</strong></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                />
                <Bar dataKey="cgpa" name="CGPA" fill="url(#cgpaGrad)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="attendance_percentage" name="Attendance %" fill="url(#attGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
              No class topper data available
            </div>
          )}
        </div>
      </div>

      {/* ==================== CLASS DISTRIBUTION ROW ==================== */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Class-wise Student Distribution</h3>
        {stats.charts.class_wise_students.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[...stats.charts.class_wise_students].sort((a, b) => {
              const extractNum = (s: string) => { const m = s.match(/\d+/); return m ? parseInt(m[0]) : 0; };
              const numA = extractNum(a.class_name);
              const numB = extractNum(b.class_name);
              if (numA !== numB) return numA - numB;
              return a.class_name.localeCompare(b.class_name);
            })} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="class_name"
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '10px 14px' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload as { class_name: string; count: number; class_teachers: string[] };
                  return (
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '10px 14px', minWidth: 160 }}>
                      <p style={{ fontWeight: 700, marginBottom: 4, color: '#111827' }}>{d.class_name}</p>
                      <p style={{ color: '#6366F1', fontSize: 13 }}>{d.count} students</p>
                      {d.class_teachers && d.class_teachers.length > 0 && (
                        <div style={{ marginTop: 6, borderTop: '1px solid #F3F4F6', paddingTop: 6 }}>
                          <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 2, fontWeight: 600 }}>Class Teacher(s)</p>
                          {d.class_teachers.map((t, i) => (
                            <p key={i} style={{ fontSize: 12, color: '#D97706' }}>👩‍🏫 {t}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" fill="#6366F1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-gray-400">
            No class data available
          </div>
        )}
      </div>

      {/* ==================== BOTTOM ROW ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gender Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Gender Distribution</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.charts.gender_distribution.filter(g => g.value > 0)}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                  strokeWidth={0}
                >
                  {stats.charts.gender_distribution.filter(g => g.value > 0).map((entry, index) => (
                    <Cell key={`gender-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {stats.charts.gender_distribution.filter(g => g.value > 0).map(item => (
              <div key={item.label} className="text-center">
                <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Attendance Trend */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Weekly Attendance Trend</h3>
          {stats.attendance.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={stats.attendance.trend.map((d: any) => {
                  const total = d.total || ((d.present || 0) + (d.absent || 0)) || 1;
                  const presentOnly = Math.max(0, (d.present || 0) - (d.late || 0));
                  return {
                    ...d,
                    presentOnly,
                    pct: Math.round(((d.present || 0) / total) * 100),
                  };
                })}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Students', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#6B7280' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: '#0EA5E9' }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: any) => {
                    if (name === 'Attendance %') return [`${value}%`, name];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="presentOnly" name="Present" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="late" name="Late" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="left" dataKey="absent" name="Absent" stackId="a" fill="#EF4444" radius={[6, 6, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pct"
                  name="Attendance %"
                  stroke="#0EA5E9"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#0EA5E9' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">
              No attendance data for this week
            </div>
          )}
        </div>

        {/* Recent Admissions & Quick Actions */}
        <div className="space-y-6">
          {/* Recent Admissions */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Recent Admissions</h3>
            <div className="space-y-3">
              {stats.recent_students.length > 0 ? (
                stats.recent_students.map(student => (
                  <div key={student.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                      {student.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.admission_number}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">No recent admissions</p>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/students', icon: '🎓', label: 'Students', bg: 'bg-blue-50 hover:bg-blue-100' },
                { href: '/attendance/daily', icon: '📋', label: 'Attendance', bg: 'bg-green-50 hover:bg-green-100' },
                { href: '/examination/marks-entry', icon: '✏️', label: 'Marks', bg: 'bg-purple-50 hover:bg-purple-100' },
                { href: '/examination/results', icon: '📊', label: 'Results', bg: 'bg-orange-50 hover:bg-orange-100' }
              ].map(action => (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className={`flex flex-col items-center p-3 rounded-xl transition-colors ${action.bg}`}
                >
                  <span className="text-xl mb-1">{action.icon}</span>
                  <span className="text-xs font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
