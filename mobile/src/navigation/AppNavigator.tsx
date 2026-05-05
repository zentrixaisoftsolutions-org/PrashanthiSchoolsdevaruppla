import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StudentsScreen from '../screens/StudentsScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import ExamsScreen from '../screens/ExamsScreen';
import FeesScreen from '../screens/FeesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
// Admin screens
import DepartmentsScreen from '../screens/DepartmentsScreen';
import StaffScreen from '../screens/StaffScreen';
import StaffSalaryScreen from '../screens/StaffSalaryScreen';
import SubjectsScreen from '../screens/SubjectsScreen';
import AcademicYearScreen from '../screens/AcademicYearScreen';
import ManageExamsScreen from '../screens/ManageExamsScreen';
import MapExamsScreen from '../screens/MapExamsScreen';
import MarksEntryScreen from '../screens/MarksEntryScreen';
import ClassSectionsScreen from '../screens/ClassSectionsScreen';
import AcademicCalendarScreen from '../screens/AcademicCalendarScreen';
import FeeStructureScreen from '../screens/FeeStructureScreen';
import FeePaymentScreen from '../screens/FeePaymentScreen';
import FeeSummaryScreen from '../screens/FeeSummaryScreen';
import FeeSettingsScreen from '../screens/FeeSettingsScreen';
import GradesScreen from '../screens/GradesScreen';
import SchoolSettingsScreen from '../screens/SchoolSettingsScreen';
import SMSSettingsScreen from '../screens/SMSSettingsScreen';
import WhatsAppSettingsScreen from '../screens/WhatsAppSettingsScreen';
import UserManagementScreen from '../screens/UserManagementScreen';
import RoleAccessScreen from '../screens/RoleAccessScreen';
import DevicesScreen from '../screens/DevicesScreen';
import PaymentGatewayScreen from '../screens/PaymentGatewayScreen';
import ResultsScreen from '../screens/ResultsScreen';
import AnnualReportScreen from '../screens/AnnualReportScreen';
import AssessmentReportScreen from '../screens/AssessmentReportScreen';
import PerformanceReportScreen from '../screens/PerformanceReportScreen';
import DrawerContent from '../components/DrawerContent';
import { COLORS } from '../config/constants';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

const FloatingBackButton = () => {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={fabStyles.button}
      onPress={() => navigation.goBack()}
      activeOpacity={0.8}
    >
      <Text style={fabStyles.arrow}>←</Text>
    </TouchableOpacity>
  );
};

const fabStyles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 999,
  },
  arrow: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: -2,
  },
});

const withBackButton = (ScreenComponent: React.ComponentType<any>) => {
  return (props: any) => (
    <View style={{ flex: 1 }}>
      <ScreenComponent {...props} />
      <FloatingBackButton />
    </View>
  );
};

