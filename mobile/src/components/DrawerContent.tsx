import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, LayoutAnimation, Platform, UIManager } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, ROLES } from '../config/constants';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Menu item component
const MenuItem = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.6}>
    <Text style={styles.menuIcon}>{icon}</Text>
    <Text style={styles.menuLabel}>{label}</Text>
  </TouchableOpacity>
);

// Sub-menu item (indented child)
const SubMenuItem = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.subMenuItem} onPress={onPress} activeOpacity={0.6}>
    <View style={styles.subDot} />
    <Text style={styles.subMenuIcon}>{icon}</Text>
    <Text style={styles.subMenuLabel}>{label}</Text>
  </TouchableOpacity>
);

// Expandable parent menu
const ExpandableMenu = ({ icon, label, expanded, onToggle, children }: {
  icon: string; label: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) => (
  <View>
    <TouchableOpacity style={styles.menuItem} onPress={onToggle} activeOpacity={0.6}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuLabel, { flex: 1 }]}>{label}</Text>
      <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
    </TouchableOpacity>
    {expanded && (
      <View style={styles.subMenuContainer}>
        {children}
      </View>
    )}
  </View>
);

const DrawerContent = (props: any) => {
  const { user, logout, isDemoMode } = useAuth();
  const isParent = user?.role === ROLES.PARENT;
  const isAdmin = user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.ADMIN;
  const isTeacher = user?.role === 'teacher';
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // For parent users, show phone number instead of @parent.local email
  const displayEmail = user?.email?.endsWith('@parent.local')
    ? user?.phone || user?.email?.split('@')[0]
    : user?.email;

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); } },
    ]);
  };

  const nav = (screen: string) => {
    props.navigation.navigate(screen);
    props.navigation.closeDrawer();
  };

  return (
    <View style={styles.container}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
        {/* User Section */}
        <View style={styles.userSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.full_name?.charAt(0) || user?.username?.charAt(0) || 'U'}
            </Text>
          </View>
          <Text style={styles.userName}>{user?.full_name || user?.username}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role}</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          {/* Dashboard - direct link */}
          <MenuItem icon="📊" label="Dashboard" onPress={() => nav('Dashboard')} />

          {/* Students */}
          {isParent ? (
            <MenuItem icon="👨‍🎓" label="My Children" onPress={() => nav('Students')} />
          ) : (
            <ExpandableMenu icon="👨‍🎓" label="Students" expanded={!!expanded.students} onToggle={() => toggle('students')}>
              <SubMenuItem icon="📋" label="Student List" onPress={() => nav('Students')} />
              {(isAdmin || isTeacher) && (
                <SubMenuItem icon="📈" label="Performance Report" onPress={() => nav('PerformanceReport')} />
              )}
            </ExpandableMenu>
          )}

          {/* Attendance */}
          {isParent ? (
            <MenuItem icon="✅" label="My Children's Attendance" onPress={() => nav('Attendance')} />
          ) : (
            <ExpandableMenu icon="✅" label="Attendance" expanded={!!expanded.attendance} onToggle={() => toggle('attendance')}>
              <SubMenuItem icon="✍️" label="Manual Attendance" onPress={() => nav('Attendance')} />
              {isAdmin && (
                <>
                  <SubMenuItem icon="🔌" label="Devices" onPress={() => nav('Devices')} />
                  <SubMenuItem icon="🗓️" label="Academic Calendar" onPress={() => nav('AcademicCalendar')} />
                </>
              )}
            </ExpandableMenu>
          )}

          {/* Examination */}
          {isParent ? (
            <MenuItem icon="📝" label="My Children's Results" onPress={() => nav('Exams')} />
          ) : (
            <ExpandableMenu icon="📝" label="Examination" expanded={!!expanded.examination} onToggle={() => toggle('examination')}>
              {(isAdmin || isTeacher) && (
                <SubMenuItem icon="📚" label="Subjects" onPress={() => nav('Subjects')} />
              )}
              {isAdmin && (
                <>
                  <SubMenuItem icon="📅" label="Academic Year" onPress={() => nav('AcademicYear')} />
                  <SubMenuItem icon="📋" label="Manage Exams" onPress={() => nav('ManageExams')} />
                  <SubMenuItem icon="🔗" label="Map Exams" onPress={() => nav('MapExams')} />
                </>
              )}
              {(isAdmin || isTeacher) && (
                <>
                  <SubMenuItem icon="✍️" label="Marks Entry" onPress={() => nav('MarksEntry')} />
                  <SubMenuItem icon="📊" label="Results" onPress={() => nav('Results')} />
                  <SubMenuItem icon="📈" label="Annual Report" onPress={() => nav('AnnualReport')} />
                  <SubMenuItem icon="📉" label="Exam-wise Analysis" onPress={() => nav('AssessmentReport')} />
                </>
              )}
            </ExpandableMenu>
          )}

          {/* Staff - admin only */}
          {isAdmin && (
            <ExpandableMenu icon="👨‍💼" label="Staff" expanded={!!expanded.staff} onToggle={() => toggle('staff')}>
              <SubMenuItem icon="🏢" label="Departments" onPress={() => nav('Departments')} />
              <SubMenuItem icon="📋" label="Staff List" onPress={() => nav('Staff')} />
              <SubMenuItem icon="💵" label="Salary" onPress={() => nav('StaffSalary')} />
            </ExpandableMenu>
          )}

          {/* Fee Management */}
          {isParent ? (
            <MenuItem icon="💰" label="Fee Details" onPress={() => nav('Fees')} />
          ) : isAdmin ? (
            <ExpandableMenu icon="💰" label="Fee Management" expanded={!!expanded.fees} onToggle={() => toggle('fees')}>
              <SubMenuItem icon="📄" label="Fee Structure" onPress={() => nav('FeeStructure')} />
              <SubMenuItem icon="💳" label="Fee Payment" onPress={() => nav('FeePayment')} />
              <SubMenuItem icon="📊" label="Fee Summary" onPress={() => nav('FeeSummary')} />
              <SubMenuItem icon="⚙️" label="Fee Settings" onPress={() => nav('FeeSettings')} />
            </ExpandableMenu>
          ) : (
            <MenuItem icon="💰" label="Fee Management" onPress={() => nav('Fees')} />
          )}

          {/* Settings - admin only */}
          {isAdmin && (
            <ExpandableMenu icon="⚙️" label="Settings" expanded={!!expanded.settings} onToggle={() => toggle('settings')}>
              <SubMenuItem icon="🏫" label="Classes & Sections" onPress={() => nav('ClassSections')} />
              <SubMenuItem icon="🎓" label="Grades" onPress={() => nav('Grades')} />
              <SubMenuItem icon="🔐" label="Role Access" onPress={() => nav('RoleAccess')} />
              <SubMenuItem icon="🏦" label="Payment Gateway" onPress={() => nav('PaymentGateway')} />
              <SubMenuItem icon="📱" label="SMS Settings" onPress={() => nav('SMSSettings')} />
              <SubMenuItem icon="💬" label="WhatsApp Settings" onPress={() => nav('WhatsAppSettings')} />
              <SubMenuItem icon="🏫" label="School Settings" onPress={() => nav('SchoolSettings')} />
              {isSuperAdmin && (
                <SubMenuItem icon="👥" label="User Management" onPress={() => nav('UserManagement')} />
              )}
            </ExpandableMenu>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Account */}
          <MenuItem icon="👤" label="Profile" onPress={() => nav('Profile')} />
          <MenuItem icon="🔒" label="Change Password" onPress={() => nav('ChangePassword')} />
        </View>
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>🚪</Text>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  drawerContent: {
    flexGrow: 1,
  },
  userSection: {
    padding: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#e0e7ff',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  menuSection: {
    flex: 1,
    paddingTop: 8,
  },
  // Parent menu item
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  menuIcon: {
    fontSize: 20,
    width: 30,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    marginLeft: 4,
  },
  chevron: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  // Sub-menu
  subMenuContainer: {
    backgroundColor: '#f5f5ff',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    marginLeft: 24,
    borderRadius: 4,
  },
  subMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 10,
    opacity: 0.5,
  },
  subMenuIcon: {
    fontSize: 16,
    width: 24,
  },
  subMenuLabel: {
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  logoutIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.error,
  },
});

export default DrawerContent;
