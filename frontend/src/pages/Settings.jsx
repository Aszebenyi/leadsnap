import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { getProfile, updateProfile, getKeywords, addKeyword, deleteKeyword, getGroups, addGroup, deleteGroup } from '../lib/api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError]     = useState('');

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

  // ── Render ────────────────────────────────────────────────────────────────────

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
              <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service description</label>
              <textarea value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <p className="text-xs text-gray-400 mt-1">Used to generate personalised AI replies.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number (SMS alerts)</label>
              <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="+1 555 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="America/New_York" />
            </div>
            <button type="submit" disabled={savingProfile} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
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
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. lawn mowing"
            />
            <button onClick={handleAddKeyword} disabled={savingKeyword || !keywordInput.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              Add
            </button>
          </div>
          {keywords.length === 0 ? (
            <p className="text-sm text-gray-400">No keywords yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <span key={kw.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full border border-blue-200">
                  {kw.keyword}
                  <button onClick={() => handleDeleteKeyword(kw.id)} className="text-blue-400 hover:text-red-500 ml-1 leading-none transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Groups */}
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Facebook groups</h2>
          <div className="space-y-2 mb-4">
            <input type="url" value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://www.facebook.com/groups/..." />
            <div className="flex gap-2">
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Group name (optional)" />
              <button onClick={handleAddGroup} disabled={savingGroup || !groupUrl.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                Add
              </button>
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400">No groups yet.</p>
          ) : (
            <ul className="space-y-2">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{g.group_name || 'Unnamed group'}</p>
                    <p className="text-xs text-gray-400 truncate max-w-xs">{g.facebook_group_url}</p>
                  </div>
                  <button onClick={() => handleDeleteGroup(g.id)} className="text-red-400 hover:text-red-600 text-sm ml-4 shrink-0 transition-colors">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
