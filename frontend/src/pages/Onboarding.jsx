import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile, addKeyword, addGroup } from '../lib/api';

const STEPS = ['profile', 'keywords', 'groups', 'install'];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Step 1 — profile
  const [businessName, setBusinessName]           = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [phoneNumber, setPhoneNumber]             = useState('');

  // Step 2 — keywords
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords]         = useState([]);

  // Step 3 — groups
  const [groupUrl, setGroupUrl]   = useState('');
  const [groupName, setGroupName] = useState('');
  const [groups, setGroups]       = useState([]);

  function next() { setError(''); setStep((s) => s + 1); }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function saveProfile(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateProfile({
        business_name:       businessName,
        service_description: serviceDescription,
        phone_number:        phoneNumber,
        onboarded:           false, // set true at the end
      });
      next();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addKeywordLocal() {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) return;
    setKeywords((k) => [...k, kw]);
    setKeywordInput('');
  }

  function removeKeyword(kw) { setKeywords((k) => k.filter((x) => x !== kw)); }

  async function saveKeywords(e) {
    e.preventDefault();
    if (!keywords.length) { setError('Add at least one keyword.'); return; }
    setError('');
    setSaving(true);
    try {
      await Promise.all(keywords.map((kw) => addKeyword(kw)));
      next();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function addGroupLocal() {
    const url = groupUrl.trim();
    if (!url) return;
    setGroups((g) => [...g, { url, name: groupName.trim() || url }]);
    setGroupUrl('');
    setGroupName('');
  }

  function removeGroup(url) { setGroups((g) => g.filter((x) => x.url !== url)); }

  async function saveGroups(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (groups.length) {
        await Promise.all(groups.map((g) => addGroup(g.url, g.name)));
      }
      await updateProfile({ onboarded: true });
      next();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const currentStep = STEPS[step];
  const progress = Math.round(((step) / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="font-bold text-orange-500 text-xl">LeadSnap</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Set up your account</h1>
          <p className="text-gray-500 text-sm mt-1">Step {step + 1} of {STEPS.length}</p>
          <div className="mt-4 h-1.5 bg-gray-200 rounded-full">
            <div className="h-1.5 bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {error && (
            <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Step 1 — Profile */}
          {currentStep === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Your business</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="John's Lawn Care"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">What services do you offer?</label>
                <textarea
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  required
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="I offer lawn mowing, edging, and yard clean-up in the Springfield area."
                />
                <p className="text-xs text-gray-400 mt-1">This is used to generate personalised AI replies for you.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number for SMS alerts</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="+1 555 000 0000"
                />
              </div>
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </form>
          )}

          {/* Step 2 — Keywords */}
          {currentStep === 'keywords' && (
            <form onSubmit={saveKeywords} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Keywords to monitor</h2>
              <p className="text-sm text-gray-500">Add words or phrases people use when looking for your service (e.g. "need a plumber", "lawn mowing").</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeywordLocal(); }}}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="lawn mowing"
                />
                <button type="button" onClick={addKeywordLocal} className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors shrink-0 min-h-[44px]">
                  Add
                </button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 bg-orange-50 text-orange-700 text-sm px-3 py-1 rounded-full border border-orange-200">
                      {kw}
                      <button type="button" onClick={() => removeKeyword(kw)} className="text-orange-400 hover:text-orange-700 ml-1 leading-none">×</button>
                    </span>
                  ))}
                </div>
              )}
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </form>
          )}

          {/* Step 3 — Groups */}
          {currentStep === 'groups' && (
            <form onSubmit={saveGroups} className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Facebook groups to monitor</h2>
              <p className="text-sm text-gray-500">Add the URLs of Facebook groups you're a member of. You can add more later.</p>
              <div className="space-y-2">
                <input
                  type="url"
                  value={groupUrl}
                  onChange={(e) => setGroupUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="https://www.facebook.com/groups/springfield-community"
                />
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Group name (optional)"
                />
                <button type="button" onClick={addGroupLocal} disabled={!groupUrl.trim()} className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40 transition-colors">
                  Add group
                </button>
              </div>
              {groups.length > 0 && (
                <ul className="space-y-2">
                  {groups.map((g) => (
                    <li key={g.url} className="flex items-center justify-between gap-3 text-sm bg-gray-50 px-3 py-2.5 rounded-lg border border-gray-200">
                      <span className="text-gray-700 truncate min-w-0">{g.name}</span>
                      <button type="button" onClick={() => removeGroup(g.url)} className="text-red-400 hover:text-red-600 shrink-0 px-2 py-1">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : groups.length ? 'Save & continue' : 'Skip for now'}
              </button>
            </form>
          )}

          {/* Step 4 — Install extension */}
          {currentStep === 'install' && (
            <div className="space-y-4 text-center">
              <div className="text-5xl">🧩</div>
              <h2 className="text-lg font-semibold text-gray-900">Install the Chrome extension</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                The extension monitors your Facebook groups in the background. Install it and sign in with the same account to start receiving leads.
              </p>
              <a
                href="#"
                className="block w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                Install LeadSnap for Chrome
              </a>
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full text-gray-500 text-sm hover:text-gray-700 transition-colors"
              >
                I'll install it later — go to dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
