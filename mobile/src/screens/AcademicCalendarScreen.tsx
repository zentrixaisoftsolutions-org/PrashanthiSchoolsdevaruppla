import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS } from '../config/constants';
import { useAuth } from '../contexts/AuthContext';

// ==================== Types ====================
interface AcademicYear { id: number; name: string; is_current: boolean; }
interface ClassItem { id: number; name: string; }

interface CalendarHoliday {
  id: number;
  calendar_id: number;
  holiday_date: string;
  name: string;
  remarks?: string;
  created_at: string;
}

interface CalendarEntry {
  id: number;
  academic_year_id: number;
  class_name_id: number;
  month: number;
  year: number;
  total_working_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  class_name?: string;
  academic_year_name?: string;
  holidays: CalendarHoliday[];
  holiday_count: number;
  effective_working_days: number;
}

interface MonthSummary {
  id: number;
  month: number;
  year: number;
  total_working_days: number;
  holiday_count: number;
  effective_working_days: number;
}

interface CalendarSummary {
  academic_year_id: number;
  academic_year_name: string;
  class_name_id: number;
  class_name: string;
  months: MonthSummary[];
  total_working_days: number;
  total_holidays: number;
  total_effective_days: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = MONTH_NAMES.map(m => m.slice(0, 3));

type TabKey = 'summary' | 'bulk' | 'entries';

const AcademicCalendarScreen = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [summaries, setSummaries] = useState<CalendarSummary[]>([]);

  // Filters
  const [selectedYearId, setSelectedYearId] = useState<number>(0);
  const [filterClassId, setFilterClassId] = useState<number>(0);

  // UI
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [expandedClass, setExpandedClass] = useState<number | null>(null);

  // Bulk create form
  const [bulkClassIds, setBulkClassIds] = useState<number[]>([]);
  const [bulkMonths, setBulkMonths] = useState<number[]>([]);
  const [bulkYear, setBulkYear] = useState<number>(new Date().getFullYear());
  const [bulkWorkingDays, setBulkWorkingDays] = useState<string>('26');

  // Bulk holiday form
  const [bulkHolidayDate, setBulkHolidayDate] = useState('');
  const [bulkHolidayName, setBulkHolidayName] = useState('');
  const [bulkHolidayRemarks, setBulkHolidayRemarks] = useState('');
  const [bulkHolidayClassIds, setBulkHolidayClassIds] = useState<number[]>([]);

