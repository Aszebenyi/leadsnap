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

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState(undefined);
  const { leads, total, loading, error, updateLeadStatus } = useLeads(
    statusFilter ? { status: statusFilter } : {}
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} total</p>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {STATUS_TABS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && (
          <div className="text-center py-20 text-gray-400 text-sm">Loading leads…</div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {!loading && !error && leads.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-500 text-sm">No leads yet. Make sure your Chrome extension is installed and Facebook groups are configured.</p>
          </div>
        )}

        {!loading && leads.length > 0 && (
          <div className="space-y-4">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onStatusChange={updateLeadStatus} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
