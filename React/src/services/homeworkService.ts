import api from './api';

export interface HomeworkAttachment {
  id: number;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  url: string;
}

export interface Homework {
  id: number;
  class_id: number;
  class_label?: string | null;
  subject_id?: number | null;
  subject_name?: string | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  assigned_by_staff_id?: number | null;
  assigned_by_name?: string | null;
  created_at: string;
  attachments: HomeworkAttachment[];
}

export interface CreateHomeworkInput {
  title: string;
  class_id: number;
  description?: string;
  subject_id?: number;
  due_date?: string; // YYYY-MM-DD
  files: File[];
}

const homeworkService = {
  list: async (classId?: number): Promise<Homework[]> => {
    const params: Record<string, unknown> = {};
    if (classId) params.class_id = classId;
    const res = await api.get('/homework/', { params });
    return res.data;
  },

  get: async (id: number): Promise<Homework> => {
    const res = await api.get(`/homework/${id}`);
    return res.data;
  },

  create: async (input: CreateHomeworkInput): Promise<Homework> => {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('class_id', String(input.class_id));
    if (input.description) fd.append('description', input.description);
    if (input.subject_id != null) fd.append('subject_id', String(input.subject_id));
    if (input.due_date) fd.append('due_date', input.due_date);
    input.files.forEach(f => fd.append('files', f));
    const res = await api.post('/homework/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/homework/${id}`);
  },

  attachmentUrl: (homeworkId: number, attachmentId: number): string => {
    const base = (api.defaults.baseURL || '').replace(/\/+$/, '');
    return `${base}/homework/${homeworkId}/attachments/${attachmentId}`;
  },
};

export default homeworkService;
