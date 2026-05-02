import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Modal,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';

interface StudentItem {
  id: number;
  first_name: string;
  surname?: string;
  admission_number: string;
  class_name?: string;
  section_name?: string;
  gender?: string;
  mobile_number?: string;
}

interface SubjectResult {
  subject_name: string;
  marks_obtained: number | string;
  total_marks: number;
  grade?: string;
  grade_point: number;
  is_absent?: boolean;
}

interface ExamResult {
  exam_name: string;
  exam_date?: string;
  subjects: SubjectResult[];
  total_marks_obtained: number;
  total_max_marks: number;
  average_gpa: number;
  overall_grade: string;
}

interface ReportData {
  student: {
    id: number;
    admission_number: string;
    full_name: string;
    first_name: string;
    surname?: string;
    date_of_birth?: string;
    gender?: string;
    class_name?: string;
    section_name?: string;
    father_guardian_name?: string;
    mother_name?: string;
    mobile_number?: string;
    address?: string;
    admission_date?: string;
  };
  attendance?: {
    from_date: string;
    to_date: string;
    total_working_days: number;
    days_present: number;
    days_absent: number;
    days_late?: number;
    attendance_percentage: number;
  };
  fees?: {
    total_fee_amount: number;
    total_paid: number;
    total_pending: number;
    total_partial: number;
    fee_records: { month: string; amount: number; status: string }[];
  };
  exams?: ExamResult[];
  grade_scale: Record<string, string>;
}

