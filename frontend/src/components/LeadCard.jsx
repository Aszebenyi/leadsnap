import { useState } from 'react';

const STATUS_OPTIONS = ['new', 'seen', 'replied', 'won', 'lost'];

const STATUS_COLORS = {
  new:     'bg-blue-100 text-blue-700',
  seen:    'bg-gray-100 text-gray-600',
  replied: 'bg-yellow-100 text-yellow-700',
  won:     'bg-green-100 text-green-700',
  lost:    'bg-red-100 text-red-600',
};

const SCORE_COLOR = (score) => {
  if (score >= 8) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 5) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-500 bg-red-50 border-red-200';
};

function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LeadCard({ lead, onStatusChange }) {
  const [status, setStatus]       = useState(lead.status);
  const [updating, setUpdating]   = useState(false);
  const [copied, setCopied]       = useState(false);
  const [expanded, setExpanded]   = useState(false);

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    setUpdating(true);
    try {
      await onStatusChange(lead.id, newStatus);
      setStatus(newStatus);
    } finally {
      setUpdating(false);
    }
  }

  async function copyReply() {
    if (!lead.ai_reply) return;
    await navigator.clipboard.writeText(lead.ai_reply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isLong = lead.post_text?.length > 280;
  const displayText = isLong && !expanded
    ? `${lead.post_text.slice(0, 280)}…`
    : lead.post_text;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Score badge */}
          {lead.score != null && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SCORE_COLOR(lead.score)}`}>
              {lead.score}/10
            </span>
          )}
          {/* Group */}
          <span className="text-xs text-gray-500">
            {lead.group_name ?? 'Unknown group'}
          </span>
          {lead.author_name && (
            <span className="text-xs text-gray-400">· {lead.author_name}</span>
          )}
          <span className="text-xs text-gray-300">· {timeAgo(lead.created_at)}</span>
        </div>

        {/* Status selector */}
        <select
          value={status}
          onChange={handleStatusChange}
          disabled={updating}
          className={`text-xs font-medium px-2 py-1.5 rounded-md border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 shrink-0 ${STATUS_COLORS[status]}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Post text */}
      <p className="text-sm text-gray-800 leading-relaxed mb-1 whitespace-pre-wrap break-words">{displayText}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-xs text-orange-500 hover:text-orange-700 mb-3 py-1"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {/* Matched keywords */}
      {lead.matched_keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3 mt-2">
          {lead.matched_keywords.map((kw) => (
            <span key={kw} className="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* AI reply */}
      {lead.ai_reply && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500">Suggested reply</span>
            <button
              onClick={copyReply}
              className="text-xs text-orange-500 hover:text-orange-700 font-medium px-2 py-1"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{lead.ai_reply}</p>
        </div>
      )}

      {/* Footer links */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        {lead.post_url && (
          <a
            href={lead.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-orange-500 hover:text-orange-700 py-1"
          >
            View post →
          </a>
        )}
        {lead.score != null && lead.score >= 8 && (
          <span className="text-xs text-orange-500 font-medium">🔥 High intent</span>
        )}
      </div>
    </div>
  );
}
