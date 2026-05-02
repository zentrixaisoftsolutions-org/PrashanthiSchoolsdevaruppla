import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import authService from '../services/authService';
import apiClient from '../services/apiClient';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  menuAccess: string[] | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [menuAccess, setMenuAccess] = useState<string[] | null>(null);

  const fetchMenuAccess = async () => {
    const demo = await authService.isDemoMode();
    if (demo) {
      setMenuAccess(null);
      return;
    }
    try {
      const access = await authService.getMenuAccess();
      setMenuAccess(access);
    } catch (error) {
      console.error('Failed to fetch menu access:', error);
      setMenuAccess(null);
    }
  };

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      const token = await authService.getToken();
      if (currentUser && token) {
        // Silently refresh token on app startup to extend session
        await apiClient.refreshTokenIfNeeded();
        setUser(currentUser);
        const demo = await authService.isDemoMode();
        setIsDemoMode(demo);
        if (!demo) {
          fetchMenuAccess();
        }
      } else {
        // No valid session — clear any stale data
        await authService.logout();
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    // Register auth-failed callback so 401 responses force logout in UI
    apiClient.setOnAuthFailed(() => {
      setUser(null);
      setIsDemoMode(false);
      setMenuAccess(null);
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      console.log('[AUTH] Starting login...');
      const response = await authService.login(email, password);
      console.log('[AUTH] Login response received, token:', response?.access_token?.substring(0, 20) + '...');
      
      // Verify token was stored
      const storedToken = await authService.getToken();
      console.log('[AUTH] Token in AsyncStorage after login:', storedToken ? storedToken.substring(0, 20) + '...' : 'NULL!');
      
      const currentUser = await authService.getCurrentUser();
      console.log('[AUTH] Current user:', currentUser?.email, currentUser?.role);
      setUser(currentUser);
      const demo = await authService.isDemoMode();
      setIsDemoMode(demo);
      if (!demo) {
        await fetchMenuAccess();
      }
    } catch (error) {
      console.log('[AUTH] Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setIsDemoMode(false);
    setMenuAccess(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isDemoMode,
    menuAccess,
    login,
    logout,
    refreshMenuAccess: fetchMenuAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
