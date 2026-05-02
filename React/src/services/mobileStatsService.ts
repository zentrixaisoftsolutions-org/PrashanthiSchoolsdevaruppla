import api from './api';

export interface RoleSummary {
  currently_active: number;
  ever_logged_in: number;
}

export interface MobileLoginSummary {
  parents: RoleSummary;
  teachers: RoleSummary;
  active_window_minutes: number;
}

export interface MobileLoginDetailRow {
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  last_login_at: string | null;
  last_seen_at: string | null;
  expires_at: string | null;
  is_currently_active: boolean;
  total_logins: number;
}

export interface MobileLoginDetails {
  role: string;
  active_only: boolean;
  rows: MobileLoginDetailRow[];
}

const mobileStatsService = {
  async getSummary(): Promise<MobileLoginSummary> {
    const res = await api.get<MobileLoginSummary>('/mobile-stats/login-summary');
    return res.data;
  },
  async getDetails(role: 'parent' | 'teacher', active?: boolean): Promise<MobileLoginDetails> {
    const params: Record<string, string | boolean> = { role };
    if (active !== undefined) params.active = active;
    const res = await api.get<MobileLoginDetails>('/mobile-stats/login-details', { params });
    return res.data;
  },
};

export default mobileStatsService;
