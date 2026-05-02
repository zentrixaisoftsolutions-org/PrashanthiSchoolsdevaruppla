import React, { useEffect, useState } from 'react';
import paymentGatewayService, { PaymentGatewayConfig } from '../../services/paymentGatewayService';

const PaymentGatewaySettings: React.FC = () => {
  const [configs, setConfigs] = useState<PaymentGatewayConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState<number | null>(null);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    provider: 'razorpay',
    key_id: '',
    key_secret: '',
    webhook_secret: '',
    is_test_mode: true,
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const data = await paymentGatewayService.listConfigs();
      setConfigs(data);
    } catch {
      setError('Failed to load payment gateway configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editId) {
        await paymentGatewayService.updateConfig(editId, {
          provider: formData.provider,
          key_id: formData.key_id || undefined,
          key_secret: formData.key_secret || undefined,
          webhook_secret: formData.webhook_secret || undefined,
          is_test_mode: formData.is_test_mode,
        });
        setSuccess('Configuration updated');
      } else {
        await paymentGatewayService.createConfig({
          provider: formData.provider,
          key_id: formData.key_id,
          key_secret: formData.key_secret,
          webhook_secret: formData.webhook_secret || undefined,
          is_test_mode: formData.is_test_mode,
        });
        setSuccess('Configuration created');
      }
      resetForm();
      loadConfigs();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deactivate this configuration?')) return;
    try {
      await paymentGatewayService.deleteConfig(id);
      setSuccess('Configuration deactivated');
      loadConfigs();
    } catch {
      setError('Failed to delete');
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    setError('');
    setSuccess('');
    try {
      const result = await paymentGatewayService.testConfig(id);
      if (result.success) {
        setSuccess(`Connection test passed! ${result.message}`);
      } else {
        setError(`Connection test failed: ${result.message}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Test failed');
    } finally {
      setTesting(null);
    }
  };

  const handleEdit = (c: PaymentGatewayConfig) => {
    setEditId(c.id);
    setFormData({
      provider: c.provider,
      key_id: '',
      key_secret: '',
      webhook_secret: '',
      is_test_mode: c.is_test_mode,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditId(null);
    setShowForm(false);
    setFormData({
      provider: 'razorpay',
      key_id: '',
      key_secret: '',
      webhook_secret: '',
      is_test_mode: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Header Card */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="h-1 bg-teal-500 rounded-t-lg"></div>
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-normal text-orange-600 tracking-wide">PAYMENT GATEWAY SETTINGS</h2>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded text-sm font-medium"
          >
            + Add Gateway
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4 rounded">
          <p className="text-green-700 text-sm">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-500 text-xs mt-1 underline">Dismiss</button>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="bg-gray-100 px-4 py-3 rounded-t-lg border-b flex justify-between items-center">
              <h3 className="text-base font-medium text-gray-800">{editId ? 'Edit Gateway Config' : 'Add Gateway Config'}</h3>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Provider</label>
                <select
                  value={formData.provider}
                  onChange={e => setFormData(p => ({ ...p, provider: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="razorpay">Razorpay</option>
                  <option value="paytm">Paytm</option>
                  <option value="phonepe">PhonePe</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {formData.provider === 'razorpay' ? 'Key ID' : 'API Key'}
                  {editId && <span className="text-gray-400 ml-1">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="text"
                  value={formData.key_id}
                  onChange={e => setFormData(p => ({ ...p, key_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder={formData.provider === 'razorpay' ? 'rzp_test_...' : 'Your API Key'}
                  required={!editId}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {formData.provider === 'razorpay' ? 'Key Secret' : 'API Secret'}
                  {editId && <span className="text-gray-400 ml-1">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="password"
                  value={formData.key_secret}
                  onChange={e => setFormData(p => ({ ...p, key_secret: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Your secret key"
                  required={!editId}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Webhook Secret (optional)</label>
                <input
                  type="text"
                  value={formData.webhook_secret}
                  onChange={e => setFormData(p => ({ ...p, webhook_secret: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Webhook verification secret"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_test_mode}
                    onChange={e => setFormData(p => ({ ...p, is_test_mode: e.target.checked }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Test Mode</span>
                </label>
                {formData.is_test_mode && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                    Using test/sandbox environment
                  </span>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-2 rounded text-sm font-medium">
                  {editId ? 'Update' : 'Save'}
                </button>
                <button type="button" onClick={resetForm} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded text-sm font-medium">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config List */}
      {configs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-2">No payment gateway configured</p>
          <p className="text-sm text-gray-400">Add a Razorpay configuration to enable online fee payments</p>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map(c => (
            <div key={c.id} className={`bg-white rounded-lg shadow border-l-4 ${c.is_active ? 'border-green-500' : 'border-gray-300'}`}>
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${
                      c.provider === 'razorpay' ? 'bg-blue-600' : 'bg-indigo-600'
                    }`}>
                      {c.provider.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 capitalize">{c.provider}</h3>
                      <p className="text-xs text-gray-400">Key: {c.key_id_masked}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.is_test_mode && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">TEST MODE</span>
                    )}
                    {c.is_active ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">Inactive</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTest(c.id)}
                    disabled={testing === c.id}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                  >
                    {testing === c.id ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={() => handleEdit(c)}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-medium"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Panel */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-100">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">Razorpay Setup Guide</h4>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Create a Razorpay account at <span className="font-mono text-blue-600">https://razorpay.com</span></li>
          <li>Go to Settings → API Keys in your Razorpay dashboard</li>
          <li>Generate a new API key pair (Key ID and Key Secret)</li>
          <li>For testing, use Test mode keys (starting with <span className="font-mono">rzp_test_</span>)</li>
          <li>For production, switch to Live mode keys (starting with <span className="font-mono">rzp_live_</span>)</li>
          <li>Enter the keys above and click &quot;Test Connection&quot; to verify</li>
        </ol>
      </div>
    </div>
  );
};

export default PaymentGatewaySettings;
