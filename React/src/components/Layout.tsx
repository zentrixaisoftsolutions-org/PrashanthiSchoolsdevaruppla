import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/logo.jpg';
import schoolSettingsService, { SchoolSettings } from '../services/schoolSettingsService';
import helpdeskService from '../services/helpdeskService';
import ChatWidget from './ChatWidget';
import { HelpDeskButton, NotificationDropdown } from './HelpDesk';
import {
  FiHome, FiUsers, FiCheckSquare, FiFileText, FiSettings,
  FiChevronDown, FiChevronRight, FiMenu, FiLogOut, FiSearch,
  FiBell, FiMail, FiMaximize, FiUser, FiCircle, FiSun, FiMoon,
} from 'react-icons/fi';
import {
  FaGraduationCap, FaClipboardList, FaChartBar, FaMobileAlt,
  FaCommentDots, FaBookOpen, FaCalendarAlt, FaClipboardCheck,
  FaMapMarkerAlt, FaPencilAlt, FaPoll, FaSchool, FaBullseye,
  FaTachometerAlt, FaUserShield, FaSignOutAlt, FaCog, FaUsers,
  FaMoneyBillWave, FaFileInvoiceDollar, FaReceipt, FaHandHoldingUsd,
  FaCreditCard, FaUserTie, FaBuilding,
} from 'react-icons/fa';
import { IconType } from 'react-icons';

interface LayoutProps {
  children: React.ReactNode;
}

