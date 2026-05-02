import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { DashboardStats } from '../types';
import OfflineIndicator from '../components/OfflineIndicator';
import { demoDashboardStats } from '../services/demoData';

interface ParentStudent {
  id: number;
  name: string;
  admission_number: string;
  class: string;
  attendance: {
    today: string;
    month_present: number;
    month_absent: number;
    month_total: number;
    percentage: number;
  };
  fees: {
    total: number;
    paid: number;
    pending: number;
  };
  recent_results: Array<{
    exam: string;
    subject: string;
    marks: number;
    max_marks: number;
    percentage: number;
    grade: string;
  }>;
}

interface ParentDashboardData {
  students: ParentStudent[];
  total_fees_pending: number;
}

const DashboardScreen = () => {
  const { user, isDemoMode } = useAuth();
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [parentData, setParentData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isParent = user?.role === 'parent';

  const fetchDashboardData = async () => {
    if (isDemoMode) {
      setStats(demoDashboardStats);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      if (isParent) {
        const data = await apiClient.get<ParentDashboardData>(API_ENDPOINTS.DASHBOARD_PARENT);
        setParentData(data);
      } else {
        const data = await apiClient.get<any>(API_ENDPOINTS.DASHBOARD_STATS);
        console.log('Dashboard API response:', JSON.stringify(data).substring(0, 300));
        // Map nested API response to flat DashboardStats
        const mapped: DashboardStats = {
          total_students: data.students?.total ?? 0,
          total_teachers: data.staff?.teachers ?? 0,
          total_classes: data.academics?.class_sections ?? 0,
          present_today: data.attendance?.today?.present ?? 0,
          absent_today: data.attendance?.today?.absent ?? 0,
          pending_fees: data.fees?.pending_this_year ?? 0,
        };
        console.log('Mapped stats:', JSON.stringify(mapped));
        setStats(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.full_name || user?.username}!</Text>
        <Text style={styles.role}>Role: {user?.role}</Text>
      </View>

      {isParent ? (
        <ParentDashboard data={parentData} />
      ) : (
        <>
          {stats && (
            <View style={styles.statsContainer}>
              <View style={styles.statsRow}>
                <StatCard
                  title={isDemoMode ? "My Children" : "Total Students"}
                  value={stats.total_students}
                  color={COLORS.primary}
                  icon="👨‍🎓"
                />
                <StatCard
                  title="Total Teachers"
                  value={stats.total_teachers}
                  color={COLORS.secondary}
                  icon="👨‍🏫"
                />
              </View>

              <View style={styles.statsRow}>
                <StatCard
                  title={isDemoMode ? "Class" : "Total Classes"}
                  value={isDemoMode ? "5-A" : stats.total_classes}
                  color={COLORS.info}
                  icon="🏫"
                />
                <StatCard
                  title="Pending Fees"
                  value={`₹${stats.pending_fees?.toLocaleString() || 0}`}
                  color={COLORS.warning}
                  icon="💰"
                />
              </View>

              <View style={styles.attendanceSection}>
                <Text style={styles.sectionTitle}>Today's Attendance</Text>
                <View style={styles.attendanceContainer}>
                  <View style={[styles.attendanceCard, { backgroundColor: COLORS.success }]}>
                    <Text style={styles.attendanceValue}>{stats.present_today}</Text>
                    <Text style={styles.attendanceLabel}>Present</Text>
                  </View>
                  <View style={[styles.attendanceCard, { backgroundColor: COLORS.error }]}>
                    <Text style={styles.attendanceValue}>{stats.absent_today}</Text>
                    <Text style={styles.attendanceLabel}>Absent</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.quickActions}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <QuickActionButton title={isDemoMode ? "View Attendance" : "Mark Attendance"} icon="✓" onPress={() => navigation.navigate('Attendance')} />
              <QuickActionButton title={isDemoMode ? "My Children" : "View Students"} icon="👥" onPress={() => navigation.navigate('Students')} />
              <QuickActionButton title={isDemoMode ? "Fee Details" : "Fee Structure"} icon="💳" onPress={() => navigation.navigate('FeeStructure')} />
              <QuickActionButton title="Exam Results" icon="📊" onPress={() => navigation.navigate('Results')} />
            </View>
          </View>
        </>
      )}
      </ScrollView>
    </View>
  );
};

interface StatCardProps {
  title: string;
  value: number | string;
  color: string;
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, color, icon }) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <View style={styles.statContent}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  </View>
);

interface QuickActionButtonProps {
  title: string;
  icon: string;
  onPress?: () => void;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({ title, icon, onPress }) => (
  <TouchableOpacity style={styles.actionButton} onPress={onPress}>
    <Text style={styles.actionIcon}>{icon}</Text>
    <Text style={styles.actionTitle}>{title}</Text>
  </TouchableOpacity>
);

const ParentDashboard: React.FC<{ data: ParentDashboardData | null }> = ({ data }) => {
  if (!data || data.students.length === 0) {
    return (
      <View style={styles.statsContainer}>
        <Text style={styles.sectionTitle}>No students linked to your account</Text>
      </View>
    );
  }

  return (
    <View style={styles.statsContainer}>
      {data.students.map((student) => (
        <View key={student.id} style={styles.studentCard}>
          <View style={styles.studentHeader}>
            <View style={styles.studentAvatar}>
              <Text style={styles.studentAvatarText}>
                {student.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{student.name}</Text>
              <Text style={styles.studentClass}>{student.class} | {student.admission_number}</Text>
            </View>
          </View>

          {/* Today's Status */}
          <View style={styles.todayStatus}>
            <Text style={styles.todayLabel}>Today:</Text>
            <View style={[
              styles.statusBadge,
              student.attendance.today === 'present' ? styles.presentBadge :
              student.attendance.today === 'absent' ? styles.absentBadge :
              styles.notMarkedBadge
            ]}>
              <Text style={styles.statusBadgeText}>
                {student.attendance.today === 'present' ? '✓ Present' :
                 student.attendance.today === 'absent' ? '✗ Absent' :
                 '— Not Marked'}
              </Text>
            </View>
          </View>

          {/* Attendance This Month */}
          <View style={styles.sectionBlock}>
            <Text style={styles.blockTitle}>Attendance This Month</Text>
            <View style={styles.attendanceRow}>
              <View style={[styles.miniCard, { backgroundColor: '#dcfce7' }]}>
                <Text style={[styles.miniValue, { color: '#16a34a' }]}>{student.attendance.month_present}</Text>
                <Text style={styles.miniLabel}>Present</Text>
              </View>
              <View style={[styles.miniCard, { backgroundColor: '#fee2e2' }]}>
                <Text style={[styles.miniValue, { color: '#dc2626' }]}>{student.attendance.month_absent}</Text>
                <Text style={styles.miniLabel}>Absent</Text>
              </View>
              <View style={[styles.miniCard, { backgroundColor: '#e0e7ff' }]}>
                <Text style={[styles.miniValue, { color: COLORS.primary }]}>{student.attendance.percentage}%</Text>
                <Text style={styles.miniLabel}>Rate</Text>
              </View>
            </View>
          </View>

          {/* Fees */}
          <View style={styles.sectionBlock}>
            <Text style={styles.blockTitle}>Fee Status</Text>
            <View style={styles.feeRow}>
              <View style={styles.feeItem}>
                <Text style={styles.feeLabel}>Total</Text>
                <Text style={styles.feeValue}>₹{student.fees.total.toLocaleString()}</Text>
              </View>
              <View style={styles.feeItem}>
                <Text style={styles.feeLabel}>Paid</Text>
                <Text style={[styles.feeValue, { color: '#16a34a' }]}>₹{student.fees.paid.toLocaleString()}</Text>
              </View>
              <View style={styles.feeItem}>
                <Text style={styles.feeLabel}>Pending</Text>
                <Text style={[styles.feeValue, { color: '#dc2626' }]}>₹{student.fees.pending.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* Recent Results */}
          {student.recent_results.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={styles.blockTitle}>Recent Results</Text>
              {student.recent_results.map((result, idx) => (
                <View key={idx} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultSubject}>{result.subject}</Text>
                    <Text style={styles.resultExam}>{result.exam}</Text>
                  </View>
                  <Text style={styles.resultMarks}>{result.marks}/{result.max_marks}</Text>
                  <View style={styles.gradeBadge}>
                    <Text style={styles.gradeText}>{result.grade}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
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
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    padding: 24,
    paddingTop: 48,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  role: {
    fontSize: 14,
    color: '#e0e7ff',
  },
  statsContainer: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 6,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  statContent: {
    flex: 1,
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  attendanceSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  attendanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attendanceCard: {
    flex: 1,
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  attendanceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  attendanceLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  quickActions: {
    padding: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  // Parent dashboard styles
  studentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  studentAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  studentClass: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  todayStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  todayLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  presentBadge: {
    backgroundColor: '#dcfce7',
  },
  absentBadge: {
    backgroundColor: '#fee2e2',
  },
  notMarkedBadge: {
    backgroundColor: '#f3f4f6',
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionBlock: {
    marginBottom: 16,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  miniCard: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  miniValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  miniLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feeItem: {
    flex: 1,
    alignItems: 'center',
  },
  feeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  feeValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  resultSubject: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  resultExam: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  resultMarks: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
  },
  gradeBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gradeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default DashboardScreen;
