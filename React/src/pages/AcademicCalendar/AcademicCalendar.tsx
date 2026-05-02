import React, { useEffect, useState } from 'react';
import academicCalendarService, {
  AcademicCalendarEntry, AcademicCalendarBulkCreate, CalendarSummary, HolidayCreate,
} from '../../services/academicCalendarService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classSectionService, { ClassWithSections } from '../../services/classSectionService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const AcademicCalendarPage: React.FC = () => {
  // Data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassWithSections[]>([]);
  const [entries, setEntries] = useState<AcademicCalendarEntry[]>([]);
  const [summaries, setSummaries] = useState<CalendarSummary[]>([]);

  // Filters
  const [selectedYearId, setSelectedYearId] = useState<number>(0);
  const [filterClassId, setFilterClassId] = useState<number>(0);

  // Bulk form
  const [bulkClassIds, setBulkClassIds] = useState<number[]>([]);
  const [bulkMonths, setBulkMonths] = useState<number[]>([]);
  const [bulkYear, setBulkYear] = useState<number>(new Date().getFullYear());
  const [bulkWorkingDays, setBulkWorkingDays] = useState<number>(26);

  // Holiday form
  const [holidayEntryId, setHolidayEntryId] = useState<number | null>(null);
  const [holidayForm, setHolidayForm] = useState<HolidayCreate>({ holiday_date: '', name: '', remarks: '' });

  // Bulk holiday form
  const [bulkHolidayForm, setBulkHolidayForm] = useState<HolidayCreate>({ holiday_date: '', name: '', remarks: '' });
  const [bulkHolidayClassIds, setBulkHolidayClassIds] = useState<number[]>([]);

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWorkingDays, setEditWorkingDays] = useState<number>(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'summary' | 'bulk' | 'entries'>('summary');
  const [expandedClass, setExpandedClass] = useState<number | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedYearId) {
      fetchData();
    }
  }, [selectedYearId, filterClassId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [yrs, cls] = await Promise.all([
        academicYearService.listAcademicYears(),
        classSectionService.listClassesWithSections(),
      ]);
      setAcademicYears(yrs);
      setClasses(cls);
      const current = yrs.find(y => y.is_current);
      if (current) setSelectedYearId(current.id);
      else if (yrs.length) setSelectedYearId(yrs[0].id);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const params: any = { academic_year_id: selectedYearId };
      if (filterClassId) params.class_name_id = filterClassId;
      const [entryData, summaryData] = await Promise.all([
        academicCalendarService.list(params),
        academicCalendarService.summary(selectedYearId),
      ]);
      setEntries(entryData);
      setSummaries(filterClassId ? summaryData.filter(s => s.class_name_id === filterClassId) : summaryData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch calendar data');
    }
  };

  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYearId || !bulkClassIds.length || !bulkMonths.length) {
      setError('Please select academic year, at least one class, and at least one month');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload: AcademicCalendarBulkCreate = {
        academic_year_id: selectedYearId,
        class_name_ids: bulkClassIds,
        months: bulkMonths,
        year: bulkYear,
        total_working_days: bulkWorkingDays,
      };
      const created = await academicCalendarService.bulkCreate(payload);
      setSuccess(`Created ${created.length} calendar entries successfully!`);
      setBulkClassIds([]);
      setBulkMonths([]);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create entries');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateWorkingDays = async (id: number) => {
    try {
      setSaving(true);
      await academicCalendarService.update(id, { total_working_days: editWorkingDays });
      setEditingId(null);
      setSuccess('Working days updated!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this calendar entry and all its holidays?')) return;
    try {
      await academicCalendarService.delete(id);
      setSuccess('Entry deleted');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayEntryId || !holidayForm.holiday_date || !holidayForm.name) {
      setError('Holiday date and name are required');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await academicCalendarService.addHoliday(holidayEntryId, holidayForm);
      setSuccess('Holiday added!');
      setHolidayEntryId(null);
      setHolidayForm({ holiday_date: '', name: '', remarks: '' });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add holiday');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveHoliday = async (holidayId: number) => {
    try {
      await academicCalendarService.removeHoliday(holidayId);
      setSuccess('Holiday removed');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove holiday');
    }
  };

  const toggleBulkClass = (id: number) => {
    setBulkClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const toggleBulkMonth = (m: number) => {
    setBulkMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const selectAllClasses = () => {
    if (bulkClassIds.length === classes.length) setBulkClassIds([]);
    else setBulkClassIds(classes.map(c => c.id));
  };

  const selectAllMonths = () => {
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    if (bulkMonths.length === 12) setBulkMonths([]);
    else setBulkMonths(all);
  };

  // Auto-clear messages
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); }
  }, [error]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="bg-gray-600 text-white px-6 py-4 rounded-t-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">📅 Academic Calendar</h1>
        <div className="flex flex-wrap gap-2">
          <select
            className="bg-gray-700 text-white border border-gray-500 rounded px-3 py-1.5 text-sm"
            value={selectedYearId}
            onChange={e => setSelectedYearId(Number(e.target.value))}
          >
            <option value={0}>Select Academic Year</option>
            {academicYears.map(y => (
              <option key={y.id} value={y.id}>{y.name} {y.is_current ? '(Current)' : ''}</option>
            ))}
          </select>
          <select
            className="bg-gray-700 text-white border border-gray-500 rounded px-3 py-1.5 text-sm"
            value={filterClassId}
            onChange={e => setFilterClassId(Number(e.target.value))}
          >
            <option value={0}>All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mt-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-500 font-bold">×</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded mt-2 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-500 font-bold">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b mt-4">
        {(['summary', 'bulk', 'entries'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'bulk' ? 'Bulk Entry' : tab === 'entries' ? 'Detailed View' : 'Summary'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-t-0 rounded-b-lg p-4 md:p-6 shadow-sm">

        {/* ===== SUMMARY TAB ===== */}
        {activeTab === 'summary' && (
          <div>
            {!selectedYearId ? (
              <p className="text-gray-500 text-center py-8">Please select an academic year above.</p>
            ) : summaries.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No calendar entries found. Use the <span className="font-semibold">Bulk Entry</span> tab to add working days.</p>
            ) : (() => {
              // Compute ALL unique months across every class
              const allMonths = [...new Set(summaries.flatMap(s => s.months.map(m => m.month)))].sort((a, b) => a - b);
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-100 z-10">Class</th>
                        {allMonths.map(month => (
                          <th key={month} className="px-3 py-3 text-center font-semibold text-gray-700">
                            {MONTH_NAMES[month - 1]?.slice(0, 3)}
                          </th>
                        ))}
                        <th className="px-3 py-3 text-center font-semibold text-gray-700 bg-indigo-50">Total</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700 bg-red-50">Holidays</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700 bg-green-50">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map(s => {
                        const monthMap = new Map(s.months.map(m => [m.month, m]));
                        return (
                          <tr key={s.class_name_id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800 sticky left-0 bg-white z-10">{s.class_name}</td>
                            {allMonths.map(month => {
                              const m = monthMap.get(month);
                              return (
                                <td key={month} className="px-3 py-3 text-center">
                                  {m ? (
                                    <>
                                      <div className="text-gray-800 font-medium">{m.effective_working_days}</div>
                                      {m.holiday_count > 0 && (
                                        <div className="text-xs text-red-500">-{m.holiday_count}h</div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-center font-bold text-indigo-700 bg-indigo-50">{s.total_working_days}</td>
                            <td className="px-3 py-3 text-center font-bold text-red-600 bg-red-50">{s.total_holidays}</td>
                            <td className="px-3 py-3 text-center font-bold text-green-700 bg-green-50">{s.total_effective_days}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== BULK ENTRY TAB ===== */}
        {activeTab === 'bulk' && (
          <div className="space-y-8">
            {/* --- SECTION 1: Bulk Working Days Creation --- */}
            <form onSubmit={handleBulkCreate}>
              <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">📋 Bulk Working Days Entry</h3>
              <p className="text-gray-600 mb-4">Select classes and months to set working days in bulk. Existing entries will be skipped.</p>

              {/* Year input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Calendar Year</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-3 py-2 w-32 text-sm"
                  value={bulkYear}
                  onChange={e => setBulkYear(Number(e.target.value))}
                  min={2020}
                  max={2050}
                />
              </div>

              {/* Class selection */}
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-sm font-medium text-gray-700">Select Classes</label>
                  <button type="button" onClick={selectAllClasses}
                    className="text-xs text-indigo-600 hover:underline">
                    {bulkClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {classes.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleBulkClass(c.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        bulkClassIds.includes(c.id)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {bulkClassIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Settings will apply to <span className="font-medium">all sections</span> of the selected {bulkClassIds.length} class(es).
                  </p>
                )}
              </div>

              {/* Month selection */}
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-sm font-medium text-gray-700">Select Months</label>
                  <button type="button" onClick={selectAllMonths}
                    className="text-xs text-indigo-600 hover:underline">
                    {bulkMonths.length === 12 ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MONTH_NAMES.map((name, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleBulkMonth(i + 1)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        bulkMonths.includes(i + 1)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {name.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Working days */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Working Days per Month</label>
                <input
                  type="number"
                  className="border border-gray-300 rounded px-3 py-2 w-32 text-sm"
                  value={bulkWorkingDays}
                  onChange={e => setBulkWorkingDays(Number(e.target.value))}
                  min={0}
                  max={31}
                />
              </div>

              {/* Preview */}
              {bulkClassIds.length > 0 && bulkMonths.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Preview</h3>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">{bulkClassIds.length}</span> class(es) × <span className="font-medium">{bulkMonths.length}</span> month(s) = <span className="font-bold text-indigo-700">{bulkClassIds.length * bulkMonths.length}</span> entries @ <span className="font-medium">{bulkWorkingDays}</span> working days each.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !bulkClassIds.length || !bulkMonths.length || !selectedYearId}
                className="bg-indigo-600 text-white px-6 py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create Bulk Entries'}
              </button>
            </form>

            {/* --- SECTION 2: Bulk Holiday Management --- */}
            {selectedYearId && entries.length > 0 && (
              <div>
                <h3 className="text-base font-bold text-gray-800 mb-3 border-b pb-2">🎉 Manage Holidays</h3>
                <p className="text-gray-600 mb-4">Add or remove holidays for existing calendar entries. Holidays auto-subtract from working days.</p>

                {/* Add Holiday Form */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-semibold text-orange-800 mb-3">Add Holiday to All Classes</h4>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!bulkHolidayForm.holiday_date || !bulkHolidayForm.name) {
                      setError('Holiday date and name are required');
                      return;
                    }
                    try {
                      setSaving(true);
                      setError('');
                      const result = await academicCalendarService.bulkAddHoliday({
                        academic_year_id: selectedYearId,
                        class_name_ids: bulkHolidayClassIds.length > 0 ? bulkHolidayClassIds : undefined,
                        holiday_date: bulkHolidayForm.holiday_date,
                        name: bulkHolidayForm.name,
                        remarks: bulkHolidayForm.remarks,
                      });
                      setSuccess(`Holiday added to ${result.added_count} entries${result.skipped_count > 0 ? `, ${result.skipped_count} skipped (duplicate/no entry)` : ''}`);
                      setBulkHolidayForm({ holiday_date: '', name: '', remarks: '' });
                      fetchData();
                    } catch (err: any) {
                      setError(err.response?.data?.detail || 'Failed to add holidays');
                    } finally {
                      setSaving(false);
                    }
                  }}>
                    <div className="flex flex-wrap gap-3 items-end mb-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Holiday Date *</label>
                        <input type="date" required
                          className="border border-gray-300 rounded px-3 py-2 text-sm"
                          value={bulkHolidayForm.holiday_date}
                          onChange={e => setBulkHolidayForm({ ...bulkHolidayForm, holiday_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Holiday Name *</label>
                        <input type="text" required placeholder="e.g. Republic Day"
                          className="border border-gray-300 rounded px-3 py-2 text-sm w-56"
                          value={bulkHolidayForm.name}
                          onChange={e => setBulkHolidayForm({ ...bulkHolidayForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Remarks</label>
                        <input type="text" placeholder="Optional"
                          className="border border-gray-300 rounded px-3 py-2 text-sm w-48"
                          value={bulkHolidayForm.remarks}
                          onChange={e => setBulkHolidayForm({ ...bulkHolidayForm, remarks: e.target.value })}
                        />
                      </div>
                      <button type="submit" disabled={saving}
                        className="bg-orange-500 text-white px-5 py-2 rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                      >{saving ? 'Adding...' : 'Add Holiday'}</button>
                    </div>

                    {/* Optional: restrict to specific classes */}
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <label className="text-xs font-medium text-gray-600">Apply to classes (leave empty for all):</label>
                        <button type="button" onClick={() => {
                          if (bulkHolidayClassIds.length === classes.length) setBulkHolidayClassIds([]);
                          else setBulkHolidayClassIds(classes.map(c => c.id));
                        }} className="text-xs text-indigo-600 hover:underline">
                          {bulkHolidayClassIds.length === classes.length ? 'Clear' : 'Select All'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {classes.map(c => (
                          <button key={c.id} type="button"
                            onClick={() => setBulkHolidayClassIds(prev =>
                              prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                            )}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${
                              bulkHolidayClassIds.includes(c.id)
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                            }`}
                          >{c.name}</button>
                        ))}
                      </div>
                    </div>
                  </form>
                </div>

                {/* Existing Holidays List */}
                {(() => {
                  const allHolidays: { id: number; holiday_date: string; name: string; remarks?: string; classes: string[] }[] = [];
                  const holidayMap = new Map<string, { id: number; holiday_date: string; name: string; remarks?: string; classes: string[]; holidayIds: number[] }>();
                  entries.forEach(entry => {
                    entry.holidays.forEach(h => {
                      const key = `${h.holiday_date}_${h.name}`;
                      if (holidayMap.has(key)) {
                        holidayMap.get(key)!.classes.push(entry.class_name || `Class ${entry.class_name_id}`);
                        holidayMap.get(key)!.holidayIds.push(h.id);
                      } else {
                        holidayMap.set(key, {
                          id: h.id,
                          holiday_date: h.holiday_date,
                          name: h.name,
                          remarks: h.remarks,
                          classes: [entry.class_name || `Class ${entry.class_name_id}`],
                          holidayIds: [h.id],
                        });
                      }
                    });
                  });
                  const uniqueHolidays = [...holidayMap.values()].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));

                  if (uniqueHolidays.length === 0) {
                    return <p className="text-gray-400 text-sm italic">No holidays added yet.</p>;
                  }

                  return (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-red-50">
                            <th className="px-4 py-2 text-left font-semibold text-gray-700">Date</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-700">Holiday Name</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-700">Remarks</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-700">Applied To</th>
                            <th className="px-4 py-2 text-center font-semibold text-gray-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniqueHolidays.map(h => (
                            <tr key={h.holiday_date + h.name} className="border-t hover:bg-red-50/50">
                              <td className="px-4 py-2 text-red-600 font-medium">{h.holiday_date}</td>
                              <td className="px-4 py-2 text-gray-800">{h.name}</td>
                              <td className="px-4 py-2 text-gray-500 italic">{h.remarks || '—'}</td>
                              <td className="px-4 py-2">
                                <span className="text-xs text-gray-600">
                                  {[...new Set(h.classes)].length === classes.length
                                    ? <span className="font-medium text-green-600">All Classes</span>
                                    : [...new Set(h.classes)].join(', ')}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(`Remove "${h.name}" (${h.holiday_date}) from ${h.holidayIds.length} class(es)?`)) return;
                                    try {
                                      for (const hid of h.holidayIds) {
                                        await academicCalendarService.removeHoliday(hid);
                                      }
                                      setSuccess(`Holiday "${h.name}" removed from ${h.holidayIds.length} class(es)`);
                                      fetchData();
                                    } catch (err: any) {
                                      setError(err.response?.data?.detail || 'Failed to remove holiday');
                                    }
                                  }}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium hover:underline"
                                >Remove All</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ===== DETAILED VIEW TAB ===== */}
        {activeTab === 'entries' && (
          <div>
            {entries.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No calendar entries. Use the <span className="font-semibold">Bulk Entry</span> tab to add data.</p>
            ) : (
              <div className="space-y-3">
                {/* Group entries by class */}
                {(() => {
                  const grouped: Record<string, AcademicCalendarEntry[]> = {};
                  entries.forEach(e => {
                    const key = e.class_name || `Class ${e.class_name_id}`;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(e);
                  });
                  return Object.entries(grouped).map(([className, classEntries]) => (
                    <div key={className} className="border rounded-lg overflow-hidden">
                      {/* Class header */}
                      <button
                        onClick={() => setExpandedClass(expandedClass === classEntries[0].class_name_id ? null : classEntries[0].class_name_id)}
                        className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold text-gray-800">{className}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{classEntries.length} months</span>
                          <span className={`transform transition-transform ${expandedClass === classEntries[0].class_name_id ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                      </button>

                      {/* Expanded months */}
                      {expandedClass === classEntries[0].class_name_id && (
                        <div className="divide-y">
                          {classEntries.sort((a, b) => a.month - b.month).map(entry => (
                            <div key={entry.id} className="px-4 py-3">
                              <div className="flex flex-wrap items-center gap-4 justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium text-gray-800 w-20">{MONTH_NAMES[entry.month - 1]}</span>
                                  {editingId === entry.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        className="border rounded px-2 py-1 w-20 text-sm"
                                        value={editWorkingDays}
                                        onChange={e => setEditWorkingDays(Number(e.target.value))}
                                        min={0} max={31}
                                      />
                                      <button onClick={() => handleUpdateWorkingDays(entry.id)}
                                        className="text-green-600 text-sm font-medium hover:underline">Save</button>
                                      <button onClick={() => setEditingId(null)}
                                        className="text-gray-500 text-sm hover:underline">Cancel</button>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-600">
                                      <span className="font-medium">{entry.total_working_days}</span> working days
                                      {entry.holiday_count > 0 && (
                                        <span className="text-red-500 ml-2">- {entry.holiday_count} holiday(s)</span>
                                      )}
                                      <span className="text-green-700 ml-2 font-semibold">= {entry.effective_working_days} effective</span>
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { setEditingId(entry.id); setEditWorkingDays(entry.total_working_days); }}
                                    className="text-indigo-600 text-xs hover:underline"
                                  >Edit</button>
                                  <button
                                    onClick={() => { setHolidayEntryId(entry.id); setHolidayForm({ holiday_date: '', name: '', remarks: '' }); }}
                                    className="text-orange-600 text-xs hover:underline"
                                  >+ Holiday</button>
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    className="text-red-600 text-xs hover:underline"
                                  >Delete</button>
                                </div>
                              </div>

                              {/* Holiday list */}
                              {entry.holidays.length > 0 && (
                                <div className="mt-2 ml-4 space-y-1">
                                  {entry.holidays.map(h => (
                                    <div key={h.id} className="flex items-center gap-3 text-xs bg-red-50 rounded px-3 py-1.5">
                                      <span className="text-red-600 font-medium">{h.holiday_date}</span>
                                      <span className="text-gray-700">{h.name}</span>
                                      {h.remarks && <span className="text-gray-500 italic">— {h.remarks}</span>}
                                      <button onClick={() => handleRemoveHoliday(h.id)}
                                        className="ml-auto text-red-500 hover:text-red-700 font-bold">×</button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Add holiday form (inline) */}
                              {holidayEntryId === entry.id && (
                                <form onSubmit={handleAddHoliday} className="mt-3 ml-4 bg-orange-50 rounded-lg p-3 border border-orange-200">
                                  <div className="flex flex-wrap gap-3 items-end">
                                    <div>
                                      <label className="block text-xs text-gray-600 mb-1">Date</label>
                                      <input type="date" required
                                        className="border rounded px-2 py-1 text-sm"
                                        value={holidayForm.holiday_date}
                                        onChange={e => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-600 mb-1">Holiday Name</label>
                                      <input type="text" required placeholder="e.g. Republic Day"
                                        className="border rounded px-2 py-1 text-sm w-48"
                                        value={holidayForm.name}
                                        onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-600 mb-1">Remarks</label>
                                      <input type="text" placeholder="Optional"
                                        className="border rounded px-2 py-1 text-sm w-40"
                                        value={holidayForm.remarks}
                                        onChange={e => setHolidayForm({ ...holidayForm, remarks: e.target.value })}
                                      />
                                    </div>
                                    <button type="submit" disabled={saving}
                                      className="bg-orange-500 text-white px-4 py-1 rounded text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                                    >Add</button>
                                    <button type="button" onClick={() => setHolidayEntryId(null)}
                                      className="text-gray-500 text-sm hover:underline"
                                    >Cancel</button>
                                  </div>
                                </form>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AcademicCalendarPage;
