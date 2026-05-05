import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOKEN_KEY, USER_KEY, setLogoutHandler } from '../services/api';
import { authService, VerifyOtpResponse } from '../services/authService';
import { registerPushToken, unregisterPushToken } from '../services/pushNotifications';

interface AuthUser {
  user_id: number;
  full_name: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (mobile: string, otp: string) => Promise<VerifyOtpResponse>;
  signOut: () => Promise<void>;
  requestOtp: (mobile: string, role?: 'parent' | 'teacher') => Promise<{ masked_email: string; role: string; mobile_used: string }>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  const restore = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const raw = await AsyncStorage.getItem(USER_KEY);
      if (token && raw) {
        setUser(JSON.parse(raw));
        registerPushToken().catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await unregisterPushToken(); } catch {}
    try { await authService.logout(); } catch {}
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    setLogoutHandler(() => { setUser(null); });
    restore();
  }, [restore]);

  // Heartbeat: fires every 60 s while app is in foreground and user is logged in.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const startBeat = () => {
      if (heartbeatRef.current) return;
      heartbeatRef.current = setInterval(() => {
        authService.heartbeat().catch(() => {});
      }, 60_000);
    };
    const stopBeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    if (user) {
      // Start only when foregrounded
      if (appStateRef.current === 'active') startBeat();
      const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
        appStateRef.current = next;
        if (next === 'active') startBeat();
        else stopBeat();
      });
      return () => { stopBeat(); sub.remove(); };
    } else {
      stopBeat();
    }
  }, [user]);

  const requestOtp = useCallback(async (mobile: string, role?: 'parent' | 'teacher') => {
    // Try common phone formats because DB may store with country code.
    const candidates = Array.from(new Set([
      mobile,
      mobile.startsWith('+91') ? mobile : `+91${mobile}`,
      mobile.startsWith('91') ? mobile : `91${mobile}`,
    ]));

    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        const r = await authService.requestOtp(candidate, role);
        return { masked_email: r.masked_email, role: r.role, mobile_used: candidate };
      } catch (e: any) {
        lastError = e;
      }
    }
    throw lastError;
  }, []);

  const signIn = useCallback(async (mobile: string, otp: string) => {
    const r = await authService.verifyOtp(mobile, otp);
    await AsyncStorage.setItem(TOKEN_KEY, r.access_token);
    const u: AuthUser = { user_id: r.user_id, full_name: r.full_name, role: r.role };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
    registerPushToken().catch(() => {});
    return r;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, requestOtp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