  // Inline edit working days
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWorkingDays, setEditWorkingDays] = useState('');

  // Add holiday to single entry
  const [holidayEntryId, setHolidayEntryId] = useState<number | null>(null);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayRemarks, setHolidayRemarks] = useState('');

  // Picker modal
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);

  // ==================== Data Loading ====================
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedYearId) fetchData();
  }, [selectedYearId, filterClassId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [yrs, cls] = await Promise.all([
        apiClient.get<AcademicYear[]>(API_ENDPOINTS.ACADEMIC_YEARS),
        apiClient.get<ClassItem[]>(API_ENDPOINTS.CLASS_NAMES),
      ]);
      setAcademicYears(yrs);
      setClasses(cls);
      const current = yrs.find((y: AcademicYear) => y.is_current);
      if (current) setSelectedYearId(current.id);
      else if (yrs.length) setSelectedYearId(yrs[0].id);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const params: string[] = [`academic_year_id=${selectedYearId}`];
      if (filterClassId) params.push(`class_name_id=${filterClassId}`);
      const qs = params.length ? '?' + params.join('&') : '';

      const [entryData, summaryData] = await Promise.all([
        apiClient.get<CalendarEntry[]>(`${API_ENDPOINTS.ACADEMIC_CALENDAR}${qs}`),
        apiClient.get<CalendarSummary[]>(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/summary?academic_year_id=${selectedYearId}`),
      ]);
      setEntries(entryData);
      setSummaries(filterClassId ? summaryData.filter((s: CalendarSummary) => s.class_name_id === filterClassId) : summaryData);
    } catch (err: any) {
      console.error('Failed to fetch calendar data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // ==================== Bulk Create ====================
  const handleBulkCreate = async () => {
    if (!selectedYearId || !bulkClassIds.length || !bulkMonths.length) {
      Alert.alert('Error', 'Please select academic year, at least one class, and at least one month');
      return;
    }
    const wd = parseInt(bulkWorkingDays) || 0;
    if (wd < 0 || wd > 31) {
      Alert.alert('Error', 'Working days must be between 0 and 31');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        academic_year_id: selectedYearId,
        class_name_ids: bulkClassIds,
        months: bulkMonths,
        year: bulkYear,
        total_working_days: wd,
      };
      const created = await apiClient.post<CalendarEntry[]>(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/bulk`, payload);
      Alert.alert('Success', `Created ${Array.isArray(created) ? created.length : 0} calendar entries`);
      setBulkClassIds([]);
      setBulkMonths([]);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to create entries');
    } finally {
      setSaving(false);
    }
  };

  // ==================== Bulk Holiday ====================
  const handleBulkHoliday = async () => {
    if (!bulkHolidayDate || !bulkHolidayName.trim()) {
      Alert.alert('Error', 'Holiday date and name are required');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        academic_year_id: selectedYearId,
        holiday_date: bulkHolidayDate,
        name: bulkHolidayName.trim(),
        remarks: bulkHolidayRemarks.trim() || '',
      };
      if (bulkHolidayClassIds.length > 0) {
        payload.class_name_ids = bulkHolidayClassIds;
      }
      const result = await apiClient.post<{ added_count: number; skipped_count: number }>(
        `${API_ENDPOINTS.ACADEMIC_CALENDAR}/bulk-holiday`, payload
      );
      const msg = `Holiday added to ${result.added_count} entries` +
        (result.skipped_count > 0 ? `, ${result.skipped_count} skipped` : '');
      Alert.alert('Success', msg);
      setBulkHolidayDate('');
      setBulkHolidayName('');
      setBulkHolidayRemarks('');
      setBulkHolidayClassIds([]);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to add holiday');
    } finally {
      setSaving(false);
    }
  };

  // ==================== Update Working Days ====================
  const handleUpdateWorkingDays = async (id: number) => {
    const wd = parseInt(editWorkingDays) || 0;
    if (wd < 0 || wd > 31) {
      Alert.alert('Error', 'Working days must be between 0 and 31');
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/${id}`, { total_working_days: wd });
      setEditingId(null);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  // ==================== Delete Entry ====================
  const handleDeleteEntry = (id: number) => {
    Alert.alert('Delete', 'Delete this calendar entry and all its holidays?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await apiClient.delete(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/${id}`);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.detail || 'Failed to delete');
          }
        },
      },
    ]);
  };

  // ==================== Add Holiday to Entry ====================
  const handleAddHoliday = async () => {
    if (!holidayEntryId || !holidayDate || !holidayName.trim()) {
      Alert.alert('Error', 'Holiday date and name are required');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/${holidayEntryId}/holidays`, {
        holiday_date: holidayDate,
        name: holidayName.trim(),
        remarks: holidayRemarks.trim() || '',
      });
      setHolidayEntryId(null);
      setHolidayDate('');
      setHolidayName('');
      setHolidayRemarks('');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to add holiday');
    } finally {
      setSaving(false);
    }
  };

  // ==================== Remove Holiday ====================
  const handleRemoveHoliday = (holidayId: number, name: string) => {
    Alert.alert('Remove Holiday', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await apiClient.delete(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/holidays/${holidayId}`);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.response?.data?.detail || 'Failed to remove holiday');
          }
        },
      },
    ]);
  };

  // ==================== Toggle Helpers ====================
  const toggleBulkClass = (id: number) => {
    setBulkClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };
  const toggleBulkMonth = (m: number) => {
    setBulkMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };
  const toggleBulkHolidayClass = (id: number) => {
    setBulkHolidayClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  // ==================== Render Helpers ====================
  const getSelectedYearName = () => {
    const y = academicYears.find(a => a.id === selectedYearId);
    return y ? y.name : 'Select Year';
  };
  const getSelectedClassName = () => {
    if (!filterClassId) return 'All Classes';
    const c = classes.find(a => a.id === filterClassId);
    return c ? c.name : 'All Classes';
  };

  // ==================== Loading ====================
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12, color: COLORS.textSecondary }}>Loading calendar...</Text>
      </View>
    );
  }

  // ==================== Summary Tab ====================
  const renderSummaryTab = () => {
    if (!selectedYearId) {
      return <Text style={styles.emptyText}>Please select an academic year above.</Text>;
    }
    if (summaries.length === 0) {
      return (
        <Text style={styles.emptyText}>
          No calendar entries found. Use the Bulk Entry tab to add working days.
        </Text>
      );
    }

    // Get all unique months
    const allMonths = [...new Set(summaries.flatMap(s => s.months.map(m => m.month)))].sort((a, b) => a - b);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header row */}
          <View style={styles.tableRow}>
            <View style={[styles.tableCell, styles.tableCellClass, styles.tableHeader]}>
              <Text style={styles.tableHeaderText}>Class</Text>
            </View>
            {allMonths.map(month => (
              <View key={month} style={[styles.tableCell, styles.tableHeader]}>
                <Text style={styles.tableHeaderText}>{MONTH_SHORT[month - 1]}</Text>
              </View>
            ))}
            <View style={[styles.tableCell, styles.tableHeader, { backgroundColor: '#EEF2FF' }]}>
              <Text style={[styles.tableHeaderText, { color: '#4338CA' }]}>Total</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.tableHeaderText, { color: '#DC2626' }]}>Holidays</Text>
            </View>
            <View style={[styles.tableCell, styles.tableHeader, { backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.tableHeaderText, { color: '#15803D' }]}>Effective</Text>
            </View>
          </View>

          {/* Data rows */}
          {summaries.map(s => {
            const monthMap = new Map(s.months.map(m => [m.month, m]));
            return (
              <View key={s.class_name_id} style={styles.tableRow}>
                <View style={[styles.tableCell, styles.tableCellClass]}>
                  <Text style={styles.tableCellClassText}>{s.class_name}</Text>
                </View>
                {allMonths.map(month => {
                  const m = monthMap.get(month);
                  return (
                    <View key={month} style={styles.tableCell}>
                      {m ? (
                        <>
                          <Text style={styles.tableCellValue}>{m.effective_working_days}</Text>
                          {m.holiday_count > 0 && (
                            <Text style={styles.tableCellHoliday}>-{m.holiday_count}h</Text>
                          )}
                        </>
                      ) : (
                        <Text style={styles.tableCellEmpty}>—</Text>
                      )}
                    </View>
                  );
                })}
                <View style={[styles.tableCell, { backgroundColor: '#EEF2FF' }]}>
                  <Text style={[styles.tableCellValue, { color: '#4338CA', fontWeight: '700' }]}>{s.total_working_days}</Text>
                </View>
                <View style={[styles.tableCell, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.tableCellValue, { color: '#DC2626', fontWeight: '700' }]}>{s.total_holidays}</Text>
                </View>
                <View style={[styles.tableCell, { backgroundColor: '#F0FDF4' }]}>
                  <Text style={[styles.tableCellValue, { color: '#15803D', fontWeight: '700' }]}>{s.total_effective_days}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  // ==================== Bulk Entry Tab ====================
  const renderBulkTab = () => {
    if (!isAdmin) {
      return <Text style={styles.emptyText}>Only administrators can create bulk entries.</Text>;
    }

    // Compute unique holidays from entries
    const holidayMap = new Map<string, { holiday_date: string; name: string; remarks?: string; classes: string[]; holidayIds: number[] }>();
    entries.forEach(entry => {
      entry.holidays.forEach(h => {
        const key = `${h.holiday_date}_${h.name}`;
        if (holidayMap.has(key)) {
          holidayMap.get(key)!.classes.push(entry.class_name || `Class ${entry.class_name_id}`);
          holidayMap.get(key)!.holidayIds.push(h.id);
        } else {
          holidayMap.set(key, {
            holiday_date: h.holiday_date,
            name: h.name,
            remarks: h.remarks,
            classes: [entry.class_name || `Class ${entry.class_name_id}`],
            holidayIds: [h.id],
          });
        }
      });
    });
    const uniqueHolidays = [...holidayMap.values()].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* ---- Section 1: Bulk Working Days ---- */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📋 Bulk Working Days Entry</Text>
          <Text style={styles.sectionDesc}>Select classes and months to set working days in bulk. Existing entries will be skipped.</Text>

          {/* Calendar Year */}
          <Text style={styles.fieldLabel}>Calendar Year</Text>
          <TextInput
            style={[styles.input, { width: 120 }]}
            value={String(bulkYear)}
            onChangeText={t => setBulkYear(parseInt(t) || new Date().getFullYear())}
            keyboardType="number-pad"
          />

          {/* Select Classes */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Select Classes</Text>
            <TouchableOpacity onPress={() => {
              if (bulkClassIds.length === classes.length) setBulkClassIds([]);
              else setBulkClassIds(classes.map(c => c.id));
            }}>
              <Text style={styles.linkText}>{bulkClassIds.length === classes.length ? 'Deselect All' : 'Select All'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipContainer}>
            {classes.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, bulkClassIds.includes(c.id) && styles.chipSelected]}
                onPress={() => toggleBulkClass(c.id)}
              >
                <Text style={[styles.chipText, bulkClassIds.includes(c.id) && styles.chipTextSelected]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Select Months */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Select Months</Text>
            <TouchableOpacity onPress={() => {
              const all = Array.from({ length: 12 }, (_, i) => i + 1);
              if (bulkMonths.length === 12) setBulkMonths([]);
              else setBulkMonths(all);
            }}>
              <Text style={styles.linkText}>{bulkMonths.length === 12 ? 'Deselect All' : 'Select All'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipContainer}>
            {MONTH_SHORT.map((name, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.chip, bulkMonths.includes(i + 1) && styles.chipSelected]}
                onPress={() => toggleBulkMonth(i + 1)}
              >
                <Text style={[styles.chipText, bulkMonths.includes(i + 1) && styles.chipTextSelected]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Working Days */}
          <Text style={styles.fieldLabel}>Working Days per Month</Text>
          <TextInput
            style={[styles.input, { width: 120 }]}
            value={bulkWorkingDays}
            onChangeText={setBulkWorkingDays}
            keyboardType="number-pad"
            maxLength={2}
          />

          {/* Preview */}
          {bulkClassIds.length > 0 && bulkMonths.length > 0 && (
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>
                {bulkClassIds.length} class(es) × {bulkMonths.length} month(s) ={' '}
                <Text style={{ fontWeight: '700', color: COLORS.primary }}>{bulkClassIds.length * bulkMonths.length}</Text>{' '}
                entries @ {bulkWorkingDays} working days each
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, (saving || !bulkClassIds.length || !bulkMonths.length || !selectedYearId) && styles.disabledBtn]}
            onPress={handleBulkCreate}
            disabled={saving || !bulkClassIds.length || !bulkMonths.length || !selectedYearId}
          >
            <Text style={styles.primaryBtnText}>{saving ? 'Creating...' : 'Create Bulk Entries'}</Text>
          </TouchableOpacity>
        </View>

        {/* ---- Section 2: Holiday Management ---- */}
        {selectedYearId && entries.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🎉 Manage Holidays</Text>
            <Text style={styles.sectionDesc}>Add or remove holidays. Holidays auto-subtract from working days.</Text>

            {/* Add Holiday Form */}
            <View style={styles.holidayForm}>
              <Text style={styles.holidayFormTitle}>Add Holiday to All Classes</Text>

              <Text style={styles.fieldLabel}>Holiday Date * (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={bulkHolidayDate}
                onChangeText={setBulkHolidayDate}
                placeholder="2025-01-26"
                placeholderTextColor={COLORS.textSecondary}
              />

              <Text style={styles.fieldLabel}>Holiday Name *</Text>
              <TextInput
                style={styles.input}
                value={bulkHolidayName}
                onChangeText={setBulkHolidayName}
                placeholder="e.g. Republic Day"
                placeholderTextColor={COLORS.textSecondary}
              />

              <Text style={styles.fieldLabel}>Remarks</Text>
              <TextInput
                style={styles.input}
                value={bulkHolidayRemarks}
                onChangeText={setBulkHolidayRemarks}
                placeholder="Optional"
                placeholderTextColor={COLORS.textSecondary}
              />

              {/* Optional class restriction */}
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { fontSize: 12 }]}>Apply to classes (empty = all):</Text>
                <TouchableOpacity onPress={() => {
                  if (bulkHolidayClassIds.length === classes.length) setBulkHolidayClassIds([]);
                  else setBulkHolidayClassIds(classes.map(c => c.id));
                }}>
                  <Text style={[styles.linkText, { fontSize: 12 }]}>
                    {bulkHolidayClassIds.length === classes.length ? 'Clear' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chipContainer}>
                {classes.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chipSmall, bulkHolidayClassIds.includes(c.id) && styles.chipSmallSelected]}
                    onPress={() => toggleBulkHolidayClass(c.id)}
                  >
                    <Text style={[styles.chipSmallText, bulkHolidayClassIds.includes(c.id) && styles.chipSmallTextSelected]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.orangeBtn, saving && styles.disabledBtn]}
                onPress={handleBulkHoliday}
                disabled={saving}
              >
                <Text style={styles.primaryBtnText}>{saving ? 'Adding...' : 'Add Holiday'}</Text>
              </TouchableOpacity>
            </View>

            {/* Existing Holidays List */}
            {uniqueHolidays.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Existing Holidays</Text>
                {uniqueHolidays.map(h => (
                  <View key={h.holiday_date + h.name} style={styles.holidayItem}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.holidayDate}>{h.holiday_date}</Text>
                        <Text style={styles.holidayNameText}>{h.name}</Text>
                      </View>
                      {h.remarks ? <Text style={styles.holidayRemarksText}>{h.remarks}</Text> : null}
                      <Text style={styles.holidayClasses}>
                        {[...new Set(h.classes)].length === classes.length
                          ? 'All Classes'
                          : [...new Set(h.classes)].join(', ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Remove Holiday', `Remove "${h.name}" from ${h.holidayIds.length} class(es)?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove All', style: 'destructive', onPress: async () => {
                              try {
                                for (const hid of h.holidayIds) {
                                  await apiClient.delete(`${API_ENDPOINTS.ACADEMIC_CALENDAR}/holidays/${hid}`);
                                }
                                fetchData();
                              } catch (err: any) {
                                Alert.alert('Error', err.response?.data?.detail || 'Failed to remove');
                              }
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {uniqueHolidays.length === 0 && (
              <Text style={[styles.emptyText, { marginTop: 8 }]}>No holidays added yet.</Text>
            )}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  // ==================== Detailed View Tab ====================
  const renderEntriesTab = () => {
    if (entries.length === 0) {
      return (
        <Text style={styles.emptyText}>
          No calendar entries. Use the Bulk Entry tab to add data.
        </Text>
      );
    }

    // Group by class
    const grouped: Record<string, CalendarEntry[]> = {};
    entries.forEach(e => {
      const key = e.class_name || `Class ${e.class_name_id}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {Object.entries(grouped).map(([className, classEntries]) => {
          const classId = classEntries[0].class_name_id;
          const isExpanded = expandedClass === classId;

          return (
            <View key={className} style={styles.accordionCard}>
              {/* Class header */}
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => setExpandedClass(isExpanded ? null : classId)}
              >
                <Text style={styles.accordionTitle}>{className}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.accordionMeta}>{classEntries.length} months</Text>
                  <Text style={styles.accordionArrow}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {/* Expanded months */}
              {isExpanded && classEntries.sort((a, b) => a.month - b.month).map(entry => (
                <View key={entry.id} style={styles.entryItem}>
                  <View style={styles.entryHeader}>
                    <Text style={styles.entryMonth}>{MONTH_NAMES[entry.month - 1]}</Text>

                    {editingId === entry.id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          style={[styles.input, { width: 60, paddingVertical: 4, marginBottom: 0 }]}
                          value={editWorkingDays}
                          onChangeText={setEditWorkingDays}
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                        <TouchableOpacity onPress={() => handleUpdateWorkingDays(entry.id)}>
                          <Text style={[styles.linkText, { color: '#16A34A' }]}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingId(null)}>
                          <Text style={[styles.linkText, { color: COLORS.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.entryInfo}>
                          <Text style={{ fontWeight: '600' }}>{entry.total_working_days}</Text> working days
                          {entry.holiday_count > 0 && (
                            <Text style={{ color: '#DC2626' }}> - {entry.holiday_count} holiday(s)</Text>
                          )}
                          <Text style={{ color: '#15803D', fontWeight: '600' }}> = {entry.effective_working_days} effective</Text>
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action buttons */}
                  {isAdmin && editingId !== entry.id && (
                    <View style={styles.entryActions}>
                      <TouchableOpacity onPress={() => { setEditingId(entry.id); setEditWorkingDays(String(entry.total_working_days)); }}>
                        <Text style={[styles.actionLink, { color: COLORS.primary }]}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        setHolidayEntryId(entry.id);
                        setHolidayDate('');
                        setHolidayName('');
                        setHolidayRemarks('');
                      }}>
                        <Text style={[styles.actionLink, { color: '#F97316' }]}>+ Holiday</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteEntry(entry.id)}>
                        <Text style={[styles.actionLink, { color: '#DC2626' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Holiday list */}
                  {entry.holidays.length > 0 && (
                    <View style={styles.holidayList}>
                      {entry.holidays.map(h => (
                        <View key={h.id} style={styles.holidayListItem}>
                          <Text style={styles.holidayListDate}>{h.holiday_date}</Text>
                          <Text style={styles.holidayListName}>{h.name}</Text>
                          {h.remarks ? <Text style={styles.holidayListRemarks}>— {h.remarks}</Text> : null}
                          {isAdmin && (
                            <TouchableOpacity
                              style={{ marginLeft: 'auto' }}
                              onPress={() => handleRemoveHoliday(h.id, h.name)}
                            >
                              <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 16 }}>×</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Add holiday inline form */}
                  {holidayEntryId === entry.id && (
                    <View style={styles.inlineHolidayForm}>
                      <Text style={[styles.fieldLabel, { fontSize: 12 }]}>Date * (YYYY-MM-DD)</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 8 }]}
                        value={holidayDate}
                        onChangeText={setHolidayDate}
                        placeholder="2025-08-15"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                      <Text style={[styles.fieldLabel, { fontSize: 12 }]}>Holiday Name *</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 8 }]}
                        value={holidayName}
                        onChangeText={setHolidayName}
                        placeholder="e.g. Independence Day"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                      <Text style={[styles.fieldLabel, { fontSize: 12 }]}>Remarks</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 8 }]}
                        value={holidayRemarks}
                        onChangeText={setHolidayRemarks}
                        placeholder="Optional"
                        placeholderTextColor={COLORS.textSecondary}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.orangeBtn, { flex: 1 }, saving && styles.disabledBtn]}
                          onPress={handleAddHoliday}
                          disabled={saving}
                        >
                          <Text style={styles.primaryBtnText}>{saving ? 'Adding...' : 'Add'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.secondaryBtn, { flex: 1 }]}
                          onPress={() => setHolidayEntryId(null)}
                        >
                          <Text style={styles.secondaryBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  // ==================== Main Render ====================
  return (
    <View style={styles.container}>
      {/* Header with filters */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📅 Academic Calendar</Text>
        <View style={styles.headerFilters}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowYearPicker(true)}>
            <Text style={styles.filterBtnText} numberOfLines={1}>{getSelectedYearName()}</Text>
            <Text style={styles.filterArrow}>▼</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setShowClassPicker(true)}>
            <Text style={styles.filterBtnText} numberOfLines={1}>{getSelectedClassName()}</Text>
            <Text style={styles.filterArrow}>▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {([
          { key: 'summary' as TabKey, label: 'Summary' },
          { key: 'bulk' as TabKey, label: 'Bulk Entry' },
          { key: 'entries' as TabKey, label: 'Detailed View' },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'summary' && renderSummaryTab()}
        {activeTab === 'bulk' && renderBulkTab()}
        {activeTab === 'entries' && renderEntriesTab()}
      </View>

      {/* Year Picker Modal */}
      <Modal visible={showYearPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowYearPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Select Academic Year</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {academicYears.map(y => (
                <TouchableOpacity
                  key={y.id}
                  style={[styles.pickerOption, selectedYearId === y.id && styles.pickerOptionSelected]}
                  onPress={() => { setSelectedYearId(y.id); setShowYearPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, selectedYearId === y.id && styles.pickerOptionTextSelected]}>
                    {y.name} {y.is_current ? '(Current)' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Class Filter Picker Modal */}
      <Modal visible={showClassPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowClassPicker(false)}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Filter by Class</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              <TouchableOpacity
                style={[styles.pickerOption, filterClassId === 0 && styles.pickerOptionSelected]}
                onPress={() => { setFilterClassId(0); setShowClassPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, filterClassId === 0 && styles.pickerOptionTextSelected]}>
                  All Classes
                </Text>
              </TouchableOpacity>
              {classes.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pickerOption, filterClassId === c.id && styles.pickerOptionSelected]}
                  onPress={() => { setFilterClassId(c.id); setShowClassPicker(false); }}
                >
                  <Text style={[styles.pickerOptionText, filterClassId === c.id && styles.pickerOptionTextSelected]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ==================== Styles ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    backgroundColor: '#4B5563',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 10 },
  headerFilters: { flexDirection: 'row', gap: 8 },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  filterBtnText: { flex: 1, color: '#fff', fontSize: 13 },
  filterArrow: { color: '#9CA3AF', fontSize: 10, marginLeft: 6 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary, fontWeight: '600' },
  tabContent: { flex: 1, padding: 12 },

  // Empty
  emptyText: { textAlign: 'center', color: COLORS.textSecondary, marginTop: 40, fontSize: 14, paddingHorizontal: 20 },

  // Summary table
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableCell: {
    width: 56,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCellClass: { width: 80, alignItems: 'flex-start', paddingLeft: 8 },
  tableHeader: { backgroundColor: '#F3F4F6' },
  tableHeaderText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  tableCellClassText: { fontSize: 12, fontWeight: '600', color: '#1F2937' },
  tableCellValue: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  tableCellHoliday: { fontSize: 9, color: '#DC2626', marginTop: 1 },
  tableCellEmpty: { fontSize: 12, color: '#D1D5DB' },

  // Section card (bulk tab)
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 16 },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 4,
  },

  // Chips
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  chipSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  chipSmallSelected: { backgroundColor: '#F97316', borderColor: '#F97316' },
  chipSmallText: { fontSize: 11, color: '#4B5563' },
  chipSmallTextSelected: { color: '#fff', fontWeight: '600' },

  // Preview
  previewBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewText: { fontSize: 13, color: '#4B5563' },

  // Buttons
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  orangeBtn: {
    backgroundColor: '#F97316',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryBtn: {
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  disabledBtn: { opacity: 0.5 },

  // Link text
  linkText: { color: COLORS.primary, fontSize: 13, fontWeight: '500' },

  // Holiday form (bulk tab)
  holidayForm: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 4,
  },
  holidayFormTitle: { fontSize: 14, fontWeight: '600', color: '#9A3412', marginBottom: 4 },

  // Holiday items in bulk tab
  holidayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  holidayDate: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  holidayNameText: { fontSize: 13, fontWeight: '500', color: '#1F2937' },
  holidayRemarksText: { fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 },
  holidayClasses: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  removeText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },

  // Accordion (entries tab)
  accordionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
  },
  accordionTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  accordionMeta: { fontSize: 11, color: COLORS.textSecondary },
  accordionArrow: { fontSize: 12, color: COLORS.textSecondary },

  // Entry items (entries tab)
  entryItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryMonth: { fontSize: 14, fontWeight: '600', color: '#1F2937', width: 80 },
  entryInfo: { fontSize: 12, color: '#4B5563' },
  entryActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginLeft: 80,
  },
  actionLink: { fontSize: 12, fontWeight: '600' },

  // Holiday list in entries tab
  holidayList: { marginTop: 8, marginLeft: 20 },
  holidayListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    gap: 8,
  },
  holidayListDate: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
  holidayListName: { fontSize: 12, color: '#374151' },
  holidayListRemarks: { fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' },

  // Inline holiday form in entries tab
  inlineHolidayForm: {
    marginTop: 10,
    marginLeft: 20,
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },

  // Picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '60%',
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 12 },
  pickerOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionSelected: { backgroundColor: '#EEF2FF' },
  pickerOptionText: { fontSize: 14, color: '#374151' },
  pickerOptionTextSelected: { color: COLORS.primary, fontWeight: '600' },
});

export default AcademicCalendarScreen;
