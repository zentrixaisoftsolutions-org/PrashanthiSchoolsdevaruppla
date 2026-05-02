import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import Students from './pages/Students/Students';
import Subjects from './pages/Subjects/Subjects';
import Unauthorized from './pages/Unauthorized/Unauthorized';
import Classes from './pages/Classes/Classes';
import ClassNames from './pages/ClassNames/ClassNames';
import Sections from './pages/Sections/Sections';
import ClassSections from './pages/ClassSections/ClassSections';
import PerformanceReport from './pages/PerformanceReport/PerformanceReport';
import Grades from './pages/Grades/Grades';
import AcademicYearPage from './pages/AcademicYear/AcademicYear';
import ManageExams from './pages/ManageExams/ManageExams';
import MapExams from './pages/MapExams/MapExams';
import MarksEntry from './pages/MarksEntry/MarksEntry';
import Devices from './pages/Devices/Devices';
import DailyAttendance from './pages/DailyAttendance/DailyAttendance';
import AttendanceSummary from './pages/AttendanceSummary/AttendanceSummary';
import SMSSettings from './pages/SMSSettings/SMSSettings';
import Results from './pages/Results/Results';
import RoleAccess from './pages/Settings/RoleAccess';
import FeeStructurePage from './pages/FeeManagement/FeeStructure';
import FeePaymentPage from './pages/FeeManagement/FeePayment';
import FeeSummaryPage from './pages/FeeManagement/FeeSummary';
import FeeSettingsPage from './pages/FeeManagement/FeeSettings';
import PaymentGatewaySettings from './pages/Settings/PaymentGateway';
import UserManagement from './pages/Settings/UserManagement';
import WhatsAppSettings from './pages/WhatsAppSettings/WhatsAppSettings';
import SchoolSettingsPage from './pages/Settings/SchoolSettings';
import Departments from './pages/Staff/Departments';
import StaffPage from './pages/Staff/StaffPage';
import StaffSalary from './pages/Staff/StaffSalary';
import AcademicCalendarPage from './pages/AcademicCalendar/AcademicCalendar';
import AnnualReport from './pages/Reports/AnnualReport';
import AssessmentReport from './pages/Reports/AssessmentReport';
import HomeworkPage from './pages/Homework/Homework';
import AnnouncementsPage from './pages/Announcements/Announcements';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, menuAccess } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Enforce per-user menu access restrictions
  // menuAccess === null means no restrictions (use role defaults)
  // menuAccess === string[] means only those paths are allowed
  if (menuAccess !== null) {
    const currentPath = location.pathname;
    // Allow dashboard always as a fallback landing page
    const isAllowed =
      currentPath === '/dashboard' ||
      menuAccess.some(p => currentPath === p || currentPath.startsWith(p + '/'));
    if (!isAllowed) {
      return <Layout><Navigate to="/unauthorized" replace /></Layout>;
    }
  }

  return <Layout>{children}</Layout>;
};

const AppRoutes = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students/performance-report"
        element={
          <ProtectedRoute>
            <PerformanceReport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/homework"
        element={
          <ProtectedRoute>
            <HomeworkPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/subjects"
        element={
          <ProtectedRoute>
            <Subjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/classes"
        element={
          <ProtectedRoute>
            <Classes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/class-names"
        element={
          <ProtectedRoute>
            <ClassNames />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sections"
        element={
          <ProtectedRoute>
            <Sections />
          </ProtectedRoute>
        }
      />
      <Route
        path="/class-sections"
        element={
          <ProtectedRoute>
            <ClassSections />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Navigate to="/settings/classes" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/classes"
        element={
          <ProtectedRoute>
            <ClassSections />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/subjects"
        element={
          <ProtectedRoute>
            <Subjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/grades"
        element={
          <ProtectedRoute>
            <Grades />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/subjects"
        element={
          <ProtectedRoute>
            <Subjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/academic-year"
        element={
          <ProtectedRoute>
            <AcademicYearPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/manage-exams"
        element={
          <ProtectedRoute>
            <ManageExams />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/map-exams"
        element={
          <ProtectedRoute>
            <MapExams />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/marks-entry"
        element={
          <ProtectedRoute>
            <MarksEntry />
          </ProtectedRoute>
        }
      />
      <Route
        path="/examination/results"
        element={
          <ProtectedRoute>
            <Results />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/daily"
        element={
          <ProtectedRoute>
            <DailyAttendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/summary"
        element={
          <ProtectedRoute>
            <AttendanceSummary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/devices"
        element={
          <ProtectedRoute>
            <Devices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/sms"
        element={
          <ProtectedRoute>
            <SMSSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/role-access"
        element={
          <ProtectedRoute>
            <RoleAccess />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fees/structure"
        element={
          <ProtectedRoute>
            <FeeStructurePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fees/payment"
        element={
          <ProtectedRoute>
            <FeePaymentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fees/summary"
        element={
          <ProtectedRoute>
            <FeeSummaryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/fees/settings"
        element={
          <ProtectedRoute>
            <FeeSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/payment-gateway"
        element={
          <ProtectedRoute>
            <PaymentGatewaySettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/users"
        element={
          <ProtectedRoute>
            <UserManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/whatsapp"
        element={
          <ProtectedRoute>
            <WhatsAppSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/school"
        element={
          <ProtectedRoute>
            <SchoolSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/departments"
        element={
          <ProtectedRoute>
            <Departments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/list"
        element={
          <ProtectedRoute>
            <StaffPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/salary"
        element={
          <ProtectedRoute>
            <StaffSalary />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/announcements"
        element={
          <ProtectedRoute>
            <AnnouncementsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance/academic-calendar"
        element={
          <ProtectedRoute>
            <AcademicCalendarPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/annual"
        element={
          <ProtectedRoute>
            <AnnualReport />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports/assessment"
        element={
          <ProtectedRoute>
            <AssessmentReport />
          </ProtectedRoute>
        }
      />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
