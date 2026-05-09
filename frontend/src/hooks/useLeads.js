import { useState, useEffect, useCallback } from 'react';
import { getLeads, updateLeadStatus as apiUpdateLeadStatus } from '../lib/api';

export function useLeads(filters = {}) {
  const [leads, setLeads]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeads(filters);
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const updateLeadStatus = useCallback(async (id, status) => {
    const updated = await apiUpdateLeadStatus(id, status);
    setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    return updated;
  }, []);

  return { leads, total, loading, error, refetch: fetchLeads, updateLeadStatus };
}
