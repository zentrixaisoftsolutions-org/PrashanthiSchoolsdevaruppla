import React, { useEffect, useState } from 'react';
import feeService, { StudentFeeSummary, FeePayment } from '../../services/feeService';
import academicYearService, { AcademicYear } from '../../services/academicYearService';
import classNameService, { ClassName } from '../../services/classNameService';

const FeeSummaryPage: React.FC = () => {
  const [summaries, setSummaries] = useState<StudentFeeSummary[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classNames, setClassNames] = useState<ClassName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedAYId, setSelectedAYId] = useState<number | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const PAGE_SIZE = 10;

  // Aggregate totals (across ALL records, not just current page)
  const [totalFee, setTotalFee] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalDue, setTotalDue] = useState(0);

  // Detail modal
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<FeePayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedAYId) loadSummaries();
  }, [selectedAYId, selectedClassId, currentPage]);

  // Debounced search: reset to page 1 and reload when search text changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedAYId) {
        setCurrentPage(1);
        loadSummaries(1);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const loadInitialData = async () => {
    try {
      const [years, classes] = await Promise.all([
        academicYearService.listAcademicYears(false),
        classNameService.listClassNames(false),
      ]);
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

  const loadSummaries = async (pageOverride?: number) => {
    setLoading(true);
    try {
      const pg = pageOverride ?? currentPage;
      const data = await feeService.getFeeSummary(
        selectedAYId || undefined,
        selectedClassId || undefined,
        pg,
        PAGE_SIZE,
        searchText || undefined,
      );
      setSummaries(data.items);
      setTotalPages(data.total_pages);
      setTotalRecords(data.total);
      setTotalFee(data.total_fee);
      setTotalPaid(data.total_paid);
      setTotalDue(data.total_due);
      if (pageOverride) setCurrentPage(pageOverride);
    } catch {
      setError('Failed to load fee summaries');
    } finally {
      setLoading(false);
    }
  };

  const openStudentDetail = async (student: StudentFeeSummary) => {
    setSelectedStudent(student);
    setHistoryLoading(true);
    try {
      const history = await feeService.getStudentPaymentHistory(student.student_id, selectedAYId || undefined);
      setPaymentHistory(history);
    } catch {
      setPaymentHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedStudent(null);
    setPaymentHistory([]);
  };

  const formatCurrency = (amt: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(amt);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  // Reset to page 1 when filters change
  const handleClassChange = (val: string) => {
    setSelectedClassId(val ? parseInt(val) : null);
    setCurrentPage(1);
  };

  const handleAYChange = (val: string) => {
    setSelectedAYId(val ? parseInt(val) : null);
    setCurrentPage(1);
  };

  // Pagination helpers
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  if (loading && summaries.length === 0) {
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
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">FEE SUMMARY & DUE REPORT</h2>
        </div>
        <div className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Academic Year</label>
            <select
              value={selectedAYId || ''}
              onChange={e => handleAYChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Class</label>
            <select
              value={selectedClassId || ''}
              onChange={e => handleClassChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Classes</option>
              {classNames.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Search</label>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Name or Admission No..."
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Totals Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-medium uppercase">Total Fee</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalFee)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-600 font-medium uppercase">Total Paid</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600 font-medium uppercase">Total Due</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDue)}</p>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Admission No</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3 text-right">Total Fee</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3">Last Payment</th>
                <th className="px-4 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No data found</td></tr>
              ) : (
                summaries.map((s, i) => (
                  <tr key={s.student_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm text-gray-400">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.student_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.admission_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.class_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{formatCurrency(s.total_fee)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">{formatCurrency(s.total_paid)}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">
                      {s.total_due > 0 ? formatCurrency(s.total_due) : (
                        <span className="text-green-500">Paid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(s.last_payment_date)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openStudentDetail(s)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalRecords)} of {totalRecords} students
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                « First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Prev
              </button>
              {getPageNumbers().map(pg => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`px-3 py-1 text-sm rounded border ${
                    pg === currentPage
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-300 bg-white hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Last »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="bg-indigo-600 text-white px-4 py-3 rounded-t-lg flex justify-between items-center sticky top-0 z-10">
              <div>
                <h3 className="text-base font-semibold">{selectedStudent.student_name}</h3>
                <p className="text-xs text-indigo-200">{selectedStudent.admission_number} | {selectedStudent.class_name || 'N/A'}</p>
              </div>
              <button onClick={closeDetail} className="text-white/80 hover:text-white text-xl">&times;</button>
            </div>

            {/* Fee Breakdown */}
            <div className="p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Fee Breakdown</h4>
              {selectedStudent.fee_breakdown.length > 0 ? (
                <div className="overflow-x-auto mb-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <th className="px-3 py-2">Fee Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Frequency</th>
                        <th className="px-3 py-2 text-right">Paid</th>
                        <th className="px-3 py-2 text-right">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.fee_breakdown.map((b, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                          <td className="px-3 py-2 font-medium">{b.fee_type}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(b.amount)}</td>
                          <td className="px-3 py-2 capitalize text-gray-500">{b.frequency.replace('_', '-')}</td>
                          <td className="px-3 py-2 text-right text-green-600">{formatCurrency(b.paid)}</td>
                          <td className="px-3 py-2 text-right text-red-600">
                            {b.due > 0 ? formatCurrency(b.due) : <span className="text-green-500">✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(selectedStudent.total_fee)}</td>
                        <td></td>
                        <td className="px-3 py-2 text-right text-green-600">{formatCurrency(selectedStudent.total_paid)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{formatCurrency(selectedStudent.total_due)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-4">No fee structure defined for this student&apos;s class</p>
              )}

              {/* Payment History */}
              <h4 className="text-sm font-semibold text-gray-700 mb-3 mt-4">Payment History</h4>
              {historyLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                </div>
              ) : paymentHistory.length === 0 ? (
                <p className="text-sm text-gray-400">No payment records found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Receipt</th>
                        <th className="px-3 py-2">Fee Type</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((p, i) => (
                        <tr key={p.id} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                          <td className="px-3 py-2 text-gray-500">{formatDate(p.payment_date)}</td>
                          <td className="px-3 py-2 font-mono text-indigo-600 text-xs">{p.receipt_number || '-'}</td>
                          <td className="px-3 py-2">{p.fee_type || 'General'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(p.amount_paid)}</td>
                          <td className="px-3 py-2 capitalize text-gray-600">{p.payment_method.replace('_', ' ')}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium capitalize ${
                              p.status === 'completed' ? 'bg-green-100 text-green-700' :
                              p.status === 'failed' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeSummaryPage;
