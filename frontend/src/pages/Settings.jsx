import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getProfile, updateProfile, getKeywords, addKeyword, deleteKeyword, getGroups, addGroup, deleteGroup, deleteAccount, exportLeads } from '../lib/api';
import supabase from '../lib/supabase';

export default function Settings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError]     = useState('');

  // Data export
  const [exporting, setExporting] = useState(false);

  // Account deletion
  const [deleteStep, setDeleteStep]   = useState(0); // 0 = hidden, 1 = confirm prompt, 2 = deleting
  const [deleteError, setDeleteError] = useState('');

  // Profile
  const [businessName, setBusinessName]           = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [phoneNumber, setPhoneNumber]             = useState('');
  const [timezone, setTimezone]                   = useState('UTC');
  const [savingProfile, setSavingProfile]         = useState(false);

  // Keywords
  const [keywords, setKeywords]         = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [savingKeyword, setSavingKeyword] = useState(false);

  // Groups
  const [groups, setGroups]         = useState([]);
  const [groupUrl, setGroupUrl]     = useState('');
  const [groupName, setGroupName]   = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [profile, kws, grps] = await Promise.all([getProfile(), getKeywords(), getGroups()]);
        setBusinessName(profile.business_name ?? '');
        setServiceDescription(profile.service_description ?? '');
        setPhoneNumber(profile.phone_number ?? '');
        setTimezone(profile.timezone ?? 'UTC');
        setKeywords(kws);
        setGroups(grps);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function flash(msg) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  // ── Profile save ─────────────────────────────────────────────────────────────
  async function handleSaveProfile(e) {
    e.preventDefault();
    setError('');
    setSavingProfile(true);
    try {
      await updateProfile({ business_name: businessName, service_description: serviceDescription, phone_number: phoneNumber, timezone });
      flash('Profile saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Keyword actions ───────────────────────────────────────────────────────────
  async function handleAddKeyword() {
    const kw = keywordInput.trim();
    if (!kw) return;
    setSavingKeyword(true);
    setError('');
    try {
      const added = await addKeyword(kw);
      setKeywords((k) => [...k, added]);
      setKeywordInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKeyword(false);
    }
  }

  async function handleDeleteKeyword(id) {
    setError('');
    try {
      await deleteKeyword(id);
      setKeywords((k) => k.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Group actions ─────────────────────────────────────────────────────────────
  async function handleAddGroup() {
    const url = groupUrl.trim();
    if (!url) return;
    setSavingGroup(true);
    setError('');
    try {
      const added = await addGroup(url, groupName.trim() || undefined);
      setGroups((g) => [...g, added]);
      setGroupUrl('');
      setGroupName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleDeleteGroup(id) {
    setError('');
    try {
      await deleteGroup(id);
      setGroups((g) => g.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      const blob = await exportLeads();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'leadsnap-leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  // ── Account deletion ──────────────────────────────────────────────────────────
  async function handleDeleteAccount() {
    setDeleteStep(2);
    setDeleteError('');
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message);
      setDeleteStep(1);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
        )}
        {saveMsg && (
          <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">{saveMsg}</div>
        )}

        {/* Profile */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Business profile</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
              <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service description</label>
              <textarea value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
              <p className="text-xs text-gray-400 mt-1">Used to generate personalised AI replies.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number (SMS alerts)</label>
              <input type="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputClass} placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} placeholder="America/New_York" />
            </div>
            <button type="submit" disabled={savingProfile} className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[44px]">
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </section>

        {/* Keywords */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Keywords</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); }}}
              className={`flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`}
              placeholder="e.g. lawn mowing"
            />
            <button
              onClick={handleAddKeyword}
              disabled={savingKeyword || !keywordInput.trim()}
              className="bg-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors shrink-0 min-h-[44px]"
            >
              Add
            </button>
          </div>
          {keywords.length === 0 ? (
            <p className="text-sm text-gray-400">No keywords yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <span key={kw.id} className="flex items-center gap-1 bg-orange-50 text-orange-700 text-sm px-3 py-1.5 rounded-full border border-orange-200">
                  {kw.keyword}
                  <button
                    onClick={() => handleDeleteKeyword(kw.id)}
                    className="text-orange-400 hover:text-red-500 ml-1 leading-none transition-colors p-0.5"
                    aria-label={`Remove ${kw.keyword}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Groups */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Facebook groups</h2>
          <div className="space-y-2 mb-4">
            <input type="url" value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} className={inputClass} placeholder="https://www.facebook.com/groups/..." />
            <div className="flex gap-2">
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className={`flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500`} placeholder="Group name (optional)" />
              <button
                onClick={handleAddGroup}
                disabled={savingGroup || !groupUrl.trim()}
                className="bg-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors shrink-0 min-h-[44px]"
              >
                Add
              </button>
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No groups yet.</p>
          ) : (
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-200">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{g.group_name || 'Unnamed group'}</p>
                    <p className="text-xs text-gray-400 truncate">{g.facebook_group_url}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteGroup(g.id)}
                    className="text-red-400 hover:text-red-600 text-sm shrink-0 transition-colors px-2 py-1.5 rounded"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {/* Data export */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Export your data</h2>
          <p className="text-sm text-gray-500 mb-4">Download all your leads as a CSV file.</p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {exporting ? 'Preparing…' : 'Download leads CSV'}
          </button>
        </section>

        {/* Danger zone */}
        <section className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-red-700 mb-1">Danger zone</h2>
          <p className="text-sm text-gray-500 mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>

          {deleteStep === 0 && (
            <button
              onClick={() => setDeleteStep(1)}
              className="border border-red-300 text-red-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors min-h-[44px]"
            >
              Delete account
            </button>
          )}

          {deleteStep >= 1 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-red-800">Are you sure? This will permanently delete your account, all leads, keywords, and groups.</p>
              {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteStep === 2}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {deleteStep === 2 ? 'Deleting…' : 'Yes, delete my account'}
                </button>
                <button
                  onClick={() => { setDeleteStep(0); setDeleteError(''); }}
                  disabled={deleteStep === 2}
                  className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
