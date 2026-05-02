import React, { useState, useEffect, useRef, useCallback } from 'react';
import helpdeskService, { AppNotification, TicketCreate } from '../services/helpdeskService';
import { FiHelpCircle, FiX, FiCheck, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

// ==================== TICKET MODAL ====================
interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const TicketModal: React.FC<TicketModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const result = await helpdeskService.createTicket(form);
      setForm({ title: '', description: '', category: 'general', priority: 'medium' });
      onSuccess();
      onClose();
      alert(`Ticket ${result.ticket_number} created successfully! The development team has been notified.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FiHelpCircle className="text-white/80" /> Raise a Ticket
            </h2>
            <p className="text-white/70 text-sm mt-0.5">Report an issue or request a feature</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <FiX className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
              <FiAlertCircle /> {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief summary of the issue..."
              maxLength={255}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="general">General</option>
                <option value="bug">Bug / Error</option>
                <option value="feature">Feature Request</option>
                <option value="access">Access Issue</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the issue in detail. Include steps to reproduce if it's a bug..."
              rows={5}
              maxLength={2000}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">{form.description.length}/2000</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim() || !form.description.trim()}
              className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Submitting...
                </>
              ) : (
                'Submit Ticket'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ==================== NOTIFICATION DROPDOWN ====================
interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ isOpen, onClose, onCountChange }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await helpdeskService.getNotifications(false, 30);
      setNotifications(data);
      const unreadCount = data.filter(n => !n.is_read).length;
      onCountChange(unreadCount);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  const handleMarkRead = async (id: number) => {
    await helpdeskService.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    onCountChange(notifications.filter(n => !n.is_read && n.id !== id).length);
  };

  const handleMarkAllRead = async () => {
    await helpdeskService.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    onCountChange(0);
  };

  const getPriorityColor = (msg: string) => {
    if (msg.includes('critical')) return 'border-l-red-500';
    if (msg.includes('high')) return 'border-l-orange-500';
    if (msg.includes('medium')) return 'border-l-yellow-500';
    return 'border-l-blue-500';
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Notifications</h3>
        {notifications.some(n => !n.is_read) && (
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <FiCheckCircle className="text-xs" /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
          </div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
            No notifications yet
          </div>
        )}
        {!loading && notifications.map(n => (
          <div
            key={n.id}
            className={`px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 border-l-4 ${getPriorityColor(n.message)} ${
              n.is_read ? 'bg-white dark:bg-gray-800 opacity-70' : 'bg-indigo-50/50 dark:bg-indigo-900/20'
            } hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer`}
            onClick={() => !n.is_read && handleMarkRead(n.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(n.created_at)}</span>
                  {n.created_by_name && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">by {n.created_by_name}</span>
                  )}
                </div>
              </div>
              {!n.is_read && (
                <span className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


// ==================== HELP ICON BUTTON ====================
interface HelpDeskButtonProps {
  className?: string;
  onTicketCreated?: () => void;
}

export const HelpDeskButton: React.FC<HelpDeskButtonProps> = ({ className, onTicketCreated }) => {
  const [showTicketModal, setShowTicketModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowTicketModal(true)}
        className={className || "p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"}
        title="Help Desk – Raise a Ticket"
      >
        <FiHelpCircle className="text-lg" />
      </button>
      <TicketModal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        onSuccess={() => onTicketCreated?.()}
      />
    </>
  );
};
