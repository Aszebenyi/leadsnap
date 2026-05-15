import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProfile, updateProfile, exportLeads, deleteAccount } from '../lib/api';
import supabase from '../lib/supabase';

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyError(err) {
  const msg = err?.message || '';
  if (/network|fetch|failed to fetch/i.test(msg)) return 'Connection error. Check your internet.';
  if (/401|unauthorized/i.test(msg))               return 'Session expired. Please sign in again.';
  if (/subscription/i.test(msg))                   return 'An active subscription is required.';
  if (msg.length > 0 && msg.length < 120)          return msg;
  return 'Something went wrong. Please try again.';
}

// Inline feedback — auto-clears after 3 s on success
function useFeedback() {
  const [msg, setMsg] = useState({ type: '', text: '' });
  function flash(type, text) {
    setMsg({ type, text });
    if (type === 'success') setTimeout(() => setMsg({ type: '', text: '' }), 3000);
  }
  return [msg, flash];
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${checked ? 'bg-orange-500' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Business Profile form
  const [bizName,        setBizName]        = useState('');
  const [serviceDesc,    setServiceDesc]    = useState('');
  const [websiteUrl,     setWebsiteUrl]     = useState('');
  const [includeWebsite, setIncludeWebsite] = useState(false);
  const [savingProfile,  setSavingProfile]  = useState(false);
  const [profileMsg,     flashProfile]      = useFeedback();

  // Alerts form
  const [phone,        setPhone]        = useState('');
  const [alertChannel, setAlertChannel] = useState('sms');
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertsMsg,    flashAlerts]     = useFeedback();

  // Data / account
  const [exporting,   setExporting]   = useState(false);
  const [exportError, setExportError] = useState('');
  const [deleteStep,  setDeleteStep]  = useState(0);
  const [deleteError, setDeleteError] = useState('');

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    getProfile()
      .then((p) => {
        setBizName(p.business_name                  ?? '');
        setServiceDesc(p.service_description        ?? '');
        setWebsiteUrl(p.website_url                 ?? '');
        setIncludeWebsite(p.include_website_in_replies ?? false);
        setPhone(p.phone_number                     ?? '');
        setAlertChannel(p.alert_channel             ?? 'sms');
      })
      .catch((err) => flashProfile('error', friendlyError(err)))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        business_name:              bizName.trim(),
        service_description:        serviceDesc.trim(),
        website_url:                websiteUrl.trim(),
        include_website_in_replies: includeWebsite,
      });
      flashProfile('success', '✓ Profile saved');
    } catch (err) {
      flashProfile('error', friendlyError(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveAlerts(e) {
    e.preventDefault();
    setSavingAlerts(true);
    try {
      await updateProfile({ phone_number: phone.trim(), alert_channel: alertChannel });
      flashAlerts('success', '✓ Alert settings saved');
    } catch (err) {
      flashAlerts('error', friendlyError(err));
    } finally {
      setSavingAlerts(false);
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const blob = await exportLeads();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'leadsnap-leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(friendlyError(err));
    } finally {
      setExporting(false);
    }
  }

  // ── Delete account ─────────────────────────────────────────────────────────

  async function handleDeleteAccount() {
    setDeleteStep(2);
    setDeleteError('');
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      navigate('/');
    } catch (err) {
      setDeleteError(friendlyError(err));
      setDeleteStep(1);
    }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white';

  function Feedback({ msg }) {
    if (!msg.text) return null;
    const cls = msg.type === 'success'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-red-50 text-red-700 border border-red-200';
    return <p className={`text-sm px-3 py-2 rounded-lg mt-3 ${cls}`}>{msg.text}</p>;
  }

  function SectionHeader({ children }) {
    return (
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
        {children}
      </h2>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* ── Business Profile ─────────────────────────────────────────── */}
        <div>
          <SectionHeader>Business Profile</SectionHeader>
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <form onSubmit={handleSaveProfile} className="space-y-5">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Austin Lawn Care"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service description</label>
                <textarea
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                  rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Describe what you do and who your ideal customer is — this is used to generate personalised AI replies"
                  maxLength={2000}
                />
                <p className="text-xs text-gray-400 mt-1">Used to score leads and generate personalised AI replies.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                <div className="flex items-center gap-3">
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className={`${inputCls} flex-1 min-w-0`}
                    placeholder="https://yourbusiness.com"
                  />
                  <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
                    <Toggle checked={includeWebsite} onChange={setIncludeWebsite} />
                    <span className="text-sm text-gray-600 whitespace-nowrap">In replies</span>
                  </label>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </button>
                <Feedback msg={profileMsg} />
              </div>

            </form>
          </section>
        </div>

        {/* ── Alerts ───────────────────────────────────────────────────── */}
        <div>
          <SectionHeader>Alerts</SectionHeader>
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <form onSubmit={handleSaveAlerts} className="space-y-5">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="+1 555 000 0000"
                />
                <p className="text-xs text-gray-400 mt-1">You'll receive an alert whenever a matching lead is found.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Alert channel</label>
                <div className="flex gap-2">
                  {[{ value: 'sms', label: 'SMS' }, { value: 'whatsapp', label: 'WhatsApp' }].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAlertChannel(value)}
                      className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors min-h-[44px] ${
                        alertChannel === value
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-300 bg-white text-gray-500 hover:border-orange-400 hover:text-orange-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingAlerts}
                  className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {savingAlerts ? 'Saving…' : 'Save alerts'}
                </button>
                <Feedback msg={alertsMsg} />
              </div>

            </form>
          </section>
        </div>

        {/* ── Data ─────────────────────────────────────────────────────── */}
        <div>
          <SectionHeader>Data</SectionHeader>

          {/* Export */}
          <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Export leads</h3>
            <p className="text-sm text-gray-500 mb-4">Download all your leads as a CSV file.</p>
            {exportError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{exportError}</p>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {exporting ? 'Preparing…' : 'Download leads CSV'}
            </button>
          </section>

          {/* Delete account */}
          <section className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
            <h3 className="text-base font-semibold text-red-700 mb-1">Delete account</h3>
            <p className="text-sm text-gray-500 mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>

            {deleteStep === 0 && (
              <button
                onClick={() => setDeleteStep(1)}
                className="border border-red-300 text-red-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors min-h-[44px]"
              >
                Delete account…
              </button>
            )}

            {deleteStep >= 1 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-red-800">
                  Are you sure? This will permanently delete your account, all leads, keywords, and groups.
                </p>
                {deleteError && (
                  <p className="text-xs text-red-600">{deleteError}</p>
                )}
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteStep === 2}
                    className="bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors min-h-[44px]"
                  >
                    {deleteStep === 2 ? 'Deleting…' : 'Yes, delete my account'}
                  </button>
                  <button
                    onClick={() => { setDeleteStep(0); setDeleteError(''); }}
                    disabled={deleteStep === 2}
                    className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
