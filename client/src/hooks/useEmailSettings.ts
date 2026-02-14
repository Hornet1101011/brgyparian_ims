import { useState, useCallback, useRef } from 'react';

/**
 * Provider types supported by the system
 */
type EmailProvider = 'custom' | 'gmail' | 'mailtrap' | 'sendgrid' | 'aws-ses';

/**
 * Unified email state interface combining all email-related configuration
 */
export interface EmailState {
  // Email provider configuration
  enabled: boolean;
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;

  // Custom SMTP fields
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;

  // Gmail fields
  gmailAppPassword: string;

  // SendGrid fields
  sendgridApiKey: string;

  // AWS SES fields
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;

  // Email behaviors
  enablePasswordResetEmails: boolean;
  enableOtpEmails: boolean;
  enableDocumentNotificationEmails: boolean;
  enableAnnouncementEmails: boolean;
  enableAnnouncementBcc: boolean;
  recipientEmailsPerBatch: number;
  retryFailedEmails: boolean;
  retryAttempts: number;
  retryDelayMinutes: number;
  dryRunMode: boolean;

  // Dirty state tracking per provider
  passwordDirty: Record<EmailProvider, boolean>;

  // Track which providers have passwords saved on backend
  backendHasPassword: Record<EmailProvider, boolean>;

  // Visibility toggles for password fields
  passwordVisibility: Record<EmailProvider, boolean>;
}

/**
 * Default email state
 */
export const defaultEmailState: EmailState = {
  // Email provider configuration
  enabled: false,
  provider: 'custom' as EmailProvider,
  fromName: 'Barangay System',
  fromEmail: '',

  // Custom SMTP fields
  host: '',
  port: 587,
  user: '',
  password: '',
  secure: false,

  // Gmail fields
  gmailAppPassword: '',

  // SendGrid fields
  sendgridApiKey: '',

  // AWS SES fields
  awsAccessKeyId: '',
  awsSecretAccessKey: '',
  awsRegion: 'us-east-1',

  // Email behaviors
  enablePasswordResetEmails: true,
  enableOtpEmails: true,
  enableDocumentNotificationEmails: true,
  enableAnnouncementEmails: true,
  enableAnnouncementBcc: true,
  recipientEmailsPerBatch: 100,
  retryFailedEmails: true,
  retryAttempts: 3,
  retryDelayMinutes: 5,
  dryRunMode: false,

  // Dirty state tracking per provider
  passwordDirty: {
    custom: false,
    gmail: false,
    mailtrap: false,
    sendgrid: false,
    'aws-ses': false,
  },

  // Track which providers have passwords saved on backend
  backendHasPassword: {
    custom: false,
    gmail: false,
    mailtrap: false,
    sendgrid: false,
    'aws-ses': false,
  },

  // Visibility toggles for password fields
  passwordVisibility: {
    custom: false,
    gmail: false,
    mailtrap: false,
    sendgrid: false,
    'aws-ses': false,
  },
};

/**
 * Custom hook for managing email settings with provider-specific logic
 * Consolidates emailConfig, passwordModified, passwordDirty, and smtpPasswords into a single state
 */
