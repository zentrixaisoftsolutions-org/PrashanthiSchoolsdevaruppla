import api from './api';

export type AnnouncementAudience = 'all' | 'parents' | 'teachers';

export interface Announcement {
  id: number;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  push_sent_count: number;
  created_at: string;
  sender_name?: string | null;
}

export interface AnnouncementCreate {
  title: string;
  body: string;
  audience: AnnouncementAudience;
}

const announcementService = {
  async list(limit = 50): Promise<Announcement[]> {
    const res = await api.get<Announcement[]>('/announcements/', { params: { limit } });
    return res.data;
  },
  async create(payload: AnnouncementCreate): Promise<Announcement> {
    const res = await api.post<Announcement>('/announcements/', payload);
    return res.data;
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/announcements/${id}`);
  },
};

export default announcementService;