interface MenuItem {
  path: string;
  label: string;
  icon: IconType;
  roles: string[];
  badge?: string;
  badgeColor?: string;
  subItems?: MenuItem[];
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout, menuAccess } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarHover, setSidebarHover] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);

  // Load school settings
  useEffect(() => {
    schoolSettingsService.get().then(setSchoolSettings).catch(() => {});
  }, []);

  // Poll unread notification count every 30 seconds
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await helpdeskService.getUnreadCount();
      setUnreadCount(count);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const schoolName = schoolSettings?.school_name || 'School ERP';
  const schoolLogoUrl = schoolSettings ? schoolSettingsService.getLogoUrl(schoolSettings) : null;

  // Apply dark mode class to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Auto-expand menu that contains current active path
  useEffect(() => {
    const activeMenus: string[] = [];
    menuItems.forEach(item => {
      if (item.subItems?.some(sub => isPathActive(sub.path))) {
        activeMenus.push(item.label.toLowerCase());
      }
    });
    setExpandedMenus(prev => [...new Set([...prev, ...activeMenus])]);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMenu = (menuLabel: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuLabel)
        ? prev.filter(m => m !== menuLabel)
        : [...prev, menuLabel]
    );
  };

  const getRoleName = (): string => {
    const roleMap: Record<string, string> = {
      'super_admin': 'Super Admin',
      'admin': 'Administrator',
      'teacher': 'Teacher',
      'student': 'Student',
      'parent': 'Parent',
    };
    const role = (user as any)?.role || '';
    return roleMap[role] || role || 'User';
  };

  const getRoleColor = (): string => {
    const role = (user as any)?.role || '';
    const colorMap: Record<string, string> = {
      'super_admin': 'bg-red-500',
      'admin': 'bg-amber-500',
      'teacher': 'bg-emerald-500',
      'student': 'bg-sky-500',
      'parent': 'bg-purple-500',
    };
    return colorMap[role] || 'bg-gray-500';
  };

  const menuItems: MenuItem[] = [
    {
      path: '/dashboard', label: 'Dashboard', icon: FaTachometerAlt,
      roles: ['super_admin', 'admin', 'teacher', 'student', 'parent'],
    },
    {
      path: '', label: 'Students', icon: FaGraduationCap,
      roles: ['super_admin', 'admin', 'teacher'],
      subItems: [
        { path: '/students', label: 'Student List', icon: FaClipboardList, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/students/performance-report', label: 'Students Performance Report', icon: FaChartBar, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/homework', label: 'Homework', icon: FaBookOpen, roles: ['super_admin', 'admin', 'teacher'] },
      ]
    },
    {
      path: '', label: 'Attendance', icon: FiCheckSquare,
      roles: ['super_admin', 'admin', 'teacher'],
      subItems: [
        { path: '/attendance/daily', label: 'Manual Attendance', icon: FaClipboardCheck, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/attendance/summary', label: 'Attendance Summary', icon: FaPoll, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/attendance/devices', label: 'Devices', icon: FaMobileAlt, roles: ['super_admin', 'admin'] },
        { path: '/attendance/academic-calendar', label: 'Academic Calendar', icon: FaCalendarAlt, roles: ['super_admin', 'admin'] },
      ]
    },
    {
      path: '', label: 'Examination', icon: FiFileText,
      roles: ['super_admin', 'admin', 'teacher'],
      subItems: [
        { path: '/examination/subjects', label: 'Subjects', icon: FaBookOpen, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/examination/academic-year', label: 'Academic Year', icon: FaCalendarAlt, roles: ['super_admin', 'admin'] },
        { path: '/examination/manage-exams', label: 'Manage Exams', icon: FaClipboardCheck, roles: ['super_admin', 'admin'] },
        { path: '/examination/map-exams', label: 'Map Exams', icon: FaMapMarkerAlt, roles: ['super_admin', 'admin'] },
        { path: '/examination/marks-entry', label: 'Marks Entry', icon: FaPencilAlt, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/examination/results', label: 'Results', icon: FaChartBar, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/reports/annual', label: 'Annual Report', icon: FaFileInvoiceDollar, roles: ['super_admin', 'admin', 'teacher'] },
        { path: '/reports/assessment', label: 'Exam-wise Analysis', icon: FaClipboardCheck, roles: ['super_admin', 'admin', 'teacher'] },
      ]
    },
    {
      path: '', label: 'Staff', icon: FaUserTie,
      roles: ['super_admin', 'admin'],
      subItems: [
        { path: '/staff/departments', label: 'Departments', icon: FaBuilding, roles: ['super_admin', 'admin'] },
        { path: '/staff/list', label: 'Staff List', icon: FaUsers, roles: ['super_admin', 'admin'] },
        { path: '/staff/salary', label: 'Salary', icon: FaMoneyBillWave, roles: ['super_admin', 'admin'] },
        { path: '/staff/announcements', label: 'Announcements', icon: FaBullseye, roles: ['super_admin', 'admin', 'principal'] },
      ]
    },
    {
      path: '', label: 'Fee Management', icon: FaMoneyBillWave,
      roles: ['super_admin', 'admin'],
      subItems: [
        { path: '/fees/structure', label: 'Fee Structure', icon: FaFileInvoiceDollar, roles: ['super_admin', 'admin'] },
        { path: '/fees/payment', label: 'Fee Payment', icon: FaHandHoldingUsd, roles: ['super_admin', 'admin'] },
        { path: '/fees/summary', label: 'Fee Summary', icon: FaReceipt, roles: ['super_admin', 'admin'] },
        { path: '/fees/settings', label: 'Fee Settings', icon: FaCog, roles: ['super_admin', 'admin'] },
      ]
    },

    {
      path: '', label: 'Settings', icon: FaCog,
      roles: ['super_admin', 'admin'],
      subItems: [
        { path: '/settings/classes', label: 'Classes & Sections', icon: FaSchool, roles: ['super_admin', 'admin'] },
        { path: '/settings/grades', label: 'Grades', icon: FaBullseye, roles: ['super_admin', 'admin'] },
        { path: '/settings/role-access', label: 'Role Access', icon: FaUserShield, roles: ['super_admin', 'admin'] },
        { path: '/settings/payment-gateway', label: 'Payment Gateway', icon: FaCreditCard, roles: ['super_admin', 'admin'] },
        { path: '/settings/sms', label: 'SMS Settings', icon: FaCommentDots, roles: ['super_admin', 'admin'] },
        { path: '/settings/whatsapp', label: 'WhatsApp Settings', icon: FaCommentDots, roles: ['super_admin', 'admin'] },
        { path: '/settings/school', label: 'School Settings', icon: FaSchool, roles: ['super_admin', 'admin'] },
        { path: '/settings/users', label: 'User Management', icon: FaUsers, roles: ['super_admin'] },
      ]
    },
  ];

  const userRole = (user as any)?.role || '';
  const filteredMenuItems = menuItems
    .filter(item => item.roles.includes(userRole))
    .map(item => {
      if (!item.subItems) {
        // Single item — check if allowed
        if (menuAccess !== null && !menuAccess.includes(item.path)) return null;
        return item;
      }
      // Parent with sub-items — filter children by role AND menuAccess
      const filteredSubs = item.subItems.filter(sub => {
        if (!sub.roles.includes(userRole)) return false;
        if (menuAccess !== null && !menuAccess.includes(sub.path)) return false;
        return true;
      });
      if (filteredSubs.length === 0) return null; // hide parent if all children blocked
      return { ...item, subItems: filteredSubs };
    })
    .filter(Boolean) as MenuItem[];

  const isPathActive = (path: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const isMenuActive = (item: MenuItem) => {
    if (item.path) return isPathActive(item.path);
    if (item.subItems) {
      return item.subItems.some(sub => isPathActive(sub.path));
    }
    return false;
  };

  // Effective sidebar state (expanded if open OR hovered while collapsed)
  const effectiveOpen = sidebarOpen || sidebarHover;

  // Filter menu items based on search query
  const getFilteredItems = () => {
    if (!searchQuery.trim()) return filteredMenuItems;
    const q = searchQuery.toLowerCase();
    return filteredMenuItems.filter(item => {
      if (item.label.toLowerCase().includes(q)) return true;
      if (item.subItems?.some(sub => sub.label.toLowerCase().includes(q))) return true;
      return false;
    });
  };

  const displayItems = getFilteredItems();

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="flex h-screen bg-[#F0F2F8] dark:bg-gray-900 transition-colors duration-300">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={() => !sidebarOpen && setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        className={`
          fixed lg:relative z-30 h-full flex flex-col
          bg-gradient-to-b from-[#2D2A6E] to-[#3D3B8E]
          text-[#c2c7d0] shadow-2xl
          transition-all duration-300 ease-in-out
          ${effectiveOpen ? 'w-[260px]' : 'w-[68px]'}
        `}
        style={{
          backgroundImage: effectiveOpen
            ? 'linear-gradient(160deg, #2D2A6E 0%, #3D3B8E 60%, #5553A0 100%)'
            : 'linear-gradient(160deg, #2D2A6E 0%, #3D3B8E 100%)',
        }}
      >
        {/* Brand / Logo */}
        <div className="relative flex items-center h-[57px] px-3 border-b border-white/10">
          {/* Orange accent line at top */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#F5A623] to-[#E8890C]" />
          <Link to="/dashboard" className="flex items-center gap-3 group w-full overflow-hidden">
            <div className="relative flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#E8890C] flex items-center justify-center shadow-lg shadow-[#F5A623]/30 group-hover:shadow-[#F5A623]/50 transition-shadow">
              <img src={schoolLogoUrl || logoImg} alt="Logo" className="w-7 h-7 object-contain rounded" />
            </div>
            <div className={`flex flex-col transition-all duration-200 ${effectiveOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 w-0'}`}>
              <span className="text-sm font-bold text-white tracking-wide whitespace-nowrap">{schoolName.length > 18 ? schoolName.substring(0, 18) + '…' : schoolName.toUpperCase()}</span>
            </div>
          </Link>
        </div>

        {/* User Panel */}
        <div className={`border-b border-white/10 transition-all duration-300 overflow-hidden ${effectiveOpen ? 'py-3 px-3' : 'py-2 px-2'}`}>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F5A623] to-[#E8890C] flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-[#F5A623]/30">
                {(user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#2D2A6E] ${getRoleColor()}`} />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-200 ${effectiveOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
              <p className="text-xs font-semibold text-white truncate">{user?.full_name || user?.email || 'User'}</p>
              <p className="text-[10px] text-[#F5A623]/80 truncate">{getRoleName()}</p>
            </div>
          </div>
        </div>

        {/* Search (when expanded) */}
        {effectiveOpen && (
          <div className="px-3 py-2 border-b border-white/5">
            <div className="relative">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#2D2A6E]/60 text-xs text-white placeholder-gray-400 rounded-md pl-8 pr-3 py-2 border border-white/10 focus:border-[#F5A623] focus:ring-1 focus:ring-[#F5A623]/50 focus:bg-[#2D2A6E]/80 outline-none transition-all"
                style={{ boxShadow: 'none' }}
              />
            </div>
          </div>
        )}

        {/* Section header */}
        {effectiveOpen && (
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-bold text-[#F5A623]/70 uppercase tracking-[0.15em]">Navigation</span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1 sidebar-scroll">
          <ul className="space-y-0.5 px-2">
            {displayItems.map((item) => {
              const Icon = item.icon;
              const active = isMenuActive(item);
              const expanded = expandedMenus.includes(item.label.toLowerCase());

              return (
                <li key={item.label}>
                  {item.subItems ? (
                    /* Parent menu with sub-items */
                    <>
                      <button
                        onClick={() => toggleMenu(item.label.toLowerCase())}
                        className={`
                          w-full group flex items-center rounded-lg px-3 py-2.5 text-[13px] font-medium
                          transition-all duration-200 relative
                          ${active
                            ? 'bg-[#F5A623]/20 text-white shadow-sm'
                            : 'text-[#c2c7d0] hover:bg-white/5 hover:text-white'
                          }
                        `}
                      >
                        {/* Active indicator bar */}
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F5A623] rounded-r-full" />
                        )}
                        {/* Collapsed active dot */}
                        {!effectiveOpen && active && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#F5A623]" />
                        )}
                        <Icon className={`flex-shrink-0 text-base transition-colors duration-200 ${active ? 'text-[#F5A623]' : 'text-gray-400 group-hover:text-[#F5A623]'}`} />
                        <span className={`ml-3 flex-1 text-left whitespace-nowrap transition-all duration-200 ${effectiveOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
                          {item.label}
                        </span>
                        {effectiveOpen && item.badge && (
                          <span className={`${item.badgeColor || 'bg-[#F5A623]'} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm mr-2`}>
                            {item.badge}
                          </span>
                        )}
                        {effectiveOpen && (
                          <FiChevronDown className={`flex-shrink-0 text-xs text-gray-400 transition-transform duration-300 ${expanded ? 'rotate-0' : '-rotate-90'}`} />
                        )}
                      </button>

                      {/* Sub-menu with smooth animation */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          effectiveOpen && expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                        }`}
                      >
                        <ul className="pl-3 mt-0.5 space-y-0.5 border-l border-[#F5A623]/20 ml-5">
                          {item.subItems
                            .map((subItem) => {
                              const SubIcon = subItem.icon;
                              const subActive = isPathActive(subItem.path);
                              return (
                                <li key={subItem.path}>
                                  <Link
                                    to={subItem.path}
                                    className={`
                                      group flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px]
                                      transition-all duration-200 relative
                                      ${subActive
                                        ? 'bg-[#F5A623]/20 text-[#F5A623] font-semibold'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                      }
                                    `}
                                  >
                                    {/* Dot connector */}
                                    <span className={`absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-colors ${subActive ? 'bg-[#F5A623]' : 'bg-gray-600 group-hover:bg-gray-400'}`} />
                                    <SubIcon className={`flex-shrink-0 text-xs ${subActive ? 'text-[#F5A623]' : 'text-gray-500 group-hover:text-gray-300'}`} />
                                    <span className="truncate">{subItem.label}</span>
                                    {subActive && (
                                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#F5A623] animate-pulse" />
                                    )}
                                  </Link>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </>
                  ) : (
                    /* Single menu item */
                    <Link
                      to={item.path}
                      className={`
                        group flex items-center rounded-lg px-3 py-2.5 text-[13px] font-medium
                        transition-all duration-200 relative
                        ${active
                          ? 'bg-[#F5A623]/20 text-white shadow-sm'
                          : 'text-[#c2c7d0] hover:bg-white/5 hover:text-white'
                        }
                      `}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F5A623] rounded-r-full" />
                      )}
                      {/* Collapsed active dot */}
                      {!effectiveOpen && active && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#F5A623]" />
                      )}
                      <Icon className={`flex-shrink-0 text-base transition-colors duration-200 ${active ? 'text-[#F5A623]' : 'text-gray-400 group-hover:text-[#F5A623]'}`} />
                      <span className={`ml-3 whitespace-nowrap transition-all duration-200 ${effectiveOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
                        {item.label}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="border-t border-white/10 p-2">
          <button
            onClick={handleLogout}
            className="w-full group flex items-center rounded-lg px-3 py-2.5 text-[13px] font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
          >
            <FaSignOutAlt className="flex-shrink-0 text-base" />
            <span className={`ml-3 whitespace-nowrap transition-all duration-200 ${effectiveOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
              Logout
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-white dark:bg-gray-800 shadow-sm z-10 transition-colors duration-300"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          {/* Orange accent border on brand area */}
          <div className="flex items-center justify-between h-[57px] px-4">
            {/* Left side */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#3D3B8E] dark:hover:text-gray-200 transition-colors"
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                <FiMenu className="text-lg" />
              </button>
              <div className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l-2 border-[#F5A623]">
                <img src={schoolLogoUrl || logoImg} alt="Logo" className="h-9 w-9 object-contain rounded-lg shadow-sm" />
                <div>
                  <h2 className="text-sm font-bold text-[#3D3B8E] dark:text-gray-100 leading-tight">{schoolName.toUpperCase()}</h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium tracking-wider">SCHOOL MANAGEMENT SYSTEM</p>
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1">
              {/* Search toggle */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#3D3B8E] dark:hover:text-gray-200 transition-colors"
              >
                <FiSearch className="text-lg" />
              </button>

              {/* Dark/Light mode toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#F5A623] dark:hover:text-yellow-400 transition-all duration-300"
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                <div className="relative w-5 h-5">
                  <FiSun className={`absolute inset-0 text-lg transition-all duration-300 ${darkMode ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'}`} />
                  <FiMoon className={`absolute inset-0 text-lg transition-all duration-300 ${darkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}`} />
                </div>
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="hidden md:flex p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#3D3B8E] dark:hover:text-gray-200 transition-colors"
              >
                <FiMaximize className="text-lg" />
              </button>

              {/* Help Desk */}
              <HelpDeskButton onTicketCreated={fetchUnreadCount} />

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-[#3D3B8E] dark:hover:text-gray-200 transition-colors"
                >
                  <FiBell className="text-lg" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-[#E84040] text-white text-[10px] font-bold rounded-full px-1 shadow-sm">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                <NotificationDropdown
                  isOpen={notifOpen}
                  onClose={() => setNotifOpen(false)}
                  onCountChange={setUnreadCount}
                />
              </div>

              {/* Divider */}
              <div className="hidden md:block w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />

              {/* User info */}
              <div className="flex items-center gap-2 pl-2">
                <div className="hidden md:block text-right">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-tight">{user?.full_name || user?.email || 'User'}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{getRoleName()}</p>
                </div>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F5A623] to-[#E8890C] flex items-center justify-center text-white font-bold text-xs shadow">
                    {(user?.full_name || user?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${getRoleColor()}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Expandable search bar */}
          <div className={`overflow-hidden transition-all duration-300 ${searchOpen ? 'max-h-14 border-t border-gray-100 dark:border-gray-700' : 'max-h-0'}`}>
            <div className="flex items-center px-4 py-2 bg-gray-50 dark:bg-gray-800/50">
              <FiSearch className="text-[#F5A623] dark:text-gray-500 mr-2" />
              <input
                type="text"
                placeholder="Search pages..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                autoFocus={searchOpen}
                style={{ boxShadow: 'none', border: 'none' }}
              />
              <button onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-[#3D3B8E] dark:hover:text-gray-300 text-xs ml-2">ESC</button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#F0F2F8] dark:bg-gray-900 transition-colors duration-300 main-scroll">
          <div className="p-6">{children}</div>
        </main>
      </div>

      {/* Chat Widget - only show if user has access */}
      {(menuAccess === null || menuAccess.includes('/chat')) && <ChatWidget />}

      {/* Powered by Zentrix watermark */}
      <div className="fixed top-2 right-3 z-[9999] pointer-events-none opacity-70">
        <span className="text-[10px] font-semibold text-gray-400 tracking-widest">POWERED BY ZENTRIXAISOFTSOLUTIONS</span>
      </div>
    </div>
  );
};

export default Layout;
