/**
 * EmailSettingsSection - Standalone component for email configuration and settings
 *
 * Responsibilities:
 * - Render provider-specific email configuration forms
 * - Display email health status and health check button
 * - Manage email behavior controls (password reset, OTP, announcements, etc.)
 * - Handle health check logic and modal interactions
 * - Display test email modal
 *
 * Props:
 * - emailState: Consolidated email state from useEmailSettings hook
 * - emailConfig: Current email configuration (from emailState.emailConfig)
 * - healthStatus: Current email provider health check status
 * - loadingHealthStatus: Loading state for health check
 * - saving: Overall saving state from parent
 * - onHealthCheckClick: Handler for health check button
 * - onUpdateConfig: Unified handler for email config updates
 * - onPasswordDirtyChange: Handler for password dirty state changes
 */

import React, { useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  TextField,
} from '@mui/material';
import { EmailState } from '../../hooks/useEmailSettings';
import EmailSettings from './EmailSettings';
import CustomSmtpSettings from './CustomSmtpSettings';
import GmailSettings from './GmailSettings';
import EmailProviderStatus from './EmailProviderStatus';

interface EmailSettingsSectionProps {
  /**
   * Consolidated email state from useEmailSettings hook
   * Contains emailConfig, passwordDirty, smtpPasswords, etc.
   */
  emailState: EmailState;

  /**
   * Health check status response from backend
   * Shows provider connectivity and configuration validity
   */
  healthStatus: any;

  /**
   * Loading state for health check operation
   */
  loadingHealthStatus: boolean;

  /**
   * Overall save operation state from parent component
   */
  saving: boolean;

  /**
   * Callback when health check button is clicked
   * Should trigger provider connectivity check
   */
  onHealthCheckClick: () => Promise<void>;

  /**
   * Unified handler for all email configuration updates
   * Called when user modifies provider settings or email behaviors
   * Argument is partial config object to be merged with current config
   */
  onUpdateConfig: (config: Partial<any>) => void;

  /**
   * Backend password detection state
   * Tracks whether backend has saved passwords for each provider
   */
  backendHasPassword?: Record<string, boolean>;
}

/**
 * StyledTextField - Consistent Material-UI TextField styling
 */
const StyledTextField = (props: any) => (
  <TextField
    {...props}
    variant="outlined"
    size="small"
    sx={{
      '& .MuiOutlinedInput-root': {
        borderRadius: 1,
        backgroundColor: '#fafafa',
        '&:hover': {
          backgroundColor: '#ffffff',
        },
        '&.Mui-focused': {
          backgroundColor: '#ffffff',
        },
      },
      ...props.sx,
    }}
  />
);

