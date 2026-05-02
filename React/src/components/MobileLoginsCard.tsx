import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import mobileStatsService, {
  MobileLoginSummary,
  MobileLoginDetailRow,
} from '../services/mobileStatsService';

const COLOR_ACTIVE = '#10B981';
const COLOR_INACTIVE = '#94A3B8';

interface Props {
  /** Optional: total parents and teachers (for the "never logged in" slice). If omitted, only show ever vs active. */
  totalParents?: number;
  totalTeachers?: number;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const MobileLoginsCard = ({ totalParents, totalTeachers }: Props) => {
  const [summary, setSummary] = useState<MobileLoginSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRole, setModalRole] = useState<'parent' | 'teacher'>('parent');
  const [modalRows, setModalRows] = useState<MobileLoginDetailRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await mobileStatsService.getSummary();
        if (!cancelled) setSummary(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || 'Failed to load mobile login stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const openModal = async (role: 'parent' | 'teacher') => {
    setModalRole(role);
    setModalOpen(true);
    setFilter('all');
    setModalLoading(true);
    setModalRows([]);
    try {
      const data = await mobileStatsService.getDetails(role);
      setModalRows(data.rows);
    } catch (e: any) {
      setModalRows([]);
    } finally {
      setModalLoading(false);
    }
  };

  const filteredRows = modalRows.filter(r =>
    filter === 'all' ? true : filter === 'active' ? r.is_currently_active : !r.is_currently_active
  );

  const buildPieData = (s: { currently_active: number; ever_logged_in: number }, total?: number) => {
    const inactive = Math.max(0, s.ever_logged_in - s.currently_active);
    const data: { name: string; value: number; color: string }[] = [];
    if (s.currently_active > 0) data.push({ name: 'Currently Online', value: s.currently_active, color: COLOR_ACTIVE });
    if (inactive > 0) data.push({ name: 'Logged in before', value: inactive, color: COLOR_INACTIVE });
    if (total !== undefined) {
      const never = Math.max(0, total - s.ever_logged_in);
      if (never > 0) data.push({ name: 'Never used app', value: never, color: '#E5E7EB' });
    }
    if (data.length === 0) data.push({ name: 'No data', value: 1, color: '#F3F4F6' });
    return data;
  };

  const renderPie = (
    title: string,
    role: 'parent' | 'teacher',
    s: { currently_active: number; ever_logged_in: number },
    badgeColor: string,
    total?: number,
  ) => {
    const data = buildPieData(s, total);
    return (
      <div
        onClick={() => openModal(role)}
        className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
            {s.currently_active} online
          </span>
        </div>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={data.length > 1 ? 3 : 0}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [value, name]}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend verticalAlign="bottom" height={28} iconSize={9} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_ACTIVE }} />
            <span className="text-gray-500">Currently online</span>
            <span className="font-semibold text-gray-900 ml-auto">{s.currently_active}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_INACTIVE }} />
            <span className="text-gray-500">Ever logged in</span>
            <span className="font-semibold text-gray-900 ml-auto">{s.ever_logged_in}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Click for details</p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {[1, 2].map(i => (
          <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 h-80 animate-pulse">
            <div className="h-5 w-40 bg-gray-200 rounded mb-4" />
            <div className="flex items-center justify-center h-56">
              <div className="w-40 h-40 bg-gray-100 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">Mobile App Logins</h3>
        <p className="text-sm text-red-500">{error || 'No data available'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {renderPie(
          'Parents — Mobile App Logins',
          'parent',
          summary.parents,
          'bg-purple-100 text-purple-700',
          totalParents,
        )}
        {renderPie(
          'Teachers — Mobile App Logins',
          'teacher',
          summary.teachers,
          'bg-amber-100 text-amber-700',
          totalTeachers,
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalRole === 'parent' ? 'Parents' : 'Teachers'} — Mobile App Activity
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Active = used the app in the last {summary.active_window_minutes} minutes with a valid session.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    filter === f
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'active' ? 'Currently online' : 'Offline'}
                </button>
              ))}
              <span className="ml-auto text-sm text-gray-500">
                {filteredRows.length} {filteredRows.length === 1 ? 'user' : 'users'}
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {modalLoading ? (
                <div className="p-10 text-center text-gray-400">Loading…</div>
              ) : filteredRows.length === 0 ? (
                <div className="p-10 text-center text-gray-400">No users to display</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="px-5 py-3 text-left">Name</th>
                      <th className="px-5 py-3 text-left">Phone</th>
                      <th className="px-5 py-3 text-left">First login</th>
                      <th className="px-5 py-3 text-left">Last seen</th>
                      <th className="px-5 py-3 text-left">Logins</th>
                      <th className="px-5 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map(r => (
                      <tr key={r.user_id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{r.full_name || '—'}</div>
                          {r.email && <div className="text-xs text-gray-500">{r.email}</div>}
                        </td>
                        <td className="px-5 py-3 text-gray-700">{r.phone || '—'}</td>
                        <td className="px-5 py-3 text-gray-700">{fmtDate(r.last_login_at)}</td>
                        <td className="px-5 py-3 text-gray-700">{fmtDate(r.last_seen_at)}</td>
                        <td className="px-5 py-3 text-gray-700">{r.total_logins}</td>
                        <td className="px-5 py-3">
                          {r.is_currently_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              Online
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                              <span className="w-2 h-2 bg-gray-400 rounded-full" />
                              Offline
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end p-4 border-t bg-gray-50">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileLoginsCard;
