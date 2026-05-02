import api from './api';

// ==================== TYPES ====================
export interface FeeStructure {
  id: number;
  academic_year_id: number;
  class_name_id: number;
  fee_type: string;
  amount: number;
  frequency: string;
  term: number;
  description: string | null;
  is_mandatory: boolean;
  is_active: boolean;
  academic_year_name: string | null;
  class_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeePayment {
  id: number;
  student_id: number;
  student_name: string | null;
  admission_number: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  fee_structure_id: number | null;
  term: number | null;
  fee_type: string | null;
  gross_amount: number | null;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  net_amount: number | null;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  transaction_id: string | null;
  razorpay_order_id: string | null;
  receipt_number: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
}

export interface StudentFeeSummary {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  total_fee: number;
  total_paid: number;
  total_due: number;
  last_payment_date: string | null;
  fee_breakdown: {
    fee_type: string;
    amount: number;
    frequency: string;
    paid: number;
    due: number;
  }[];
}

export interface PaginatedFeeSummaryResponse {
  items: StudentFeeSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  total_fee: number;
  total_paid: number;
  total_due: number;
}

export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  receipt: string;
}

export interface FeeDashboardStats {
  collected_today: number;
  collected_this_year: number;
  pending_this_year: number;
  total_expected: number;
}

// ==================== SERVICE ====================
const feeService = {
  // Fee Structures
  listStructures: async (academicYearId?: number, classNameId?: number, term?: number): Promise<FeeStructure[]> => {
    const params = new URLSearchParams();
    if (academicYearId) params.append('academic_year_id', String(academicYearId));
    if (classNameId) params.append('class_name_id', String(classNameId));
    if (term) params.append('term', String(term));
    const res = await api.get<FeeStructure[]>(`/fees/structures?${params}`);
    return res.data;
  },

  createStructure: async (data: {
    academic_year_id: number; class_name_id: number; fee_type: string;
    amount: number; frequency?: string; term?: number; description?: string; is_mandatory?: boolean;
  }): Promise<FeeStructure> => {
    const res = await api.post<FeeStructure>('/fees/structures', data);
    return res.data;
  },

  bulkCreateStructures: async (data: {
    academic_year_id: number; class_name_id: number;
    items: { fee_type: string; amount: number; frequency?: string; description?: string; is_mandatory?: boolean; }[];
  }) => {
    const res = await api.post('/fees/structures/bulk', data);
    return res.data;
  },

  updateStructure: async (id: number, data: Partial<FeeStructure>) => {
    const res = await api.put<FeeStructure>(`/fees/structures/${id}`, data);
    return res.data;
  },

  deleteStructure: async (id: number) => {
    const res = await api.delete(`/fees/structures/${id}`);
    return res.data;
  },

  // Fee Payments
  listPayments: async (params?: {
    student_id?: number; academic_year_id?: number;
    payment_method?: string; status?: string; from_date?: string; to_date?: string;
  }): Promise<FeePayment[]> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v !== undefined) searchParams.append(k, String(v)); });
    }
    const res = await api.get<FeePayment[]>(`/fees/payments?${searchParams}`);
    return res.data;
  },

  createPayment: async (data: {
    student_id: number; academic_year_id: number; fee_structure_id?: number;
    term?: number; amount_paid: number; payment_method?: string; remarks?: string;
    discount_type?: string; discount_value?: number; tax_percent?: number;
  }): Promise<FeePayment> => {
    const res = await api.post<FeePayment>('/fees/payments', data);
    return res.data;
  },

  getStudentPaymentHistory: async (studentId: number, academicYearId?: number): Promise<FeePayment[]> => {
    const params = academicYearId ? `?academic_year_id=${academicYearId}` : '';
    const res = await api.get<FeePayment[]>(`/fees/payments/history/${studentId}${params}`);
    return res.data;
  },

  emailDirectorDaily: async (targetDate?: string): Promise<{
    sent: boolean;
    director_email: string;
    director_name: string;
    date: string;
    count: number;
    total_amount: number;
  }> => {
    const params = targetDate ? `?target_date=${targetDate}` : '';
    const res = await api.post(`/fees/payments/email-director-daily${params}`);
    return res.data;
  },

  // Fee Summary
  getFeeSummary: async (
    academicYearId?: number,
    classNameId?: number,
    page: number = 1,
    pageSize: number = 10,
    search?: string,
  ): Promise<PaginatedFeeSummaryResponse> => {
    const params = new URLSearchParams();
    if (academicYearId) params.append('academic_year_id', String(academicYearId));
    if (classNameId) params.append('class_name_id', String(classNameId));
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    if (search) params.append('search', search);
    const res = await api.get<PaginatedFeeSummaryResponse>(`/fees/summary?${params}`);
    return res.data;
  },

  getStudentFeeSummary: async (studentId: number, academicYearId?: number): Promise<StudentFeeSummary> => {
    const params = academicYearId ? `?academic_year_id=${academicYearId}` : '';
    const res = await api.get<StudentFeeSummary>(`/fees/summary/${studentId}${params}`);
    return res.data;
  },

  // Razorpay
  createRazorpayOrder: async (data: {
    student_id: number; academic_year_id: number; amount: number;
    fee_structure_id?: number; remarks?: string;
  }): Promise<RazorpayOrderResponse> => {
    const res = await api.post<RazorpayOrderResponse>('/fees/razorpay/create-order', data);
    return res.data;
  },

  verifyRazorpayPayment: async (data: {
    razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string;
    student_id: number; academic_year_id: number; amount: number;
    fee_structure_id?: number; term?: number; remarks?: string;
  }) => {
    const res = await api.post('/fees/razorpay/verify-payment', data);
    return res.data;
  },

  // Dashboard Stats
  getDashboardStats: async (academicYearId?: number): Promise<FeeDashboardStats> => {
    const params = academicYearId ? `?academic_year_id=${academicYearId}` : '';
    const res = await api.get<FeeDashboardStats>(`/fees/dashboard-stats${params}`);
    return res.data;
  },
};

export default feeService;
