import api from './api';

export interface PaymentGatewayConfig {
  id: number;
  provider: string;
  key_id_masked: string;
  is_test_mode: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const paymentGatewayService = {
  listConfigs: async (): Promise<PaymentGatewayConfig[]> => {
    const res = await api.get<PaymentGatewayConfig[]>('/payment-gateway/configs');
    return res.data;
  },

  createConfig: async (data: {
    provider?: string; key_id: string; key_secret: string;
    webhook_secret?: string; is_test_mode?: boolean;
  }): Promise<PaymentGatewayConfig> => {
    const res = await api.post<PaymentGatewayConfig>('/payment-gateway/configs', data);
    return res.data;
  },

  updateConfig: async (id: number, data: {
    provider?: string; key_id?: string; key_secret?: string;
    webhook_secret?: string; is_test_mode?: boolean; is_active?: boolean;
  }): Promise<PaymentGatewayConfig> => {
    const res = await api.put<PaymentGatewayConfig>(`/payment-gateway/configs/${id}`, data);
    return res.data;
  },

  deleteConfig: async (id: number) => {
    const res = await api.delete(`/payment-gateway/configs/${id}`);
    return res.data;
  },

  testConfig: async (id: number) => {
    const res = await api.post(`/payment-gateway/configs/${id}/test`);
    return res.data;
  },
};

export default paymentGatewayService;
