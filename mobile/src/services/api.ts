import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config';

export const TOKEN_KEY = 'prashanthischools.token';
export const USER_KEY = 'prashanthischools.user';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

let logoutHandler: (() => void) | null = null;
export const setLogoutHandler = (fn: () => void) => { logoutHandler = fn; };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
      logoutHandler?.();
    }
    return Promise.reject(error);
  }
);

export default api;
