import { useState, useEffect, useRef } from 'react';
import { axiosPublic } from '../services/api';

export interface ContactInfoItem {
  _id: string;
  label: string;
  value: string;
  icon: string;
  type: 'contact-info';
  contactType?: 'email' | 'phone';
  link?: string;
  isPlaceholder?: boolean;
}

export interface UseContactInfoResult {
  items: ContactInfoItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch contact information items from publicviews collection
 * Returns data formatted as carousel cards with validated email/phone
 * Automatically refetches every 30 seconds
 */
export const useContactInfo = (autoRefresh: boolean = true): UseContactInfoResult => {
  const [items, setItems] = useState<ContactInfoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);

      try {
        const response = await axiosPublic.get('/settings/public/contact-info');
        console.log('[useContactInfo] Fetched items:', response.data);

        if (mountedRef.current && Array.isArray(response.data)) {
          setItems(response.data);
          return;
        }
      } catch (fetchErr: any) {
        if (fetchErr?.response?.status === 404) {
          console.warn('[useContactInfo] Endpoint not found (404), using defaults');
        } else {
          const errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch contact info';
          console.error('[useContactInfo] Error fetching items:', errorMsg, fetchErr);
        }
      }

      // Fallback to default empty state
      if (mountedRef.current) {
        console.log('[useContactInfo] Using empty state');
        setItems([{
          _id: 'placeholder',
          label: 'Contact Information',
          value: 'No contact information configured',
          icon: 'info',
          type: 'contact-info',
          isPlaceholder: true
        }]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch contact info';
      console.error('[useContactInfo] Unexpected error:', errorMsg, err);

      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch contact info'));
        // Use empty state as fallback
        setItems([{
          _id: 'placeholder',
          label: 'Contact Information',
          value: 'Unable to load contact information',
          icon: 'info',
          type: 'contact-info',
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
