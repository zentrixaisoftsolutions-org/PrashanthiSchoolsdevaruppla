import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import authService, { User } from '../services/authService';
import roleAccessService from '../services/roleAccessService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  menuAccess: string[] | null; // null = no restrictions (role defaults), array = allowed paths
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: any) => Promise<void>;
  refreshMenuAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [menuAccess, setMenuAccess] = useState<string[] | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMenuAccess = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      const data = await roleAccessService.getMyAccess();
      setMenuAccess(data.allowed_paths);
      localStorage.setItem('menu_access', JSON.stringify(data.allowed_paths));
    } catch {
      // If fetch fails, use no restrictions
      setMenuAccess(null);
    }
  };

  // Reads the `exp` claim from the JWT payload (no signature check needed).
  const getTokenExpiryMs = (token: string): number | null => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  };

  // Silently refresh the token and reschedule the next refresh.
  const scheduleTokenRefresh = (token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const msUntilRefresh = expiryMs - Date.now() - 5 * 60 * 1000; // 5 min before expiry
    if (msUntilRefresh <= 0) return; // already close/past expiry – interceptor handles it

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const response = await authService.refreshToken();
        localStorage.setItem('access_token', response.access_token);
        scheduleTokenRefresh(response.access_token);
      } catch {
        // Refresh failed; the api interceptor will handle the next 401
      }
    }, msUntilRefresh);
  };

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      // Restore cached menu access
      const cachedAccess = localStorage.getItem('menu_access');
      if (cachedAccess) {
        try {
          setMenuAccess(JSON.parse(cachedAccess));
        } catch { /* ignore */ }
      }
      // Refresh from server in background
      fetchMenuAccess();
      // Schedule proactive token refresh
      const token = localStorage.getItem('access_token');
      if (token) scheduleTokenRefresh(token);
    }
    setIsLoading(false);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    localStorage.setItem('access_token', response.access_token);
    
    // Map string role to role_id for compatibility
    const roleIdMap: Record<string, number> = {
      'super_admin': 1,
      'admin': 2,
      'teacher': 3,
      'student': 4,
      'parent': 5,
    };
    
    // Store user info for later use
    const userData: User = {
      id: response.user_id,
      email,
      username: '',
      full_name: '',
      role_id: roleIdMap[response.role] || 0,
      role: response.role,  // Store the string role from API
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);

    // Schedule proactive token refresh
    scheduleTokenRefresh(response.access_token);

    // Fetch menu access after login
    await fetchMenuAccess();
  };

  const logout = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    authService.logout();
    localStorage.removeItem('menu_access');
    setUser(null);
    setMenuAccess(null);
  };

  const register = async (data: any) => {
    const user = await authService.register(data);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    menuAccess,
    login,
    logout,
    register,
    refreshMenuAccess: fetchMenuAccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
