import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import academicYearService, { AcademicYear } from '../../services/academicYearService';

interface TermDueDate {
  id?: number;
  term: number;
  due_date: string;
}

const FeeSettings: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [termDates, setTermDates] = useState<{ term1: string; term2: string; term3: string }>({
    term1: '', term2: '', term3: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNotif, setSendingNotif] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { loadAcademicYears(); }, []);
  useEffect(() => { if (selectedAYId) loadTermDueDates(); }, [selectedAYId]);

  const loadAcademicYears = async () => {
    try {
      const years = await academicYearService.listAcademicYears(false);
      setAcademicYears(years);
      const current = years.find(y => y.is_current) || years[0];
      if (current) setSelectedAYId(current.id);
    } catch {
      setError('Failed to load academic years');
    } finally {
      setLoading(false);
    }
  };

  const loadTermDueDates = async () => {
    try {
      const res = await api.get(`/fees/term-due-dates?academic_year_id=${selectedAYId}`);
      const dates = res.data as TermDueDate[];
      const map: Record<number, string> = {};
      dates.forEach(d => { map[d.term] = d.due_date ? d.due_date.split('T')[0] : ''; });
      setTermDates({
        term1: map[1] || '',
        term2: map[2] || '',
        term3: map[3] || '',
      });
    } catch {
      setTermDates({ term1: '', term2: '', term3: '' });
    }
  };

  const handleSave = async () => {
    if (!selectedAYId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const terms: { term: number; due_date: string }[] = [];
      if (termDates.term1) terms.push({ term: 1, due_date: termDates.term1 });
      if (termDates.term2) terms.push({ term: 2, due_date: termDates.term2 });
      if (termDates.term3) terms.push({ term: 3, due_date: termDates.term3 });

      if (terms.length === 0) {
        setError('Please set at least one term due date');
        setSaving(false);
        return;
      }

      await api.post('/fees/term-due-dates', {
        academic_year_id: selectedAYId,
        terms,
      });
      setSuccess('Term due dates saved successfully!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save due dates');
    } finally {
      setSaving(false);
    }
  };

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  };

  const handleSendNotification = async () => {
    setSendingNotif(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/notifications/send-fee-reminders');
      setSuccess(`Push notifications sent to ${res.data.sent} out of ${res.data.total_parents} parents.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send push notifications');
    } finally {
      setSendingNotif(false);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/notifications/send-fee-emails');
      setSuccess(`Emails sent to ${res.data.sent} parents. Skipped ${res.data.skipped} (no email). Total: ${res.data.total_parents} parents with pending fees.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send emails');
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">FEE SETTINGS</h2>
          <p className="text-sm text-gray-500 mt-1">Configure term-wise fee due dates. Parents will receive daily reminders (push notification + email) from the due date until fees are paid.</p>
        </div>
        <div className="p-4">
          <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
          <select
            value={selectedAYId || ''}
            onChange={e => setSelectedAYId(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
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

      {/* Term Due Dates */}
      <div className="bg-white rounded-lg shadow">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-700">Term Due Dates</h3>
          <p className="text-xs text-gray-500 mt-0.5">Set the payment deadline for each term. Reminders start from this date.</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Term 1 */}
          <div className="flex items-center gap-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex-shrink-0 w-20 h-20 bg-blue-600 text-white rounded-lg flex flex-col items-center justify-center">
              <span className="text-xs font-medium uppercase">Term</span>
              <span className="text-2xl font-bold">1</span>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Term 1 Due Date</label>
              <input
                type="date"
                value={termDates.term1}
                onChange={e => setTermDates(d => ({ ...d, term1: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
              />
              {termDates.term1 && (
                <p className="text-xs text-blue-600 mt-1">📅 {formatDateLabel(termDates.term1)}</p>
              )}
            </div>
          </div>

          {/* Term 2 */}
          <div className="flex items-center gap-6 p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex-shrink-0 w-20 h-20 bg-green-600 text-white rounded-lg flex flex-col items-center justify-center">
              <span className="text-xs font-medium uppercase">Term</span>
              <span className="text-2xl font-bold">2</span>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Term 2 Due Date</label>
              <input
                type="date"
                value={termDates.term2}
                onChange={e => setTermDates(d => ({ ...d, term2: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500 w-56"
              />
              {termDates.term2 && (
                <p className="text-xs text-green-600 mt-1">📅 {formatDateLabel(termDates.term2)}</p>
              )}
            </div>
          </div>

          {/* Term 3 */}
          <div className="flex items-center gap-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex-shrink-0 w-20 h-20 bg-purple-600 text-white rounded-lg flex flex-col items-center justify-center">
              <span className="text-xs font-medium uppercase">Term</span>
              <span className="text-2xl font-bold">3</span>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Term 3 Due Date</label>
              <input
                type="date"
                value={termDates.term3}
                onChange={e => setTermDates(d => ({ ...d, term3: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 w-56"
              />
              {termDates.term3 && (
                <p className="text-xs text-purple-600 mt-1">📅 {formatDateLabel(termDates.term3)}</p>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2.5 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Saving...
                </>
              ) : (
                'Save Due Dates'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Send Reminders */}
      <div className="bg-white rounded-lg shadow mt-6">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-700">Send Fee Reminders</h3>
          <p className="text-xs text-gray-500 mt-0.5">Manually send fee payment reminders to all parents with pending fees.</p>
        </div>
        <div className="p-6 flex flex-wrap gap-4">
          <button
            onClick={handleSendNotification}
            disabled={sendingNotif}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow"
          >
            {sendingNotif ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Sending...
              </>
            ) : (
              <>
                <span className="text-lg">🔔</span>
                Send Push Notification
              </>
            )}
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sendingEmail}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 shadow"
          >
            {sendingEmail ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Sending...
              </>
            ) : (
              <>
                <span className="text-lg">📧</span>
                Send Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeeSettings;
