import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';
import { API_ENDPOINTS, COLORS, ROLES } from '../config/constants';
import { Student } from '../types';
import OfflineIndicator from '../components/OfflineIndicator';
import { demoStudents } from '../services/demoData';

interface ChildInfo {
  id: number;
  first_name: string;
  surname: string;
  admission_number: string;
  class_name: string | null;
  section_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  father_guardian_name: string | null;
  mother_name: string | null;
  mobile_number: string | null;
  photo_thumbnail: string | null;
  is_active: boolean;
}

interface ClassInfo {
  id: number;
  class_name: string;
  section_name: string;
  display_name: string;
}

interface SearchOptions {
  class_names: string[];
  sections: string[];
}

const PAGE_SIZE = 20;

const StudentsScreen = () => {
  const { isDemoMode, user } = useAuth();
  const isParent = user?.role === ROLES.PARENT;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Data
  const [students, setStudents] = useState<Student[]>([]);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({ class_names: [], sections: [] });

  // Loading
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassName, setFilterClassName] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterAadhaar, setFilterAadhaar] = useState('');
  const [filterAdmission, setFilterAdmission] = useState('');
  const [filterMobile, setFilterMobile] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Picker modals
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showFilterClassPicker, setShowFilterClassPicker] = useState(false);
  const [showFilterSectionPicker, setShowFilterSectionPicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    admission_number: '',
    first_name: '',
    surname: '',
    father_guardian_name: '',
    mother_name: '',
    mobile_number: '',
    phone_number: '',
    aadhaar_number: '',
    pen: '',
    class_id: undefined as number | undefined,
    gender: '',
    date_of_birth: '',
    email: '',
    address: '',
    blood_group: '',
    caste: '',
    session_timings: '',
    rfid_id: '',
  });

  // ======= Data Loading =======
  useEffect(() => {
    loadSearchOptions();
    loadClasses();
    fetchStudents(1, false);
  }, []);

  const loadSearchOptions = async () => {
    try {
      const data = await apiClient.get<SearchOptions>(API_ENDPOINTS.STUDENTS_SEARCH_OPTIONS);
      setSearchOptions(data);
    } catch (err) {
      console.error('Failed to load search options:', err);
    }
  };

  const loadClasses = async () => {
    try {
      const data = await apiClient.get<ClassInfo[]>(API_ENDPOINTS.STUDENTS_CLASSES);
      setClasses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  const buildQueryString = (pageNum: number) => {
    let qs = `?page=${pageNum}&page_size=${PAGE_SIZE}&is_active=true`;
    if (searchQuery.trim()) qs += `&search=${encodeURIComponent(searchQuery.trim())}`;
    if (filterClassName) qs += `&class_name=${encodeURIComponent(filterClassName)}`;
    if (filterSection) qs += `&section=${encodeURIComponent(filterSection)}`;
    if (filterAadhaar.trim()) qs += `&aadhaar_number=${encodeURIComponent(filterAadhaar.trim())}`;
    if (filterAdmission.trim()) qs += `&admission_number=${encodeURIComponent(filterAdmission.trim())}`;
    if (filterMobile.trim()) qs += `&mobile_number=${encodeURIComponent(filterMobile.trim())}`;
    return qs;
  };

  const fetchStudents = async (pageNum: number = 1, append: boolean = false) => {
    if (isDemoMode) {
      setStudents(demoStudents);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      if (isParent) {
        const data = await apiClient.get<ChildInfo[]>(API_ENDPOINTS.MY_CHILDREN);
        setChildren(data);
      } else {
        const qs = buildQueryString(pageNum);
        const data = await apiClient.get<any>(`${API_ENDPOINTS.STUDENTS}${qs}`);
        const list: Student[] = Array.isArray(data) ? data : (data.students || []);
        const total = data.total || 0;
        setTotalStudents(total);
        if (append) {
          setStudents(prev => [...prev, ...list]);
        } else {
          setStudents(list);
        }
        setHasMore(pageNum * PAGE_SIZE < total);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore && !loading) {
      setLoadingMore(true);
      fetchStudents(page + 1, true);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    fetchStudents(1, false);
  };

  const handleSearch = () => {
    setLoading(true);
    setHasMore(true);
    fetchStudents(1, false);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterClassName('');
    setFilterSection('');
    setFilterAadhaar('');
    setFilterAdmission('');
    setFilterMobile('');
    setLoading(true);
    setHasMore(true);
    setTimeout(() => { fetchStudents(1, false); }, 50);
  };

  // ======= CRUD =======
  const resetForm = () => {
    setFormData({
      admission_number: '', first_name: '', surname: '', father_guardian_name: '',
      mother_name: '', mobile_number: '', phone_number: '', aadhaar_number: '',
      pen: '', class_id: undefined, gender: '', date_of_birth: '', email: '',
      address: '', blood_group: '', caste: '', session_timings: '', rfid_id: '',
    });
  };

  const openAddModal = () => {
    resetForm();
    setEditingStudent(null);
    setShowAddModal(true);
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      admission_number: student.admission_number || '',
      first_name: student.first_name || '',
      surname: student.surname || '',
      father_guardian_name: student.father_guardian_name || '',
      mother_name: student.mother_name || '',
      mobile_number: student.mobile_number || '',
      phone_number: student.phone_number || '',
      aadhaar_number: student.aadhaar_number || '',
      pen: student.pen || '',
      class_id: student.class_id,
      gender: student.gender || '',
      date_of_birth: student.date_of_birth || '',
      email: student.email || '',
      address: student.address || '',
      blood_group: student.blood_group || '',
      caste: student.caste || '',
      session_timings: student.session_timings || '',
      rfid_id: student.rfid_id || '',
    });
    setShowAddModal(true);
  };

  const openViewModal = async (student: Student) => {
    setViewingStudent(student);
    setShowViewModal(true);
    setLoadingDetail(true);
    try {
      const full = await apiClient.get<Student>(API_ENDPOINTS.STUDENT_DETAIL(student.id));
      setViewingStudent(full);
    } catch (err) {
      console.error('Failed to load student details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSave = async () => {
    if (!formData.first_name.trim()) {
      Alert.alert('Validation', 'First name is required');
      return;
    }
    if (!formData.admission_number.trim() && !editingStudent) {
      Alert.alert('Validation', 'Admission number is required');
      return;
    }
    if (/\d/.test(formData.first_name)) {
      Alert.alert('Validation', 'First name should not contain numbers');
      return;
    }
    if (formData.surname && /\d/.test(formData.surname)) {
      Alert.alert('Validation', 'Surname should not contain numbers');
      return;
    }
    if (formData.mobile_number && /[^0-9]/.test(formData.mobile_number)) {
      Alert.alert('Validation', 'Mobile number must contain only digits');
      return;
    }
    if (formData.aadhaar_number && (formData.aadhaar_number.length !== 12 || /[^0-9]/.test(formData.aadhaar_number))) {
      Alert.alert('Validation', 'Aadhaar number must be exactly 12 digits');
      return;
    }

    setSaving(true);
    try {
      const cleanedData: Record<string, any> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value === '' || value === undefined) continue;
        cleanedData[key] = value;
      }
      if (!editingStudent) {
        cleanedData.admission_number = formData.admission_number;
        cleanedData.first_name = formData.first_name;
      }

      if (editingStudent) {
        await apiClient.put(API_ENDPOINTS.STUDENT_DETAIL(editingStudent.id), cleanedData);
        Alert.alert('Success', 'Student updated successfully');
      } else {
        await apiClient.post(API_ENDPOINTS.STUDENTS, cleanedData);
        Alert.alert('Success', 'Student created successfully');
      }
      setShowAddModal(false);
      resetForm();
      setEditingStudent(null);
      fetchStudents(1, false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to save student';
      const msg = Array.isArray(detail) ? detail.map((e: any) => e.msg || JSON.stringify(e)).join('\n') : detail;
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (student: Student) => {
    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to deactivate ${student.surname ? `${student.surname} ${student.first_name}` : student.first_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await apiClient.delete(API_ENDPOINTS.STUDENT_DETAIL(student.id));
              Alert.alert('Success', 'Student deactivated');
              fetchStudents(1, false);
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || 'Failed to delete student');
            }
          }
        },
      ]
    );
  };

  const handleExport = async () => {
    Alert.alert('Export', 'CSV export is available via the web portal. Please use the web app to download CSV files.');
  };

  // ======= Render Helpers =======
  const getClassDisplayName = (classId?: number) => {
    if (!classId) return '';
    const c = classes.find(cl => cl.id === classId);
    return c ? c.display_name : '';
  };

  const renderFilterRow = () => (
    <View style={styles.filterSection}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, admission no..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.toggleFilterBtn}>
        <Text style={styles.toggleFilterText}>
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Text>
      </TouchableOpacity>

      {showFilters && (
        <View style={styles.filtersContainer}>
          <Text style={styles.filterLabel}>Class Name</Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowFilterClassPicker(true)}>
            <Text style={filterClassName ? styles.pickerText : styles.pickerPlaceholder}>
              {filterClassName || 'All Classes'}
            </Text>
            <Text style={styles.pickerArrow}>{'\u25BC'}</Text>
          </TouchableOpacity>

          <Text style={styles.filterLabel}>Section</Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowFilterSectionPicker(true)}>
            <Text style={filterSection ? styles.pickerText : styles.pickerPlaceholder}>
              {filterSection || 'All Sections'}
            </Text>
            <Text style={styles.pickerArrow}>{'\u25BC'}</Text>
          </TouchableOpacity>

          <Text style={styles.filterLabel}>Aadhaar Number</Text>
          <TextInput style={styles.filterInput} placeholder="Search by Aadhaar..." placeholderTextColor="#999" value={filterAadhaar} onChangeText={setFilterAadhaar} keyboardType="numeric" />

          <Text style={styles.filterLabel}>Admission Number</Text>
          <TextInput style={styles.filterInput} placeholder="Search by Admission No..." placeholderTextColor="#999" value={filterAdmission} onChangeText={setFilterAdmission} />

          <Text style={styles.filterLabel}>Mobile Number</Text>
          <TextInput style={styles.filterInput} placeholder="Search by Mobile..." placeholderTextColor="#999" value={filterMobile} onChangeText={setFilterMobile} keyboardType="phone-pad" />

          <View style={styles.filterBtnRow}>
            <TouchableOpacity style={styles.applyFilterBtn} onPress={handleSearch}>
              <Text style={styles.applyFilterText}>Apply Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearFilterBtn} onPress={handleClearFilters}>
              <Text style={styles.clearFilterText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity style={styles.studentCard} onPress={() => openViewModal(item)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        {item.photo_thumbnail ? (
          <Image source={{ uri: item.photo_thumbnail }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.first_name?.charAt(0)?.toUpperCase()}{(item.surname || '').charAt(0)?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.studentName}>
            {item.surname ? `${item.surname} ${item.first_name}` : item.first_name}
          </Text>
          <Text style={styles.admNo}>{item.admission_number}</Text>
          <Text style={styles.classText}>
            {item.class_name || '-'} {item.section_name ? `- ${item.section_name}` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}>
          <Text style={[styles.statusText, item.is_active ? styles.activeText : styles.inactiveText]}>
            {item.is_active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        {item.father_guardian_name ? (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Father/Guardian</Text>
            <Text style={styles.detailValue}>{item.father_guardian_name}</Text>
          </View>
        ) : null}
        {item.mobile_number ? (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Mobile</Text>
            <Text style={styles.detailValue}>{item.mobile_number}</Text>
          </View>
        ) : null}
      </View>

      {isAdmin && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.viewBtn} onPress={() => openViewModal(item)}>
            <Text style={styles.viewBtnText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <Text style={styles.deleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderChild = ({ item }: { item: ChildInfo }) => (
    <View style={styles.studentCard}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.first_name.charAt(0)}{(item.surname || '').charAt(0)}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.studentName}>{item.first_name} {item.surname || ''}</Text>
          <Text style={styles.admNo}>{item.admission_number}</Text>
          <Text style={styles.classText}>{item.class_name} {item.section_name ? `- ${item.section_name}` : ''}</Text>
        </View>
      </View>
      {item.gender && <Text style={styles.childDetail}>Gender: {item.gender}</Text>}
      {item.date_of_birth && <Text style={styles.childDetail}>DOB: {new Date(item.date_of_birth).toLocaleDateString()}</Text>}
      {item.father_guardian_name && <Text style={styles.childDetail}>Father: {item.father_guardian_name}</Text>}
      {item.mobile_number && <Text style={styles.childDetail}>Mobile: {item.mobile_number}</Text>}
    </View>
  );

  // ======= Form Input Helper =======
  const renderFormInput = (label: string, key: keyof typeof formData, options?: {
    required?: boolean; placeholder?: string; keyboardType?: any; disabled?: boolean; multiline?: boolean;
  }) => (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}{options?.required ? ' *' : ''}</Text>
      <TextInput
        style={[styles.formInput, options?.multiline && styles.formTextarea, options?.disabled && styles.formDisabled]}
        value={String(formData[key] || '')}
        onChangeText={val => setFormData(prev => ({ ...prev, [key]: val }))}
        placeholder={options?.placeholder || ''}
        placeholderTextColor="#999"
        keyboardType={options?.keyboardType || 'default'}
        editable={!options?.disabled}
        multiline={options?.multiline}
      />
    </View>
  );

  // ======= Picker Modal Helper =======
  const renderPickerModal = (
    visible: boolean, onClose: () => void, title: string,
    items: { label: string; value: string }[], selectedValue: string,
    onSelect: (value: string) => void
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerModal}>
          <Text style={styles.pickerModalTitle}>{title}</Text>
          <ScrollView style={styles.pickerList}>
            {items.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.pickerItem, selectedValue === item.value && styles.pickerItemSelected]}
                onPress={() => { onSelect(item.value); onClose(); }}
              >
                <Text style={[styles.pickerItemText, selectedValue === item.value && styles.pickerItemTextSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.pickerCloseBtn} onPress={onClose}>
            <Text style={styles.pickerCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // ======= Add/Edit Modal =======
  const renderAddEditModal = () => (
    <Modal visible={showAddModal} animationType="slide" onRequestClose={() => setShowAddModal(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingStudent ? 'Edit Student' : 'Add New Student'}</Text>
            <TouchableOpacity onPress={() => { setShowAddModal(false); setEditingStudent(null); resetForm(); }}>
              <Text style={styles.modalCloseX}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            {renderFormInput('Admission Number', 'admission_number', { required: true, placeholder: 'e.g., KTSN20251', disabled: !!editingStudent })}
            {renderFormInput('First Name', 'first_name', { required: true, placeholder: 'First name' })}
            {renderFormInput('Surname', 'surname', { placeholder: 'Surname' })}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Gender</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowGenderPicker(true)}>
                <Text style={formData.gender ? styles.pickerText : styles.pickerPlaceholder}>
                  {formData.gender || 'Select Gender'}
                </Text>
                <Text style={styles.pickerArrow}>{'\u25BC'}</Text>
              </TouchableOpacity>
            </View>

            {renderFormInput('Date of Birth', 'date_of_birth', { placeholder: 'YYYY-MM-DD' })}

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Class & Section</Text>
              <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowClassPicker(true)}>
                <Text style={formData.class_id ? styles.pickerText : styles.pickerPlaceholder}>
                  {getClassDisplayName(formData.class_id) || 'Select Class'}
                </Text>
                <Text style={styles.pickerArrow}>{'\u25BC'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Contact Information</Text>
            {renderFormInput('Father/Guardian', 'father_guardian_name', { placeholder: 'Father/Guardian name' })}
            {renderFormInput('Mother Name', 'mother_name', { placeholder: 'Mother name' })}
            {renderFormInput('Mobile Number', 'mobile_number', { placeholder: 'Mobile number', keyboardType: 'phone-pad' })}
            {renderFormInput('Phone Number', 'phone_number', { placeholder: 'Phone number', keyboardType: 'phone-pad' })}
            {renderFormInput('Email', 'email', { placeholder: 'Email address', keyboardType: 'email-address' })}
            {renderFormInput('Address', 'address', { placeholder: 'Full address', multiline: true })}

            <Text style={styles.sectionTitle}>Other Details</Text>
            {renderFormInput('Aadhaar Number', 'aadhaar_number', { placeholder: '12-digit Aadhaar', keyboardType: 'numeric' })}
            {renderFormInput('PEN', 'pen', { placeholder: 'Permanent Education Number' })}
            {renderFormInput('Blood Group', 'blood_group', { placeholder: 'e.g., A+, B-, O+' })}
            {renderFormInput('Caste', 'caste', { placeholder: 'Caste' })}
            {renderFormInput('Session Timings', 'session_timings', { placeholder: 'e.g., Morning, Afternoon' })}
            {renderFormInput('RFID ID', 'rfid_id', { placeholder: 'RFID card number' })}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowAddModal(false); setEditingStudent(null); resetForm(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                <Text style={styles.saveBtnText}>{editingStudent ? 'Update' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {renderPickerModal(showGenderPicker, () => setShowGenderPicker(false), 'Select Gender',
        [{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }, { label: 'Other', value: 'Other' }],
        formData.gender,
        (val) => setFormData(prev => ({ ...prev, gender: val }))
      )}

      {renderPickerModal(showClassPicker, () => setShowClassPicker(false), 'Select Class & Section',
        classes.map(c => ({ label: c.display_name, value: String(c.id) })),
        String(formData.class_id || ''),
        (val) => setFormData(prev => ({ ...prev, class_id: parseInt(val) || undefined }))
      )}
    </Modal>
  );

  // ======= View Student Detail Modal =======
  const renderViewModal = () => {
    if (!viewingStudent) return null;
    const s = viewingStudent;
    const detailRow = (label: string, value?: string | null) => value ? (
      <View style={styles.viewRow}>
        <Text style={styles.viewLabel}>{label}</Text>
        <Text style={styles.viewValue}>{value}</Text>
      </View>
    ) : null;

    return (
      <Modal visible={showViewModal} animationType="slide" onRequestClose={() => setShowViewModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Student Details</Text>
            <TouchableOpacity onPress={() => setShowViewModal(false)}>
              <Text style={styles.modalCloseX}>X</Text>
            </TouchableOpacity>
          </View>

          {loadingDetail ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.viewHeader}>
                {s.photo_thumbnail || s.photo_data ? (
                  <Image source={{ uri: s.photo_data || s.photo_thumbnail }} style={styles.viewPhoto} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { width: 80, height: 80, borderRadius: 40 }]}>
                    <Text style={[styles.avatarText, { fontSize: 28 }]}>
                      {s.first_name?.charAt(0)?.toUpperCase()}{(s.surname || '').charAt(0)?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ marginLeft: 16, flex: 1 }}>
                  <Text style={styles.viewName}>
                    {s.surname ? `${s.surname} ${s.first_name}` : s.first_name}
                  </Text>
                  <Text style={styles.viewAdm}>{s.admission_number}</Text>
                  <View style={[styles.statusBadge, s.is_active ? styles.activeBadge : styles.inactiveBadge, { marginTop: 4 }]}>
                    <Text style={[styles.statusText, s.is_active ? styles.activeText : styles.inactiveText]}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Personal Information</Text>
              {detailRow('Gender', s.gender)}
              {detailRow('Date of Birth', s.date_of_birth)}
              {detailRow('Blood Group', s.blood_group)}
              {detailRow('Caste', s.caste)}
              {detailRow('Aadhaar Number', s.aadhaar_number)}
              {detailRow('PEN', s.pen)}
              {detailRow('RFID ID', s.rfid_id)}

              <Text style={styles.sectionTitle}>Academic Details</Text>
              {detailRow('Class', s.class_name)}
              {detailRow('Section', s.section_name)}
              {detailRow('Roll Number', s.roll_number)}
              {detailRow('Session Timings', s.session_timings)}

              <Text style={styles.sectionTitle}>Contact Information</Text>
              {detailRow('Father/Guardian', s.father_guardian_name)}
              {detailRow('Mother Name', s.mother_name)}
              {detailRow('Mobile', s.mobile_number)}
              {detailRow('Phone', s.phone_number)}
              {detailRow('Email', s.email)}
              {detailRow('Address', s.address)}
            </ScrollView>
          )}

          {isAdmin && (
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.editFullBtn} onPress={() => { setShowViewModal(false); openEditModal(s); }}>
                <Text style={styles.editFullBtnText}>Edit Student</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  // ======= Main Render =======
  if (loading && students.length === 0 && children.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 8, color: '#999' }}>Loading students...</Text>
      </View>
    );
  }

  if (isParent) {
    return (
      <View style={{ flex: 1 }}>
        <OfflineIndicator />
        <View style={styles.container}>
          <View style={styles.countBar}>
            <Text style={styles.countText}>My Children: {children.length}</Text>
          </View>
          <FlatList
            data={children}
            renderItem={renderChild}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No children linked</Text>
              </View>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.headerTitle}>Student Management</Text>
        </View>

        {isAdmin && (
          <View style={styles.actionsBar}>
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
              <Text style={styles.addBtnText}>+ Add Student</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
              <Text style={styles.exportBtnText}>Export CSV</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.countBar}>
          <Text style={styles.countText}>Total: {totalStudents} students</Text>
        </View>

        {renderFilterRow()}

        <FlatList
          data={students}
          renderItem={renderStudent}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} /> : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>{'\uD83C\uDF93'}</Text>
              <Text style={styles.emptyText}>No students found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
            </View>
          }
        />
      </View>

      {renderAddEditModal()}
      {renderViewModal()}

      {renderPickerModal(showFilterClassPicker, () => setShowFilterClassPicker(false), 'Select Class',
        [{ label: 'All Classes', value: '' }, ...searchOptions.class_names.map(c => ({ label: c, value: c }))],
        filterClassName,
        (val) => setFilterClassName(val)
      )}
      {renderPickerModal(showFilterSectionPicker, () => setShowFilterSectionPicker(false), 'Select Section',
        [{ label: 'All Sections', value: '' }, ...searchOptions.sections.map(s => ({ label: s, value: s }))],
        filterSection,
        (val) => setFilterSection(val)
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  topBar: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  actionsBar: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  addBtn: { flex: 1, backgroundColor: '#4f46e5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  exportBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  exportBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  countBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  countText: { fontSize: 14, fontWeight: '600', color: '#666' },

  filterSection: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#ddd' },
  searchBtn: { backgroundColor: '#4f46e5', paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  toggleFilterBtn: { paddingHorizontal: 16, paddingBottom: 10 },
  toggleFilterText: { color: '#4f46e5', fontSize: 13, fontWeight: '500' },
  filtersContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  filterLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 8, marginBottom: 4 },
  filterInput: { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#ddd' },
  filterBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  applyFilterBtn: { flex: 1, backgroundColor: '#4f46e5', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  applyFilterText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  clearFilterBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  clearFilterText: { color: '#555', fontWeight: '600', fontSize: 14 },

  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#ddd' },
  pickerText: { fontSize: 14, color: '#333' },
  pickerPlaceholder: { fontSize: 14, color: '#999' },
  pickerArrow: { fontSize: 12, color: '#999' },

  listContainer: { padding: 12 },

  studentCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  cardInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  admNo: { fontSize: 12, color: '#4f46e5', fontWeight: '500', marginTop: 1 },
  classText: { fontSize: 12, color: '#666', marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  activeBadge: { backgroundColor: '#d1fae5' },
  inactiveBadge: { backgroundColor: '#fee2e2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  activeText: { color: '#065f46' },
  inactiveText: { color: '#991b1b' },

  detailsRow: { flexDirection: 'row', marginTop: 10, gap: 16 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#999', fontWeight: '500' },
  detailValue: { fontSize: 13, color: '#333', marginTop: 1 },

  actionRow: { flexDirection: 'row', marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 },
  viewBtn: { flex: 1, backgroundColor: '#ecfdf5', paddingVertical: 7, borderRadius: 6, alignItems: 'center' },
  viewBtnText: { color: '#059669', fontWeight: '600', fontSize: 13 },
  editBtn: { flex: 1, backgroundColor: '#eef2ff', paddingVertical: 7, borderRadius: 6, alignItems: 'center' },
  editBtnText: { color: '#4f46e5', fontWeight: '600', fontSize: 13 },
  deleteBtn: { flex: 1, backgroundColor: '#fef2f2', paddingVertical: 7, borderRadius: 6, alignItems: 'center' },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },

  childDetail: { fontSize: 13, color: '#666', marginTop: 3, paddingLeft: 62 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#666' },
  emptySubtext: { fontSize: 13, color: '#999', marginTop: 4 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.primary },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  modalCloseX: { fontSize: 20, color: '#fff', fontWeight: 'bold', paddingHorizontal: 8 },
  modalBody: { flex: 1, padding: 16 },
  modalFooter: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0', backgroundColor: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 18, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#eee' },

  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  formInput: { backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#ddd' },
  formTextarea: { minHeight: 80, textAlignVertical: 'top' },
  formDisabled: { backgroundColor: '#f0f0f0', color: '#999' },

  cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  editFullBtn: { flex: 1, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  editFullBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  pickerModal: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', padding: 16 },
  pickerModalTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12, textAlign: 'center' },
  pickerList: { maxHeight: 300 },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  pickerItemSelected: { backgroundColor: '#eef2ff' },
  pickerItemText: { fontSize: 15, color: '#333' },
  pickerItemTextSelected: { color: '#4f46e5', fontWeight: '600' },
  pickerCloseBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  pickerCloseBtnText: { color: '#555', fontWeight: '600', fontSize: 15 },

  viewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  viewPhoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#e0e0e0' },
  viewName: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  viewAdm: { fontSize: 13, color: '#4f46e5', fontWeight: '500', marginTop: 2 },
  viewRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  viewLabel: { width: 130, fontSize: 13, fontWeight: '600', color: '#888' },
  viewValue: { flex: 1, fontSize: 14, color: '#333' },
});

export default StudentsScreen;
