/** API client config. Override via app.json -> extra.apiBaseUrl if needed. */
import Constants from 'expo-constants';

const fromExtra = (Constants.expoConfig?.extra as any)?.apiBaseUrl;

export const API_BASE_URL: string =
  fromExtra || 'http://178.156.251.34:8000/api';

export const SCHOOL_NAME = 'Sri Sai Prashanthi Vidyaniketan';
