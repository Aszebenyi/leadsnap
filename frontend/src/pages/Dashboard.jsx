import { useState } from 'react';
import Navbar from '../components/Navbar';
import LeadCard from '../components/LeadCard';
import { useLeads } from '../hooks/useLeads';

const STATUS_TABS = [
  { label: 'All',     value: undefined  },
  { label: 'New',     value: 'new'      },
  { label: 'Seen',    value: 'seen'     },
  { label: 'Replied', value: 'replied'  },
  { label: 'Won',     value: 'won'      },
  { label: 'Lost',    value: 'lost'     },
];

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
  const { leads, total, loading, loadingMore, hasMore, error, loadMore, updateLeadStatus } = useLeads(
    statusFilter ? { status: statusFilter } : {}
  );

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

        {/* Status filter tabs */}
        <div className="mb-6 overflow-x-auto -mx-4 px-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-max min-w-full sm:w-fit sm:min-w-0">
            {STATUS_TABS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => handleFilterChange(value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  statusFilter === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
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

        {/* Empty state */}
        {!loading && !error && leads.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-500 text-sm">
              No leads yet. Make sure your Chrome extension is installed and Facebook groups are configured.
            </p>
          </div>
        )}

        {/* Lead cards */}
        {!loading && leads.length > 0 && (
          <>
            <div className="space-y-4">
              {leads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onStatusChange={updateLeadStatus} />
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {loadingMore ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading…
                    </>
                  ) : (
                    'Load more leads'
                  )}
                </button>
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
