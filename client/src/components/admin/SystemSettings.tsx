// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEmailSettings, defaultEmailState, type EmailState } from '../../hooks/useEmailSettings';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@mui/material';
import TestEmailModal from '../TestEmailModal';
import GmailSettings from './GmailSettings';
import EmailSettings from './EmailSettings';
import CustomSmtpSettings from './CustomSmtpSettings';
import EmailProviderStatus from './EmailProviderStatus';
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

/**
 * Utility functions for dirty state detection with deep comparison
 */
const DirtyStateUtils = {
  /**
   * Fields to ignore when comparing settings (passwords, timestamps)
   */
  IGNORED_FIELDS: [
    'gmailAppPassword',
    'password',
    'encryptedPassword',
    'appPassword',
    'sendgridApiKey',
    'awsSecretAccessKey',
    'awsAccessKeyId',
    'updatedAt',
    'createdAt',
    'testEmailSent',
    'lastHealthCheckAt',
  ],

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
        if (this.IGNORED_FIELDS.includes(key)) continue;
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
      'maintainanceMode',
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

interface EmailSettings {
  enabled: boolean;
  enablePasswordResetEmails: boolean;
  enableOtpEmails: boolean;
  enableDocumentNotificationEmails: boolean;
  enableAnnouncementEmails: boolean;
  enableAnnouncementBcc: boolean;
  recipientEmailsPerBatch: number;
  retryFailedEmails: boolean;
  retryAttempts: number;
  retryDelayMinutes: number;
  dryRunMode?: boolean;
}

interface SystemSettingsData {
  siteName: string;
  barangayName: string;
  barangayAddress: string;
  contactEmail: string;
  contactPhone: string;
  maintainanceMode: boolean;
  allowNewRegistrations: boolean;
  requireEmailVerification: boolean;
  enableVerifications?: boolean;
  maxDocumentRequests: number;
  documentProcessingDays: number;
  // new rate-limiting settings
  allowMultipleAccountsPerIP?: boolean;
  maxAccountsPerIP?: number;
  systemNotice: string;
  smtp?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
  };
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

const SystemSettings: FC = () => {
  const [settings, setSettings] = useState<SystemSettingsData>(() => ({ ...defaultSystemSettings } as SystemSettingsData));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [, setSuccess] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  
  // Unified email settings using custom hook
  // Consolidates emailConfig, passwordModified, passwordDirty, smtpPasswords, backendHasPassword into single state
  // with proper handling of provider-specific fields and password dirty tracking
  const {
    emailState,
    setEmailState,
    updateField,
    updateFields,
    togglePasswordVisibility,
    markPasswordDirty,
    setBackendHasPassword: setEmailBackendHasPassword,
    resetPasswordStates,
    resetAllPasswordStates,
    getPassword,
    getPasswords,
    clearNonProviderFields,
    createCleanProviderConfig,
  } = useEmailSettings(defaultEmailState);
  
  // Health check status state
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [loadingHealthStatus, setLoadingHealthStatus] = useState(false);
  // Officials state
  const [officials, setOfficials] = useState<Official[]>([]);
  const [officialsLoading, setOfficialsLoading] = useState(false);
  const [savingOfficials, setSavingOfficials] = useState(false);
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);
  const autoSaveTimers = useRef<Record<string, number>>({});
  // officialSaveStatus state removed (not referenced)
  const previewUrlsRef = useRef<Record<string, string>>({});
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const prevOfficialsCountRef = useRef(0);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const highlightTimeouts = useRef<Record<string, number>>({});
  const originalSettingsRef = useRef<SystemSettingsData | null>(null);
  const originalEmailConfigRef = useRef<EmailState | null>(null);
  const originalOfficialsRef = useRef<Official[]>([]);
  
  // Initialization guard to prevent duplicate loading
  const initializationCompleteRef = useRef(false);

  // Section-level dirty state tracking
  const [dirtyGeneral, setDirtyGeneral] = useState(false);
  const [dirtyEmail, setDirtyEmail] = useState(false);
  const [dirtyOfficials, setDirtyOfficials] = useState(false);

  // Settings lock state
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [hasLock, setHasLock] = useState(false);
  const lockRefreshIntervalRef = useRef<number | null>(null);
  const lockTimeoutRef = useRef<number | null>(null);

  // helper to make MUI InputLabel shrink when the field has content or a non-empty value
  // (removed unused helper to silence lint)

  useEffect(() => {
    // Guard against re-initialization: only run once on mount
    if (initializationCompleteRef.current) return;
    
    const ac = new AbortController();
    const loadData = async () => {
      try {
        // Load settings and email config
        await fetchSettings(ac.signal);
        
        // Fetch health status after loading settings
        try {
          const response = await axiosInstance.get('/settings/email/health');
          if (response.data) {
            setHealthStatus(response.data);
          }
        } catch (err) {
          console.error('Failed to fetch email health status on load:', err);
        }
        
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
        setSettings(sys);
        originalSettingsRef.current = sys;
        
        // Load unified email configuration from SMTP field
        // Single source of truth: all providers use the 'smtp' field on the server
        if ((sys as any).smtp) {
          const smtpData = (sys as any).smtp;
          
          // Check if backend has saved passwords (even if not displayed)
          const hasBackendCustomPassword = !!(smtpData.password && smtpData.password.trim().length > 0);
          
          const unifiedConfig: any = {
            // Provider config
            enabled: smtpData.enabled !== false,
            provider: smtpData.provider || 'custom',
            fromName: smtpData.fromName || 'Barangay System',
            fromEmail: smtpData.fromEmail || '',
            
            // Custom SMTP fields
            host: smtpData.host || '',
            port: smtpData.port || 587,
            user: smtpData.user || '',
            password: '', // Never populate from backend for security
            secure: smtpData.secure || false,
            
            // Gmail fields
            gmailAppPassword: '', // Never populate from backend for security
            
            // SendGrid fields
            sendgridApiKey: '', // Never populate from backend for security
            
            // AWS SES fields
            awsAccessKeyId: '', // Never populate from backend for security
            awsSecretAccessKey: '', // Never populate from backend for security
            awsRegion: smtpData.awsRegion || 'us-east-1',
            
            // Email behaviors - merge from emailSettings if available
            enablePasswordResetEmails: (sys as any).emailSettings?.enablePasswordResetEmails ?? true,
            enableOtpEmails: (sys as any).emailSettings?.enableOtpEmails ?? true,
            enableDocumentNotificationEmails: (sys as any).emailSettings?.enableDocumentNotificationEmails ?? true,
            enableAnnouncementEmails: (sys as any).emailSettings?.enableAnnouncementEmails ?? true,
            enableAnnouncementBcc: (sys as any).emailSettings?.enableAnnouncementBcc ?? true,
            recipientEmailsPerBatch: (sys as any).emailSettings?.recipientEmailsPerBatch ?? 100,
            retryFailedEmails: (sys as any).emailSettings?.retryFailedEmails ?? true,
            retryAttempts: (sys as any).emailSettings?.retryAttempts ?? 3,
            retryDelayMinutes: (sys as any).emailSettings?.retryDelayMinutes ?? 5,
            dryRunMode: (sys as any).emailSettings?.dryRunMode ?? false,
          };

          setEmailConfig(unifiedConfig);
          originalEmailConfigRef.current = JSON.parse(JSON.stringify(unifiedConfig));
          
          // Set backendHasPassword flag - password is saved if it exists in backend
          setBackendHasPassword(prev => ({
            ...prev,
            custom: hasBackendCustomPassword
          }));
          
          console.log('[SystemSettings] Unified email config loaded:', {
            provider: unifiedConfig.provider,
            enabled: unifiedConfig.enabled,
            fromName: unifiedConfig.fromName,
            fromEmail: unifiedConfig.fromEmail,
            dryRunMode: unifiedConfig.dryRunMode,
            hasBackendPassword: hasBackendCustomPassword
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
      setLoadingHealthStatus(true);
      const response = await axiosInstance.get('/settings/email/health');
      if (response.data) {
        setHealthStatus(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch email health status:', err);
      // Don't show error toast, just log it
    } finally {
      setLoadingHealthStatus(false);
    }
  };

  // Trigger manual health check
  // Extract current emailConfig for health check (including unsaved changes)
  const getEmailConfigForHealthCheck = (): { isValid: boolean; config?: any; error?: string } => {
    // Don't validate if disabled - just return disabled config
    if (!emailConfig.enabled) {
      return {
        isValid: false,
        error: 'Email provider is currently disabled. Enable it first to perform a health check.'
      };
    }

    // Validate provider-specific required fields
    const errors: string[] = [];

    if (!emailConfig.provider) {
      errors.push('No email provider selected');
    }

    if (emailConfig.provider === 'custom') {
      if (!emailConfig.host) errors.push('SMTP Host is required');
      if (!emailConfig.port) errors.push('SMTP Port is required');
      else if (emailConfig.port < 1 || emailConfig.port > 65535) errors.push('SMTP Port must be between 1 and 65535');
      if (!emailConfig.user) errors.push('SMTP Username is required');
      if (!emailConfig.password) errors.push('SMTP Password is required');
      if (!emailConfig.fromEmail) errors.push('From Email is required');
    } else if (emailConfig.provider === 'gmail') {
      if (!emailConfig.gmailAppPassword) errors.push('Gmail App Password is required');
      if (!emailConfig.fromEmail) errors.push('From Email is required');
    } else if (emailConfig.provider === 'sendgrid') {
      if (!emailConfig.sendgridApiKey) errors.push('SendGrid API Key is required');
      if (!emailConfig.fromEmail) errors.push('From Email is required');
    } else if (emailConfig.provider === 'aws-ses') {
      if (!emailConfig.awsAccessKeyId) errors.push('AWS Access Key ID is required');
      if (!emailConfig.awsSecretAccessKey) errors.push('AWS Secret Access Key is required');
      if (!emailConfig.awsRegion) errors.push('AWS Region is required');
      if (!emailConfig.fromEmail) errors.push('From Email is required');
    } else if (emailConfig.provider === 'mailtrap') {
      if (!emailConfig.user) errors.push('Mailtrap Username is required');
      if (!emailConfig.password) errors.push('Mailtrap Password is required');
      if (!emailConfig.fromEmail) errors.push('From Email is required');
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        error: `Email configuration incomplete:\n${errors.join('\n')}`
      };
    }

    // Build clean config payload for health check
    const configPayload: any = {
      enabled: emailConfig.enabled,
      provider: emailConfig.provider,
      fromName: emailConfig.fromName,
      fromEmail: emailConfig.fromEmail
    };

    // Include provider-specific fields
    if (emailConfig.provider === 'custom') {
      configPayload.host = emailConfig.host;
      configPayload.port = emailConfig.port;
      configPayload.user = emailConfig.user;
      configPayload.password = emailConfig.password;
      configPayload.secure = emailConfig.secure;
    } else if (emailConfig.provider === 'gmail') {
      configPayload.gmailAppPassword = emailConfig.gmailAppPassword;
    } else if (emailConfig.provider === 'sendgrid') {
      configPayload.sendgridApiKey = emailConfig.sendgridApiKey;
    } else if (emailConfig.provider === 'aws-ses') {
      configPayload.awsAccessKeyId = emailConfig.awsAccessKeyId;
      configPayload.awsSecretAccessKey = emailConfig.awsSecretAccessKey;
      configPayload.awsRegion = emailConfig.awsRegion;
    } else if (emailConfig.provider === 'mailtrap') {
      configPayload.user = emailConfig.user;
      configPayload.password = emailConfig.password;
    }

    return {
      isValid: true,
      config: configPayload
    };
  };

  const handleHealthCheckClick = async () => {
    try {
      // Extract and validate emailConfig from current state
      const validation = getEmailConfigForHealthCheck();
      
      if (!validation.isValid) {
        setError(validation.error || 'Email configuration is incomplete');
        antdMessage.error(validation.error || 'Email configuration is incomplete');
        return;
      }

      setLoadingHealthStatus(true);

      // Build smtp config payload with current state (unsaved settings)
      // Use real password from smtpPasswords state (not masked value from emailConfig)
      const smtpPayload: any = {
        ...validation.config,
      };

      // Only include password if it has been dirtied (edited by user)
      const provider = validation.config.provider;
      const isPasswordDirty = passwordDirty[provider as keyof typeof passwordDirty];
      
      if (provider === 'custom' && isPasswordDirty && smtpPasswords.custom) {
        smtpPayload.password = smtpPasswords.custom;
        console.log('[SystemSettings] Health check - Including password (passwordDirty=true)', {
          hasPassword: !!smtpPasswords.custom,
          passwordLength: smtpPasswords.custom.length,
          passwordDirty: isPasswordDirty
        });
      } else if (provider === 'custom' && !isPasswordDirty) {
        console.log('[SystemSettings] Health check - Password NOT included (passwordDirty=false)');
        delete smtpPayload.password;
      } else if ((provider === 'gmail' || provider === 'mailtrap') && isPasswordDirty) {
        console.log('[SystemSettings] Health check - Including password for provider', {
          provider,
          passwordDirty: isPasswordDirty,
          passwordLength: smtpPayload.password?.length || 0
        });
      }

      // Log exact payload being sent
      console.log('[SystemSettings] Health check - Sending unsaved smtp config:', {
        provider: smtpPayload.provider,
        fromName: smtpPayload.fromName,
        fromEmail: smtpPayload.fromEmail,
        hasPassword: !!smtpPayload.password,
        passwordLength: smtpPayload.password?.length || 0,
        passwordDirty: isPasswordDirty,
        fieldsIncluded: Object.keys(smtpPayload),
        timestamp: new Date().toISOString()
      });

      // Send health check with current smtp config in payload (new API endpoint expects smtp parameter)
      // Falls back to emailConfig for backward compatibility
      const response = await axiosInstance.post('/settings/email/health-check', {
        smtp: smtpPayload
      });

      if (response.data) {
        setHealthStatus(response.data);
        
        console.log('[SystemSettings] Health check response:', {
          success: response.data.success,
          status: response.data.status,
          provider: response.data.provider,
          durationMs: response.data.checkDurationMs,
          configSource: response.data.configSource
        });

        if (response.data.success) {
          antdMessage.success(`Health check passed! Provider ${smtpPayload.provider} is working correctly.`);
        } else {
          antdMessage.warning(`Health check failed: ${response.data.message || 'Please check your configuration'}`);
        }
      }
    } catch (err: any) {
      console.error('[SystemSettings] Health check error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      
      let errorMessage = 'Failed to perform health check';
      
      // Handle 404 - endpoint not available
      if (err.response?.status === 404) {
        errorMessage = 'Email health check is not available on this server.';
        console.error('[SystemSettings] Health check endpoint not found (404) - server may not support this feature');
      } else {
        errorMessage = err.response?.data?.message || err.message || errorMessage;
      }
      
      setError(errorMessage);
      antdMessage.error(errorMessage);
    } finally {
      setLoadingHealthStatus(false);
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
  // Validate email configuration before saving
  const validateEmailConfig = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Only validate if email is enabled
    if (!emailConfig.enabled) {
      return { isValid: true, errors: [] };
    }

    // Validate provider-specific required fields
    if (emailConfig.provider === 'custom') {
      // Custom SMTP: require host, port, user, password, fromEmail
      if (!emailConfig.host || emailConfig.host.trim() === '') {
        errors.push('SMTP Host is required');
      }

      if (!emailConfig.port) {
        errors.push('SMTP Port is required');
      } else if (emailConfig.port < 1 || emailConfig.port > 65535) {
        errors.push('SMTP Port must be between 1 and 65535');
      }

      if (!emailConfig.user || emailConfig.user.trim() === '') {
        errors.push('SMTP Username is required');
      }

      if (!emailConfig.password || emailConfig.password.trim() === '') {
        errors.push('SMTP Password is required');
      }

      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        errors.push('From Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.fromEmail)) {
        errors.push('From Email must be a valid email address');
      }
    } else if (emailConfig.provider === 'gmail') {
      // Gmail: require gmailAppPassword and fromEmail (uses fromEmail as sender)
      if (!emailConfig.gmailAppPassword || emailConfig.gmailAppPassword.trim() === '') {
        errors.push('Gmail App Password is required');
      }

      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        errors.push('From Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.fromEmail)) {
        errors.push('From Email must be a valid email address');
      }
    } else if (emailConfig.provider === 'sendgrid') {
      // SendGrid: require sendgridApiKey, fromEmail
      if (!emailConfig.sendgridApiKey || emailConfig.sendgridApiKey.trim() === '') {
        errors.push('SendGrid API Key is required');
      }

      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        errors.push('From Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.fromEmail)) {
        errors.push('From Email must be a valid email address');
      }
    } else if (emailConfig.provider === 'aws-ses') {
      // AWS SES: require awsAccessKeyId, awsSecretAccessKey, awsRegion, fromEmail
      if (!emailConfig.awsAccessKeyId || emailConfig.awsAccessKeyId.trim() === '') {
        errors.push('AWS Access Key ID is required');
      }

      if (!emailConfig.awsSecretAccessKey || emailConfig.awsSecretAccessKey.trim() === '') {
        errors.push('AWS Secret Access Key is required');
      }

      if (!emailConfig.awsRegion || emailConfig.awsRegion.trim() === '') {
        errors.push('AWS Region is required');
      }

      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        errors.push('From Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.fromEmail)) {
        errors.push('From Email must be a valid email address');
      }
    } else if (emailConfig.provider === 'mailtrap') {
      // Mailtrap: require user, password, fromEmail
      if (!emailConfig.user || emailConfig.user.trim() === '') {
        errors.push('Mailtrap Username is required');
      }

      if (!emailConfig.password || emailConfig.password.trim() === '') {
        errors.push('Mailtrap Password is required');
      }

      if (!emailConfig.fromEmail || emailConfig.fromEmail.trim() === '') {
        errors.push('From Email is required');
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.fromEmail)) {
        errors.push('From Email must be a valid email address');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const performSave = async () => {
    try {
      // Validate email configuration BEFORE making API call
      const validation = validateEmailConfig();
      if (!validation.isValid) {
        setError(`Email Configuration Validation Failed:\n${validation.errors.join('\n')}`);
        setSaving(false);
        return;
      }

      setSaving(true);
      setError(null);
      
      // HELPER: Filter irrelevant provider fields to enforce single provider
      // Only include fields for the selected provider, clear all others
      const filterProviderConfig = (config: any) => {
        if (!config || !config.provider) return config;
        
        const filtered: any = {
          enabled: config.enabled,
          provider: config.provider,
          fromName: config.fromName,
          fromEmail: config.fromEmail,
          updatedAt: config.updatedAt
        };
        
        // SINGLE PROVIDER ENFORCEMENT: Include ONLY selected provider's fields
        if (config.provider === 'gmail') {
          // Gmail: include only Gmail app password field
          if (config.gmailAppPassword) filtered.gmailAppPassword = config.gmailAppPassword;
        } else if (config.provider === 'mailtrap') {
          // Mailtrap: include only Mailtrap fields
          if (config.user) filtered.user = config.user;
          if (config.password) filtered.password = config.password;
        } else if (config.provider === 'sendgrid') {
          // SendGrid: include only SendGrid fields
          if (config.sendgridApiKey) filtered.sendgridApiKey = config.sendgridApiKey;
        } else if (config.provider === 'aws-ses') {
          // AWS SES: include only AWS fields
          if (config.awsAccessKeyId) filtered.awsAccessKeyId = config.awsAccessKeyId;
          if (config.awsSecretAccessKey) filtered.awsSecretAccessKey = config.awsSecretAccessKey;
          if (config.awsRegion) filtered.awsRegion = config.awsRegion;
        } else if (config.provider === 'custom') {
          // Custom SMTP: include only custom SMTP fields, exclude Gmail/other provider fields
          if (config.host) filtered.host = config.host;
          if (config.port) filtered.port = config.port;
          if (config.user) filtered.user = config.user;
          if (config.password) filtered.password = config.password;
          if (config.secure !== undefined) filtered.secure = config.secure;
          // Explicitly exclude gmailAddress and gmailAppPassword for custom SMTP
        }
        
        return filtered;
      };
      
      // Normalize numeric fields and map client keys to server-side field names
      const payload: any = {
        siteName: settings.siteName,
        barangayName: settings.barangayName,
        barangayAddress: settings.barangayAddress,
        contactEmail: settings.contactEmail,
        contactPhone: settings.contactPhone,
        systemNotice: settings.systemNotice,
        // compatibility: server uses 'maintenanceMode' while client uses 'maintainanceMode' (typo)
        maintenanceMode: (settings as any).maintainanceMode,
        // server expects allowRegistrations and maxDocumentRequestsPerUser
        allowRegistrations: (settings as any).allowNewRegistrations,
        maxDocumentRequestsPerUser: Number((settings as any).maxDocumentRequests) || 1,
        documentProcessingDays: Number(settings.documentProcessingDays) || 1,
        enableVerifications: (settings as any).enableVerifications,
        ...(typeof (settings as any).maxAccountsPerIP !== 'undefined'
          ? { maxAccountsPerIP: Number((settings as any).maxAccountsPerIP) || 1 }
          : {}),
      };

      // Include email behavior settings
      payload.emailSettings = {
        enabled: emailConfig.enabled,
        enablePasswordResetEmails: emailConfig.enablePasswordResetEmails,
        enableOtpEmails: emailConfig.enableOtpEmails,
        enableDocumentNotificationEmails: emailConfig.enableDocumentNotificationEmails,
        enableAnnouncementEmails: emailConfig.enableAnnouncementEmails,
        enableAnnouncementBcc: emailConfig.enableAnnouncementBcc,
        recipientEmailsPerBatch: emailConfig.recipientEmailsPerBatch,
        retryFailedEmails: emailConfig.retryFailedEmails,
        retryAttempts: emailConfig.retryAttempts,
        retryDelayMinutes: emailConfig.retryDelayMinutes,
        dryRunMode: emailConfig.dryRunMode,
      };

      // UNIFIED EMAIL CONFIG with SINGLE PROVIDER ENFORCEMENT
      // Filter irrelevant fields: only send provider-specific fields for selected provider
      // Only include password if it has been modified by user
      const filteredConfig = filterProviderConfig(emailConfig);
      
      // Handle password: only include if modified or if new (not in original)
      if (!passwordModified[emailConfig.provider] && originalEmailConfigRef.current?.[emailConfig.provider]) {
        // Password not modified and has been previously saved - omit it from payload
        // This preserves the backend-stored password
        if (filteredConfig.password) delete filteredConfig.password;
        if (filteredConfig.gmailAppPassword) delete filteredConfig.gmailAppPassword;
      }
      
      payload.email = filteredConfig;
      
      console.log('[Settings Save] Unified email config (single provider enforced):', {
        enabled: filteredConfig.enabled,
        provider: filteredConfig.provider,
        fromName: filteredConfig.fromName,
        fromEmail: filteredConfig.fromEmail,
        fieldsIncluded: Object.keys(filteredConfig),
        passwordIncluded: !!(filteredConfig.password || filteredConfig.gmailAppPassword),
        passwordModified: passwordModified[emailConfig.provider],
        irrelevantFieldsFiltered: 'Only selected provider fields sent'
      });

      // Also remove _id from root payload if present
      delete (payload as any)._id;

      console.log('[Settings Save] Full payload being sent:', JSON.stringify(payload, null, 2));

      await adminAPI.updateSystemSettings(payload);
      // optimistic: update original copy and clear dirty flags
      originalSettingsRef.current = JSON.parse(JSON.stringify(settings));
      originalEmailConfigRef.current = JSON.parse(JSON.stringify(emailConfig));
      
      // Reset password modification flags after save - passwords are now stored on backend
      setPasswordModified({
        custom: false,
        gmail: false,
        mailtrap: false,
      });
      
      // Reset dirty states for general and email sections
      setDirtyGeneral(false);
      setDirtyEmail(false);
      
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

  // Memoized callbacks to prevent unnecessary re-renders
  const handleGmailStatusChange = useCallback((enabled: boolean) => {
    // Only update if initialization is complete
    if (!initializationCompleteRef.current) return;
    console.log('[SystemSettings] Gmail status changed:', enabled);
    setEmailConfig((prev: any) => ({ ...prev, enabled }));
  }, []);

  const handleGmailSettingsChange = useCallback((updatedConfig: any) => {
    // Only update if initialization is complete
    if (!initializationCompleteRef.current) return;
    console.log('[SystemSettings] Gmail config changed:', {
      enabled: updatedConfig.enabled,
      provider: updatedConfig.provider,
      fromName: updatedConfig.fromName,
      fromEmail: updatedConfig.fromEmail,
    });
    setEmailConfig((prev: any) => ({ ...prev, ...updatedConfig }));
  }, []);

  // Create clean config when provider changes - only include fields for selected provider
  const createCleanProviderConfig = (provider: string, baseConfig: any): any => {
    const cleaned: any = {
      enabled: baseConfig.enabled !== undefined ? baseConfig.enabled : emailConfig.enabled,
      provider,
      fromName: baseConfig.fromName || emailConfig.fromName,
      fromEmail: baseConfig.fromEmail || emailConfig.fromEmail,
    };

    // Include only the fields relevant to the selected provider
    if (provider === 'custom') {
      cleaned.host = emailConfig.host || '';
      cleaned.port = emailConfig.port || 587;
      cleaned.user = emailConfig.user || '';
      cleaned.password = emailConfig.password || '';
      cleaned.secure = emailConfig.secure !== undefined ? emailConfig.secure : false;
    } else if (provider === 'gmail') {
      cleaned.gmailAppPassword = emailConfig.gmailAppPassword || '';
    } else if (provider === 'sendgrid') {
      cleaned.sendgridApiKey = emailConfig.sendgridApiKey || '';
    } else if (provider === 'aws-ses') {
      cleaned.awsAccessKeyId = emailConfig.awsAccessKeyId || '';
      cleaned.awsSecretAccessKey = emailConfig.awsSecretAccessKey || '';
      cleaned.awsRegion = emailConfig.awsRegion || 'us-east-1';
    } else if (provider === 'mailtrap') {
      cleaned.user = emailConfig.user || '';
      cleaned.password = emailConfig.password || '';
    }

    // Preserve email behavior settings across provider changes
    cleaned.enablePasswordResetEmails = emailConfig.enablePasswordResetEmails;
    cleaned.enableOtpEmails = emailConfig.enableOtpEmails;
    cleaned.enableDocumentNotificationEmails = emailConfig.enableDocumentNotificationEmails;
    cleaned.enableAnnouncementEmails = emailConfig.enableAnnouncementEmails;
    cleaned.enableAnnouncementBcc = emailConfig.enableAnnouncementBcc;
    cleaned.recipientEmailsPerBatch = emailConfig.recipientEmailsPerBatch;
    cleaned.retryFailedEmails = emailConfig.retryFailedEmails;
    cleaned.retryAttempts = emailConfig.retryAttempts;
    cleaned.retryDelayMinutes = emailConfig.retryDelayMinutes;
    cleaned.dryRunMode = emailConfig.dryRunMode;

    return cleaned;
  };

  const handleEmailConfigChange = useCallback((config: any) => {
    // Only update if initialization is complete
    if (!initializationCompleteRef.current) return;
    console.log('[SystemSettings] Email config changed:', config);
    
    // If provider changed, reset all unrelated provider-specific fields
    if (config.provider && config.provider !== emailConfig.provider) {
      const resetConfig = createCleanProviderConfig(config.provider, config);
      setEmailConfig((prev: any) => ({ ...prev, ...resetConfig }));
      // Reset password modified flag when provider changes
      setPasswordModified({
        custom: false,
        gmail: false,
        mailtrap: false,
      });
      // Reset password dirty flag when provider changes
      setPasswordDirty({
        custom: false,
        gmail: false,
        mailtrap: false,
      });
      // Reset passwords when provider changes
      setSmtpPasswords({
        custom: '',
        gmail: '',
        mailtrap: ''
      });
    } else {
      // Track password modification and update password state
      if (config.password !== undefined && initializationCompleteRef.current) {
        setPasswordModified((prev) => ({
          ...prev,
          [emailConfig.provider]: true,
        }));
        // Mark password as dirty when user edits it
        setPasswordDirty((prev) => ({
          ...prev,
          [emailConfig.provider]: true,
        }));
        // Store real password in smtpPasswords
        if (emailConfig.provider === 'custom' || emailConfig.provider === 'mailtrap') {
          setSmtpPasswords((prev) => ({
            ...prev,
            [emailConfig.provider]: config.password
          }));
          console.log('[SystemSettings] Password field edited for', emailConfig.provider, {
            passwordDirty: true,
            passwordLength: config.password?.length || 0
          });
        }
      }
      if (config.gmailAppPassword !== undefined && initializationCompleteRef.current) {
        setPasswordModified((prev) => ({
          ...prev,
          gmail: true,
        }));
        // Mark Gmail password as dirty when user edits it
        setPasswordDirty((prev) => ({
          ...prev,
          gmail: true,
        }));
        // Store real Gmail app password
        setSmtpPasswords((prev) => ({
          ...prev,
          gmail: config.gmailAppPassword
        }));
        console.log('[SystemSettings] Gmail password field edited', {
          passwordDirty: true,
          passwordLength: config.gmailAppPassword?.length || 0
        });
      }
      
      // Normalize SMTP secure flag based on port for custom SMTP
      // This ensures consistent behavior across test, save, and health check
      let configToSet = { ...config };
      if (emailConfig.provider === 'custom' && config.port !== undefined) {
        if (config.port === 465) {
          configToSet.secure = true;  // Port 465 uses SSL
          console.log('[SystemSettings] Normalized secure flag: port 465 → secure = true');
        } else if (config.port === 587) {
          configToSet.secure = false;  // Port 587 uses TLS
          console.log('[SystemSettings] Normalized secure flag: port 587 → secure = false');
        }
      }
      
      setEmailConfig((prev: any) => ({ ...prev, ...configToSet }));
    }
  }, [emailConfig.provider]);

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
    settings.maintainanceMode,
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
      
      if (!originalEmailConfigRef.current) {
        setDirtyEmail(false);
        return;
      }
      
      const isDirty = DirtyStateUtils.isEmailDirty(
        originalEmailConfigRef.current,
        emailConfig
      );
      setDirtyEmail(isDirty);
    } catch (e) {
      console.error('Error checking email settings dirty state:', e);
      setDirtyEmail(false);
    }
  }, [emailConfig]);

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

          {/* Email Provider Selection Component */}
          <EmailSettings onConfigChange={handleEmailConfigChange} />

          {/* Unified Email Configuration - Conditional Rendering Based on Provider */}
          {emailConfig?.provider === 'custom' && (
            <CustomSmtpSettings 
              emailConfig={emailConfig}
              setEmailConfig={setEmailConfig}
              smtpPasswordProp={smtpPasswords.custom}
              passwordDirty={passwordDirty.custom}
              hasBackendPassword={backendHasPassword.custom}
            />
          )}

          {emailConfig?.provider === 'gmail' && (
            <GmailSettings 
              onGmailStatusChange={handleGmailStatusChange}
              onEmailConfigChange={handleGmailSettingsChange}
            />
          )}

          {/* Email Provider Status Panel */}
          <EmailProviderStatus
            emailConfig={emailConfig}
            healthStatus={healthStatus}
            onHealthCheckClick={handleHealthCheckClick}
            loading={false}
          />

          {/* Email Behavior Control Card */}
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
                Email Behavior Control
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 3 }}>
              Control which emails are sent automatically. Changes take effect immediately without restarting the application.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Master Switch */}
              <Box sx={{ p: 2, backgroundColor: '#f0fdf4', borderRadius: 1, border: '1px solid #dcfce7' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={emailConfig.enabled}
                      onChange={(e) => setEmailConfig({ ...emailConfig, enabled: e.target.checked })}
                      disabled={saving}
                    />
                  }
                  label={<Typography sx={{ fontWeight: 600, color: '#065f46' }}>Enable All Email Sending</Typography>}
                />
                <Typography variant="caption" sx={{ color: '#059669', display: 'block', ml: 4, mt: 1 }}>
                  Master switch to disable all email types at once (emergency shutdown)
                </Typography>
              </Box>

              <Divider />

              {/* Email Type Controls */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                  Email Type Controls
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.enablePasswordResetEmails}
                        onChange={(e) => setEmailConfig({ ...emailConfig, enablePasswordResetEmails: e.target.checked })}
                        disabled={saving || !emailConfig.enabled}
                      />
                    }
                    label={
                      <Box>
                        <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Password Reset Emails</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>Sent when users request password reset</Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.enableOtpEmails}
                        onChange={(e) => setEmailConfig({ ...emailConfig, enableOtpEmails: e.target.checked })}
                        disabled={saving || !emailConfig.enabled}
                      />
                    }
                    label={
                      <Box>
                        <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>OTP Emails</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>Sent for 2FA/login verification</Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.enableDocumentNotificationEmails}
                        onChange={(e) => setEmailConfig({ ...emailConfig, enableDocumentNotificationEmails: e.target.checked })}
                        disabled={saving || !emailConfig.enabled}
                      />
                    }
                    label={
                      <Box>
                        <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Document Notifications</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>Sent when documents are approved/rejected</Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.enableAnnouncementEmails}
                        onChange={(e) => setEmailConfig({ ...emailConfig, enableAnnouncementEmails: e.target.checked })}
                        disabled={saving || !emailConfig.enabled}
                      />
                    }
                    label={
                      <Box>
                        <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Announcements</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>Sent when admins post announcements to residents</Typography>
                      </Box>
                    }
                  />
                </Box>
              </Box>

              <Divider />

              {/* Announcement Settings */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                  Announcement Configuration
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.enableAnnouncementBcc}
                        onChange={(e) => setEmailConfig({ ...emailConfig, enableAnnouncementBcc: e.target.checked })}
                        disabled={saving || !emailConfig.enabled || !emailConfig.enableAnnouncementEmails}
                      />
                    }
                    label={
                      <Box>
                        <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Use BCC for Privacy</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          When enabled: announcements sent via BCC (recipients can't see each other)<br/>
                          When disabled: announcements sent individually
                        </Typography>
                      </Box>
                    }
                  />
                  <Box sx={{ ml: 4 }}>
                    <StyledTextField
                      label="Recipients per Batch"
                      type="number"
                      value={emailConfig.recipientEmailsPerBatch}
                      onChange={(e) => setEmailConfig({ ...emailConfig, recipientEmailsPerBatch: Math.max(1, parseInt(e.target.value || '100')) })}
                      inputProps={{ min: 1 }}
                      disabled={saving}
                      sx={{ width: 180 }}
                      helperText="Max recipients sent in each batch"
                    />
                  </Box>
                </Box>
              </Box>

              <Divider />

              {/* Retry Policy */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}>
                  Retry Policy
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={emailConfig.retryFailedEmails}
                        onChange={(e) => setEmailConfig({ ...emailConfig, retryFailedEmails: e.target.checked })}
                        disabled={saving}
                      />
                    }
                    label={
                      <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>Retry Failed Emails</Typography>
                    }
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, ml: 4 }}>
                    <StyledTextField
                      label="Retry Attempts"
                      type="number"
                      value={emailConfig.retryAttempts}
                      onChange={(e) => setEmailConfig({ ...emailConfig, retryAttempts: Math.max(0, parseInt(e.target.value || '0')) })}
                      inputProps={{ min: 0 }}
                      disabled={saving || !emailConfig.retryFailedEmails}
                      helperText="Number of retry attempts"
                    />
                    <StyledTextField
                      label="Retry Delay (minutes)"
                      type="number"
                      value={emailConfig.retryDelayMinutes}
                      onChange={(e) => setEmailConfig({ ...emailConfig, retryDelayMinutes: Math.max(1, parseInt(e.target.value || '5')) })}
                      inputProps={{ min: 1 }}
                      disabled={saving || !emailConfig.retryFailedEmails}
                      helperText="Wait time between retries"
                    />
                  </Box>
                </Box>
              </Box>

              <Divider />

              {/* Dry-Run Mode */}
              <Box sx={{ p: 2, backgroundColor: '#fef3c7', borderRadius: 1, border: '1px solid #fcd34d' }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={emailConfig.dryRunMode ?? false}
                      onChange={(e) => setEmailConfig({ ...emailConfig, dryRunMode: e.target.checked })}
                      disabled={saving}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#f59e0b',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#f59e0b',
                        },
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 600, color: '#92400e' }}>
                        DRY RUN MODE - Emails Simulated (Not Sent)
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#b45309' }}>
                        When enabled, emails are simulated and logged but NOT actually sent to recipients. Useful for testing email configuration safely in production.
                      </Typography>
                    </Box>
                  }
                />
              </Box>

              <Alert severity="info" sx={{ mt: 2, borderRadius: 1 }}>
                <Typography variant="caption">
                  <strong>All email settings are saved</strong> with the main settings using the Save button at the bottom right.
                </Typography>
              </Alert>
            </Box>
          </Paper>

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
                    checked={settings.maintainanceMode ?? false}
                    onChange={(e) => setSettings({ ...settings, maintainanceMode: e.target.checked })}
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

      <TestEmailModal 
        open={testModalOpen} 
        onClose={() => setTestModalOpen(false)} 
        contactEmail={settings.contactEmail}
        emailConfig={emailConfig}
      />

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
          disabled={saving || savingOfficials || (!dirtyGeneral && !dirtyEmail && !dirtyOfficials)}
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
          title={!dirtyGeneral && !dirtyEmail && !dirtyOfficials ? "No changes to save" : "Save changes"}
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