const EmailSettingsSection = ({
  emailState,
  healthStatus,
  loadingHealthStatus,
  saving,
  onHealthCheckClick,
  onUpdateConfig,
  backendHasPassword = {} as Record<string, boolean>,
}): any => {
  // emailState IS the consolidated email configuration
  const emailConfig = emailState;
  const passwordDirty = emailState.passwordDirty;
  const smtpPasswords = emailState.smtpPasswords;

  // Handle email config changes from child components
  const handleEmailConfigChange = useCallback(
    (config: any) => {
      if (!config) return;
      // Unified handler for all config updates
      onUpdateConfig(config);
    },
    [onUpdateConfig]
  );

  const handleGmailStatusChange = useCallback(
    (enabled: boolean) => {
      onUpdateConfig({ enabled });
    },
    [onUpdateConfig]
  );

  const handleGmailSettingsChange = useCallback(
    (updatedConfig: any) => {
      onUpdateConfig(updatedConfig);
    },
    [onUpdateConfig]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Email Provider Selection and Basic Configuration */}
      <EmailSettings onConfigChange={handleEmailConfigChange} />

      {/* Provider-Specific Configuration Forms - Conditional Rendering */}
      {emailConfig?.provider === 'custom' && (
        <CustomSmtpSettings
          emailConfig={emailConfig}
          setEmailConfig={onUpdateConfig}
          smtpPasswordProp={smtpPasswords?.current?.custom || ''}
          passwordDirty={passwordDirty?.custom || false}
          hasBackendPassword={backendHasPassword?.custom || false}
        />
      )}

      {emailConfig?.provider === 'gmail' && (
        <GmailSettings
          onGmailStatusChange={handleGmailStatusChange}
          onEmailConfigChange={handleGmailSettingsChange}
        />
      )}

      {/* Email Provider Status Panel - Health Check */}
      <EmailProviderStatus
        emailConfig={emailConfig}
        healthStatus={healthStatus}
        onHealthCheckClick={onHealthCheckClick}
        loading={loadingHealthStatus}
      />

      {/* Email Behavior Control Card */}
      <Paper
        sx={{
          p: 3,
          borderRadius: 2,
          boxShadow: '0 2px 12px rgba(15,23,42,0.08)',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          borderTop: '4px solid #10b981',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box
            sx={{
              width: 4,
              height: 28,
              background: '#10b981',
              borderRadius: 1,
            }}
          />
          <Typography
            variant="h6"
            sx={{ fontWeight: 600, color: '#0f172a', m: 0 }}
          >
            Email Behavior Control
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{ color: '#64748b', display: 'block', mb: 3 }}
        >
          Control which emails are sent automatically. Changes take effect
          immediately without restarting the application.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Master Switch */}
          <Box
            sx={{
              p: 2,
              backgroundColor: '#f0fdf4',
              borderRadius: 1,
              border: '1px solid #dcfce7',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={emailConfig.enabled}
                  onChange={(e) =>
                    onUpdateConfig({ enabled: e.target.checked })
                  }
                  disabled={saving}
                />
              }
              label={
                <Typography sx={{ fontWeight: 600, color: '#065f46' }}>
                  Enable All Email Sending
                </Typography>
              }
            />
            <Typography
              variant="caption"
              sx={{ color: '#059669', display: 'block', ml: 4, mt: 1 }}
            >
              Master switch to disable all email types at once (emergency
              shutdown)
            </Typography>
          </Box>

          <Divider />

          {/* Email Type Controls */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}
            >
              Email Type Controls
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.enablePasswordResetEmails}
                    onChange={(e) =>
                      onUpdateConfig({
                        enablePasswordResetEmails: e.target.checked,
                      })
                    }
                    disabled={saving || !emailConfig.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                      Password Reset Emails
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Sent when users request password reset
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.enableOtpEmails}
                    onChange={(e) =>
                      onUpdateConfig({ enableOtpEmails: e.target.checked })
                    }
                    disabled={saving || !emailConfig.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                      OTP Emails
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Sent for 2FA/login verification
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.enableDocumentNotificationEmails}
                    onChange={(e) =>
                      onUpdateConfig({
                        enableDocumentNotificationEmails: e.target.checked,
                      })
                    }
                    disabled={saving || !emailConfig.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                      Document Notifications
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Sent when documents are approved/rejected
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.enableAnnouncementEmails}
                    onChange={(e) =>
                      onUpdateConfig({
                        enableAnnouncementEmails: e.target.checked,
                      })
                    }
                    disabled={saving || !emailConfig.enabled}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                      Announcements
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Sent when admins post announcements to residents
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </Box>

          <Divider />

          {/* Announcement Settings */}
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}
            >
              Announcement Configuration
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.enableAnnouncementBcc}
                    onChange={(e) =>
                      onUpdateConfig({
                        enableAnnouncementBcc: e.target.checked,
                      })
                    }
                    disabled={
                      saving ||
                      !emailConfig.enabled ||
                      !emailConfig.enableAnnouncementEmails
                    }
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                      Use BCC for Privacy
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: '#64748b' }}
                    >
                      When enabled: announcements sent via BCC (recipients
                      can't see each other)
                      <br />
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
                  onChange={(e) =>
                    onUpdateConfig({
                      recipientEmailsPerBatch: Math.max(
                        1,
                        parseInt(e.target.value || '100')
                      ),
                    })
                  }
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
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: '#0f172a', mb: 2 }}
            >
              Retry Policy
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailConfig.retryFailedEmails}
                    onChange={(e) =>
                      onUpdateConfig({ retryFailedEmails: e.target.checked })
                    }
                    disabled={saving}
                  />
                }
                label={
                  <Typography sx={{ fontWeight: 500, color: '#0f172a' }}>
                    Retry Failed Emails
                  </Typography>
                }
              />
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 2,
                  ml: 4,
                }}
              >
                <StyledTextField
                  label="Retry Attempts"
                  type="number"
                  value={emailConfig.retryAttempts}
                  onChange={(e) =>
                    onUpdateConfig({
                      retryAttempts: Math.max(0, parseInt(e.target.value || '0')),
                    })
                  }
                  inputProps={{ min: 0 }}
                  disabled={saving || !emailConfig.retryFailedEmails}
                  helperText="Number of retry attempts"
                />
                <StyledTextField
                  label="Retry Delay (minutes)"
                  type="number"
                  value={emailConfig.retryDelayMinutes}
                  onChange={(e) =>
                    onUpdateConfig({
                      retryDelayMinutes: Math.max(
                        1,
                        parseInt(e.target.value || '5')
                      ),
                    })
                  }
                  inputProps={{ min: 1 }}
                  disabled={saving || !emailConfig.retryFailedEmails}
                  helperText="Wait time between retries"
                />
              </Box>
            </Box>
          </Box>

          <Divider />

          {/* Dry-Run Mode */}
          <Box
            sx={{
              p: 2,
              backgroundColor: '#fef3c7',
              borderRadius: 1,
              border: '1px solid #fcd34d',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={emailConfig.dryRunMode ?? false}
                  onChange={(e) =>
                    onUpdateConfig({ dryRunMode: e.target.checked })
                  }
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
                    When enabled, emails are simulated and logged but NOT
                    actually sent to recipients. Useful for testing email
                    configuration safely in production.
                  </Typography>
                </Box>
              }
            />
          </Box>

          <Alert severity="info" sx={{ mt: 2, borderRadius: 1 }}>
            <Typography variant="caption">
              <strong>All email settings are saved</strong> with the main
              settings using the Save button at the bottom right.
            </Typography>
          </Alert>
        </Box>
      </Paper>
    </Box>
  );
};

export default EmailSettingsSection;
