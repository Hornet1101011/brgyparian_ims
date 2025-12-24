import { useState, useEffect, useRef } from 'react';
import { axiosPublic } from '../services/api';

export interface SystemSettingsPublic {
  siteName?: string;
  barangayName?: string;
  barangayAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
  systemNotice?: string;
}

export interface UseSystemSettingsResult {
  settings: SystemSettingsPublic | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook to fetch and manage public system settings
 * Used throughout the app to display barangay info, contact details, etc.
 * Automatically refetches every 30 seconds to pick up admin changes
 */
export const useSystemSettings = (autoRefresh: boolean = true): UseSystemSettingsResult => {
  const [settings, setSettings] = useState<SystemSettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axiosPublic.get('/settings/public');
      
      if (mountedRef.current && response.data) {
        setSettings(response.data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch settings'));
        // On error, set a minimal default structure so UI doesn't break
        setSettings({
          siteName: 'Barangay Information System',
          barangayName: '',
          barangayAddress: '',
          contactEmail: '',
          contactPhone: '',
          systemNotice: ''
        });
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchSettings();

    // Set up auto-refresh if enabled
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          fetchSettings();
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
    settings,
    loading,
    error,
    refetch: fetchSettings
  };
};
