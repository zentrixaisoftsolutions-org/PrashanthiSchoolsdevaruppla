import { useState } from 'react';

/**
 * Compact, collapsible info panel that explains how many SMS messages
 * are sent for each attendance scenario. Used on the Attendance Summary
 * and Manual Attendance pages.
 */
const SmsRulesInfo = () => {
  const [open, setOpen] = useState(false);

  const rows: Array<{
    who: string;
    scenario: string;
    count: string;
    detail: string;
  }> = [
    { who: 'Student', scenario: 'On-time check-in (≤ 09:00)', count: '2',
      detail: 'check-in + check-out' },
    { who: 'Student', scenario: 'Late arrival (> 09:00)', count: '3',
      detail: 'late + check-in + check-out' },
    { who: 'Student', scenario: 'Absent (no swipe by 10:00)', count: '1',
      detail: 'absent SMS only — counts as both check-in & check-out' },
    { who: 'Student', scenario: 'Late arrival after absent SMS sent', count: '0',
      detail: 'attendance reset to present/late silently' },
    { who: 'Staff',   scenario: 'On-time check-in (≤ 09:00)', count: '2',
      detail: 'check-in + check-out' },
    { who: 'Staff',   scenario: 'Late arrival (> 09:00)', count: '3',
      detail: 'late + check-in + check-out' },
  ];

  const badge = (n: string) => {
    const color = n === '0' ? 'bg-gray-100 text-gray-700'
      : n === '1' ? 'bg-blue-100 text-blue-800'
      : n === '2' ? 'bg-green-100 text-green-800'
      : 'bg-amber-100 text-amber-800';
    return (
      <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
        {n}
      </span>
    );
  };

  return (
    <div className="mb-4 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-semibold text-gray-800">SMS Rules &amp; Daily Count</span>
          <span className="text-xs text-gray-500">— how many SMS each scenario sends to the parent / staff</span>
        </div>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Who</th>
                <th className="px-5 py-2 text-left font-medium">Scenario</th>
                <th className="px-5 py-2 text-center font-medium">SMS&nbsp;Count</th>
                <th className="px-5 py-2 text-left font-medium">Sequence / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-2 font-medium text-gray-800">{r.who}</td>
                  <td className="px-5 py-2 text-gray-700">{r.scenario}</td>
                  <td className="px-5 py-2 text-center">{badge(r.count)}</td>
                  <td className="px-5 py-2 text-gray-600">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
            Each SMS is independently dedup'd per day — duplicates from device backfill / multiple swipes are silently dropped, only successful sends count toward the daily limit.
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsRulesInfo;