const DrawerNavigator = () => {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.primary,
          height: 100,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerTitle: () => (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>
              SRI SAI PRASHANTHI VIDYANIKETAN
            </Text>
          </View>
        ),
        drawerActiveTintColor: COLORS.primary,
        drawerInactiveTintColor: COLORS.textSecondary,
      }}
    >
      <Drawer.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <Drawer.Screen
        name="Students"
        component={withBackButton(StudentsScreen)}
        options={{ title: 'Students' }}
      />
      <Drawer.Screen
        name="Attendance"
        component={withBackButton(AttendanceScreen)}
        options={{ title: 'Attendance' }}
      />
      <Drawer.Screen
        name="Exams"
        component={withBackButton(ExamsScreen)}
        options={{ title: 'Exams & Results' }}
      />
      <Drawer.Screen
        name="Fees"
        component={withBackButton(FeesScreen)}
        options={{ title: 'Fee Management' }}
      />
      <Drawer.Screen
        name="Profile"
        component={withBackButton(ProfileScreen)}
        options={{ title: 'Profile' }}
      />
      <Drawer.Screen
        name="ChangePassword"
        component={withBackButton(ChangePasswordScreen)}
        options={{ title: 'Change Password' }}
      />
      {/* Staff */}
      <Drawer.Screen name="Departments" component={withBackButton(DepartmentsScreen)} options={{ title: 'Departments' }} />
      <Drawer.Screen name="Staff" component={withBackButton(StaffScreen)} options={{ title: 'Staff List' }} />
      <Drawer.Screen name="StaffSalary" component={withBackButton(StaffSalaryScreen)} options={{ title: 'Staff Salary' }} />
      {/* Examination */}
      <Drawer.Screen name="Subjects" component={withBackButton(SubjectsScreen)} options={{ title: 'Subjects' }} />
      <Drawer.Screen name="AcademicYear" component={withBackButton(AcademicYearScreen)} options={{ title: 'Academic Year' }} />
      <Drawer.Screen name="ManageExams" component={withBackButton(ManageExamsScreen)} options={{ title: 'Manage Exams' }} />
      <Drawer.Screen name="MapExams" component={withBackButton(MapExamsScreen)} options={{ title: 'Map Exams' }} />
      <Drawer.Screen name="MarksEntry" component={withBackButton(MarksEntryScreen)} options={{ title: 'Marks Entry' }} />
      <Drawer.Screen name="Results" component={withBackButton(ResultsScreen)} options={{ title: 'Results' }} />
      {/* Attendance */}
      <Drawer.Screen name="Devices" component={withBackButton(DevicesScreen)} options={{ title: 'Devices' }} />
      <Drawer.Screen name="AcademicCalendar" component={withBackButton(AcademicCalendarScreen)} options={{ title: 'Academic Calendar' }} />
      {/* Fee Management */}
      <Drawer.Screen name="FeeStructure" component={withBackButton(FeeStructureScreen)} options={{ title: 'Fee Structure' }} />
      <Drawer.Screen name="FeePayment" component={withBackButton(FeePaymentScreen)} options={{ title: 'Fee Payment' }} />
      <Drawer.Screen name="FeeSummary" component={withBackButton(FeeSummaryScreen)} options={{ title: 'Fee Summary' }} />
      <Drawer.Screen name="FeeSettings" component={withBackButton(FeeSettingsScreen)} options={{ title: 'Fee Settings' }} />
      {/* Reports */}
      <Drawer.Screen name="AnnualReport" component={withBackButton(AnnualReportScreen)} options={{ title: 'Annual Report' }} />
      <Drawer.Screen name="AssessmentReport" component={withBackButton(AssessmentReportScreen)} options={{ title: 'Assessment Report' }} />
      <Drawer.Screen name="PerformanceReport" component={withBackButton(PerformanceReportScreen)} options={{ title: 'Performance Report' }} />
      {/* Settings */}
      <Drawer.Screen name="ClassSections" component={withBackButton(ClassSectionsScreen)} options={{ title: 'Classes & Sections' }} />
      <Drawer.Screen name="Grades" component={withBackButton(GradesScreen)} options={{ title: 'Grades' }} />
      <Drawer.Screen name="RoleAccess" component={withBackButton(RoleAccessScreen)} options={{ title: 'Role Access' }} />
      <Drawer.Screen name="PaymentGateway" component={withBackButton(PaymentGatewayScreen)} options={{ title: 'Payment Gateway' }} />
      <Drawer.Screen name="SMSSettings" component={withBackButton(SMSSettingsScreen)} options={{ title: 'SMS Settings' }} />
      <Drawer.Screen name="WhatsAppSettings" component={withBackButton(WhatsAppSettingsScreen)} options={{ title: 'WhatsApp Settings' }} />
      <Drawer.Screen name="SchoolSettings" component={withBackButton(SchoolSettingsScreen)} options={{ title: 'School Settings' }} />
      <Drawer.Screen name="UserManagement" component={withBackButton(UserManagementScreen)} options={{ title: 'User Management' }} />
    </Drawer.Navigator>
  );
};

const AppNavigator = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <Stack.Screen name="Main" component={DrawerNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
