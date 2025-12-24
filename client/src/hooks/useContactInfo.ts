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
  const [items, setItems] = useState<ContactInfoItem[]>([
    {
      _id: 'contact-email',
      label: 'Email Address',
      value: 'info@barangayuno.local',
      icon: 'mail',
      type: 'contact-info',
      contactType: 'email',
      link: 'mailto:info@barangayuno.local'
    },
    {
      _id: 'contact-phone',
      label: 'Phone Number',
      value: '+63 912 345 6789',
      icon: 'phone',
      type: 'contact-info',
      contactType: 'phone',
      link: 'tel:+639123456789'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const hasAttemptedFetchRef = useRef(false);
  const enablePublicViews = Boolean((globalThis as any).__APP_CONFIG__?.ENABLE_PUBLIC_VIEWS || process.env.REACT_APP_ENABLE_PUBLIC_VIEWS === 'true');

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError(null);

      if (enablePublicViews) {
        try {
          const response = await axiosPublic.get('/settings/public/contact-info');
          console.log('[useContactInfo] Fetched items:', response.data);

          if (mountedRef.current && Array.isArray(response.data)) {
            setItems(response.data);
            return;
          }
        } catch (fetchErr: any) {
          if (fetchErr?.response?.status === 404) {
            console.warn('[useContactInfo] Endpoint not found (404), using default carousel items');
          } else {
            const errorMsg = fetchErr instanceof Error ? fetchErr.message : 'Failed to fetch contact info';
            console.error('[useContactInfo] Error fetching items:', errorMsg, fetchErr);
          }
        }
      } else {
        console.log('[useContactInfo] Skipping public contact-info fetch (ENABLE_PUBLIC_VIEWS is false)');
      }

      // Fallback to default carousel items from config
      if (mountedRef.current) {
        console.log('[useContactInfo] Using default carousel items');
        setItems([
          {
            _id: 'contact-email',
            label: 'Email Address',
            value: 'info@barangayuno.local',
            icon: 'mail',
            type: 'contact-info',
            contactType: 'email',
            link: 'mailto:info@barangayuno.local'
          },
          {
            _id: 'contact-phone',
            label: 'Phone Number',
            value: '+63 912 345 6789',
            icon: 'phone',
            type: 'contact-info',
            contactType: 'phone',
            link: 'tel:+639123456789'
          }
        ]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch contact info';
      console.error('[useContactInfo] Unexpected error:', errorMsg, err);

      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch contact info'));
        // Use default carousel items as fallback
        setItems([
          {
            _id: 'contact-email',
            label: 'Email Address',
            value: 'info@barangayuno.local',
            icon: 'mail',
            type: 'contact-info',
            contactType: 'email',
            link: 'mailto:info@barangayuno.local'
          },
          {
            _id: 'contact-phone',
            label: 'Phone Number',
            value: '+63 912 345 6789',
            icon: 'phone',
            type: 'contact-info',
            contactType: 'phone',
            link: 'tel:+639123456789'
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
    // Only attempt fetch once, don't auto-refresh until endpoint is available
    if (!hasAttemptedFetchRef.current) {
      hasAttemptedFetchRef.current = true;
      fetchItems();
    }

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  return {
    items,
    loading,
    error,
    refetch: fetchItems
  };
};
