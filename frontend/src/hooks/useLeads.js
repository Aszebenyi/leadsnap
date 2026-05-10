import { useState, useEffect, useCallback, useRef } from 'react';
import { getLeads, updateLeadStatus as apiUpdateLeadStatus } from '../lib/api';

const PAGE_SIZE = 20;

export function useLeads(filters = {}) {
  const [leads, setLeads]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);   // initial page load
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages
  const [error, setError]           = useState(null);
  const [offset, setOffset]         = useState(0);
  const [hasMore, setHasMore]       = useState(false);

  // Serialize filters so useEffect can compare them
  const filtersKey = JSON.stringify(filters);

  // Keep a ref so loadMore can access the current offset without stale closure
  const offsetRef = useRef(0);

  // ── Initial load (or filter change) ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchFirstPage() {
      setLoading(true);
      setError(null);
      setLeads([]);
      setOffset(0);
      offsetRef.current = 0;

      try {
        const data = await getLeads({ ...filters, limit: PAGE_SIZE, offset: 0 });
        if (cancelled) return;
        const fetched = data.leads ?? [];
        setLeads(fetched);
        setTotal(data.total ?? 0);
        setHasMore(fetched.length === PAGE_SIZE && fetched.length < (data.total ?? 0));
        setOffset(fetched.length);
        offsetRef.current = fetched.length;
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFirstPage();
    return () => { cancelled = true; };
  }, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more ─────────────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getLeads({ ...filters, limit: PAGE_SIZE, offset: offsetRef.current });
      const fetched = data.leads ?? [];
      setLeads((prev) => [...prev, ...fetched]);
      setTotal(data.total ?? 0);
      const newOffset = offsetRef.current + fetched.length;
      setOffset(newOffset);
      offsetRef.current = newOffset;
      setHasMore(fetched.length === PAGE_SIZE && newOffset < (data.total ?? 0));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [filtersKey, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Optimistic status update ──────────────────────────────────────────────────

  const updateLeadStatus = useCallback(async (id, status) => {
    const updated = await apiUpdateLeadStatus(id, status);
    setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  return { leads, total, loading, loadingMore, hasMore, error, loadMore, updateLeadStatus };
}
