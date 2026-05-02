import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, APP_CONFIG } from '../config/constants';

class ApiClient {
  private client: AxiosInstance;
  private onAuthFailed?: () => void;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add token and normalize URL
    this.client.interceptors.request.use(
      async (config) => {
        // Append trailing slash to base API paths (e.g. /api/students → /api/students/)
        // to avoid 307 redirects that drop the Authorization header.
        // Only for paths with exactly 2 segments like /api/resource-name.
        if (config.url) {
          const [urlPath, queryString] = config.url.split('?');
          const segments = urlPath.split('/').filter(Boolean);
          if (segments.length === 2 && segments[0] === 'api' && !urlPath.endsWith('/')) {
            config.url = urlPath + '/' + (queryString ? '?' + queryString : '');
          }
        }
        const token = await AsyncStorage.getItem(APP_CONFIG.TOKEN_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor — auto-refresh on 401
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const status = error.response?.status;
        const detail = error.response?.data?.detail;

        // If 401 and not already a retry and not a refresh/login call
        if (
          status === 401 &&
          !originalRequest._retry &&
          !originalRequest.url?.includes('/api/auth/login') &&
          !originalRequest.url?.includes('/api/auth/refresh')
        ) {
          originalRequest._retry = true;

          const newToken = await this.tryRefreshToken();
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          }

          // Refresh failed — force logout
          await AsyncStorage.multiRemove([
            APP_CONFIG.TOKEN_KEY,
            APP_CONFIG.USER_KEY,
            APP_CONFIG.MENU_ACCESS_KEY,
          ]);
          if (this.onAuthFailed) {
            this.onAuthFailed();
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async tryRefreshToken(): Promise<string | null> {
    // If already refreshing, wait for that to finish
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const oldToken = await AsyncStorage.getItem(APP_CONFIG.TOKEN_KEY);
        if (!oldToken) return null;

        const response = await axios.post(
          `${API_BASE_URL}/api/auth/refresh`,
          {},
          {
            headers: { Authorization: `Bearer ${oldToken}` },
            timeout: 10000,
          }
        );

        const newToken = response.data?.access_token;
        if (newToken) {
          await AsyncStorage.setItem(APP_CONFIG.TOKEN_KEY, newToken);
          return newToken;
        }
        return null;
      } catch {
        return null;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  setOnAuthFailed(callback: () => void) {
    this.onAuthFailed = callback;
  }

  /** Silently refresh token on app startup */
  async refreshTokenIfNeeded(): Promise<void> {
    const token = await AsyncStorage.getItem(APP_CONFIG.TOKEN_KEY);
    if (!token) return;

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/auth/refresh`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );
      const newToken = response.data?.access_token;
      if (newToken) {
        await AsyncStorage.setItem(APP_CONFIG.TOKEN_KEY, newToken);
      }
    } catch {
      // Refresh failed silently — the old token may still be valid
    }
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(url, data, config);
    return response.data;
  }
}

export default new ApiClient();