const PerformanceReportScreen = () => {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Report state
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const fetchStudents = async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      let url = `${API_ENDPOINTS.STUDENTS}?page=${pageNum}&page_size=20&is_active=true`;
      if (searchQuery.trim()) url += `&search=${encodeURIComponent(searchQuery.trim())}`;

      const data = await apiClient.get<any>(url);
      const list: StudentItem[] = Array.isArray(data) ? data : (data.students || []);
      const pages = data.total_pages || 1;

      if (append) {
        setStudents(prev => [...prev, ...list]);
      } else {
        setStudents(list);
      }
      setTotalPages(pages);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchStudents(1);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStudents(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadMore = () => {
    if (!loadingMore && page < totalPages) {
      fetchStudents(page + 1, true);
    }
  };

  const generateReport = async (student: StudentItem) => {
    setSelectedStudent(student);
    setReportLoading(true);
    setShowReport(true);
    try {
      const data = await apiClient.get<ReportData>(
        `${API_ENDPOINTS.STUDENTS}/${student.id}/performance-report`
      );
      setReportData(data);
    } catch (error) {
      console.error('Failed to generate report:', error);
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  const closeReport = () => {
    setShowReport(false);
    setReportData(null);
    setSelectedStudent(null);
  };

  const getGradeColor = (grade: string) => {
    const map: Record<string, string> = {
      A1: '#16a34a', A2: '#22c55e', B1: '#2563eb', B2: '#3b82f6',
      C1: '#eab308', C2: '#ca8a04', D: '#f97316', E: '#dc2626',
    };
    return map[grade] || '#6b7280';
  };

  const renderStudentRow = ({ item }: { item: StudentItem }) => (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.first_name?.charAt(0)}{(item.surname || '').charAt(0)}
        </Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.first_name} {item.surname || ''}</Text>
        <Text style={styles.rowSub}>{item.gender || 'N/A'}</Text>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.rowAdm}>{item.admission_number}</Text>
        <Text style={styles.rowClass}>{item.class_name || ''} - {item.section_name || ''}</Text>
        <Text style={styles.rowContact}>{item.mobile_number || ''}</Text>
      </View>
      <TouchableOpacity style={styles.generateBtn} onPress={() => generateReport(item)}>
        <Text style={styles.generateBtnText}>Generate Report</Text>
      </TouchableOpacity>
    </View>
  );

  // Report modal content
  const renderReport = () => {
    if (reportLoading) {
      return (
        <View style={styles.reportCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 12, color: COLORS.textSecondary }}>Generating report...</Text>
        </View>
      );
    }
    if (!reportData) {
      return (
        <View style={styles.reportCenter}>
          <Text style={{ color: COLORS.error, fontSize: 16 }}>Failed to load report</Text>
        </View>
      );
    }
    const { student, attendance, fees, exams, grade_scale } = reportData;
    return (
      <ScrollView style={styles.reportScroll}>
        {/* Header */}
        <View style={styles.reportHeader}>
          <Text style={styles.schoolName}>KRISHNAVENI TALENT HIGH SCHOOL</Text>
          <Text style={styles.schoolSub}>MENTORED FOR LIFE</Text>
          <Text style={styles.reportTitle}>STUDENTS PERFORMANCE REPORT</Text>
        </View>

        {/* Student Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student Information</Text>
          <View style={styles.infoGrid}>
            <InfoRow label="Name" value={student.full_name} />
            <InfoRow label="Admission No" value={student.admission_number} />
            <InfoRow label="Class" value={`${student.class_name || ''} - ${student.section_name || ''}`} />
            <InfoRow label="Date of Birth" value={student.date_of_birth || 'N/A'} />
            <InfoRow label="Father/Guardian" value={student.father_guardian_name || 'N/A'} />
            <InfoRow label="Mother" value={student.mother_name || 'N/A'} />
            <InfoRow label="Contact" value={student.mobile_number || 'N/A'} />
            <InfoRow label="Admission Date" value={student.admission_date || 'N/A'} />
          </View>
        </View>

        {/* Attendance */}
        {attendance && attendance.total_working_days > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attendance Information</Text>
            <Text style={styles.periodText}>
              Period: {attendance.from_date} to {attendance.to_date}
            </Text>
            <View style={styles.statsRow}>
              <StatCard label="Total Days" value={attendance.total_working_days} color="#6b7280" />
              <StatCard label="Present" value={attendance.days_present} color="#16a34a" />
              <StatCard label="Absent" value={attendance.days_absent} color="#dc2626" />
              <StatCard label="Late" value={attendance.days_late || 0} color="#eab308" />
              <StatCard label="Attendance" value={`${attendance.attendance_percentage}%`} color="#2563eb" />
            </View>
          </View>
        )}

        {/* Fees */}
        {fees && fees.total_fee_amount > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fee Information</Text>
            <View style={styles.statsRow}>
              <StatCard label="Total Paid" value={`₹${fees.total_paid.toLocaleString()}`} color="#16a34a" />
              <StatCard label="Pending" value={`₹${fees.total_pending.toLocaleString()}`} color="#dc2626" />
              <StatCard label="Total Fee" value={`₹${fees.total_fee_amount.toLocaleString()}`} color="#2563eb" />
            </View>
          </View>
        )}

        {/* Exams */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Examination Results</Text>
          {(!exams || exams.length === 0) ? (
            <Text style={styles.empty}>No examination records found</Text>
          ) : (
            exams.map((exam, i) => (
              <View key={i} style={styles.examCard}>
                <View style={styles.examHeader}>
                  <Text style={styles.examName}>{exam.exam_name}</Text>
                  {exam.exam_date && <Text style={styles.examDate}>{exam.exam_date}</Text>}
                </View>
                {/* Table header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.cell, { flex: 2 }]}>Subject</Text>
                  <Text style={[styles.cell, styles.cellCenter]}>Marks</Text>
                  <Text style={[styles.cell, styles.cellCenter]}>Out of</Text>
                  <Text style={[styles.cell, styles.cellCenter]}>GPA</Text>
                  <Text style={[styles.cell, styles.cellCenter]}>Grade</Text>
                </View>
                {exam.subjects.map((sub, j) => (
                  <View key={j} style={styles.tableRow}>
                    <Text style={[styles.cell, { flex: 2 }]}>{sub.subject_name}</Text>
                    <Text style={[styles.cell, styles.cellCenter]}>
                      {sub.is_absent ? 'AB' : sub.marks_obtained}
                    </Text>
                    <Text style={[styles.cell, styles.cellCenter]}>{sub.total_marks}</Text>
                    <Text style={[styles.cell, styles.cellCenter]}>{sub.grade_point}</Text>
                    <View style={[styles.cell, styles.cellCenter, { alignItems: 'center' }]}>
                      <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(sub.grade || 'N/A') }]}>
                        <Text style={styles.gradeText}>{sub.grade || 'N/A'}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                {/* Footer totals */}
                <View style={[styles.tableRow, styles.tableFooter]}>
                  <Text style={[styles.cell, { flex: 2, fontWeight: 'bold' }]}>Total / Overall</Text>
                  <Text style={[styles.cell, styles.cellCenter, { fontWeight: 'bold' }]}>{exam.total_marks_obtained}</Text>
                  <Text style={[styles.cell, styles.cellCenter, { fontWeight: 'bold' }]}>{exam.total_max_marks}</Text>
                  <Text style={[styles.cell, styles.cellCenter, { fontWeight: 'bold' }]}>{exam.average_gpa}</Text>
                  <View style={[styles.cell, styles.cellCenter, { alignItems: 'center' }]}>
                    <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(exam.overall_grade) }]}>
                      <Text style={styles.gradeText}>{exam.overall_grade}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Grade Scale */}
        {grade_scale && Object.keys(grade_scale).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Grade Scale</Text>
            <View style={styles.gradeScaleRow}>
              {Object.entries(grade_scale).map(([grade, range]) => (
                <View key={grade} style={[styles.gradeScaleItem, { backgroundColor: getGradeColor(grade) }]}>
                  <Text style={styles.gradeScaleText}>{grade}: {range}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.headerTitle}>Students Performance Report</Text>
        <Text style={styles.headerSub}>Generate comprehensive performance reports for students</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, admission no..."
          placeholderTextColor={COLORS.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.reportCenter}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={students}
          renderItem={renderStudentRow}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStudents(1); }} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 10 }} /> : null}
          ListEmptyComponent={
            <View style={styles.reportCenter}>
              <Text style={styles.empty}>No students found</Text>
            </View>
          }
        />
      )}

      {/* Report Modal */}
      <Modal visible={showReport} animationType="slide" onRequestClose={closeReport}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeReport} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Back to List</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.surname || ''}` : 'Report'}
            </Text>
          </View>
          {renderReport()}
        </View>
      </Modal>
    </View>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}:</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const StatCard = ({ label, value, color }: { label: string; value: string | number; color: string }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  headerSection: { backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  searchContainer: { padding: 12, backgroundColor: COLORS.surface },
  searchInput: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text },
  row: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginVertical: 5, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0e7ff', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  avatarText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  rowInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textSecondary },
  rowMeta: { marginBottom: 10 },
  rowAdm: { fontSize: 13, color: COLORS.textSecondary },
  rowClass: { fontSize: 13, color: COLORS.textSecondary },
  rowContact: { fontSize: 13, color: COLORS.textSecondary },
  generateBtn: { backgroundColor: COLORS.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: 'flex-end' },
  generateBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingTop: 44, paddingBottom: 12, paddingHorizontal: 16 },
  backBtn: { marginRight: 12 },
  backBtnText: { color: '#fff', fontSize: 14 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  reportCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  reportScroll: { flex: 1, padding: 16 },
  // Report header
  reportHeader: { backgroundColor: '#fff', padding: 20, borderRadius: 10, alignItems: 'center', marginBottom: 12, borderBottomWidth: 3, borderBottomColor: COLORS.primary },
  schoolName: { fontSize: 18, fontWeight: 'bold', color: '#312e81' },
  schoolSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  reportTitle: { fontSize: 15, fontWeight: '600', color: '#4b5563', marginTop: 8 },
  // Section
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, elevation: 1 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#312e81', borderBottomWidth: 1, borderBottomColor: '#e0e7ff', paddingBottom: 6, marginBottom: 10 },
  // Info grid
  infoGrid: {},
  infoRow: { flexDirection: 'row', paddingVertical: 4 },
  infoLabel: { width: 120, fontSize: 13, fontWeight: '500', color: '#4b5563' },
  infoValue: { flex: 1, fontSize: 13, color: COLORS.text },
  // Stats
  periodText: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { flex: 1, minWidth: 60, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, alignItems: 'center', borderTopWidth: 3 },
  statValue: { fontSize: 16, fontWeight: 'bold' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  // Exam table
  examCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  examHeader: { backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  examName: { fontSize: 14, fontWeight: '600', color: '#312e81' },
  examDate: { fontSize: 12, color: '#6b7280' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 0.5, borderColor: COLORS.border },
  tableFooter: { backgroundColor: '#eef2ff' },
  cell: { flex: 1, fontSize: 12, color: COLORS.text },
  cellCenter: { textAlign: 'center', justifyContent: 'center' },
  gradeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  gradeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  // Grade scale
  gradeScaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gradeScaleItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  gradeScaleText: { fontSize: 11, fontWeight: '500', color: '#fff' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14 },
});

export default PerformanceReportScreen;
