import api from './api';

export interface AttendanceDevice {
  id: number;
  device_name: string;
  device_model?: string;
  serial_number?: string;
  ip_address: string;
  port: number;
  comm_key?: number;
  connection_type: string;
  location?: string;
  status: string;
  last_connected_at?: string;
  last_heartbeat_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceCreate {
  device_name: string;
  device_model?: string;
  serial_number?: string;
  ip_address: string;
  port?: number;
  comm_key?: number;
  connection_type?: string;
  location?: string;
}

export interface DeviceUpdate {
  device_name?: string;
  device_model?: string;
  serial_number?: string;
  ip_address?: string;
  port?: number;
  comm_key?: number;
  connection_type?: string;
  location?: string;
  is_active?: boolean;
}

export interface DeviceConnectionResponse {
  device_id: number;
  status: string;
  message: string;
  connected_at?: string;
}

export interface DeviceStatus {
  id: number;
  device_name: string;
  ip_address: string;
  port: number;
  location?: string;
  status: string;
  last_heartbeat_at?: string;
}

export interface TestCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, any>;
}

export interface TestDeviceResult {
  overall: 'pass' | 'warn' | 'fail';
  device?: { id: number; name: string; ip: string; port: number };
  checks: TestCheck[];
  rfid_result?: Record<string, any> | null;
}

export interface DiagnosticLogEntry {
  id: number;
  device_id: number;
  rfid_id: string;
  scan_time: string;
  raw_line: string;
  owner_name: string;
  owner_id: number | null;
  owner_type: string;
  logged_at: string;
}

export interface DiagnosticLogsResponse {
  device_id: number;
  active: boolean;
  logs: DiagnosticLogEntry[];
}

export interface EasyTimeProStatus {
  server_online: boolean;
  server_url: string;
  poller_running: boolean;
  error?: string;
}

export interface EasyTimeProSyncResult {
  synced: number;
  devices: { id: number; device_name: string; serial_number: string; status: string }[];
  message: string;
}

const deviceService = {
  // Get all devices
  getDevices: async (isActive?: boolean): Promise<AttendanceDevice[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {};
    const response = await api.get('/devices/', { params });
    return response.data;
  },

  // Get single device
  getDevice: async (id: number): Promise<AttendanceDevice> => {
    const response = await api.get(`/devices/${id}`);
    return response.data;
  },

  // Create device
  createDevice: async (data: DeviceCreate): Promise<AttendanceDevice> => {
    const response = await api.post('/devices/', data);
    return response.data;
  },

  // Update device
  updateDevice: async (id: number, data: DeviceUpdate): Promise<AttendanceDevice> => {
    const response = await api.put(`/devices/${id}`, data);
    return response.data;
  },

  // Delete device
  deleteDevice: async (id: number): Promise<void> => {
    await api.delete(`/devices/${id}`);
  },

  // Connect to device
  connectDevice: async (id: number): Promise<DeviceConnectionResponse> => {
    const response = await api.post(`/devices/${id}/connect`, { action: 'connect' });
    return response.data;
  },

  // Disconnect device
  disconnectDevice: async (id: number): Promise<DeviceConnectionResponse> => {
    const response = await api.post(`/devices/${id}/connect`, { action: 'disconnect' });
    return response.data;
  },

  // Send heartbeat to device
  heartbeat: async (id: number): Promise<DeviceConnectionResponse> => {
    const response = await api.post(`/devices/${id}/heartbeat`);
    return response.data;
  },

  // Get status of all devices
  getAllDeviceStatus: async (): Promise<DeviceStatus[]> => {
    const response = await api.get('/devices/status/all');
    return response.data;
  },

  // Test a device (comprehensive diagnostic)
  testDevice: async (id: number, rfidId?: string): Promise<TestDeviceResult> => {
    const params: Record<string, any> = {};
    if (rfidId) params.rfid_id = rfidId;
    const response = await api.post(`/devices/${id}/test`, null, { params });
    return response.data;
  },

  // Diagnostic mode: start (scans are logged only, no attendance)
  diagnosticStart: async (id: number): Promise<{ status: string; message: string }> => {
    const response = await api.post(`/devices/${id}/diagnostic/start`);
    return response.data;
  },

  // Diagnostic mode: stop (resume normal attendance)
  diagnosticStop: async (id: number): Promise<{ status: string; message: string }> => {
    const response = await api.post(`/devices/${id}/diagnostic/stop`);
    return response.data;
  },

  // Diagnostic mode: poll for scan logs
  diagnosticLogs: async (id: number, sinceId: number = 0): Promise<DiagnosticLogsResponse> => {
    const response = await api.get(`/devices/${id}/diagnostic/logs`, { params: { since_id: sinceId } });
    return response.data;
  },

  // Diagnostic mode: clear log buffer
  diagnosticClearLogs: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/devices/${id}/diagnostic/logs`);
    return response.data;
  },

  // ===== EasyTimePro Server Integration =====

  // Get EasyTimePro server status
  getEasyTimeProStatus: async (): Promise<EasyTimeProStatus> => {
    const response = await api.get('/devices/easytimepro/status');
    return response.data;
  },

  // Sync devices from EasyTimePro server
  syncEasyTimeProDevices: async (): Promise<EasyTimeProSyncResult> => {
    const response = await api.post('/devices/easytimepro/sync');
    return response.data;
  },

  // Get raw terminals from EasyTimePro
  getEasyTimeProTerminals: async (): Promise<{ count: number; terminals: any[] }> => {
    const response = await api.get('/devices/easytimepro/terminals');
    return response.data;
  },

  // Get recent transactions from EasyTimePro
  getEasyTimeProTransactions: async (page: number = 1, pageSize: number = 50): Promise<any> => {
    const response = await api.get('/devices/easytimepro/transactions', { params: { page, page_size: pageSize } });
    return response.data;
  },

  // Start transaction poller
  startPoller: async (): Promise<{ status: string; message: string }> => {
    const response = await api.post('/devices/easytimepro/poller/start');
    return response.data;
  },

  // Stop transaction poller
  stopPoller: async (): Promise<{ status: string; message: string }> => {
    const response = await api.post('/devices/easytimepro/poller/stop');
    return response.data;
  },
};

export default deviceService;
