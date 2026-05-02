import api from './api';

export interface WhatsAppConfig {
  id: number;
  provider_name: string;
  api_key_masked: string;
  api_secret_masked?: string;
  sender_id?: string;
  base_url?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplate {
  id: number;
  name: string;
  template_type: string;
  message_template: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppLog {
  id: number;
  config_id?: number;
  student_id?: number;
  student_name?: string;
  phone_number: string;
  message: string;
  message_type?: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export interface WhatsAppStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

export interface WhatsAppProvider {
  name: string;
  description: string;
  fields: Record<string, string>;
}

const whatsappService = {
  // ==================== CONFIG ====================

  getConfigs: async (isActive?: boolean): Promise<WhatsAppConfig[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {};
    const response = await api.get('/whatsapp/config', { params });
    return response.data;
  },

  getConfig: async (id: number): Promise<WhatsAppConfig> => {
    const response = await api.get(`/whatsapp/config/${id}`);
    return response.data;
  },

  createConfig: async (data: {
    provider_name: string;
    api_key: string;
    api_secret?: string;
    sender_id?: string;
    base_url?: string;
    is_default?: boolean;
  }): Promise<WhatsAppConfig> => {
    const response = await api.post('/whatsapp/config', null, { params: data });
    return response.data;
  },

  updateConfig: async (id: number, data: {
    provider_name?: string;
    api_key?: string;
    api_secret?: string;
    sender_id?: string;
    base_url?: string;
    is_active?: boolean;
    is_default?: boolean;
  }): Promise<WhatsAppConfig> => {
    const params: Record<string, any> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params[k] = v;
    });
    const response = await api.put(`/whatsapp/config/${id}`, null, { params });
    return response.data;
  },

  deleteConfig: async (id: number): Promise<void> => {
    await api.delete(`/whatsapp/config/${id}`);
  },

  // ==================== TEMPLATES ====================

  getTemplates: async (templateType?: string, isActive?: boolean): Promise<WhatsAppTemplate[]> => {
    const params: Record<string, any> = {};
    if (templateType) params.template_type = templateType;
    if (isActive !== undefined) params.is_active = isActive;
    const response = await api.get('/whatsapp/templates', { params });
    return response.data;
  },

  createTemplate: async (data: {
    name: string;
    template_type: string;
    message_template: string;
    is_default?: boolean;
  }): Promise<WhatsAppTemplate> => {
    const response = await api.post('/whatsapp/templates', null, { params: data });
    return response.data;
  },

  updateTemplate: async (id: number, data: {
    name?: string;
    template_type?: string;
    message_template?: string;
    is_active?: boolean;
    is_default?: boolean;
  }): Promise<WhatsAppTemplate> => {
    const params: Record<string, any> = {};
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined) params[k] = v;
    });
    const response = await api.put(`/whatsapp/templates/${id}`, null, { params });
    return response.data;
  },

  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/whatsapp/templates/${id}`);
  },

  // ==================== SENDING ====================

  sendMessage: async (data: {
    phone_number: string;
    message: string;
    student_id?: number;
    message_type?: string;
  }): Promise<{ success: boolean; message: string; log_id?: number }> => {
    const response = await api.post('/whatsapp/send', null, { params: data });
    return response.data;
  },

  testConfig: async (configId: number, phoneNumber: string): Promise<{ success: boolean; message: string; log_id?: number }> => {
    const response = await api.post('/whatsapp/test', null, {
      params: { config_id: configId, phone_number: phoneNumber },
    });
    return response.data;
  },

  // ==================== LOGS ====================

  getLogs: async (page?: number, pageSize?: number, statusFilter?: string): Promise<WhatsAppLog[]> => {
    const params: Record<string, any> = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (statusFilter) params.status_filter = statusFilter;
    const response = await api.get('/whatsapp/logs', { params });
    return response.data;
  },

  getStats: async (): Promise<WhatsAppStats> => {
    const response = await api.get('/whatsapp/logs/stats');
    return response.data;
  },

  getProviders: async (): Promise<WhatsAppProvider[]> => {
    const response = await api.get('/whatsapp/providers');
    return response.data;
  },
};

export default whatsappService;
