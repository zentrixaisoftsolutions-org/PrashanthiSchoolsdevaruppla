import React, { useEffect, useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import feeService, { FeeStructure, FeePayment, RazorpayOrderResponse } from '../../services/feeService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classNameService, { ClassName } from '../../services/classNameService';
import schoolSettingsService, { SchoolSettings } from '../../services/schoolSettingsService';
import api from '../../services/api';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface StudentOption {
  id: number;
  name: string;
  admission_number: string;
  class_name: string | null;
}

const FeePaymentPage: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Payment Form
  const [showPayForm, setShowPayForm] = useState(false);
  const [selectedFormClassId, setSelectedFormClassId] = useState<number | null>(null);
  const [selectedFormTerm, setSelectedFormTerm] = useState<number>(1);
  const [payForm, setPayForm] = useState({
    student_id: '',
    academic_year_id: 0,
    fee_structure_id: '',
    term: 1 as number,
    amount_paid: '',
    payment_method: 'cash',
    discount_type: 'amount' as 'amount' | 'percent',
    discount_value: '',
    tax_percent: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  // Receipt print
  const [receiptPayment, setReceiptPayment] = useState<FeePayment | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: receiptRef });

  // Email Director
  const todayIso = new Date().toISOString().slice(0, 10);
  const [emailDate, setEmailDate] = useState<string>(todayIso);
  const [emailingDirector, setEmailingDirector] = useState(false);

  const handleEmailDirector = async () => {
    if (!confirm(`Send fee collections for ${emailDate} to the Director / Principal email(s)?`)) return;
    setEmailingDirector(true);
    setError('');
    setSuccess('');
    try {
      const res = await feeService.emailDirectorDaily(emailDate);
      setSuccess(
        `Emailed ${res.count} payment(s) totaling ₹${res.total_amount.toFixed(2)} ` +
        `to ${res.director_name} <${res.director_email}> for ${res.date}.`
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to email Director / Principal');
    } finally {
      setEmailingDirector(false);
    }
  };

  // School settings for receipt header
  const [schoolInfo, setSchoolInfo] = useState<SchoolSettings | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedAYId) {
      loadPayments();
      loadFeeStructures();
    }
  }, [selectedAYId, selectedClassId]);

  const loadInitialData = async () => {
    try {
      const [years, classes, school] = await Promise.all([
        academicYearService.listAcademicYears(false),
        classNameService.listClassNames(false),
        schoolSettingsService.get().catch(() => null),
      ]);
      if (school) setSchoolInfo(school);
      setAcademicYears(years);
      setClassNames(classes);
      const current = years.find(y => y.is_current) || years[0];
      if (current) setSelectedAYId(current.id);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadPayments = async () => {
    try {
      const data = await feeService.listPayments({
        academic_year_id: selectedAYId || undefined,
      });
      setPayments(data);
    } catch {
      setError('Failed to load payments');
    }
  };

  const loadFeeStructures = async () => {
    if (!selectedAYId) return;
    try {
      const data = await feeService.listStructures(selectedAYId, selectedClassId || undefined);
      setFeeStructures(data);
    } catch { /* ignore */ }
  };

  const searchStudents = async (query: string) => {
    setStudentSearch(query);
    // If user clears or shrinks below 2 chars, reset results & any prior selection
    if (query.length < 2) {
      setStudentResults([]);
      if (selectedStudent && query !== selectedStudent.name) {
        setSelectedStudent(null);
        setPayForm(p => ({ ...p, student_id: '' }));
      }
      return;
    }
    try {
      // Backend route: GET /api/students/?search=<q>&page_size=10&is_active=true
      // (api baseURL already includes /api). Trailing slash is required —
      // FastAPI returns 404 for /api/students without it.
      const res = await api.get('/students/', {
        params: {
          search: query,
          page_size: 10,
          is_active: true,
        },
      });
      const raw = Array.isArray(res.data) ? res.data : (res.data?.students || []);
      const students: StudentOption[] = raw.map((s: any) => ({
        id: s.id,
        name: `${s.first_name || ''} ${s.surname || ''}`.trim() || s.admission_number,
        admission_number: s.admission_number,
        class_name: s.class_name || null,
      }));
      setStudentResults(students);
    } catch (err) {
      console.error('Student search failed:', err);
      setStudentResults([]);
    }
  };

  const selectStudent = (s: StudentOption) => {
    setSelectedStudent(s);
    setStudentSearch(s.name);
    setStudentResults([]);
    setPayForm(p => ({ ...p, student_id: String(s.id), fee_structure_id: '' }));
    // Auto-detect class from student
    if (s.class_name) {
      const matchedClass = classNames.find(c => s.class_name && c.name.toLowerCase() === s.class_name.toLowerCase());
      if (matchedClass) {
        setSelectedFormClassId(matchedClass.id);
      }
    }
  };

  const handleCashPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payForm.student_id || !payForm.amount_paid) {
      setError('Please select a student and enter amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await feeService.createPayment({
        student_id: parseInt(payForm.student_id),
        academic_year_id: payForm.academic_year_id || selectedAYId || 0,
        fee_structure_id: payForm.fee_structure_id ? parseInt(payForm.fee_structure_id) : undefined,
        term: selectedFormTerm,
        amount_paid: parseFloat(payForm.amount_paid),
        payment_method: payForm.payment_method,
        discount_type: payForm.discount_value ? payForm.discount_type : undefined,
        discount_value: payForm.discount_value ? parseFloat(payForm.discount_value) : undefined,
        tax_percent: payForm.tax_percent ? parseFloat(payForm.tax_percent) : undefined,
        remarks: payForm.remarks || undefined,
      });
      setSuccess('Payment recorded successfully!');
      setShowPayForm(false);
      resetPayForm();
      loadPayments();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleRazorpayPayment = async () => {
    if (!payForm.student_id || !payForm.amount_paid) {
      setError('Please select a student and enter amount');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const orderData = await feeService.createRazorpayOrder({
        student_id: parseInt(payForm.student_id),
        academic_year_id: payForm.academic_year_id || selectedAYId || 0,
        amount: parseFloat(payForm.amount_paid),
        fee_structure_id: payForm.fee_structure_id ? parseInt(payForm.fee_structure_id) : undefined,
        remarks: payForm.remarks || undefined,
      });
      openRazorpayCheckout(orderData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create Razorpay order');
      setSaving(false);
    }
  };

  const openRazorpayCheckout = (order: RazorpayOrderResponse) => {
    // Load Razorpay script if not loaded
    if (!window.Razorpay) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => initiateCheckout(order);
      document.body.appendChild(script);
    } else {
      initiateCheckout(order);
    }
  };

  const initiateCheckout = (order: RazorpayOrderResponse) => {
    const options = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: schoolInfo?.school_name || 'School',
      description: 'Fee Payment',
      order_id: order.order_id,
      prefill: {
        name: order.student_name,
        email: order.student_email || '',
        contact: order.student_phone || '',
      },
      handler: async (response: any) => {
        try {
          await feeService.verifyRazorpayPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            student_id: parseInt(payForm.student_id),
            academic_year_id: payForm.academic_year_id || selectedAYId || 0,
            amount: parseFloat(payForm.amount_paid),
            fee_structure_id: payForm.fee_structure_id ? parseInt(payForm.fee_structure_id) : undefined,
            term: selectedFormTerm,
            remarks: payForm.remarks || undefined,
          });
          setSuccess('Online payment successful!');
          setShowPayForm(false);
          resetPayForm();
          loadPayments();
        } catch {
          setError('Payment verification failed');
        }
      },
      modal: {
        ondismiss: () => setSaving(false),
      },
      theme: { color: '#4F46E5' },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
    setSaving(false);
  };

  const resetPayForm = () => {
    setPayForm({
      student_id: '',
      academic_year_id: selectedAYId || 0,
      fee_structure_id: '',
      term: 1,
      amount_paid: '',
      payment_method: 'cash',
      discount_type: 'amount',
      discount_value: '',
      tax_percent: '',
      remarks: '',
    });
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentResults([]);
    setSelectedFormClassId(null);
    setSelectedFormTerm(1);
  };

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amt);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      cash: 'bg-green-100 text-green-700',
      razorpay: 'bg-blue-100 text-blue-700',
      bank_transfer: 'bg-purple-100 text-purple-700',
      cheque: 'bg-amber-100 text-amber-700',
    };
    return colors[method] || 'bg-gray-100 text-gray-700';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      failed: 'bg-red-100 text-red-700',
      refunded: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">FEE PAYMENTS</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={emailDate}
              onChange={e => setEmailDate(e.target.value)}
              max={todayIso}
              className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Date for the Director / Principal email summary"
            />
            <button
              onClick={handleEmailDirector}
              disabled={emailingDirector || !emailDate}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5"
              title="Email this day's fee payments to the Director and Principal"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {emailingDirector ? 'Sending…' : 'Email Director / Principal'}
            </button>
            <button
              onClick={() => { resetPayForm(); setShowPayForm(true); }}
              className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded text-sm font-medium"
            >
              + Collect Fee
            </button>
          </div>
        </div>
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
            <select
              value={selectedAYId || ''}
              onChange={e => setSelectedAYId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Payment Form Modal */}
      {showPayForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="bg-gray-100 px-4 py-3 rounded-t-lg border-b flex justify-between items-center sticky top-0 z-10">
              <h3 className="text-base font-medium text-gray-800">Collect Fee Payment</h3>
              <button onClick={() => setShowPayForm(false)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <form onSubmit={handleCashPayment} className="p-4 space-y-4">
              {/* Student Search */}
              <div className="relative">
                <label className="block text-sm text-gray-600 mb-1">Search Student</label>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => searchStudents(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Type student name or admission number..."
                />
                {studentResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
                    {studentResults.map(s => (
                      <div
                        key={s.id}
                        onClick={() => selectStudent(s)}
                        className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="text-gray-400 ml-2">({s.admission_number})</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedStudent && (
                  <div className="mt-1 text-xs text-indigo-600">
                    Selected: {selectedStudent.name} ({selectedStudent.admission_number})
                  </div>
                )}
              </div>

              {/* Academic Year, Class, Term */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
                  <select
                    value={payForm.academic_year_id || selectedAYId || ''}
                    onChange={e => setPayForm(p => ({ ...p, academic_year_id: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Class</label>
                  <select
                    value={selectedFormClassId || ''}
                    onChange={e => {
                      setSelectedFormClassId(e.target.value ? parseInt(e.target.value) : null);
                      setPayForm(p => ({ ...p, fee_structure_id: '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select Class</option>
                    {classNames.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Term</label>
                  <select
                    value={selectedFormTerm}
                    onChange={e => {
                      setSelectedFormTerm(parseInt(e.target.value));
                      setPayForm(p => ({ ...p, fee_structure_id: '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={1}>Term 1</option>
                    <option value={2}>Term 2</option>
                    <option value={3}>Term 3</option>
                  </select>
                </div>
              </div>

              {/* Fee Component filtered by class + term */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fee Component</label>
                <select
                  value={payForm.fee_structure_id}
                  onChange={e => {
                    const fsId = e.target.value;
                    setPayForm(p => ({ ...p, fee_structure_id: fsId }));
                    if (fsId) {
                      const fs = feeStructures.find(f => f.id === parseInt(fsId));
                      if (fs) setPayForm(p => ({ ...p, amount_paid: String(fs.amount) }));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">General Payment</option>
                  {feeStructures
                    .filter(f =>
                      (!selectedFormClassId || f.class_name_id === selectedFormClassId) &&
                      f.term === selectedFormTerm
                    )
                    .map(f => (
                      <option key={f.id} value={f.id}>{f.fee_type} ({formatCurrency(f.amount)})</option>
                    ))
                  }
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={payForm.amount_paid}
                    onChange={e => setPayForm(p => ({ ...p, amount_paid: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Payment Method</label>
                  <select
                    value={payForm.payment_method}
                    onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* Discount & Tax */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Discount Type</label>
                  <select
                    value={payForm.discount_type}
                    onChange={e => setPayForm(p => ({ ...p, discount_type: e.target.value as 'amount' | 'percent' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="amount">Amount (₹)</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Discount {payForm.discount_type === 'percent' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.discount_value}
                    onChange={e => setPayForm(p => ({ ...p, discount_value: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tax (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.tax_percent}
                    onChange={e => setPayForm(p => ({ ...p, tax_percent: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Calculated Summary */}
              {payForm.amount_paid && (parseFloat(payForm.discount_value) > 0 || parseFloat(payForm.tax_percent) > 0) && (() => {
                const gross = parseFloat(payForm.amount_paid) || 0;
                const discVal = parseFloat(payForm.discount_value) || 0;
                const taxPct = parseFloat(payForm.tax_percent) || 0;
                const discAmt = payForm.discount_type === 'percent'
                  ? Math.round(gross * discVal / 100 * 100) / 100
                  : Math.min(discVal, gross);
                const afterDiscount = gross - discAmt;
                const taxAmt = Math.round(afterDiscount * taxPct / 100 * 100) / 100;
                const netAmt = Math.round((afterDiscount + taxAmt) * 100) / 100;
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Gross Amount</span>
                      <span className="font-medium">{formatCurrency(gross)}</span>
                    </div>
                    {discAmt > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Discount {payForm.discount_type === 'percent' ? `(${discVal}%)` : ''}</span>
                        <span className="font-medium">- {formatCurrency(discAmt)}</span>
                      </div>
                    )}
                    {taxAmt > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>Tax ({taxPct}%)</span>
                        <span className="font-medium">+ {formatCurrency(taxAmt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-indigo-800 border-t border-indigo-200 pt-1">
                      <span>Net Payable</span>
                      <span>{formatCurrency(netAmt)}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-sm text-gray-600 mb-1">Remarks</label>
                <input
                  type="text"
                  value={payForm.remarks}
                  onChange={e => setPayForm(p => ({ ...p, remarks: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Optional remarks"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Processing...' : 'Record Cash Payment'}
                </button>
                <button
                  type="button"
                  onClick={handleRazorpayPayment}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  Pay via Razorpay
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayForm(false)}
                  className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700">Recent Payments</h3>
          <span className="text-xs text-gray-500">{payments.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Admission No</th>
                <th className="px-4 py-3">Fee Type</th>
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No payments found</td></tr>
              ) : (
                payments.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-mono text-indigo-600">{p.receipt_number || '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.student_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{p.admission_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.fee_type || 'General'}</td>
                    <td className="px-4 py-3 text-sm">
                      {p.term ? (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                          Term {p.term}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(p.amount_paid)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full capitalize ${getMethodBadge(p.payment_method)}`}>
                        {p.payment_method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full capitalize ${getStatusBadge(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setReceiptPayment(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-xs font-medium transition-colors"
                        title="Print Receipt"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Print Modal */}
      {receiptPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 print:hidden">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="bg-gray-100 px-4 py-3 rounded-t-lg border-b flex justify-between items-center flex-shrink-0">
              <h3 className="text-base font-medium text-gray-800">Fee Receipt</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrint()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                <button onClick={() => setReceiptPayment(null)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
              </div>
            </div>

            {/* Printable Receipt */}
            <div className="overflow-y-auto flex-1">
              <div ref={receiptRef} className="p-8 bg-white" id="fee-receipt-wrapper">
                <style>{`
                  @media print {
                    @page {
                      size: A4;
                      margin: 15mm 12mm;
                    }
                    html, body {
                      margin: 0 !important;
                      padding: 0 !important;
                      width: 100% !important;
                      -webkit-print-color-adjust: exact !important;
                      print-color-adjust: exact !important;
                      color-adjust: exact !important;
                    }
                    .print-receipt-content {
                      width: 100% !important;
                      max-width: 100% !important;
                      padding: 0 !important;
                      margin: 0 !important;
                      font-size: 13px !important;
                      color: #111827 !important;
                    }
                    /* School Header */
                    .receipt-header-border {
                      border-bottom: 2px solid #1f2937 !important;
                      padding-bottom: 12px !important;
                      margin-bottom: 16px !important;
                    }
                    .receipt-school-name {
                      color: #111827 !important;
                      font-size: 22px !important;
                      font-weight: 700 !important;
                      text-transform: uppercase !important;
                    }
                    .receipt-subtitle { color: #4b5563 !important; font-size: 11px !important; }
                    .receipt-badge {
                      background-color: #1f2937 !important;
                      color: #ffffff !important;
                      padding: 4px 20px !important;
                      display: inline-block !important;
                      border-radius: 4px !important;
                      font-size: 13px !important;
                      font-weight: 600 !important;
                      letter-spacing: 0.05em !important;
                    }
                    .receipt-logo { height: 56px !important; object-fit: contain !important; }
                    /* Details grid */
                    .receipt-label { color: #6b7280 !important; font-size: 13px !important; }
                    .receipt-value { color: #111827 !important; font-weight: 600 !important; font-size: 13px !important; }
                    /* Fee Table */
                    .receipt-table {
                      width: 100% !important;
                      border-collapse: collapse !important;
                      margin-bottom: 16px !important;
                    }
                    .receipt-table th,
                    .receipt-table td {
                      border: 1px solid #d1d5db !important;
                      padding: 8px 12px !important;
                      font-size: 13px !important;
                    }
                    .receipt-table th { text-align: left !important; }
                    .receipt-table thead tr { background-color: #f3f4f6 !important; }
                    .receipt-table tfoot tr { background-color: #f9fafb !important; }
                    .receipt-total-amount { color: #4338ca !important; font-weight: 700 !important; }
                    .receipt-discount { color: #15803d !important; }
                    .receipt-tax { color: #ea580c !important; }
                    /* Footer */
                    .receipt-footer-line {
                      border-top: 1px solid #9ca3af !important;
                      width: 160px !important;
                      margin-bottom: 4px !important;
                    }
                    .receipt-footer-text { color: #6b7280 !important; font-size: 11px !important; }
                    .receipt-note { color: #9ca3af !important; font-size: 11px !important; text-align: center !important; }
                    .receipt-words { color: #374151 !important; font-size: 13px !important; }
                    .receipt-transaction { color: #6b7280 !important; font-size: 11px !important; }
                    .receipt-divider { border-top: 1px solid #d1d5db !important; padding-top: 12px !important; }
                  }
                `}</style>
                <div className="print-receipt-content">
                  {/* School Header */}
                  <div className="text-center border-b-2 border-gray-800 pb-3 mb-4 receipt-header-border">
                    {schoolInfo?.logo_url && (
                      <img
                        src={schoolSettingsService.getLogoUrl(schoolInfo) || ''}
                        alt="Logo"
                        className="h-14 mx-auto mb-1 object-contain receipt-logo"
                      />
                    )}
                    <h1 className="text-xl font-bold text-gray-900 uppercase receipt-school-name">{schoolInfo?.school_name || 'SCHOOL NAME'}</h1>
                    {schoolInfo?.affiliation && (
                      <p className="text-xs text-gray-600 mt-0.5 receipt-subtitle">{schoolInfo.affiliation}</p>
                    )}
                    {schoolInfo?.address && (
                      <p className="text-xs text-gray-500 receipt-subtitle">{schoolInfo.address}</p>
                    )}
                    <p className="text-xs text-gray-500 receipt-subtitle">
                      {[schoolInfo?.phone ? `Phone: ${schoolInfo.phone}` : null, schoolInfo?.email ? `Email: ${schoolInfo.email}` : null].filter(Boolean).join(' | ')}
                    </p>
                    <div className="mt-2 inline-block bg-gray-800 text-white px-4 py-1 rounded text-sm font-semibold tracking-wide receipt-badge">
                      FEE RECEIPT
                    </div>
                  </div>

                  {/* Receipt Details */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-5">
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Receipt No:</span>
                      <span className="font-semibold text-gray-900 receipt-value">{receiptPayment.receipt_number || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Date:</span>
                      <span className="font-semibold text-gray-900 receipt-value">{formatDate(receiptPayment.payment_date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Student Name:</span>
                      <span className="font-semibold text-gray-900 receipt-value">{receiptPayment.student_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Admission No:</span>
                      <span className="font-semibold text-gray-900 receipt-value">{receiptPayment.admission_number || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Academic Year:</span>
                      <span className="font-semibold text-gray-900 receipt-value">{receiptPayment.academic_year_name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 receipt-label">Payment Method:</span>
                      <span className="font-semibold text-gray-900 capitalize receipt-value">{receiptPayment.payment_method.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {/* Fee Table */}
                  <table className="w-full border border-gray-300 text-sm mb-5 receipt-table">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-left">Description</th>
                        <th className="border border-gray-300 px-3 py-2 text-right" style={{ width: '140px' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-3 py-2">
                          {receiptPayment.fee_type || 'General Fee Payment'}
                          {receiptPayment.remarks && (
                            <span className="text-gray-500 text-xs block receipt-label">({receiptPayment.remarks})</span>
                          )}
                        </td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-semibold receipt-value">
                          {formatCurrency(receiptPayment.gross_amount ?? receiptPayment.amount_paid)}
                        </td>
                      </tr>
                      {(receiptPayment.discount_amount > 0) && (
                        <tr>
                          <td className="border border-gray-300 px-3 py-2 text-green-700 receipt-discount">
                            Discount
                            {receiptPayment.discount_type === 'percent'
                              ? ` (${receiptPayment.discount_value}%)`
                              : ''}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right text-green-700 font-medium receipt-discount">
                            - {formatCurrency(receiptPayment.discount_amount)}
                          </td>
                        </tr>
                      )}
                      {(receiptPayment.tax_amount > 0) && (
                        <tr>
                          <td className="border border-gray-300 px-3 py-2 text-orange-600 receipt-tax">
                            Tax ({receiptPayment.tax_percent}%)
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-right text-orange-600 font-medium receipt-tax">
                            + {formatCurrency(receiptPayment.tax_amount)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-bold">
                        <td className="border border-gray-300 px-3 py-2">Total Paid</td>
                        <td className="border border-gray-300 px-3 py-2 text-right text-indigo-700 receipt-total-amount">
                          {formatCurrency(receiptPayment.amount_paid)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Transaction Info */}
                  {receiptPayment.transaction_id && (
                    <p className="text-xs text-gray-500 mb-2 receipt-transaction">
                      Transaction ID: <span className="font-mono">{receiptPayment.transaction_id}</span>
                    </p>
                  )}
                  {receiptPayment.razorpay_order_id && (
                    <p className="text-xs text-gray-500 mb-2 receipt-transaction">
                      Razorpay Order: <span className="font-mono">{receiptPayment.razorpay_order_id}</span>
                    </p>
                  )}

                  {/* Amount in Words */}
                  <div className="border-t border-gray-300 pt-3 mb-4 receipt-divider">
                    <p className="text-sm text-gray-700 receipt-words">
                      <span className="font-medium">Amount in words:</span>{' '}
                      <span className="italic">
                        {(() => {
                          const amt = Math.floor(receiptPayment.amount_paid);
                          const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                          const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
                          if (amt === 0) return 'Zero Rupees Only';
                          const convert = (n: number): string => {
                            if (n < 20) return ones[n];
                            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
                            if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
                            if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
                            if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
                            return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
                          };
                          return convert(amt) + ' Rupees Only';
                        })()}
                      </span>
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-end mt-10 pt-4">
                    <div className="text-center">
                      <div className="border-t border-gray-400 mb-1 receipt-footer-line" style={{ width: '160px' }}></div>
                      <p className="text-xs text-gray-500 receipt-footer-text">Student/Parent Signature</p>
                    </div>
                    <div className="text-center">
                      <div className="border-t border-gray-400 mb-1 receipt-footer-line" style={{ width: '160px' }}></div>
                      <p className="text-xs text-gray-500 receipt-footer-text">Authorized Signature</p>
                    </div>
                  </div>

                  <p className="text-center text-xs text-gray-400 mt-8 receipt-note">This is a computer-generated receipt. No signature is required.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeePaymentPage;
