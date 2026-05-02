import { useEffect, useState } from 'react';
import announcementService, { Announcement, AnnouncementAudience } from '../../services/announcementService';
import { useAuth } from '../../contexts/AuthContext';

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string }[] = [
  { value: 'all', label: 'All (Parents + Teachers)' },
  { value: 'parents', label: 'Parents only' },
  { value: 'teachers', label: 'Teachers only' },
];

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

const audienceLabel = (a: string) => {
  if (a === 'parents') return 'Parents';
  if (a === 'teachers') return 'Teachers';
  return 'All';
};

const AnnouncementsPage = () => {
  const { user } = useAuth();
  const role = (user as any)?.role || '';
  const canSend = ['super_admin', 'admin', 'principal'].includes(role);

  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await announcementService.list(100);
      setList(data);
    } catch (e: any) {
      setFeedback({ type: 'err', msg: e?.response?.data?.detail || 'Failed to load announcements' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!title.trim() || !body.trim()) {
      setFeedback({ type: 'err', msg: 'Title and message are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const ann = await announcementService.create({ title: title.trim(), body: body.trim(), audience });
      setFeedback({
        type: 'ok',
        msg: `Sent to ${ann.push_sent_count} device(s).`,
      });
      setTitle('');
      setBody('');
      setAudience('all');
      await load();
    } catch (e: any) {
      setFeedback({ type: 'err', msg: e?.response?.data?.detail || 'Failed to send announcement' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await announcementService.remove(id);
      setList(prev => prev.filter(a => a.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to delete');
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Send messages to parents and teachers — they receive a push notification on the mobile app.
        </p>
      </div>

      {canSend && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Compose new announcement</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. School closed tomorrow"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                placeholder="Type the message that should appear in the notification…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Send to</label>
              <select
                value={audience}
                onChange={e => setAudience(e.target.value as AnnouncementAudience)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {AUDIENCE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {feedback && (
              <div
                className={`text-sm rounded-lg px-3 py-2 ${
                  feedback.type === 'ok'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {feedback.msg}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setTitle(''); setBody(''); setAudience('all'); setFeedback(null); }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                disabled={submitting}
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold"
              >
                {submitting ? 'Sending…' : 'Send announcement'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent announcements</h2>
          <button
            onClick={load}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-center text-gray-400 py-10">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-center text-gray-400 py-10">No announcements yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map(a => (
              <li key={a.id} className="py-4 flex gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-gray-900">{a.title}</h3>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(a.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{a.body}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                      {audienceLabel(a.audience)}
                    </span>
                    <span>By {a.sender_name || 'Staff'}</span>
                    <span>•</span>
                    <span>{a.push_sent_count} push{a.push_sent_count === 1 ? '' : 'es'} sent</span>
                  </div>
                </div>
                {canSend && (
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-xs text-red-500 hover:text-red-700 self-start"
                    title="Delete"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsPage;
