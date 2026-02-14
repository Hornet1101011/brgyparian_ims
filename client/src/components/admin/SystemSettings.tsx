// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SendGridSettings from './SendGridSettings';
import { adminAPI, axiosInstance, API_URL } from '../../services/api';
import { UploadOutlined, UsergroupAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { Upload as AntdUpload, message as antdMessage } from 'antd';
import AppAvatar from '../AppAvatar';
import OfficialPhotoImage from '../OfficialPhotoImage';
import OfficialsReorder from './OfficialsReorder';
// framer-motion removed to avoid dependency conflicts; use CSS transitions for preview
import defaultSystemSettings from '../../config/defaultSystemSettings';
import getOfficialPhotoSrc from '../../utils/officials';

// Create type aliases for React types that work in React 18
type FC<P> = React.FunctionComponent<P>;
type ComponentProps<T> = T extends React.ComponentType<infer P> ? P : never;

interface SystemSettingsData {
  siteName: string;
  barangayName: string;
  barangayAddress: string;
  contactEmail: string;
  contactPhone: string;
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  requireEmailVerification: boolean;
  enableVerifications?: boolean;
  maxDocumentRequests: number;
  documentProcessingDays: number;
  // new rate-limiting settings
  allowMultipleAccountsPerIP?: boolean;
  maxAccountsPerIP?: number;
  systemNotice: string;
}

interface Official {
  _id?: string;
  name: string;
  title: string;
  term: string;
  photoUrl?: string;
  photoPath?: string;
  previewUrl?: string; // client-side temporary preview for selected file
}

/**
 * Utility functions for dirty state detection with deep comparison
 */
const DirtyStateUtils = {
  /**
   * Create a normalized copy of settings, removing sensitive fields
   */
  normalizeSettings(settings: any): any {
    if (!settings) return null;
    
    const normalized = JSON.parse(JSON.stringify(settings));
    
    // Remove ignored fields recursively
    const removeIgnoredFields = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(removeIgnoredFields);
      }
      
      const cleaned: any = {};
      for (const key in obj) {
        // Skip API key from comparison
        if (key === 'apiKey') continue;
        if (obj[key] && typeof obj[key] === 'object') {
          cleaned[key] = removeIgnoredFields(obj[key]);
        } else if (obj[key] !== undefined && obj[key] !== null) {
          cleaned[key] = obj[key];
        }
      }
      return cleaned;
    };
    
    return removeIgnoredFields(normalized);
  },

  /**
   * Deep compare two settings objects
   */
  deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return obj1 === obj2;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return obj1 === obj2;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }
    
    return true;
  },

  /**
   * Check if general settings are dirty
   */
  isGeneralDirty(original: any, current: any): boolean {
    const generalFields = [
      'siteName',
      'barangayName',
      'barangayAddress',
      'contactEmail',
      'contactPhone',
      'systemNotice',
      'maintenanceMode',
      'allowNewRegistrations',
      'requireEmailVerification',
      'enableVerifications',
      'maxDocumentRequests',
      'documentProcessingDays',
      'allowMultipleAccountsPerIP',
      'maxAccountsPerIP',
    ];

    for (const field of generalFields) {
      if (original?.[field] !== current?.[field]) {
        return true;
      }
    }
    return false;
  },

  /**
   * Check if email settings are dirty (excluding passwords/timestamps)
   */
  isEmailDirty(original: any, current: any): boolean {
    const normalized1 = this.normalizeSettings(original);
    const normalized2 = this.normalizeSettings(current);
    return !this.deepEqual(normalized1, normalized2);
  },

  /**
   * Check if officials are dirty
   */
  isOfficialsDirty(original: any[], current: any[]): boolean {
    if (!original && !current) return false;
    if (!original || !current) return true;
    if (original.length !== current.length) return true;

    // Normalize officials by removing temporary IDs and fields
    const normalizeOfficial = (o: any) => {
      const normalized = { ...o };
      delete normalized._id;
      delete normalized.__v;
      delete normalized.photoUrl;
      return normalized;
    };

    for (let i = 0; i < original.length; i++) {
      if (!this.deepEqual(
        normalizeOfficial(original[i]),
        normalizeOfficial(current[i])
      )) {
        return true;
      }
    }
    return false;
  },
};

