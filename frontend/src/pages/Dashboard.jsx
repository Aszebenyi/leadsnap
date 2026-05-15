import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '../components/Navbar';
import LeadCard from '../components/LeadCard';
import { useLeads } from '../hooks/useLeads';
import { getProfile, getLeads, getLeadStats, updateLeadStatus as apiUpdateLeadStatus, bulkUpdateLeadStatus } from '../lib/api';

const STATUS_TABS = [
  { label: 'All',     value: undefined  },
  { label: 'New',     value: 'new'      },
  { label: 'Seen',    value: 'seen'     },
  { label: 'Replied', value: 'replied'  },
  { label: 'Won',     value: 'won'      },
  { label: 'Lost',    value: 'lost'     },
];

const EMPTY_MESSAGES = {
  undefined: { icon: '📭', text: 'No leads yet. Make sure your Chrome extension is installed and Facebook groups are configured.' },
  new:       { icon: '✅', text: 'No new leads — you\'re all caught up!' },
  seen:      { icon: '👀', text: 'No leads marked as seen yet.' },
  replied:   { icon: '💬', text: 'No leads you\'ve replied to yet.' },
  won:       { icon: '🏆', text: 'No won leads yet — keep replying!' },
  lost:      { icon: '😞', text: 'No lost leads. Good work!' },
};

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 animate-pulse">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-10 bg-gray-200 rounded-full" />
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
        </div>
        <div className="h-6 w-20 bg-gray-200 rounded-md" />
      </div>
      {/* Post text lines */}
      <div className="space-y-2 mb-4">
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-4/5 bg-gray-200 rounded" />
        <div className="h-4 w-3/5 bg-gray-200 rounded" />
      </div>
      {/* Keyword chips */}
      <div className="flex gap-2 mb-4">
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
        <div className="h-5 w-20 bg-gray-200 rounded-full" />
      </div>
      {/* AI reply block */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
        <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-full bg-gray-200 rounded mb-1" />
        <div className="h-4 w-3/4 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [search, setSearch]             = useState('');
  const [dateRange, setDateRange]       = useState('all');
  const [lastScanAt, setLastScanAt]     = useState(undefined);
  const [newCount, setNewCount]         = useState(null);
  const [stats, setStats]               = useState(null);
  const [markingAllSeen, setMarkingAllSeen] = useState(false);

  function getDateFilters(range) {
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { from: start.toISOString() };
    }
    if (range === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7);
      return { from: start.toISOString() };
    }
    if (range === 'month') {
      const start = new Date(now); start.setDate(now.getDate() - 30);
      return { from: start.toISOString() };
    }
    return {};
  }

  const leadsFilters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
    ...getDateFilters(dateRange),
  };

  const { leads, total, loading, loadingMore, hasMore, error, loadMore, updateLeadStatus } = useLeads(leadsFilters);

  useEffect(() => {
    getProfile()
      .then((p) => setLastScanAt(p.last_scan_at ?? null))
      .catch(() => setLastScanAt(null));
    getLeads({ status: 'new', limit: 1 })
      .then((d) => setNewCount(d.total ?? 0))
      .catch(() => {});
    getLeadStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  // Infinite scroll sentinel
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const extensionDisconnected = lastScanAt !== undefined && (
    lastScanAt === null ||
    Date.now() - new Date(lastScanAt).getTime() > 24 * 60 * 60 * 1000
  );

  const handleStatusChange = useCallback(async (id, status) => {
    const updated = await updateLeadStatus(id, status);
    // Keep new-lead badge in sync
    if (status !== 'new') setNewCount((c) => Math.max(0, (c ?? 1) - 1));
    return updated;
  }, [updateLeadStatus]);

  async function handleMarkAllSeen() {
    if (!leads.length || statusFilter !== 'new') return;
    setMarkingAllSeen(true);
    try {
      await bulkUpdateLeadStatus(leads.map((l) => l.id), 'seen');
      setNewCount(0);
      // Switch to "All" tab — changes filtersKey, triggering useLeads to refetch
      setStatusFilter(undefined);
    } catch {
      // leave state as-is so the user can retry
    } finally {
      setMarkingAllSeen(false);
    }
  }

  function handleFilterChange(value) {
    setStatusFilter(value);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? <span className="inline-block h-4 w-12 bg-gray-200 rounded animate-pulse align-middle" /> : `${total} total`}
            </p>
          </div>
        </div>

        {/* Search + date filter */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            )}
          </div>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-700"
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
          </select>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Leads this week', val: stats?.this_week, suffix: '' },
            { label: 'Avg. score',      val: stats?.avg_score,  suffix: '/10' },
            { label: 'Total wins',      val: stats?.wins,        suffix: '' },
          ].map(({ label, val, suffix }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {stats === null
                  ? <span className="inline-block h-6 w-10 bg-gray-100 rounded animate-pulse" />
                  : val == null ? '—'
                  : <>{val}{suffix}</>
                }
              </p>
            </div>
          ))}
        </div>

        {/* Extension not connected warning */}
        {extensionDisconnected && (
          <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div>
              <p className="font-medium">Extension not scanning</p>
              <p className="text-amber-700 mt-0.5">No scan has been detected in the last 24 hours. Make sure Chrome is open and you're logged into Facebook.</p>
            </div>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="mb-6 overflow-x-auto -mx-4 px-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-max min-w-full sm:w-fit sm:min-w-0">
            {STATUS_TABS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => handleFilterChange(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  statusFilter === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                {value === 'new' && newCount > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {newCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 mb-4">
            {error}
          </div>
        )}

        {/* Skeleton loading state */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Mark all seen */}
        {!loading && statusFilter === 'new' && leads.length > 0 && (
          <div className="flex justify-end mb-3">
            <button
              onClick={handleMarkAllSeen}
              disabled={markingAllSeen}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
            >
              {markingAllSeen ? 'Marking…' : 'Mark all seen'}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && leads.length === 0 && (() => {
          const { icon, text } = EMPTY_MESSAGES[statusFilter] ?? EMPTY_MESSAGES[undefined];
          return (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">{icon}</div>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">{text}</p>
            </div>
          );
        })()}

        {/* Lead cards */}
        {!loading && leads.length > 0 && (
          <>
            <div className="space-y-4">
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onStatusChange={handleStatusChange} />
              ))}
            </div>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="mt-4 h-1" />
            {loadingMore && (
              <div className="flex justify-center py-6">
                <svg className="w-5 h-5 animate-spin text-orange-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* End of results */}
            {!hasMore && leads.length > 0 && (
              <p className="text-center text-xs text-gray-400 mt-6">
                {leads.length === total
                  ? `All ${total} lead${total !== 1 ? 's' : ''} loaded`
                  : `Showing ${leads.length} of ${total} leads`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
