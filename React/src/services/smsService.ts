import api from './api';

export interface SMSConfig {
  id: number;
  provider_name: string;
  api_key_masked: string;
  api_secret_masked?: string | null;
  sender_id?: string;
  base_url?: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SMSConfigCreate {
  provider_name: string;
  api_key: string;
  api_secret?: string;
  sender_id?: string;
  base_url?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface SMSConfigUpdate {
  provider_name?: string;
  api_key?: string;
  api_secret?: string;
  sender_id?: string;
  base_url?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface SMSTemplate {
  id: number;
  name: string;
  template_type: string;
  message_template: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SMSTemplateCreate {
  name: string;
  template_type: string;
  message_template: string;
  is_default?: boolean;
}

export interface SMSTemplateUpdate {
  name?: string;
  template_type?: string;
  message_template?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface SMSLog {
  id: number;
  config_id?: number;
  provider_name?: string;
  student_id?: number;
  student_name?: string;
  phone_number: string;
  message: string;
  message_type?: string;
  status: string;
  sent_at?: string;
  created_at: string;
}

export interface SendSMSRequest {
  phone_number: string;
  message: string;
  student_id?: number;
  message_type?: string;
}

export interface SMSSendResponse {
  success: boolean;
  message: string;
  sms_log_id?: number;
}

export interface SMSTestRequest {
  config_id: number;
  phone_number: string;
}

export interface SMSStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  by_type: Record<string, number>;
}

export interface SMSProvider {
  name: string;
  description: string;
  fields: Record<string, string>;
}

const smsService = {
  // ==================== CONFIG ====================
  
  // Get all SMS configs
  getConfigs: async (isActive?: boolean): Promise<SMSConfig[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {};
    const response = await api.get('/sms/config', { params });
    return response.data;
  },

  // Get single config
  getConfig: async (id: number): Promise<SMSConfig> => {
    const response = await api.get(`/sms/config/${id}`);
    return response.data;
  },

  // Create config
  createConfig: async (data: SMSConfigCreate): Promise<SMSConfig> => {
    const response = await api.post('/sms/config', data);
    return response.data;
  },

  // Update config
  updateConfig: async (id: number, data: SMSConfigUpdate): Promise<SMSConfig> => {
    const response = await api.put(`/sms/config/${id}`, data);
    return response.data;
  },

  // Delete config
  deleteConfig: async (id: number): Promise<void> => {
    await api.delete(`/sms/config/${id}`);
  },

  // ==================== TEMPLATES ====================

  // Get all templates
  getTemplates: async (templateType?: string, isActive?: boolean): Promise<SMSTemplate[]> => {
    const params: Record<string, any> = {};
    if (templateType) params.template_type = templateType;
    if (isActive !== undefined) params.is_active = isActive;
    const response = await api.get('/sms/template', { params });
    return response.data;
  },

  // Get single template
  getTemplate: async (id: number): Promise<SMSTemplate> => {
    const response = await api.get(`/sms/template/${id}`);
    return response.data;
  },

  // Create template
  createTemplate: async (data: SMSTemplateCreate): Promise<SMSTemplate> => {
    const response = await api.post('/sms/template', data);
    return response.data;
  },

  // Update template
  updateTemplate: async (id: number, data: SMSTemplateUpdate): Promise<SMSTemplate> => {
    const response = await api.put(`/sms/template/${id}`, data);
    return response.data;
  },

  // Delete template
  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/sms/template/${id}`);
  },

  // ==================== SENDING ====================

  // Send single SMS
  sendSMS: async (data: SendSMSRequest): Promise<SMSSendResponse> => {
    const response = await api.post('/sms/send', data);
    return response.data;
  },

  // Test SMS config
  testConfig: async (data: SMSTestRequest): Promise<SMSSendResponse> => {
    const response = await api.post('/sms/test', data);
    return response.data;
  },

  // ==================== LOGS ====================

  // Get SMS logs
  getLogs: async (
    page?: number,
    pageSize?: number,
    statusFilter?: string,
    messageType?: string
  ): Promise<SMSLog[]> => {
    const params: Record<string, any> = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (statusFilter) params.status_filter = statusFilter;
    if (messageType) params.message_type = messageType;
    
    const response = await api.get('/sms/logs', { params });
    return response.data;
  },

  // Get SMS stats
  getStats: async (): Promise<SMSStats> => {
    const response = await api.get('/sms/logs/stats');
    return response.data;
  },

  // Get supported providers
  getProviders: async (): Promise<SMSProvider[]> => {
    const response = await api.get('/sms/providers');
    return response.data;
  },
};

export default smsService;