export const useEmailSettings = (initialState: EmailState = defaultEmailState) => {
  const [emailState, setEmailState] = useState<EmailState>(initialState);
  
  // Store real passwords in a separate ref (not part of state to avoid re-renders)
  const passwordsRef = useRef<Record<EmailProvider, string>>({
    custom: '',
    gmail: '',
    mailtrap: '',
    sendgrid: '',
    'aws-ses': '',
  });

  /**
   * Provider-specific fields that should be included for each provider
   */
  const getProviderFields = (provider: EmailProvider): (keyof EmailState)[] => {
    const commonFields: (keyof EmailState)[] = ['enabled', 'provider', 'fromName', 'fromEmail'];
    
    switch (provider) {
      case 'custom':
      case 'mailtrap':
        return [...commonFields, 'host', 'port', 'user', 'password', 'secure'];
      case 'gmail':
        return [...commonFields, 'gmailAppPassword'];
      case 'sendgrid':
        return [...commonFields, 'sendgridApiKey'];
      case 'aws-ses':
        return [...commonFields, 'awsAccessKeyId', 'awsSecretAccessKey', 'awsRegion'];
      default:
        return commonFields;
    }
  };

  /**
   * Create a clean config with only provider-specific fields
   * Prevents data leakage between providers
   */
  const createCleanProviderConfig = useCallback(
    (provider: EmailProvider): Partial<EmailState> => {
      const cleaned: any = {
        provider,
        enabled: emailState.enabled,
        fromName: emailState.fromName,
        fromEmail: emailState.fromEmail,
      };

      // Include only provider-specific fields
      const fields = getProviderFields(provider);
      for (const field of fields) {
        if (field !== 'enabled' && field !== 'provider' && field !== 'fromName' && field !== 'fromEmail') {
          if (field in emailState) {
            cleaned[field] = (emailState as any)[field];
          }
        }
      }

      // Always preserve email behavior settings
      const behaviorFields: (keyof EmailState)[] = [
        'enablePasswordResetEmails',
        'enableOtpEmails',
        'enableDocumentNotificationEmails',
        'enableAnnouncementEmails',
        'enableAnnouncementBcc',
        'recipientEmailsPerBatch',
        'retryFailedEmails',
        'retryAttempts',
        'retryDelayMinutes',
        'dryRunMode',
      ];

      for (const field of behaviorFields) {
        cleaned[field] = (emailState as any)[field];
      }

      return cleaned;
    },
    [emailState]
  );

  /**
   * Update email configuration field
   * Handles special logic for provider changes and password tracking
   */
  const updateField = useCallback(
    (field: keyof EmailState, value: any) => {
      setEmailState((prev) => {
        // If provider is changing, clear fields from other providers
        if (field === 'provider' && value !== prev.provider) {
          const cleanConfig = createCleanProviderConfig(value);
          const newState: EmailState = {
            ...prev,
            ...cleanConfig,
            // Reset all password dirty states and visibility when switching providers
            passwordDirty: {
              ...prev.passwordDirty,
              [value]: prev.passwordDirty[value],
              // Clear dirty flags for other providers
              ...(Object.keys(prev.passwordDirty) as EmailProvider[]).reduce(
                (acc, provider) => {
                  if (provider !== value) {
                    acc[provider] = false;
                  }
                  return acc;
                },
                {} as Record<EmailProvider, boolean>
              ),
            },
            passwordVisibility: {
              ...prev.passwordVisibility,
              // Keep visibility only for the new provider
              ...(Object.keys(prev.passwordVisibility) as EmailProvider[]).reduce(
                (acc, provider) => {
                  if (provider === value) {
                    acc[provider] = prev.passwordVisibility[provider];
                  } else {
                    acc[provider] = false;
                  }
                  return acc;
                },
                {} as Record<EmailProvider, boolean>
              ),
            },
          };

          // Clear passwords for other providers
          const newProvider = value as EmailProvider;
          const otherProviders = Object.keys(passwordsRef.current).filter(
            (p) => (p as EmailProvider) !== newProvider
          ) as EmailProvider[];
          otherProviders.forEach((provider) => {
            passwordsRef.current[provider] = '';
          });

          return newState;
        }

        // Handle password field changes
        const isPasswordField =
          field === 'password' || field === 'gmailAppPassword' || field === 'sendgridApiKey';

        if (isPasswordField && value !== undefined) {
          const provider = emailState.provider as EmailProvider;
          
          // Mark password as dirty when user edits it
          const newState: EmailState = {
            ...prev,
            [field]: value,
            passwordDirty: {
              ...prev.passwordDirty,
              [provider]: true,
            },
          };

          // Store real password in ref
          if (field === 'password' && (provider === 'custom' || provider === 'mailtrap')) {
            passwordsRef.current[provider] = value;
          } else if (field === 'gmailAppPassword' && provider === 'gmail') {
            passwordsRef.current['gmail'] = value;
          } else if (field === 'sendgridApiKey' && provider === 'sendgrid') {
            passwordsRef.current['sendgrid'] = value;
          }

          return newState;
        }

        // Regular field update
        return {
          ...prev,
          [field]: value,
        };
      });
    },
    [createCleanProviderConfig]
  );

  /**
   * Update multiple fields at once
   */
  const updateFields = useCallback(
    (updates: Partial<EmailState>) => {
      setEmailState((prev) => {
        let newState = { ...prev };

        // Handle provider change first if it exists
        if ('provider' in updates && updates.provider !== prev.provider) {
          const cleanConfig = createCleanProviderConfig(updates.provider);
          newState = {
            ...prev,
            ...cleanConfig,
            ...updates,
          };

          // Clear passwords for other providers
          const newProvider = updates.provider as EmailProvider;
          const otherProviders = Object.keys(passwordsRef.current).filter(
            (p) => (p as EmailProvider) !== newProvider
          ) as EmailProvider[];
          otherProviders.forEach((provider) => {
            passwordsRef.current[provider] = '';
          });

          return newState;
        }

        // Regular multi-field update
        return { ...prev, ...updates };
      });
    },
    [createCleanProviderConfig]
  );

  /**
   * Toggle password visibility for a specific provider
   */
  const togglePasswordVisibility = useCallback((provider: EmailProvider) => {
    setEmailState((prev) => ({
      ...prev,
      passwordVisibility: {
        ...prev.passwordVisibility,
        [provider]: !prev.passwordVisibility[provider],
      },
    }));
  }, []);

  /**
   * Mark password as dirty (modified by user)
   */
  const markPasswordDirty = useCallback((provider: EmailProvider, isDirty: boolean) => {
    setEmailState((prev) => ({
      ...prev,
      passwordDirty: {
        ...prev.passwordDirty,
        [provider]: isDirty,
      },
    }));
  }, []);

  /**
   * Mark that backend has a saved password for this provider
   */
  const setBackendHasPassword = useCallback((provider: EmailProvider, hasPassword: boolean) => {
    setEmailState((prev) => ({
      ...prev,
      backendHasPassword: {
        ...prev.backendHasPassword,
        [provider]: hasPassword,
      },
    }));
  }, []);

  /**
   * Reset all password-related state when switching providers
   */
  const resetPasswordStates = useCallback((provider: EmailProvider) => {
    setEmailState((prev) => ({
      ...prev,
      passwordDirty: {
        ...prev.passwordDirty,
        [provider]: false,
      },
      passwordVisibility: {
        ...prev.passwordVisibility,
        [provider]: false,
      },
    }));
    
    // Clear password from ref
    passwordsRef.current[provider] = '';
  }, []);

  /**
   * Reset all password states for all providers
   */
  const resetAllPasswordStates = useCallback(() => {
    setEmailState((prev) => ({
      ...prev,
      passwordDirty: {
        custom: false,
        gmail: false,
        mailtrap: false,
        sendgrid: false,
        'aws-ses': false,
      },
      passwordVisibility: {
        custom: false,
        gmail: false,
        mailtrap: false,
        sendgrid: false,
        'aws-ses': false,
      },
    }));

    // Clear all passwords from ref
    Object.keys(passwordsRef.current).forEach((provider) => {
      passwordsRef.current[provider as EmailProvider] = '';
    });
  }, []);

  /**
   * Get real password for current provider from ref
   */
  const getPassword = useCallback((): string => {
    const provider = emailState.provider as EmailProvider;
    return passwordsRef.current[provider] || '';
  }, [emailState.provider]);

  /**
   * Get all real passwords (careful with this - for payload building only)
   */
  const getPasswords = useCallback((): Record<EmailProvider, string> => {
    return { ...passwordsRef.current };
  }, []);

  /**
   * Clear all non-provider-specific fields (data leak prevention)
   */
  const clearNonProviderFields = useCallback(() => {
    setEmailState((prev) => {
      const provider = prev.provider as EmailProvider;
      const allowedFields = getProviderFields(provider);

      const newState: any = {};
      
      // Keep behavior fields always
      const behaviorFields = [
        'enablePasswordResetEmails',
        'enableOtpEmails',
        'enableDocumentNotificationEmails',
        'enableAnnouncementEmails',
        'enableAnnouncementBcc',
        'recipientEmailsPerBatch',
        'retryFailedEmails',
        'retryAttempts',
        'retryDelayMinutes',
        'dryRunMode',
        'passwordDirty',
        'backendHasPassword',
        'passwordVisibility',
      ];

      for (const key in prev) {
        if (
          allowedFields.includes(key as keyof EmailState) ||
          behaviorFields.includes(key)
        ) {
          newState[key] = (prev as any)[key];
        }
      }

      return { ...prev, ...newState };
    });
  }, []);

  return {
    emailState,
    setEmailState,
    updateField,
    updateFields,
    togglePasswordVisibility,
    markPasswordDirty,
    setBackendHasPassword,
    resetPasswordStates,
    resetAllPasswordStates,
    getPassword,
    getPasswords,
    clearNonProviderFields,
    createCleanProviderConfig,
    getProviderFields,
  };
};