// Custom TextField wrapper with proper label spacing
const StyledTextField: FC<ComponentProps<typeof TextField>> = (props) => (
  <TextField
    {...props}
    variant="outlined"
    size="small"
    InputLabelProps={{
      shrink: true,
      sx: { 
        fontSize: 13,
        fontWeight: 600,
        color: '#64748b',
        transform: 'translate(12px, -10px) scale(0.75)',
        '&.MuiInputBase-input': {
          padding: '12px 14px'
        }
      }
    }}
    sx={{
      '& .MuiOutlinedInput-root': {
        borderRadius: 1,
        minHeight: 44
      },
      '& .MuiOutlinedInput-input': {
        padding: '12px 14px',
        fontSize: 14,
        color: '#0f172a'
      },
      ...props.sx
    }}
  />
);

const SystemSettings: FC = () => {
  const [settings, setSettings] = useState<SystemSettingsData>(() => ({ ...defaultSystemSettings } as SystemSettingsData));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [, setSuccess] = useState(false);
  const [, setError] = useState<string | null>(null);
  
  // SendGrid email configuration state
  interface SendGridConfig {
    enabled: boolean;
    apiKey: string;
    fromEmail: string;
    fromName: string;
  }
  
  const [sendgridConfig, setSendgridConfig] = useState<SendGridConfig>({
    enabled: false,
    apiKey: '',
    fromEmail: '',
    fromName: 'Barangay System',
  });
  const [hasBackendApiKey, setHasBackendApiKey] = useState(false);
  
  // Officials state
  const [officials, setOfficials] = useState<Official[]>([]);
  const [officialsLoading, setOfficialsLoading] = useState(false);
  const [savingOfficials, setSavingOfficials] = useState(false);
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);
  const autoSaveTimers = useRef<Record<string, number>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const prevOfficialsCountRef = useRef(0);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const highlightTimeouts = useRef<Record<string, number>>({});
  const originalSettingsRef = useRef<SystemSettingsData | null>(null);
  const originalSendgridConfigRef = useRef<SendGridConfig | null>(null);
  const originalOfficialsRef = useRef<Official[]>([]);
  
  // Initialization guard to prevent duplicate loading
  const initializationCompleteRef = useRef(false);

  // Section-level dirty state tracking
  const [dirtyGeneral, setDirtyGeneral] = useState(false);
  const [dirtySendGrid, setDirtySendGrid] = useState(false);
  const [dirtyOfficials, setDirtyOfficials] = useState(false);

  // Settings lock state
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [hasLock, setHasLock] = useState(false);
  const lockRefreshIntervalRef = useRef<number | null>(null);
  const lockTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Guard against re-initialization: only run once on mount
    if (initializationCompleteRef.current) return;
    
    const ac = new AbortController();
    const loadData = async () => {
      try {
        // Load settings and email config
        await fetchSettings(ac.signal);
        
        // Mark initialization as complete
        initializationCompleteRef.current = true;
      } catch (err) {
        if ((err as any)?.name !== 'CanceledError' && (err as any)?.name !== 'AbortError') {
          console.error('Error during initial load:', err);
        }
      }
      
      // Acquire lock on component mount
      await acquireLock();
    };
    
    loadData();
    
    // capture a snapshot of preview URLs now so cleanup uses a stable reference
    const currentPreviewUrls = previewUrlsRef.current;
    return () => {
      // Release lock on component unmount
      releaseLock();
      // cancel pending fetch
      try { ac.abort(); } catch (e) {}
      // revoke any created object URLs captured at effect execution time
      try {
        Object.values(currentPreviewUrls).forEach((u: any) => {
          try { URL.revokeObjectURL(u); } catch (e) {}
        });
      } catch (e) {}
      // Stop lock refresh
      stopLockRefresh();
    };
  }, []);

  // Scroll preview container to the right when items are appended
  useEffect(() => {
    try {
      const container = previewContainerRef.current;
      if (!container) return;
      if (officials.length > prevOfficialsCountRef.current) {
        container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
      }
      prevOfficialsCountRef.current = officials.length;
    } catch (e) {}
  }, [officials.length]);

  // Detect newly added temp officials and highlight them briefly
  useEffect(() => {
    try {
      const newTemp = officials.filter(o => o._id && o._id.toString().startsWith('new-')).map(o => o._id as string);
      // highlight any temp ids that are new and not already highlighted
      newTemp.forEach(id => {
        if (!highlightedIds.includes(id)) {
          setHighlightedIds(prev => [...prev, id]);
          // remove highlight after 2.5s
          const t = window.setTimeout(() => {
            setHighlightedIds(prev => prev.filter(x => x !== id));
            delete highlightTimeouts.current[id];
          }, 2500);
          highlightTimeouts.current[id] = t;
        }
      });
    } catch (e) {}
    // cleanup when unmounting
    return () => {
      Object.values(highlightTimeouts.current).forEach((tid: any) => { try { clearTimeout(tid); } catch (e) {} });
      highlightTimeouts.current = {};
    };
  }, [officials, highlightedIds]);

  // Accept an optional AbortSignal so caller can cancel when unmounting
  const fetchSettings = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      // primary attempt using adminAPI (uses axiosInstance and auth interceptors)
      let sys: SystemSettingsData | null = null;
      try {
        sys = await adminAPI.getSystemSettings();
      } catch (err) {
        // fallback: call backend directly at configured API_URL (avoid client origin)
        try {
          const res = await axiosInstance.get(`/admin/settings`, { signal } as any);
          if (res?.data) sys = res.data;
        } catch (err2) {
          console.warn('Failed to load system settings via adminAPI and axiosInstance fallback', err, err2);
        }
      }
      if (sys) {
        // Normalize backend response: map 'maintenanceMode' to internal 'maintenanceMode'
        // (Some old data might still use the misspelled 'maintainanceMode')
        (sys as any).maintenanceMode =
          (sys as any).maintenanceMode ??
          (sys as any).maintainanceMode ??
          false;

        setSettings(sys);
        originalSettingsRef.current = sys;
        
        // Load SendGrid configuration
        if ((sys as any).email?.sendgrid) {
          const sendgridData = (sys as any).email.sendgrid;
          
          // Check if backend has saved API key
          const hasBackendKey = !!(sendgridData.apiKey && sendgridData.apiKey.trim().length > 0);
          
          const sendgridConfig: SendGridConfig = {
            enabled: sendgridData.enabled !== false,
            apiKey: '', // Never populate from backend for security
            fromEmail: sendgridData.fromEmail || '',
            fromName: sendgridData.fromName || 'Barangay System',
          };

          setSendgridConfig(sendgridConfig);
          originalSendgridConfigRef.current = JSON.parse(JSON.stringify(sendgridConfig));
          setHasBackendApiKey(hasBackendKey);
          
          console.log('[SystemSettings] SendGrid email config loaded:', {
            enabled: sendgridConfig.enabled,
            fromName: sendgridConfig.fromName,
            fromEmail: sendgridConfig.fromEmail,
            hasBackendApiKey: hasBackendKey
          });
        }
      }

      // officials: try adminAPI then axiosInstance fallback
      setOfficialsLoading(true);
      try {
        const offs = await adminAPI.getOfficials();
        if (Array.isArray(offs)) {
          setOfficials(offs);
          originalOfficialsRef.current = JSON.parse(JSON.stringify(offs));
        } else {
          const r = await axiosInstance.get(`/admin/officials`, { signal } as any);
          if (r?.data) {
            setOfficials(r.data);
            originalOfficialsRef.current = JSON.parse(JSON.stringify(r.data));
          }
        }
      } catch (err) {
        try {
          const r = await axiosInstance.get(`/admin/officials`, { signal } as any);
          if (r?.data) {
            setOfficials(r.data);
            originalOfficialsRef.current = JSON.parse(JSON.stringify(r.data));
          }
        } catch (err2) {
          console.warn('Failed to load officials via adminAPI and axiosInstance fallback', err, err2);
        }
      } finally {
        setOfficialsLoading(false);
      }
    } catch (err) {
      if ((err as any)?.name === 'CanceledError' || (err as any)?.name === 'AbortError') {
        // fetch canceled, ignore
        return;
      }
      console.error('Unexpected error in fetchSettings', err);
      antdMessage.error('Unexpected error while loading settings');
    } finally {
      setLoading(false);
    }
  };

  // Fetch email health status
  const fetchEmailHealthStatus = async () => {
    try {
      const response = await axiosInstance.get('/settings/email/health');
      if (response.data) {
        console.log('[SystemSettings] Email health status:', response.data);
      }
    } catch (err) {
      console.error('Failed to fetch email health status:', err);
    }
  };

  // Acquire lock on settings
  const acquireLock = async () => {
    try {
      const response = await axiosInstance.post('/settings/lock');
      if (response.data.success) {
        setHasLock(true);
        setLockStatus(response.data);
        // Start periodic lock refresh to keep it alive
        startLockRefresh();
        console.log('[SystemSettings] Lock acquired successfully');
        return true;
      } else {
        // Lock already held by someone else
        setLockStatus(response.data);
        antdMessage.warning(response.data.message || 'Settings are locked by another admin');
        console.log('[SystemSettings] Failed to acquire lock:', response.data.message);
        return false;
      }
    } catch (err: any) {
      console.error('[SystemSettings] Error acquiring lock:', err);
      antdMessage.error('Error acquiring settings lock');
      return false;
    }
  };

  // Release lock on settings
  const releaseLock = async () => {
    try {
      // Clear lock refresh interval
      if (lockRefreshIntervalRef.current) {
        clearInterval(lockRefreshIntervalRef.current);
        lockRefreshIntervalRef.current = null;
      }
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = null;
      }

      const response = await axiosInstance.delete('/settings/lock');
      if (response.data.success) {
        setHasLock(false);
        setLockStatus(null);
        console.log('[SystemSettings] Lock released successfully');
      }
    } catch (err: any) {
      console.error('[SystemSettings] Error releasing lock:', err);
    }
  };

  // Get current lock status
  const checkLockStatus = async () => {
    try {
      const response = await axiosInstance.get('/settings/lock');
      setLockStatus(response.data);
      
      if (response.data.isLocked && !response.data.canEdit) {
        // Lock is held by someone else
        setHasLock(false);
      } else if (response.data.isLocked && response.data.canEdit) {
        // We still have the lock
        setHasLock(true);
      } else {
        // No lock
        setHasLock(false);
      }
    } catch (err: any) {
      console.error('[SystemSettings] Error checking lock status:', err);
    }
  };

  // Start periodic lock refresh
  const startLockRefresh = () => {
    // Refresh lock every 30 seconds to keep it alive
    if (lockRefreshIntervalRef.current) {
      clearInterval(lockRefreshIntervalRef.current);
    }
    lockRefreshIntervalRef.current = window.setInterval(() => {
      checkLockStatus();
    }, 30000); // 30 seconds
  };

  // Stop lock refresh
  const stopLockRefresh = () => {
    if (lockRefreshIntervalRef.current) {
      clearInterval(lockRefreshIntervalRef.current);
      lockRefreshIntervalRef.current = null;
    }
    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
  };

  // Save system settings (used by Save Changes button)
  // Internal save implementation (performs actual API call)
  const performSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Build payload with general settings and SendGrid email configuration
      const payload: any = {
        siteName: settings.siteName,
        barangayName: settings.barangayName,
        barangayAddress: settings.barangayAddress,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        maintenanceMode: settings.maintenanceMode,
        allowNewRegistrations: settings.allowNewRegistrations,
        requireEmailVerification: settings.requireEmailVerification,
        enableVerifications: settings.enableVerifications,
        maxDocumentRequests: settings.maxDocumentRequests,
        documentProcessingDays: settings.documentProcessingDays,
        allowMultipleAccountsPerIP: settings.allowMultipleAccountsPerIP,
        maxAccountsPerIP: settings.maxAccountsPerIP,
        systemNotice: settings.systemNotice,
      };

      // Add unified SendGrid email configuration under 'email' field
      payload.email = {
        enabled: sendgridConfig.enabled,
        provider: 'sendgrid',
        sendgrid: {
          apiKey: sendgridConfig.apiKey,
          fromEmail: sendgridConfig.fromEmail,
          fromName: sendgridConfig.fromName,
        }
      };

      console.log('[Settings Save] Payload:', JSON.stringify(payload, null, 2));

      await adminAPI.updateSystemSettings(payload);
      
      // optimistic: update original copy and clear dirty flags
      originalSettingsRef.current = JSON.parse(JSON.stringify(settings));
      originalSendgridConfigRef.current = JSON.parse(JSON.stringify(sendgridConfig));
      
      // Reset dirty states
      setDirtyGeneral(false);
      setDirtySendGrid(false);
      
      setSuccess(true);
      
      antdMessage.success('Settings saved');
    } catch (err) {
      console.error('Failed to save settings', err);
      setError('Failed to save settings');
      antdMessage.error('Failed to save settings');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSuccess(false), 2000);
      // Keep lock after save, just refresh it
      if (hasLock) {
        stopLockRefresh();
        startLockRefresh();
      }
    }
  };

  // Public handler invoked by Save button. If the admin is disabling verifications
  // (enableVerifications toggled from true -> false), show a confirmation dialog
  // to prevent accidental destructive cleanup on the server.
  const handleSave = async () => {
    try {
      // Determine if we are flipping enableVerifications from true -> false
      const prev = originalSettingsRef.current;
      const prevEnabled = prev ? Boolean((prev as any).enableVerifications) : true;
      const nowEnabled = Boolean((settings as any).enableVerifications);
      if (prevEnabled && nowEnabled === false) {
        // Show confirmation dialog
        setConfirmDisableOpen(true);
        return;
      }
      // Otherwise proceed directly
      await performSave();
    } catch (e) {
      console.error('handleSave error', e);
    }
  };

  const confirmAndSave = async () => {
    setConfirmDisableOpen(false);
    await performSave();
  };

  // Manual save for officials (fallback)
  const handleManualSaveOfficials = async () => {
    if (!officials || officials.length === 0) return;
    setSavingOfficials(true);
    setManualSaveError(null);
    try {
      const updatedOfficials: Official[] = [];
      for (const off of officials) {
        if (!off._id || off._id.toString().startsWith('new-')) {
          // create
          const created = await adminAPI.createOfficial({ name: off.name, title: off.title, term: off.term });
          updatedOfficials.push(created);
        } else {
          try {
            const updated = await adminAPI.updateOfficial(off._id!, { name: off.name, title: off.title, term: off.term });
            updatedOfficials.push(updated);
          } catch (e) {
            // if update failed, keep local copy so user can retry
            updatedOfficials.push(off);
          }
        }
      }
      // replace list with refreshed items from server if possible
      try {
        const refreshed = await adminAPI.getOfficials();
        if (Array.isArray(refreshed)) {
          setOfficials(refreshed);
          originalOfficialsRef.current = JSON.parse(JSON.stringify(refreshed));
        } else {
          setOfficials(updatedOfficials);
          originalOfficialsRef.current = JSON.parse(JSON.stringify(updatedOfficials));
        }
      } catch (e) {
        setOfficials(updatedOfficials);
        originalOfficialsRef.current = JSON.parse(JSON.stringify(updatedOfficials));
      }
      
      // Reset dirty state for officials section
      setDirtyOfficials(false);
      antdMessage.success('Officials saved');
    } catch (err) {
      console.error('Manual save officials failed', err);
      setManualSaveError('Manual save failed');
      antdMessage.error('Manual save failed');
    } finally {
      setSavingOfficials(false);
    }
  }

  // Combined save used by floating action button: save system settings and officials together
  const saveAll = async () => {
    try {
      await handleSave();
    } catch (e) {
      // handleSave already logs and reports errors
    }
    try {
      await handleManualSaveOfficials();
    } catch (e) {
      // manual save already reports errors
    }
  }

  // Memoized callback for SendGrid configuration save
  const handleSendGridSave = useCallback(async (config: any) => {
    // Only update if initialization is complete
    if (!initializationCompleteRef.current) return;
    
    console.log('[SystemSettings] SendGrid config saved:', {
      enabled: config.enabled,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      hasApiKey: !!config.apiKey,
    });
    
    setSendgridConfig(config);
    setDirtySendGrid(true);
  }, []);

  // Track general settings dirty state
  // Only track changes AFTER initialization is complete to avoid false dirty state on mount
  useEffect(() => {
    try {
      // Don't update dirty state until initialization is complete
      if (!initializationCompleteRef.current) {
        return;
      }
      
      if (!originalSettingsRef.current) {
        setDirtyGeneral(false);
        return;
      }
      const isDirty = DirtyStateUtils.isGeneralDirty(originalSettingsRef.current, settings);
      setDirtyGeneral(isDirty);
    } catch (e) {
      console.error('Error checking general settings dirty state:', e);
      setDirtyGeneral(false);
    }
  }, [
    settings.siteName,
    settings.barangayName,
    settings.barangayAddress,
    settings.contactEmail,
    settings.contactPhone,
    settings.systemNotice,
    settings.maintenanceMode,
    settings.allowNewRegistrations,
    settings.requireEmailVerification,
    settings.enableVerifications,
    settings.maxDocumentRequests,
    settings.documentProcessingDays,
    settings.allowMultipleAccountsPerIP,
    settings.maxAccountsPerIP,
  ]);

  // Track email settings dirty state
  // Only track changes AFTER initialization is complete to avoid false dirty state on mount
  useEffect(() => {
    try {
      // Don't update dirty state until initialization is complete
      if (!initializationCompleteRef.current) {
        return;
      }
      
      if (!originalSendgridConfigRef.current) {
        setDirtySendGrid(false);
        return;
      }
      
      const isDirty = DirtyStateUtils.isEmailDirty(
        originalSendgridConfigRef.current,
        sendgridConfig
      );
      setDirtySendGrid(isDirty);
    } catch (e) {
      console.error('Error checking email settings dirty state:', e);
      setDirtySendGrid(false);
    }
  }, [sendgridConfig]);

  // Track officials dirty state
  // Only track changes AFTER initialization is complete to avoid false dirty state on mount
  useEffect(() => {
    try {
      // Don't update dirty state until initialization is complete
      if (!initializationCompleteRef.current) {
        return;
      }
      
      if (!originalOfficialsRef.current) {
        setDirtyOfficials(false);
        return;
      }
      const isDirty = DirtyStateUtils.isOfficialsDirty(originalOfficialsRef.current, officials);
      setDirtyOfficials(isDirty);
    } catch (e) {
      console.error('Error checking officials dirty state:', e);
      setDirtyOfficials(false);
    }
  }, [officials]);

  const handleDeleteOfficial = async (id?: string) => {
    if (!id) return;
    setSavingOfficials(true);
    try {
      await adminAPI.deleteOfficial(id);
      setOfficials(prev => prev.filter(p => p._id !== id));
      antdMessage.success('Official deleted');
    } catch (err) {
      console.error('Delete official failed', err);
      antdMessage.error('Failed to delete official');
    } finally {
      setSavingOfficials(false);
    }
  }

  return (
    <Box sx={{
      pt: 'calc(var(--app-header-height, 64px) + 24px)',
      px: { xs: 2, sm: 3, md: 4 },
      pb: 8,
      background: 'linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%)',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
          System Settings
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Manage barangay information, officials, and system configuration
        </Typography>
      </Box>

      {/* Lock Status Alert */}
      {lockStatus?.isLocked && !lockStatus?.canEdit && (
        <Alert 
          severity="warning" 
          sx={{ mb: 3 }}
          action={
            <Button 
              size="small" 
              onClick={() => releaseLock().then(() => checkLockStatus())}
            >
              Refresh
            </Button>
          }
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Settings Locked
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {lockStatus.lockOwner} is currently editing these settings.
              {lockStatus.minutesRemaining && ` The lock will auto-release in ${lockStatus.minutesRemaining} minute${lockStatus.minutesRemaining !== 1 ? 's' : ''}.`}
            </Typography>
          </Box>
        </Alert>
      )}

      {lockStatus?.hasLock && lockStatus?.lockExpired && (
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          onClose={() => setLockStatus(null)}
        >
          Your previous lock has expired. You may make changes now, but another admin may also be editing.
        </Alert>
      )}

      {/* Settings Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3, mb: 6 }}>
        {/* Left Column - Main Settings */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* Barangay Information Card */}
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #0891b2'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#0891b2', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                Barangay Information
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2 }}>
              This information is displayed on the login page to visitors
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <StyledTextField
                label="Site Name"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                fullWidth
                helperText="Name of your barangay information system"
              />
              <StyledTextField
                label="Barangay Name"
                value={settings.barangayName}
                onChange={(e) => setSettings({ ...settings, barangayName: e.target.value })}
                fullWidth
                helperText="Official name of your barangay"
              />
              <StyledTextField
                label="Barangay Address"
                value={settings.barangayAddress}
                onChange={(e) => setSettings({ ...settings, barangayAddress: e.target.value })}
                fullWidth
                multiline
                rows={2}
                helperText="Complete address of your barangay office"
              />
              <Alert severity="info" sx={{ mt: 1, borderRadius: 1 }}>
                <Typography variant="caption">
                  These settings are displayed in the <strong>Barangay Information</strong> card on the login page and are updated in real-time.
                </Typography>
              </Alert>
            </Box>
          </Paper>

          {/* Contact Information Card */}
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #06b6d4'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#06b6d4', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                Contact Information
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 2 }}>
              This information is displayed on the login page and may be used in notifications
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <StyledTextField
                label="Contact Email"
                type="email"
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                fullWidth
                helperText="Email address for public inquiries (must be valid for login page display)"
              />
              <StyledTextField
                label="Contact Phone"
                value={settings.contactPhone}
                onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                fullWidth
                helperText="Phone number for public inquiries (at least 7 digits required)"
              />
              <Alert severity="info" sx={{ mt: 1, borderRadius: 1 }}>
                <Typography variant="caption">
                  Valid contact information is automatically displayed as clickable links on the <strong>Contact Information</strong> card on the login page. Invalid formats are hidden.
                </Typography>
              </Alert>
            </Box>
          </Paper>

          {/* Email Settings Section - SendGrid Configuration */}
          <SendGridSettings
            config={sendgridConfig}
            onSave={handleSendGridSave}
            hasBackendApiKey={hasBackendApiKey}
          />

          {/* System Configuration Card */}
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #f59e0b'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#f59e0b', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                System Configuration
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.maintenanceMode ?? false}
                    onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                  />
                }
                label={<Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Maintenance Mode</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.allowNewRegistrations ?? false}
                    onChange={(e) => setSettings({ ...settings, allowNewRegistrations: e.target.checked })}
                  />
                }
                label={<Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Allow New Registrations</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.requireEmailVerification ?? false}
                    onChange={(e) => setSettings({ ...settings, requireEmailVerification: e.target.checked })}
                  />
                }
                label={<Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Require Email Verification</Typography>}
              />
              <Divider sx={{ my: 1 }} />
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={(settings as any).allowMultipleAccountsPerIP ?? false}
                      onChange={(e) => setSettings({ ...settings, allowMultipleAccountsPerIP: e.target.checked } as SystemSettingsData)}
                    />
                  }
                  label={<Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Allow Multiple Accounts per IP</Typography>}
                />
                {(settings as any).allowMultipleAccountsPerIP && (
                  <Box sx={{ ml: 4, mt: 1 }}>
                    <StyledTextField
                      label="Max Accounts per IP"
                      type="number"
                      value={(settings as any).maxAccountsPerIP ?? 1}
                      onChange={(e) => setSettings({ ...settings, maxAccountsPerIP: parseInt(e.target.value || '1') } as SystemSettingsData)}
                      inputProps={{ min: 1, max: 100 }}
                      sx={{ width: 140 }}
                    />
                  </Box>
                )}
              </Box>
              <Divider sx={{ my: 1 }} />
              <StyledTextField
                label="Max Document Requests per User"
                type="number"
                value={settings.maxDocumentRequests}
                onChange={(e) => setSettings({ ...settings, maxDocumentRequests: parseInt(e.target.value) })}
                inputProps={{ min: 1, max: 20 }}
              />
              <StyledTextField
                label="Document Processing Days"
                type="number"
                value={settings.documentProcessingDays}
                onChange={(e) => setSettings({ ...settings, documentProcessingDays: parseInt(e.target.value) })}
                inputProps={{ min: 1, max: 30 }}
                helperText="Standard processing time for document requests"
              />
            </Box>
          </Paper>

          {/* Verification Settings Card */}
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #ef4444'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#ef4444', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                Resident Verifications
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean((settings as any).enableVerifications ?? false)}
                    onChange={(e) => setSettings((prev) => ({ ...(prev as any), enableVerifications: e.target.checked } as any))}
                  />
                }
                label={<Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Enable Resident Verifications</Typography>}
              />
              {(settings as any).enableVerifications === false && (
                <Alert severity="warning" sx={{ borderRadius: 1 }}>
                  Disabling verifications will permanently delete pending requests and files.
                </Alert>
              )}
            </Box>
          </Paper>

          {/* System Notice Card */}
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #3b82f6'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#3b82f6', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                System Notice
              </Typography>
            </Box>
            <StyledTextField
              label="System-wide Notice"
              value={settings.systemNotice}
              onChange={(e) => setSettings({ ...settings, systemNotice: e.target.value })}
              fullWidth
              multiline
              rows={3}
              helperText="Displayed to all users on the dashboard"
            />
          </Paper>
        </Box>

        {/* Right Column - Officials Management */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Paper sx={{
            p: 3,
            borderRadius: 2,
            boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderTop: '4px solid #10b981'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box sx={{ width: 4, height: 28, background: '#10b981', borderRadius: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}>
                Barangay Officials
              </Typography>
            </Box>
            
            <OfficialsReorder
              officials={officials}
              onOfficialUpdate={setOfficials}
              onAddOfficial={() => {
                const temp: Official = { _id: `new-${Date.now()}`, name: '', title: '', term: '' };
                setOfficials(prev => [...prev, temp]);
              }}
              onDeleteOfficial={handleDeleteOfficial}
              officialsLoading={officialsLoading}
              savingOfficials={savingOfficials}
              autoSaveTimers={autoSaveTimers}
              onNameChange={(id, value) => {
                setOfficials(prev => prev.map(o => o._id === id ? { ...o, name: value } : o));
              }}
              onTitleChange={(id, value) => {
                setOfficials(prev => prev.map(o => o._id === id ? { ...o, title: value } : o));
              }}
              onTermChange={(id, value) => {
                setOfficials(prev => prev.map(o => o._id === id ? { ...o, term: value } : o));
              }}
              previewUrlsRef={previewUrlsRef}
              manualSaveError={manualSaveError}
            />
          </Paper>
        </Box>
      </Box>

      {/* Floating Save Button */}
      <Box sx={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 1300,
      }}>
        <Button
          variant="contained"
          onClick={() => saveAll()}
          disabled={saving || savingOfficials || (!dirtyGeneral && !dirtySendGrid && !dirtyOfficials)}
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            minWidth: 64,
            boxShadow: '0 8px 24px rgba(25,118,210,0.24)',
            background: 'linear-gradient(135deg, #0891b2 0%, #0ea5e9 100%)',
            color: '#fff',
            '&:hover': {
              boxShadow: '0 12px 32px rgba(25,118,210,0.32)',
            },
            '&:disabled': {
              background: '#cbd5e1',
            },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
            transition: 'all 0.3s ease'
          }}
          aria-label="Save Settings and Officials"
          title={!dirtyGeneral && !dirtySendGrid && !dirtyOfficials ? "No changes to save" : "Save changes"}
        >
          {(saving || savingOfficials) ? '...' : '✓'}
        </Button>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDisableOpen} onClose={() => setConfirmDisableOpen(false)} PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ fontWeight: 600, color: '#0f172a' }}>Disable Resident Verifications?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', mt: 2 }}>
            Disabling resident verifications will permanently delete all pending verification requests and their uploaded files on the server. This action cannot be undone. Are you sure?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisableOpen(false)} disabled={saving} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button onClick={() => confirmAndSave()} color="error" variant="contained" disabled={saving} sx={{ textTransform: 'none' }}>
            Yes, disable and save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SystemSettings;