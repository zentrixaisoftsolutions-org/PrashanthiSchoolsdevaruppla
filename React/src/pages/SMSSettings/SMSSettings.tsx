import React, { useState, useEffect, useCallback } from 'react';
import smsService, { 
  SMSConfig, SMSConfigCreate, SMSTemplate, SMSTemplateCreate,
  SMSLog, SMSStats, SMSProvider 
} from '../../services/smsService';

type TabType = 'config' | 'templates' | 'logs';

const SMSSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss messages
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Config state
  const [configs, setConfigs] = useState<SMSConfig[]>([]);
  const [providers, setProviders] = useState<SMSProvider[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SMSConfig | null>(null);
  const [configForm, setConfigForm] = useState<SMSConfigCreate>({
    provider_name: '',
    api_key: '',
    api_secret: '',
    sender_id: '',
    base_url: '',
    is_active: true,
    is_default: false,
  });

  // Templates state
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SMSTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<SMSTemplateCreate>({
    name: '',
    template_type: 'attendance_absent',
    message_template: '',
    is_default: false,
  });

  // Logs state
  const [logs, setLogs] = useState<SMSLog[]>([]);
  const [stats, setStats] = useState<SMSStats | null>(null);

  // Test SMS state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testConfigId, setTestConfigId] = useState<number | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const [configsData, providersData] = await Promise.all([
        smsService.getConfigs(),
        smsService.getProviders()
      ]);
      setConfigs(configsData);
      setProviders(providersData);
    } catch (err) {
      setError('Failed to fetch SMS configurations');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await smsService.getTemplates();
      setTemplates(data);
    } catch (err) {
      setError('Failed to fetch SMS templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const [logsData, statsData] = await Promise.all([
        smsService.getLogs(1, 50),
        smsService.getStats()
      ]);
      setLogs(logsData);
      setStats(statsData);
    } catch (err) {
      setError('Failed to fetch SMS logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'config') fetchConfigs();
    else if (activeTab === 'templates') fetchTemplates();
    else if (activeTab === 'logs') fetchLogs();
  }, [activeTab, fetchConfigs, fetchTemplates, fetchLogs]);

  // Config handlers
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingConfig) {
        await smsService.updateConfig(editingConfig.id, {
          provider_name: configForm.provider_name,
          api_key: configForm.api_key || undefined,
          api_secret: configForm.api_secret || undefined,
          sender_id: configForm.sender_id || undefined,
          base_url: configForm.base_url || undefined,
          is_active: configForm.is_active,
          is_default: configForm.is_default,
        });
        setSuccess('SMS configuration updated successfully');
      } else {
        await smsService.createConfig(configForm);
        setSuccess('SMS configuration created successfully');
      }
      setShowConfigModal(false);
      resetConfigForm();
      fetchConfigs();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save configuration');
    }
  };

  const handleDeleteConfig = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this SMS configuration?')) return;
    try {
      await smsService.deleteConfig(id);
      setSuccess('Configuration deleted');
      fetchConfigs();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete configuration');
    }
  };

  const handleTestConfig = async () => {
    if (!testConfigId || !testPhone) return;
    try {
      setTesting(true);
      const result = await smsService.testConfig({ config_id: testConfigId, phone_number: testPhone });
      if (result.success) {
        setSuccess('Test SMS sent successfully!');
      } else {
        setError(result.message);
      }
      setShowTestModal(false);
      setTestPhone('');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send test SMS');
    } finally {
      setTesting(false);
    }
  };

  const resetConfigForm = () => {
    setConfigForm({
      provider_name: '',
      api_key: '',
      api_secret: '',
      sender_id: '',
      base_url: '',
      is_active: true,
      is_default: false,
    });
    setEditingConfig(null);
  };

  // Template handlers
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await smsService.updateTemplate(editingTemplate.id, templateForm);
        setSuccess('SMS template updated successfully');
      } else {
        await smsService.createTemplate(templateForm);
        setSuccess('SMS template created successfully');
      }
      setShowTemplateModal(false);
      resetTemplateForm();
      fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save template');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await smsService.deleteTemplate(id);
      setSuccess('Template deleted');
      fetchTemplates();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete template');
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      template_type: 'attendance_absent',
      message_template: '',
      is_default: false,
    });
    setEditingTemplate(null);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      delivered: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const templateTypes = [
    { value: 'attendance_absent', label: 'Attendance - Absent' },
    { value: 'attendance_late', label: 'Attendance - Late' },
    { value: 'fee_reminder', label: 'Fee Reminder' },
    { value: 'exam_reminder', label: 'Exam Reminder' },
    { value: 'general', label: 'General Notification' },
  ];

  const tabs = [
    { id: 'config' as TabType, label: 'SMS Configuration', icon: '⚙️' },
    { id: 'templates' as TabType, label: 'Message Templates', icon: '📝' },
    { id: 'logs' as TabType, label: 'SMS Logs', icon: '📋' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SMS Settings</h1>
        <p className="text-gray-500">Configure SMS gateway, templates, and view sending history</p>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">SMS Gateway Configurations</h2>
            <button
              onClick={() => {
                resetConfigForm();
                setShowConfigModal(true);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              + Add Configuration
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {configs.map((config) => (
                <div key={config.id} className="bg-white rounded-lg shadow-md border border-gray-200 p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{config.provider_name}</h3>
                      {config.is_default && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      config.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{config.provider_name === 'Twilio' ? 'Account SID:' : 'API Key:'}</span>
                      <span className="font-mono">{config.api_key_masked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{config.provider_name === 'Twilio' ? 'Auth Token:' : 'API Secret:'}</span>
                      <span className="font-mono">{config.api_secret_masked || <span className="text-red-500 text-xs">Not configured</span>}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{config.provider_name === 'Twilio' ? 'Phone Number:' : 'Sender ID:'}</span>
                      <span>{config.sender_id || '-'}</span>
                    </div>
                    {config.base_url && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Base URL:</span>
                        <span className="font-mono text-xs truncate max-w-[200px]" title={config.base_url}>{config.base_url}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <button
                      onClick={() => {
                        setTestConfigId(config.id);
                        setShowTestModal(true);
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => {
                        setEditingConfig(config);
                        setConfigForm({
                          provider_name: config.provider_name,
                          api_key: '',
                          api_secret: '',
                          sender_id: config.sender_id || '',
                          base_url: config.base_url || '',
                          is_active: config.is_active,
                          is_default: config.is_default,
                        });
                        setShowConfigModal(true);
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="px-3 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {configs.length === 0 && (
                <div className="col-span-full bg-gray-50 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-4">📱</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No SMS Configuration</h3>
                  <p className="text-gray-500 mb-4">
                    Configure your SMS gateway to enable sending notifications.
                  </p>
                  <button
                    onClick={() => {
                      resetConfigForm();
                      setShowConfigModal(true);
                    }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    Add Configuration
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Supported Providers Info */}
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Supported SMS Providers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {providers.map((provider) => (
                <div key={provider.name} className="bg-white rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">{provider.name}</h4>
                  <p className="text-sm text-gray-500 mt-1">{provider.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Message Templates</h2>
            <button
              onClick={() => {
                resetTemplateForm();
                setShowTemplateModal(true);
              }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
            >
              + Add Template
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{template.name}</div>
                        {template.is_default && (
                          <span className="text-xs text-indigo-600">Default</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {templateTypes.find(t => t.value === template.template_type)?.label || template.template_type}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md truncate">
                        {template.message_template}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          template.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {template.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => {
                            setEditingTemplate(template);
                            setTemplateForm({
                              name: template.name,
                              template_type: template.template_type,
                              message_template: template.message_template,
                              is_default: template.is_default,
                            });
                            setShowTemplateModal(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No templates configured. Create your first SMS template.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Template Variables Info */}
          <div className="bg-amber-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-amber-900 mb-2">Available Template Variables</h3>
            <p className="text-sm text-amber-800 mb-4">
              Use these placeholders in your templates. They will be replaced with actual values when sending.
            </p>
            <div className="flex flex-wrap gap-2">
              {['{student_name}', '{date}', '{admission_number}', '{class_name}', '{section_name}', '{parent_name}'].map(v => (
                <code key={v} className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-sm">{v}</code>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-gray-500">Total Messages</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-3xl font-bold text-green-600">{stats.sent}</div>
                <div className="text-gray-500">Sent</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-gray-500">Failed</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-gray-500">Pending</div>
              </div>
            </div>
          )}

          {/* Logs Table */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDateTime(log.sent_at || log.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {log.phone_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.student_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.message_type || 'general'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {log.message}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(log.status)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                        No SMS logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">
                {editingConfig ? 'Edit SMS Configuration' : 'Add SMS Configuration'}
              </h2>
            </div>
            <form onSubmit={handleSaveConfig} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
                <select
                  value={configForm.provider_name}
                  onChange={(e) => setConfigForm({ ...configForm, provider_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Select Provider</option>
                  {providers.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {configForm.provider_name === 'Twilio' ? 'Account SID' : 'API Key'} * {editingConfig && <span className="text-gray-400">(leave empty to keep existing)</span>}
                </label>
                <input
                  type="text"
                  value={configForm.api_key}
                  onChange={(e) => setConfigForm({ ...configForm, api_key: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder={editingConfig ? `Current: ${editingConfig.api_key_masked} (enter new value to change)` : configForm.provider_name === 'Twilio' ? 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' : 'Your API key'}
                  required={!editingConfig}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {configForm.provider_name === 'Twilio' ? 'Auth Token *' : 'API Secret'} {editingConfig && <span className="text-gray-400">(leave empty to keep existing)</span>}
                </label>
                <input
                  type="text"
                  value={configForm.api_secret}
                  onChange={(e) => setConfigForm({ ...configForm, api_secret: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder={editingConfig && editingConfig.api_secret_masked ? `Current: ${editingConfig.api_secret_masked} (enter new value to change)` : configForm.provider_name === 'Twilio' ? 'Your Twilio Auth Token' : 'API secret (if required)'}
                  required={configForm.provider_name === 'Twilio' && !editingConfig}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {configForm.provider_name === 'Twilio' ? 'From Phone Number' : 'Sender ID'}
                </label>
                <input
                  type="text"
                  value={configForm.sender_id}
                  onChange={(e) => setConfigForm({ ...configForm, sender_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder={configForm.provider_name === 'Twilio' ? '+1xxxxxxxxxx (your Twilio phone number)' : 'e.g., SCHOOL'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input
                  type="text"
                  value={configForm.base_url}
                  onChange={(e) => setConfigForm({ ...configForm, base_url: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="For custom providers"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={configForm.is_default}
                  onChange={(e) => setConfigForm({ ...configForm, is_default: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 rounded"
                />
                <label htmlFor="isDefault" className="text-sm text-gray-700">
                  Set as default provider
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={configForm.is_active !== false}
                  onChange={(e) => setConfigForm({ ...configForm, is_active: e.target.checked })}
                  className="h-4 w-4 text-green-600 rounded"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Active (enable sending via this provider)
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfigModal(false);
                    resetConfigForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {editingConfig ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">
                {editingTemplate ? 'Edit Template' : 'Add Template'}
              </h2>
            </div>
            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Absence Notification"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={templateForm.template_type}
                  onChange={(e) => setTemplateForm({ ...templateForm, template_type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  {templateTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Template *</label>
                <textarea
                  value={templateForm.message_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, message_template: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32"
                  placeholder="Dear Parent, your ward {student_name} was absent..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use variables: {'{student_name}'}, {'{date}'}, {'{admission_number}'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefaultTemplate"
                  checked={templateForm.is_default}
                  onChange={(e) => setTemplateForm({ ...templateForm, is_default: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 rounded"
                />
                <label htmlFor="isDefaultTemplate" className="text-sm text-gray-700">
                  Set as default for this type
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTemplateModal(false);
                    resetTemplateForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test SMS Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Send Test SMS</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="+91 9876543210"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTestModal(false);
                    setTestPhone('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestConfig}
                  disabled={testing || !testPhone}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {testing ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SMSSettings;
