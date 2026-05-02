import React, { useState, useEffect, useCallback, useRef } from 'react';
import deviceService, { AttendanceDevice, DeviceCreate, DeviceUpdate, TestCheck, TestDeviceResult, DiagnosticLogEntry, EasyTimeProStatus } from '../../services/deviceService';

type ActiveTab = 'devices' | 'test';

const Devices: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('devices');
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<AttendanceDevice | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [formData, setFormData] = useState<DeviceCreate>({
    device_name: '',
    device_model: '',
    serial_number: '',
    ip_address: '',
    port: 6321,
    comm_key: 0,
    connection_type: 'TCP/IP',
    location: '',
  });

  // Test Device state
  const [testDeviceId, setTestDeviceId] = useState<number | ''>('');
  const [testRfidId, setTestRfidId] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestDeviceResult | null>(null);
  const [testError, setTestError] = useState('');

  // Diagnostic live-scan state
  const [diagActive, setDiagActive] = useState(false);
  const [diagStarting, setDiagStarting] = useState(false);
  const [diagLogs, setDiagLogs] = useState<DiagnosticLogEntry[]>([]);
  const diagLastId = useRef(0);
  const diagPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diagLogsEndRef = useRef<HTMLDivElement | null>(null);

  // EasyTimePro server state
  const [etpStatus, setEtpStatus] = useState<EasyTimeProStatus | null>(null);
  const [etpSyncing, setEtpSyncing] = useState(false);
  const [etpPollerToggling, setEtpPollerToggling] = useState(false);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await deviceService.getDevices();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch devices');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEtpStatus = useCallback(async () => {
    try {
      const status = await deviceService.getEasyTimeProStatus();
      setEtpStatus(status);
    } catch {
      setEtpStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchEtpStatus();
  }, [fetchDevices, fetchEtpStatus]);

  // Periodic heartbeat check + EasyTimePro status refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      // Refresh ETP status and device list
      fetchEtpStatus();
      fetchDevices();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [fetchDevices, fetchEtpStatus]);

  const handleSyncFromServer = async () => {
    setEtpSyncing(true);
    setError(null);
    try {
      const result = await deviceService.syncEasyTimeProDevices();
      setError(null);
      fetchDevices();
      fetchEtpStatus();
      alert(result.message);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to sync devices from EasyTimePro server');
    } finally {
      setEtpSyncing(false);
    }
  };

  const handleTogglePoller = async () => {
    setEtpPollerToggling(true);
    try {
      if (etpStatus?.poller_running) {
        await deviceService.stopPoller();
      } else {
        await deviceService.startPoller();
      }
      fetchEtpStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to toggle poller');
    } finally {
      setEtpPollerToggling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    // Uniqueness check for serial number and IP address (only for create, not edit)
    if (!editingDevice) {
      const serialExists = devices.some(
        (d) => d.serial_number && d.serial_number.trim() !== '' && d.serial_number === formData.serial_number
      );
      if (serialExists) {
        setValidationError('Serial number must be unique.');
        return;
      }
      const ipExists = devices.some(
        (d) => d.ip_address && d.ip_address.trim() !== '' && d.ip_address === formData.ip_address
      );
      if (ipExists) {
        setValidationError('IP address must be unique.');
        return;
      }
    }
    try {
      if (editingDevice) {
        const updateData: DeviceUpdate = {
          device_name: formData.device_name,
          device_model: formData.device_model || undefined,
          serial_number: formData.serial_number || undefined,
          ip_address: formData.ip_address,
          port: formData.port,
          comm_key: formData.comm_key ?? 0,
          connection_type: formData.connection_type,
          location: formData.location || undefined,
        };
        await deviceService.updateDevice(editingDevice.id, updateData);
      } else {
        await deviceService.createDevice(formData);
      }
      setShowModal(false);
      resetForm();
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save device');
    }
  };

  const handleConnect = async (device: AttendanceDevice) => {
    setConnecting(device.id);
    try {
      const result = await deviceService.connectDevice(device.id);
      if (result.status === 'connected') {
        setError(null);
      } else {
        setError(result.message);
      }
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to connect to device');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (device: AttendanceDevice) => {
    setConnecting(device.id);
    try {
      await deviceService.disconnectDevice(device.id);
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to disconnect device');
    } finally {
      setConnecting(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this device?')) return;
    try {
      await deviceService.deleteDevice(id);
      fetchDevices();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete device');
    }
  };

  const handleEdit = (device: AttendanceDevice) => {
    setEditingDevice(device);
    setFormData({
      device_name: device.device_name,
      device_model: device.device_model || '',
      serial_number: device.serial_number || '',
      ip_address: device.ip_address,
      port: device.port,
      comm_key: device.comm_key ?? 0,
      connection_type: device.connection_type,
      location: device.location || '',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      device_name: '',
      device_model: '',
      serial_number: '',
      ip_address: '',
      port: 6321,
      comm_key: 0,
      connection_type: 'TCP/IP',
      location: '',
    });
    setEditingDevice(null);
  };

  const handleTestDevice = async () => {
    if (!testDeviceId) {
      setTestError('Please select a device to test.');
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      const result = await deviceService.testDevice(
        testDeviceId as number,
        testRfidId.trim() || undefined
      );
      setTestResult(result);
    } catch (err: any) {
      setTestError(err.response?.data?.detail || 'Failed to run device test. Check your network connection and try again.');
    } finally {
      setTestLoading(false);
    }
  };

  // -- Diagnostic live-scan helpers --
  const startDiagnostic = async () => {
    if (!testDeviceId) { setTestError('Please select a device first.'); return; }
    setDiagStarting(true);
    setTestError('');
    try {
      await deviceService.diagnosticStart(testDeviceId as number);
      setDiagActive(true);
      setDiagLogs([]);
      diagLastId.current = 0;
      // start polling every 1.5 s
      diagPollRef.current = setInterval(async () => {
        try {
          const resp = await deviceService.diagnosticLogs(testDeviceId as number, diagLastId.current);
          if (resp.logs.length > 0) {
            setDiagLogs(prev => [...prev, ...resp.logs]);
            diagLastId.current = resp.logs[resp.logs.length - 1].id;
          }
          if (!resp.active) {
            // server side stopped
            stopPolling();
            setDiagActive(false);
          }
        } catch { /* ignore polling errors */ }
      }, 1500);
    } catch (err: any) {
      setTestError(err.response?.data?.detail || 'Failed to start diagnostic mode.');
    } finally {
      setDiagStarting(false);
    }
  };

  const stopPolling = () => {
    if (diagPollRef.current) { clearInterval(diagPollRef.current); diagPollRef.current = null; }
  };

  const stopDiagnostic = async () => {
    stopPolling();
    if (testDeviceId) {
      try { await deviceService.diagnosticStop(testDeviceId as number); } catch { /* ok */ }
    }
    setDiagActive(false);
  };

  const clearDiagLogs = () => {
    setDiagLogs([]);
    diagLastId.current = 0;
    if (testDeviceId) {
      deviceService.diagnosticClearLogs(testDeviceId as number).catch(() => {});
    }
  };

  // Clean up polling on unmount or tab switch
  useEffect(() => {
    return () => { stopPolling(); };
  }, []);

  // auto-scroll log area
  useEffect(() => {
    diagLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [diagLogs]);

  // stop diagnostic if device selection changes
  useEffect(() => {
    if (diagActive) { stopDiagnostic(); }
    setTestResult(null);
    setTestError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testDeviceId]);

  const getCheckIcon = (status: string) => {
    switch (status) {
      case 'pass': return (<svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>);
      case 'warn': return (<svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
      case 'fail': return (<svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>);
      default: return null;
    }
  };

  const getCheckBg = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-50 border-green-200';
      case 'warn': return 'bg-yellow-50 border-yellow-200';
      case 'fail': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const getOverallBadge = (overall: string) => {
    switch (overall) {
      case 'pass': return (<span className="px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">All Checks Passed</span>);
      case 'warn': return (<span className="px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">Passed with Warnings</span>);
      case 'fail': return (<span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">Checks Failed</span>);
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      connected: 'bg-green-100 text-green-800',
      disconnected: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.disconnected}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (loading && devices.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Devices</h1>
          <p className="text-gray-500">Auto-synced from EasyTimePro server</p>
        </div>
        {activeTab === 'devices' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncFromServer}
              disabled={etpSyncing}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
            >
              {etpSyncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync from Server
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* EasyTimePro Server Status Banner */}
      {etpStatus && (
        <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${
          etpStatus.server_online
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            <span className={`relative flex h-3 w-3`}>
              {etpStatus.server_online && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                etpStatus.server_online ? 'bg-green-500' : 'bg-red-500'
              }`}></span>
            </span>
            <div>
              <span className={`text-sm font-medium ${
                etpStatus.server_online ? 'text-green-800' : 'text-red-800'
              }`}>
                EasyTimePro Server: {etpStatus.server_online ? 'Online' : 'Offline'}
              </span>
              <span className="text-xs text-gray-500 ml-2">({etpStatus.server_url})</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              etpStatus.poller_running
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              Log Capture: {etpStatus.poller_running ? 'Active' : 'Stopped'}
            </span>
            <button
              onClick={handleTogglePoller}
              disabled={etpPollerToggling}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                etpStatus.poller_running
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {etpPollerToggling ? '...' : etpStatus.poller_running ? 'Stop Capture' : 'Start Capture'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'devices'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Devices
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-5 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'test'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Test Device
          </button>
        </div>
      </div>

      {/* Error Message */}
      {(error || validationError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
          <span>{validationError || error}</span>
          <button onClick={() => { setError(null); setValidationError(null); }} className="text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      {/* ===== DEVICES TAB ===== */}
      {activeTab === 'devices' && (
      <>
      {/* Devices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices.map((device) => (
          <div
            key={device.id}
            className={`bg-white rounded-lg shadow-md border-2 ${
              device.status === 'connected' ? 'border-green-300' : 'border-gray-200'
            }`}
          >
            <div className="p-5">
              {/* Device Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{device.device_name}</h3>
                  <p className="text-sm text-gray-500">{device.device_model || 'Unknown Model'}</p>
                </div>
                {getStatusBadge(device.status)}
              </div>

              {/* Device Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">Serial:</span>
                  <span className="text-gray-900 font-mono">{device.serial_number || '-'}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">IP Address:</span>
                  <span className="text-gray-900 font-mono">{device.ip_address}:{device.port}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">Type:</span>
                  <span className="text-gray-900">{device.connection_type}</span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="text-gray-500 w-24">Location:</span>
                  <span className="text-gray-900">{device.location || '-'}</span>
                </div>
                {device.last_connected_at && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">Last Online:</span>
                    <span className="text-gray-900">{formatDateTime(device.last_connected_at)}</span>
                  </div>
                )}
                {device.last_heartbeat_at && (
                  <div className="flex items-center text-sm">
                    <span className="text-gray-500 w-24">Last Sync:</span>
                    <span className="text-gray-900">{formatDateTime(device.last_heartbeat_at)}</span>
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div className={`pt-3 border-t border-gray-100 text-center text-sm font-medium ${
                device.status === 'connected' ? 'text-green-600' : 'text-gray-400'
              }`}>
                {device.status === 'connected' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Device Online — Capturing Logs
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-flex rounded-full h-2 w-2 bg-gray-300"></span>
                    Disconnected
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {devices.length === 0 && (
          <div className="col-span-full">
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <div className="text-4xl mb-4">📱</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Devices Found</h3>
              <p className="text-gray-500 mb-4">
                Devices are auto-synced from the EasyTimePro server. Click "Sync from Server" to refresh the device list.
              </p>
              <button
                onClick={handleSyncFromServer}
                disabled={etpSyncing}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {etpSyncing ? 'Syncing...' : 'Sync from Server'}
              </button>
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {/* ===== TEST DEVICE TAB ===== */}
      {activeTab === 'test' && (
      <div className="space-y-6">
        {/* Device Selection + Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Device Diagnostic Test</h2>
          <p className="text-sm text-gray-500 mb-6">
            Test if your device is working. Start listening, then scan an ID card on the device — the scan will appear here instantly.
            <strong className="text-gray-700"> No attendance will be marked.</strong>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Device select */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Device *</label>
              <select
                value={testDeviceId}
                onChange={(e) => setTestDeviceId(e.target.value ? parseInt(e.target.value) : '')}
                disabled={diagActive}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm disabled:opacity-50"
              >
                <option value="">Choose a device...</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.device_name} — {d.ip_address}:{d.port} ({d.status})
                  </option>
                ))}
              </select>
            </div>

            {/* RFID for connectivity test */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">RFID / Card ID (optional)</label>
              <input
                type="text"
                value={testRfidId}
                onChange={(e) => setTestRfidId(e.target.value)}
                placeholder="e.g., 0012345678"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
              />
              <p className="text-xs text-gray-400 mt-1">For RFID lookup in connectivity test (no attendance marked).</p>
            </div>

            {/* Run connectivity test */}
            <div className="flex items-end">
              <button
                onClick={handleTestDevice}
                disabled={testLoading || !testDeviceId}
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm font-medium"
              >
                {testLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run Connectivity Test
                  </>
                )}
              </button>
            </div>

            {/* Start / Stop live scan */}
            <div className="flex items-end">
              {!diagActive ? (
                <button
                  onClick={startDiagnostic}
                  disabled={diagStarting || !testDeviceId}
                  className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm font-medium"
                >
                  {diagStarting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start Listening
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stopDiagnostic}
                  className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 shadow-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Stop Listening
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {testError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
            <span>{testError}</span>
            <button onClick={() => setTestError('')} className="text-red-500 hover:text-red-700">×</button>
          </div>
        )}

        {/* ── Live Scan Log ── */}
        {diagActive && (
          <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-300 overflow-hidden">
            <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <h3 className="text-sm font-semibold text-emerald-800">
                  Live Scan Log — Listening on {devices.find(d => d.id === testDeviceId)?.device_name || 'device'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600">{diagLogs.length} scan(s)</span>
                {diagLogs.length > 0 && (
                  <button onClick={clearDiagLogs} className="text-xs text-emerald-700 hover:text-emerald-900 underline">Clear</button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {diagLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <p className="text-sm">Waiting for scans... Tap an ID card on the device now.</p>
                </div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                      <th className="px-4 py-2.5 text-left">#</th>
                      <th className="px-4 py-2.5 text-left">Time</th>
                      <th className="px-4 py-2.5 text-left">RFID / Card No</th>
                      <th className="px-4 py-2.5 text-left">Owner</th>
                      <th className="px-4 py-2.5 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {diagLogs.map((log, idx) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">
                          {new Date(log.scan_time).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-medium text-gray-900">{log.rfid_id}</td>
                        <td className="px-4 py-2.5">
                          {log.owner_name ? (
                            <span className="text-gray-800 font-medium">{log.owner_name}</span>
                          ) : (
                            <span className="text-red-500 text-xs font-medium">Not registered</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.owner_type ? (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              log.owner_type === 'Student' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {log.owner_type}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">Unknown</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div ref={diagLogsEndRef} />
            </div>
          </div>
        )}

        {/* Connectivity Test Results */}
        {testResult && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Results Header */}
            <div className={`px-6 py-4 flex items-center justify-between ${
              testResult.overall === 'pass' ? 'bg-green-50 border-b border-green-200' :
              testResult.overall === 'warn' ? 'bg-yellow-50 border-b border-yellow-200' :
              'bg-red-50 border-b border-red-200'
            }`}>
              <div className="flex items-center gap-3">
                {testResult.overall === 'pass' && (
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
                {testResult.overall === 'warn' && (
                  <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
                {testResult.overall === 'fail' && (
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Connectivity Test {testResult.device && `— ${testResult.device.name}`}
                  </h3>
                  {testResult.device && (
                    <p className="text-sm text-gray-500">{testResult.device.ip}:{testResult.device.port}</p>
                  )}
                </div>
              </div>
              {getOverallBadge(testResult.overall)}
            </div>

            {/* Checks List */}
            <div className="p-6 space-y-3">
              {testResult.checks.map((check: TestCheck, idx: number) => (
                <div key={idx} className={`border rounded-lg p-4 ${getCheckBg(check.status)}`}>
                  <div className="flex items-start gap-3">
                    {getCheckIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900">{check.name}</span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          check.status === 'pass' ? 'bg-green-100 text-green-700' :
                          check.status === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARNING' : 'FAIL'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{check.message}</p>
                      {check.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Show details</summary>
                          <pre className="mt-1 text-xs bg-white bg-opacity-50 rounded p-2 overflow-x-auto text-gray-600">
                            {JSON.stringify(check.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
              {testResult.checks.filter(c => c.status === 'pass').length} passed,{' '}
              {testResult.checks.filter(c => c.status === 'warn').length} warnings,{' '}
              {testResult.checks.filter(c => c.status === 'fail').length} failed — out of {testResult.checks.length} checks
            </div>
          </div>
        )}

        {/* Info when nothing is active */}
        {!testResult && !testLoading && !diagActive && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">How to use this page</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Live Scan Test
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                  <li>Select a device from the dropdown</li>
                  <li>Click <strong>Start Listening</strong></li>
                  <li>Scan any ID card on the physical device</li>
                  <li>The scan will appear here instantly with card number and owner details</li>
                  <li>Click <strong>Stop Listening</strong> when done</li>
                </ol>
                <p className="mt-2 text-xs text-amber-600 font-medium">No attendance is recorded during this test.</p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Connectivity Test
                </h4>
                <p className="text-gray-500">Runs network and configuration checks on the selected device:</p>
                <ul className="list-disc list-inside space-y-1 mt-1 text-gray-500">
                  <li>Device lookup &amp; configuration</li>
                  <li>DNS / IP resolution</li>
                  <li>TCP port connectivity</li>
                  <li>Device status &amp; listener status</li>
                  <li>RFID card lookup (if provided; no attendance marked)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default Devices;
