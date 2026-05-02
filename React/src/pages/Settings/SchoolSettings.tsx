import React, { useEffect, useState, useRef } from 'react';
import schoolSettingsService, { SchoolSettings, SchoolSettingsUpdate } from '../../services/schoolSettingsService';

const SchoolSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [form, setForm] = useState<SchoolSettingsUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await schoolSettingsService.get();
      setSettings(data);
      setForm({
        school_name: data.school_name,
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        affiliation: data.affiliation || '',
      });
    } catch {
      setAlert({ type: 'error', msg: 'Failed to load school settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const data = await schoolSettingsService.update(form);
      setSettings(data);
      setAlert({ type: 'success', msg: 'Settings saved successfully!' });
    } catch {
      setAlert({ type: 'error', msg: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate size (max 2 MB)
    if (file.size > 2 * 1024 * 1024) {
      setAlert({ type: 'error', msg: 'Logo file must be under 2 MB' });
      return;
    }
    try {
      setUploading(true);
      const data = await schoolSettingsService.uploadLogo(file);
      setSettings(data);
      setAlert({ type: 'success', msg: 'Logo uploaded successfully!' });
    } catch {
      setAlert({ type: 'error', msg: 'Failed to upload logo' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    if (!window.confirm('Remove the school logo?')) return;
    try {
      const data = await schoolSettingsService.deleteLogo();
      setSettings(data);
      setAlert({ type: 'success', msg: 'Logo removed' });
    } catch {
      setAlert({ type: 'error', msg: 'Failed to remove logo' });
    }
  };

  const logoUrl = settings ? schoolSettingsService.getLogoUrl(settings) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">School Settings</h1>

      {/* Alert */}
      {alert && (
        <div
          className={`mb-4 px-4 py-3 rounded text-sm ${
            alert.type === 'success' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'
          }`}
        >
          {alert.msg}
          <button onClick={() => setAlert(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {/* Logo Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">School Logo / Icon</h2>
        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-28 h-28 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="School Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-gray-400 text-xs text-center px-2">No logo uploaded</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {uploading ? 'Uploading…' : 'Upload Logo'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
            </label>
            {logoUrl && (
              <button
                onClick={handleDeleteLogo}
                className="text-red-500 hover:text-red-700 text-xs font-medium"
              >
                Remove Logo
              </button>
            )}
            <p className="text-xs text-gray-400">PNG, JPG, SVG or WebP. Max 2 MB.</p>
          </div>
        </div>
      </div>

      {/* School Information Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">School Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* School Name */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">School Name *</label>
            <input
              type="text"
              value={form.school_name || ''}
              onChange={(e) => setForm({ ...form, school_name: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Enter school name"
            />
          </div>

          {/* Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
            <textarea
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              placeholder="Enter school address"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="+91 XXXXXXXXXX"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email || ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="info@school.com"
            />
          </div>

          {/* Website */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Website</label>
            <input
              type="text"
              value={form.website || ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="https://www.school.com"
            />
          </div>

          {/* Affiliation */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Affiliation</label>
            <input
              type="text"
              value={form.affiliation || ''}
              onChange={(e) => setForm({ ...form, affiliation: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="e.g. Affiliated to CBSE, New Delhi"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || !form.school_name?.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-2 rounded font-medium text-sm transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving…
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>

      {/* Preview Card */}
      {settings && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Receipt Header Preview</h2>
          <div className="border rounded-lg p-4 text-center">
            {logoUrl && (
              <img src={logoUrl} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />
            )}
            <h3 className="text-lg font-bold text-gray-900 uppercase">
              {form.school_name || 'School Name'}
            </h3>
            {form.affiliation && (
              <p className="text-xs text-gray-600">{form.affiliation}</p>
            )}
            {form.address && (
              <p className="text-xs text-gray-500">{form.address}</p>
            )}
            <p className="text-xs text-gray-500">
              {[form.phone, form.email].filter(Boolean).join(' | ') || 'Phone | Email'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolSettingsPage;
