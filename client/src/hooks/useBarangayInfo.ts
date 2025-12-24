import { useState, useEffect, useRef } from 'react';
import { axiosPublic } from '../services/api';

export interface BarangayInfoItem {
  _id: string;
  label: string;
  value: string;
  icon: string;
  type: 'barangay-info';
  isPlaceholder?: boolean;
}

export interface UseBarangayInfoResult {
  items: BarangayInfoItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch barangay information items from publicviews collection
 * Returns data formatted as carousel cards
 * Automatically refetches every 30 seconds
 */
export const useBarangayInfo = (autoRefresh: boolean = true): UseBarangayInfoResult => {
  const [items, setItems] = useState<BarangayInfoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);

      try {
        const response = await axiosPublic.get('/settings/public/barangay-info');
        console.log('[useBarangayInfo] Fetched items:', response.data);

        if (mountedRef.current && Array.isArray(response.data)) {
          setItems(response.data);
          return;
        }
      } catch (fetchErr: any) {
        if (fetchErr?.response?.status === 404) {
          console.warn('[useBarangayInfo] Endpoint not found (404), using defaults');
        } else {
          const errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch barangay info';
          console.error('[useBarangayInfo] Error fetching items:', errorMsg, fetchErr);
        }
      }

      // Fallback to default empty state
      if (mountedRef.current) {
        console.log('[useBarangayInfo] Using empty state');
        setItems([{
          _id: 'placeholder',
          label: 'Barangay Information',
          value: 'No barangay information configured',
          icon: 'info',
          type: 'barangay-info',
          isPlaceholder: true
        }]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch barangay info';
      console.error('[useBarangayInfo] Unexpected error:', errorMsg, err);

      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch barangay info'));
        // Use empty state as fallback
        setItems([{
          _id: 'placeholder',
          label: 'Barangay Information',
          value: 'Unable to load barangay information',
          icon: 'info',
          type: 'barangay-info',
          isPlaceholder: true
        }]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchItems();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          fetchItems();
        }
      }, 30000); // Refresh every 30 seconds
    }

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  return {
    items,
    loading,
    error,
    refetch: fetchItems
  };
};
