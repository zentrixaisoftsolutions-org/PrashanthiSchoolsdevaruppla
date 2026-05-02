import React, { useEffect, useState, useCallback } from 'react';
import staffService, { StaffMember } from '../../services/staffService';
import departmentService, { Department } from '../../services/departmentService';
import staffSalaryService, { StaffSalaryResponse } from '../../services/staffSalaryService';
import {
  FiX, FiDollarSign, FiSave,
} from 'react-icons/fi';
import { FaMoneyBillWave } from 'react-icons/fa';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const StaffSalary: React.FC = () => {
  const now = new Date();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Salary state
  const [salaryMonth, setSalaryMonth] = useState(now.getMonth() + 1);
  const [salaryYear, setSalaryYear] = useState(now.getFullYear());
  const [workingDays, setWorkingDays] = useState(26);
  const [salaryResult, setSalaryResult] = useState<StaffSalaryResponse | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState('');
  const [salarySuccess, setSalarySuccess] = useState('');
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryFilterDept, setSalaryFilterDept] = useState<number | undefined>(undefined);
  const [showSaved, setShowSaved] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [deptData, staffData] = await Promise.all([
        departmentService.list(),
        staffService.list({ include_inactive: false }),
      ]);
      setDepartments(deptData);
      setStaff(staffData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCalculate = async () => {
    setSalaryError(''); setSalarySuccess(''); setSalaryLoading(true);
    try {
      if (showSaved) {
        const data = await staffSalaryService.getRecords(salaryMonth, salaryYear, salaryFilterDept);
        setSalaryResult(data);
      } else {
        const data = await staffSalaryService.calculate({ month: salaryMonth, year: salaryYear, total_working_days: workingDays });
        if (salaryFilterDept) {
          const filtered = data.staff_salaries.filter(s => {
            const staffObj = staff.find(st => st.id === s.staff_id);
            return staffObj?.department_id === salaryFilterDept;
          });
          const tb = filtered.reduce((a, b) => a + b.base_salary, 0);
          const td = filtered.reduce((a, b) => a + b.deduction, 0);
          const tn = filtered.reduce((a, b) => a + b.net_salary, 0);
          setSalaryResult({
            ...data,
            staff_salaries: filtered,
            summary: { total_base: Math.round(tb * 100) / 100, total_deduction: Math.round(td * 100) / 100, total_net: Math.round(tn * 100) / 100 },
          });
        } else {
          setSalaryResult(data);
        }
      }
    } catch (err: any) {
      setSalaryError(err.response?.data?.detail || 'Failed to calculate salary');
      setSalaryResult(null);
    } finally {
      setSalaryLoading(false);
    }
  };

  const handleSave = async () => {
    setSalarySaving(true); setSalaryError(''); setSalarySuccess('');
    try {
      const res = await staffSalaryService.save({ month: salaryMonth, year: salaryYear, total_working_days: workingDays });
      setSalarySuccess(res.message);
    } catch (err: any) {
      setSalaryError(err.response?.data?.detail || 'Failed to save salary');
    } finally {
      setSalarySaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <FaMoneyBillWave className="text-green-600" />
          Staff Salary
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Calculate and manage staff salary based on attendance
        </p>
      </div>

      {/* Alerts */}
      {salaryError && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 rounded flex justify-between items-center">
          <span className="text-red-700 dark:text-red-300 text-sm">{salaryError}</span>
          <button onClick={() => setSalaryError('')}><FiX size={16} className="text-red-500" /></button>
        </div>
      )}
      {salarySuccess && (
        <div className="mb-4 bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-500 p-3 rounded flex justify-between items-center">
          <span className="text-emerald-700 dark:text-emerald-300 text-sm">{salarySuccess}</span>
          <button onClick={() => setSalarySuccess('')}><FiX size={16} className="text-emerald-500" /></button>
        </div>
      )}

      {/* Salary Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
          <FiDollarSign className="text-indigo-600" />
          Salary Calculation
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Salary is calculated based on staff attendance. If absent more than 1 day, per-day salary is deducted for each extra absent day. Half-days count as 0.5 day deduction.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Month</label>
            <select
              value={salaryMonth}
              onChange={e => setSalaryMonth(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Year</label>
            <select
              value={salaryYear}
              onChange={e => setSalaryYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total Working Days</label>
            <input
              type="number"
              min={1}
              max={31}
              value={workingDays}
              onChange={e => setWorkingDays(Math.max(1, Math.min(31, Number(e.target.value))))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label>
            <select
              value={salaryFilterDept ?? ''}
              onChange={e => setSalaryFilterDept(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleCalculate}
              disabled={salaryLoading}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {salaryLoading ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Calculating...</>
              ) : (
                <><FiDollarSign size={16} /> {showSaved ? 'Load Saved' : 'Calculate'}</>
              )}
            </button>
          </div>
        </div>

        {/* Toggle: Calculate vs Saved */}
        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showSaved}
              onChange={e => { setShowSaved(e.target.checked); setSalaryResult(null); }}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            View saved salary records
          </label>
        </div>
      </div>

      {/* Salary Results */}
      {salaryResult && salaryResult.staff_salaries.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-sm">
              <p className="text-xs font-medium text-blue-100">Total Base Salary</p>
              <p className="text-2xl font-bold mt-1">₹{salaryResult.summary.total_base.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white shadow-sm">
              <p className="text-xs font-medium text-red-100">Total Deductions</p>
              <p className="text-2xl font-bold mt-1">₹{salaryResult.summary.total_deduction.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-sm">
              <p className="text-xs font-medium text-emerald-100">Total Net Salary</p>
              <p className="text-2xl font-bold mt-1">₹{salaryResult.summary.total_net.toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Salary Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Staff Name</th>
                  <th className="px-4 py-3 text-left">Employee ID</th>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-center">Present</th>
                  <th className="px-4 py-3 text-center">Absent</th>
                  <th className="px-4 py-3 text-center">Late</th>
                  <th className="px-4 py-3 text-center">Half Day</th>
                  <th className="px-4 py-3 text-center">Leave</th>
                  <th className="px-4 py-3 text-right">Base Salary</th>
                  <th className="px-4 py-3 text-right">Deduction</th>
                  <th className="px-4 py-3 text-right">Net Salary</th>
                  <th className="px-4 py-3 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {salaryResult.staff_salaries.map((s, idx) => (
                  <tr key={s.staff_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">
                      {s.staff_name}
                      {s.designation && <span className="block text-xs text-gray-400">{s.designation}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.employee_id || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{s.department_name || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold">{s.days_present}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold ${s.days_absent > 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{s.days_absent}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-semibold">{s.days_late}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-semibold">{s.days_half_day}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-semibold">{s.days_leave}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">₹{s.base_salary.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={s.deduction > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}>
                        {s.deduction > 0 ? `-₹${s.deduction.toLocaleString('en-IN')}` : '₹0'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700 dark:text-emerald-400 font-bold">₹{s.net_salary.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={s.remarks || ''}>{s.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {salaryResult.staff_salaries.length} staff member(s) &bull; {MONTHS[salaryResult.month - 1]} {salaryResult.year} &bull; {salaryResult.total_working_days} working days
            </p>
            {!showSaved && (
              <button
                onClick={handleSave}
                disabled={salarySaving}
                className="px-5 py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {salarySaving ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Saving...</>
                ) : (
                  <><FiSave size={16} /> Save Salary Records</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* No results */}
      {salaryResult && salaryResult.staff_salaries.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center mb-6">
          <FaMoneyBillWave className="mx-auto text-4xl text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {showSaved ? 'No saved salary records found for this period.' : 'No salary data to show. Make sure staff have their salary set.'}
          </p>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Salary Calculation Rules</h3>
        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>Per-day salary = Base Salary &divide; Total Working Days</li>
          <li>1 absent day is allowed without deduction</li>
          <li>Absent days beyond 1 are deducted at per-day rate</li>
          <li>Each half-day counts as 0.5 day deduction</li>
          <li>Days with no attendance record are counted as absent</li>
          <li>Late arrivals are shown but not deducted (only flagged)</li>
          <li>Leave days are shown but not deducted</li>
        </ul>
      </div>
    </div>
  );
};

export default StaffSalary;
