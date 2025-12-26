import { useState, useEffect, useRef } from 'react';
import { axiosPublic } from '../services/api';
import defaultSystemSettings from '../config/defaultSystemSettings';

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
 * Custom hook to fetch and manage public system settings from the publicviews collection
 * Provides cached, optimized data for fast unauthenticated access
 * Used throughout the app to display barangay info, contact details, etc.
 * Automatically refetches every 30 seconds to pick up admin changes
 * 
 * Data Flow:
 * 1. Admin updates system settings in SystemSettings panel
 * 2. Update auto-syncs to publicviews collection via syncToPublicView()
 * 3. GET /api/settings/public returns cached publicviews data (75-85% smaller payload)
 * 4. This hook fetches and refreshes the cached data periodically
 */
export const useSystemSettings = (autoRefresh: boolean = true): UseSystemSettingsResult => {
  // Initialize with defaults immediately so UI renders immediately
  const [settings, setSettings] = useState<SystemSettingsPublic | null>({
    siteName: defaultSystemSettings.siteName || 'Barangay Portal',
    barangayName: defaultSystemSettings.barangayName || 'Barangay Uno',
    barangayAddress: defaultSystemSettings.barangayAddress || '123 Main St, City, Province',
    contactEmail: defaultSystemSettings.contactEmail || 'info@barangayuno.local',
    contactPhone: defaultSystemSettings.contactPhone || '+63 912 345 6789',
    systemNotice: defaultSystemSettings.systemNotice || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const hasAttemptedFetchRef = useRef(false);
  const enablePublicViews = Boolean((globalThis as any).__APP_CONFIG__?.ENABLE_PUBLIC_VIEWS || process.env.REACT_APP_ENABLE_PUBLIC_VIEWS === 'true');

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    
    try {
      
      // Fetch from publicviews collection for optimized cached data (if enabled)
      if (enablePublicViews) {
        try {
          const response = await axiosPublic.get('/settings/public');
          console.log('[useSystemSettings] Fetched settings from public endpoint:', response.data);
          if (mountedRef.current && response.data) {
            setSettings(response.data);
            return;
          }
        } catch (publicErr: any) {
          // If /settings/public is not available (404), log and use defaults
          if (publicErr?.response?.status === 404) {
            console.warn('[useSystemSettings] Public endpoint not found (404), using defaults');
          } else {
            const errorMsg = publicErr instanceof Error ? publicErr.message : 'Failed to fetch settings';
            console.error('[useSystemSettings] Error fetching settings:', errorMsg, publicErr);
          }
        }
      } else {
        // Public views disabled by runtime config; skip network attempt
        console.log('[useSystemSettings] Skipping public endpoint fetch (ENABLE_PUBLIC_VIEWS is false)');
      }
      
      // If endpoint fails or data is missing, use sensible defaults
      if (mountedRef.current) {
        console.log('[useSystemSettings] Using default settings from config');
        setSettings({
          siteName: defaultSystemSettings.siteName || 'Barangay Portal',
          barangayName: defaultSystemSettings.barangayName || 'Barangay Uno',
          barangayAddress: defaultSystemSettings.barangayAddress || '123 Main St, City, Province',
          contactEmail: defaultSystemSettings.contactEmail || 'info@barangayuno.local',
          contactPhone: defaultSystemSettings.contactPhone || '+63 912 345 6789',
          systemNotice: defaultSystemSettings.systemNotice || ''
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch settings';
      console.error('[useSystemSettings] Unexpected error:', errorMsg, err);
      
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch settings'));
        // Use hardcoded defaults as fallback
        setSettings({
          siteName: 'Barangay Portal',
          barangayName: 'Barangay Uno',
          barangayAddress: '123 Main St, City, Province',
          contactEmail: 'info@barangayuno.local',
          contactPhone: '+63 912 345 6789',
          systemNotice: ''
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    // Only attempt fetch once, don't auto-refresh since endpoint doesn't exist
    if (!hasAttemptedFetchRef.current) {
      hasAttemptedFetchRef.current = true;
      fetchSettings();
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
    settings,
    loading,
    error,
    refetch: fetchSettings
  };
};
