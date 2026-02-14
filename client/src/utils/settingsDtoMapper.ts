/**
 * Settings DTO Mapper
 *
 * Transforms frontend state into API payload format, handling:
 * - Field name mapping (frontend keys → backend keys)
 * - Type normalization (strings → numbers)
 * - Legacy backend compatibility (typos, deprecated fields)
 * - Provider-specific field filtering
 * - Password handling based on modification state
 *
 * This keeps the frontend logic clean by separating concerns:
 * - Frontend uses clean, properly-named state (maintenanceMode)
 * - Backend compatibility is handled transparently by the mapper
 */

interface EmailConfig {
  enabled: boolean;
  provider: string;
  fromName?: string;
  fromEmail?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  gmailAppPassword?: string;
  sendgridApiKey?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  updatedAt?: string;
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

interface SystemSettings {
  siteName: string;
  barangayName: string;
  barangayAddress: string;
  contactEmail: string;
  contactPhone: string;
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  requireEmailVerification?: boolean;
  enableVerifications?: boolean;
  maxDocumentRequests: number;
  documentProcessingDays: number;
  allowMultipleAccountsPerIP?: boolean;
  maxAccountsPerIP?: number;
  systemNotice: string;
}

interface SettingsDtoPayload {
  siteName: string;
  barangayName: string;
  barangayAddress: string;
  contactEmail: string;
  contactPhone: string;
  maintenanceMode: boolean; // Backend expects this name (not the typo)
  allowRegistrations: boolean;
  maxDocumentRequestsPerUser: number;
  documentProcessingDays: number;
  enableVerifications?: boolean;
  maxAccountsPerIP?: number;
  systemNotice: string;
  emailSettings: {
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
  };
  email: any;
}

/**
 * Filter provider-specific fields to enforce single provider pattern
 * Only includes fields relevant to the selected provider
 */
export const filterProviderConfig = (config: EmailConfig): any => {
  if (!config || !config.provider) return config;

  const filtered: any = {
    enabled: config.enabled,
    provider: config.provider,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    updatedAt: config.updatedAt,
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
    // Custom SMTP: include only custom SMTP fields
    if (config.host) filtered.host = config.host;
    if (config.port) filtered.port = config.port;
    if (config.user) filtered.user = config.user;
    if (config.password) filtered.password = config.password;
    if (config.secure !== undefined) filtered.secure = config.secure;
  }

  return filtered;
};

/**
 * Handle password field: omit if not modified and already saved on backend
 * This preserves backend-stored credentials without re-sending them
 */
export const handlePasswordField = (
  filteredConfig: any,
  passwordModified: boolean,
  hadPreviouslySavedPassword: boolean
): any => {
  if (!passwordModified && hadPreviouslySavedPassword) {
    // Password not modified and has been previously saved - omit it
    // This preserves the backend-stored password
    delete filteredConfig.password;
    delete filteredConfig.gmailAppPassword;
  }

  return filteredConfig;
};

/**
 * Map frontend settings state to API payload format (DTO)
 *
 * Handles:
 * - Field name transformations (e.g., allowNewRegistrations → allowRegistrations)
 * - Type normalization (e.g., strings → numbers)
 * - Legacy backend compatibility (e.g., maintenanceMode)
 * - Email behavior settings aggregation
 * - Provider-specific field filtering
 * - Password handling
 *
 * @param settings - Frontend system settings state
 * @param emailConfig - Frontend email configuration state
 * @param passwordModified - Map of which provider passwords were modified
 * @param hadPreviouslySavedPassword - Map of which providers had previously saved passwords
 * @returns API payload ready to send to backend
 */
export const mapSettingsToDto = (
  settings: SystemSettings,
  emailConfig: EmailConfig,
  passwordModified: Record<string, boolean>,
  hadPreviouslySavedPassword: Record<string, boolean>
): SettingsDtoPayload => {
  // Filter email config to only include relevant provider fields
  const filteredEmailConfig = filterProviderConfig(emailConfig);

  // Handle password: only include if modified or if new
  handlePasswordField(
    filteredEmailConfig,
    passwordModified[emailConfig.provider] || false,
    hadPreviouslySavedPassword[emailConfig.provider] || false
  );

  const payload: SettingsDtoPayload = {
    // Direct mappings
    siteName: settings.siteName,
    barangayName: settings.barangayName,
    barangayAddress: settings.barangayAddress,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    systemNotice: settings.systemNotice,

    // Field name transformations
    // Frontend: 'maintenanceMode' → Backend: 'maintenanceMode'
    maintenanceMode: settings.maintenanceMode,

    // Frontend: 'allowNewRegistrations' → Backend: 'allowRegistrations'
    allowRegistrations: settings.allowNewRegistrations,

    // Frontend: 'maxDocumentRequests' → Backend: 'maxDocumentRequestsPerUser'
    maxDocumentRequestsPerUser: Number(settings.maxDocumentRequests) || 1,

    // Type normalization
    documentProcessingDays: Number(settings.documentProcessingDays) || 1,

    // Optional fields
    ...(typeof settings.enableVerifications !== 'undefined'
      ? { enableVerifications: settings.enableVerifications }
      : {}),

    ...(typeof settings.maxAccountsPerIP !== 'undefined'
      ? { maxAccountsPerIP: Number(settings.maxAccountsPerIP) || 1 }
      : {}),

    // Email behavior settings
    emailSettings: {
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
      ...(typeof emailConfig.dryRunMode !== 'undefined'
        ? { dryRunMode: emailConfig.dryRunMode }
        : {}),
    },

    // Provider-specific email configuration
    email: filteredEmailConfig,
  };

  // Remove _id if present
  delete (payload as any)._id;

  return payload;
};

/**
 * Extract and return only the fields used in logging for debugging
 * Useful for console logs without exposing sensitive password data
 */
export const getPayloadSummaryForLogging = (payload: SettingsDtoPayload) => ({
  siteName: payload.siteName,
  maintenanceMode: payload.maintenanceMode,
  allowRegistrations: payload.allowRegistrations,
  documentProcessingDays: payload.documentProcessingDays,
  emailSettings: {
    enabled: payload.emailSettings.enabled,
    retryFailedEmails: payload.emailSettings.retryFailedEmails,
    dryRunMode: payload.emailSettings.dryRunMode,
  },
  email: {
    provider: payload.email.provider,
    enabled: payload.email.enabled,
    fromName: payload.email.fromName,
    fieldsIncluded: Object.keys(payload.email).filter(
      (k) => !['password', 'gmailAppPassword', 'awsSecretAccessKey'].includes(k)
    ),
    passwordIncluded: !!(payload.email.password || payload.email.gmailAppPassword),
  },
});
