import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS, ROLES } from '../config/constants';
import { FeePayment } from '../types';
import OfflineIndicator from '../components/OfflineIndicator';
import { demoFeePayments } from '../services/demoData';

interface TermFeeItem {
  fee_type: string;
  amount: number;
  paid: number;
  due: number;
}

interface TermData {
  term: number;
  total: number;
  paid: number;
  pending: number;
  items: TermFeeItem[];
}

interface ParentPayment {
  id: number;
  amount: number;
  term: number | null;
  date: string | null;
  mode: string;
  receipt_number: string | null;
}

interface ChildFee {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  fees_total: number;
  fees_paid: number;
  fees_pending: number;
  terms: TermData[];
  payments: ParentPayment[];
}

interface ParentFeesData {
  students: ChildFee[];
  total_paid: number;
  total_pending: number;
}

const FeesScreen = () => {
  const { isDemoMode, user } = useAuth();
  const isParent = user?.role === ROLES.PARENT;
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [parentFees, setParentFees] = useState<ParentFeesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPayments = async () => {
    if (isDemoMode) {
      setPayments(demoFeePayments);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      if (isParent) {
        const data = await apiClient.get<ParentFeesData>(API_ENDPOINTS.MY_CHILDREN_FEES);
        setParentFees(data);
      } else {
        const data = await apiClient.get<FeePayment[]>(API_ENDPOINTS.FEE_PAYMENT);
        setPayments(data);
      }
    } catch (error) {
      console.error('Failed to fetch fee payments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  const renderPayment = ({ item }: { item: FeePayment }) => (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <Text style={styles.amountText}>₹{item.amount_paid.toLocaleString()}</Text>
        <View
          style={[
            styles.modeBadge,
            item.payment_mode === 'cash'
              ? { backgroundColor: COLORS.success }
              : { backgroundColor: COLORS.info },
          ]}
        >
          <Text style={styles.modeText}>{item.payment_mode.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.dateText}>
        Date: {new Date(item.payment_date).toLocaleDateString()}
      </Text>
      {item.transaction_id && (
        <Text style={styles.transactionText}>
          Transaction ID: {item.transaction_id}
        </Text>
      )}
      {item.remarks && (
        <Text style={styles.remarksText}>Remarks: {item.remarks}</Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isParent && parentFees) {
    return (
      <View style={{ flex: 1 }}>
        <OfflineIndicator />
        <ScrollView
          style={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.summaryContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#e0e7ff', fontSize: 12 }}>Total Paid</Text>
                <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: 'bold' }}>
                  ₹{parentFees.total_paid.toLocaleString()}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#e0e7ff', fontSize: 12 }}>Pending</Text>
                <Text style={{ color: '#fbbf24', fontSize: 22, fontWeight: 'bold' }}>
                  ₹{parentFees.total_pending.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>

          {parentFees.students.map((child) => (
            <View key={child.student_id} style={styles.childFeeCard}>
              <View style={styles.childHeader}>
                <Text style={styles.childName}>{child.student_name}</Text>
                <Text style={styles.childClass}>
                  {child.class_name} | {child.admission_number}
                </Text>
              </View>

              {/* Overall summary */}
              <View style={styles.feeProgress}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Total Fee</Text>
                  <Text style={styles.feeValue}>₹{child.fees_total.toLocaleString()}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Paid</Text>
                  <Text style={[styles.feeValue, { color: COLORS.success }]}>
                    ₹{child.fees_paid.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>Pending</Text>
                  <Text style={[styles.feeValue, { color: child.fees_pending > 0 ? COLORS.error : COLORS.success }]}>
                    ₹{child.fees_pending.toLocaleString()}
                  </Text>
                </View>
                {child.fees_total > 0 && (
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(100, (child.fees_paid / child.fees_total) * 100)}%` },
                      ]}
                    />
                  </View>
                )}
              </View>

              {/* Term-wise breakdown */}
              {(child.terms || []).map((term) => {
                const pct = term.total > 0 ? Math.min(100, (term.paid / term.total) * 100) : 0;
                const isPaid = term.pending <= 0 && term.total > 0;
                return (
                  <View key={term.term} style={styles.termCard}>
                    <View style={styles.termHeader}>
                      <Text style={styles.termTitle}>Term {term.term}</Text>
                      {isPaid ? (
                        <View style={styles.paidBadge}>
                          <Text style={styles.paidBadgeText}>PAID</Text>
                        </View>
                      ) : term.total > 0 ? (
                        <Text style={styles.termPending}>₹{term.pending.toLocaleString()} due</Text>
                      ) : null}
                    </View>
                    {term.items.length > 0 ? (
                      term.items.map((item, idx) => (
                        <View key={idx} style={styles.termItemRow}>
                          <Text style={styles.termItemLabel}>{item.fee_type}</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.termItemAmount}>₹{item.amount.toLocaleString()}</Text>
                            {item.paid > 0 && (
                              <Text style={{ fontSize: 11, color: COLORS.success }}>
                                Paid: ₹{item.paid.toLocaleString()}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={{ fontSize: 13, color: COLORS.textSecondary, paddingVertical: 4 }}>
                        No fees assigned
                      </Text>
                    )}
                    {term.total > 0 && (
                      <View style={[styles.progressBar, { marginTop: 6 }]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${pct}%`,
                              backgroundColor: isPaid ? COLORS.success : COLORS.warning,
                            },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                );
              })}

              {child.payments.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 }}>
                    Recent Payments
                  </Text>
                  {child.payments.map((p) => (
                    <View key={p.id} style={styles.miniPayment}>
                      <View>
                        <Text style={{ color: COLORS.success, fontWeight: '600' }}>
                          ₹{p.amount.toLocaleString()}
                        </Text>
                        {p.term && (
                          <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>Term {p.term}</Text>
                        )}
                      </View>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
                        {p.date ? new Date(p.date).toLocaleDateString() : ''} | {p.mode.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);

  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <View style={styles.container}>
        <View style={styles.summaryContainer}>
        <Text style={styles.summaryLabel}>Total Payments</Text>
        <Text style={styles.summaryValue}>₹{totalPaid.toLocaleString()}</Text>
      </View>

      <FlatList
        data={payments}
        renderItem={renderPayment}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payment records found</Text>
          </View>
        }
      />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContainer: {
    backgroundColor: COLORS.primary,
    padding: 24,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#e0e7ff',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  listContainer: {
    padding: 16,
  },
  paymentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amountText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  modeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  dateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  transactionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  remarksText: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  childFeeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    margin: 16,
    marginTop: 0,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  childHeader: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  childName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  childClass: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  feeProgress: {},
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  feeLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  feeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 4,
  },
  miniPayment: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  termCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  termHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  termTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  termPending: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
  },
  paidBadge: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  paidBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  termItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  termItemLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  termItemAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default FeesScreen;
