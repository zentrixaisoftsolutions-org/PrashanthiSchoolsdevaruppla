import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../theme';

interface SubjectMark {
  subject_id: number;
  subject_name: string;
  marks_obtained: number | null;
  max_marks: number;
  grade: string;
  grade_point: number;
  teacher_remarks?: string;
  is_absent: boolean;
  class_topper?: number;
  class_average?: number;
}

interface ReportCard {
  student_id: number;
  student_name: string;
  admission_number: string;
  father_name?: string;
  class_name: string;
  section_name: string;
  subject_marks: SubjectMark[];
  total_marks: number;
  total_max_marks: number;
  percentage: number;
  grade: string;
  gpa: number;
  total_gpa: number;
  general_remarks?: string;
  class_rank: number;
  total_students?: number;
}

const Stat: React.FC<{ label: string; value: any; color?: string }> = ({ label, value, color }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, color ? { color } : null]}>{value ?? '—'}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Bar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.barOuter}>
      <View style={[styles.barInner, { width: `${pct}%`, backgroundColor: color }]} />
      <Text style={styles.barLabel}>{Math.round(pct)}%</Text>
    </View>
  );
};

export const ProgressReportCard: React.FC<{
  data: ReportCard;
  examName: string;
  gradeScale?: Record<string, string> | null;
}> = ({ data, examName, gradeScale }) => {
  return (
    <View style={{ gap: spacing.md }}>
      {/* Exam + Student details */}
      <View>
        <Text style={styles.sectionTitle}>Exam Details</Text>
        <Text style={styles.line}>{examName}</Text>
        <Text style={styles.muted}>
          {data.class_name} {data.section_name ? `- ${data.section_name}` : ''}
        </Text>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Student</Text>
        <Text style={styles.line}>{data.student_name}</Text>
        <Text style={styles.muted}>
          Adm. # {data.admission_number}
          {data.father_name ? ` • Father: ${data.father_name}` : ''}
        </Text>
      </View>

      {/* Subject-wise table */}
      <View>
        <Text style={styles.sectionTitle}>Subject-wise Performance</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { flex: 2 }]}>Subject</Text>
          <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>Marks</Text>
          <Text style={[styles.th, { width: 50, textAlign: 'right' }]}>Grade</Text>
          <Text style={[styles.th, { width: 40, textAlign: 'right' }]}>Pts</Text>
        </View>
        {data.subject_marks.map((s, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.td, { flex: 2 }]}>{s.subject_name}</Text>
            <Text style={[styles.td, { width: 60, textAlign: 'right', fontWeight: '700' }]}>
              {s.is_absent ? 'AB' : s.marks_obtained != null ? `${s.marks_obtained}/${s.max_marks}` : '—'}
            </Text>
            <Text style={[styles.td, { width: 50, textAlign: 'right', color: colors.primary, fontWeight: '700' }]}>
              {s.grade}
            </Text>
            <Text style={[styles.td, { width: 40, textAlign: 'right' }]}>{s.grade_point}</Text>
          </View>
        ))}
      </View>

      {/* Stats */}
      <View>
        <Text style={styles.sectionTitle}>Overall</Text>
        <View style={styles.statsGrid}>
          <Stat label="Total" value={`${data.total_marks}/${data.total_max_marks}`} />
          <Stat label="Percentage" value={`${data.percentage}%`} color={colors.primary} />
          <Stat label="Grade" value={data.grade} color={colors.primary} />
          <Stat label="GPA" value={`${data.gpa}/${data.total_gpa || 10}`} color={colors.success} />
          <Stat
            label="Class Rank"
            value={data.class_rank ? `${data.class_rank}${data.total_students ? `/${data.total_students}` : ''}` : '—'}
            color={colors.warning}
          />
        </View>
      </View>

      {/* Performance comparison */}
      <View>
        <Text style={styles.sectionTitle}>Performance Comparison</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Topper</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendText}>Average</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>Student</Text>
          </View>
        </View>
        {data.subject_marks.map((s, i) => (
          <View key={i} style={{ marginBottom: spacing.sm }}>
            <Text style={styles.barSubject}>{s.subject_name}</Text>
            <Bar value={s.class_topper ?? 0} max={s.max_marks} color={colors.success} />
            <Bar value={s.class_average ?? 0} max={s.max_marks} color={colors.warning} />
            <Bar value={s.is_absent ? 0 : (s.marks_obtained ?? 0)} max={s.max_marks} color={colors.primary} />
          </View>
        ))}
      </View>

      {/* Remarks */}
      {data.general_remarks ? (
        <View>
          <Text style={styles.sectionTitle}>Remarks</Text>
          <Text style={styles.line}>{data.general_remarks}</Text>
        </View>
      ) : null}

      {/* Grade scale */}
      {gradeScale && (
        <View>
          <Text style={styles.sectionTitle}>Grade Scale</Text>
          {Object.entries(gradeScale).map(([g, range]) => (
            <Text key={g} style={styles.line}>
              <Text style={{ fontWeight: '700' }}>{g}</Text> — {String(range)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { fontWeight: '800', color: colors.text, fontSize: 15, marginBottom: spacing.sm },
  line: { color: colors.text, lineHeight: 20, marginBottom: 4 },
  muted: { color: colors.textMuted, fontSize: 13 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: colors.bg, paddingVertical: 8, paddingHorizontal: spacing.sm,
    borderRadius: 6, marginBottom: 4,
  },
  th: { fontWeight: '800', color: colors.textMuted, fontSize: 12 },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  td: { color: colors.text, fontSize: 13 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statBox: {
    flex: 1, minWidth: '30%', backgroundColor: colors.bg, padding: spacing.sm,
    borderRadius: 8, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  legendRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.textMuted },
  barSubject: { fontWeight: '700', color: colors.text, fontSize: 12, marginBottom: 2 },
  barOuter: {
    height: 16, backgroundColor: colors.bg, borderRadius: 8, overflow: 'hidden',
    marginBottom: 3, justifyContent: 'center',
  },
  barInner: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  barLabel: { position: 'absolute', right: 6, fontSize: 10, fontWeight: '700', color: colors.text },
});
