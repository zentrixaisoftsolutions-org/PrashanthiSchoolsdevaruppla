import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS, ROLES } from '../config/constants';
import { Exam } from '../types';
import OfflineIndicator from '../components/OfflineIndicator';
import { demoExams } from '../services/demoData';

interface SubjectResult {
  subject: string;
  marks_obtained: number;
  max_marks: number;
  is_absent: boolean;
  percentage: number;
  grade: string;
}

interface ExamResult {
  exam_name: string;
  subjects: SubjectResult[];
  total_obtained: number;
  total_max: number;
  overall_percentage: number;
}

interface StudentResult {
  student_id: number;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  exams: ExamResult[];
}

interface ParentResultsData {
  students: StudentResult[];
}

const ExamsScreen = () => {
  const { isDemoMode, user } = useAuth();
  const isParent = user?.role === ROLES.PARENT;
  const [exams, setExams] = useState<Exam[]>([]);
  const [parentResults, setParentResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExams = async () => {
    if (isDemoMode) {
      setExams(demoExams);
      setLoading(false);
      return;
    }
    try {
      if (isParent) {
        const data = await apiClient.get<ParentResultsData>(API_ENDPOINTS.MY_CHILDREN_RESULTS);
        setParentResults(data.students);
      } else {
        const data = await apiClient.get<Exam[]>(API_ENDPOINTS.EXAMINATION_SCHEDULES);
        setExams(data);
      }
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return COLORS.success;
    if (grade.startsWith('B')) return COLORS.info;
    if (grade.startsWith('C')) return COLORS.warning;
    return COLORS.error;
  };

  const renderExam = ({ item }: { item: Exam }) => (
    <TouchableOpacity style={styles.examCard}>
      <View style={styles.examHeader}>
        <Text style={styles.examType}>{item.exam_type?.name}</Text>
        <Text style={styles.examDate}>
          {new Date(item.exam_date).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.subjectName}>{item.subject?.name}</Text>
      <Text style={styles.className}>
        {item.class_section?.class_name?.name} - {item.class_section?.section?.name}
      </Text>
      <View style={styles.marksContainer}>
        <Text style={styles.marksText}>Total Marks: {item.total_marks}</Text>
        <Text style={styles.marksText}>Passing: {item.passing_marks}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isParent) {
    return (
      <View style={{ flex: 1 }}>
        <OfflineIndicator />
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
          {parentResults.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No exam results available</Text>
            </View>
          ) : (
            parentResults.map((student) => (
              <View key={student.student_id} style={{ marginBottom: 24 }}>
                <View style={styles.studentHeader}>
                  <Text style={styles.studentHeaderName}>{student.student_name}</Text>
                  <Text style={styles.studentHeaderClass}>
                    {student.class_name} | {student.admission_number}
                  </Text>
                </View>
                {student.exams.length === 0 ? (
                  <Text style={styles.noResults}>No results yet</Text>
                ) : (
                  student.exams.map((exam, idx) => (
                    <View key={idx} style={styles.examCard}>
                      <View style={styles.examHeader}>
                        <Text style={styles.examType}>{exam.exam_name}</Text>
                        <Text style={[styles.examDate, { color: COLORS.success, fontWeight: 'bold' }]}>
                          {exam.overall_percentage}%
                        </Text>
                      </View>
                      {exam.subjects.map((sub, sIdx) => (
                        <View key={sIdx} style={styles.subjectRow}>
                          <Text style={styles.subjectLabel}>{sub.subject}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.marksText}>
                              {sub.is_absent ? 'AB' : `${sub.marks_obtained}/${sub.max_marks}`}
                            </Text>
                            <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(sub.grade) }]}>
                              <Text style={styles.gradeText}>{sub.grade}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalValue}>
                          {exam.total_obtained}/{exam.total_max}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <View style={styles.container}>
        <FlatList
        data={exams}
        renderItem={renderExam}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No exams scheduled</Text>
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
  listContainer: {
    padding: 16,
  },
  examCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  examType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  examDate: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 4,
  },
  className: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  marksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  marksText: {
    fontSize: 14,
    color: COLORS.text,
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
  studentHeader: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  studentHeaderName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  studentHeaderClass: {
    fontSize: 14,
    color: '#e0e7ff',
    marginTop: 4,
  },
  noResults: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 16,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  subjectLabel: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  gradeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
});

export default ExamsScreen;
