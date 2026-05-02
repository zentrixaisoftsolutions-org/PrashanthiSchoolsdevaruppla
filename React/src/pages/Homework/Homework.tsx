import React, { useEffect, useMemo, useState } from 'react';
import { FaBookOpen, FaCloudUploadAlt, FaTrash, FaPaperclip, FaCalendarAlt, FaPlus } from 'react-icons/fa';
import homeworkService, { Homework } from '../../services/homeworkService';
import studentService, { ClassInfo } from '../../services/studentService';
import subjectService, { Subject } from '../../services/subjectService';

const todayIso = () => new Date().toISOString().slice(0, 10);

const HomeworkPage: React.FC = () => {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [items, setItems] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterClassId, setFilterClassId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [classId, setClassId] = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string>(todayIso());
  const [files, setFiles] = useState<File[]>([]);

  const loadClasses = async () => {
    try {
      const [c, s] = await Promise.all([
        studentService.getClasses(),
        subjectService.listSubjects(),
      ]);
      setClasses(c);
      setSubjects(s);
    } catch (e) {
      console.error(e);
    }
  };

  const loadHomework = async () => {
    setLoading(true);
    try {
      const data = await homeworkService.list(filterClassId || undefined);
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    loadHomework();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClassId]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSubjectId('');
    setDueDate(todayIso());
    setFiles([]);
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    setFiles(list);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!classId) { setError('Please select a class'); return; }
    setSubmitting(true);
    try {
      await homeworkService.create({
        title: title.trim(),
        class_id: Number(classId),
        description: description.trim() || undefined,
        subject_id: subjectId ? Number(subjectId) : undefined,
        due_date: dueDate || undefined,
        files,
      });
      resetForm();
      setShowForm(false);
      await loadHomework();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to upload homework');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this homework? Parents will no longer see it.')) return;
    try {
      await homeworkService.remove(id);
      await loadHomework();
    } catch (e) {
      console.error(e);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Homework[]>();
    items.forEach(h => {
      const key = h.class_label || `Class #${h.class_id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    });
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FaBookOpen className="text-indigo-600" /> Homework
          </h1>
          <p className="text-sm text-gray-500">
            Upload worksheets or images for your class. Parents will see them in the mobile app.
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg shadow"
        >
          <FaPlus /> {showForm ? 'Close' : 'New Homework'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4"
        >
          <h2 className="font-semibold text-gray-800">Assign Homework</h2>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : '')}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select class…</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject (optional)</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— None —</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g., Chapter 3 Worksheet"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description / Instructions</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add notes, page numbers, or instructions for parents/students."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Worksheet / Photos (PDF or images)</label>
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFiles}
                className="w-full border border-dashed border-gray-300 rounded-lg px-3 py-2"
              />
              {files.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">{files.length} file(s) selected.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium px-4 py-2 rounded-lg shadow"
            >
              <FaCloudUploadAlt /> {submitting ? 'Uploading…' : 'Publish'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-gray-800">Recent Homework</div>
          <select
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value ? Number(e.target.value) : '')}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">All classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No homework posted yet.</div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([label, list]) => (
              <div key={label}>
                <div className="text-sm font-semibold text-indigo-700 mb-2">{label}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {list.map(hw => (
                    <div key={hw.id} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-gray-800">{hw.title}</div>
                          {hw.subject_name && (
                            <div className="text-xs text-gray-500">{hw.subject_name}</div>
                          )}
                        </div>
                        <button
                          onClick={() => remove(hw.id)}
                          title="Delete"
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <FaTrash />
                        </button>
                      </div>
                      {hw.description && (
                        <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{hw.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                        {hw.due_date && (
                          <span className="inline-flex items-center gap-1">
                            <FaCalendarAlt /> Due: {hw.due_date}
                          </span>
                        )}
                        {hw.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FaPaperclip /> {hw.attachments.length} file(s)
                          </span>
                        )}
                      </div>
                      {hw.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {hw.attachments.map(a => {
                            const url = homeworkService.attachmentUrl(hw.id, a.id);
                            const isImage = (a.mime_type || '').startsWith('image/');
                            return isImage ? (
                              <a key={a.id} href={url} target="_blank" rel="noreferrer">
                                <img
                                  src={url}
                                  alt={a.file_name}
                                  className="w-20 h-20 object-cover rounded border border-gray-200"
                                />
                              </a>
                            ) : (
                              <a
                                key={a.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded inline-flex items-center gap-1"
                              >
                                <FaPaperclip /> {a.file_name}
                              </a>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-[11px] text-gray-400 mt-2">
                        Posted {new Date(hw.created_at).toLocaleString()}
                        {hw.assigned_by_name ? ` • ${hw.assigned_by_name}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeworkPage;
