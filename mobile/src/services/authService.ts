import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './apiClient';
import { API_ENDPOINTS, APP_CONFIG, OFFLINE_DEMO_CREDENTIALS } from '../config/constants';
import { LoginRequest, LoginResponse, User } from '../types';

class AuthService {
  /**
   * Login user with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    // Demo mode: skip API entirely for demo credentials
    if (this.isValidOfflineDemoCredentials(email, password)) {
      const demoResponse: LoginResponse = {
        access_token: APP_CONFIG.DEMO_TOKEN_KEY,
        user_id: 1,
        role: OFFLINE_DEMO_CREDENTIALS.ROLE,
      };

      await this.persistDemoSession(demoResponse);
      return demoResponse;
    }

    try {
      const response = await apiClient.post<LoginResponse>(
        API_ENDPOINTS.LOGIN,
        { email, password } as LoginRequest
      );

      await this.persistSession(email, response);

      return response;
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  }

  private async persistDemoSession(response: LoginResponse): Promise<void> {
    await AsyncStorage.setItem(APP_CONFIG.TOKEN_KEY, response.access_token);

    const userData: User = {
      id: response.user_id,
      email: OFFLINE_DEMO_CREDENTIALS.EMAIL,
      username: 'parent',
      full_name: 'Rajesh Sharma',
      role_id: this.getRoleId(response.role),
      role: response.role,
      is_active: true,
      created_at: '2024-06-15T10:00:00.000Z',
      updated_at: new Date().toISOString(),
    };

    await AsyncStorage.setItem(APP_CONFIG.USER_KEY, JSON.stringify(userData));
  }

  private async persistSession(email: string, response: LoginResponse): Promise<void> {
    // Store token
    await AsyncStorage.setItem(APP_CONFIG.TOKEN_KEY, response.access_token);

    // For parent users logging in with mobile number, store phone
    const isPhone = /^\d{10,}$/.test(email);

    // Create and store user data
    const userData: User = {
      id: response.user_id,
      email,
      username: email.split('@')[0],
      full_name: response.full_name || email,
      phone: isPhone ? email : undefined,
      role_id: this.getRoleId(response.role),
      role: response.role,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await AsyncStorage.setItem(APP_CONFIG.USER_KEY, JSON.stringify(userData));
  }

  private isOfflineError(error: any): boolean {
    // Axios network failures usually have no response object.
    return !error?.response;
  }

  private isValidOfflineDemoCredentials(email: string, password: string): boolean {
    return (
      email.trim().toLowerCase() === OFFLINE_DEMO_CREDENTIALS.EMAIL &&
      password === OFFLINE_DEMO_CREDENTIALS.PASSWORD
    );
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await AsyncStorage.multiRemove([
      APP_CONFIG.TOKEN_KEY,
      APP_CONFIG.USER_KEY,
      APP_CONFIG.MENU_ACCESS_KEY,
    ]);
  }

  /**
   * Get current user from storage
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const userJson = await AsyncStorage.getItem(APP_CONFIG.USER_KEY);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get stored token
   */
  async getToken(): Promise<string | null> {
    return await AsyncStorage.getItem(APP_CONFIG.TOKEN_KEY);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Check if app is in demo mode
   */
  async isDemoMode(): Promise<boolean> {
    const token = await this.getToken();
    return token === APP_CONFIG.DEMO_TOKEN_KEY;
  }

  /**
   * Get menu access for current user
   */
  async getMenuAccess(): Promise<string[] | null> {
    try {
      const response = await apiClient.get<{ allowed_paths: string[] | null }>(
        API_ENDPOINTS.ROLE_ACCESS + '/my-access'
      );
      
      const allowedPaths = response.allowed_paths;
      await AsyncStorage.setItem(
        APP_CONFIG.MENU_ACCESS_KEY,
        JSON.stringify(allowedPaths)
      );
      
      return allowedPaths;
    } catch (error) {
      // Return cached menu access if API fails
      const cached = await AsyncStorage.getItem(APP_CONFIG.MENU_ACCESS_KEY);
      return cached ? JSON.parse(cached) : null;
    }
  }

  /**
   * Map role string to role ID
   */
  private getRoleId(role: string): number {
    const roleMap: Record<string, number> = {
      super_admin: 1,
      admin: 2,
      teacher: 3,
      student: 4,
      parent: 5,
    };
    return roleMap[role] || 0;
  }
}

export default new AuthService();
