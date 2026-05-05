import api from './api';

export interface RequestOtpResponse {
  sent: boolean;
  role: 'parent' | 'teacher' | string;
  masked_email: string;
  expires_in: number;
}

export interface VerifyOtpResponse {
  access_token: string;
  token_type: string;
  role: string;
  user_id: number;
  full_name: string;
  expires_in: number;
}

export const authService = {
  requestOtp: async (mobile_number: string, role?: 'parent' | 'teacher'): Promise<RequestOtpResponse> => {
    const body: any = { mobile_number };
    if (role) body.role = role;
    const res = await api.post('/mobile-auth/request-otp', body);
    return res.data;
  },
  verifyOtp: async (mobile_number: string, otp: string): Promise<VerifyOtpResponse> => {
    const res = await api.post('/mobile-auth/verify-otp', { mobile_number, otp });
    return res.data;
  },
  logout: async (): Promise<void> => {
    await api.post('/mobile-auth/logout');
  },
  heartbeat: async (): Promise<void> => {
    await api.post('/mobile-auth/heartbeat');
  },
};
