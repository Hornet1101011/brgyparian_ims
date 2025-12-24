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
          console.warn('[useBarangayInfo] Endpoint not found (404), using default carousel items');
        } else {
          const errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch barangay info';
          console.error('[useBarangayInfo] Error fetching items:', errorMsg, fetchErr);
        }
      }

      // Fallback to default carousel items from config
      if (mountedRef.current) {
        console.log('[useBarangayInfo] Using default carousel items');
        setItems([
          {
            _id: 'site-name',
            label: 'System Name',
            value: 'Barangay Portal',
            icon: 'home',
            type: 'barangay-info'
          },
          {
            _id: 'barangay-name',
            label: 'Barangay Name',
            value: 'Barangay Uno',
            icon: 'environment',
            type: 'barangay-info'
          },
          {
            _id: 'barangay-address',
            label: 'Address',
            value: '123 Main St, City, Province',
            icon: 'map',
            type: 'barangay-info'
          }
        ]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch barangay info';
      console.error('[useBarangayInfo] Unexpected error:', errorMsg, err);

      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch barangay info'));
        // Use default carousel items as fallback
        setItems([
          {
            _id: 'site-name',
            label: 'System Name',
            value: 'Barangay Portal',
            icon: 'home',
            type: 'barangay-info'
          },
          {
            _id: 'barangay-name',
            label: 'Barangay Name',
            value: 'Barangay Uno',
            icon: 'environment',
            type: 'barangay-info'
          },
          {
            _id: 'barangay-address',
            label: 'Address',
            value: '123 Main St, City, Province',
            icon: 'map',
            type: 'barangay-info'
          }
        ]);
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
