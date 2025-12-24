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
  const [settings, setSettings] = useState<SystemSettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch from publicviews collection for optimized cached data
      try {
        const response = await axiosPublic.get('/settings/public');
        
        console.log('[useSystemSettings] Fetched settings from public endpoint:', response.data);
        
        if (mountedRef.current && response.data) {
          setSettings(response.data);
          return;
        }
      } catch (publicErr: any) {
        // If /settings/public is not available (404), try fetching from /admin/settings as fallback
        // This handles cases where the server hasn't deployed the public endpoint yet
        if (publicErr?.response?.status === 404) {
          console.warn('[useSystemSettings] Public endpoint not found (404), attempting fallback to admin endpoint');
          try {
            const fallbackResponse = await axiosPublic.get('/admin/settings');
            console.log('[useSystemSettings] Fetched settings from admin endpoint:', fallbackResponse.data);
            
            if (mountedRef.current && fallbackResponse.data) {
              // Sanitize to only public fields
              const publicData = {
                siteName: fallbackResponse.data.siteName || '',
                barangayName: fallbackResponse.data.barangayName || '',
                barangayAddress: fallbackResponse.data.barangayAddress || '',
                contactEmail: fallbackResponse.data.contactEmail || '',
                contactPhone: fallbackResponse.data.contactPhone || '',
                systemNotice: fallbackResponse.data.systemNotice || ''
              };
              setSettings(publicData);
              return;
            }
          } catch (fallbackErr) {
            console.warn('[useSystemSettings] Fallback endpoint also failed', fallbackErr);
          }
        } else {
          // For other errors, log and continue to use defaults
          const errorMsg = publicErr instanceof Error ? publicErr.message : 'Failed to fetch settings';
          console.error('[useSystemSettings] Error fetching settings:', errorMsg, publicErr);
        }
      }
      
      // If both endpoints fail or data is missing, set defaults
      if (mountedRef.current) {
        console.log('[useSystemSettings] Using default settings');
        setSettings({
          siteName: 'Barangay Information System',
          barangayName: '',
          barangayAddress: '',
          contactEmail: '',
          contactPhone: '',
          systemNotice: ''
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch settings';
      console.error('[useSystemSettings] Unexpected error:', errorMsg, err);
      
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
