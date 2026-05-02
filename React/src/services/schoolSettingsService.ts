import api from './api';

export interface SchoolSettings {
  id: number;
  school_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  affiliation: string | null;
  logo_url: string | null;
  updated_at: string | null;
}

export interface SchoolSettingsUpdate {
  school_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  affiliation?: string;
}

const schoolSettingsService = {
  async get(): Promise<SchoolSettings> {
    const res = await api.get('/school-settings');
    return res.data;
  },

  async update(data: SchoolSettingsUpdate): Promise<SchoolSettings> {
    const res = await api.put('/school-settings', data);
    return res.data;
  },

  async uploadLogo(file: File): Promise<SchoolSettings> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/school-settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async deleteLogo(): Promise<SchoolSettings> {
    const res = await api.delete('/school-settings/logo');
    return res.data;
  },

  /** Build the full logo URL for an <img> tag */
  getLogoUrl(settings: SchoolSettings): string | null {
    if (!settings.logo_url) return null;
    // logo_url is like /api/school-settings/logo/xxx.png — need base host only
    const base = (api.defaults.baseURL || '').replace(/\/api$/, '');
    return `${base}${settings.logo_url}`;
  },
};

export default schoolSettingsService;
